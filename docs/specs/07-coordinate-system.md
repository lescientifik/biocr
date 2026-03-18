---
description: Système de coordonnées, synchronisation des couches, mapping zone → page → crop 300 DPI.
---

# Système de coordonnées & synchronisation

## Espaces de coordonnées

L'application manipule 4 espaces de coordonnées :

| Espace              | Origine                  | Unité   | Utilisé par           |
| ------------------- | ------------------------ | ------- | --------------------- |
| **Viewport**        | Coin supérieur gauche de la fenêtre | px CSS  | Événements navigateur |
| **Document**        | Coin supérieur gauche de la première page | px CSS (à zoom 100%) | Conteneur scrollable, positions des pages |
| **Page**            | Coin supérieur gauche d'une page donnée | px CSS (à zoom 100%) | Assignation zone → page |
| **OCR (300 DPI)**   | Coin supérieur gauche de la page source | px bitmap 300 DPI | Canvas off-screen pour OCR |

## Architecture de synchronisation

### Structure DOM

```
<div id="workspace">                    ← conteneur flex, overflow: hidden
  <div id="viewport" style="transform: scale(Z) translate(tx, ty); transform-origin: 0 0;">
    <div id="pages-container">          ← contient les <img> des pages
      <img id="page-0" />              ← hauteur naturelle = h₀
      <div class="page-gap" />          ← 16px
      <img id="page-1" />
      ...
    </div>
    <canvas id="fabric-overlay" />      ← même dimensions que pages-container
  </div>
</div>
```

### Source de vérité : un seul état de zoom/pan

L'état de zoom et pan est géré par un **unique state React** :

```ts
type ViewportState = {
  zoom: number;    // 0.25 à 5.0, défaut calculé pour fit-to-width
  panX: number;    // translation X en px document (à zoom 100%)
  panY: number;    // translation Y en px document (à zoom 100%)
};
```

- Le zoom et le pan sont appliqués via une **CSS `transform`** sur `#viewport` : `transform: scale(${zoom}) translate(${panX}px, ${panY}px)`.
- Les `<img>` des pages **et** le canvas Fabric.js sont tous deux enfants de `#viewport`, donc ils bougent et scalent ensemble automatiquement. **Pas besoin de synchronisation manuelle.**
- Le canvas Fabric.js a `width` et `height` égaux aux dimensions totales du `#pages-container` (à zoom 100%). Il est positionné en absolu à `top: 0; left: 0` dans le viewport.
- Fabric.js est configuré avec `viewportTransform` à l'identité (pas de zoom/pan Fabric interne). Tout le zoom/pan est géré par la CSS transform du parent.

### Zoom centré sur le curseur (style Figma)

Quand l'utilisateur zoome avec la molette au point `(cx, cy)` dans le viewport :

```
newZoom = clamp(oldZoom * (1 + deltaY * 0.001), 0.25, 5.0)
// Le point sous le curseur doit rester fixe :
newPanX = cx / newZoom - (cx / oldZoom - oldPanX)
newPanY = cy / newZoom - (cy / oldZoom - oldPanY)
```

### Pan (mode Pan)

En mode Pan, le `mousedown` + `mousemove` ajuste `panX` / `panY` :

```
panX += deltaMouseX / zoom
panY += deltaMouseY / zoom
```

## Assignation zone → page

### Layout des pages

Les pages sont empilées verticalement. On maintient un tableau de positions :

```ts
type PageLayout = {
  pageIndex: number;
  top: number;      // position Y du haut de la page dans l'espace Document (zoom 100%)
  height: number;   // hauteur de la page en px CSS (zoom 100%)
  width: number;    // largeur de la page en px CSS (zoom 100%)
};
```

Le `top` de la page N = somme des hauteurs des pages 0..N-1 + N × 16px (gaps).

### Assignation d'un rectangle à une page

Un rectangle Fabric.js a des coordonnées `(left, top, width, height)` dans l'espace Document (puisque Fabric n'a pas de viewport transform interne).

Pour déterminer la page d'appartenance :

```
centerY = rect.top + rect.height / 2
page = pages.find(p => p.top <= centerY && centerY < p.top + p.height)
```

- Le **centre vertical** du rectangle détermine la page d'appartenance.
- Si le centre tombe dans un gap inter-pages, on l'assigne à la page la plus proche.
- Un rectangle qui chevauche deux pages est traité comme appartenant à la page de son centre. Le crop peut déborder sur le gap, qui sera blanc (ce qui est inoffensif pour l'OCR).

## Mapping zone → crop 300 DPI

### Formule de conversion

Soit un rectangle Fabric à coordonnées `(rx, ry, rw, rh)` dans l'espace Document, assigné à la page `p` (de dimensions `pageW × pageH` en pixels CSS) :

```
// Coordonnées relatives à la page (espace Page, zoom 100%)
// Les pages occupent toute la largeur, donc localX = rx directement
localX = rx
localY = ry - p.top

// Facteur d'échelle : CSS px → 300 DPI px
// Pour une image : scaleFactor = imageNaturalWidth / pageW
// Pour un PDF : scaleFactor = (300 / 72) * (pdfPageWidth / pageW)
//   où pdfPageWidth est en points PDF (1 pt = 1/72 inch)

// Coordonnées dans le canvas 300 DPI
cropX = localX * scaleFactor
cropY = localY * scaleFactor
cropW = rw * scaleFactor
cropH = rh * scaleFactor
```

### Pour les images (non-PDF)

- L'image est affichée à une taille CSS (`pageW × pageH`).
- L'image a une résolution naturelle (`naturalWidth × naturalHeight`).
- `scaleFactor = naturalWidth / pageW`.
- Le crop à "300 DPI" utilise directement les pixels natifs de l'image (pas de re-rendu, juste un crop via `drawImage` sur un canvas off-screen).

### Pour les PDFs

- La page PDF a des dimensions en points (1 pt = 1/72 inch).
- L'affichage utilise un scale adapté au viewport : `displayScale = pageW / pdfPageWidthPt`.
- Le rendu 300 DPI utilise : `ocrScale = 300 / 72 ≈ 4.17`.
- La page est re-rendue via `page.render({ scale: ocrScale })` dans un canvas off-screen.
- Le crop dans ce canvas : `cropX = localX * (ocrScale / displayScale)`, etc.

## Page "visible" (pour la preview preprocessing)

La page "visible" est celle dont le centre vertical est le plus proche du centre du viewport :

```
viewportCenterY = -panY + (viewportHeight / zoom) / 2
visiblePage = pages.minBy(p => Math.abs(p.top + p.height / 2 - viewportCenterY))
```

## Gestion d'état

### State management

L'application utilise un **store React** (zustand ou useReducer au niveau App) avec les sections suivantes :

| Section        | Contenu                                              |
| -------------- | ---------------------------------------------------- |
| `file`         | Fichier chargé, type (image/pdf), `PDFDocumentProxy` |
| `pages`        | Tableau de `PageLayout` + refs vers les `<img>`      |
| `viewport`     | `zoom`, `panX`, `panY`                               |
| `mode`         | `'pan' \| 'draw'`                                    |
| `zones`        | Tableau de zones `{ id, fabricRect, pageIndex }`     |
| `ocr`          | État OCR (idle/running/done), résultats par zone     |
| `settings`     | Langue, toggle preprocessing preview                 |

### Lifecycle du PDFDocumentProxy

- Le `PDFDocumentProxy` (et ses `PDFPageProxy`) est conservé en mémoire tant que le fichier est chargé.
- Il est détruit (`pdfDoc.destroy()`) quand un nouveau fichier remplace l'ancien ou quand le fichier est fermé (bouton ✕).

### Lifecycle du worker Tesseract

- Le worker Tesseract.js est créé **lazily au premier OCR** (pas au chargement de l'app).
- Il est **réutilisé** entre les runs OCR successifs.
- Il est **terminé + recréé** en cas de crash ou d'annulation utilisateur.

### Lifecycle du worker preprocessing

- Le worker preprocessing est créé **lazily** au premier OCR ou au premier toggle de preview preprocessing.
- Il est **réutilisé** entre les appels.
- Après un crash, il est recréé pour la zone suivante (le crash n'annule pas le batch).

### Zones pendant l'OCR

- Au lancement de l'OCR, les coordonnées des zones sont **snapshottées**. Si l'utilisateur modifie les zones pendant l'OCR, ça n'affecte pas le run en cours.
- Le bouton OCR est désactivé pendant un run.

## Edge cases

| Cas                                            | Comportement                                |
| ----------------------------------------------- | ------------------------------------------- |
| Zone entièrement dans le gap inter-pages         | Assignée à la page la plus proche. Le crop contiendra du blanc. |
| Zone dessinée en dehors de toute page (marges)   | Traitée normalement, le crop sera blanc → OCR retournera un résultat vide. |
| Zone chevauchant deux pages                      | Assignée à la page du centre. La partie hors-page sera blanche dans le crop. |
| "Tout copier" : ordre de concaténation           | Ordre croissant des IDs de zone (= ordre de création). |
| Preview preprocessing : deux pages également visibles | La page dont le centre est le plus proche du centre du viewport l'emporte. |
| Fermeture du fichier (bouton ✕)                  | Reset complet vers l'état vide. Confirmation demandée si zones ou résultats existent (même règle que le remplacement). |
