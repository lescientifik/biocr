---
description: Détection automatique de layout via YOLO11n-doclaynet (ONNX Runtime Web) pour segmenter les bilans biologiques en zones typées avant OCR.
---

# Layout Detection

## Contexte

Les bilans biologiques contiennent des en-têtes (médecin, adresse, labo), des pieds de page, des logos, et des tableaux de résultats en colonnes. L'OCR pleine page produit un texte mélangé et difficile à exploiter. La détection de layout identifie automatiquement les régions d'intérêt (tableaux, texte) et les transforme en zones ciblées pour l'OCR.

Le détecteur utilise **YOLO11n-doclaynet** (~11 MB ONNX) exécuté dans le navigateur via ONNX Runtime Web (backend WASM). Le modèle est pré-entraîné sur DocLayNet (11 classes) et produit des régions classifiées avec confiance.

---

## Contrat technique : modèle de données et architecture

### Types de régions détectées

```ts
type LayoutRegionType =
  | "table"
  | "text"
  | "header"
  | "footer"
  | "figure"
  | "title";

type LayoutRegion = {
  bbox: { x: number; y: number; width: number; height: number };
  type: LayoutRegionType;
  confidence: number;
};
```

Le mapping DocLayNet → LayoutRegionType :

| Classe DocLayNet   | Mapping LayoutRegionType |
|--------------------|--------------------------|
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

Un index de classe hors de ce mapping est silencieusement ignoré.

### DetectionState dans le store

```ts
type DetectionState =
  | { status: "idle" }
  | {
      status: "running";
      currentPage: number;
      totalPages: number;
    }
  | { status: "done" };
```

Vit dans `src/store/layout-store.ts` qui regroupe :
- `detection: DetectionState`
- `enabledTypes: LayoutRegionType[]` (défaut: `["table", "text"]`)
- `detectionCache: DetectionCacheData | null`
- `deletedRegionKeys: string[]` (clés `"${pageIndex}:${regionIndex}"` des régions supprimées manuellement)
- Actions : `setDetectionState`, `toggleType`, `setEnabledTypes`, `setDetectionCache`, `clearDetectionCache`, `addDeletedRegionKey`, `clearDeletedRegionKeys`

### Cache de détection

```ts
type DetectionCacheData = {
  fileId: string;
  regionsByPage: LayoutRegion[][];
  sourceImageSizes: { width: number; height: number }[];
  detectedTypes: LayoutRegionType[];
};
```

**Modèle de cache — détection sélective par types activés :**

- La détection YOLO produit toujours les 11 classes, mais seules les régions correspondant aux `enabledTypes` sont conservées et cachées.
- `detectedTypes` mémorise quels types étaient actifs lors de la détection.
- Quand l'utilisateur clique "Détecter zones" et que le cache existe pour ce document, le cache n'est valide que si tous les `enabledTypes` actuels sont dans `detectedTypes`. Sinon, re-détection.
- Quand l'utilisateur active un type qui n'est pas dans `detectedTypes`, un toast info l'invite à relancer la détection.
- Quand l'utilisateur désactive un type, les zones sont supprimées instantanément.
- Le cache est invalidé quand le fichier change (`fileId` différent).
- Le bouton "Re-détecter" dans le popover force une re-détection (efface le cache et relance).

### Extension du type Zone

```ts
type Zone = {
  id: number;
  left: number;
  top: number;
  width: number;
  height: number;
  source?: "user" | "auto";
  label?: LayoutRegionType;
  regionKey?: string;
};
```

Le zone store expose :
- `addAutoZones(zones: Omit<Zone, "id">[])` — crée des zones auto avec IDs auto-incrémentés.
- `clearAutoZones()` — supprime toutes les zones `source === "auto"`.
- `clearAutoZonesByType(type: LayoutRegionType)` — supprime les zones auto d'un type donné.

### Rendu des zones auto sur le canvas Fabric.js

| Propriété         | Zone manuelle               | Zone auto                         |
|-------------------|-----------------------------|-----------------------------------|
| Bordure (stroke)  | Pleine, `#3b82f6` (bleu)   | Pointillée `[6, 4]`, `#22c55e`   |
| Remplissage       | `rgba(59,130,246,0.1)`      | `rgba(34,197,94,0.1)`            |
| Label             | Aucun                       | Texte en haut à gauche            |

### Filtres de détection

Actions du store :
- `toggleType(type)` — ajoute ou retire le type du tableau.
- `setEnabledTypes(types)` — remplace la liste.

**Comportement au toggle :**
- **Désactiver un type** : `clearAutoZonesByType(type)` → les zones disparaissent.
- **Activer un type** : si le type est dans `detectedTypes` du cache, les zones sont recréées instantanément. Sinon, toast info "Relancez la détection pour inclure ce type".

**Zones supprimées manuellement :** identifiées par `regionKey` (`"${pageIndex}:${regionIndex}"`), stockées dans `deletedRegionKeys`. Non recréées lors du toggle ON. Vidées lors d'une re-détection forcée.

### Conversion coordonnées

```ts
function regionToZoneRect(
  region: LayoutRegion,
  page: PageLayout,
  sourceSize: { width: number; height: number }
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

Le détecteur tourne dans un **Web Worker dédié** (`yolo-detection.worker.ts`), pattern singleton + sérialisation par promesses.

- Charge `yolo11n-doclaynet.onnx` depuis `/models/` (lazy, première requête)
- ONNX Runtime Web WASM backend, fichiers WASM depuis CDN jsdelivr
- `numThreads = 1`, `executionProviders = ["wasm"]`
- Timeout : 60 secondes par page
- Transfer : `image.data` via `Transferable` (zero-copy)
- `terminateYoloWorker()` appelé à la fermeture du fichier

Message protocol :
```ts
type DetectionRequest = {
  image: { data: Uint8ClampedArray; width: number; height: number };
  pageIndex: number;
  nonce: number;
};

type DetectionResponse = {
  regions: LayoutRegion[];
  pageIndex: number;
  nonce: number;
  error?: string;
};
```

### Résolution d'image pour la détection

- **PDF** : rendu via `renderPageForDetection(proxy, pageIndex)` à 150 DPI (scale 150/72).
- **Image** : extraction depuis le `<img>` DOM à résolution native via canvas temporaire.

### Orchestration dans App.tsx : `handleDetectZones`

1. Vérifier que des types sont activés (sinon toast warning)
2. Vérifier si le cache est valide et couvre tous les types demandés → si oui, recréer zones depuis cache
3. Nettoyer les zones auto existantes
4. Pour chaque page : rendre l'image, lancer l'inférence YOLO, filtrer par `enabledTypes`, créer les zones auto
5. Cacher les résultats avec `detectedTypes`

### Interaction avec l'OCR

- **Exclusion mutuelle** : OCR et détection ne peuvent pas tourner en même temps
- Les zones auto sont traitées comme les zones manuelles par l'OCR (PSM 6, 150 DPI)

### Toolbar : contrôles

Props :
- `onDetectZones`, `isDetecting`, `enabledTypes`, `onToggleType`
- `hasDetectionCache`, `onForceRedetect`
- `autoZoneCount`, `onClearAutoZones`

Le popover des filtres contient :
- 6 checkboxes (Tableau, Texte, En-tête, Pied de page, Figure, Titre)
- Un bouton "Re-détecter" (visible si cache existe)

---

## Feature: Détection YOLO

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
And l'image est envoyée au worker YOLO (letterbox 640×640, inférence ONNX, NMS)
And seules les régions "table" et "text" sont conservées (filtrage post-inférence)
And les régions deviennent des zones auto sur le canvas (style vert pointillé + label)
And le cache stocke les résultats avec detectedTypes = ["table", "text"]
And la ProgressBar disparaît quand c'est fini
```

### Scenario: Cache valide → zones recréées instantanément

```gherkin
Given un PDF est chargé
And un cache de détection existe pour ce fichier (même fileId)
And tous les enabledTypes sont dans detectedTypes du cache
When l'utilisateur clique sur "Détecter zones"
Then aucune re-détection n'est lancée
And les zones auto sont recréées depuis le cache
And l'opération est instantanée (pas de ProgressBar)
```

### Scenario: Cache partiel → re-détection nécessaire

```gherkin
Given les filtres actifs étaient "table" lors de la détection initiale
And l'utilisateur active maintenant "text" en plus
When l'utilisateur clique sur "Détecter zones"
Then le cache est invalidé (enabledTypes contient "text" absent de detectedTypes)
And une nouvelle détection est lancée avec detectedTypes = ["table", "text"]
```

### Scenario: Détection sur une image simple

```gherkin
Given une image est chargée
When l'utilisateur clique sur "Détecter zones"
Then la ProgressBar s'affiche avec "Détection…" (pas de compteur X/N)
And l'image est extraite du DOM à résolution native via canvas
And le worker YOLO analyse l'image
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
And sa regionKey est ajoutée à deletedRegionKeys
And si le type "table" est désactivé puis réactivé, cette zone ne réapparaît pas
```

### Scenario: L'utilisateur peut redimensionner/déplacer une zone auto

```gherkin
Given une zone auto "Table" existe sur la page
When l'utilisateur redimensionne ou déplace cette zone
Then la géométrie de la zone est mise à jour dans le store
And la zone reste marquée comme source="auto"
And le cache OCR pour cette zone est invalidé
```

### Scenario: L'utilisateur dessine une zone manuelle en plus des zones auto

```gherkin
Given des zones auto existent
When l'utilisateur passe en mode dessin et dessine une zone
Then la nouvelle zone est ajoutée avec source="user"
And les zones auto ne sont pas affectées
And l'OCR traitera les deux types de zones
```

---

## Feature: Filtres par type de région

### Scenario: Le popover des filtres affiche les types avec checkboxes

```gherkin
Given un fichier est chargé
When l'utilisateur clique sur l'icône engrenage
Then un popover s'affiche avec 6 checkboxes :
  | Type    | Label         | Défaut     |
  | table   | Tableau       | activé     |
  | text    | Texte         | activé     |
  | header  | En-tête       | désactivé  |
  | footer  | Pied de page  | désactivé  |
  | figure  | Figure        | désactivé  |
  | title   | Titre         | désactivé  |
And un bouton "Re-détecter" est visible si un cache de détection existe
```

### Scenario: Activer un type détecté → zones ajoutées instantanément

```gherkin
Given les filtres actifs sont "table" et "text"
And la détection a été lancée avec detectedTypes = ["table", "text", "header"]
When l'utilisateur active "header" dans les filtres
Then les régions "header" du cache sont converties en zones auto instantanément
And aucune re-détection n'est lancée
```

### Scenario: Activer un type non détecté → toast info

```gherkin
Given la détection a été lancée avec detectedTypes = ["table", "text"]
When l'utilisateur active "figure" dans les filtres
Then un toast info s'affiche : "Relancez la détection pour inclure ce type"
And aucune zone n'est créée
```

### Scenario: Activer un type sans cache → pas de zones

```gherkin
Given aucune détection n'a été lancée (pas de cache)
When l'utilisateur active "header" dans les filtres
Then aucune zone n'est créée
And l'utilisateur doit cliquer "Détecter zones" pour lancer la détection
```

### Scenario: Désactiver un type supprime instantanément les zones

```gherkin
Given des zones auto "table", "text" et "header" existent
When l'utilisateur désactive "header" dans les filtres
Then les zones auto "header" sont supprimées immédiatement
And les zones auto "table" et "text" restent
```

### Scenario: Réactiver un type respecte les suppressions manuelles

```gherkin
Given "header" a été détecté puis l'utilisateur a supprimé manuellement une zone header (regionKey="0:3")
When l'utilisateur réactive "header" dans les filtres
Then les zones auto "header" réapparaissent SAUF celle avec regionKey="0:3"
```

### Scenario: Forcer une re-détection via le popover

```gherkin
Given un cache de détection existe
When l'utilisateur clique sur "Re-détecter"
Then le cache est vidé
And deletedRegionKeys est vidé
And la détection est relancée sur toutes les pages
```

### Scenario: Au moins un type doit être actif pour lancer la détection

```gherkin
Given tous les types sont désactivés dans les filtres
When l'utilisateur clique sur "Détecter zones"
Then un toast warning : "Sélectionnez au moins un type de zone à détecter"
And aucune détection n'est lancée
```

---

## Feature: Pipeline YOLO

### Scenario: Pré-processing letterbox

```gherkin
Given une page de dimensions W×H doit être analysée
When l'image est préparée pour l'inférence
Then le ratio d'aspect est préservé : scale = min(640/W, 640/H)
And l'image est redimensionnée à (W*scale, H*scale)
And le padding gris (RGB 114,114,114) est ajouté pour atteindre 640×640
And les pixels sont convertis en Float32Array normalisée [0, 1]
And le layout mémoire est CHW : tensor shape [1, 3, 640, 640]
And les métadonnées de letterbox sont conservées pour le re-mapping
```

### Scenario: Post-processing NMS

```gherkin
Given l'inférence YOLO retourne le tenseur [1, 15, 8400]
When le post-processing s'exécute
Then les 8400 détections sont parsées : 4 coords (cx,cy,w,h) + 11 scores de classe
And les détections avec score max < 0.3 sont éliminées
And NMS greedy est appliqué par classe avec IoU threshold = 0.5
And les coordonnées sont converties en (x, y, width, height) dans l'espace image source
And le re-mapping inverse le letterbox
```

### Scenario: Le modèle est chargé une seule fois (lazy singleton)

```gherkin
Given la première détection est lancée
Then le worker charge yolo11n-doclaynet.onnx depuis /models/
And une session InferenceSession est créée une seule fois
And les appels suivants réutilisent la session existante
```

### Scenario: Erreur de chargement du modèle

```gherkin
Given le fichier yolo11n-doclaynet.onnx n'est pas accessible
When la détection est lancée
Then la réponse contient error
And detectionState passe à "idle"
```

---

## Feature: Cohabitation zones auto et manuelles

### Scenario: Bouton "Effacer zones auto" distinct

```gherkin
Given des zones auto et manuelles existent
When l'utilisateur clique sur "Effacer zones auto"
Then seules les zones source="auto" sont supprimées
And les zones manuelles restent
And le cache de détection est préservé
```

### Scenario: "Effacer zones" supprime tout

```gherkin
Given des zones auto et manuelles existent
When l'utilisateur clique sur "Effacer zones"
Then toutes les zones sont supprimées (auto + manuelles)
```

### Scenario: Changement de fichier invalide tout

```gherkin
Given des zones auto existent et un cache de détection est présent
When l'utilisateur charge un nouveau fichier
Then toutes les zones sont supprimées
And le cache de détection est vidé
And le worker YOLO est terminé
```

---

## Feature: Feedback UX pendant la détection

### Scenario: ProgressBar pendant la détection multi-pages

```gherkin
Given un PDF de 5 pages est en cours de détection
Then la ProgressBar affiche "Page X/5 — Détection…"
And le pourcentage progresse de 0 à ~80% au fur et à mesure
And le bouton Annuler est visible
```

### Scenario: Annulation de la détection

```gherkin
Given la détection est en cours (page 2/5)
When l'utilisateur clique sur Annuler
Then la détection s'arrête après la page en cours
And les zones déjà détectées sont conservées
And aucun cache n'est créé (résultats partiels)
And un toast info s'affiche
```

---

## Feature: Résilience

### Scenario: La détection échoue sur une page → page skippée

```gherkin
Given un PDF de 5 pages est en cours de détection
And la page 3 provoque une erreur
Then la page 3 est skippée (regionsByPage[2] = [])
And les autres pages sont traitées normalement
And un toast warning consolidé : "Détection échouée sur 1 page(s)"
```

### Scenario: Worker terminé à la fermeture du fichier

```gherkin
Given le worker YOLO est actif
When l'utilisateur ferme le fichier
Then terminateYoloWorker() est appelé
And le cache est vidé
And detectionState passe à "idle"
```

---

## Contraintes non-fonctionnelles

### @performance Scenario: Détection YOLO < 1s par page en WASM

```gherkin
Given une page redimensionnée à 640×640
When l'inférence YOLO s'exécute via ONNX Runtime Web (backend WASM)
Then le temps de traitement est < 1 seconde par page sur un laptop moderne
```

### @bundle Scenario: ONNX Runtime + YOLO11n < 15 MB

```gherkin
Given le modèle est servi depuis public/models/
Then onnxruntime-web WASM < 5 MB (chargé depuis CDN)
And yolo11n-doclaynet.onnx < 12 MB
```

### @memory Scenario: Mémoire pic < 100 MB pour la détection

```gherkin
Given un PDF de 5 pages est analysé page par page
When la détection traite chaque page séquentiellement
Then le buffer de la page N est libéré avant de traiter la page N+1
And la mémoire pic du worker ne dépasse pas 100 MB
```

### @ux Scenario: La détection ne bloque pas l'UI

```gherkin
Given la détection tourne dans un Web Worker
Then le thread principal reste réactif
And l'utilisateur peut naviguer, zoomer, scroller
And le bouton Annuler est toujours cliquable
```

---

## Out of scope

- **Template Memory (Tier 3)** : sauvegarde des zones détectées pour réutilisation sur les bilans du même labo.
- **Détection de la structure interne des tableaux** (lignes, colonnes, cellules).
- **Extraction structurée des valeurs biologiques** (nom, valeur, unité, référence).
- **Entraînement ou fine-tuning de modèles** dans le browser.
- **Support de formats de documents** autres que image et PDF.
