---
description: Vue d'ensemble du projet BioOCR — webapp offline pour OCR de bilans biologiques.
---

# BioOCR — Vue d'ensemble

## Objectif

Application web **offline-first**, **single-page HTML**, permettant d'extraire le texte de bilans biologiques scannés (PDF ou image) via OCR côté client.

## Principes directeurs

- **100% offline** : aucune requête réseau après le premier chargement. Tout tourne dans le navigateur.
- **Jetable** : aucune persistance de données entre les sessions. On drop, on OCR, on copie, on ferme.
- **Simple** : interface épurée, un seul fichier à la fois, un workflow linéaire.
- **Données de santé** : rien ne quitte le navigateur. Aucun stockage local. Respect RGPD par design.

## Workflow utilisateur

1. **Drop** — L'utilisateur dépose un fichier (PDF ou image) sur la zone de drag & drop.
2. **Visualise** — Le document s'affiche dans un viewer interactif (zoom, pan).
3. **Sélectionne** _(optionnel)_ — L'utilisateur trace un ou plusieurs rectangles sur les zones d'intérêt (mode Draw).
4. **OCR** — Clic sur "Lancer l'OCR" : traite les zones sélectionnées si elles existent, sinon le document entier.
5. **Copie** — Le texte extrait s'affiche dans un panneau latéral. L'utilisateur copie ce qu'il veut.

## Stack technique

| Composant         | Choix                    |
| ----------------- | ------------------------ |
| Runtime / Package | Bun                      |
| Build             | Vite                     |
| Langage           | TypeScript               |
| Framework         | React                    |
| UI                | shadcn/ui + Tailwind CSS |
| Canvas interactif | Fabric.js (overlay rectangles uniquement) |
| OCR               | Tesseract.js v5+         |
| PDF → Image       | pdf.js v4.x              |
| Tests             | Vitest                   |
| Linter            | Biome                    |

## Architecture canvas

L'affichage du document et l'interaction utilisateur sont **découplés** :

- **Couche document** : les pages (images ou pages PDF rendues) sont affichées via des éléments `<img>` dans un conteneur scrollable/zoomable. Rendues à la **résolution écran** (pas 300 DPI) pour économiser la mémoire.
- **Couche interaction** : un canvas **Fabric.js en overlay** transparent par-dessus le conteneur document, utilisé uniquement pour le dessin et la manipulation des rectangles de sélection.
- **Rendu OCR** : quand l'OCR est lancé, la zone sélectionnée (ou la page entière) est re-rendue à **300 DPI** dans un canvas temporaire off-screen, prétraitée, puis envoyée à Tesseract.js. Ce canvas est détruit après usage.

Cette séparation évite l'explosion mémoire liée à un Fabric.js canvas unique contenant toutes les pages à 300 DPI.

## Pipeline d'assets statiques (offline)

Toutes les dépendances WASM et modèles doivent être dans le dossier `public/` de Vite avec des chemins explicites :

- `public/tesseract/` : `tesseract-core-simd-lstm.wasm`, `worker.min.js`
- `public/tesseract/lang/` : `fra.traineddata` (bundlé), autres langues téléchargeables
- `public/pdfjs/` : `pdf.worker.min.mjs`, `openjpeg.wasm`, `qcms_bg.wasm`, cMaps, standard fonts

Aucun path par défaut CDN ne doit être utilisé. Tous les `corePath`, `workerPath`, `langPath`, `cMapUrl`, `standardFontDataUrl` doivent pointer vers `public/`.

## Navigateurs supportés

| Navigateur | Version minimale | Notes                          |
| ---------- | --------------- | ------------------------------ |
| Chrome     | 90+             | Référence                      |
| Firefox    | 90+             |                                |
| Edge       | 90+             | (basé Chromium)                |
| Safari     | 15.4+           | Support WASM SIMD requis       |

## Exigences non-fonctionnelles

- **Bundle total** : < 25 MB (incluant WASM + traineddata fra).
- **Premier chargement** : < 15s sur connexion 10 Mbps.
- **OCR d'une zone A6** (demi-page) : < 10s sur desktop moderne.
- **Mémoire** : < 500 MB d'usage navigateur pour un PDF de 5 pages.
- **Test offline** : le build doit être testé avec DevTools Network en mode Offline.

## Scope v1

### Inclus

- Drag & drop d'un fichier unique (PDF multi-pages ou image)
- Clic-pour-parcourir en fallback du drag & drop
- Affichage du document avec zoom/pan
- Sélection multi-zones (rectangles éditables : déplacer, redimensionner, supprimer)
- OCR intelligent (zones sélectionnées s'il y en a, sinon document entier)
- Prétraitement automatique de l'image avant OCR (en Web Worker)
- Prévisualisation du prétraitement (toggle)
- Barre de progression OCR (non bloquante)
- Panneau latéral avec résultats par zone (onglets) + bouton copier
- Sélection de langue OCR (français par défaut, bundlé)
- Gestion d'erreurs (fichier invalide, OCR échoué, résultat vide)
- Confirmation avant remplacement d'un fichier si zones/résultats existent
- Thème clair uniquement

### Exclus (hors scope v1)

- Persistance / historique
- Export fichier (txt, json, csv)
- Parsing structuré (tableau analyte/valeur/unité)
- Multi-fichiers simultanés
- Dark mode
- PWA / Service Worker
- Undo/redo des zones
- Accessibilité complète (v1 : clavier basique + focus visible, pas de support screen reader complet pour le canvas)
