---
description: Spec pour l'édition manuelle des zones auto-détectées et manuelles (resize, move, delete) sur le canvas Fabric.js.
---

# Zones éditables — Resize, Move, Delete

> **Note :** Cette spec décrit le comportement cible à implémenter. Les fonctionnalités décrites (handles, clamping, curseurs) n'existent pas encore dans le code.

## Feature: Sélection de zone

```gherkin
Scenario: Sélectionner une zone auto en mode draw
  Given le mode est "draw"
  And une zone auto "Tableau" existe sur le canvas
  When l'utilisateur clique sur la zone
  Then la zone devient l'objet actif Fabric (canvas.setActiveObject)
  And selectedZoneId est mis à jour dans le store
  And des handles de resize apparaissent sur les 8 points (4 coins + 4 milieux de bords)
  And le handle de rotation n'est PAS affiché (lockRotation=true, hasRotatingPoint=false)

Scenario: Sélectionner une zone manuelle en mode draw
  Given le mode est "draw"
  And une zone manuelle existe sur le canvas
  When l'utilisateur clique sur la zone
  Then la zone est sélectionnée (objet actif Fabric + selectedZoneId dans le store)
  And des handles de resize apparaissent

Scenario: Désélectionner via clic sur le vide
  Given le mode est "draw"
  And une zone est sélectionnée
  When l'utilisateur clique sur une zone vide du canvas
  Then selectedZoneId passe à null dans le store
  And canvas.discardActiveObject() est appelé
  And les handles de resize disparaissent

Scenario: Désélectionner via Escape
  Given le mode est "draw"
  And une zone est sélectionnée
  When l'utilisateur appuie sur Escape
  Then selectedZoneId passe à null dans le store
  And canvas.discardActiveObject() est appelé
  # Note implémentation : le hook useKeyboardShortcuts n'a pas accès au canvas.
  # L'effet de sync zones→canvas dans useFabricCanvas doit réagir au changement
  # de selectedZoneId pour appeler discardActiveObject() quand il passe à null.

Scenario: Les zones ne sont pas interactives en mode pan
  Given le mode est "pan"
  And des zones existent sur le canvas
  When l'utilisateur clique sur une zone
  Then aucune zone n'est sélectionnée
  And le wrapper Fabric a pointerEvents="none"

Scenario: Les handles ne sont visibles que sur la zone sélectionnée
  Given le mode est "draw"
  And 3 zones existent sur le canvas
  When l'utilisateur sélectionne la 2ème zone
  Then seule la 2ème zone affiche des handles de resize
  And les 2 autres zones n'ont pas de handles visibles

Scenario: Cliquer sur une zone en chevauchement sélectionne la zone du dessus
  Given le mode est "draw"
  And 2 zones se chevauchent sur le canvas
  When l'utilisateur clique sur la zone de chevauchement
  Then la zone avec le z-index le plus élevé (ajoutée en dernier) est sélectionnée
```

## Feature: Resize de zone

```gherkin
Scenario: Resize par un coin
  Given le mode est "draw"
  And une zone est sélectionnée avec un handle de coin visible
  When l'utilisateur tire le coin bas-droit de 50px vers la droite et 30px vers le bas
  Then la zone s'agrandit de 50px en largeur et 30px en hauteur
  And le store est mis à jour via updateZone() après mouseup (événement object:modified)
  And la zone conserve son source, label et regionKey

Scenario: Resize par un bord
  Given le mode est "draw"
  And une zone est sélectionnée
  When l'utilisateur tire le bord droit de 40px vers la droite
  Then seule la largeur de la zone augmente de 40px
  And la hauteur reste inchangée
  And le store est mis à jour via updateZone() après mouseup

Scenario: Resize respecte la taille minimale 20x20 (clamp)
  Given le mode est "draw"
  And une zone de 100x80 pixels est sélectionnée
  When l'utilisateur tire un coin pour réduire la zone en-dessous de 20x20
  Then la zone est clampée à 20 pixels minimum en largeur ET en hauteur
  And le clamp est appliqué dans object:modified via Math.max(20, dimension)
  And le store reflète les dimensions clampées

Scenario: Le seuil de création (5x5) est distinct du minimum de resize (20x20)
  Given le mode est "draw"
  When l'utilisateur dessine un nouveau rectangle de 3x3 pixels
  Then le rectangle est supprimé (trop petit pour être une zone)
  And aucune zone n'est ajoutée au store

Scenario: Resize ne sort pas du canvas
  Given le mode est "draw"
  And le canvas fait 800x600 pixels
  And une zone est positionnée à left=700, top=500, width=50, height=50
  When l'utilisateur tire le coin bas-droit au-delà de (800, 600)
  Then la zone est contrainte aux limites du canvas
  And la largeur max = 800 - left, la hauteur max = 600 - top
  And le clamp est appliqué dans object:modified

Scenario: Le label suit la zone pendant le resize en temps réel
  Given le mode est "draw"
  And une zone auto "Texte" est sélectionnée
  When l'utilisateur resize la zone en tirant un coin
  Then le label "Texte" se repositionne pendant le drag (événement object:scaling)
  And le label reste à zone.left+2, zone.top+2

Scenario: La rotation est désactivée
  Given le mode est "draw"
  And une zone est sélectionnée
  Then aucun handle de rotation n'est affiché
  And la propriété lockRotation=true est définie sur l'objet Fabric
  And hasRotatingPoint=false sur l'objet Fabric
```

## Feature: Move (déplacement) de zone

```gherkin
Scenario: Déplacer une zone par glisser-déposer
  Given le mode est "draw"
  And une zone est sélectionnée
  When l'utilisateur clique à l'intérieur de la zone et fait un glisser de 60px à droite et 40px vers le bas
  Then la zone se déplace de 60px en X et 40px en Y
  And le store est mis à jour via updateZone() après mouseup (object:modified)
  And la largeur et la hauteur restent inchangées

Scenario: Le déplacement ne sort pas du canvas
  Given le mode est "draw"
  And le canvas fait 800x600 pixels
  And une zone de 100x80 est à left=750, top=0
  When l'utilisateur tente de déplacer la zone de 100px vers la droite
  Then la zone est contrainte : left ≤ 800-100=700, top ≥ 0
  And aucune coordonnée ne devient négative
  And le store reflète les coordonnées clampées

Scenario: Le label suit la zone pendant le déplacement en temps réel
  Given le mode est "draw"
  And une zone auto "En-tête" est sélectionnée
  When l'utilisateur déplace la zone
  Then le label "En-tête" suit la zone pendant le drag (événement object:moving)
  And le label reste à zone.left+2, zone.top+2

Scenario: Déplacer une zone auto conserve son source et label
  Given le mode est "draw"
  And une zone auto "Tableau" avec regionKey "0:2" existe
  When l'utilisateur déplace cette zone à une nouvelle position
  Then la zone reste source="auto", label="Tableau", regionKey="0:2"
  And seuls left et top sont modifiés dans le store
```

## Feature: Delete (suppression) de zone

```gherkin
Scenario: Supprimer une zone sélectionnée via Delete
  Given le mode est "draw"
  And une zone est sélectionnée
  When l'utilisateur appuie sur la touche Delete
  Then la zone est retirée du canvas
  And la zone est retirée du store via removeZone()
  And selectedZoneId passe à null

Scenario: Supprimer une zone sélectionnée via Backspace
  Given le mode est "draw"
  And une zone est sélectionnée
  When l'utilisateur appuie sur la touche Backspace
  Then la zone est retirée du canvas et du store

Scenario: Supprimer une zone auto enregistre la regionKey
  Given le mode est "draw"
  And une zone auto "Texte" avec regionKey "0:1" est sélectionnée
  When l'utilisateur appuie sur Delete
  Then la regionKey "0:1" est ajoutée à deletedRegionKeys dans layoutStore
  And la zone est retirée du canvas et du store

Scenario: Supprimer une zone manuelle ne touche pas deletedRegionKeys
  Given le mode est "draw"
  And une zone manuelle (source=undefined ou "manual") est sélectionnée
  When l'utilisateur appuie sur Delete
  Then la zone est retirée du canvas et du store
  And deletedRegionKeys dans layoutStore n'est PAS modifié

Scenario: Delete sans zone sélectionnée ne fait rien
  Given le mode est "draw"
  And aucune zone n'est sélectionnée (selectedZoneId = null)
  When l'utilisateur appuie sur Delete
  Then aucune zone n'est retirée
  And aucun changement dans le store

Scenario: Le label est supprimé avec la zone auto
  Given le mode est "draw"
  And une zone auto "Figure" avec son label est sélectionnée
  When l'utilisateur appuie sur Delete
  Then la zone ET son label (labelForZoneId) sont retirés du canvas

Scenario: Les raccourcis ne se déclenchent pas dans les champs de saisie
  Given un champ input, textarea ou select a le focus
  When l'utilisateur appuie sur Delete ou Backspace
  Then le comportement par défaut du navigateur est préservé
  And aucune zone n'est supprimée
```

## Feature: Feedback visuel (curseurs)

```gherkin
@ux
Scenario: Curseur crosshair sur le canvas vide en mode draw
  Given le mode est "draw"
  When l'utilisateur survole une zone vide du canvas (pas sur un objet Fabric)
  Then le curseur est "crosshair" (canvas.defaultCursor)

@ux
Scenario: Curseur move au survol d'une zone en mode draw
  Given le mode est "draw"
  And une zone existe sur le canvas
  When l'utilisateur survole l'intérieur de la zone
  Then le curseur passe à "move" (propriété hoverCursor de l'objet Fabric)

@ux
Scenario: Curseur de resize au survol d'un handle
  Given le mode est "draw"
  And une zone est sélectionnée avec des handles visibles
  When l'utilisateur survole un handle de coin
  Then le curseur passe au curseur de resize approprié (géré nativement par Fabric.js)

@ux
Scenario: Curseur de resize bord (ew/ns)
  Given le mode est "draw"
  And une zone est sélectionnée
  When l'utilisateur survole un handle de bord horizontal
  Then le curseur est "ew-resize"
  When l'utilisateur survole un handle de bord vertical
  Then le curseur est "ns-resize"

@ux
Scenario: Curseur grab en mode pan
  Given le mode est "pan"
  When l'utilisateur survole le canvas
  Then le curseur est "grab"
```

## Feature: Interaction avec le mode draw (dessin de nouvelles zones)

```gherkin
Scenario: Cliquer sur une zone existante sélectionne au lieu de dessiner
  Given le mode est "draw"
  And une zone existe sur le canvas
  When l'utilisateur clique sur la zone (sans drag)
  Then la zone est sélectionnée
  And aucune nouvelle zone n'est créée

Scenario: Dessiner sur une zone vide crée une nouvelle zone
  Given le mode est "draw"
  And aucune zone n'est sous le curseur
  When l'utilisateur fait un mousedown + drag + mouseup sur le canvas vide
  Then une nouvelle zone manuelle est créée avec source="manual"
  And elle est ajoutée au store via addZone()

Scenario: Basculer en mode pan désélectionne la zone
  Given le mode est "draw"
  And une zone est sélectionnée avec des handles
  When l'utilisateur passe en mode "pan" (touche V ou bouton toolbar)
  Then selectedZoneId passe à null dans le store (via selectZone(null) dans l'effet mode)
  And canvas.discardActiveObject() est appelé dans l'effet mode du hook useFabricCanvas
  And les handles disparaissent
  And le wrapper Fabric passe en pointerEvents="none"
  # Note implémentation : setMode() ne clear pas selectedZoneId — c'est l'effet
  # useEffect sur `mode` dans useFabricCanvas qui doit appeler selectZone(null)
  # quand mode !== "draw", en plus de discardActiveObject().

Scenario: Basculer en mode draw depuis pan (touche D ou bouton toolbar)
  Given le mode est "pan"
  When l'utilisateur passe en mode "draw" (touche D ou bouton toolbar)
  Then les zones deviennent selectable=true et evented=true
  And le wrapper Fabric passe en pointerEvents="auto"
```

## Feature: Synchronisation store ↔ canvas

```gherkin
Scenario: Le resize met à jour les dimensions dans le store après mouseup
  Given une zone avec left=100, top=200, width=150, height=100
  When l'utilisateur resize la zone à width=200, height=130 et relâche la souris
  Then updateZone() est appelé avec les nouvelles dimensions
  And scaleX et scaleY sont réinitialisés à 1 sur l'objet Fabric
  And les dimensions dans le store = width * scaleX, height * scaleY

Scenario: Le move met à jour les coordonnées dans le store après mouseup
  Given une zone avec left=100, top=200
  When l'utilisateur déplace la zone à left=160, top=240 et relâche la souris
  Then updateZone() est appelé avec left=160, top=240

Scenario: La suppression retire du store ET du canvas
  Given une zone existe dans le store et sur le canvas
  When l'utilisateur supprime la zone
  Then removeZone(id) est appelé sur le store
  And le canvas supprime l'objet Fabric avec le zoneId correspondant
  And si c'était une zone auto avec label, l'objet FabricText (labelForZoneId) est aussi retiré
```

## Out of scope

- Undo/redo des modifications de zones
- Édition du label (renommer le type de zone)
- Multi-sélection (sélectionner et déplacer plusieurs zones simultanément)
- Snapping / alignement automatique entre zones
- Copier-coller de zones
- Contraintes de clamping pendant le dessin de nouvelles zones (le seuil 5x5 de discard suffit)
- Touch / mobile input
- Double-clic (aucun comportement spécial)
- Comportement en cas de resize du viewport/window en cours d'interaction
