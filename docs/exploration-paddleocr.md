# Exploration : Remplacer Tesseract.js par PaddleOCR côté navigateur

**Date** : 2026-03-20
**Contexte** : BioOCR — app single-page, full client-side, CPU only, sans backend

---

## 1. État actuel (Tesseract.js v7)

| Élément | Détail |
|---------|--------|
| Moteur | Tesseract.js v7 (WASM + LSTM) |
| Assets totaux | ~10 MB (WASM 2.8 MB + loader 3.8 MB + worker 109 KB + fra 2.9 MB + eng 691 KB) |
| Langues | `fra+eng` combinées |
| Chargement | Lazy, singleton worker, assets dans `/public/tesseract/` |
| PSM | 3 (auto) pour global, 6 (bloc uniforme) pour zones |
| Preprocessing | Pipeline custom (grayscale → deskew → upscale 300dpi → CLAHE → median → Otsu) |
| Post-processing | Corrections médicales (substitutions contextuelles, normalisation unités, dictionnaire Levenshtein) |

### Forces de Tesseract.js dans notre contexte
- **Mature et stable** : API bien documentée, v7 récente
- **Léger** : ~10 MB total, footprint WASM raisonnable
- **PSM configurable** : distinction global/zone natif
- **Pas de dépendance onnxruntime** : un seul runtime WASM
- **Fonctionne** : pipeline rodé, résultats exploitables sur documents bio médicaux

### Faiblesses connues
- Précision dégradée sur images bruitées, texte manuscrit, layouts complexes
- ~85% accuracy sur inputs difficiles (vs ~92% PaddleOCR benchmarks publics)
- Pas de détection de texte intégrée (on fait notre propre layout detection avec OpenCV.js)

---

## 2. Options PaddleOCR côté navigateur

### Option A : `paddleocr.js` (X3ZvaWQ) — PP-OCRv5 + ONNX Runtime Web
- **GitHub** : https://github.com/X3ZvaWQ/paddleocr.js
- Runtime : `onnxruntime-web` (WASM backend CPU)
- Modèles : PP-OCRv5 mobile (det + rec en ONNX)
- Zero dependency (hors onnxruntime-web)
- TypeScript, API promise-based, Vite example disponible
- Dictionnaire customisable

### Option B : `@paddle-js-models/ocr` (officiel PaddlePaddle)
- Runtime : Paddle.js avec `paddlejs-backend-wasm`
- Modèles : PP-OCRv3 compressés pour JS
- Maintenu par Baidu
- Moins récent (v3 vs v5)

### Option C : `client-side-ocr` (npm)
- Wrapper haut niveau avec RapidOCR + PPU PaddleOCR
- Inclut OpenCV.js, support PDF, 100+ langues
- PWA/offline ready
- Plus opinionated, moins de contrôle

**Recommandation si on migre** : Option A (`paddleocr.js`) — le plus léger, le plus récent (v5), le plus flexible.

---

## 3. Analyse comparative sur nos contraintes

### 3.1 Taille des assets (contrainte : < 25 MB total app)

| | Tesseract.js | PaddleOCR.js (PP-OCRv5) |
|---|---|---|
| Engine/Runtime | ~6.7 MB (WASM + loader + worker) | ~8-15 MB (onnxruntime-web WASM) |
| Modèle détection | N/A (pas de det) | ~2.3 MB (v3) à **~84 MB (v5)** |
| Modèle reconnaissance | inclus dans traineddata | ~7.5 MB (latin) |
| Données langue | ~3.6 MB (fra+eng) | ~quelques KB (dictionnaire txt) |
| **Total estimé** | **~10 MB** | **~18-105 MB** |

**Problème majeur** : Le modèle de détection PP-OCRv5 pèse **~84 MB en ONNX**. Même le v3 (~2.3 MB det) + onnxruntime-web (~8-15 MB) dépasse déjà Tesseract. Avec v5, c'est rédhibitoire pour une app single-page < 25 MB.

> Note : des versions quantifiées (int8) pourraient réduire la taille, mais aucun modèle PP-OCRv5 mobile quantifié prêt à l'emploi n'est disponible pour le web à ce jour.

### 3.2 Performance CPU (contrainte : OCR zone A6 < 10s)

| | Tesseract.js | PaddleOCR via onnxruntime-web |
|---|---|---|
| Backend | WASM dédié Tesseract | onnxruntime-web WASM |
| SIMD | Oui (SIMD-LSTM) | Oui (SIMD128) |
| Multi-thread | Non (single worker) | Possible (SharedArrayBuffer) |
| Init | ~2-3s (WASM + traineddata) | ~3-5s (WASM compile + modèles) |
| Inference | Rapide sur texte simple | Plus lent en WASM CPU que natif |

**Analyse** : onnxruntime-web en WASM CPU est significativement plus lent que les inferences natives. Mozilla rapporte un facteur 2-10× entre WASM et natif. Les benchmarks PaddleOCR "rapide" sont sur GPU (CUDA/TensorRT). En WASM CPU pur, PaddleOCR risque d'être **plus lent** que Tesseract.js qui a un runtime WASM optimisé spécifiquement pour l'OCR.

Le pipeline PaddleOCR fait 3 passes : détection → classification → reconnaissance. Tesseract fait une seule passe. Sur CPU WASM, ces 3 inférences de modèles séquentielles ajoutent de la latence.

### 3.3 Précision

| | Tesseract.js | PaddleOCR |
|---|---|---|
| Texte imprimé clean | ~95% | ~95-97% |
| Texte bruité/complexe | ~85% | ~92% |
| Français médical | Bon (traineddata dédié) | À valider (latin générique) |
| Handwriting | Faible | Meilleur |
| Layout complexe | Nécessite preprocessing | Détection intégrée |

**Nuance importante** : Ces benchmarks viennent de PaddleOCR Python/C++ sur GPU. Les modèles "mobile" compressés pour JS auront une précision inférieure. Et notre post-processing médical (dictionnaire Levenshtein, normalisation unités) compense déjà beaucoup les erreurs Tesseract sur notre domaine spécifique.

### 3.4 Langues

- **Tesseract** : `fra.traineddata` dédié, excellent pour le français
- **PaddleOCR v5** : modèle "latin" générique couvrant 32 langues dont le français — pas de modèle français spécifique. Le modèle mobile v5 cible principalement chinois + anglais + japonais
- **PaddleOCR v3 multilingue** : modèles par groupe linguistique (latin), plus légers mais moins précis

### 3.5 Architecture / Intégration

| Aspect | Tesseract.js | PaddleOCR.js |
|---|---|---|
| API | Mature, bien typée | Jeune, basique |
| PSM/modes | Configurable (PSM 3, 6, etc.) | Pas d'équivalent direct |
| Confidence score | Natif (par mot, ligne, bloc) | Non disponible nativement |
| Bounding boxes | Natif (HOCR) | Détection = boxes, rec = texte |
| Progress callback | Natif (logger) | Non disponible |
| Web Worker | Intégré | À implémenter soi-même |

**Impact** : On perdrait les PSM modes, le score de confiance, le progress callback, et le Web Worker intégré. Il faudrait reimplémenter ces fonctionnalités.

---

## 4. Risques identifiés

| Risque | Sévérité | Détail |
|--------|----------|--------|
| **Taille assets PP-OCRv5** | 🔴 Critique | 84 MB pour le modèle de détection seul — incompatible avec notre contrainte < 25 MB |
| **Performance WASM CPU** | 🟠 Élevé | 3 inférences séquentielles via onnxruntime-web WASM, probablement plus lent que Tesseract |
| **Perte de fonctionnalités** | 🟠 Élevé | Pas de PSM, pas de confidence, pas de progress — redesign nécessaire |
| **Précision français médical** | 🟡 Moyen | Modèle latin générique, pas de traineddata français spécifique, à benchmarker |
| **Maturité écosystème JS** | 🟡 Moyen | paddleocr.js a peu de stars/usage, onnxruntime-web en browser est encore jeune |
| **Maintenance** | 🟡 Moyen | paddleocr.js est un projet individuel vs Tesseract.js (naptha, communauté large) |

---

## 5. Scénario hybride envisageable

Si on voulait quand même bénéficier de PaddleOCR, un compromis serait :
- **Garder Tesseract.js pour la reconnaissance** (léger, rapide, français dédié)
- **Utiliser PP-OCRv3 det (2.3 MB)** pour la détection de zones à la place d'OpenCV.js

Mais cela ajouterait onnxruntime-web (~10 MB) en dépendance supplémentaire pour un gain marginal sur la détection, qu'on gère déjà correctement avec OpenCV.js.

---

## 6. Conclusion et recommandation

### ❌ Ne pas remplacer Tesseract.js par PaddleOCR

**Justification** :

1. **Taille rédhibitoire** : PP-OCRv5 (le seul modèle avec un vrai gain de précision) pèse ~100 MB en assets. Même PP-OCRv3 + onnxruntime-web dépasse notre budget de 25 MB total.

2. **Performance CPU dégradée** : Les avantages de PaddleOCR se manifestent sur GPU. En WASM CPU, le pipeline 3-passes (det → cls → rec) via onnxruntime-web sera vraisemblablement plus lent que le runtime WASM optimisé de Tesseract.js.

3. **Régression fonctionnelle** : Perte du score de confiance, des PSM modes, du progress callback, du Web Worker intégré — tout ce qui est utilisé dans notre `ocr-engine.ts` et `ocr-coordinator.ts`.

4. **Gain de précision incertain** : Sur du texte imprimé français de documents biologiques (notre cas d'usage), Tesseract avec notre preprocessing + post-processing médical est déjà performant. Le gain théorique de PaddleOCR n'est pas garanti en pratique, surtout avec les modèles mobile/compressés.

5. **Risque projet** : Écosystème JS immature, peu de retours d'expérience en production, dépendance à un projet individuel.

### ✅ Actions recommandées à la place

- **Optimiser le preprocessing existant** si la précision est insuffisante sur certains documents
- **Enrichir le dictionnaire médical** pour couvrir plus de termes
- **Envisager un benchmark** Tesseract.js vs PaddleOCR sur un échantillon de documents réels si le doute persiste — mais uniquement comme validation, pas comme pré-requis de migration
- **Surveiller l'écosystème** : si un modèle PP-OCRv5 quantifié < 10 MB apparaît avec un runtime WASM mature, réévaluer

---

## Sources

- [PaddleOCR GitHub](https://github.com/PaddlePaddle/PaddleOCR)
- [paddleocr.js (X3ZvaWQ)](https://github.com/X3ZvaWQ/paddleocr.js/)
- [paddleocr-browser (xulihang)](https://github.com/xulihang/paddleocr-browser)
- [Paddle.js (officiel)](https://github.com/PaddlePaddle/Paddle.js/)
- [client-side-ocr npm](https://libraries.io/npm/client-side-ocr)
- [PP-OCRv5 mobile det — HuggingFace](https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det)
- [PP-OCRv5 mobile rec — HuggingFace](https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_rec)
- [monkt/paddleocr-onnx — HuggingFace](https://huggingface.co/monkt/paddleocr-onnx)
- [PaddleOCR vs Tesseract — Koncile](https://www.koncile.ai/en/ressources/paddleocr-analyse-avantages-alternatives-open-source)
- [PaddleOCR vs Tesseract 2025 — CodeSOTA](https://www.codesota.com/ocr/paddleocr-vs-tesseract)
- [ONNX Runtime Web — Performance](https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html)
- [Firefox AI Runtime — Mozilla](https://blog.mozilla.org/en/firefox/firefox-ai/speeding-up-firefox-local-ai-runtime/)
- [@paddle-js-models/ocr — npm](https://www.npmjs.com/package/@paddle-js-models/ocr)
