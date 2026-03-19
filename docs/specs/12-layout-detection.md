---
description: Détection automatique de layout (Tier 1 OpenCV.js heuristiques, Tier 2 YOLO11n-doclaynet) pour segmenter les bilans biologiques en zones typées avant OCR.
---

# Layout Detection

## Contexte

Les bilans biologiques contiennent des en-têtes (médecin, adresse, labo), des pieds de page, des logos, et des tableaux de résultats en colonnes. L'OCR pleine page produit un texte mélangé et difficile à exploiter. La détection de layout identifie automatiquement les régions d'intérêt (tableaux, texte) et les transforme en zones ciblées pour l'OCR.

**Note historique :** La spec 08 (preprocessing) listait "OpenCV.js (trop lourd pour le browser)" en out of scope. Cette exclusion portait sur l'intégration d'OpenCV.js **dans le pipeline de preprocessing** (grayscale/deskew/upscale/CLAHE). Ici, OpenCV.js est utilisé dans un **module séparé** (layout detection worker) avec un build WASM custom minimal (~1.5 MB), ce qui rend le compromis acceptable.

---

## Contrat technique : modèle de données et architecture

### Types de régions détectées

```ts
type LayoutRegionType =
  | "table"
  | "text"
  | "header"
  | "footer"
  | "figure";

type LayoutRegion = {
  bbox: { x: number; y: number; width: number; height: number }; // coordonnées en pixels de la page source
  type: LayoutRegionType;
  confidence: number; // 0-1
  pageIndex: number;  // 0-indexed
};
```

Notes :
- Le type `"title"` est supprimé du Tier 1 (impossible à détecter de manière fiable par heuristiques seules — nécessite de l'OCR ou du ML). Il sera ajouté en Tier 2 via le mapping DocLayNet `Section-header → title` / `Title → title`.
- `"figure"` est conservé pour Tier 1 car détectable par analyse de densité de pixels (ratio pixels noirs / surface faible + pas de structure tabulaire).

### DetectionState dans le store

```ts
type DetectionState =
  | { status: "idle" }
  | {
      status: "running";
      currentPage: number;   // 1-indexed
      totalPages: number;
      step: "detecting";     // unique step pour la détection
    }
  | { status: "done" };
```

Vit dans un **nouveau store** `src/store/layout-store.ts` (séparé de `app-store.ts`) qui regroupe :
- `detection: DetectionState`
- `enabledTypes: LayoutRegionType[]` (array, pas Set — compatible Zustand shallow compare)
- `detectionCache: DetectionCacheData | null`
- `deletedRegionKeys: string[]` (clés `"${pageIndex}:${regionIndex}"` des régions supprimées manuellement)
- Actions : `setDetectionState`, `toggleType`, `setEnabledTypes`, `setDetectionCache`, `clearDetectionCache`, `addDeletedRegionKey`, `clearDeletedRegionKeys`

Valeurs par défaut de `enabledTypes` : `["table", "text"]`.

### Cache de détection

```ts
type DetectionCacheData = {
  /** Toutes les régions détectées, indexées par page. */
  regionsByPage: LayoutRegion[][];  // index = pageIndex, contient TOUS les types détectés
  /** Identité du document pour invalidation. */
  fileId: string; // `${file.name}:${file.size}:${file.lastModified}`
};
```

**Modèle de cache — détection par page, pas par type :**

La détection heuristique analyse une image entière et classifie **toutes** les régions en une passe. Le coût de la classification est négligeable par rapport au traitement d'image. Le cache opère donc **par page** :

- La première détection traite toutes les pages et cache **toutes** les régions (tous types confondus) dans `regionsByPage`.
- Quand l'utilisateur change les filtres (active/désactive un type), les zones sont recréées/supprimées **depuis le cache** instantanément — pas de re-détection.
- Quand l'utilisateur clique "Détecter zones" et que le cache existe déjà pour ce document, la détection est **skippée** — les zones sont recréées depuis le cache avec les filtres actuels.
- Le cache est **invalidé** quand le fichier change (`fileId` différent).
- Le bouton "Détecter zones" permet aussi de **forcer une re-détection** via un long-press ou un clic sur "Re-détecter" dans le popover des filtres (efface le cache et relance).

**Conséquence UX :** Le coût compute est un one-shot par document. Changer les filtres après est gratuit. C'est plus efficient que la détection par type car le pipeline d'image tourne une seule fois.

### Extension du type Zone

```ts
// Dans src/lib/zone-manager.ts — extension rétrocompatible
type Zone = {
  id: number;
  left: number;
  top: number;
  width: number;
  height: number;
  source?: "user" | "auto";          // NOUVEAU — optionnel, défaut "user" si absent (rétrocompatibilité)
  label?: LayoutRegionType;           // NOUVEAU — uniquement pour source="auto"
  regionKey?: string;                 // NOUVEAU — clé stable "${pageIndex}:${regionIndex}" pour le mapping cache
};
```

**Rétrocompatibilité :** `source`, `label` et `regionKey` sont tous **optionnels**. Tous les appels existants à `createZone()` dans `src/lib/zone-manager.ts` continuent de fonctionner sans modification. Les consommateurs testent `zone.source === "auto"` ; l'absence de `source` est traitée comme `"user"`.

**Impact sur `createZone` :** Accepte un paramètre optionnel `source` et `label` :
```ts
function createZone(rect: { left; top; width; height }, options?: { source?: "user" | "auto"; label?: LayoutRegionType }): Zone
```

Le zone store expose de nouvelles actions :
- `addAutoZones(zones: Omit<Zone, "id">[])` — crée des zones auto avec IDs auto-incrémentés via `createZone`.
- `clearAutoZones()` — supprime toutes les zones `source === "auto"` sans toucher aux zones manuelles.
- `clearAutoZonesByType(type: LayoutRegionType)` — supprime les zones auto d'un type donné.
- Les actions existantes (`addZone`, `removeZone`, `updateZone`, `clearZones`) restent inchangées.

### Rendu des zones auto sur le canvas Fabric.js

`useFabricCanvas` est étendu pour différencier les zones auto :

| Propriété           | Zone manuelle (`source !== "auto"`) | Zone auto (`source === "auto"`) |
|---------------------|--------------------------------------|----------------------------------|
| Bordure (stroke)    | Pleine, `#3b82f6` (bleu)           | Pointillée (`strokeDashArray: [6, 4]`), `#22c55e` (vert) |
| Remplissage (fill)  | `rgba(59,130,246,0.1)`              | `rgba(34,197,94,0.1)`           |
| Label               | Aucun                                | Texte dans le coin supérieur gauche : "Table", "Texte", etc. |

Le label est rendu comme un `fabric.Text` positionné en haut à gauche de la zone, avec fond semi-transparent. Le texte se repositionne automatiquement quand la zone est déplacée/redimensionnée.

### Filtres de détection

```ts
// Dans layout-store.ts
enabledTypes: LayoutRegionType[]  // défaut: ["table", "text"]
```

Actions du store :
- `toggleType(type: LayoutRegionType)` — ajoute ou retire le type du tableau.
- `setEnabledTypes(types: LayoutRegionType[])` — remplace la liste.

**Comportement au toggle :**
- **Désactiver un type** : `clearAutoZonesByType(type)` est appelé immédiatement → les zones disparaissent.
- **Activer un type** : si le cache de détection contient des régions de ce type, les zones sont recréées instantanément depuis le cache. Sinon, l'utilisateur doit cliquer "Détecter zones" pour lancer la détection (qui cachera tous les types).

**Zones supprimées manuellement :** Quand l'utilisateur supprime une zone auto individuellement, la région source est identifiée par une clé stable `"${pageIndex}:${regionIndex}"` (index dans `regionsByPage[pageIndex]`). Cette clé est ajoutée au tableau `deletedRegionKeys` (`string[]`) dans le layout store. Lors de la recréation depuis le cache (toggle type ON), les régions dont la clé est dans `deletedRegionKeys` ne sont **pas** recréées. Ce set est vidé quand le cache est invalidé (changement de fichier) ou quand l'utilisateur force une re-détection.

**Mapping zone ↔ région :** Chaque zone auto porte un champ additionnel `regionKey?: string` (valeur `"${pageIndex}:${regionIndex}"`) pour permettre le mapping retour vers la région source en cas de suppression.

### Conversion coordonnées

Les régions détectées sont en **coordonnées pixel de l'image source** (la résolution passée au détecteur). Elles doivent être converties en **coordonnées document-space** (CSS pixels à 100% zoom) avant de devenir des zones.

Fonction utilitaire `regionToZoneRect(region, pageLayout, sourceImageSize)` :
```ts
function regionToZoneRect(
  region: LayoutRegion,
  page: PageLayout,          // { pageIndex, top, width, height } du store
  sourceSize: { width: number; height: number }  // dimensions de l'image envoyée au détecteur
): { left: number; top: number; width: number; height: number } {
  const scaleX = page.width / sourceSize.width;
  const scaleY = page.height / sourceSize.height;
  return {
    left: region.bbox.x * scaleX,
    top: region.bbox.y * scaleY + page.top,
    width: region.bbox.width * scaleX,
    height: region.bbox.height * scaleY,
  };
}
```

### Architecture worker

Le détecteur tourne dans un **Web Worker dédié** (`layout-detection.worker.ts`), suivant le même pattern singleton + sérialisation que `preprocessing.worker.ts`.

**Chargement d'OpenCV.js dans un module worker :** OpenCV.js standard (Emscripten) n'est pas compatible avec les ES module workers. Le worker utilise un **build OpenCV.js custom** compilé avec `-s ENVIRONMENT=worker -s MODULARIZE=1 -s EXPORT_ES6=1`. Le fichier compilé (`opencv_js.js` + `opencv_js.wasm`) est placé dans `public/opencv/` et importé dans le worker via :
```ts
import cv from "/opencv/opencv_js.js";
await cv(); // initialise le module WASM
```

Alternativement, le package npm `@simd/opencv-wasm` fournit un build ES module compatible. Le choix exact est un détail d'implémentation ; la spec exige uniquement que le worker charge OpenCV.js sans bloquer le thread principal.

Message protocol :
```ts
// App → Worker
type DetectionRequest = {
  image: ImageBuffer;    // page rendue à résolution intermédiaire
  pageIndex: number;
};

// Worker → App
type DetectionResponse = {
  regions: LayoutRegion[];
  pageIndex: number;
};
```

Note : `requestedTypes` est supprimé du protocol worker car la détection traite tous les types en une passe. Le filtrage par type est fait côté main thread.

Le worker est **terminé** quand le fichier est fermé (`doClose`), qui doit appeler `terminateDetectionWorker()` en plus de `terminatePreprocessWorker()`.

### Résolution d'image pour la détection

La détection n'a pas besoin de 300 DPI. Une résolution intermédiaire suffit :
- **PDF** : rendu via une nouvelle fonction `renderPageForDetection(proxy, pageIndex)` qui utilise un scale de 150/72 ≈ 2.08 (au lieu de 300/72 pour l'OCR). Retourne un `ImageData`. Le rendu se fait sur le **thread principal** (PDF.js nécessite un canvas context), puis l'`ImageBuffer` est transféré au worker.
- **Image** : extraction depuis le `<img>` DOM à résolution native via un canvas temporaire (drawImage). Se fait sur le thread principal.

### Orchestration dans App.tsx : `handleDetectZones`

Nouveau handler `handleDetectZones` (analogue à `handleOcrStart`) :

```ts
const handleDetectZones = useCallback(async () => {
  // 1. Vérifier que des types sont activés
  // 2. Vérifier si le cache est valide (même fileId) — si oui, recréer zones depuis cache et return
  // 3. Nettoyer les zones auto existantes (clearAutoZones)
  // 4. Créer AbortController
  // 5. Set detectionState: { status: "running", currentPage: 1, totalPages, step: "detecting" }
  // 6. Pour chaque page (i = 0..totalPages-1):
  //    a. Set detectionState.currentPage = i + 1 (AVANT le traitement — pour le feedback ProgressBar)
  //    b. Rendre la page à 150 DPI (main thread)
  //    c. Envoyer au worker
  //    d. Recevoir les régions
  //    e. Stocker dans le cache (regionsByPage[pageIndex])
  //    f. Créer les zones auto pour les types activés (filtrage + regionToZoneRect + addAutoZones)
  //    (Note: currentPage n'est PAS incrémenté après la dernière page — il reste = totalPages)
  // 7. Set detectionState: { status: "done" }
  // 8. Si aucune zone détectée, toast info
}, [...]);
```

### Interaction avec l'OCR

Quand des zones (auto ou manuelles) existent et que l'utilisateur lance l'OCR :
- `snapshotCurrentZones()` retourne **toutes** les zones (auto + manuelles).
- `isGlobalOcr = snapshot.length === 0` — donc `false` dès qu'il y a des zones.
- PSM 6 (uniform block) est utilisé pour chaque zone.
- `estimatedDPI` est 150 pour les zones (même valeur qu'actuellement).
- `cropZoneFromDocument` fonctionne pour les zones auto comme pour les manuelles (les coordonnées sont en document-space).
- Le cache OCR par géométrie fonctionne de la même manière.

### Interaction ProgressBar / DetectionState

L'**unique instance** de `ProgressBar` existante est réutilisée pour la détection et l'OCR. `App.tsx` dérive les props conditionnellement selon l'état actif (exclusion mutuelle garantie — un seul peut être `"running"` à la fois) :

```tsx
// Dans App.tsx — dérivation conditionnelle des props ProgressBar
const isDetecting = detection.status === "running";
const isOcrRunning = ocr.status === "running";

<ProgressBar
  visible={isOcrRunning || isDetecting}
  percentage={
    isDetecting
      ? Math.round(((detection.currentPage - 1) / detection.totalPages) * 100)
      : ocrProgress?.percentage ?? 0
  }
  step={isDetecting ? "detecting" : (ocr.status === "running" ? ocr.step : "recognizing")}
  itemLabel={isDetecting ? "Page" : (ocr.status === "running" ? ocr.itemLabel : "Zone")}
  currentItem={isDetecting
    ? (detection.totalPages > 1 ? detection.currentPage : undefined)
    : ocrProgress?.currentItem}
  totalItems={isDetecting
    ? (detection.totalPages > 1 ? detection.totalPages : undefined)
    : ocrProgress?.totalItems}
  onCancel={isDetecting ? handleCancelDetection : handleOcrCancel}
/>
```

**Note :** La formule `(currentPage - 1) / totalPages * 100` affiche 0% au début de la page 1, ~67% au début de la page 3/3, et la ProgressBar disparaît quand `status` passe à `"done"` (pas besoin d'atteindre 100%). Ce comportement est identique à celui de la détection page-par-page de l'OCR.

Le type `step` de `ProgressBar` est étendu :
```ts
step: "preprocessing" | "recognizing" | "detecting";
```

Le `stepLabel` dans le composant `ProgressBar` doit être étendu d'un ternaire à un mapping trois valeurs :
```ts
const stepLabel =
  step === "preprocessing" ? "Prétraitement…" :
  step === "detecting" ? "Détection…" :
  "Reconnaissance…";
```

**Exclusion mutuelle :** L'OCR et la détection ne peuvent pas tourner en même temps. Le bouton OCR est `disabled` quand `detectionState.status === "running"`. Le bouton "Détecter zones" est `disabled` quand `ocrState.status === "running"`.

### Toolbar : nouveaux contrôles

Nouvelles props pour `Toolbar` :
- `onDetectZones: () => void` — handler pour le bouton "Détecter zones"
- `isDetecting: boolean` — détection en cours
- `enabledTypes: LayoutRegionType[]` — filtres actifs
- `onToggleType: (type: LayoutRegionType) => void` — toggle un filtre
- `hasDetectionCache: boolean` — si un cache de détection existe (pour afficher "Re-détecter" dans le popover)
- `onForceRedetect: () => void` — force re-détection (invalide le cache)

Le bouton "Détecter zones" :
- Icône : scan/grid (ou similaire)
- Disabled quand : pas de fichier, OCR en cours, détection en cours
- À côté : icône engrenage qui ouvre le popover des filtres

Le popover des filtres contient :
- Les checkboxes par type (cf. scénario dédié)
- Un bouton "Re-détecter" (visible seulement si `hasDetectionCache` est true) qui force une re-détection

---

## Feature: Détection de layout — Tier 1 (OpenCV.js heuristiques)

### Scenario: Le bouton "Détecter zones" apparaît dans la toolbar

```gherkin
Given un fichier (image ou PDF) est chargé
Then un bouton "Détecter zones" est visible dans la toolbar
And le bouton est activé (pas grisé)
And un bouton engrenage à côté ouvre le popover des filtres
```

### Scenario: Clic sur "Détecter zones" lance la détection sur toutes les pages

```gherkin
Given un PDF de 3 pages est chargé
And les filtres actifs sont "table" et "text"
And aucun cache de détection n'existe
When l'utilisateur clique sur "Détecter zones"
Then la ProgressBar s'affiche avec "Page 1/3 — Détection…"
And chaque page est rendue à 150 DPI sur le thread principal
And l'ImageBuffer est transféré au worker OpenCV.js
And le worker analyse chaque page séquentiellement
And les régions détectées sont stockées dans detectionCache.regionsByPage
And seules les régions "table" et "text" deviennent des zones auto sur le canvas
And les zones auto apparaissent avec un style pointillé vert + label
And la ProgressBar disparaît quand c'est fini
```

### Scenario: Clic sur "Détecter zones" avec cache valide → zones recréées depuis le cache

```gherkin
Given un PDF est chargé
And un cache de détection existe pour ce fichier (même fileId)
When l'utilisateur clique sur "Détecter zones"
Then aucune re-détection n'est lancée
And les zones auto sont supprimées puis recréées depuis le cache avec les filtres actuels
And l'opération est instantanée (pas de ProgressBar)
```

### Scenario: Détection sur une image simple (pas un PDF)

```gherkin
Given une image est chargée
And les filtres actifs sont "table" et "text"
When l'utilisateur clique sur "Détecter zones"
Then la ProgressBar s'affiche avec "Détection…" (pas de compteur X/N)
And l'image est extraite du DOM à résolution native via canvas
And le worker analyse l'image
And les régions détectées deviennent des zones auto
```

### Scenario: Les zones auto ont un style visuel distinct

```gherkin
Given des zones auto ont été détectées
Then les zones auto sont des objets Fabric avec :
  | Propriété         | Valeur                              |
  | stroke            | #22c55e (vert)                      |
  | strokeDashArray   | [6, 4] (pointillé)                  |
  | fill              | rgba(34,197,94,0.1)                 |
And chaque zone auto a un label Fabric.Text en haut à gauche ("Table", "Texte", etc.)
And les zones manuelles gardent leur bordure pleine bleue (#3b82f6)
```

### Scenario: L'utilisateur peut supprimer une zone auto individuellement

```gherkin
Given des zones auto "Table" et "Texte" existent sur la page
When l'utilisateur sélectionne une zone auto "Table"
And appuie sur Supprimer (ou Delete)
Then cette zone auto est supprimée du zone store
And sa regionKey est ajoutée à deletedRegionKeys dans le layout store
And les autres zones auto restent
And si le type "table" est désactivé puis réactivé, cette zone ne réapparaît pas
```

### Scenario: L'utilisateur peut redimensionner/déplacer une zone auto

```gherkin
Given une zone auto "Table" existe sur la page
When l'utilisateur redimensionne ou déplace cette zone
Then la géométrie de la zone est mise à jour dans le store via updateZone
And la zone reste marquée comme source="auto"
And le cache OCR pour cette zone est invalidé (géométrie changée)
```

### Scenario: L'utilisateur dessine une zone manuelle en plus des zones auto

```gherkin
Given des zones auto existent
When l'utilisateur passe en mode dessin et dessine une zone
Then la nouvelle zone est ajoutée avec source="user" (par défaut, champ absent)
And les zones auto ne sont pas affectées
And l'OCR traitera les deux types de zones
```

---

## Feature: Filtres par type de région

### Scenario: Le popover des filtres affiche les types avec checkboxes

```gherkin
Given un fichier est chargé
When l'utilisateur clique sur l'icône engrenage à côté de "Détecter zones"
Then un popover s'affiche avec des checkboxes pour chaque type :
  | Type    | Label         | Défaut     |
  | table   | Tableau       | activé     |
  | text    | Texte         | activé     |
  | header  | En-tête       | désactivé  |
  | footer  | Pied de page  | désactivé  |
  | figure  | Figure        | désactivé  |
And un bouton "Re-détecter" est visible si un cache de détection existe
```

### Scenario: Activer un type avec cache existant → zones ajoutées instantanément

```gherkin
Given les filtres actifs sont "table" et "text"
And la détection a déjà été lancée (cache contient régions de tous types)
When l'utilisateur active "header" dans les filtres
Then les régions "header" du cache sont converties en zones auto instantanément
And aucune re-détection n'est lancée
And les zones "table" et "text" existantes ne sont pas affectées
```

### Scenario: Activer un type sans cache → pas de zones, détection nécessaire

```gherkin
Given aucune détection n'a été lancée (pas de cache)
When l'utilisateur active "header" dans les filtres
Then aucune zone n'est créée (pas de cache)
And l'utilisateur doit cliquer "Détecter zones" pour lancer la détection
```

### Scenario: Désactiver un type supprime instantanément les zones correspondantes

```gherkin
Given les filtres actifs sont "table", "text" et "header"
And des zones auto des 3 types existent
When l'utilisateur désactive "header" dans les filtres
Then les zones auto "header" sont supprimées immédiatement via clearAutoZonesByType
And les zones auto "table" et "text" restent
And aucune re-détection n'est lancée
And le cache de détection conserve les régions "header" (réactivation future possible)
```

### Scenario: Réactiver un type respecte les suppressions manuelles

```gherkin
Given "header" a été détecté puis l'utilisateur a supprimé manuellement une zone header (regionKey="0:3")
And l'utilisateur a ensuite désactivé "header"
When l'utilisateur réactive "header" dans les filtres
Then les zones auto "header" réapparaissent depuis le cache SAUF celle avec regionKey="0:3"
And la zone supprimée manuellement n'est pas recréée
```

### Scenario: Forcer une re-détection via le popover

```gherkin
Given un cache de détection existe
When l'utilisateur clique sur "Re-détecter" dans le popover des filtres
Then le cache de détection est vidé
And deletedRegionKeys est vidé
And la détection est relancée sur toutes les pages
And les nouvelles zones auto remplacent les précédentes
```

### Scenario: Au moins un type doit être actif pour lancer la détection

```gherkin
Given tous les types sont désactivés dans les filtres
When l'utilisateur clique sur "Détecter zones"
Then un toast warning s'affiche : "Sélectionnez au moins un type de zone à détecter"
And aucune détection n'est lancée
```

---

## Feature: Heuristiques OpenCV.js (Tier 1)

### Scenario: Pipeline heuristique — étapes de traitement d'image

```gherkin
Given une page de bilan biologique est envoyée au worker
When le pipeline heuristique s'exécute
Then les étapes suivantes sont exécutées dans l'ordre :
  | Étape | Opération                                                      |
  | 1     | Conversion en niveaux de gris                                  |
  | 2     | Seuillage adaptatif (Otsu ou gaussien)                         |
  | 3     | Détection de lignes horizontales (dilate avec kernel 1×40)     |
  | 4     | Détection de lignes verticales (dilate avec kernel 40×1)       |
  | 5     | Combinaison lignes H+V → masque de grille                      |
  | 6     | Contour detection (findContours) sur le masque de grille       |
  | 7     | Projection de profil horizontal sur l'image binaire inversée   |
  | 8     | Détection de blocs denses (texte) par analyse des profils      |
  | 9     | Filtrage par taille minimale (> 2% de la surface de la page)   |
  | 10    | Classification par position et caractéristiques                |
And toutes les matrices OpenCV intermédiaires sont libérées (mat.delete())
```

### Scenario: Classification des régions par position et caractéristiques

```gherkin
Given le pipeline a détecté des contours et des blocs denses
Then la classification utilise les règles suivantes :
  | Critère                                           | Type assigné |
  | Contient une grille de lignes H+V (intersections) | table        |
  | Bloc dense hors zones header/footer               | text         |
  | Région dans les 15% supérieurs de la page         | header       |
  | Région dans les 8% inférieurs de la page          | footer       |
  | Faible densité de pixels noirs (< 5%) + pas de grille | figure   |
And les seuils (15%, 8%, 2%, 5%) sont des constantes nommées dans le code
```

### Scenario: Régions trop petites sont ignorées

```gherkin
Given le pipeline a détecté des contours
When un contour a une surface < 2% de la surface totale de la page
Then ce contour est ignoré (pas de région créée)
And aucun warning n'est émis
```

### Scenario: Page sans structure détectable → pas de zone, toast consolidé

```gherkin
Given un PDF de 5 pages est détecté
And les pages 2 et 4 ne contiennent aucune structure détectable
When la détection est terminée
Then les pages 1, 3, 5 ont des zones auto
And un seul toast info s'affiche : "Aucune zone détectée sur 2 pages"
And pas de toast individuel par page
```

### Scenario: OpenCV.js WASM chargé dans le worker

```gherkin
Given le worker de détection est initialisé pour la première fois
When le worker charge OpenCV.js
Then il importe le module WASM ES6-compatible depuis /opencv/
And le chargement est un one-shot (singleton, pas rechargé à chaque détection)
And le module est prêt avant la première analyse
```

---

## Feature: Cohabitation zones auto et manuelles

### Scenario: La toolbar a un bouton "Effacer auto" distinct

```gherkin
Given des zones auto et des zones manuelles existent
Then la toolbar montre le bouton "Effacer zones" existant
And un bouton supplémentaire ou option dans le menu pour "Effacer zones auto"
When l'utilisateur clique "Effacer zones auto"
Then seules les zones auto sont supprimées
And les zones manuelles restent
And le cache de détection est conservé (re-détection depuis cache possible)
```

### Scenario: "Effacer zones" existant supprime tout

```gherkin
Given des zones auto et des zones manuelles existent
When l'utilisateur clique "Effacer zones" (le bouton existant)
Then toutes les zones (auto + manuelles) sont supprimées
And le cache de détection est conservé
```

### Scenario: Changement de fichier invalide tout

```gherkin
Given des zones auto et manuelles existent
And le cache de détection contient des régions
When l'utilisateur charge un nouveau fichier
Then toutes les zones (auto + manuelles) sont supprimées
And le cache de détection est vidé
And le cache OCR est vidé
And deletedRegionKeys est vidé
```

### Scenario: Bouton "Détecter zones" désactivé pendant l'OCR

```gherkin
Given un OCR est en cours (ocrState.status === "running")
Then le bouton "Détecter zones" est grisé (disabled)
```

### Scenario: Bouton OCR désactivé pendant la détection

```gherkin
Given une détection de layout est en cours (detectionState.status === "running")
Then le bouton OCR est grisé (disabled)
```

---

## Feature: Feedback UX pendant la détection

### Scenario: ProgressBar pendant la détection multi-pages

```gherkin
Given un PDF de 5 pages est chargé
When l'utilisateur lance la détection
Then la ProgressBar s'affiche avec step="detecting", itemLabel="Page"
And le texte affiché est "Page 1/5 — Détection…"
And le compteur s'incrémente au fur et à mesure
And le bouton Annuler est visible
And quand la détection est terminée, la ProgressBar disparaît
```

### Scenario: ProgressBar sans compteur pour document mono-page

```gherkin
Given une image ou un PDF mono-page est chargé
When l'utilisateur lance la détection
Then la ProgressBar affiche "Détection…" sans compteur X/N
And totalItems = 1, donc le compteur est masqué (comportement existant)
```

### Scenario: Annulation de la détection

```gherkin
Given une détection est en cours sur un PDF de 5 pages
And les pages 1 et 2 ont déjà été détectées et leurs régions cachées
When l'utilisateur clique sur Annuler
Then la détection s'arrête après la page en cours
And le cache contient les régions des pages 1 et 2
And les zones auto des pages 1 et 2 sont conservées sur le canvas
And un toast info : "Détection annulée — zones partielles conservées"
And detectionState passe à { status: "done" }
```

---

## Feature: Détection de layout — Tier 2 (YOLO11n-doclaynet via ONNX Runtime Web)

**Note : Tier 2 sera implémenté après Tier 1. Cette section spécifie le comportement cible.**

### Scenario: Tier 2 utilise le même contrat que Tier 1

```gherkin
Given Tier 2 est activé (future feature)
Then le détecteur YOLO remplace le détecteur OpenCV dans le worker
And il accepte le même DetectionRequest et retourne le même DetectionResponse
And les mêmes filtres, cache, et zone system s'appliquent
And l'UI ne change pas (même bouton, même ProgressBar)
```

### Scenario: Tier 2 ajoute le type "title" au mapping

```gherkin
Given Tier 2 est utilisé pour la détection
Then le type "title" est disponible en plus des types Tier 1
And le popover des filtres affiche une checkbox "Titre" supplémentaire (désactivée par défaut)
And le mapping DocLayNet → LayoutRegionType est :
  | Classe DocLayNet   | Mapping LayoutRegionType |
  | Table              | table                    |
  | Text               | text                     |
  | Page-header        | header                   |
  | Page-footer        | footer                   |
  | Picture            | figure                   |
  | Section-header     | title                    |
  | Title              | title                    |
  | Caption            | text                     |
  | Formula            | text                     |
  | Footnote           | footer                   |
  | List-item          | text                     |
```

### Scenario: Le modèle YOLO11n-doclaynet est chargé depuis public/models/

```gherkin
Given le détecteur YOLO est initialisé pour la première fois
When le worker charge le modèle
Then il charge yolo11n-doclaynet.onnx (~6 MB) depuis /models/
And ONNX Runtime Web WASM backend est chargé depuis /onnx/
And le modèle est compilé/initialisé une seule fois (singleton)
And le chargement initial prend 2-5 secondes
```

### Scenario: WebGPU est utilisé sur le thread principal, pas dans le worker

```gherkin
Given le navigateur supporte WebGPU
When Tier 2 est utilisé avec le backend WebGPU
Then l'inférence ONNX tourne sur le thread PRINCIPAL (WebGPU non disponible dans les workers)
And l'UI reste réactive car l'inférence est GPU-bound (pas CPU-blocking)
And le fallback WASM dans le worker est utilisé si WebGPU n'est pas disponible
```

### Scenario: Pré-processing de l'image pour YOLO

```gherkin
Given une page doit être analysée par YOLO
When l'image est préparée pour l'inférence
Then l'image est redimensionnée à 640x640 pixels (taille d'entrée YOLO)
And les pixels sont normalisés en float32 [0, 1]
And le ratio d'aspect est préservé avec du padding blanc (letterboxing)
And les coordonnées de sortie sont re-mappées vers les dimensions originales
```

### Scenario: Post-processing NMS (Non-Maximum Suppression)

```gherkin
Given l'inférence YOLO retourne des bounding boxes brutes
When le post-processing s'exécute
Then NMS est appliqué avec IoU threshold = 0.5
And les boxes redondantes sont supprimées
And seules les boxes avec confiance >= 0.3 sont conservées
```

---

## Feature: Fallback et résilience

### Scenario: Le worker OpenCV.js échoue → toast d'erreur

```gherkin
Given le worker OpenCV.js échoue à charger le WASM
When la détection est demandée
Then un toast d'erreur s'affiche : "Impossible de charger le module de détection"
And detectionState passe à { status: "idle" }
And le bouton OCR reste fonctionnel (OCR pleine page sans zones)
```

### Scenario: La détection échoue sur une page → page skippée

```gherkin
Given un PDF de 5 pages est en cours de détection
And la page 3 provoque une erreur dans le pipeline OpenCV
When la détection traite la page 3
Then la page 3 est skippée (regionsByPage[2] = [])
And les pages 1, 2, 4, 5 sont traitées normalement
And les zones auto des pages réussies sont créées
And un toast warning consolidé en fin de détection : "Détection échouée sur 1 page"
```

### Scenario: Worker de détection terminé à la fermeture du fichier

```gherkin
Given le worker de détection est actif (singleton)
When l'utilisateur ferme le fichier (doClose)
Then terminateDetectionWorker() est appelé
And le cache de détection est vidé
And detectionState passe à { status: "idle" }
And le prochain usage crée un nouveau worker
```

---

## Contraintes non-fonctionnelles

### @performance Scenario: Détection heuristique < 500ms par page

```gherkin
Given une page de bilan biologique à 150 DPI (~1240x1754 pixels)
When le pipeline heuristique OpenCV.js s'exécute dans le worker
Then le temps de traitement est < 500ms par page sur un laptop moderne
```

### @performance Scenario: Détection YOLO < 1s par page en WASM

```gherkin
Given une page redimensionnée à 640x640
When l'inférence YOLO s'exécute via ONNX Runtime Web (backend WASM)
Then le temps de traitement est < 1 seconde par page sur un laptop moderne
```

### @bundle Scenario: OpenCV.js custom build < 2 MB

```gherkin
Given le build OpenCV.js est un ES6 module WASM custom
Then seuls les modules nécessaires sont inclus (imgproc, contours, morphology, threshold)
And le fichier WASM + JS combiné pèse < 2 MB (avant gzip)
```

### @bundle Scenario: ONNX Runtime + YOLO11n < 12 MB

```gherkin
Given Tier 2 est bundlé dans l'application
Then onnxruntime-web (WASM backend) pèse < 5 MB
And yolo11n-doclaynet.onnx pèse < 7 MB
And le total Tier 2 est < 12 MB (avant gzip)
```

### @memory Scenario: Mémoire pic < 100 MB pour la détection

```gherkin
Given un PDF de 5 pages est analysé page par page
When la détection traite chaque page séquentiellement
Then le buffer de la page N est libéré avant de traiter la page N+1
And toutes les matrices OpenCV intermédiaires sont libérées via mat.delete()
And la mémoire pic du worker de détection ne dépasse pas 100 MB
```

### @ux Scenario: La détection ne bloque pas l'UI

```gherkin
Given la détection tourne dans un Web Worker
Then le thread principal reste réactif pendant la détection
And l'utilisateur peut naviguer dans le document, zoomer, scroller
And le bouton Annuler est toujours cliquable
```

---

## Out of scope

- **Template Memory (Tier 3)** : sauvegarde des zones détectées dans localStorage pour réutilisation automatique sur les bilans du même labo. Fera l'objet d'une spec séparée.
- **Détection de la structure interne des tableaux** (lignes, colonnes, cellules). La détection se limite au bounding box englobant du tableau.
- **Extraction structurée des valeurs biologiques** (nom, valeur, unité, référence). C'est un problème de post-traitement OCR, pas de layout detection.
- **Entraînement ou fine-tuning de modèles** dans le browser.
- **Support de formats de documents** autres que image et PDF.
- **Rotation automatique de pages mal orientées** (couvert par le deskew existant dans le preprocessing).
- **Type "title" en Tier 1** : nécessite de l'OCR ou du ML pour distinguer un titre d'un bloc de texte. Ajouté en Tier 2 uniquement.
