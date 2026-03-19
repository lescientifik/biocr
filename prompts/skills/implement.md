---
name: implement
description: Rules for briefing OPUS subagents when implementing from specs and roadmaps. Used after /specs and /roadmap.
---

# Implement — How to brief implementation subagents

Ce skill définit comment écrire les prompts pour les subagents OPUS quand ils doivent implémenter du code. Il s'applique à tout skill qui délègue de l'implémentation : `/bug-fixing`, `/bug-blitz`, etc.

## Principe fondamental

**Les subagents savent lire.** Ne copie JAMAIS du code dans le prompt. Pointe vers les fichiers, l'agent les lira lui-même.

## Structure d'un prompt de implementation

Un prompt doit contenir **uniquement** :

1. **Objectif** — Une phrase. Qu'est-ce que l'agent doit accomplir ?
2. **Fichiers à lire** — Chemins absolus vers les specs, roadmap, issues, et fichiers source concernés. L'agent les lira.
3. **Contraintes** — Règles spécifiques à respecter (TDD, ne pas toucher tel fichier, conventions du projet).
4. **Critères de complétion** — Comment l'agent sait qu'il a fini. Tests qui passent, lint clean, etc.

C'est tout. Rien d'autre.

## Ce qu'un prompt ne doit JAMAIS contenir

- **Du code source copié-collé** — l'agent peut `Read` les fichiers lui-même
- **Des stubs ou squelettes d'implémentation** — souvent déjà dans les fichiers à lire ; si ce n'est pas le cas, les y ajouter plutôt que de les mettre dans le prompt
- **Le contenu des specs ou de la roadmap** — pointer le fichier (avec les lignes d'intérêt si connues), l'agent lira
- **Des explications ligne par ligne** des changements à faire — décrire le QUOI, pas le COMMENT
- **Du pseudocode détaillé du COMMENT** — le pseudocode court décrivant le QUOI est acceptable quand il n'est pas déjà dans les docs

## Exemple

### MAUVAIS (verbeux, copie du code) :

```
Implémente le moteur OCR v2. Voici le code actuel de ocr-engine.ts :
[700 lignes de code]
Tu dois changer la ligne 42 pour ajouter un paramètre threshold...
Tu dois modifier la fonction process() pour...
Voici les tests attendus :
[200 lignes de tests]
Le résultat doit ressembler à :
[stub d'implémentation]
```

### BON (concis, référence les fichiers) :

```
Implémente la phase 3 de la roadmap : OCR Engine v2.

Lis :
- docs/roadmaps/01-tdd-roadmap.md (phase 3, L45-L80)
- docs/specs/ocr-engine.md
- src/ocr-engine.ts (code actuel à modifier)

TDD : écris les tests d'abord (RED), puis implémente (GREEN).
Vérifie : bun test && bun run lint
```

## Calibration de la longueur

- **Prompt idéal : 200-500 caractères**
- Au-delà de 1000 caractères, c'est probablement trop verbeux
- Si tu ressens le besoin de copier du code, c'est un signal que le prompt est mal structuré

## Quand ajouter du contexte supplémentaire

Le seul cas où du contexte additionnel est justifié :
- **Décisions architecturales prises en cours de route** qui ne sont pas encore dans les fichiers — et dans ce cas, mets-les à jour dans les fichiers PUIS pointe vers eux
- **Pièges connus** — un bug subtil ou un edge case que l'agent risque de rater, en une phrase max
