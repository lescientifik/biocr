---
description: Amélioration de la réactivité UX pendant l'OCR — worker systématique, OCR page-par-page en mode global, feedback visuel progressif.
---

# OCR UX Responsiveness

## Contexte

Quand l'utilisateur clique sur le bouton OCR (en mode global ou zones), le preprocessing (`grayscale → deskew → upscale → CLAHE → median`) tourne sur le **thread principal**, bloquant l'UI pendant 1-5 secondes selon la taille de l'image. La ProgressBar reste figée à 0% pendant ce temps — l'utilisateur pense que l'app est plantée.

En mode global sur un PDF multi-pages, le problème est aggravé : `cropZoneFromDocument` crée un buffer unique couvrant toutes les pages (potentiellement 285 MB pour 10 pages), sur lequel deskew + upscale sont exécutés en une passe.

---

## Contrat technique : modèle de state, protocoles et API

Cette section définit les changements structurels nécessaires pour supporter les features de cette spec.

### OcrState étendu (type complet)

```ts
type OcrState =
  | { status: "idle" }
  | {
      status: "running";
      currentItem: number;       // 1-indexed (page ou zone en cours)
      totalItems: number;
      progress: number;          // 0-100
      step: "preprocessing" | "recognizing";
      itemLabel: "Zone" | "Page";
      partialResults: OcrZoneResult[];  // résultats accumulés pendant le run
    }
  | { status: "done"; results: OcrZoneResult[] };
```

Notes :
- `currentZone` et `totalZones` sont renommés en `currentItem` et `totalItems` (plus générique).
- `partialResults` est une liste qui grossit au fur et à mesure via `onItemComplete`.
- Le `ResultsPanel` s'affiche quand `status === "done"` OU quand `status === "running" && partialResults.length > 0`.
- Quand `status` passe à `"done"`, `partialResults` disparaît (union discriminée).

### Protocole worker preprocessing

Le worker (`preprocessing.worker.ts`) accepte un message étendu :

```ts
type WorkerInput = {
  image: ImageBuffer;
  options?: { estimatedDPI?: number };
};
```

Le worker appelle `preprocessingPipeline(input.image, { estimatedDPI: input.options?.estimatedDPI })` et retourne un `PipelineResult` avec transfert d'ArrayBuffer. **Breaking change** : le worker n'accepte plus un `ImageBuffer` nu. Le test `preprocessing-worker.test.ts` doit être mis à jour. Le worker doit inclure un **duck-type guard** (`if ('image' in e.data)`) pour détecter l'ancien format et échouer explicitement plutôt que de produire des résultats silencieusement corrompus.

Le worker est un **singleton** créé au premier usage et réutilisé. Il est terminé quand le fichier est fermé (`handleClose`).

### Fonction `preprocessInWorker`

```ts
async function preprocessInWorker(
  image: ImageBuffer,
  options?: { estimatedDPI?: number }
): Promise<ImageBuffer>
```

Encapsule postMessage/onmessage avec le worker singleton. En cas d'erreur, retourne l'image brute. En cas d'absence de Worker API, tombe en fallback sur `preprocessingPipeline()` sur le thread principal avec un `console.warn`.

### Extensions à `CoordinatorOptions`

```ts
type CoordinatorOptions = {
  engine: OcrEngine;
  preprocess?: PreprocessFn;
  onProgress?: (progress: OcrProgress) => void;
  onWarning?: (message: string) => void;
  signal?: AbortSignal;
  // --- NOUVEAU ---
  onItemComplete?: (result: OcrZoneResult) => void;
  onStepChange?: (step: "preprocessing" | "recognizing") => void;
};
```

**Points d'appel dans `processZones`** (pour chaque item du tableau) :
1. `onStepChange?.("preprocessing")` — appelé **avant** `preprocess(zone.image)`
2. (preprocess s'exécute)
3. `onStepChange?.("recognizing")` — appelé **avant** `engine.recognize(processedImage, ...)`
4. (recognize s'exécute)
5. `onItemComplete?.(result)` — appelé **après** une reconnaissance réussie, avec le résultat post-processé

### Architecture page-par-page : `processZones` avec lazy provider

Pour supporter le traitement paresseux (une page en mémoire à la fois), `processZones` accepte une **fonction factory** au lieu d'un tableau matérialisé :

```ts
type ZoneProvider = {
  count: number;
  getZone: (index: number) => Promise<ZoneInput>;
};

// Nouvelle signature (surcharge compatible) :
function processZones(
  zones: ZoneInput[] | ZoneProvider,
  options: CoordinatorOptions
): Promise<OcrZoneResult[]>
```

- `ZoneInput[]` : comportement actuel (eager, mode zones dessinées). `processZones` détecte un tableau via `Array.isArray()`, le trie par `id`, et itère normalement.
- `ZoneProvider` : lazy, mode global page-par-page. `getZone(i)` est appelé juste avant de traiter l'item `i` (0-indexed), les items sont traités dans l'ordre 0..count-1 (pas de tri). Le résultat de l'item `i-1` n'est plus référencé.
- `handleOcrStart` construit un `ZoneProvider` pour le mode global PDF, dont `getZone(i)` appelle `renderPageForOcr(proxy, i)` puis adapte le résultat `ImageData` → `ImageBuffer` (`{ data: imageData.data, width: imageData.width, height: imageData.height }`). L'`id` de chaque `ZoneInput` est `i + 1` (1-indexed, correspond au numéro de page pour les séparateurs `--- Page X ---`).

### Accès au PDF proxy

Le `PDFDocumentProxy` est exposé par `DocumentViewer` via un callback prop `onPdfProxyReady(proxy | null)`. `App.tsx` stocke la référence dans un `useRef`. La propriété du proxy (création/destruction) reste dans `DocumentViewer`. Le callback est appelé avec `null` quand le proxy est détruit (file change, unmount).

**Guard pendant l'OCR page-par-page :** Si `getZone(i)` détecte que le proxy est `null` (détruit pendant l'OCR, ex : fermeture du fichier), elle lance une `ProxyDestroyedError`. `processZones` la catch côté item : si l'erreur est `ProxyDestroyedError`, le loop **s'arrête** immédiatement (pas de tentative sur les pages suivantes, car elles échoueront aussi). Les pages déjà reconnues sont préservées dans `partialResults`. Pour les autres erreurs (ex : page corrompue), le catch met un résultat vide + warning et continue avec la page suivante.

**Abort avant destruction du proxy :** Tout chemin qui détruit le proxy doit d'abord aborter l'OCR en cours :
- `handleClose` / `doClose` : appelle `abortControllerRef.current?.abort()` avant `clearFile()`.
- `loadFile` (remplacement de fichier) : appelle `abortControllerRef.current?.abort()` avant `setFile()`.
Ainsi `processZones` détecte l'abort avant que `getZone` ne tente d'accéder à un proxy détruit.

### Cancellation : contrat de contrôle

Le mécanisme de cancel est le suivant :

1. `handleOcrCancel` fait **uniquement** `abortControllerRef.current?.abort()`. Il ne touche PAS à `setOcrState`. Il ne met plus le status à `"idle"`.
2. `processZones` détecte l'abort entre les items, arrête la boucle, et retourne les résultats partiels accumulés.
3. Dans `handleOcrStart`, après le `await processZones(...)` :
   - Si `signal.aborted` ET `partialResults.length > 0` dans le store → `setOcrState({ status: "done", results: partialResults })` + toast "OCR annulé — résultats partiels affichés".
   - Si `signal.aborted` ET `partialResults.length === 0` → `setOcrState({ status: "idle" })` + toast "OCR annulé".
   - Sinon (pas aborted) → `setOcrState({ status: "done", results })` normal.
4. Le `finally` block utilise un **guard** : `if (abortControllerRef.current === controller) abortControllerRef.current = null;` — ne clobber que si c'est encore le même run.

**Note d'implémentation :** Les changements à `handleOcrCancel` (point 1) et `handleOcrStart` (points 3-4) doivent être implémentés **atomiquement**. Si `handleOcrCancel` ne met plus `"idle"` mais que `handleOcrStart` n'a pas encore le code de transition post-abort, l'UI restera bloquée en `"running"`.

### Propagation de `estimatedDPI` via closure

`PreprocessFn` garde sa signature actuelle `(image: ImageBuffer) => Promise<ImageBuffer>`. `handleOcrStart` ferme sur `estimatedDPI` dans la lambda :

```ts
preprocess: async (image) => preprocessInWorker(image, { estimatedDPI: isGlobalOcr ? 300 : 150 })
```

Pas besoin de modifier `PreprocessFn` ni `CoordinatorOptions` pour le DPI.

### Post-processing des résultats partiels

`postProcess()` est appliqué dans le callback `onItemComplete` (pas après `processZones`). Ainsi les résultats partiels affichés pendant le run sont déjà post-processés. L'appel `postProcess()` existant après `processZones` doit être **supprimé** pour éviter un double-processing.

### Source de vérité pour les résultats

`partialResults` dans le store (mis à jour via `onItemComplete`, déjà post-processé) est la **seule** source de vérité pour les résultats. `handleOcrStart` utilise `useAppStore.getState().ocr.partialResults` pour la transition `"done"` dans **tous** les cas (aborté ou non). Le retour de `processZones` (qui contient les résultats **non** post-processés) est **ignoré**. Ceci garantit que le texte affiché est toujours post-processé, que l'OCR ait été annulé ou complété.

### Interaction `onStepChange` / `onProgress`

`onProgress` ne touche PAS au champ `step` du store. Seul `onStepChange` met à jour `step`. Le handler `onProgress` dans `handleOcrStart` met à jour uniquement `currentItem`, `totalItems`, et `progress`.

### Notes d'implémentation atomiques

Les changements suivants doivent être appliqués ensemble :

1. **Rename `currentZone`/`totalZones` → `currentItem`/`totalItems`** : dans `OcrState`, `OcrProgress` (`src/types/ocr.ts`), `onProgress` handler dans `handleOcrStart`, et les props/rendu de `ProgressBar`. Le type `OcrProgress` doit aussi être renommé pour cohérence.
2. **`ResultsPanel` render condition** : `App.tsx` doit afficher `ResultsPanel` quand `status === "done"` OU `(status === "running" && partialResults.length > 0)`. La dérivation `ocrResults` existante doit être mise à jour.
3. **`ResultsPanel` séparateurs** : le "Tout copier" doit utiliser `--- Page X ---` pour les résultats globaux multi-pages et `--- Zone X ---` pour les zones dessinées. Le composant reçoit `isGlobalOcr` en prop et utilise le préfixe approprié.
4. **`ProxyDestroyedError`** : `class ProxyDestroyedError extends Error {}` — utilisé par `getZone` et détecté par `processZones` pour arrêter la boucle.

### DPI pour les images en mode global

- **PDF** : `renderPageForOcr` produit du 300 DPI → `estimatedDPI=300` → pas d'upscale.
- **Image** : `cropZoneFromDocument` applique un `bestScale` heuristique (~2.5x). Le DPI effectif dépend de l'image source. On passe `estimatedDPI=300` car `bestScale >= 2.5` garantit une résolution suffisante pour l'OCR. Le pipeline ne sur-agrandit pas.

### Abort et Tesseract

`AbortSignal` est vérifié entre les items par `processZones`, mais pas propagé à `worker.recognize()`. Si Tesseract est en cours de reconnaissance sur une page, le cancel ne prend effet qu'après la fin de cette reconnaissance. C'est une **limitation acceptée** pour cette spec (interrompre Tesseract mid-recognition nécessiterait `worker.terminate()` + re-création, ce qui est coûteux et fragile).

---

## Feature: Preprocessing dans le Web Worker

### Scenario: Le preprocessing s'exécute dans le Web Worker

```gherkin
Given l'utilisateur clique sur le bouton OCR
When le preprocessing s'exécute sur une zone ou une page
Then le preprocessing tourne dans le Web Worker via preprocessInWorker()
And le thread principal n'appelle jamais preprocessingPipeline() directement
And le résultat est transféré via postMessage avec transfert d'ArrayBuffer
```

### Scenario: Le worker est réutilisé (singleton)

```gherkin
Given l'utilisateur a dessiné 3 zones et lance l'OCR
When le preprocessing s'exécute
Then le même worker singleton est réutilisé pour les 3 zones (pas de re-création)
```

### Scenario: Le worker reçoit estimatedDPI

```gherkin
Given un OCR global est lancé
When le message est envoyé au worker
Then le message contient { image, options: { estimatedDPI: 300 } }
And le pipeline dans le worker utilise estimatedDPI=300
```

### Scenario: Erreur dans le worker → fallback image brute

```gherkin
Given le preprocessing worker lève une exception interne
When preprocessInWorker() reçoit l'erreur
Then l'image brute (non preprocessée) est retournée comme fallback
And un toast warning s'affiche
And le pipeline OCR continue sans interruption
```

### Scenario: Worker API absente → fallback main thread

```gherkin
Given le navigateur ne supporte pas Web Workers (ou le worker échoue à s'initialiser)
When preprocessInWorker() est appelé
Then le preprocessing s'exécute en fallback sur le thread principal
And un console.warn est émis
And l'OCR fonctionne normalement
```

### Scenario: Le worker singleton est terminé à la fermeture du fichier

```gherkin
Given un worker preprocessing singleton est actif
When l'utilisateur ferme le fichier via handleClose
Then le worker est terminé via worker.terminate()
And le prochain OCR crée un nouveau worker à la demande
```

---

## Feature: OCR page-par-page en mode global

### Scenario: PDF multi-pages → OCR page par page via ZoneProvider

```gherkin
Given un PDF de 5 pages est chargé
And aucune zone n'est dessinée
When l'utilisateur lance l'OCR
Then handleOcrStart construit un ZoneProvider avec count=5
And getZone(i) appelle renderPageForOcr(proxy, i) pour chaque page à la demande
And chaque page est preprocessée dans le worker avec estimatedDPI=300
And chaque page est reconnue par Tesseract avec isGlobalOcr=true (PSM 3)
And les pages sont traitées séquentiellement (une en mémoire à la fois)
```

### Scenario: Image simple → un seul item, pas de séparateur

```gherkin
Given une image (pas un PDF) est chargée
And aucune zone n'est dessinée
When l'utilisateur lance l'OCR
Then l'image entière est croppée via cropZoneFromDocument
And elle est preprocessée dans le worker avec estimatedDPI=300
And une seule reconnaissance Tesseract est effectuée
And le résultat n'a aucun séparateur "--- Page X ---"
```

### Scenario: PDF mono-page → pas de séparateur

```gherkin
Given un PDF de 1 seule page est chargé
And aucune zone n'est dessinée
When l'utilisateur lance l'OCR
Then la page unique est rendue via renderPageForOcr
And le résultat n'a aucun séparateur "--- Page X ---"
```

### Scenario: Deskew s'exécute par page

```gherkin
Given un PDF de 3 pages avec un scan légèrement incliné
When l'OCR global s'exécute page par page
Then le deskew est appliqué sur chaque page individuellement
And chaque image passée au deskew a les dimensions d'une seule page
```

### Scenario: Upscale skippé en mode global

```gherkin
Given un document est chargé (image ou PDF)
And aucune zone n'est dessinée
When l'OCR global est lancé
Then le pipeline reçoit estimatedDPI=300
And l'image en sortie du pipeline a les mêmes dimensions qu'en entrée
```

### Scenario: Upscale conservé en mode zones

```gherkin
Given un document est chargé
And l'utilisateur a dessiné des zones
When l'OCR est lancé
Then le pipeline reçoit estimatedDPI=150 (défaut)
And l'image en sortie a des dimensions doublées (factor 2.0)
```

### Scenario: Erreur de rendu d'une page → page skippée

```gherkin
Given un PDF de 5 pages où la page 3 échoue au rendu
When l'OCR global s'exécute page par page
Then les pages 1 et 2 sont traitées normalement
And la page 3 est skippée avec un toast warning "Impossible de rendre la page 3"
And les pages 4 et 5 sont traitées normalement
And le résultat final contient le texte des pages 1, 2, 4, 5
```

### Scenario: Proxy PDF détruit pendant l'OCR → pages restantes skippées

```gherkin
Given un PDF de 5 pages en OCR global
And les pages 1 et 2 sont déjà reconnues
When l'utilisateur ferme le fichier (proxy détruit)
And getZone(2) pour la page 3 détecte proxy=null
Then la page 3 échoue avec un warning
And le processZones s'arrête (car les pages suivantes échoueront aussi)
And les résultats des pages 1 et 2 sont affichés
```

---

## Feature: Résultats progressifs

### Scenario: Le ResultsPanel s'ouvre dès la première page reconnue

```gherkin
Given un PDF de 5 pages en OCR global
And l'état OCR est "running" avec partialResults=[]
When onItemComplete est appelé avec le résultat de la page 1
Then partialResults contient 1 résultat (déjà post-processé)
And le ResultsPanel s'affiche (condition: status="running" && partialResults.length > 0)
And le texte est visible dans un onglet unique "Document"
```

### Scenario: Le texte s'allonge avec séparateurs (multi-pages)

```gherkin
Given un PDF de 3 pages en OCR global
And la page 1 est reconnue (partialResults a 1 entrée)
When onItemComplete est appelé avec le résultat de la page 2
Then partialResults contient 2 résultats
And le ResultsPanel affiche la concaténation avec séparateurs :
  """
  --- Page 1 ---
  [texte page 1]

  --- Page 2 ---
  [texte page 2]
  """
And l'OCR continue pour la page 3
```

### Scenario: Pas de séparateur pour item unique

```gherkin
Given une image en OCR global (1 seul item)
When la reconnaissance est terminée
Then le texte est affiché sans séparateur "--- Page X ---"
And le ResultsPanel affiche le résultat dans un onglet "Document"
```

### Scenario: Transition running → done

```gherkin
Given un PDF de 3 pages en OCR global
When processZones se termine (toutes les pages reconnues)
Then handleOcrStart appelle setOcrState({ status: "done", results: [...] })
And les résultats finaux sont identiques aux partialResults accumulés
And la ProgressBar disparaît
```

### Scenario: Annulation avec résultats partiels → done

```gherkin
Given un PDF de 5 pages en OCR global
And les pages 1 et 2 sont reconnues (partialResults a 2 entrées post-processées)
When l'utilisateur clique sur Annuler
Then handleOcrCancel appelle uniquement abortControllerRef.current.abort()
And processZones détecte l'abort, arrête la boucle, retourne les résultats partiels
And handleOcrStart détecte signal.aborted ET partialResults.length > 0
And setOcrState({ status: "done", results: partialResults }) est appelé
And un toast info affiche "OCR annulé — résultats partiels affichés"
And le ResultsPanel reste visible avec les pages 1 et 2
```

### Scenario: Annulation sans résultat → idle

```gherkin
Given un PDF de 5 pages en OCR global
And aucune page n'est encore reconnue (partialResults est vide)
When l'utilisateur clique sur Annuler
Then handleOcrCancel appelle abort()
And handleOcrStart détecte signal.aborted ET partialResults.length === 0
And setOcrState({ status: "idle" }) est appelé
And un toast info affiche "OCR annulé"
```

---

## Feature: Feedback visuel dans la ProgressBar

**Note composant :** `ProgressBar` doit être mis à jour pour lire `step` et `itemLabel` depuis le store (`OcrState.running`) au lieu de recevoir un `step` statique en prop. Le format d'affichage multi-item devient `{itemLabel} {currentItem}/{totalItems} — {stepLabel}` au lieu de `Zone {currentZone}/{totalZones} — {percentage}%`.

### Scenario: Label "Prétraitement…" pendant le preprocessing

```gherkin
Given l'OCR est en cours
When onStepChange("preprocessing") est appelé par processZones (avant preprocess)
Then le store est mis à jour : step="preprocessing"
And la ProgressBar affiche "Prétraitement…"
```

### Scenario: Label "Reconnaissance…" pendant la reconnaissance

```gherkin
Given l'OCR est en cours
When onStepChange("recognizing") est appelé par processZones (avant recognize)
Then le store est mis à jour : step="recognizing"
And la ProgressBar affiche "Reconnaissance…"
```

### Scenario: "Page X/N" en mode global multi-pages

```gherkin
Given un PDF de 10 pages en OCR global (itemLabel="Page")
When la page 3 est en cours de preprocessing
Then la ProgressBar affiche "Page 3/10 — Prétraitement…"
When la page 3 est en cours de reconnaissance
Then la ProgressBar affiche "Page 3/10 — Reconnaissance…"
```

### Scenario: "Zone X/N" en mode zones

```gherkin
Given 3 zones dessinées (itemLabel="Zone")
When la zone 2 est en cours de preprocessing
Then la ProgressBar affiche "Zone 2/3 — Prétraitement…"
When la zone 2 est en cours de reconnaissance
Then la ProgressBar affiche "Zone 2/3 — Reconnaissance…"
```

### Scenario: Item unique → pas de compteur

```gherkin
Given une seule zone (ou image mono-page en global)
When le preprocessing s'exécute
Then la ProgressBar affiche "Prétraitement…" sans compteur X/N
When la reconnaissance s'exécute
Then la ProgressBar affiche "Reconnaissance…" sans compteur X/N
```

---

## Feature: Protection contre les cas limites

### Scenario: Re-click rapide après annulation (race condition)

```gherkin
Given un OCR est en cours avec controller1
When l'utilisateur annule (abort controller1) puis relance immédiatement
Then handleOcrStart crée controller2 et le stocke dans abortControllerRef
And processZones du premier run retourne (settle du promise)
And le finally block de run 1 vérifie abortControllerRef.current === controller1
And comme controller1 !== controller2, le finally ne nullifie PAS abortControllerRef
And le second OCR continue normalement avec controller2
```

### Scenario: Document vide → pas d'OCR

```gherkin
Given un fichier est chargé mais les pages sont vides (pages.length === 0 ou dimensions 0×0)
When l'utilisateur clique sur le bouton OCR
Then l'OCR ne démarre pas
And un toast d'erreur s'affiche : "Le document ne contient pas d'image exploitable"
```

### Scenario: Cancel pendant que Tesseract reconnaît

```gherkin
Given un OCR est en cours
And Tesseract est en train de reconnaître une page (mid-recognition)
When l'utilisateur clique sur Annuler
Then abort() est appelé mais Tesseract termine la reconnaissance en cours
And après la fin de la reconnaissance, processZones détecte l'abort et s'arrête
And les résultats de toutes les pages terminées sont préservés
```

### Scenario: Worker preprocessing toujours en cours après cancel

```gherkin
Given le worker preprocessing est en cours de traitement d'une image
When l'utilisateur annule l'OCR
Then le worker termine son traitement (pas de terminate)
And le résultat est ignoré par processZones (car signal.aborted)
And le worker singleton reste disponible pour le prochain OCR
```

---

## Contraintes non-fonctionnelles

### @performance Scenario: Le thread principal n'est jamais bloqué par le preprocessing

```gherkin
Given une image de 2000×3000 pixels
When le preprocessing s'exécute dans le worker
Then le thread principal peut traiter des événements UI pendant le preprocessing
And aucune tâche synchrone > 50ms n'est exécutée sur le thread principal par le preprocessing
```

### @performance Scenario: Mémoire pic proportionnelle à une page

```gherkin
Given un PDF de 10 pages
When l'OCR global page-par-page est exécuté via ZoneProvider
Then le buffer de la page N est libéré (non référencé) avant que getZone(N+1) soit appelé
And la mémoire pic ne dépasse pas 2× la taille de la plus grande page (pixels × 4 octets)
```

### @ux Scenario: Le feedback apparaît en moins de 200ms après le clic

```gherkin
Given un document est chargé
When l'utilisateur clique sur le bouton OCR
Then setOcrState({ status: "running", step: "preprocessing", ... }) est appelé de manière synchrone
And la ProgressBar avec "Prétraitement…" apparaît au prochain rendu React (< 200ms)
```

---

## Out of scope

- Parallélisation du preprocessing/OCR sur plusieurs pages simultanément (un seul worker Tesseract)
- Progress par sous-étape du pipeline (grayscale %, CLAHE %, etc.)
- Streaming du texte OCR pendant la reconnaissance d'une page
- Refonte du ResultsPanel en onglets multiples par page
- Cache des résultats OCR par page (re-run = re-process)
- Interruption de Tesseract mid-recognition (nécessiterait worker.terminate + re-création)
- Nettoyage beforeunload (le navigateur gère la libération mémoire à la fermeture de l'onglet)
