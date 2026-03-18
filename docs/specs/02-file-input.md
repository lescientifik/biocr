---
description: Spécifications de l'import de fichier — drag & drop, formats supportés, conversion PDF.
---

# Import de fichier

## Drag & Drop

- Zone de drop occupant la **majorité de l'écran** au lancement (état vide).
- Accepte un **seul fichier** à la fois. Si plusieurs fichiers sont déposés, seul le premier est utilisé et un toast informe l'utilisateur ("Un seul fichier à la fois").
- **Remplacement** : si un fichier est déjà chargé et que des zones ou résultats OCR existent, une confirmation est demandée : "Charger un nouveau fichier effacera les zones et résultats actuels. Continuer ?" Si aucune zone ni résultat, remplacement direct sans confirmation.
- Feedback visuel au survol : bordure en pointillés bleue, fond légèrement teinté, icône upload animée.
- **Fallback clic** : un lien "ou cliquez pour parcourir" ouvre un `<input type="file" accept=".png,.jpg,.jpeg,.webp,.bmp,.pdf">`. Ce fallback est disponible à la fois dans l'état vide et via un bouton discret dans la toolbar après chargement.

## Formats acceptés

| Format | Extensions              | Notes                              |
| ------ | ----------------------- | ---------------------------------- |
| Image  | .png, .jpg, .jpeg, .webp, .bmp | Support natif navigateur      |
| PDF    | .pdf                    | Rendu via pdf.js                   |

- **TIFF** : exclu du scope v1 (pas de support natif navigateur, nécessiterait une lib supplémentaire).
- Rejet avec message d'erreur clair pour les formats non supportés : "Format non supporté. Déposez un fichier PDF, PNG, JPG, WEBP ou BMP."

## Conversion PDF → Image

- Librairie : **pdf.js** (pdfjs-dist v4.x).
- **Affichage** : chaque page est rendue à la **résolution écran** (72-150 DPI selon le viewport) via `page.render()` dans un canvas temporaire, puis convertie en `<img>` pour l'affichage.
- **OCR** : au moment de l'OCR, la page (ou zone) concernée est re-rendue à **300 DPI** (`scale = 300 / 72 ≈ 4.17`) dans un canvas off-screen temporaire dédié à l'extraction.
- **Toutes les pages** sont rendues à la résolution écran et empilées verticalement dans le conteneur scrollable.
- Chaque page est un `<img>` indépendant avec un gap de **16px** entre elles (à 100% zoom, scale proportionnellement).

## Erreurs

| Cas                          | Comportement                                                |
| ---------------------------- | ----------------------------------------------------------- |
| Format non supporté          | Toast d'erreur, fichier ignoré                              |
| PDF protégé par mot de passe | Toast : "Ce PDF est protégé par mot de passe et ne peut pas être ouvert." |
| PDF corrompu / illisible     | Toast : "Impossible de lire ce fichier PDF."                |
| Image corrompue              | Toast : "Impossible de charger cette image."                |
| Fichier vide (0 octets)      | Toast : "Le fichier est vide."                              |
| PDF > 20 pages               | Warning (non bloquant) : "Ce document fait N pages, le traitement peut être lent." L'utilisateur peut continuer. |

## Limites

- Pas de limite stricte de taille fichier, mais warning au-delà de 20 pages PDF.
- L'estimation mémoire pour l'affichage est ~4 MB par page à résolution écran (bien inférieur aux ~35 MB/page à 300 DPI).
