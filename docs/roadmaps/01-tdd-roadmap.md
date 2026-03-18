---
description: Roadmap TDD red/green pour l'implémentation de BioOCR, avec phases parallélisables.
---

# Roadmap TDD — BioOCR

## Vue d'ensemble des phases

```
Phase 0: Setup projet + Smoke tests
   │
   ▼
Phase 1: File Input          Phase 2: Image Preprocessing (worker)
   │                              │
   ▼                              │
Phase 3: Document Viewer          │         Phase 4: OCR Engine (worker)
   │                              │              │
   ├── REVIEW GATE 1 ◆───────────┤──────────────┤
   ▼                              │              │
Phase 5: Zone Drawing             │              │
   │                              │              │
   ▼                              ▼              ▼
Phase 6: Results Panel, Toolbar & UI
   │
   ├── REVIEW GATE 2 ◆
   ▼
Phase 7: Integration & Polish
   │
   ├── REVIEW GATE 3 ◆ (avant Polish)
   ▼
   Done
```

**Parallélisable** : Phases 2 et 4 sont indépendantes du UI et peuvent être développées en parallèle avec les phases 1→3→5. Phase 6 peut démarrer côté UI dès que Phase 5 est terminée, en parallèle de la finalisation de 2 et 4.

## Review Gates (adversarial review)

Chaque gate lance **3 agents Opus** en parallèle sur des **axes de review orthogonaux**. On ne passe à la phase suivante que quand les 3 reviewers approuvent. Si un reviewer rejette, on corrige et on relance un round.

### Gate 1 — Après Phases 1+3 (et avant Phase 5)

Point de non-retour : l'architecture viewer + Fabric overlay va être câblée. Vérifier avant de construire dessus.

| Reviewer | Axe | Focus |
| --- | --- | --- |
| **Archi** | Faisabilité technique | Le dual-layer (img + Fabric overlay) fonctionne-t-il réellement ? Les smoke tests Phase 0 passent ? La sync zoom/pan est correcte ? Le pdf.js renderer gère les chemins statiques ? |
| **Spec compliance** | Conformité specs | Chaque test RED écrit correspond-il à une exigence des specs ? Y a-t-il des specs non couvertes par les tests implémentés ? |
| **Code quality** | Qualité du code produit | Le code est-il idiomatique TypeScript/React ? Les types sont-ils stricts ? Les fonctions pures sont-elles testables ? Le state management est-il propre ? Biome passe ? |

### Gate 2 — Après Phase 6 (et avant Phase 7 intégration)

Tous les composants existent. Vérifier avant l'assemblage final.

| Reviewer | Axe | Focus |
| --- | --- | --- |
| **UX** | Cohérence UI/UX | Les composants suivent-ils la spec 06 (layout, toolbar, panneau résultats) ? Les états (vide, chargé, OCR en cours, résultats) sont-ils tous gérés ? Les messages d'erreur sont-ils clairs ? |
| **Intégration** | Interfaces entre composants | Les props/callbacks entre composants sont-ils cohérents ? Les stores se composent-ils sans conflit ? Le data flow (file → pages → zones → OCR → résultats) est-il câblé correctement ? |
| **Tests** | Couverture et qualité des tests | Tous les tests RED sont-ils écrits et passent-ils en GREEN ? Y a-t-il des tests fragiles (dépendants de timers, d'ordre, de state global) ? Les tests browser sont-ils isolés (dispose, fresh instances) ? |

### Gate 3 — Après Phase 7 tests d'intégration (avant Polish)

Le produit est fonctionnel. Review finale avant le polish.

| Reviewer | Axe | Focus |
| --- | --- | --- |
| **End-to-end** | Workflows utilisateur | Les 17 tests d'intégration passent-ils ? Les workflows complets (drop → OCR → copier) fonctionnent-ils pour PDF et image ? Les edge cases (crash, annulation, remplacement) sont-ils couverts ? |
| **Performance & offline** | Contraintes non-fonctionnelles | Le bundle fait-il < 25 MB ? Le test offline passe-t-il ? La mémoire est-elle < 500 MB pour un PDF 5 pages ? L'OCR d'une zone A6 prend-il < 10s ? |
| **Sécurité & robustesse** | Données de santé, erreurs | Aucune donnée ne quitte le navigateur ? Les erreurs sont-elles toutes catchées ? Les fallbacks (clipboard, preprocessing crash) fonctionnent-ils ? Les assets WASM sont-ils servis avec les bons MIME types ? |

## Stratégie de test

### Environnements

| Type de test | Environnement | Cible |
| --- | --- | --- |
| **Logique pure** (viewport, zones, preprocessing algos, coordinate mapping) | Vitest + happy-dom | Fonctions pures, pas de DOM nécessaire |
| **Composants React** (DropZone, Toolbar, ResultsPanel, ProgressBar, dialogs) | Vitest + happy-dom + @testing-library/react | Comportement DOM, events, render |
| **Canvas / Fabric.js** (FabricOverlay, interactions canvas) | Vitest **browser mode** (Playwright) | Nécessite un vrai `CanvasRenderingContext2D` |
| **WASM / Workers** (Tesseract.js, preprocessing worker) | Vitest browser mode (Playwright) | Nécessite WebWorker réel + WASM |
| **Intégration** (workflows complets) | Vitest browser mode (Playwright) | Workflow end-to-end dans un vrai navigateur |

### Principes

- Les **tests unitaires** (logique pure + composants React) tournent en happy-dom : rapides, pas de navigateur.
- Les **tests d'intégration** et les tests nécessitant Canvas/WASM/Workers tournent en **browser mode** : plus lents, mais fidèles.
- Les tests sont séparés par dossier : `tests/unit/` et `tests/browser/`.
- **`ImageData` n'existe pas dans happy-dom.** Les fonctions de preprocessing acceptent une interface `ImageBuffer = { data: Uint8ClampedArray, width: number, height: number }` au lieu de `ImageData`. Conversion `ImageData ↔ ImageBuffer` uniquement dans les couches d'intégration (worker, canvas).
- **Assertions Fabric.js** : utiliser `canvas.getObjects()` et les propriétés des objets, pas de comparaison de pixels.
- **Isolation Fabric.js** : chaque test browser doit appeler `canvas.dispose()` dans `afterEach` pour éviter les fuites d'état.
- **Isolation Tesseract.js** : chaque fichier de test crée sa propre instance d'OCR engine. Le pattern singleton est testé explicitement dans un test dédié, pas implicitement via l'ordre des tests.
- **Timeouts browser** : `30s` par test pour les tests impliquant Tesseract.js (init WASM + reconnaissance).
- **CLAHE tests** : taille minimale **64×64** (8 tuiles × 8 pixels/tuile = 64). Les 8×8/16×16 sont réservés aux algos qui ne dépendent pas d'un tiling (grayscale, Otsu, median).
- **Raccourcis clavier** : les tests doivent vérifier que les raccourcis (`D`, `V`, `Delete`) sont **désactivés** quand un élément de formulaire a le focus (input, dropdown).

### CI

- **Playwright** : ajouter `npx playwright install chromium` dans le setup CI.
- **Assets binaires** : les fichiers WASM et traineddata (~15 MB) sont soit committés via **Git LFS**, soit récupérés par un script CI. Le script `verify-assets.ts` valide leur présence.
- **Vitest browser config** : doit utiliser le même `publicDir` que le Vite config principal pour que les assets `public/` soient servis en test.

---

## Phase 0 — Setup projet + Smoke tests

**Objectif** : Scaffolding complet + validation des dépendances critiques le jour 1.

### Tâches de setup (pas de TDD)

- [ ] `bun create vite biocr --template react-ts`
- [ ] Configurer Biome (linter + formatter)
- [ ] Configurer Vitest : happy-dom pour `tests/unit/`, browser mode Playwright pour `tests/browser/`
- [ ] Installer Tailwind CSS + configurer `tailwind.config.ts`
- [ ] Initialiser shadcn/ui (`bunx shadcn@latest init`)
- [ ] Installer les dépendances : `fabric`, `pdfjs-dist`, `tesseract.js`, `sonner`
- [ ] Créer la structure de dossiers :
  ```
  src/
  ├── components/     # Composants React
  ├── workers/        # Web Workers (preprocessing)
  ├── lib/            # Logique métier pure (preprocessing algos, coordinate mapping)
  ├── hooks/          # Custom hooks React
  ├── store/          # State management
  └── types/          # Types TypeScript partagés
  tests/
  ├── unit/           # Tests rapides (happy-dom)
  └── browser/        # Tests nécessitant un vrai navigateur
  ```
- [ ] Copier les assets statiques dans `public/` (cf. spec 01) :
  - `public/tesseract/` : WASM core + worker (vérifier les noms exacts dans `node_modules/tesseract.js-core/`)
  - `public/tesseract/lang/` : `fra.traineddata` (depuis `tessdata_fast`)
  - `public/pdfjs/` : pdf.worker, WASM optionnels, cMaps, standard fonts (depuis `node_modules/pdfjs-dist/`)
- [ ] Script `scripts/verify-assets.ts` : vérifie que tous les fichiers attendus dans `public/` existent
- [ ] Vérifier que `bun run dev` et `bun run build` fonctionnent
- [ ] Vérifier que `bunx biome check` passe

### Smoke tests (browser mode — valident les dépendances critiques)

```
tests/browser/smoke/dependencies.test.ts
```

Ces tests retirent les 3 risques techniques majeurs dès le jour 1 :

1. **pdf.js** : charge un PDF 1 page trivial depuis `public/test-fixtures/` via pdf.js avec les chemins `public/pdfjs/` → asserte `numPages === 1`
2. **Tesseract.js** : instancie un worker avec les chemins `public/tesseract/`, appelle `recognize` sur un `ImageData` 10×10 blanc → asserte que ça ne crash pas (résultat vide OK)
3. **Web Worker** : poste un message à un worker trivial (`echo.worker.ts`) → asserte que la réponse revient

### Spike Fabric.js + CSS transform (browser mode)

```
tests/browser/smoke/fabric-css-transform.test.ts
```

Valide l'hypothèse architecturale centrale (spec 07) :

4. **Fabric.js sous CSS transform** : crée un `<div>` avec `transform: scale(2) translate(50px, 50px)`, y place un `<canvas>` Fabric.js, simule un clic-drag à des coordonnées viewport connues → asserte que le rectangle Fabric a les bonnes coordonnées dans l'espace document (pas dans l'espace viewport). Si Fabric.js nécessite une correction manuelle des coordonnées d'événement sous CSS transform, ce test le révèle avant tout développement feature.

### Critère de sortie

Le projet build, lint, et **les 4 smoke tests passent**. Les assets WASM sont dans `public/`. La dépendance Fabric.js + CSS transform est validée.

---

## Phase 1 — File Input

**Spec de référence** : `docs/specs/02-file-input.md`

### RED : écrire les tests d'abord

```
tests/unit/lib/file-validation.test.ts
```

1. **Validation de fichier**
   - Accepte les fichiers PNG, JPG, JPEG, WEBP, BMP → retourne `{ type: 'image' }`
   - Accepte les fichiers PDF → retourne `{ type: 'pdf' }`
   - Rejette les fichiers TIFF → retourne une erreur avec message approprié
   - Rejette les fichiers non supportés (.docx, .txt) → retourne une erreur avec message
   - Rejette les fichiers vides (0 octets) → retourne erreur "Le fichier est vide."

```
tests/unit/components/DropZone.test.tsx
```

2. **Composant DropZone**
   - Render : affiche le texte "Déposez un PDF ou une image ici"
   - Render : affiche le lien "ou cliquez pour parcourir"
   - Interaction : le survol drag active le style visuel (classe CSS appliquée)
   - Interaction : le drop d'un fichier valide appelle `onFileAccepted(file, type)`
   - Interaction : le drop d'un fichier invalide appelle `onFileRejected(message)`
   - Interaction : le drop de plusieurs fichiers prend le premier + appelle `onMultipleFilesWarning()`
   - Interaction : le clic ouvre le file picker natif (via `<input type="file">`)

### GREEN : implémenter

- `src/lib/file-validation.ts` — fonction pure `validateFile(file: File): Result<FileType, string>`
- `src/components/DropZone.tsx` — composant React avec drag & drop + input file
- `src/types/index.ts` — types `FileType`, `ImageBuffer = { data: Uint8ClampedArray, width: number, height: number }`

### Pas de dépendance bloquante. Peut démarrer dès Phase 0 terminée.

---

## Phase 2 — Image Preprocessing (Web Worker)

**Spec de référence** : `docs/specs/04-image-preprocessing.md`

**Parallélisable avec Phase 1, 3, 5.** Ce module est 100% indépendant du UI.

### RED : écrire les tests d'abord

```
tests/unit/lib/preprocessing.test.ts
```

Toutes les fonctions acceptent `ImageBuffer` (pas `ImageData`) → testable en happy-dom sans polyfill.

1. **Grayscale**
   - Convertit une image RGBA 16×16 en niveaux de gris (R=G=B=luminance)
   - No-op si l'image est déjà en niveaux de gris

2. **Binarisation Otsu**
   - Image 16×16 avec histogramme bimodal clair → seuil correct (tolérance ±5)
   - Image déjà binaire → no-op (seuil à 0 ou 255)
   - Tous les pixels de sortie sont soit 0 soit 255
   - **Image uniforme** (tous les pixels identiques) → ne crash pas, produit une image valide

3. **Filtre médian 3×3**
   - Image 16×16 : supprime le bruit poivre-et-sel (pixel isolé noir sur fond blanc → devient blanc)
   - Préserve les bords nets (pas de flou excessif)
   - Gère les pixels de bordure de l'image

4. **CLAHE** (images **64×64 minimum** — chaque tuile = 8×8 pixels)
   - Améliore le contraste local (l'écart-type de luminosité par tuile augmente)
   - Le clip limit empêche l'amplification excessive du bruit
   - Fonctionne sur une image à faible contraste (histogramme concentré)

5. **Pipeline complet**
   - Exécute les 4 étapes dans l'ordre : grayscale → CLAHE → Otsu → median
   - Le résultat est une image binaire (N&B)
   - Timeout > 10s → retourne l'image brute + flag warning

```
tests/browser/workers/preprocessing-worker.test.ts
```

6. **Worker communication** (browser mode — nécessite vrai WebWorker)
   - Reçoit un `ImageData`, retourne un `ImageData` prétraité
   - Gère le transfert via `Transferable` (le buffer source est neutered après transfert)
   - Retourne l'image brute en cas d'erreur interne
   - **Crash recovery multi-zones** : worker crash sur zone 1 → nouveau worker instancié → zone 2 prétraitée normalement → les deux résultats sont retournés (zone 1 = image brute, zone 2 = image prétraitée)

### Benchmark (pas de TDD — validation de performance)

```
scripts/benchmark-preprocessing.ts
```

- Exécute le pipeline complet sur un `ImageBuffer` de **2480×3508** (A4 à 300 DPI)
- Asserte que l'exécution complète en **< 5s** (marge de sécurité sur les 3s spec)
- Exécuté manuellement ou en CI comme smoke test

### GREEN : implémenter

- `src/lib/preprocessing/grayscale.ts`
- `src/lib/preprocessing/otsu.ts`
- `src/lib/preprocessing/median.ts`
- `src/lib/preprocessing/clahe.ts`
- `src/lib/preprocessing/pipeline.ts` — orchestre les 4 étapes
- `src/workers/preprocessing.worker.ts` — Web Worker wrappant le pipeline
- `src/types/index.ts` — `ImageBuffer` (déjà défini en Phase 1)

---

## Phase 3 — Document Viewer

**Specs de référence** : `docs/specs/02-file-input.md` (PDF→image), `docs/specs/03-canvas-interaction.md`, `docs/specs/07-coordinate-system.md`

**Dépend de** : Phase 1 (file input).

### RED : écrire les tests d'abord

```
tests/unit/lib/pdf-renderer.test.ts
```

1. **Rendu PDF** (mock de pdf.js pour les tests unitaires)
   - Charge un PDF et retourne le nombre de pages
   - Rend une page à la résolution spécifiée
   - Rejette un PDF protégé par mot de passe avec message d'erreur
   - Rejette un PDF corrompu avec message d'erreur
   - PDF > 20 pages → retourne un warning (non bloquant) en plus des pages
   - `destroy()` appelé au remplacement/fermeture de fichier → le proxy est nettoyé

```
tests/browser/lib/pdf-renderer-real.test.ts
```

2. **Rendu PDF réel** (browser mode — valide les chemins pdf.js)
   - Charge un PDF 1 page réel via pdf.js avec les chemins `public/pdfjs/` → retourne 1 page
   - Le `workerSrc` pointe vers `public/pdfjs/pdf.worker.min.mjs`
   - Aucune requête réseau vers un CDN (espionner `fetch`)

```
tests/unit/lib/viewport.test.ts
```

3. **Logique de viewport (fonctions pures)**
   - `fitToWidth(containerW, docW)` → retourne le zoom initial
   - `zoomAtPoint(state, cursorX, cursorY, delta)` → retourne le nouveau `ViewportState` (zoom centré sur curseur, style Figma)
   - Clamp du zoom entre 0.25 et 5.0
   - `pan(state, deltaX, deltaY)` → retourne le nouveau state avec translation ajustée (`deltaX / zoom`)
   - `getVisiblePage(state, viewportHeight, pageLayouts)` → retourne l'index de la page la plus visible (centre du viewport)
   - Deux pages également visibles → celle dont le centre est le plus proche l'emporte

```
tests/unit/lib/page-layout.test.ts
```

4. **Layout des pages**
   - `computePageLayouts(pages)` → retourne un tableau de `PageLayout` avec positions Y correctes (gaps de 16px inclus)
   - `findPageAtY(layouts, y)` → retourne la page correcte pour une position Y donnée
   - Position Y dans un gap → retourne la page la plus proche
   - Position Y avant la première page → retourne la première page
   - Position Y après la dernière page → retourne la dernière page

```
tests/unit/components/DocumentViewer.test.tsx
```

5. **Composant DocumentViewer**
   - Affiche une image unique avec fit-to-width
   - Affiche N éléments `<img>` pour un PDF de N pages
   - Applique la CSS transform (`scale` + `translate`) sur le conteneur `#viewport`
   - Affiche l'indicateur de zoom ("150%")
   - Bouton Reset remet le zoom au fit-to-width

6. **Image corrompue**
   - Chargement d'une image dont le `src` échoue → appelle `onLoadError` avec message "Impossible de charger cette image."

### GREEN : implémenter

- `src/lib/pdf-renderer.ts` — wrapper autour de pdf.js avec chemins statiques explicites (`workerSrc`, `cMapUrl`, etc.)
- `src/lib/viewport.ts` — fonctions pures pour zoom/pan/visible page
- `src/lib/page-layout.ts` — calcul des positions des pages
- `src/store/viewport-store.ts` — state React pour le viewport
- `src/components/DocumentViewer.tsx` — conteneur `#viewport` avec les `<img>` des pages
- `src/hooks/useZoomPan.ts` — hook gérant molette + raccourcis clavier (Ctrl+/-, Ctrl+0)

---

## Phase 4 — OCR Engine (Worker)

**Spec de référence** : `docs/specs/05-ocr-engine.md`

**Parallélisable avec Phases 1, 3, 5.** Ce module est indépendant du UI.

### RED : écrire les tests d'abord

```
tests/unit/lib/ocr-coordinator.test.ts
```

1. **Coordinateur multi-zones** (mock du moteur OCR — logique pure)
   - Traite N zones séquentiellement (pas en parallèle)
   - Retourne un résultat par zone avec son ID stable
   - Le progress callback reporte la zone en cours ("Zone 2/5") et le pourcentage global
   - L'annulation arrête le traitement de la zone courante et des suivantes
   - Un nouvel appel au coordinateur **remplace** les résultats précédents (retourne un nouveau tableau)
   - L'ordre des résultats correspond à l'ordre croissant des IDs de zones
   - Si le preprocessing crash sur une zone, l'OCR utilise l'image brute et continue avec les zones suivantes

```
tests/browser/lib/ocr-engine.test.ts
```

2. **Moteur Tesseract.js** (browser mode — nécessite WASM réel, timeout 30s/test)

   Chaque test crée sa propre instance d'OCR engine (pas de singleton partagé entre tests).

   - Crée un worker avec les chemins locaux (`/tesseract/`)
   - Charge le modèle français par défaut
   - **Singleton** : 2 appels à `getEngine()` retournent la même instance (test dédié)
   - Passe un `ImageData` simple (texte noir sur fond blanc) → retourne du texte non vide
   - Retourne un score de confiance entre 0 et 100
   - Appelle le progress callback avec des pourcentages croissants (0→100)
   - Image vide (tout blanc) → retourne texte vide + confiance basse
   - Annulation via `terminate()` → rejette la promesse
   - **Crash recovery** : après `terminate()`, un nouveau worker est instancié automatiquement et fonctionne normalement
   - Peut changer la langue du worker (`eng`) sans le recréer

### GREEN : implémenter

- `src/lib/ocr-engine.ts` — wrapper Tesseract.js (init, recognize, terminate, changeLang)
- `src/lib/ocr-coordinator.ts` — orchestre le pipeline séquentiel multi-zones (crop 300 DPI → preprocessing → OCR)
- `src/types/ocr.ts` — types `OcrResult`, `OcrProgress`, `OcrZoneResult`

---

## Phase 5 — Zone Drawing (Fabric.js overlay)

**Specs de référence** : `docs/specs/03-canvas-interaction.md`, `docs/specs/07-coordinate-system.md`

**Dépend de** : Phase 3 (Document Viewer, car l'overlay doit se superposer).

### RED : écrire les tests d'abord

```
tests/unit/lib/zone-manager.test.ts
```

1. **Gestion des zones (logique pure)**
   - `createZone(rect)` → retourne une zone avec un ID auto-incrémenté
   - Les IDs sont stables : créer 1,2,3, supprimer 2 → prochaine zone = 4
   - `deleteZone(zones, id)` → retourne le tableau sans la zone supprimée
   - `clearAllZones()` → retourne un tableau vide (le compteur n'est PAS réinitialisé)
   - `snapshotZones(zones)` → retourne une copie profonde (modifier l'original ne change pas le snapshot)

```
tests/unit/lib/coordinate-mapping.test.ts
```

2. **Mapping de coordonnées**
   - `assignZoneToPage(zone, pageLayouts)` → retourne le bon pageIndex basé sur le centre Y
   - Zone dans un gap inter-pages → assignée à la page la plus proche
   - Zone entièrement hors des pages (marges) → assignée à la page la plus proche
   - `zoneToOcrCrop(zone, page, scaleFactor)` → retourne les coordonnées crop en pixels 300 DPI
   - Test image : valeurs connues (pageW=500, naturalWidth=2500 → scaleFactor=5, rect 100×100 à (50,50) → crop 500×500 à (250,250))
   - Test PDF : valeurs connues (displayScale=1.5, ocrScale=4.17 → ratio ≈ 2.78, vérifier la conversion)

```
tests/browser/components/FabricOverlay.test.tsx
```

3. **Composant FabricOverlay** (browser mode — nécessite vrai canvas)

   Chaque test appelle `canvas.dispose()` dans `afterEach`.

   - En mode Pan : les événements souris ne créent pas de rectangles (`canvas.getObjects().length === 0`)
   - En mode Draw : un clic-drag crée un rectangle (`canvas.getObjects().length === 1`)
   - Un rectangle créé a les bonnes propriétés (stroke `#3b82f6`, fill semi-transparent)
   - La touche `Delete` supprime le rectangle sélectionné
   - La touche `Escape` désélectionne le rectangle actif
   - Raccourci `D` passe en mode Draw, `V` en mode Pan

### Vertical slice (browser mode — valide le pipeline complet avant le UI)

```
tests/browser/integration/vertical-slice.test.ts
```

4. **Pipeline de bout en bout sans UI**
   - Créer un `ImageBuffer` 200×200 avec du texte noir sur blanc
   - Créer une zone programmatique couvrant l'image entière
   - Exécuter : crop → preprocessing pipeline → Tesseract OCR
   - Asserte : résultat non vide, pas de crash, mémoire libérée (canvas off-screen détruit)

   Ce test valide le coordinate mapping + preprocessing + OCR ensemble, avant de construire tout le UI (Phases 6-7).

### GREEN : implémenter

- `src/lib/zone-manager.ts` — CRUD des zones, IDs stables
- `src/lib/coordinate-mapping.ts` — assignation page + conversion coordonnées
- `src/components/FabricOverlay.tsx` — canvas Fabric.js en overlay
- `src/hooks/useFabricCanvas.ts` — initialisation et lifecycle Fabric
- `src/store/zone-store.ts` — state React pour les zones + mode actif

### ◆ REVIEW GATE 1 — Avant Phase 6

**Prérequis** : Phases 1, 2, 3, 4, 5 terminées. Tous les tests passent. Le vertical slice passe.

Lancer `/adversarial-review` avec les 3 axes décrits dans la section "Review Gates" : **Archi**, **Spec compliance**, **Code quality**. Ne pas démarrer Phase 6 tant que les 3 reviewers n'approuvent pas.

---

## Phase 6 — Results Panel, Toolbar & UI

**Specs de référence** : `docs/specs/06-ui-layout.md`, `docs/specs/05-ocr-engine.md` (sortie)

**Dépend de** : Phases 2, 4, 5 pour l'intégration. Le **UI pur** (composants de présentation) peut démarrer dès Phase 5.

### RED : écrire les tests d'abord

```
tests/unit/components/Toolbar.test.tsx
```

1. **Toolbar**
   - État vide : toolbar masquée (pas de fichier chargé)
   - Fichier chargé : affiche le nom du fichier + bouton ✕, les contrôles de zone, le bouton OCR
   - Le bouton ✕ appelle `onFileClose()`
   - **Bouton parcourir** visible dans la toolbar quand un fichier est chargé
   - Le bouton OCR affiche "OCR document" sans zones, "OCR (3 zones)" avec 3 zones
   - Le bouton OCR est désactivé pendant un OCR en cours
   - Le segmented control Draw/Pan reflète le mode actif et appelle `onModeChange`
   - "Effacer zones" visible uniquement si ≥ 1 zone
   - L'indicateur de zoom affiche le pourcentage correct (ex: "150%")
   - Le bouton Reset zoom appelle `onResetZoom`
   - Le toggle prétraitement appelle `onPreviewToggle`
   - Le **bouton aide (?)** existe et affiche un tooltip avec les raccourcis clavier

```
tests/unit/components/ResultsPanel.test.tsx
```

2. **Panneau résultats**
   - Masqué quand aucun résultat
   - Affiche un onglet par zone avec le texte OCR
   - Affiche un onglet "Document" pour l'OCR global
   - Les onglets portent les numéros stables des zones (Zone 1, Zone 3 si Zone 2 supprimée)
   - Le bouton "Copier" appelle la fonction de copie avec le texte de la zone
   - Le bouton "Copier" affiche "Copié !" pendant 2 secondes puis revient à "Copier"
   - Le bouton "Tout copier" concatène avec le format exact `\n--- Zone N ---\n` dans l'ordre croissant des IDs
   - **"Tout copier" avec un seul onglet "Document"** : copie le texte sans séparateur
   - Résultat vide → affiche le message d'aide (cf. spec 05)
   - Confiance < 40% → affiche un badge warning "⚠ Fiabilité faible"
   - Le feedback "Copié !" est dans un conteneur `aria-live="polite"`

```
tests/unit/hooks/useClipboard.test.ts
```

3. **Hook clipboard** (tests basés sur des mocks/stubs — logique de branching)
   - `navigator.clipboard.writeText` disponible → l'utilise
   - `navigator.clipboard` indisponible → fallback `document.execCommand('copy')`
   - Les deux indisponibles → retourne un flag `fallbackToManualCopy: true`

```
tests/unit/components/ProgressBar.test.tsx
```

4. **Barre de progression**
   - Masquée quand pas d'OCR en cours
   - Affiche le pourcentage et l'étape ("Reconnaissance...")
   - Multi-zones : affiche "Zone 2/5 — 45%"
   - Bouton Annuler appelle le callback d'annulation
   - A les attributs `role="progressbar"` et `aria-valuenow` corrects

```
tests/unit/components/FileReplaceDialog.test.tsx
```

5. **Dialog de confirmation de remplacement / fermeture**
   - Affichée quand `hasZonesOrResults: true`
   - "Continuer" appelle `onConfirm`
   - "Annuler" appelle `onCancel`
   - Non affichée (confirmation directe) quand `hasZonesOrResults: false`

```
tests/unit/components/CoachMark.test.tsx
```

6. **Coach-mark**
   - Affiche le toast informatif au premier rendu
   - Ne s'affiche pas au deuxième rendu (flag en session via ref)
   - Contient le texte sur le mode Draw et le bouton OCR

```
tests/unit/components/LanguageSelector.test.tsx
```

7. **Sélecteur de langue**
   - Affiche "Français" sélectionné par défaut
   - La sélection d'une langue non-bundlée appelle `onLanguageChange` avec la langue
   - Quand `isOnline: false` et langue non bundlée → option désactivée avec tooltip

```
tests/unit/components/ToastSystem.test.tsx
```

8. **Système de toasts** (intégration Sonner)
   - Les toasts d'erreur ne sont **pas** auto-dismiss (restent jusqu'à fermeture manuelle)
   - Les toasts info/success/warning s'auto-dismiss après 5 secondes
   - Maximum 3 toasts visibles simultanément

### GREEN : implémenter

- `src/components/Toolbar.tsx` — avec tous les groupes de contrôles, séparateurs, bouton aide
- `src/components/ResultsPanel.tsx` — onglets + copier + messages d'aide + aria-live
- `src/components/ProgressBar.tsx` — barre fine + annulation + aria
- `src/components/FileReplaceDialog.tsx` — dialog shadcn/ui (remplacement + fermeture)
- `src/components/CoachMark.tsx` — toast au premier chargement (Sonner)
- `src/components/LanguageSelector.tsx` — dropdown avec états online/offline
- `src/hooks/useClipboard.ts` — copie avec chaîne de fallback
- `src/lib/toast-config.ts` — configuration Sonner (position, duration, max visible)

### ◆ REVIEW GATE 2 — Avant Phase 7

**Prérequis** : Phase 6 terminée. Tous les tests unitaires et composants passent.

Lancer `/adversarial-review` avec les 3 axes : **UX**, **Intégration**, **Tests**. Ne pas démarrer Phase 7 tant que les 3 reviewers n'approuvent pas.

---

## Phase 7 — Integration & Polish

**Toutes les specs**. Assemblage final.

**Dépend de** : toutes les phases précédentes.

### RED : écrire les tests d'abord

```
tests/browser/integration/full-workflow.test.ts
```

1. **Workflow complet image**
   - Drop d'une image PNG → affichage dans le viewer → draw d'une zone → OCR → texte affiché dans le panneau

2. **Workflow complet PDF**
   - Drop d'un PDF 2 pages → les 2 pages sont affichées → OCR document → résultat affiché dans l'onglet "Document"

3. **Multi-zones + copier**
   - Draw de 3 zones → OCR → 3 onglets dans le panneau → "Tout copier" produit le texte concaténé avec séparateurs dans l'ordre des IDs

4. **Remplacement de fichier avec confirmation**
   - Drop fichier A → draw zones → drop fichier B → dialog de confirmation → "Continuer" → zones et résultats effacés, nouveau fichier affiché

5. **Remplacement de fichier sans confirmation**
   - Drop fichier A (pas de zones ni résultats) → drop fichier B → remplacement direct, pas de dialog

6. **Fermeture de fichier avec confirmation (bouton ✕)**
   - Fichier chargé + zones → clic ✕ → dialog de confirmation → "Continuer" → retour à l'état vide (DropZone visible, toolbar masquée, panneau masqué)

7. **Fermeture de fichier sans confirmation**
   - Fichier chargé sans zones ni résultats → clic ✕ → retour direct à l'état vide

8. **Preview preprocessing**
   - Toggle preview avec une zone sélectionnée → overlay avec label "Aperçu — Zone N" → toggle off → overlay masqué
   - Toggle preview sans zone sélectionnée → overlay avec label "Aperçu — Page N"

9. **Annulation OCR**
   - Lancer OCR → cliquer Annuler → toast "OCR annulé", pas de résultats, bouton OCR réactivé

10. **OCR remplace les résultats précédents**
    - OCR sur 2 zones → résultats affichés → draw 1 zone supplémentaire → relancer OCR → anciens résultats remplacés

11. **Delete all zones → OCR global**
    - Draw 3 zones → effacer toutes les zones → le bouton OCR passe à "OCR document" → clic OCR → résultat dans l'onglet "Document"

12. **Canvas interactif pendant l'OCR**
    - Lancer OCR → pendant que l'OCR tourne : pan, zoom, et draw d'un nouveau rectangle → tout fonctionne, l'OCR se termine normalement

13. **OCR worker crash → recovery**
    - Forcer un crash du worker Tesseract → toast d'erreur affiché → relancer l'OCR → ça fonctionne (worker recréé)

14. **Preprocessing crash pendant multi-zones**
    - Zone 1 : preprocessing crash (simulé) → OCR utilise l'image brute, toast warning → Zone 2 : preprocessing OK → les deux résultats sont affichés

```
tests/browser/integration/offline.test.ts
```

15. **Garantie offline**
    - Mock de `fetch` global qui rejette toute requête vers un domaine externe → le workflow complet (drop → OCR → copier) fonctionne sans erreur réseau

```
tests/browser/integration/keyboard.test.ts
```

16. **Raccourcis clavier**
    - `D` → passe en mode Draw (le segmented control reflète le changement)
    - `V` → passe en mode Pan
    - `Ctrl +` → zoom in (le pourcentage augmente)
    - `Ctrl -` → zoom out
    - `Ctrl 0` → reset zoom (fit-to-width)
    - `Escape` → désélectionne la zone active
    - `Delete` → supprime la zone sélectionnée
    - **Raccourcis inactifs quand un input a le focus** : focus sur le language dropdown → appuyer `D` → le mode ne change PAS

```
tests/browser/integration/accessibility.test.ts
```

17. **Accessibilité basique**
    - Tous les boutons de la toolbar ont un `aria-label` non vide
    - La barre de progression a `role="progressbar"` et `aria-valuenow` correct
    - Le feedback "Copié !" est dans une `aria-live="polite"` region
    - Le canvas Fabric a `role="application"` et un `aria-label`
    - La toolbar est navigable avec `Tab` (chaque contrôle est focusable dans l'ordre)

### GREEN : implémenter

- `src/App.tsx` — assemblage de tous les composants
- `src/store/app-store.ts` — store global (zustand) composant les sous-stores
- Wiring des events : drop → viewer → zones → OCR → résultats
- Gestion du coach-mark (une seule fois par session via ref)
- Prévisualisation du prétraitement (toggle + overlay avec label de scope)

### ◆ REVIEW GATE 3 — Avant Polish

**Prérequis** : Tous les tests d'intégration Phase 7 passent (17 tests browser).

Lancer `/adversarial-review` avec les 3 axes : **End-to-end**, **Performance & offline**, **Sécurité & robustesse**. Ne pas démarrer le Polish tant que les 3 reviewers n'approuvent pas.

### Polish (review manuelle, pas de TDD)

- [ ] Tester avec un vrai bilan biologique scanné (PDF et image)
- [ ] Vérifier la performance mémoire sur un PDF 5 pages (< 500 MB)
- [ ] Tester en mode Offline (DevTools Network → Offline)
- [ ] Vérifier que `bunx biome check` passe
- [ ] Responsive : tester layout vertical < 768px + toolbar overflow menu
- [ ] Tester la bordure bleue autour du canvas en mode Draw
- [ ] Vérifier le resize du panneau résultats (min 200px, max 60%)
- [ ] Vérifier le comportement du bouton aide (?) et son contenu

---

## Matrice de dépendances

| Phase | Dépend de | Parallélisable avec |
| ----- | --------- | ------------------- |
| 0     | —         | —                   |
| 1     | 0         | 2, 4                |
| 2     | 0         | 1, 3, 4, 5          |
| 3     | 1         | 2, 4                |
| 4     | 0         | 1, 2, 3, 5          |
| 5     | 3         | 2, 4                |
| 6     | 5 (UI), 2+4 (integ) | —         |
| 7     | tout      | —                   |

## Planning optimal (2 développeurs)

```
Dev A:  [P0] → [P1] → [P3] → [P5] → [P6 UI] → [P7]
Dev B:  [P0] → [P2] ──────→ [P4] ──→ [P6 integ] → [P7]
```

## Planning solo

```
[P0] → [P1] → [P2] → [P3] → [P4] → [P5] → [P6] → [P7]
```

L'ordre solo optimise la boucle de feedback : on voit le UI progresser tôt (P1→P3), puis on branche les workers (P2→P4), puis on assemble (P5→P6→P7). Le spike Fabric.js en Phase 0 retire le risque architectural avant tout code feature.
