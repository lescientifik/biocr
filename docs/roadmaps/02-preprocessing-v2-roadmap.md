---
description: Roadmap TDD pour l'implémentation des specs 08 (preprocessing v2), 09 (OCR engine v2) et 10 (post-processing médical).
---

# Roadmap — Preprocessing v2, OCR Engine v2, Post-processing

## Objectif

Implémenter les specs [08-preprocessing-v2](../specs/08-preprocessing-v2.md), [09-ocr-engine-v2](../specs/09-ocr-engine-v2.md) et [10-post-processing](../specs/10-post-processing.md) pour améliorer la qualité OCR sur les documents médicaux scannés.

## Vue d'ensemble des phases

```
Phase 0 — Assets tessdata_best (séquentiel, prérequis)
Phase 1 — Deskew + Upscale (parallélisable : 2 agents)
Phase 2 — Pipeline v2 (séquentiel, dépend de Phase 1)
Phase 3 — OCR Engine v2 (parallélisable avec Phase 2, dépend de Phase 0)
Phase 4 — Post-processing (parallélisable avec Phases 2-3, aucune dépendance)
── Gate 1 : /adversarial-review ──
Phase 5 — Wiring App.tsx (séquentiel, dépend de Phases 2-4)
Phase 6 — Tests d'intégration browser (séquentiel)
── Gate 2 : /adversarial-review ──
```

## Note technique : Web Worker et Canvas

Les modules `deskew.ts` et `upscale.ts` tournent dans un Web Worker via `preprocessing.worker.ts`. Les Web Workers n'ont **pas accès au DOM** (`document.createElement("canvas")` n'existe pas). Deux options :

- **OffscreenCanvas** : disponible dans tous les navigateurs modernes (Chrome 69+, Firefox 105+, Safari 16.4+). Utiliser `new OffscreenCanvas(w, h)` au lieu de `document.createElement("canvas")`.
- **Pure pixel math** : interpolation bilinéaire/bicubique directe sur les `Uint8ClampedArray`. Plus portable, pas de dépendance browser.

**Choix pour cette roadmap :** utiliser la **pure pixel math** pour `deskew` (rotation par transformation affine + interpolation bilinéaire) et `upscale` (interpolation bilinéaire sur le buffer). Cela garantit la compatibilité avec le Web Worker ET happy-dom pour les tests unitaires.

## Gestion des tests existants

- **Tests Otsu** (`preprocessing.test.ts`, describe "Otsu binarization") : **conservés**. Le module `otsu.ts` reste dans le codebase comme utilitaire standalone — il n'est plus importé par `pipeline.ts`.
- **Test pipeline "produces a binary image"** : **remplacé** par un test "produces grayscale output (pixels ∈ [0,255], not only 0/255)".
- **Tests deskew** : les fixtures de test sont des `ImageBuffer` construits programmatiquement (lignes de pixels calculées par trigonométrie), **pas** via Canvas (happy-dom ne supporte pas Canvas 2D).

---

## Phase 0 — Assets tessdata_best

**Objectif :** Remplacer `tessdata_fast` par `tessdata_best` pour fra et eng.

**Étapes :**

1. Télécharger `fra.traineddata.gz` (best) depuis `https://cdn.jsdelivr.net/npm/@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz`
2. Télécharger `eng.traineddata.gz` (best) depuis `https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz`
3. Remplacer les fichiers dans `public/tesseract/lang/`
4. Vérifier le bundle total `public/` < 25 MB
5. Mettre à jour `scripts/verify-assets.ts` pour vérifier les nouveaux fichiers

**Test RED :**
```ts
// tests/unit/assets.test.ts
it("fra.traineddata.gz is tessdata_best (> 2 MB)", () => {
  // fs.statSync check on file size
});
it("eng.traineddata.gz is tessdata_best (> 2 MB)", () => {});
it("total public/ assets < 25 MB", () => {});
```

**Critères :** Les 3 tests passent. `bun run build` réussit.

**Dépendances :** Aucune.

---

## Phase 1 — Nouveaux modules preprocessing

**Objectif :** Créer `deskew.ts` et `upscale.ts`, deux modules indépendants.

**Parallélisation :** 2 agents Opus en parallèle (un par module).

**Contrainte technique :** Les deux modules opèrent sur `ImageBuffer` (pure pixel math). Pas de Canvas API (incompatible Web Worker + happy-dom).

### Agent 1 : `src/lib/preprocessing/deskew.ts`

**Tests RED** (`tests/unit/lib/deskew.test.ts`) :

Fixtures : construites programmatiquement en `ImageBuffer`. Pour une image avec des lignes horizontales inclinées à θ°, calculer les positions de pixels par `y = x * tan(θ)` et remplir les pixels correspondants en noir sur fond blanc.

```
- detectSkewAngle: image avec lignes horizontales inclinées à 3° → détecte ~3° (±0.5°)
- detectSkewAngle: image droite (lignes horizontales) → détecte ~0° (±0.5°)
- detectSkewAngle: image uniforme (blanche) → retourne 0°
- detectSkewAngle: plage de recherche [-15°, +15°] par pas de 0.1°
- deskew: angle > 0.5° → image tournée (dimensions changent), bords blancs
- deskew: angle < 0.5° → image inchangée (même référence)
- deskew: angle hors plage [-15°, +15°] → image inchangée
```

**Implémentation GREEN :**
```ts
export function detectSkewAngle(img: ImageBuffer): number
// Pour chaque angle candidat dans [-15, +15] par pas de 0.1° :
//   Calculer la projection horizontale (somme des pixels par ligne, après rotation virtuelle)
//   Variance de la projection = score
// Retourner l'angle qui maximise la variance
// Si variance max < seuil → retourner 0 (image uniforme)

export function deskew(img: ImageBuffer): ImageBuffer
// Si |angle| < 0.5° → retourne img (même référence)
// Sinon : rotation par transformation affine + interpolation bilinéaire
// Pixels hors-source → blanc (255, 255, 255, 255)
```

### Agent 2 : `src/lib/preprocessing/upscale.ts`

**Tests RED** (`tests/unit/lib/upscale.test.ts`) :
```
- computeUpscaleFactor: estimatedDPI=150 → factor=2.0
- computeUpscaleFactor: estimatedDPI=300 → factor=1.0 (pas d'upscale)
- computeUpscaleFactor: estimatedDPI=72 → factor=4.0 (clampé au max)
- computeUpscaleFactor: estimatedDPI=600 → factor=1.0 (clampé au min)
- upscale: factor > 1 → image agrandie (width*factor × height*factor)
- upscale: factor = 1 → image inchangée (même référence)
- upscale: vérifie que les pixels sont interpolés (pas de nearest-neighbor)
- estimateDPI: PDF naturalWidth=918, cssWidth=612 → DPI ≈ 108
- estimateDPI: image naturalWidth=800, cssWidth=800 → DPI = 96
```

**Implémentation GREEN :**
```ts
export function estimateDPI(naturalWidth: number, cssWidth: number, isPdf: boolean): number
// PDF: (naturalWidth / cssWidth) * 72
// Image: (naturalWidth / cssWidth) * 96

export function computeUpscaleFactor(estimatedDPI: number): number
// clamp(300 / estimatedDPI, 1.0, 4.0)

export function upscale(img: ImageBuffer, factor: number): ImageBuffer
// Si factor <= 1 → retourne img (même référence)
// Sinon : interpolation bilinéaire sur le buffer de pixels
// newW = round(width * factor), newH = round(height * factor)
// Pour chaque pixel destination, interpoler les 4 pixels source les plus proches
```

**Critères :** Tous les tests unitaires passent. Biome clean.

**Dépendances :** Aucune.

---

## Phase 2 — Pipeline v2

**Objectif :** Réécrire `pipeline.ts` avec le nouvel ordre, supprimer Otsu du pipeline, ajouter gestion d'erreur par étape, support d'annulation, CLAHE clipLimit=3.0.

**Séquentiel** — dépend de Phase 1 (deskew + upscale disponibles).

**Tests RED** (mise à jour de `tests/unit/lib/preprocessing.test.ts`) :
```
Pipeline v2 (remplace le describe "Pipeline complet" existant) :
- exécute les 5 étapes dans l'ordre : grayscale, deskew, upscale, CLAHE, median
- la sortie est en niveaux de gris (pas binaire : vérifie qu'au moins un pixel ∉ {0, 255})
- otsu.ts n'est PAS importé par pipeline.ts (grep du fichier source)
- CLAHE utilise clipLimit=3.0 (vérifie que la signature appelle clahe(img, 8, 8, 3.0))
- échec d'une étape → l'étape est sautée, pipeline continue avec l'image précédente, warning dans result
- timeout 10s → retourne image brute + warning
- image déjà binaire → upscale sauté, autres étapes exécutent
- image déjà grayscale → grayscale sauté
- annulation via AbortSignal → pipeline interrompu, retourne image brute

Tests existants conservés tels quels :
- describe "Grayscale" (2 tests)
- describe "Otsu binarization" (4 tests) — otsu.ts reste comme module standalone
- describe "Median filter 3×3" (3 tests)
- describe "CLAHE" (2 tests)
```

**Implémentation GREEN :**
```ts
// pipeline.ts v2
export type PipelineResult = {
  image: ImageBuffer;
  warnings: string[];  // liste des warnings (étapes sautées, etc.)
};

export function preprocessingPipeline(
  input: ImageBuffer,
  options?: {
    timeoutMs?: number;      // défaut: 10000
    signal?: AbortSignal;    // pour annulation utilisateur
    estimatedDPI?: number;   // pour upscale
  }
): PipelineResult

// Implémentation :
// const STEPS = [
//   { name: "grayscale", fn: (img) => isGrayscale(img) ? img : grayscale(img) },
//   { name: "deskew", fn: deskew },
//   { name: "upscale", fn: (img) => upscale(img, computeUpscaleFactor(estimatedDPI)) },
//   { name: "clahe", fn: (img) => clahe(img, 8, 8, 3.0) },
//   { name: "denoise", fn: medianFilter3x3 },
// ];
// Pour chaque étape :
//   if (signal?.aborted) return { image: dernièreImageValide, warnings }
//   if (elapsed > timeoutMs) return { image: input, warnings: [..., timeout] }
//   try { img = step.fn(img) } catch { warnings.push(step.name + " failed") }
```

**⚠️ Breaking change :** Le type de retour de `preprocessingPipeline` change de `{ image, warning?: string }` à `{ image, warnings: string[] }`. Les appelants (App.tsx, preprocessing.worker.ts) doivent être mis à jour en Phase 5.

**Critères :** Tests v1 pipeline remplacés. Tests existants des modules individuels non cassés. Le pipeline produit du grayscale, pas du binaire.

**Dépendances :** Phase 1.

---

## Phase 3 — OCR Engine v2

**Objectif :** Configurer Tesseract.js avec tessdata_best, PSM dynamique, fra+eng, setParameters.

**Parallélisable** avec Phase 2 (indépendant du pipeline preprocessing). **Dépend de Phase 0** (tessdata_best disponible).

**Tests RED** (mise à jour de `tests/browser/lib/ocr-engine.test.ts` + `tests/unit/components/LanguageSelector.test.tsx`) :
```
Nouveaux tests browser (ocr-engine.test.ts) :
- langue par défaut est "fra+eng" (vérifier la langue initiale)
- PSM 6 par défaut pour les zones (setParameters appelé avec tessedit_pageseg_mode="6")
- PSM 3 quand isGlobalOcr=true
- preserve_interword_spaces="1" configuré
- user_defined_dpi="300" configuré
- setLanguage("eng") → worker réinitialisé avec "eng+fra"
- setLanguage("fra") → worker réinitialisé avec "fra+eng"
- init failure → rejette avec erreur, initPromise nettoyé, getEngine() suivant retente
- recognize failure → retourne { text: "", confidence: 0 }
- changement de langue pendant OCR en cours → changement mis en file d'attente, OCR continue avec langue courante

Nouveaux tests unitaires (LanguageSelector.test.tsx — mise à jour) :
- seulement "Français" et "English" dans le sélecteur (pas deu/spa/ita)
- options deu/spa/ita n'existent pas dans le DOM

Tests existants à adapter :
- "recognizes black text" → inchangé (utilise fra+eng implicitement)
- "setLanguage eng" → utilise "eng+fra" au lieu de "eng"
```

**Implémentation GREEN :**
```ts
// ocr-engine.ts v2
const DEFAULT_LANG = "fra+eng";

function langCombo(lang: LanguageCode): string {
  return lang === "fra" ? "fra+eng" : "eng+fra";
}

export async function recognize(
  input: HTMLCanvasElement | string,  // canvas ou dataUrl
  isGlobalOcr = false
): Promise<RecognizeResult> {
  const worker = await getEngine();
  await worker.setParameters({
    tessedit_pageseg_mode: isGlobalOcr ? "3" : "6",
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });
  const result = await worker.recognize(input);
  return { text: result.data.text, confidence: result.data.confidence };
}

export async function setLanguage(lang: LanguageCode): Promise<void> {
  if (!instance) { pendingLang = lang; return; }
  await instance.reinitialize(langCombo(lang));
}
```

**Aussi :** Mettre à jour `LanguageSelector.tsx` pour n'avoir que fra et eng (supprimer deu/spa/ita).

**Critères :** Tests browser passent avec tessdata_best. PSM switching fonctionne.

**Dépendances :** Phase 0 (tessdata_best disponible).

---

## Phase 4 — Post-processing

**Objectif :** Implémenter le module de post-processing OCR (substitutions contextuelles, dictionnaire médical, normalisation d'unités).

**Parallélisable** avec Phases 2 et 3 (module indépendant, opère sur du texte).

**Tests RED** (`tests/unit/lib/post-processing.test.ts`) :
```
Substitutions contextuelles :
- "1O,5 g/L" → "10,5 g/L" (O→0 en contexte numérique)
- "10,5 g/L" → "10,5 g/L" (pas de faux positif)
- "l2,3" → "12,3" (l→1)
- "4S mg/dL" → "45 mg/dL" (S→5)
- "Cholestérol" → "Cholestérol" (pas de correction en contexte alpha)
- "1 2,5" → "12,5" (espace parasite supprimé)
- "CO" → "CO" (O pas en contexte numérique car C n'est pas un chiffre)
- "O2" → "02" (O en contexte numérique car adjacent à 2)
- "lO,S" → "10,5" (corrections multiples gauche-à-droite, single pass)

Normalisation d'unités (toutes les entrées de la spec) :
- "g/l" → "g/L"
- "G/L" → "g/L"
- "mg/dl" → "mg/dL"
- "mmol/l" → "mmol/L"
- "µmol/l" → "µmol/L"
- "mUI/l" → "mUI/L"
- "umol/L" → "µmol/L"
- "ul/mL" → "µL/mL"
- "12.5 g/L" → "12.5 g/L" (séparateur décimal non touché)

Dictionnaire médical :
- "Glycémle" → "Glycémie" (distance 1, mot >= 4 chars)
- "Glucose" → "Glucose" (distance > 2, pas dans le dictionnaire)
- "Glycxxxmie" → "Glycxxxmie" (distance > 2, pas de correction)
- "TPP" → "TPP" (mot < 4 chars, pas de correction par proximité)
- "glycemie" → "Glycémie" (insensible à la casse, accents restaurés)
- mot équidistant de 2 entrées → pas de correction
- dictionnaire contient les ~40 termes de la spec

Cas limites :
- texte vide → texte vide
- texte whitespace-only → retourné inchangé
- multi-lignes → chaque ligne indépendante, sauts de ligne préservés
- performance : < 50ms pour 500 lignes

Intégration :
- postProcess(ocrText) retourne le texte corrigé
```

**Implémentation GREEN :**
```ts
// src/lib/post-processing.ts
export function postProcess(text: string): string
// 1. Split par lignes (\n)
// 2. Pour chaque ligne :
//    a. Substitutions contextuelles (regex: /([0-9.,])O|O([0-9.,])/ etc.)
//    b. Suppression espaces parasites entre chiffres
//    c. Normalisation d'unités (table de regex remplacement)
//    d. Correction dictionnaire (Levenshtein, seuil 2, mots >= 4 chars)
// 3. Rejoin lignes
```

```ts
// src/lib/post-processing/medical-dictionary.ts
export const MEDICAL_TERMS: string[] = [
  "Glycémie", "Hémoglobine", "Créatinine", /* ~40 termes */
];

export function levenshtein(a: string, b: string): number
// DP standard avec early-exit si distance > maxDist

export function findClosestTerm(word: string, maxDist = 2): string | null
// Si word.length < 4 → exact match only
// Sinon → Levenshtein sur tous les termes, retourne le plus proche si distance <= maxDist
// Si deux termes à distance égale → retourne null (pas de correction)
```

**Critères :** Tous les tests passent. Performance < 50ms sur 500 lignes.

**Dépendances :** Aucune (module texte pur).

---

## Gate 1 — Adversarial Review

**Après Phases 0-4.** Lancer `/adversarial-review` sur :
- Le nouveau code preprocessing (deskew, upscale, pipeline v2)
- Le nouvel OCR engine v2
- Le post-processing
- Les tests associés

**Axes recommandés :** Spec compliance, code quality, test coverage.

**Critère :** 0 CRITICAL, 0 MAJOR.

---

## Phase 5 — Wiring App.tsx

**Objectif :** Intégrer pipeline v2, OCR engine v2 et post-processing dans l'application.

**Séquentiel** — dépend de Phases 2, 3, 4 et Gate 1.

**Tests RED** (`tests/unit/components/App.test.tsx` — mise à jour) :
```
- OCR avec zones → isGlobalOcr=false passé à l'engine (PSM 6)
- OCR global (pas de zones) → isGlobalOcr=true passé à l'engine (PSM 3)
- résultats OCR passent par postProcess() avant affichage
- changement de langue → setLanguage avec "fra+eng" ou "eng+fra" selon sélection
- sélecteur de langue : seulement Français et English (pas de deu/spa/ita)
- fermeture fichier → worker.terminate() appelé
- init failure → toast "Impossible d'initialiser le moteur OCR", bouton OCR reste actif
- le texte brut original n'est PAS stocké séparément (seul le texte post-traité est dans les résultats)
- changement de langue pendant OCR en cours → pas de crash, changement appliqué au prochain OCR
```

**Implémentation GREEN :**
```ts
// App.tsx modifications :
// 1. createEngineAdapter : passer isGlobalOcr au recognize()
// 2. handleOcrStart :
//    a. Calculer isGlobalOcr = snapshot.length === 0
//    b. Passer isGlobalOcr dans l'adapter
//    c. Après processZones : appliquer postProcess() sur chaque result.text
// 3. handleLanguageChange : mapper LanguageCode → langue combo via ocrEngine.setLanguage
// 4. handleClose + page unload : appeler ocrEngine.terminate()
// 5. Adapter preprocessing.worker.ts au nouveau type PipelineResult (warnings: string[])
// 6. Supprimer deu/spa/ita du LanguageSelector props
```

**Critères :** App fonctionne de bout en bout. Tous les tests passent.

**Dépendances :** Phases 2, 3, 4, Gate 1.

---

## Phase 6 — Tests d'intégration browser

**Objectif :** Vérifier le pipeline complet dans un vrai navigateur.

**Tests browser** (`tests/browser/integration/`) :
```
preprocessing-v2-integration.test.ts :
- Image avec texte incliné → deskew + OCR → texte reconnu
- Image basse résolution → upscale + OCR → texte reconnu
- Pipeline v2 complet (grayscale→deskew→upscale→CLAHE→median) → sortie grayscale (pas binaire)

ocr-v2-integration.test.ts :
- OCR avec fra+eng → reconnaît texte français et termes anglais (CRP, HDL)
- PSM 6 sur zone → résultat non vide
- PSM 3 sur document entier → résultat non vide

post-processing-integration.test.ts :
- OCR brut simulé avec erreurs typiques → postProcess → corrections vérifiées
- Performance : postProcess sur 500 lignes < 50ms
```

**Critères :** Tests browser passent. Build réussit. `bunx biome check` clean.

**Dépendances :** Phase 5.

---

## Gate 2 — Adversarial Review finale

**Après Phase 6.** Lancer `/adversarial-review` sur tout le code modifié.

**Axes recommandés :** End-to-end, performance/offline, sécurité.

**Critère :** 0 CRITICAL, 0 MAJOR. Build clean.

---

## Out of scope

- OpenCV.js
- AI upscaling (ESRGAN)
- Non-local means denoising
- Multi-pass OCR / voting
- Whitelists de caractères
- Validation des ranges physiologiques
- Structuration en tableau
- Langues autres que fra et eng
- Aperçu preprocessing (le pipeline est prêt mais le wiring UI est hors scope)
