---
description: Spécifications du moteur OCR — Tesseract.js, langues, progression, résultats, erreurs.
---

# Moteur OCR

## Tesseract.js

- Version : **Tesseract.js v5+** (build SIMD-LSTM).
- Exécution : **Web Worker** natif de Tesseract.js pour ne pas bloquer le thread principal.
- Configuration : `cacheMethod: 'none'` (les fichiers sont déjà locaux, pas besoin de cache IndexedDB).
- Les fichiers WASM et le modèle de langue français sont dans `public/tesseract/` (cf. spec 01).

## Langues

- **Français (`fra`)** : modèle `fra.traineddata` (version fast) bundlé dans `public/tesseract/lang/`. Disponible immédiatement offline.
- **Sélecteur de langue** : dropdown dans la toolbar. Français sélectionné par défaut.
- Langues supplémentaires : le dropdown propose les langues courantes (eng, deu, spa, ita). Ces langues sont **uniquement disponibles si l'utilisateur est en ligne** pour le premier téléchargement. Le modèle téléchargé est gardé **en mémoire** pour la durée de la session (pas de persistance IndexedDB, cohérent avec le principe "jetable"). Si la langue n'est pas disponible et qu'il n'y a pas de réseau, le dropdown affiche un état désactivé avec tooltip "Téléchargement requis — connexion internet nécessaire".

## Déclenchement

Un **bouton unique "Lancer l'OCR"** dans la toolbar avec **comportement intelligent** :

- **Si des zones sont tracées** : OCR sur chaque zone sélectionnée. Le label du bouton indique "OCR (N zones)".
- **Si aucune zone** : OCR sur le document entier (toutes les pages). Le label indique "OCR document".

Le bouton est **désactivé** pendant un OCR en cours.

### Pipeline par zone

Les zones sont traitées **séquentiellement** (une à la fois) pour limiter l'usage mémoire. Un seul canvas off-screen 300 DPI existe à la fois :

1. **Snapshot** des coordonnées de la zone au lancement (cf. spec 07 pour le mapping coordonnées).
2. Re-rendu de la zone/page à **300 DPI** dans un canvas off-screen temporaire.
3. **Prétraitement** dans un Web Worker (cf. spec 04). L'`ImageData` est transféré via `Transferable` (zero-copy).
4. **OCR Tesseract** dans le worker Tesseract.js.
5. Résultat affiché dans le panneau latéral.
6. Le canvas off-screen est détruit avant de passer à la zone suivante.

### Coexistence des résultats

- Lancer un nouvel OCR **remplace** les résultats précédents (les onglets précédents sont supprimés).
- Si l'utilisateur veut conserver un résultat, il doit le copier avant de relancer.

## Barre de progression

- Utilise le **progress callback** natif de Tesseract.js.
- Affichée sous forme de **barre fine en haut du panneau résultats** (non bloquante, le canvas reste interactif).
- Informations affichées :
  - Pourcentage global.
  - Étape en cours (initialisation, reconnaissance...).
  - Si multi-zones : "Zone 2/5 — 45%".
- Bouton **Annuler** à côté de la barre pour interrompre l'OCR (`worker.terminate()` + recréation du worker).
- Le canvas reste **entièrement interactif** pendant l'OCR (pan, zoom, ajout de zones pour un prochain run).

## Sortie

- Texte brut (`data.text`) de Tesseract.
- Affiché dans le panneau latéral (cf. spec 06).
- Bouton **"Copier"** par zone + bouton **"Tout copier"** qui concatène toutes les zones.
- Copie via `navigator.clipboard.writeText()`. Fallback `document.execCommand('copy')` si l'API clipboard n'est pas disponible (contexte non-HTTPS).
- Feedback "Copié !" affiché **2 secondes** puis retour à "Copier".

## Gestion d'erreurs

| Cas                                    | Comportement                                                              |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Worker crash / WASM trap               | Toast : "L'OCR a échoué. Réessayez ou tentez une zone plus petite." Le worker est recréé automatiquement. |
| Résultat vide (aucun texte détecté)    | L'onglet de la zone affiche : "Aucun texte détecté. Vérifiez que la zone couvre du texte lisible et essayez l'aperçu prétraitement." |
| Confiance faible (< 40% en moyenne)    | Badge warning sur l'onglet : "⚠ Fiabilité faible". Tooltip : "Vérifiez la langue OCR et la qualité du scan." |
| Annulation par l'utilisateur           | Résultats partiels ignorés. Toast : "OCR annulé." |
| Clipboard API indisponible             | Fallback `execCommand('copy')`. Si aussi indisponible : sélection automatique du texte + toast "Utilisez Ctrl+C pour copier." |
