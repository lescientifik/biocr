---
description: Pipeline de preprocessing v2 avec deskew, upscaling intelligent, binarisation Sauvola déléguée à Tesseract, et tessdata_best.
---

# Preprocessing v2 — Pipeline image amélioré

## Contexte

Le pipeline v1 (grayscale → CLAHE → Otsu → median) est fonctionnel mais insuffisant pour les documents scannés de qualité variable (éclairage inégal, inclinaison, basse résolution). Cette spec définit le pipeline v2 optimisé.

## Changements principaux vs v1

- Otsu remplacé par la binarisation Sauvola **interne de Tesseract** (pas de binarisation JS côté pipeline)
- Ajout du deskewing automatique par profil de projection
- Upscaling intelligent à 300 DPI minimum
- CLAHE conservé (paramètres affinés : clip limit 3.0)
- Median filter conservé

---

## Feature: Pipeline de preprocessing v2

### Scenario: Pipeline séquentiel sur une zone sélectionnée

```gherkin
Given un crop de zone à résolution quelconque
When le pipeline de preprocessing est exécuté
Then les étapes suivantes sont appliquées dans l'ordre :
  | Étape          | Module                    |
  | Grayscale      | grayscale.ts              |
  | Deskew         | deskew.ts                 |
  | Upscale 300DPI | upscale.ts                |
  | CLAHE          | clahe.ts (clipLimit=3.0)  |
  | Denoise        | median.ts (3×3)           |
And l'image résultante est envoyée à Tesseract SANS binarisation préalable
And Tesseract applique sa propre binarisation Sauvola interne
```

### Scenario: Le grayscale est sauté si l'image est déjà en niveaux de gris

```gherkin
Given une image dont tous les pixels ont R === G === B
When le pipeline est exécuté
Then l'étape grayscale est un no-op (pas de recalcul)
And les étapes suivantes s'exécutent normalement
```

### Scenario: Timeout du pipeline

```gherkin
Given une image très grande (> 20 mégapixels)
When le temps d'exécution du pipeline dépasse 10 secondes
Then le pipeline est interrompu
And l'image brute (non prétraitée) est envoyée à Tesseract
And un warning toast s'affiche : "Le prétraitement a pris trop de temps. Image brute utilisée."
```

### Scenario: Échec d'une étape individuelle du pipeline

```gherkin
Given un crop de zone en cours de preprocessing
When une étape du pipeline échoue (ex : deskew lève une exception)
Then cette étape est sautée
And le pipeline continue avec l'image de sortie de l'étape précédente
And un warning toast s'affiche : "L'étape {nom} a échoué. Étape ignorée."
```

### Scenario: Annulation du pipeline par l'utilisateur

```gherkin
Given un pipeline de preprocessing en cours d'exécution
When l'utilisateur supprime la zone ou ferme le fichier
Then le pipeline est interrompu immédiatement
And le résultat partiel est ignoré (non envoyé à Tesseract)
```

### Scenario: Image déjà binaire en entrée

```gherkin
Given un crop de zone dont tous les pixels sont soit 0 soit 255
When le pipeline de preprocessing est exécuté
Then le CLAHE et le median filter s'exécutent normalement
And le deskew s'exécute normalement
And l'upscaling n'est PAS appliqué (l'image est considérée comme déjà à résolution suffisante)
```

---

## Feature: Deskewing automatique

### Scenario: Correction d'une inclinaison détectée > 0.5°

```gherkin
Given une image de document scanné avec une inclinaison de 2.3°
When le deskew est exécuté
Then l'angle d'inclinaison est détecté par profil de projection horizontal
And l'image est tournée de -2.3° pour la redresser
And les bords créés par la rotation sont remplis en blanc
```

### Scenario: Pas de correction si l'inclinaison est < 0.5°

```gherkin
Given une image de document avec une inclinaison de 0.2°
When le deskew est exécuté
Then l'image est retournée inchangée (pas de rotation)
```

### Scenario: Détection d'angle sur une plage de -15° à +15°

```gherkin
Given une image scannée avec une inclinaison quelconque
When le deskew analyse l'image
Then les angles testés couvrent la plage [-15°, +15°] par pas de 0.1°
And l'angle retenu est celui qui maximise la variance des projections horizontales
```

### Scenario: Inclinaison détectée en dehors de la plage [-15°, +15°]

```gherkin
Given une image scannée avec une inclinaison de 25°
When le deskew analyse l'image
Then aucun angle dans la plage [-15°, +15°] ne produit un score significatif
And l'image est retournée inchangée (pas de rotation)
```

### Scenario: Deskew sur un crop vide ou uniforme

```gherkin
Given un crop de zone dont la variance des pixels est proche de zéro (image blanche, noire ou uniforme)
When le deskew est exécuté
Then l'image est retournée inchangée (no-op)
And aucune rotation n'est appliquée
```

### Scenario: Le deskew est silencieux (pas d'UI)

```gherkin
Given un fichier chargé dans le viewer
When l'OCR est lancé
Then le deskew est appliqué automatiquement sur le crop OCR
And le document affiché dans le viewer n'est PAS modifié
And aucun indicateur de deskew n'apparaît dans l'interface
```

---

## Feature: Upscaling intelligent à 300 DPI

### Scenario: Image basse résolution upscalée

```gherkin
Given un crop de zone à faible résolution estimée (estimatedDPI < 300)
When l'upscaling est exécuté
Then le facteur d'upscale est calculé par : factor = clamp(300 / estimatedDPI, 1.0, 4.0)
And l'interpolation utilisée est bicubique (Canvas imageSmoothingQuality = "high")
```

### Scenario: Image haute résolution non upscalée

```gherkin
Given un crop de zone avec estimatedDPI >= 300
When l'upscaling est exécuté
Then le facteur calculé est clamp(300 / estimatedDPI, 1.0, 4.0) = 1.0
And l'image est retournée inchangée (pas d'upscaling)
```

### Scenario: Estimation de la résolution

```gherkin
Given un crop de zone de dimensions W×H pixels
When l'upscaling estime la résolution
Then pour un PDF : estimatedDPI = (naturalWidth / cssWidth) * 72
And pour une image : estimatedDPI = (naturalWidth / cssWidth) * 96
And le facteur d'upscale est : clamp(300 / estimatedDPI, 1.0, 4.0)
```

---

## Feature: CLAHE v2 (paramètres affinés)

### Scenario: CLAHE avec clip limit augmenté pour documents scannés

```gherkin
Given une image en niveaux de gris avec un contraste faible
When le CLAHE est exécuté
Then les paramètres utilisés sont : gridX=8, gridY=8, clipLimit=3.0
And toutes les valeurs de pixels en sortie sont dans [0, 255]
And l'écart-type des pixels en sortie est supérieur à l'écart-type des pixels en entrée pour les images à faible contraste
```

### Scenario: CLAHE sur une image très petite

```gherkin
Given une image de dimensions < 8×8 pixels
When le CLAHE est exécuté
Then l'image est retournée inchangée
```

---

## Feature: Pas de binarisation dans le pipeline JS

### Scenario: L'image envoyée à Tesseract est en niveaux de gris (non binaire)

```gherkin
Given un crop prétraité par le pipeline v2
When l'image est passée à Tesseract
Then l'image est en niveaux de gris (valeurs 0-255), pas en noir et blanc
And Tesseract applique sa propre binarisation adaptative (Sauvola) en interne
```

### Scenario: L'étape Otsu est supprimée du pipeline

```gherkin
Given le pipeline v2
When on liste les étapes du pipeline
Then la binarisation Otsu n'apparaît pas
And le module otsu.ts n'est plus importé par pipeline.ts
```

---

## Feature: Aperçu du preprocessing v2

### Scenario: L'aperçu montre l'image après le pipeline complet

```gherkin
Given un fichier chargé et le toggle "Aperçu prétraitement" activé
And une zone est sélectionnée en mode Draw
When l'aperçu est affiché
Then l'image montrée est le résultat du pipeline v2 complet (grayscale + deskew + upscale + CLAHE + denoise)
And l'aperçu est en niveaux de gris (pas binaire, puisque pas de binarisation dans le pipeline)
And un label indique "Aperçu — Zone N"
```

### Scenario: L'aperçu sans zone sélectionnée montre la page visible

```gherkin
Given un fichier chargé et le toggle "Aperçu prétraitement" activé
And aucune zone n'est sélectionnée
When l'aperçu est affiché
Then l'image montrée est la page la plus visible après preprocessing
And un label indique "Aperçu — Page N"
```

---

## Contraintes non-fonctionnelles

### @performance Scenario: Pipeline v2 sur une zone A6 à 300 DPI

```gherkin
Given un crop de zone de ~1240×1748 pixels (~2 mégapixels)
When le pipeline v2 complet est exécuté
Then le temps total est < 2 secondes (tolérance de test : 5 secondes en CI)
```

### @performance Scenario: Pipeline v2 sur une page entière

```gherkin
Given une image de page de ~2480×3508 pixels (~8.7 mégapixels)
When le pipeline v2 complet est exécuté
Then le temps total est < 5 secondes (tolérance de test : 10 secondes en CI)
```

---

## Out of scope

- OpenCV.js (trop lourd pour le browser)
- AI upscaling (ESRGAN, trop lent en WASM)
- Non-local means denoising (O(n²), trop lent en JS)
- Détection de layout multi-colonnes
- Deskewing visible dans l'UI (le document affiché n'est jamais modifié)
