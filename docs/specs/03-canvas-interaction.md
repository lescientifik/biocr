---
description: Spécifications du viewer document et canvas interactif — affichage, zoom/pan, sélection de zones.
---

# Viewer document & canvas interactif

## Architecture d'affichage (deux couches)

L'affichage est composé de deux couches superposées :

1. **Couche document** : un `<div>` scrollable contenant des `<img>` (une par page PDF ou l'image unique). Scroll natif du navigateur. Pas de Fabric.js ici.
2. **Couche interaction** : un canvas **Fabric.js transparent** en overlay absolu par-dessus la couche document, de mêmes dimensions. Utilisé uniquement pour dessiner et manipuler les rectangles de sélection.

Les deux couches sont synchronisées via une **CSS `transform` partagée** sur un conteneur parent commun. Voir **spec 07** pour l'architecture DOM détaillée, les formules de zoom/pan, et le mapping des coordonnées.

## Affichage du document

- Pour un PDF multi-pages, les pages sont empilées **verticalement** avec un gap de **16px** entre elles (à zoom 100%, scale proportionnellement).
- Au chargement, le document est affiché en **fit-to-width** (adapté à la largeur du conteneur).
- Pas de navigation page par page : scroll vertical uniquement (limitation acceptée en v1).

## Zoom & Pan

- **Zoom** : molette de souris (centré sur la position du curseur) + raccourcis `Ctrl +` / `Ctrl -`.
- **Pan** : clic-drag en mode Pan, ou scroll natif.
- Limites de zoom : **x0.25** (dézoom max) → **x5** (zoom max).
- Indicateur de niveau de zoom affiché dans la toolbar (ex: "150%").
- Bouton **"Reset zoom"** pour revenir au fit-to-width.

## Modes d'interaction

Deux modes mutuellement exclusifs, contrôlés par un **contrôle segmenté** (segmented control) dans la toolbar, avec icônes + labels :

### Mode Pan (défaut au chargement)

- Icône : main (hand).
- Curseur : `grab` / `grabbing`.
- Clic-drag : déplace le viewport.
- Molette : zoom.
- Les rectangles existants sont visibles mais **non interactifs**.

### Mode Draw

- Icône : rectangle en pointillés.
- Curseur : `crosshair`.
- Clic-drag sur une zone vide : trace un nouveau rectangle.
- Clic sur un rectangle existant : le sélectionne (poignées de redimensionnement apparaissent).
- Molette : zoom (fonctionne dans les deux modes).
- Raccourci clavier pour toggle : touche `D` (Draw) / `V` (Pan), affiché en tooltip.

### Indication visuelle du mode actif

- Le segment actif du contrôle segmenté est en surbrillance (fond de couleur primaire).
- En mode Draw, une bordure bleue subtile apparaît autour du canvas.
- Un coach-mark s'affiche au premier chargement de fichier : "Passez en mode Draw pour sélectionner des zones OCR, ou cliquez 'Lancer l'OCR' pour traiter le document entier."

## Rectangles de sélection (zones)

- Style : bordure `#3b82f6` (2px solid) avec fond `rgba(59, 130, 246, 0.1)`.
- Chaque rectangle a un **numéro stable** affiché dans un badge en coin supérieur gauche (Zone 1, Zone 2...).
- **Numérotation stable** : les numéros ne changent pas quand une zone est supprimée. Si l'utilisateur crée les zones 1, 2, 3 puis supprime la 2, il reste Zone 1 et Zone 3. Le prochain rectangle créé sera Zone 4.
- **Déplaçable** : clic-drag sur le rectangle (mode Draw).
- **Redimensionnable** : poignées aux 4 coins et 4 côtés (mode Draw).
- **Supprimable** : touche `Suppr`/`Delete` quand le rectangle est sélectionné, ou bouton ✕ au survol du badge.
- Pas de limite au nombre de rectangles.
- Un bouton **"Effacer toutes les zones"** dans la toolbar (visible si ≥ 1 zone).

## Raccourcis clavier

| Raccourci      | Action                        |
| -------------- | ----------------------------- |
| `D`            | Activer mode Draw             |
| `V`            | Activer mode Pan              |
| `Suppr`        | Supprimer la zone sélectionnée |
| `Ctrl +`       | Zoom in                       |
| `Ctrl -`       | Zoom out                      |
| `Ctrl 0`       | Reset zoom (fit-to-width)     |
| `Échap`        | Désélectionner la zone active |
