---
description: Roadmap TDD pour l'implémentation de la spec 11 — OCR UX responsiveness (worker, page-par-page, résultats progressifs, feedback).
---

# Roadmap — OCR UX Responsiveness

## Objectif

Implémenter la spec [11-ocr-ux-responsiveness](../specs/11-ocr-ux-responsiveness.md) pour rendre l'OCR réactif : preprocessing dans un Web Worker, OCR page-par-page sur les PDFs, résultats progressifs, et feedback visuel par étape.

## Vue d'ensemble des phases

```
Phase 1 — Types, Store & Rename mécanique (séquentiel, fondation)
Phase 2 — Briques indépendantes (3 agents parallèles)
  ├─ 2a : Worker protocol + preprocessInWorker
  ├─ 2b : DocumentViewer proxy exposure
  └─ 2c : Coordinator extensions (ZoneProvider, callbacks, ProxyDestroyedError)
── Gate 1 : /adversarial-review ──
Phase 3 — UI Components (2 agents parallèles, dépend Phase 1)
  ├─ 3a : ProgressBar v2
  └─ 3b : ResultsPanel v2
Phase 4 — App.tsx wiring (séquentiel, dépend Phases 1-3)
── Gate 2 : /adversarial-review ──
Phase 5 — Tests d'intégration browser (séquentiel, dépend Phase 4)
── Gate 3 : /adversarial-review ──
```

---

## Phase 1 — Types, Store & Rename mécanique

**Objectif :** Mettre à jour les types fondamentaux (`OcrState`, `OcrProgress`) et le store Zustand. Appliquer le rename `currentZone`/`totalZones` → `currentItem`/`totalItems` dans **tous** les fichiers consommateurs et tests pour garder le build vert.

**Séquentiel** — fondation, aucune dépendance.

**Tests RED** (`tests/unit/lib/types-store.test.ts` — nouveau fichier) :

```
OcrState type :
- running variant contient step, itemLabel, partialResults, currentItem, totalItems
- idle variant est inchangé
- done variant contient results (inchangé)
- setOcrState avec running met à jour tous les nouveaux champs
- partialResults s'accumule via setOcrState successifs
```

**Implémentation GREEN :**

```ts
// src/types/ocr.ts — mise à jour
export type OcrZoneResult = { zoneId: number; text: string; confidence: number };

export type OcrProgress = {
  currentItem: number;   // ex-currentZone
  totalItems: number;    // ex-totalZones
  itemProgress: number;  // ex-zoneProgress
  globalProgress: number;
};

// src/store/app-store.ts — OcrState mis à jour
type OcrState =
  | { status: "idle" }
  | {
      status: "running";
      currentItem: number;
      totalItems: number;
      progress: number;
      step: "preprocessing" | "recognizing";
      itemLabel: "Zone" | "Page";
      partialResults: OcrZoneResult[];
    }
  | { status: "done"; results: OcrZoneResult[] };
```

**Rename mécanique dans TOUS les consommateurs et tests :**

Fichiers source :
- `App.tsx` : `setOcrState` calls → nouveaux noms de champs. Initialiser `step: "recognizing"`, `itemLabel: "Zone"`, `partialResults: []`. **Attention : `setOcrState` fait un full replace.** Le handler `onProgress` doit faire `setOcrState({ ...useAppStore.getState().ocr, currentItem: ..., totalItems: ..., progress: ... })` pour préserver `step`, `itemLabel`, `partialResults`. Le prop `step` de `ProgressBar` reste `string` (valeur `"Reconnaissance..."`).
- `ProgressBar.tsx` : props `currentZone`/`totalZones` → `currentItem`/`totalItems`. Le type de `step` reste `string` (Phase 3a le changera).
- `ocr-coordinator.ts` : `OcrProgress` emit avec les nouveaux noms.

Fichiers test (⚠️ tous doivent être mis à jour) :
- `tests/unit/components/App.test.tsx` : toute référence `currentZone`/`totalZones` → `currentItem`/`totalItems`. Ajouter `step`, `itemLabel`, `partialResults` aux états running mockés.
- `tests/unit/components/ProgressBar.test.tsx` : rename props dans tous les tests.
- `tests/unit/lib/ocr-coordinator.test.ts` : rename champs dans les assertions `OcrProgress`.
- `tests/unit/components/Toolbar.test.tsx` : si référence aux champs OCR.
- `tests/browser/integration/ocr-edge-cases.test.ts` : rename si référencé.
- `tests/browser/integration/full-workflow.test.ts` : rename `currentZone`/`totalZones` (lignes 410-411).

**Critères :** `bunx vitest run` (tous les tests) passe. `bun run build` réussit. `bunx biome check` clean.

**Dépendances :** Aucune.

---

## Phase 2 — Briques indépendantes

**Objectif :** Construire les 3 briques fondamentales en parallèle : worker, proxy, coordinator.

**Parallélisation :** 3 agents Opus en parallèle. **Chaque agent doit partir du code post-Phase 1** (les renames sont déjà appliqués). Les 3 agents ne modifient aucun fichier en commun entre eux.

### Agent 2a : Worker protocol + `preprocessInWorker`

**Fichiers modifiés :** `src/workers/preprocessing.worker.ts`, `src/lib/preprocessing/worker-wrapper.ts` (nouveau), `tests/unit/lib/preprocess-worker-wrapper.test.ts` (nouveau), `tests/browser/workers/preprocessing-worker.test.ts`.

**Tests RED** (`tests/unit/lib/preprocess-worker-wrapper.test.ts`) :

```
preprocessInWorker :
- retourne une ImageBuffer preprocessée (mock worker)
- passe estimatedDPI dans le message au worker
- retourne l'image brute si le worker lève une erreur
- appelle onWarning callback si le worker lève une erreur (toast surfacé via le caller)
- fallback main-thread si Worker API absente (globalThis.Worker = undefined)
- le worker singleton est réutilisé entre 2 appels
- terminatePreprocessWorker() détruit le singleton

Worker protocol :
- message avec { image, options: { estimatedDPI } } → PipelineResult
- message sans 'image' key → erreur explicite (duck-type guard)
```

**Implémentation GREEN :**

```ts
// src/lib/preprocessing/worker-wrapper.ts (nouveau)
let workerInstance: Worker | null = null;

export async function preprocessInWorker(
  image: ImageBuffer,
  options?: { estimatedDPI?: number; onWarning?: (msg: string) => void }
): Promise<ImageBuffer> {
  if (typeof Worker === "undefined") {
    console.warn("Worker API unavailable, falling back to main thread");
    return preprocessingPipeline(image, { estimatedDPI: options?.estimatedDPI }).image;
  }
  try {
    // Create singleton, postMessage { image, options: { estimatedDPI } }, await response
    // return result.image
  } catch {
    options?.onWarning?.("Le prétraitement a échoué. Image brute utilisée.");
    return image; // fallback : image brute
  }
}

export function terminatePreprocessWorker(): void {
  workerInstance?.terminate();
  workerInstance = null;
}

// src/workers/preprocessing.worker.ts — mise à jour
self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  // Duck-type guard : ancien format = ImageBuffer nu (a .data, .width, .height mais pas .image)
  if (!msg || !('image' in msg)) {
    workerSelf.postMessage({ error: "Invalid worker input format" });
    return;
  }
  const { image, options } = msg;
  const result = preprocessingPipeline(image, { estimatedDPI: options?.estimatedDPI });
  const buffer = result.image.data.buffer as ArrayBuffer;
  workerSelf.postMessage(result, [buffer]);
};
```

**Aussi :** Mettre à jour `tests/browser/workers/preprocessing-worker.test.ts` pour le nouveau format de message `{ image, options }`.

**Critères :** Tests unitaires du wrapper passent. Test browser du worker passe. Biome clean.

---

### Agent 2b : DocumentViewer proxy exposure

**Fichiers modifiés :** `src/components/DocumentViewer.tsx`, `tests/unit/components/DocumentViewer.test.tsx`.

**Tests RED** (`tests/unit/components/DocumentViewer.test.tsx` — ajout) :

```
DocumentViewer PDF proxy :
- appelle onPdfProxyReady(proxy) quand le PDF est chargé (mock non-null)
- appelle onPdfProxyReady(null) quand le fichier change
- appelle onPdfProxyReady(null) au unmount
- ne crash pas si onPdfProxyReady n'est pas fourni
```

**Implémentation GREEN :**

```ts
// DocumentViewer.tsx — ajout prop
interface DocumentViewerProps {
  // ... existant ...
  onPdfProxyReady?: (proxy: /* PDFDocumentProxy */ unknown | null) => void;
}

// Dans le useEffect PDF : après loadAndRenderPdf réussit
onPdfProxyReady?.(result.proxy);

// Dans cleanupPdfProxy :
onPdfProxyReady?.(null);
```

**Critères :** Tests existants DocumentViewer passent + nouveaux tests passent. Build clean.

---

### Agent 2c : Coordinator extensions

**Fichiers modifiés :** `src/lib/ocr-coordinator.ts`, `src/lib/errors.ts` (nouveau), `tests/unit/lib/ocr-coordinator.test.ts`.

**⚠️ L'agent doit partir du code post-Phase 1** où `currentZone`/`totalZones` sont déjà renommés en `currentItem`/`totalItems`. La réécriture de `processZones` s'applique sur cette base.

**Tests RED** (`tests/unit/lib/ocr-coordinator.test.ts` — ajout) :

```
onItemComplete callback :
- appelé après chaque zone reconnue avec le OcrZoneResult
- appelé pour les items accumulés AVANT un ProxyDestroyedError
- pas appelé si la reconnaissance échoue (zone en erreur)

onStepChange callback :
- appelé avec "preprocessing" avant le preprocess (seulement si preprocess est fourni)
- appelé avec "recognizing" avant le recognize (toujours)
- pas de "preprocessing" émis si preprocess est undefined
- séquence pour 2 zones avec preprocess : preprocessing, recognizing, preprocessing, recognizing

ZoneProvider :
- processZones accepte un ZoneProvider avec count et getZone
- les items sont traités dans l'ordre 0..count-1
- getZone est appelé paresseusement (juste avant traitement)
- pas de tri (contrairement à ZoneInput[])

ProxyDestroyedError :
- si getZone lance ProxyDestroyedError, le loop s'arrête immédiatement
- les résultats accumulés avant l'erreur sont retournés
- onItemComplete a été appelé pour chaque résultat avant l'erreur
- les autres erreurs de getZone → skip + warning, continue

Backward compat :
- ZoneInput[] fonctionne comme avant (tri par id, itération)
- les nouveaux callbacks sont optionnels
```

**Implémentation GREEN :**

```ts
// src/lib/errors.ts (nouveau)
export class ProxyDestroyedError extends Error {
  constructor() { super("PDF proxy destroyed during OCR"); }
}

// src/lib/ocr-coordinator.ts — extensions
export type ZoneProvider = {
  count: number;
  getZone: (index: number) => Promise<ZoneInput>;
};

export type CoordinatorOptions = {
  // ... existant ...
  onItemComplete?: (result: OcrZoneResult) => void;
  onStepChange?: (step: "preprocessing" | "recognizing") => void;
};

export async function processZones(
  zones: ZoneInput[] | ZoneProvider,
  options: CoordinatorOptions,
): Promise<OcrZoneResult[]> {
  const isArray = Array.isArray(zones);
  const count = isArray ? zones.length : zones.count;
  const sorted = isArray ? [...zones].sort((a, b) => a.id - b.id) : null;

  for (let i = 0; i < count; i++) {
    if (signal?.aborted) break;

    let zone: ZoneInput;
    if (sorted) {
      zone = sorted[i];
    } else {
      try {
        zone = await zones.getZone(i);
      } catch (err) {
        if (err instanceof ProxyDestroyedError) break;
        onWarning?.(`Impossible de charger l'item ${i + 1}`);
        results.push({ zoneId: i + 1, text: "", confidence: 0 });
        continue;
      }
    }

    // Preprocess
    let processedImage = zone.image;
    if (preprocess) {
      onStepChange?.("preprocessing");
      try { processedImage = await preprocess(zone.image); }
      catch { onWarning?.(...); }
    }

    if (signal?.aborted) break;

    // Recognize
    onStepChange?.("recognizing");
    try {
      const result = await engine.recognize(processedImage, onZoneProgress);
      results.push(result);
      onItemComplete?.(result);
    } catch {
      results.push({ zoneId: zone.id, text: "", confidence: 0 });
    }
  }
  return results;
}
```

**Critères :** Tous les tests coordinator existants passent. Nouveaux tests passent. Build + biome clean.

---

## Gate 1 — Adversarial Review

**Après Phase 2.** Lancer `/adversarial-review` sur :
- `src/types/ocr.ts`, `src/store/app-store.ts`
- `src/lib/preprocessing/worker-wrapper.ts`, `src/workers/preprocessing.worker.ts`
- `src/components/DocumentViewer.tsx`
- `src/lib/ocr-coordinator.ts`, `src/lib/errors.ts`
- Tests associés

**Axes :** Spec compliance, backward compat, test coverage.

**Critère :** 0 CRITICAL, 0 MAJOR.

---

## Phase 3 — UI Components

**Objectif :** Mettre à jour ProgressBar et ResultsPanel pour supporter les nouvelles données.

**Parallélisation :** 2 agents Opus en parallèle. Dépend de Phase 1 (OcrState).

### Agent 3a : ProgressBar v2

**Fichiers modifiés :** `src/components/ProgressBar.tsx`, `tests/unit/components/ProgressBar.test.tsx`.

**Note build :** Phase 1 a laissé `step` comme `string` dans ProgressBar et `App.tsx` passe `step="Reconnaissance..."`. Phase 3a change le type de `step` en union `"preprocessing" | "recognizing"`. Pour garder le build vert **à la fin de Phase 3**, l'agent 3a doit aussi mettre à jour le passage du prop `step` dans `App.tsx` de `step="Reconnaissance..."` à `step="recognizing"`. C'est un changement minimal d'une seule ligne dans App.tsx — pas de conflit avec Phase 3b car 3b ne touche pas App.tsx.

**Tests RED** (`tests/unit/components/ProgressBar.test.tsx` — mise à jour) :

```
ProgressBar v2 :
- affiche "Prétraitement…" quand step="preprocessing"
- affiche "Reconnaissance…" quand step="recognizing"
- affiche "Page 3/10 — Prétraitement…" quand itemLabel="Page", totalItems > 1
- affiche "Zone 2/3 — Reconnaissance…" quand itemLabel="Zone", totalItems > 1
- affiche "Prétraitement…" sans compteur quand totalItems=1
- affiche "Reconnaissance…" sans compteur quand totalItems=1
- le pourcentage est toujours visible dans l'aria-valuenow
```

**Implémentation GREEN :**

```tsx
interface ProgressBarProps {
  visible: boolean;
  percentage: number;
  step: "preprocessing" | "recognizing";
  itemLabel: "Zone" | "Page";
  currentItem?: number;
  totalItems?: number;
  onCancel: () => void;
}

const stepLabel = step === "preprocessing" ? "Prétraitement…" : "Reconnaissance…";
const isMulti = currentItem && totalItems && totalItems > 1;
const label = isMulti
  ? `${itemLabel} ${currentItem}/${totalItems} — ${stepLabel}`
  : stepLabel;
```

**Aussi dans App.tsx** (1 ligne) : `step="Reconnaissance..."` → `step="recognizing"`.
**Aussi dans App.test.tsx** : adapter tout test qui mock/asserte le prop `step` de ProgressBar.

**Critères :** Tous les tests ProgressBar ET App passent. Build clean.

---

### Agent 3b : ResultsPanel v2

**Fichiers modifiés :** `src/components/ResultsPanel.tsx`, `tests/unit/components/ResultsPanel.test.tsx`.

**Tests RED** (`tests/unit/components/ResultsPanel.test.tsx` — ajout) :

```
ResultsPanel séparateurs :
- isGlobalOcr=true, results.length > 1 → "Tout copier" utilise "--- Page X ---"
- isGlobalOcr=false, results.length > 1 → "Tout copier" utilise "--- Zone X ---"
- results.length === 1 → pas de séparateur dans le texte copié
```

**Implémentation GREEN :**

```tsx
const separator = isGlobalOcr ? "Page" : "Zone";
const allText = results.length === 1
  ? results[0].text
  : results.map(r => `--- ${separator} ${r.zoneId} ---\n${r.text}`).join("\n\n");
```

**⚠️** Le joiner existant est `\n`, le nouveau est `\n\n`. Mettre à jour le test existant `"Tout copier concatenates with zone separators"` pour utiliser `\n\n`.

**Critères :** Tests existants (mis à jour) passent. Nouveaux tests séparateurs passent.

---

## Phase 4 — App.tsx wiring

**Objectif :** Intégrer toutes les briques dans App.tsx : worker, page-par-page, résultats progressifs, cancel robuste.

**Séquentiel** — dépend de toutes les phases précédentes.

**⚠️ Note atomicité cancel :** Les changements à `handleOcrCancel` (suppression de `setOcrState("idle")`) et à `handleOcrStart` (logique post-abort avec `partialResults`) **doivent être implémentés dans le même GREEN step**. Ne jamais commiter l'un sans l'autre — sinon le cancel laisse l'UI bloquée en `"running"`.

**Tests RED** (`tests/unit/components/App.test.tsx` — mise à jour) :

```
handleOcrStart :
- OCR global image → preprocessInWorker appelé avec estimatedDPI=300
- OCR zones → preprocessInWorker appelé avec estimatedDPI=150
- OCR global PDF → ZoneProvider construit avec count = nombre de pages
- résultats passent par postProcess via onItemComplete (pas après processZones)
- setOcrState initial : step="preprocessing", itemLabel=("Page"|"Zone"), partialResults=[]

handleOcrCancel :
- appelle uniquement abort(), ne touche PAS à setOcrState
- après processZones settle avec partialResults > 0 → status="done" + toast "résultats partiels"
- après processZones settle avec partialResults = 0 → status="idle" + toast "OCR annulé"

Cancel race condition :
- finally block ne nullifie abortControllerRef que si controller === current

ResultsPanel visible pendant running :
- si partialResults.length > 0 en status running → ResultsPanel rendu dans le DOM

loadFile / doClose abort :
- loadFile appelle abort() avant setFile
- doClose appelle abort() avant clearFile

Worker lifecycle :
- terminatePreprocessWorker appelé dans doClose

Worker error toast :
- si preprocessInWorker appelle onWarning (erreur worker), un toast warning s'affiche

isGlobalOcr stable :
- isGlobalOcr pour le ResultsPanel est dérivé de itemLabel dans OcrState (pas de zones.length réactif)
- pendant status="running" : isGlobalOcr = ocr.itemLabel === "Page"
- évite que l'ajout d'une zone pendant l'OCR ne change les séparateurs

Document vide :
- pages.length=0 ou docWidth=0 → toast erreur "Le document ne contient pas d'image exploitable", pas d'OCR

PDF proxy :
- onPdfProxyReady callback passé à DocumentViewer
- proxy stocké dans pdfProxyRef

Worker encore en cours après cancel :
- le worker singleton n'est PAS terminé par cancel (reste disponible pour le prochain OCR)
```

**Implémentation GREEN :**

Les changements dans App.tsx (pseudocode des blocs clés) :

```ts
// 1. Ref pour le PDF proxy
const pdfProxyRef = useRef<PDFDocumentProxy | null>(null);

// 2. ocrResults dérivation : partialResults pendant running, results quand done
const ocrResults = ocr.status === "done"
  ? ocr.results
  : ocr.status === "running"
    ? ocr.partialResults
    : [];

// 3. handleOcrStart : voir spec pour le flow complet
//    - Guard document vide
//    - setOcrState initial avec step="preprocessing", partialResults=[]
//    - Build ZoneProvider (PDF) ou ZoneInput[] (image/zones)
//    - processZones avec preprocessInWorker (closure sur estimatedDPI + onWarning: showWarning)
//    - onItemComplete : postProcess + append à partialResults dans le store
//    - isGlobalOcr capturé au démarrage (pas dérivé reactif de zones.length au render)
//    - onStepChange : met à jour step dans le store
//    - onProgress : READ current state + merge (setOcrState fait un full replace, pas un merge !)
//      → { ...current, currentItem, totalItems, progress } — préserve step, itemLabel, partialResults
//    - Post-processZones : lire partialResults du store pour transition finale
//    - finally guard : if (abortControllerRef.current === controller) nullify

// 4. handleOcrCancel : UNIQUEMENT abort(), rien d'autre
// 5. loadFile / doClose : abort() + terminatePreprocessWorker() avant destruction
// 6. DocumentViewer : <DocumentViewer onPdfProxyReady={(p) => pdfProxyRef.current = p} ... />
```

**Critères :** Tous les tests unitaires passent. Build clean. Biome clean.

**Dépendances :** Phases 1, 2, 3.

---

## Gate 2 — Adversarial Review

**Après Phase 4.** Lancer `/adversarial-review` sur tout le code modifié.

**Axes :** Spec compliance end-to-end, cancel robustness, race conditions.

**Critère :** 0 CRITICAL, 0 MAJOR.

---

## Phase 5 — Tests d'intégration browser

**Objectif :** Vérifier le pipeline complet dans un vrai navigateur.

**Séquentiel** — dépend de Phase 4.

**Tests browser** (`tests/browser/integration/`) :

```
ocr-ux-responsiveness.test.ts (nouveau) :
- Worker preprocessing : image preprocessée via worker, résultat non vide
- Page-par-page : PDF 2 pages → résultat contient "--- Page 1 ---" et "--- Page 2 ---"
- Résultats progressifs : pendant l'OCR multi-page, partialResults.length > 0 avant la fin
- ProgressBar step : label alterne entre "Prétraitement" et "Reconnaissance" pendant l'OCR
- Cancel partiel : annuler après 1 page → résultat partiel affiché (status done, pas idle)
- Worker survive au cancel : après annulation, relancer l'OCR fonctionne (singleton intact)
- ProxyDestroyedError path : simuler proxy=null pendant page-par-page → résultats partiels affichés

Mise à jour des tests existants :
- vertical-slice.test.ts : adapter si nécessaire
- ocr-edge-cases.test.ts : adapter aux nouveaux noms de champs OcrProgress
- offline.test.ts : vérifier que le worker preprocessing local fonctionne offline
```

**Critères :** Tests browser passent. Build réussit. `bunx biome check` clean.

**Dépendances :** Phase 4.

---

## Gate 3 — Adversarial Review finale

**Après Phase 5.** Lancer `/adversarial-review` sur tout le code modifié.

**Axes :** End-to-end, performance/memory, edge cases.

**Critère :** 0 CRITICAL, 0 MAJOR. Build clean.

---

## Out of scope

- Parallélisation preprocessing/OCR sur plusieurs pages (un seul worker Tesseract)
- Progress par sous-étape du pipeline (grayscale %, CLAHE %, etc.)
- Streaming du texte pendant la reconnaissance d'une page
- Refonte du ResultsPanel en onglets multiples par page
- Cache des résultats OCR par page
- Interruption de Tesseract mid-recognition
- Nettoyage beforeunload
