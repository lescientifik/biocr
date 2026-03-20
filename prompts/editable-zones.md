---
description: Prompt pour implémenter l'édition manuelle des zones auto-détectées (resize, move, delete).
---

# Mission : Rendre les zones auto-détectées éditables (resize, move, delete)

## Contexte

Tu travailles sur **biocr**, une webapp Vite + React + TypeScript pour l'OCR de documents médicaux. La détection de layout (YOLO11n-doclaynet) produit des bounding boxes automatiques affichées sur le canvas. Actuellement, **aucune zone n'est interactive** — ni les zones auto-détectées, ni les zones manuelles. L'utilisateur ne peut pas les modifier après détection.

## Objectif

Implémenter l'édition manuelle des zones auto-détectées :

1. **Resize** — L'utilisateur tire un coin ou un bord de la zone pour l'agrandir/réduire
2. **Move** — L'utilisateur clique à l'intérieur de la zone et fait un glisser-déposer pour la déplacer
3. **Delete** — L'utilisateur clique sur une zone pour la sélectionner, puis appuie sur Suppr/Delete pour la supprimer

Ces interactions doivent fonctionner pour les zones `source: "auto"` (détectées par YOLO). Si pertinent, appliquer le même comportement aux zones `source: "manual"`.

## Process à suivre OBLIGATOIREMENT

Tu dois suivre **dans l'ordre** les étapes ci-dessous, en lisant et appliquant les skills correspondants. Le skill adversarial review est dans `prompts/skills/adversarial-review.md`.

### Étape 1 : Écrire la spec Gherkin

Lire et appliquer le skill décrit dans `prompts/skills/specs.md`.

Couvrir : resize (coins + bords), move (drag intérieur), delete (sélection + Suppr), cas limites (zone ne sort pas du canvas, resize minimum, feedback visuel curseur/handles), interaction avec le mode "draw", mise à jour du store après édition.

### Étape 2 : Écrire le roadmap

Lire et appliquer le skill décrit dans `prompts/skills/roadmap.md`.

### Étape 3 : Implémenter

Lire et appliquer le skill décrit dans `prompts/skills/implement.md`.

À la fin : `npx biome check --write . && npx vitest run` doit passer.

## Fichiers à lire pour comprendre l'architecture

1. `src/components/FabricOverlay.tsx` — Canvas Fabric.js, rendu des zones (CRITIQUE à lire en premier)
2. `src/store/zone-store.ts` — Store Zustand des zones (addAutoZones, clearAutoZones, etc.)
3. `src/types/layout.ts` — Types LayoutRegion, LayoutRegionType
4. `src/lib/layout-detection/cache.ts` — Cache détection, conversion régions → zones
5. `src/components/Toolbar.tsx` — Boutons détection et filtres
6. `src/App.tsx` — Orchestration du flow
7. `src/lib/zone-manager.ts` — Gestion des zones

## Contraintes

- **Fabric.js** (`fabric` v6) est déjà dans les dépendances — l'utiliser pour les interactions canvas
- Pas de nouvelles dépendances sauf si absolument nécessaire
- Les modifications de zones doivent être reflétées dans le store Zustand
- Une zone déplacée/redimensionnée reste `source: "auto"` mais ses coordonnées sont mises à jour
- Une zone supprimée doit être retirée du canvas ET du store
- `npx biome check --write` pour le lint
- `npx vitest run` pour les tests
- Commiter sur une branche dédiée avec des messages descriptifs
