---
description: Roadmap TDD pour l'implémentation de la spec 12 — Layout Detection Tier 1 (OpenCV.js heuristiques) avec zones auto, filtres, cache, et feedback UX.
---

# Roadmap — Layout Detection (Tier 1)

## Objectif

Implémenter la spec [12-layout-detection](../specs/12-layout-detection.md) (Tier 1 uniquement) : détection heuristique de layout via OpenCV.js dans un Web Worker pour segmenter les bilans biologiques en zones typées (table, text, header, footer, figure) avant OCR.

## Décisions techniques

- **OpenCV.js** : package npm `@techstark/opencv-js` (~11 MB, ~3.7 MB gzip). Script de build copie + patche (`this` → `globalThis`) dans `public/opencv/`, avec validation post-patch. Un build custom Emscripten pourra réduire la taille plus tard si nécessaire.
  - **Déviation spec** : la spec cible < 2 MB via un build custom. On démarre avec le npm package (~3.7 MB gzip) car le build custom ajoute de la complexité CI/CD (Emscripten toolchain). Le fichier est lazy-loaded dans le worker, l'impact UX est acceptable.
- **Worker** : ES module worker (cohérent avec le pattern existant `preprocessing.worker.ts`). OpenCV.js est chargé via `fetch()` + indirect eval dans le worker scope, car le package npm n'est pas ESM-compatible. L'initialisation WASM est un one-shot singleton.
- **`confidence` en Tier 1** : le champ `LayoutRegion.confidence` est fixé à `1.0` pour toutes les détections heuristiques (pas de modèle probabiliste). Tier 2 utilisera les scores de confiance réels du modèle YOLO.
- **Déviation spec `createZone`** : la spec définit `createZone(rect, options?: { source?, label? })` sans `regionKey`. Le roadmap étend les options avec `regionKey?: string` car cette valeur doit être assignée à la création — c'est un ajout rétrocompatible.
- **Scope** : Tier 1 uniquement. Tier 2 (YOLO/ONNX) fera l'objet d'un roadmap séparé.

## Vue d'ensemble des phases

```
Phase 1 — Types, Layout Store & Zone extensions (séquentiel, fondation)
Phase 2 — Briques indépendantes (2 agents parallèles + 1 séquentiel)
  ├─ 2a : OpenCV.js setup + worker wrapper + pipeline OpenCV
  └─ 2b : Coordinate conversion + cache logic (parallèle avec 2a)
── Gate 1 : /adversarial-review ──
Phase 3 — UI Components (2 agents parallèles)
  ├─ 3a : ProgressBar extension + Toolbar controls
  └─ 3b : FabricOverlay zones auto (style + labels)
Phase 4 — App.tsx wiring + toggle-type réactif (séquentiel, dépend Phases 1-3)
── Gate 2 : /adversarial-review ──
Phase 5 — Tests d'intégration & edge cases (séquentiel)
── Gate 3 : /adversarial-review ──
```

---

## Phase 1 — Types, Layout Store & Zone extensions

**Objectif :** Poser les types fondamentaux (`LayoutRegion`, `DetectionState`, `DetectionCacheData`), créer le layout store Zustand, et étendre le zone system (`source`, `label`, `regionKey`, nouvelles actions store).

**Séquentiel** — fondation pour toutes les phases suivantes.

### TDD Steps

**Tests RED** (`tests/unit/lib/layout-store.test.ts` + `tests/unit/lib/zone-store-auto.test.ts` — dans `tests/unit/lib/` pour cohérence avec `types-store.test.ts` existant) :

```
layout-store.test.ts :
- état initial : detection.status === "idle", enabledTypes === ["table", "text"]
- setDetectionState met à jour le status
- toggleType ajoute/retire un type de enabledTypes
- setEnabledTypes remplace la liste
- setDetectionCache stocke les régions par page
- clearDetectionCache remet à null et vide deletedRegionKeys
- addDeletedRegionKey ajoute une clé au tableau
- clearDeletedRegionKeys vide le tableau

zone-store-auto.test.ts :
- createZone avec options { source: "auto", label: "table", regionKey: "0:2" } crée une zone avec ces champs
- createZone sans options garde le comportement existant (pas de source/label/regionKey)
- addAutoZones crée N zones avec source="auto", chacune avec son regionKey
- clearAutoZones supprime uniquement les zones source==="auto", conserve les manuelles
- clearAutoZonesByType("table") supprime uniquement les zones auto de label "table"
```

**Implémentation GREEN :**

1. Créer `src/types/layout.ts` — types `LayoutRegionType`, `LayoutRegion`, `DetectionState`, `DetectionCacheData`
2. Créer `src/store/layout-store.ts` — store Zustand avec état et actions
   - `clearDetectionCache` vide aussi `deletedRegionKeys` (couplage logique : cache invalidé = suppressions invalides)
3. Étendre `Zone` dans `src/lib/zone-manager.ts` — champs optionnels `source`, `label`, `regionKey`
4. Étendre `createZone(rect, options?)` — options inclut `source`, `label`, `regionKey` (tous optionnels)
5. Ajouter actions au **zone store** (`src/store/zone-store.ts`) : `addAutoZones`, `clearAutoZones`, `clearAutoZonesByType`
   - Ces actions sont sur le store (mutation d'état), pas sur `zone-manager.ts` (fonctions pures)

**REFACTOR :** Vérifier que tous les tests existants de zone-manager et zone-store passent toujours (rétrocompatibilité).

### Critères de complétion

- [ ] Types exportés et utilisables
- [ ] Layout store fonctionnel avec toutes les actions
- [ ] Zone system étendu (type + store), tests existants toujours verts
- [ ] `bun run typecheck` passe

### Dépendances

Aucune.

---

## Phase 2 — Briques indépendantes

**Objectif :** Construire les modules de base : le worker OpenCV.js avec son pipeline heuristique, et la logique de cache/conversion.

### Parallélisation

- **2a** (worker + pipeline) et **2b** (cache + coordonnées) sont **parallèles** — pas de dépendance entre eux.
- Au sein de 2a, le pipeline OpenCV dépend du worker pour l'exécution réelle, mais les fonctions pures de classification (`classify.ts`) sont testables indépendamment. Le pipeline complet (`pipeline.ts`) sera testé en intégration Phase 5.

---

### Phase 2a — OpenCV.js setup + worker + pipeline heuristique

**Objectif :** Installer `@techstark/opencv-js`, script de copie/patch vers `public/opencv/`, worker ES module qui charge OpenCV via fetch+eval, pipeline de détection heuristique.

**Tests RED** (`tests/unit/lib/layout-detection-worker-wrapper.test.ts` + `tests/unit/lib/layout-detection-heuristics.test.ts`) :

```
layout-detection-worker-wrapper.test.ts :
- detectInWorker(image, pageIndex) retourne un DetectionResponse
- detectInWorker sérialise les appels (deuxième appel attend la fin du premier)
- terminateDetectionWorker détruit le worker singleton
- un appel après terminate recrée un nouveau worker

layout-detection-heuristics.test.ts (fonctions pures de classification) :
- région à y=50 sur page de 1000px → type "header" (dans les 15% supérieurs)
- région à y=149 sur page de 1000px → type "header" (juste sous la limite 15%)
- région à y=151 sur page de 1000px → type "text" (juste au-dessus de la limite 15%)
- région à y=921 sur page de 1000px → type "footer" (juste dans les 8% inférieurs)
- région à y=919 sur page de 1000px → type "text" (juste au-dessus de la limite footer)
- région avec intersections grille H+V → type "table"
- région dense hors header/footer → type "text"
- région à densité 4.9% sans grille → type "figure" (juste sous le seuil 5%)
- région à densité 5.1% sans grille → type "text" (juste au-dessus du seuil 5%)
- région de 10px² sur page de 100000px² → filtrée (< 2% surface)
- région de 1999px² sur page de 100000px² → filtrée (1.999%, juste sous le seuil)
- région de 2001px² sur page de 100000px² → conservée (2.001%, juste au-dessus du seuil)
```

Note : les tests de classification utilisent des valeurs concrètes (pixels, densité) et vérifient le résultat — pas les seuils internes. Le pipeline complet (qui utilise `cv.*`) sera testé en intégration Phase 5.

**Implémentation GREEN :**

1. `bun add @techstark/opencv-js`
2. Script `scripts/copy-opencv.sh` :
   ```bash
   #!/bin/bash
   set -euo pipefail
   SRC="node_modules/@techstark/opencv-js/dist/opencv.js"
   DEST="public/opencv/opencv.js"
   # Guard: skip if source not available (CI partial install, etc.)
   if [ ! -f "$SRC" ]; then
     echo "WARN: $SRC not found, skipping OpenCV.js copy" >&2
     exit 0
   fi
   mkdir -p public/opencv
   cp "$SRC" "$DEST"
   # Patch UMD wrapper: this → globalThis pour compatibilité ES module worker
   sed -i 's/}(this,/}(globalThis,/' "$DEST"
   # Validation: old pattern must be ABSENT, new pattern must be PRESENT
   if grep -q '}(this,' "$DEST"; then
     echo "ERROR: OpenCV.js patch incomplete — '}(this,' still present in $DEST" >&2
     exit 1
   fi
   if ! grep -q '}(globalThis,' "$DEST"; then
     echo "ERROR: OpenCV.js patch failed — '}(globalThis,' not found in $DEST" >&2
     exit 1
   fi
   echo "OpenCV.js patched successfully"
   ```
3. Hook dans `package.json` : `"postinstall": "bash scripts/copy-opencv.sh"` (le script est tolérant si le package n'est pas installé). Vérifier si `@techstark/opencv-js` a des install scripts — si oui, l'ajouter à `trustedDependencies`.
4. Créer `src/workers/layout-detection.worker.ts` (ES module worker, pattern identique à `preprocessing.worker.ts`) :
   ```ts
   // Chargement OpenCV via fetch + indirect eval (UMD non ESM-compatible)
   let cv: any;
   async function initOpenCV(): Promise<void> {
     if (cv) return;
     const response = await fetch('/opencv/opencv.js');
     const script = await response.text();
     (0, eval)(script); // exécute dans le scope global du worker
     cv = (globalThis as any).cv;
     // Attendre l'initialisation WASM si nécessaire
     if (typeof cv === 'function') cv = await cv();
   }
   ```
   - `onmessage` dispatche `DetectionRequest` → `DetectionResponse`
5. Créer `src/lib/layout-detection/worker-wrapper.ts` :
   - Pattern singleton + sérialisation (même pattern que `preprocessing/worker-wrapper.ts`)
   - Instancie avec `new Worker(new URL(...), { type: "module" })`
   - `detectInWorker(image, pageIndex)` → `Promise<DetectionResponse>`
   - `terminateDetectionWorker()`
6. Créer `src/lib/layout-detection/constants.ts` — seuils nommés :
   ```ts
   export const HEADER_ZONE_RATIO = 0.15;
   export const FOOTER_ZONE_RATIO = 0.08;
   export const MIN_REGION_AREA_RATIO = 0.02;
   export const FIGURE_DENSITY_THRESHOLD = 0.05;
   export const H_LINE_KERNEL_WIDTH = 40;
   export const V_LINE_KERNEL_HEIGHT = 40;
   ```
7. Créer `src/lib/layout-detection/classify.ts` — fonctions pures :
   - `classifyRegion(bbox, pageSize, hasGridIntersections, pixelDensity)` → `LayoutRegionType`
   - `filterSmallRegions(bboxes, pageArea)` → bboxes filtrées
8. Créer `src/lib/layout-detection/pipeline.ts` — pipeline OpenCV (exécuté dans le worker) :
   - `detectRegions(imageData, pageIndex)` → `LayoutRegion[]`
   - Étapes : grayscale → Otsu → lignes H/V (dilate) → masque grille (intersection) → contours → profils → classification
   - Libération systématique de toutes les `Mat` via `mat.delete()` (try/finally)

### Critères de complétion

- [ ] `public/opencv/opencv.js` présent et patché après `bun install`, validation OK
- [ ] Worker ES module se charge sans erreur (vérifiable en dev)
- [ ] Wrapper expose `detectInWorker` et `terminateDetectionWorker`
- [ ] Fonctions de classification testées unitairement avec des valeurs concrètes
- [ ] Pipeline documenté avec les étapes dans l'ordre
- [ ] Toutes les `Mat` libérées (try/finally, revue manuelle)
- [ ] Tests passent

### Dépendances

Phase 1 (types).

---

### Phase 2b — Conversion coordonnées + logique de cache

**Objectif :** Implémenter `regionToZoneRect`, la logique de cache (invalidation, filtrage par type, respect des suppressions manuelles), et `renderPageForDetection`.

**Tests RED** (`tests/unit/lib/layout-detection-cache.test.ts` + extension de `tests/unit/lib/coordinate-mapping.test.ts`) :

```
coordinate-mapping.test.ts (ajout au fichier existant) :
- regionToZoneRect convertit une bbox (100,200,300,400) avec page 500px wide, source 1000px → left=50, width=150
- regionToZoneRect ajoute page.top au Y de la zone
- regionToZoneRect applique correctement scaleX et scaleY indépendamment

layout-detection-cache.test.ts :
- buildFileId génère "${name}:${size}:${lastModified}"
- isCacheValid retourne true si fileId correspond
- isCacheValid retourne false si fileId diffère
- getFilteredRegions avec enabledTypes=["table"] retourne uniquement les régions table
- getFilteredRegions exclut les régions dont la regionKey est dans deletedRegionKeys
- getFilteredRegions: regionKey utilise l'index dans le tableau NON-filtré (regionsByPage)
- regionsToAutoZones produit des Zone[] avec source="auto", label, et regionKey corrects
```

**Implémentation GREEN :**

1. Ajouter `regionToZoneRect` dans `src/lib/coordinate-mapping.ts` (même module que `zoneToOcrCrop` — conversion inverse, cohérence architecturale)
2. Créer `src/lib/layout-detection/cache.ts` :
   - `buildFileId(file: File)` → string
   - `isCacheValid(cache, fileId)` → boolean
   - `getFilteredRegions(regionsByPage, enabledTypes, deletedRegionKeys)` → `{ region: LayoutRegion, regionKey: string }[]`
     - **Important** : `regionKey` = `"${pageIndex}:${regionIndex}"` où `regionIndex` est l'index dans le tableau **non-filtré** `regionsByPage[pageIndex]`, pas dans un tableau filtré
   - `regionsToAutoZones(filteredRegions, pageLayouts, sourceImageSizes)` → `Omit<Zone, "id">[]`
3. Ajouter `renderPageForDetection(proxy, pageIndex)` dans `src/lib/pdf-renderer.ts` :
   - Scale = 150/72 ≈ 2.08 (vs 300/72 pour OCR)
   - Retourne `ImageData` + `{ width, height }` (dimensions pour la conversion de coordonnées)
   - **Note** : utilise `document.createElement("canvas")` → exécuté sur le **thread principal**, puis l'ImageBuffer est transféré au worker via postMessage

### Critères de complétion

- [ ] `regionToZoneRect` dans `coordinate-mapping.ts`, tests dans le fichier existant
- [ ] Logique de cache testée (invalidation, filtrage, suppressions, indices non-filtrés)
- [ ] `renderPageForDetection` ajouté au pdf-renderer
- [ ] Tests passent

### Dépendances

Phase 1 (types).

---

### Gate 1 : `/adversarial-review`

Review des Phases 1 et 2. Points d'attention :
- Rétrocompatibilité du zone system (createZone, store actions)
- Libération mémoire OpenCV (`mat.delete()` dans try/finally)
- Cohérence des types entre worker protocol et store
- regionKey utilise les indices non-filtrés
- Sérialisation du worker wrapper
- `renderPageForDetection` sur main thread documenté

---

## Phase 3 — UI Components

**Objectif :** Étendre les composants UI : ProgressBar (step "detecting"), Toolbar (bouton + popover filtres + "Effacer zones auto"), FabricOverlay (zones auto vertes pointillées + labels).

### Parallélisation : 2 agents OPUS en parallèle

---

### Phase 3a — ProgressBar extension + Toolbar controls

**Objectif :** Ajouter le step "detecting" à ProgressBar, le bouton "Détecter zones", le popover des filtres, et le bouton "Effacer zones auto" dans Toolbar.

**Tests RED** (ajout dans `tests/unit/components/ProgressBar.test.tsx` existant + `tests/unit/components/toolbar-detection.test.tsx`) :

```
ProgressBar.test.tsx (ajout) :
- step="detecting" affiche "Détection…"
- step="preprocessing" et "recognizing" inchangés (tests existants)

toolbar-detection.test.tsx (extension .tsx car JSX nécessaire pour le rendu React) :
- bouton "Détecter zones" visible quand un fichier est chargé
- bouton "Détecter zones" disabled quand isOcrRunning=true
- bouton "Détecter zones" disabled quand isDetecting=true
- bouton "Détecter zones" disabled quand pas de fichier
- clic sur engrenage ouvre le popover des filtres
- popover disabled (non interactif) quand isDetecting=true
- popover affiche 5 checkboxes : Tableau, Texte, En-tête, Pied de page, Figure
- Tableau et Texte cochés par défaut
- toggle d'une checkbox appelle onToggleType avec le type correspondant
- bouton "Re-détecter" visible seulement si hasDetectionCache=true
- bouton "Re-détecter" absent quand hasDetectionCache=false
- clic "Re-détecter" appelle onForceRedetect
- bouton "Effacer zones auto" visible quand autoZoneCount > 0
- bouton "Effacer zones auto" absent quand autoZoneCount === 0
- clic "Effacer zones auto" appelle onClearAutoZones
```

**Implémentation GREEN :**

1. Étendre `ProgressBar` — ajouter `"detecting"` au type `step`, mapping trois valeurs :
   ```ts
   const stepLabel =
     step === "preprocessing" ? "Prétraitement…" :
     step === "detecting" ? "Détection…" :
     "Reconnaissance…";
   ```
2. Étendre `Toolbar` — nouvelles props :
   - `onDetectZones`, `isDetecting`, `enabledTypes`, `onToggleType`
   - `hasDetectionCache`, `onForceRedetect`
   - `autoZoneCount`, `onClearAutoZones`
3. Bouton "Détecter zones" avec icône scan/grid
4. Popover filtres avec checkboxes et bouton "Re-détecter"
5. Bouton "Effacer zones auto" (visible quand `autoZoneCount > 0`, conserve le cache)

### Critères de complétion

- [ ] ProgressBar supporte les 3 steps
- [ ] Toolbar affiche le bouton, le popover, et "Effacer zones auto"
- [ ] Exclusion mutuelle OCR/détection (boutons disabled)
- [ ] Tests passent (existants + nouveaux)

### Dépendances

Phase 1 (types).

---

### Phase 3b — FabricOverlay zones auto (style + labels)

**Objectif :** Différencier visuellement les zones auto (vert, pointillé, label) des zones manuelles (bleu, plein) dans le canvas Fabric.js.

**Tests RED** (`tests/browser/components/fabric-auto-zones.test.ts` — dans `browser/` car Fabric.js nécessite un vrai canvas context) :

```
- zone auto rendue avec stroke="#22c55e", strokeDashArray=[6,4], fill="rgba(34,197,94,0.1)"
- zone manuelle rendue avec stroke="#3b82f6" (inchangé), pas de dash
- zone auto a un label Fabric.Text ("Tableau", "Texte", "En-tête", "Pied de page", "Figure")
- label repositionné quand la zone est déplacée
- label repositionné quand la zone est redimensionnée
- suppression d'une zone auto appelle addDeletedRegionKey avec la bonne regionKey
```

**Implémentation GREEN :**

1. Modifier `useFabricCanvas` — conditionner le style sur `zone.source === "auto"` :
   - Auto : stroke vert `#22c55e`, `strokeDashArray: [6, 4]`, fill `rgba(34,197,94,0.1)`
   - Manuelle : style existant inchangé
2. Pour chaque zone auto, créer un `fabric.Text` label en haut à gauche :
   - Mapping : `table→"Tableau"`, `text→"Texte"`, `header→"En-tête"`, `footer→"Pied de page"`, `figure→"Figure"`
   - Fond semi-transparent, repositionnement automatique sur `moving`/`scaling`
   - Le label est un objet compagnon lié au rect (pas un groupe Fabric — pour garder le rect redimensionnable indépendamment)
3. Sur suppression d'une zone auto (Delete key) : appeler `addDeletedRegionKey(zone.regionKey)` depuis le layout store

### Critères de complétion

- [ ] Zones auto visuellement distinctes
- [ ] Labels affichés et repositionnés
- [ ] Suppression d'une zone auto enregistre la regionKey
- [ ] Zones manuelles non affectées

### Dépendances

Phase 1 (types, zone extensions).

---

## Phase 4 — App.tsx wiring + toggle-type réactif

**Objectif :** Câbler `handleDetectZones`, `handleCancelDetection`, `handleForceRedetect`, et la logique réactive de toggle-type dans `App.tsx`. Connecter les stores, le worker, et les composants UI. Étendre `doClose`.

**Séquentiel** — dépend de toutes les phases précédentes.

### TDD Steps

**Tests RED** (`tests/unit/components/app-detection.test.tsx` — même répertoire que `App.test.tsx`, réutilise les mêmes mocks) — tests comportementaux sur le composant rendu, assertions sur le DOM et l'état des stores :

```
Détection :
- clic "Détecter zones" → ProgressBar visible avec texte "Détection…"
- après détection PDF 3 pages → zone-store contient des zones avec source="auto"
- après détection image → zone-store contient des zones auto, ProgressBar n'affiche pas de compteur X/N
- détection avec cache valide → pas de ProgressBar affichée, zones auto ajoutées au store instantanément
- détection avec 0 types activés → toast "Sélectionnez au moins un type de zone à détecter", zone-store inchangé

Annulation :
- clic Annuler pendant détection → ProgressBar disparaît, zones partielles dans zone-store, toast "Détection annulée — zones partielles conservées"

Toggle type (réactif) :
- désactiver "table" dans le popover → zones auto label="table" retirées du zone-store
- réactiver "table" avec cache → zones auto label="table" réapparaissent dans zone-store
- activer "header" sans cache → zone-store inchangé (pas de zones header ajoutées)
- toggle OFF puis ON après suppression manuelle d'une zone (regionKey="0:2") → zone "0:2" absente, autres zones table présentes

Exclusion mutuelle :
- pendant détection → bouton OCR a attribut disabled
- pendant OCR → bouton "Détecter zones" a attribut disabled

Force re-détection :
- clic "Re-détecter" après suppression manuelle → zones précédemment supprimées réapparaissent (deletedRegionKeys vidé)

Nettoyage :
- doClose → zone-store vide, layout-store cache null, detection idle
- chargement nouveau fichier → layout-store cache null, zone-store vide, deletedRegionKeys vide

Erreurs :
- page en erreur pendant détection → zones des autres pages dans store, toast warning consolidé
- aucune zone détectée → toast info "Aucune zone détectée"

Effacer zones auto :
- clic "Effacer zones auto" → zones auto retirées du store, zones manuelles conservées, layout-store cache inchangé
```

**Implémentation GREEN :**

1. **`handleDetectZones`** — orchestration principale :
   ```ts
   // Pseudocode
   const handleDetectZones = useCallback(async () => {
     const { enabledTypes, detectionCache, deletedRegionKeys } = useLayoutStore.getState();
     if (enabledTypes.length === 0) {
       toast.warning("Sélectionnez au moins un type de zone à détecter");
       return;
     }

     const fileId = buildFileId(file);
     // Cache hit → recréation instantanée
     if (isCacheValid(detectionCache, fileId)) {
       clearAutoZones();
       const filtered = getFilteredRegions(detectionCache.regionsByPage, enabledTypes, deletedRegionKeys);
       addAutoZones(regionsToAutoZones(filtered, pageLayouts, sourceSizes));
       return;
     }

     // Détection complète — rendu sur main thread, détection dans worker
     clearAutoZones();
     detectionAbortRef.current = new AbortController();
     setDetectionState({ status: "running", currentPage: 1, totalPages, step: "detecting" });
     const regionsByPage: LayoutRegion[][] = [];
     let errorPages = 0;

     for (let i = 0; i < totalPages; i++) {
       if (detectionAbortRef.current.signal.aborted) break;
       setDetectionState(s => ({ ...s, currentPage: i + 1 }));
       try {
         const imageData = isPdf
           ? await renderPageForDetection(proxy, i)  // main thread (DOM canvas)
           : extractImageFromDOM(imgEl);
         const { regions } = await detectInWorker(toImageBuffer(imageData), i);
         regionsByPage[i] = regions;
         // Zones pour cette page — regionKey = index dans le tableau NON-filtré
         const filtered = regions
           .map((r, idx) => ({ region: r, regionKey: `${i}:${idx}` }))
           .filter(({ region }) => enabledTypes.includes(region.type));
         addAutoZones(filtered.map(({ region, regionKey }) => ({
           ...regionToZoneRect(region, pageLayouts[i], sourceSize),
           source: "auto" as const, label: region.type, regionKey,
         })));
       } catch {
         regionsByPage[i] = [];
         errorPages++;
       }
     }

     // Initialiser les indices manquants (annulation partielle) pour éviter des undefined
     for (let j = 0; j < totalPages; j++) regionsByPage[j] ??= [];
     setDetectionCache({ regionsByPage, fileId });
     setDetectionState({ status: "done" });

     // Toasts consolidés (un seul toast, pas de doublon)
     if (errorPages > 0) toast.warning(`Détection échouée sur ${errorPages} page(s)`);
     if (regionsByPage.every(r => r.length === 0)) {
       toast.info("Aucune zone détectée");
     } else {
       const emptyPages = regionsByPage.filter(r => r.length === 0).length - errorPages;
       if (emptyPages > 0) toast.info(`Aucune zone détectée sur ${emptyPages} page(s)`);
     }
   }, [...]);
   ```

2. **Toggle-type réactif** — logique dans App.tsx (ou hook dédié) :
   ```ts
   const handleToggleType = useCallback((type: LayoutRegionType) => {
     const { enabledTypes, detectionCache, deletedRegionKeys } = useLayoutStore.getState();
     const wasEnabled = enabledTypes.includes(type);
     toggleType(type); // store action

     if (wasEnabled) {
       // Désactiver → supprimer les zones auto de ce type
       clearAutoZonesByType(type);
     } else if (detectionCache) {
       // Activer avec cache → recréer les zones de ce type depuis le cache
       const filtered = getFilteredRegions(detectionCache.regionsByPage, [type], deletedRegionKeys);
       addAutoZones(regionsToAutoZones(filtered, pageLayouts, sourceSizes));
     }
     // Activer sans cache → rien, l'utilisateur doit cliquer "Détecter zones"
   }, [...]);
   ```

3. **`handleForceRedetect`** — vide cache + deletedRegionKeys, puis appelle `handleDetectZones`

4. **Extension `doClose`** :
   ```ts
   terminateDetectionWorker();
   clearDetectionCache();    // vide aussi deletedRegionKeys
   setDetectionState({ status: "idle" });
   ```

5. **Chargement nouveau fichier** — dans le handler existant de chargement, ajouter :
   ```ts
   clearDetectionCache();    // invalide le cache (fileId différent de toute façon, mais nettoyage explicite)
   clearAutoZones();
   ```

6. **ProgressBar wiring** — dérivation conditionnelle (code dans la spec §Interaction ProgressBar).

7. **Exclusion mutuelle** — `disabled` sur les boutons quand l'autre process tourne.

8. **ImageData → ImageBuffer conversion** — `renderPageForDetection` retourne `ImageData` (main thread DOM). Avant envoi au worker, convertir en `ImageBuffer` (transferable) :
   ```ts
   function toImageBuffer(imageData: ImageData): ImageBuffer {
     return { data: imageData.data, width: imageData.width, height: imageData.height };
   }
   ```
   **Note transfer** : l'`ArrayBuffer` sous-jacent est transféré au worker (détaché côté main thread). C'est safe ici car l'image n'est pas réutilisée après envoi — chaque page est rendue à la demande. Pas besoin de clone (contrairement au preprocessing worker qui garde un fallback).

9. **`extractImageFromDOM`** — fonction utilitaire pour extraire l'ImageData d'un `<img>` DOM à résolution native :
   ```ts
   function extractImageFromDOM(imgEl: HTMLImageElement): ImageData {
     const canvas = document.createElement("canvas");
     canvas.width = imgEl.naturalWidth;
     canvas.height = imgEl.naturalHeight;
     const ctx = canvas.getContext("2d")!;
     ctx.drawImage(imgEl, 0, 0);
     return ctx.getImageData(0, 0, canvas.width, canvas.height);
   }
   ```
   Placée dans `src/lib/layout-detection/image-extraction.ts`. Résolution native = même résolution que l'image source chargée.

10. **AbortController dédié** — un nouveau `detectionAbortRef = useRef<AbortController | null>(null)` séparé de l'existant `abortControllerRef` (OCR). L'exclusion mutuelle (boutons disabled) empêche les deux d'être actifs simultanément, mais ils restent des refs distinctes pour éviter toute interférence.

11. **Popover filtres disabled pendant détection** — le popover des filtres est disabled (non interactif) quand `isDetecting === true` pour éviter les race conditions entre le toggle-type réactif et la boucle de détection en cours. L'utilisateur peut changer les filtres avant ou après, mais pas pendant.

12. **Chargement nouveau fichier abort détection** — si une détection est en cours quand un nouveau fichier est chargé, `detectionAbortRef.current?.abort()` est appelé avant le nettoyage, pour éviter que la boucle de détection continue sur le mauvais fichier.

### Critères de complétion

- [ ] Détection fonctionne end-to-end (PDF multi-pages + image)
- [ ] Cache hit → recréation instantanée sans worker
- [ ] Toggle type ON/OFF → zones ajoutées/supprimées instantanément depuis le cache
- [ ] Toggle type ON sans cache → rien (pas de crash)
- [ ] Zones supprimées manuellement non recréées au toggle
- [ ] Annulation conserve les zones partielles
- [ ] `doClose` et chargement nouveau fichier nettoient tout
- [ ] Exclusion mutuelle OCR/détection
- [ ] "Effacer zones auto" supprime les auto, conserve les manuelles et le cache
- [ ] Toasts consolidés (spec wording exact)
- [ ] Tests comportementaux passent

### Dépendances

Phases 1, 2a, 2b, 3a, 3b.

---

### Gate 2 : `/adversarial-review`

Review des Phases 3 et 4. Points d'attention :
- Wiring correct entre stores (layout-store, zone-store, app-store)
- Toggle-type réactif : comportement avec/sans cache, suppressions manuelles
- Gestion de l'AbortController
- Nettoyage dans `doClose` ET chargement nouveau fichier (pas de fuite de worker)
- UX : exclusion mutuelle, toasts (wording spec), ProgressBar
- Rétrocompatibilité de l'OCR avec zones auto
- ImageData → ImageBuffer conversion avant postMessage

---

## Phase 5 — Tests d'intégration & edge cases

**Objectif :** Tests d'intégration end-to-end avec le vrai worker OpenCV.js sur des images réelles. Focus sur le pipeline complet (render → detect → zones → OCR), pas sur la logique déjà couverte par les tests unitaires des phases précédentes.

**Séquentiel** — dépend de tout.

### TDD Steps

**Tests** (`tests/browser/integration/layout-detection.test.ts` — dans `browser/` car nécessite un vrai worker WASM + canvas context) :

```
Pipeline réel (OpenCV.js sans mocks) :
- image de test avec tableau → au moins 1 région de type "table" détectée avec confidence > 0
- image de test avec texte dense → au moins 1 région de type "text" détectée
- image blanche (pas de structure) → 0 régions, pas d'erreur

Flow détection → OCR :
- détection sur image avec tableau → OCR sur zones auto → résultat OCR non vide (PSM 6, isGlobalOcr=false)

Mémoire :
- détection 3x de suite sur la même image → heap WASM ne croît pas significativement (< 10% variation)
```

**Edge cases à vérifier (manuellement ou en test) :**
- PDF dont une page est corrompue → page skippée, zones partielles des autres pages
- Annulation en milieu de détection multi-pages → zones partielles conservées

### Critères de complétion

- [ ] Tests d'intégration passent avec des images de test réelles dans `public/test-fixtures/`
- [ ] Edge cases couverts
- [ ] Pas de régression sur les tests existants
- [ ] `bun run typecheck` passe
- [ ] `bun run lint` passe

### Dépendances

Phases 1-4.

---

### Gate 3 : `/adversarial-review`

Review finale. Points d'attention :
- Pipeline détection → filtrage → OCR fonctionne bout en bout
- Performance (< 500ms par page sur image de test)
- Mémoire (libération des Mat, pas de heap growth)
- Couverture des scénarios spec Tier 1

---

## Out of scope

- **Tier 2 (YOLO/ONNX)** — roadmap séparé
- **Template Memory (Tier 3)** — spec séparée
- **Structure interne des tableaux** (lignes, colonnes, cellules)
- **Extraction structurée des valeurs biologiques**
- **Build custom Emscripten** — optimisation future si la taille du bundle (~3.7 MB gzip) pose problème mesuré
- **i18n** — labels en français uniquement pour l'instant
- **aria-label contextuel** sur la ProgressBar (OCR vs Détection) — amélioration accessibilité future
