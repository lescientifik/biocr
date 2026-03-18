---
description: Spécifications du pipeline de prétraitement d'image avant OCR.
---

# Prétraitement d'image

## Objectif

Améliorer la qualité de l'image avant de la passer à Tesseract pour maximiser la précision OCR. Les bilans biologiques scannés ont souvent un contraste faible, du bruit, ou des artefacts.

## Périmètre d'application

- Si des **zones sont sélectionnées** : le prétraitement s'applique uniquement sur le crop 300 DPI de chaque rectangle.
- Si **OCR global** (aucune zone) : le prétraitement s'applique sur chaque page individuellement (pas sur l'image complète empilée).

Le crop à 300 DPI est fait dans un canvas off-screen temporaire avant le prétraitement. Cela réduit considérablement la taille des données à traiter.

## Pipeline automatique

Le pipeline s'exécute séquentiellement dans un **Web Worker** dédié, sans intervention utilisateur :

1. **Niveaux de gris** — Conversion en grayscale si l'image est en couleur.
2. **Contraste adaptatif (CLAHE)** — Contrast Limited Adaptive Histogram Equalization. Améliore le contraste local, utile pour les scans inégalement éclairés. Grille 8×8, clip limit = 2.0.
3. **Binarisation Otsu** — Seuillage automatique pour obtenir une image noir/blanc. Otsu calcule le seuil optimal automatiquement.
4. **Débruitage** — Filtre médian 3×3 pour éliminer le bruit résiduel (poivre et sel) sans perdre les détails du texte.

## Exécution en Web Worker

Le pipeline de prétraitement tourne dans un **Web Worker** pour ne pas bloquer le thread principal :

- Les pixels (`ImageData`) sont transférés au worker via `postMessage` avec `Transferable` pour éviter la copie.
- Le worker renvoie les pixels traités de la même manière.
- Le thread principal reste réactif pendant le traitement.

## Implémentation

- Approche v1 : **TypeScript pur** côté client via `getImageData` / `putImageData`.
- Performance attendue : CLAHE sur une zone A6 à 300 DPI (~4 mégapixels) < 1s dans un Web Worker sur desktop moderne. Sur page complète (~8.7 MP), < 3s.
- OpenCV.js est **hors scope v1**. Si les benchmarks réels montrent des performances insuffisantes, il sera considéré en v2.

## Gestion d'erreurs du pipeline

| Cas                              | Comportement                                        |
| -------------------------------- | --------------------------------------------------- |
| Worker crash (OOM, erreur WASM)  | Le pipeline est ignoré, l'image brute est envoyée à l'OCR. Toast warning : "Le prétraitement a échoué, OCR lancé sur l'image brute." |
| Image déjà binaire (N&B pur)    | Les étapes grayscale et Otsu sont des no-op. CLAHE et médian s'exécutent normalement. |
| Timeout (> 10s pour une zone)    | Annuler le worker, utiliser l'image brute. Toast warning. |

## Prévisualisation

- Un bouton **toggle "Aperçu prétraitement"** (icône œil) dans la toolbar.
- **Scope de la prévisualisation** :
  - Si une zone est **sélectionnée** (cliquée en mode Draw) : affiche le crop prétraité de cette zone uniquement en overlay.
  - Si **aucune zone n'est sélectionnée** : affiche la page visible actuelle après prétraitement en overlay sur le conteneur document.
- Un label indique le scope : "Aperçu — Zone 3" ou "Aperçu — Page 1".
- La prévisualisation est **informative uniquement**, elle ne modifie pas le document affiché.
- Quand le toggle est désactivé, l'overlay disparaît.
