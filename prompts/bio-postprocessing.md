---
description: Prompt pour créer un dictionnaire des paramètres biologiques français et un pipeline de post-processing OCR pour extraction structurée.
---

# Mission : Dictionnaire biologique + Post-processing OCR structuré

## Contexte

Tu travailles sur **biocr**, une webapp Vite + React + TypeScript pour l'OCR de bilans biologiques médicaux scannés. L'OCR (Tesseract.js) extrait du texte brut depuis les zones détectées, mais ce texte est :

- **Trop verbeux** : contient le nom long du paramètre, plusieurs valeurs, les valeurs de référence du labo, des notes, etc.
- **Parfois erroné** : l'OCR fait des erreurs sur les chiffres, les unités, confond parfois le % avec la valeur réelle
- **Non structuré** : pas exploitable directement pour une observation médicale

L'objectif est de produire un résultat **clean et copier-collable** pour une observation médicale : **une ligne = nom du paramètre + valeur + unité**, avec un flag si la valeur semble aberrante.

## Process à suivre OBLIGATOIREMENT

### Sous-mission A : Recherche web (OBLIGATOIREMENT par agents OPUS)

Lancer **en parallèle** 2 agents OPUS de recherche web :

**Agent 1 — Dictionnaire des paramètres biologiques français** :
- Rechercher les noms complets et abréviations courantes de tous les paramètres qu'on trouve dans les bilans biologiques en français
- Inclure au minimum :
  - **Hématologie** : NFS complète (leucocytes, hématies, hémoglobine, hématocrite, VGM, TCMH, CCMH, plaquettes, réticulocytes), formule leucocytaire (PNN, PNE, PNB, lymphocytes, monocytes)
  - **Biochimie courante** : glycémie, créatinine, urée, acide urique, ionogramme (Na, K, Cl, Ca, phosphore, magnésium), bilan hépatique (ASAT/ALAT/GGT/PAL, bilirubine), bilan lipidique (cholestérol total, HDL, LDL, triglycérides)
  - **Hémostase** : TP, TCA, INR, fibrinogène, D-dimères
  - **Marqueurs tumoraux** : PSA (total, libre, rapport), CA 125, CA 19-9, CA 15-3, ACE, AFP, β-HCG, NSE, SCC, Cyfra 21-1
  - **Marqueurs prostatiques** : PSA détaillé, phosphatases acides
  - **Endocrinologie courante** : TSH, T3, T4, cortisol
  - **Inflammation** : CRP, VS, procalcitonine
  - **Sérologie/immunologie** courante
  - **Vitamines** : B9, B12, D, fer sérique, ferritine, transferrine, CST
  - Tout autre paramètre courant dans les bilans biologiques français
- Pour chaque paramètre, récupérer :
  - Nom(s) complet(s) en français
  - Abréviations courantes (ex: "GR" pour globules rouges, "GB" pour globules blancs, "Hb" pour hémoglobine)
  - **Unités habituelles** (TRÈS IMPORTANT) : ex glycémie en g/L ou mmol/L, créatinine en µmol/L ou mg/L
  - **Plage de valeurs plausibles** (pas juste les normes, mais les valeurs physiologiquement possibles — plus large que les normes pour pouvoir détecter les erreurs OCR évidentes). Ex: une glycémie à 150 g/L est clairement une erreur OCR, alors que 1.50 g/L est plausible même si élevée
  - Synonymes et variantes d'écriture (ex: "Gamma GT" / "γGT" / "GGT" / "Gamma-glutamyl-transférase")

**Agent 2 — Techniques de post-processing OCR pour données biomédicales** :
- Rechercher les meilleures approches pour :
  - Extraction structurée de données tabulaires depuis du texte OCR brut
  - Fuzzy matching de termes médicaux (bibliothèques JS/TS existantes ?)
  - Correction d'erreurs OCR courantes sur les chiffres et unités
  - Pattern matching / regex pour extraire "paramètre + valeur + unité" depuis du texte semi-structuré
  - Stripping de caractères indésirables (whitespace, lignes vides, artefacts OCR)
- Produire un rapport avec les approches recommandées et des exemples de code

Les 2 rapports de recherche doivent être sauvegardés dans `docs/research/` (fichiers `.md` avec frontmatter YAML `description`).

### Sous-mission B : Créer le dictionnaire/référentiel

À partir de la recherche, créer un fichier de données structuré (JSON, TypeScript constant, ou autre format jugé optimal) contenant tous les paramètres avec leurs métadonnées. Structure permettant le lookup rapide par nom ou abréviation (fuzzy matching). Placer dans `src/lib/bio/` ou équivalent.

### Sous-mission C : Pipeline de post-processing

Implémenter un pipeline qui :

1. **Prend en entrée** le texte brut OCR d'une zone détectée
2. **Nettoie** : strip whitespace, lignes vides, caractères parasites
3. **Extrait** les lignes contenant un paramètre biologique : regex + fuzzy matching contre le dictionnaire
4. **Parse** chaque ligne : identifie le nom du paramètre, la valeur numérique, l'unité
5. **Valide** : compare la valeur à la plage plausible du dictionnaire, flag si aberrante (probable erreur OCR)
6. **Produit** un format structuré : `{ name: string, value: number, unit: string, flagged: boolean }`
7. **Affiche** le résultat de manière copier-collable dans l'UI (laisser le choix de l'approche UI après lecture du code existant, notamment `src/components/ResultsPanel.tsx`)

### Sous-mission D : Specs, roadmap, implémentation

Le skill adversarial review est dans `prompts/skills/adversarial-review.md`.

Pour les sous-missions B et C, suivre le process complet :

1. **Specs Gherkin** — lire et appliquer `prompts/skills/specs.md`
2. **Roadmap TDD** — lire et appliquer `prompts/skills/roadmap.md`
3. **Implémentation** — lire et appliquer `prompts/skills/implement.md`

À la fin : `npx biome check --write . && npx vitest run` doit passer.

## Fichiers à lire

1. `src/components/ResultsPanel.tsx` — Panneau de résultats OCR actuel
2. `src/lib/ocr-coordinator.ts` — Coordination OCR
3. `src/lib/ocr-engine.ts` — Moteur OCR Tesseract.js
4. `src/lib/post-processing.ts` — Post-processing OCR existant
5. `src/lib/post-processing/` — Dossier post-processing existant
6. `src/types/` — Types existants
7. `src/App.tsx` — Orchestration
8. `src/store/` — Stores Zustand

## Contraintes

- **Recherches web OBLIGATOIREMENT par agents OPUS** (pas haiku, pas sonnet)
- Le dictionnaire doit être **exhaustif** — mieux vaut trop de paramètres que pas assez
- Les plages de valeurs doivent être **larges** (valeurs physiologiquement possibles, pas juste les normes)
- Les unités sont **critiques** — un paramètre peut avoir plusieurs unités selon le labo
- Le fuzzy matching doit tolérer les erreurs OCR courantes (0/O, 1/l/I, espaces manquants, etc.)
- Full autonomie — ne pas poser de questions, prendre les décisions qui semblent les meilleures
- `npx biome check --write` pour le lint
- `npx vitest run` pour les tests
- Commiter sur une branche dédiée avec des messages descriptifs
