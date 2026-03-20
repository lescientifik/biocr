---
description: Roadmap TDD pour implémenter l'édition des zones (resize, move, delete) sur le canvas Fabric.js v6.
---

# Roadmap : Zones éditables (resize, move, delete)

## Objectif

Implémenter les interactions d'édition décrites dans `docs/specs/editable-zones.md` : sélection, resize, move et delete des zones auto-détectées et manuelles sur le canvas Fabric.js v6.

---

## Phase 1 — Configuration Fabric et sélection

### Objectif
Rendre les zones Fabric interactives : sélection synchronisée (objet actif Fabric + selectedZoneId store), handles de resize visibles, rotation désactivée, curseurs corrects.

### TDD Steps

**RED (tests/browser/ — nécessite Fabric.js réel) :**
1. Quand une zone est ajoutée au canvas en mode draw et qu'on la clique, `canvas.getActiveObject()` retourne l'objet cliqué ET `selectedZoneId` dans le store correspond.
2. Quand une zone est sélectionnée, le contrôle de rotation n'est PAS visible (`rect.isControlVisible('mtr') === false`).
3. Quand on clique sur le vide du canvas (pas sur un objet) en mode draw avec une zone sélectionnée, `canvas.getActiveObject()` retourne `undefined` ET `selectedZoneId` est `null`.
4. Quand le mode passe à "pan", `canvas.getActiveObject()` retourne `undefined` ET `selectedZoneId` est `null`.
5. Quand `selectedZoneId` passe à null (via Escape), `canvas.getActiveObject()` retourne `undefined`.
6. Quand on clique sur une zone existante en mode draw, aucune nouvelle zone n'est créée (zones.length inchangé) ET la zone est sélectionnée.
7. Quand 3 zones existent et qu'on en sélectionne 1, seule celle-ci est l'objet actif Fabric (les autres ne le sont pas).
8. Quand le mode passe de "pan" à "draw", les zones sur le canvas ont `selectable=true` et `evented=true`, et le wrapper Fabric a `pointerEvents="auto"`.

**GREEN :**
- Modifier la création des Rect dans l'effet de sync zones→canvas (`useFabricCanvas.ts`) pour définir :
  - `lockRotation: true`
  - `setControlVisible('mtr', false)` (API Fabric v6 — remplace l'ancien `hasRotatingPoint`)
  - `hoverCursor: "move"` (per-objet, pas global)
- **Aussi** modifier les Rect créés dans le handler `onMouseDown` (dessin) pour les mêmes propriétés — ces rects ne passent pas par l'effet de sync.
- Dans `onMouseDown`, quand `opt.target` existe : appeler `canvas.setActiveObject(opt.target)` en plus de `selectZone(zoneId)`.
- Dans `onMouseDown`, quand `opt.target` est null et une zone est sélectionnée : appeler `selectZone(null)` avant de commencer le dessin. Ou si pas de drag : juste désélectionner.
- Ajouter un `useEffect` qui observe `selectedZoneId` : quand il passe à null, appeler `canvas.discardActiveObject()` puis `canvas.requestRenderAll()`.
  - Note : utiliser `useZoneStore.getState().selectZone(null)` dans l'effet mode pour éviter une dépendance supplémentaire dans le dependency array.
- Dans l'effet mode (quand mode passe à "pan"), appeler `useZoneStore.getState().selectZone(null)` en plus de `discardActiveObject()`.
- Supprimer le `canvas.hoverCursor = "crosshair"` global — le garder uniquement sur `canvas.defaultCursor = "crosshair"` en mode draw.

**REFACTOR :**
- Extraire les propriétés Fabric interactives dans une constante `ZONE_INTERACTIVE_PROPS`.

### Parallélisation
Séquentiel — cette phase est fondamentale pour toutes les suivantes.

### Review gate
`/adversarial-review` après cette phase.

### Critères de complétion
- [ ] Cliquer une zone en mode draw → objet actif Fabric + selectedZoneId synchro
- [ ] Cliquer sur le vide → désélection (store + Fabric)
- [ ] Escape → désélection (store + Fabric)
- [ ] Mode pan → désélection + zones non interactives
- [ ] Pas de handle de rotation visible (`isControlVisible('mtr') === false`)
- [ ] Curseur "move" au survol d'une zone, "crosshair" sur le vide
- [ ] Cliquer une zone existante ne crée pas de nouvelle zone
- [ ] Les rects créés par dessin ont aussi les propriétés interactives
- [ ] Basculer pan→draw re-active les zones (selectable, evented, pointerEvents)
- [ ] Tests passent

### Dépendances
Aucune.

---

## Phase 2 — Clamping (taille minimale + limites canvas)

### Objectif
Empêcher les zones de sortir du canvas et d'être réduites en-dessous de 20x20. Extraire la logique en fonction pure testable.

### TDD Steps

**RED (tests/unit/ — fonction pure, pas besoin de Fabric) :**
1. `clampZoneToCanvas({ left: 0, top: 0, width: 10, height: 10 }, { width: 800, height: 600 })` retourne `{ left: 0, top: 0, width: 20, height: 20 }` (min-size clamp).
2. `clampZoneToCanvas({ left: 750, top: 0, width: 100, height: 80 }, { width: 800, height: 600 })` retourne `{ left: 700, ..., width: 100, height: 80 }` (boundary clamp X).
3. `clampZoneToCanvas({ left: -10, top: -5, width: 50, height: 50 }, { width: 800, height: 600 })` retourne `{ left: 0, top: 0, ... }` (negative clamp).
4. `clampZoneToCanvas({ left: 790, top: 590, width: 5, height: 5 }, { width: 800, height: 600 })` retourne `{ left: 780, top: 580, width: 20, height: 20 }` (min-size + boundary combinés : dimensions clampées d'abord, puis position).

**RED (tests/browser/ — intégration Fabric) :**
5. Après un resize Fabric (`object:modified`), `scaleX` et `scaleY` sont réinitialisés à 1 sur l'objet.
6. Après un resize qui dépasse les limites du canvas, les coordonnées dans le store sont clampées.
7. Après un move qui dépasse les limites, les coordonnées dans le store sont clampées.
8. Après un resize, les champs `source`, `label`, `regionKey` de la zone sont préservés dans le store.

**GREEN :**
- Créer `src/lib/clamp-zone.ts` avec la fonction pure `clampZoneToCanvas(rect, canvasSize)`.
  - **Ordre obligatoire** : (1) clamper dimensions (Math.max(20, dim)), (2) clamper positions avec dimensions clampées.
- Dans `onObjectModified` de `useFabricCanvas.ts` :
  - Calculer les dimensions effectives (`width * scaleX`, `height * scaleY`).
  - Appeler `clampZoneToCanvas(rect, { width: canvas.width, height: canvas.height })` (API v6 : `canvas.width`/`canvas.height` sont des propriétés directes, PAS des méthodes).
  - Appeler `updateZone(id, clampedRect)`.
  - Réinitialiser `scaleX=1, scaleY=1` sur l'objet Fabric.
  - Mettre à jour la position de l'objet Fabric avec les coordonnées clampées.

**REFACTOR :**
- Vérifier qu'il n'y a pas de duplication entre le clamping et le code existant de `onObjectModified`.

### Parallélisation
Séquentiel après Phase 1.

### Critères de complétion
- [ ] `clampZoneToCanvas` testé unitairement (4 cas)
- [ ] Les zones ne sortent jamais du canvas après resize ou move
- [ ] Les zones ont une taille minimum de 20x20
- [ ] `scaleX`/`scaleY` réinitialisés à 1 après resize
- [ ] source/label/regionKey préservés après resize et move
- [ ] Tests passent

### Dépendances
Phase 1.

---

## Phase 3 — Label temps réel (object:moving / object:scaling)

### Objectif
Le label texte des zones auto suit la zone en temps réel pendant le drag et le resize.

### TDD Steps

**RED (tests/unit/ — fonction pure) :**
1. `computeLabelPosition({ left: 100, top: 200, scaleX: 1, scaleY: 1 })` retourne `{ left: 102, top: 202 }`.
2. `computeLabelPosition({ left: 50, top: 80, scaleX: 2, scaleY: 1.5 })` retourne `{ left: 52, top: 82 }` (position = left+2, top+2, pas affectée par le scale).

**RED (tests/browser/) :**
3. Pendant un `object:moving`, le label companion a `left === zone.left + 2` et `top === zone.top + 2`.
4. Une zone sans label (zone manuelle) ne provoque pas d'erreur pendant moving/scaling.

**GREEN :**
- Extraire `repositionLabel(canvas, zoneId, left, top)` — trouve le label companion et le repositionne.
- Ajouter des listeners `object:moving` et `object:scaling` dans le useEffect des drawing handlers.
- Dans chaque listener : calculer la position effective et appeler `repositionLabel`.
- Refactorer le `onObjectModified` existant pour aussi utiliser `repositionLabel` (avec les coordonnées post-clamp de Phase 2).
- Nettoyer les listeners dans le cleanup du `useEffect`.

**REFACTOR :**
- S'assurer que `repositionLabel` est la seule source de logique de positionnement de labels (retirer le code inline de `onObjectModified`).

### Parallélisation
Séquentiel après Phase 2 (le label doit utiliser les coordonnées clampées dans `onObjectModified`).

### Critères de complétion
- [ ] Le label suit la zone en temps réel pendant drag et resize
- [ ] Pas d'erreur pour les zones sans label
- [ ] `repositionLabel` réutilisé dans moving, scaling ET modified
- [ ] Tests passent

### Dépendances
Phase 1, Phase 2.

---

## Phase 4 — Intégration, edge cases et validation finale

### Objectif
Couvrir les cas limites restants de la spec, vérifier les non-régressions, lint + tests.

### TDD Steps

**RED (tests/browser/) :**
1. Supprimer une zone auto avec regionKey → `addDeletedRegionKey` est appelé dans layoutStore.
2. Supprimer une zone manuelle → `addDeletedRegionKey` n'est PAS appelé.
3. Supprimer une zone auto → le label companion (FabricText avec `labelForZoneId`) est aussi retiré du canvas.
4. Delete sans zone sélectionnée (`selectedZoneId === null`) → aucun changement (zones.length inchangé).
5. Les raccourcis (Delete/Backspace) ne se déclenchent pas quand un `<input>` a le focus.
6. Resize par un bord (ex: bord droit) → seule la largeur change, la hauteur est préservée.
7. 2 zones se chevauchent → cliquer sélectionne la zone du dessus (z-index le plus élevé).

**GREEN :**
- Corriger toute régression identifiée.
- S'assurer que tous les listeners sont nettoyés dans les cleanup des `useEffect`.

**REFACTOR :**
- `npx biome check --write .`
- `npx vitest run`

### Parallélisation
Séquentiel — intégration finale.

### Review gate
`/adversarial-review` sur l'ensemble du code modifié.

### Critères de complétion
- [ ] Tous les scénarios de `docs/specs/editable-zones.md` ont un test correspondant
- [ ] `npx biome check --write .` passe sans erreur
- [ ] `npx vitest run` passe sans erreur
- [ ] Les zones auto et manuelles sont éditables (resize, move, delete)
- [ ] Les labels suivent en temps réel
- [ ] Les zones ne sortent pas du canvas
- [ ] La suppression synchro store + canvas + regionKey

### Dépendances
Phases 1, 2, 3.

---

## Out of scope

- Undo/redo
- Multi-sélection
- Snapping / alignement
- Copier-coller de zones
- Touch / mobile
- Double-clic (aucun comportement spécial)
- Contraintes de clamping pendant le dessin (seuil 5x5 suffit)
- Comportement en cas de resize du viewport/window en cours d'interaction
