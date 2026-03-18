---
description: Spécifications du layout UI — zones, toolbar, panneau latéral, états, accessibilité basique.
---

# Layout UI

## Structure générale

L'interface est divisée en 3 zones principales :

```
┌──────────────────────────────────────────────────────┐
│                     Toolbar                          │
├──────────────────────────────────┬───────────────────┤
│                                  │                   │
│                                  │   Panneau         │
│      Viewer Document             │   Résultats       │
│      (pages + overlay Fabric)    │   (onglets)       │
│                                  │                   │
│                                  │                   │
└──────────────────────────────────┴───────────────────┘
```

## État vide (aucun fichier chargé)

- Le viewer est remplacé par une **grande zone de drag & drop** centrée.
- Icône upload, texte "Déposez un PDF ou une image ici".
- Lien "ou cliquez pour parcourir" qui ouvre un `<input type="file">`.
- Le panneau résultats est masqué.

## Toolbar

Barre horizontale en haut. Les contrôles sont **groupés visuellement** par séparateurs :

```
[Fichier.pdf ✕] | [🖐 Pan / ▭ Draw] [Effacer zones] | [👁 Prétraitement] [Langue ▾] | [Lancer l'OCR] | [150% ↺]
```

| Groupe      | Élément                        | Type               | Condition d'affichage     |
| ----------- | ------------------------------ | ------------------ | ------------------------- |
| Fichier     | Nom du fichier + bouton ✕      | Texte + bouton     | Fichier chargé            |
| Zones       | Toggle Draw / Pan              | Segmented control  | Fichier chargé            |
|             | Effacer toutes les zones       | Bouton             | ≥ 1 zone tracée           |
| Traitement  | Aperçu prétraitement (œil)     | Toggle bouton      | Fichier chargé            |
|             | Sélecteur de langue            | Dropdown           | Fichier chargé            |
| OCR         | Lancer l'OCR                   | Bouton primaire    | Fichier chargé            |
| Navigation  | Zoom indicator + reset         | Texte + bouton     | Fichier chargé            |

- Le bouton OCR affiche un label dynamique : "OCR document" (sans zones) ou "OCR (N zones)" (avec zones).
- Sur écrans étroits (< 768px) : les groupes secondaires (Traitement, Navigation) se replient dans un menu overflow (⋯).

## Panneau latéral (résultats)

- Apparaît à **droite** du viewer après le premier OCR.
- **Redimensionnable** horizontalement (drag sur la bordure gauche du panneau).
  - Largeur min : **200px**.
  - Largeur max : **60%** de la fenêtre.
  - Largeur par défaut : **30%** de la fenêtre.

### Barre de progression

- Affichée en haut du panneau résultats sous forme de **barre fine** avec pourcentage et étape.
- Bouton "Annuler" à droite de la barre.
- Le panneau et le viewer restent interactifs.

### Onglets

- Un onglet par zone OCR (label : "Zone N") ou un onglet "Document" pour l'OCR global.
- Les numéros de zones sont **stables** (cf. spec 03) : si Zone 2 a été supprimée, les onglets affichent "Zone 1", "Zone 3".
- Chaque onglet contient :
  - Le texte OCR dans un `<pre>` sélectionnable avec police monospace.
  - Un badge de confiance si la confiance est faible (< 40%).
  - Un bouton **"Copier"** avec feedback "Copié !" pendant 2 secondes.
  - Si résultat vide : message d'aide (cf. spec 05, gestion d'erreurs).
- En haut du panneau : bouton **"Tout copier"** (concatène tous les onglets, séparés par `\n--- Zone N ---\n`).

## Responsive

- **Desktop-first**. L'app est conçue pour un usage desktop/laptop.
- Sur écran étroit (< 768px) :
  - Le panneau résultats passe **en dessous** du viewer (layout vertical).
  - La toolbar regroupe les contrôles secondaires dans un menu overflow.

## Accessibilité (v1 — basique)

- Toolbar entièrement navigable au **clavier** avec `Tab` et focus visible.
- Raccourcis clavier documentés (cf. spec 03) et accessibles via tooltip (icône `?` dans la toolbar).
- Boutons avec `aria-label` descriptifs.
- Barre de progression avec `role="progressbar"` et `aria-valuenow`.
- Feedback "Copié !" annoncé via `aria-live="polite"`.
- Canvas Fabric.js : `role="application"` avec `aria-label="Zone de sélection OCR"`.
- **Hors scope v1** : navigation clavier des zones sur le canvas, support screen reader complet pour les interactions canvas.

## Système de toasts

- Librairie : **Sonner** (intégrée nativement dans shadcn/ui).
- Position : **bas-droite** de l'écran.
- Empilage : max **3 toasts visibles** simultanément, les plus anciens disparaissent.
- Auto-dismiss : **5 secondes** par défaut (sauf pour les erreurs qui restent jusqu'à fermeture manuelle).
- Types utilisés :
  - `success` : feedback positif ("Copié !").
  - `warning` : alertes non bloquantes (prétraitement échoué, PDF volumineux).
  - `error` : erreurs (fichier invalide, OCR échoué).
  - `info` : messages informatifs (coach-mark, langue non disponible).

## Coach-mark (première utilisation)

- Au premier chargement de fichier, un toast informatif s'affiche pendant 5 secondes : "Passez en mode Draw (D) pour sélectionner des zones, ou cliquez 'Lancer l'OCR' pour traiter tout le document."
- Affiché une seule fois par session (pas de persistance, donc réapparaît à chaque visite).
