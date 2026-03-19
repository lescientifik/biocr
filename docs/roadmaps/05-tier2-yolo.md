---
description: Roadmap TDD pour l'implémentation de Tier 2 YOLO layout detection via ONNX Runtime Web dans un Web Worker WASM.
---

# Roadmap — Layout Detection Tier 2 (YOLO11n-doclaynet)

## Objectif

Implémenter la section Tier 2 de la spec [12-layout-detection](../specs/12-layout-detection.md) : détection de layout via YOLO11n-doclaynet + ONNX Runtime Web (backend WASM) dans un Web Worker dédié, avec sélecteur de détecteur dans l'UI, type `"title"`, et intégration complète avec le cache/filtres/zones existants.

## Décisions techniques

- **Backend** : WASM uniquement (`executionProviders: ["wasm"]`, `numThreads: 1`). WebGPU est hors scope (non disponible dans les workers, complexité d'architecture hybride main-thread/worker).
- **WASM files** : Servis depuis CDN jsdelivr (`https://cdn.jsdelivr.net/npm/onnxruntime-web@{version}/dist/`). Pas de copie locale des fichiers WASM — simplifie le build.
- **Modèle** : `yolo11n-doclaynet.onnx` placé dans `public/models/`. Sera téléchargé manuellement depuis HuggingFace `hantian/yolo-doclaynet`.
- **Letterbox** : Padding gris RGB (114, 114, 114) — standard YOLO. Le padding est ajouté en bas et à droite (bottom-right), pas centré. Le remapping des coordonnées utilise `xRatio = origWidth / newWidth` et `yRatio = origHeight / newHeight` (formule simplifiée sans offsets dx/dy car le padding est bottom-right only).
- **NMS** : Implémentation JS greedy **par classe** dans le worker (pas de modèle NMS ONNX séparé). Note : la recherche dans `docs/research/` utilise un NMS global — l'implémentation doit être modifiée pour du NMS par classe.
- **Pas de régression Tier 1** : le worker OpenCV et toute la logique existante restent inchangés. Tier 2 est un chemin parallèle.

## Vue d'ensemble des phases

Toutes les phases sont **séquentielles** (chacune dépend de la précédente).

```
Phase 0 — Setup dépendances (bun add + vite config + model download)
  ↓
Phase 1 — Types & Store extensions (fondation)
  ↓
Phase 2 — Preprocessing & Post-processing (pure functions testées)
  ↓
Phase 3 — ONNX Worker (worker + wrapper)
  ↓
── Gate 1 : adversarial review ──
  ↓
Phase 4 — App.tsx wiring + Toolbar UI
  ↓
Phase 5 — Validation finale (biome + vitest)
  ↓
── Gate 2 : adversarial review ──
```

---

## Phase 0 — Setup dépendances

**Objectif :** Installer `onnxruntime-web`, configurer Vite, télécharger le modèle ONNX. Prérequis pour tout le reste.

### Steps

1. `bun add onnxruntime-web`
2. `vite.config.ts` : ajouter `onnxruntime-web` à `optimizeDeps.exclude`
3. Télécharger `yolo11n-doclaynet.onnx` dans `public/models/`
4. Ajouter `public/models/*.onnx` au `.gitignore`
5. Ajouter script `scripts/download-yolo-model.sh`
6. Vérifier que `npx vitest run` passe toujours (pas de régression)

### Critères de complétion

- [ ] `onnxruntime-web` dans package.json + node_modules
- [ ] Vite config à jour
- [ ] Modèle ONNX présent dans `public/models/`
- [ ] `.gitignore` mis à jour
- [ ] Tests existants passent

---

## Phase 1 — Types & Store extensions

**Objectif :** Étendre le type system et le store pour supporter Tier 2 sans casser Tier 1.

### TDD Steps

**Tests RED** (`tests/unit/lib/layout-store.test.ts` — étendre les tests existants) :

```
- detectorType initial === "opencv"
- setDetectorType("yolo") met à jour le store
- setDetectorType invalide le cache (detectionCache = null)
- setDetectorType appelle clearDeletedRegionKeys
```

**Tests RED** (`tests/unit/lib/types.test.ts` — nouveau) :

```
- DOCLAYNET_CLASS_MAP mappe les 11 classes vers les LayoutRegionType corrects
- DOCLAYNET_CLASS_MAP : index hors range (e.g. 99) retourne undefined
```

**GREEN** :

1. `src/types/layout.ts` : Ajouter `"title"` à `LayoutRegionType`
2. `src/lib/layout-detection/doclaynet.ts` : Constante `DOCLAYNET_CLASS_MAP` — array de 11 éléments (index DocLayNet → LayoutRegionType | undefined)
3. `src/store/layout-store.ts` : Ajouter `detectorType: "opencv" | "yolo"`, action `setDetectorType` qui invalide le cache et clear les deleted region keys

**REFACTOR** : Aucun prévu.

### Critères de complétion

- [ ] `"title"` dans LayoutRegionType sans casser les usages existants
- [ ] `DOCLAYNET_CLASS_MAP` exporté et testé
- [ ] `detectorType` dans le store avec invalidation du cache au changement
- [ ] `npx vitest run` passe
- [ ] `npx biome check --write .` clean

---

## Phase 2 — Preprocessing & Post-processing

**Objectif :** Implémenter les fonctions pures de preprocessing (letterbox) et post-processing (NMS + coordinate remapping).

### TDD Steps

**Tests RED** (`tests/unit/lib/yolo-preprocessing.test.ts`) :

```
letterbox:
- image 1240×1754 → tensor [1,3,640,640], scale correct, newWidth/newHeight corrects
- image 640×640 (carré) → pas de padding, scale = 1
- image 200×100 (paysage) → padding vertical en bas
- les pixels de padding sont gris (114/255 ≈ 0.447 en float32)
- retourne { tensor: Float32Array, scale, newWidth, newHeight, origWidth, origHeight }
```

**Tests RED** (`tests/unit/lib/yolo-postprocessing.test.ts`) :

```
decodeYoloOutput:
- rawOutput [1,15,8400] avec 1 détection valide → retourne 1 LayoutRegion
- filtre les détections avec confidence < 0.3
- NMS par classe : supprime box avec IoU > 0.5 de même classe, conserve si classes différentes
- coordonnées remappées vers image source (inverse letterbox)
- index de classe hors DOCLAYNET_CLASS_MAP → box ignorée silencieusement
- retourne LayoutRegion[] avec bbox {x, y, width, height} en pixels source
- 0 détections au-dessus du seuil → retourne []
```

**GREEN** :

1. `src/lib/layout-detection/yolo-preprocess.ts` :
   - `letterbox(imageData: { data: Uint8ClampedArray, width: number, height: number }): LetterboxResult`
   - Redimensionnement via calcul direct sur Float32Array (pas de canvas — compatible worker)
   - Padding bottom-right avec gris 114/255
   - Layout CHW (channels-first)

2. `src/lib/layout-detection/yolo-postprocess.ts` :
   - `decodeYoloOutput(output: Float32Array, letterboxInfo: LetterboxResult, confidenceThreshold = 0.3, iouThreshold = 0.5): LayoutRegion[]`
   - Transpose [1,15,8400] → itération sur 8400 détections
   - Extraction score max + classe
   - NMS greedy par classe
   - Remapping coordonnées : `(cx - w/2) * (origWidth / newWidth)` etc.
   - Constantes exportées : `CONF_THRESHOLD`, `IOU_THRESHOLD`, `INPUT_SIZE`

**REFACTOR** : Aucun prévu.

### Critères de complétion

- [ ] letterbox testée avec images de différentes tailles/ratios
- [ ] Padding gris vérifié dans les tests
- [ ] NMS testée avec cas IoU overlap intra-classe et inter-classe
- [ ] Remapping de coordonnées vérifié
- [ ] `npx vitest run` passe
- [ ] `npx biome check --write .` clean

---

## Phase 3 — ONNX Worker + Wrapper

**Objectif :** Créer le worker YOLO et son wrapper singleton.

### TDD Steps

**Tests RED** (`tests/unit/workers/yolo-worker.test.ts`) :

```
- le worker répond avec le bon pageIndex et nonce
- le worker retourne error si le modèle échoue à charger
- le worker retourne error si l'inférence échoue
- la session ONNX est créée une seule fois (mock InferenceSession)
```

**Tests RED** (`tests/unit/lib/yolo-worker-wrapper.test.ts`) :

```
- detectInYoloWorker crée un worker singleton
- detectInYoloWorker retourne DetectionResponse
- terminateYoloWorker nettoie le singleton
- timeout après 60 secondes retourne error
```

**GREEN** :

1. `src/workers/yolo-detection.worker.ts` :
   - `initOnnx()` : lazy singleton, crée `InferenceSession` avec `executionProviders: ["wasm"]`
   - Configure `ort.env.wasm.wasmPaths` vers CDN jsdelivr et `ort.env.wasm.numThreads = 1`
   - `self.onmessage` : reçoit `DetectionRequest`, appelle `letterbox` → `session.run` → `decodeYoloOutput` → répond `DetectionResponse` avec nonce passthrough
   - Gestion d'erreur : catch et retour `{ error: message, pageIndex, nonce }`

2. `src/lib/layout-detection/yolo-worker-wrapper.ts` :
   - Copie du pattern de `worker-wrapper.ts` (singleton, sérialisation via promise chain, nonce, timeout 60s, transferable image.data)
   - `detectInYoloWorker(image, pageIndex): Promise<DetectionResponse>`
   - `terminateYoloWorker(): void`

**REFACTOR** : Aucun prévu.

### Review Gate 1

Adversarial review sur Phases 1-3 : axes preprocessing accuracy, NMS correctness, worker error handling.

### Critères de complétion

- [ ] Worker mock-testé pour happy path et erreurs
- [ ] Wrapper testé (singleton, timeout, cleanup)
- [ ] `npx vitest run` passe
- [ ] `npx biome check --write .` clean

---

## Phase 4 — App.tsx wiring + Toolbar UI

**Objectif :** Connecter le worker YOLO à l'app, ajouter le sélecteur de détecteur et les filtres conditionnels.

### TDD Steps

**Tests RED** (intégration, étendre tests existants si applicable) :

```
Toolbar:
- le sélecteur détecteur affiche "OpenCV" et "YOLO"
- le sélecteur est disabled quand isDetecting === true
- la checkbox "Titre" est visible quand detectorType === "yolo"
- la checkbox "Titre" est cachée quand detectorType === "opencv"

App orchestration (si tests unitaires App existants) :
- handleDetectZones appelle detectInWorker quand detectorType === "opencv"
- handleDetectZones appelle detectInYoloWorker quand detectorType === "yolo"
- changement de détecteur supprime les auto-zones et invalide le cache
- doClose appelle terminateYoloWorker
```

**GREEN** :

1. `src/components/Toolbar.tsx` :
   - Ajouter `"title"` → `"Titre"` dans `REGION_TYPE_LABELS`
   - Sélecteur détecteur dans le popover (radio buttons : "OpenCV" / "YOLO")
   - Props supplémentaires : `detectorType`, `onDetectorChange`
   - Sélecteur disabled pendant la détection (`isDetecting`)
   - Checkbox "Titre" visible conditionnellement (`detectorType === "yolo"`)

2. `src/App.tsx` :
   - Lire `detectorType` depuis `useLayoutStore`
   - `handleDetectZones` : router vers `detectInWorker` ou `detectInYoloWorker` selon `detectorType`
   - Toast info "Chargement du modèle YOLO…" au premier lancement YOLO (flag `yoloModelLoaded`)
   - `handleDetectorChange(type)` : appeler `setDetectorType`, `clearAutoZones`, toast "Détecteur changé — relancez la détection"
   - `doClose` : appeler aussi `terminateYoloWorker()`

### REFACTOR

Extraire la logique de détection de `handleDetectZones` en helper si la fonction dépasse ~50 lignes.

### Critères de complétion

- [ ] Sélecteur détecteur visible et fonctionnel dans le popover
- [ ] Sélecteur disabled pendant la détection
- [ ] Détection YOLO passe par le worker dédié
- [ ] Changement de détecteur invalide le cache, supprime les auto-zones, toast
- [ ] Détection n'est PAS auto-relancée au changement de détecteur
- [ ] Checkbox "Titre" conditionnelle au détecteur YOLO
- [ ] Toast de chargement au premier lancement YOLO
- [ ] terminateYoloWorker appelé à la fermeture du fichier
- [ ] `npx vitest run` passe
- [ ] `npx biome check --write .` clean

---

## Phase 5 — Validation finale

**Objectif :** Vérifier lint, tests, et absence de régression.

### Steps

1. `npx biome check --write .`
2. `npx vitest run`
3. Vérifier que les tests Tier 1 existants passent toujours
4. Vérifier que `vite build` compile sans erreur

### Review Gate 2

Adversarial review finale : axes integration, regression Tier 1, code quality.

### Critères de complétion

- [ ] `npx biome check --write .` clean (0 erreurs)
- [ ] `npx vitest run` passe (0 échecs)
- [ ] `vite build` compile
- [ ] Pas de régression Tier 1

---

## Risques

| Risque | Impact | Mitigation |
|--------|--------|------------|
| ONNX Runtime Web incompatible avec Vite bundling | Bloquant | `optimizeDeps.exclude` + CDN pour WASM files. Testé dès Phase 0. Vérifier aussi `vite build` en Phase 5. |
| Modèle ONNX trop gros pour git | Mineur | `.gitignore` + script de téléchargement |
| Performance WASM > 1s/page sur machines lentes | UX dégradé | Acceptable pour v1. WebGPU main-thread en v2 si nécessaire. |
| Régression Tier 1 | Critique | Tier 2 est un chemin parallèle, pas de modification du code Tier 1. Tests existants gardent la couverture. |
| `onnxruntime-web` version mismatch WASM/JS | Bloquant | Version CDN construite dynamiquement depuis la version installée du package. |
| Import `onnxruntime-web` dans un module worker Vite | Bloquant potentiel | L'import dans le worker passe par le bundler Vite. Si problème, fallback : charger via `importScripts` ou `fetch` + `eval` (pattern existant pour OpenCV.js). |
