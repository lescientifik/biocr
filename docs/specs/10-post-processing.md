---
description: Post-processing OCR avec corrections contextuelles et dictionnaire médical, toujours actif.
---

# Post-processing OCR — Corrections contextuelles

## Contexte

Le texte brut retourné par Tesseract contient des erreurs récurrentes sur les documents médicaux scannés : confusion O/0, l/1, S/5, espaces parasites dans les nombres, unités mal reconnues. Le post-processing corrige ces erreurs en utilisant des heuristiques contextuelles.

Le post-processing est **toujours actif** — pas de toggle. Les corrections sont conservatrices (appliquées seulement quand le contexte est sans ambiguïté).

---

## Feature: Correction contextuelle des caractères

**Définition du contexte numérique :** un caractère est en contexte numérique s'il est immédiatement adjacent (gauche ou droite) à au moins un chiffre (0-9) ou un séparateur décimal (`.` ou `,`). Exemples : `1O` (le O est en contexte numérique), `O2` (le O est en contexte numérique), `CO` (le O n'est PAS en contexte numérique car C n'est ni un chiffre ni un séparateur).

### Scenario: O remplacé par 0 dans un contexte numérique

```gherkin
Given le texte OCR brut contient "1O,5 g/L"
When le post-processing est exécuté
Then le texte corrigé est "10,5 g/L"
And la correction est appliquée car "O" est adjacent au chiffre "1"
```

### Scenario: 0 n'est PAS remplacé par O dans un contexte numérique

```gherkin
Given le texte OCR brut contient "10,5 g/L"
When le post-processing est exécuté
Then le texte reste "10,5 g/L" (aucune modification)
```

### Scenario: l remplacé par 1 dans un contexte numérique

```gherkin
Given le texte OCR brut contient "l2,3"
When le post-processing est exécuté
Then le texte corrigé est "12,3"
```

### Scenario: S remplacé par 5 dans un contexte numérique

```gherkin
Given le texte OCR brut contient "4S mg/dL"
When le post-processing est exécuté
Then le texte corrigé est "45 mg/dL"
```

### Scenario: Pas de correction dans un contexte alphabétique

```gherkin
Given le texte OCR brut contient "Cholestérol"
When le post-processing est exécuté
Then le texte reste "Cholestérol" (le "l" final n'est pas changé en "1")
```

### Scenario: Espaces parasites dans les nombres supprimés

```gherkin
Given le texte OCR brut contient "1 2,5" (espace parasite entre 1 et 2)
When le post-processing est exécuté
Then le texte corrigé est "12,5"
And la correction ne s'applique que pour un seul espace entre deux chiffres
```

---

## Feature: Normalisation des unités médicales

### Scenario: Unités courantes normalisées

```gherkin
Given le texte OCR brut contient une unité mal reconnue
When le post-processing est exécuté
Then les unités suivantes sont normalisées :
  | Entrée OCR | Corrigé    |
  | g/l        | g/L        |
  | G/L        | g/L        |
  | mg/dl      | mg/dL      |
  | mmol/l     | mmol/L     |
  | µmol/l     | µmol/L     |
  | mUI/l      | mUI/L      |
  | umol/L     | µmol/L     |
  | ul/mL      | µL/mL      |
```

### Scenario: Normalisation du séparateur décimal

```gherkin
Given le texte OCR brut contient "12.5 g/L" (point décimal)
When le post-processing est exécuté
Then le texte reste "12.5 g/L" (le point n'est PAS changé en virgule)
And la normalisation ne touche pas aux séparateurs décimaux
```

---

## Feature: Dictionnaire de termes de laboratoire

### Scenario: Correction par proximité d'un terme médical connu

```gherkin
Given le texte OCR brut contient "Glycémle" (distance Levenshtein = 1 de "Glycémie")
And le mot fait 8 caractères (>= 4)
When le post-processing est exécuté
Then le texte corrigé est "Glycémie"
And la correction n'est appliquée que si la distance Levenshtein est ≤ 2
```

### Scenario: Pas de correction si la distance est > 2

```gherkin
Given le texte OCR brut contient "Glucose"
When le post-processing est exécuté
Then le texte reste "Glucose" (pas de match assez proche dans le dictionnaire)
```

### Scenario: Pas de correction par proximité sur les mots courts (< 4 caractères)

```gherkin
Given le texte OCR brut contient "TPP" (distance Levenshtein = 1 de "TP")
And le mot fait 3 caractères (< 4)
When le post-processing est exécuté
Then le texte reste "TPP" (les mots courts ne sont pas corrigés par proximité)
And les termes courts (TP, VGM, CRP, etc.) ne sont corrigés que s'ils correspondent EXACTEMENT à une entrée du dictionnaire
```

### Scenario: Le dictionnaire contient les termes courants des bilans biologiques

```gherkin
Given le dictionnaire de termes médicaux
Then il contient au minimum les entrées suivantes :
  | Terme             | Catégorie       |
  | Glycémie          | Biochimie       |
  | Hémoglobine       | Hématologie     |
  | Créatinine        | Biochimie       |
  | Cholestérol       | Lipides         |
  | Triglycérides     | Lipides         |
  | Transaminases     | Enzymes         |
  | Bilirubine        | Biochimie       |
  | Leucocytes        | Hématologie     |
  | Érythrocytes      | Hématologie     |
  | Plaquettes        | Hématologie     |
  | Hématocrite       | Hématologie     |
  | VGM               | Hématologie     |
  | TCMH              | Hématologie     |
  | CCMH              | Hématologie     |
  | Vitesse sédimentation | Hématologie |
  | CRP               | Inflammation    |
  | TSH               | Thyroïde        |
  | Fer sérique       | Biochimie       |
  | Ferritine         | Biochimie       |
  | Acide urique      | Biochimie       |
  | Protéines totales | Biochimie       |
  | Albumine          | Biochimie       |
  | Gamma GT          | Enzymes         |
  | Phosphatases alcalines | Enzymes    |
  | LDH               | Enzymes         |
  | CPK               | Enzymes         |
  | HDL               | Lipides         |
  | LDL               | Lipides         |
  | HbA1c             | Diabète         |
  | INR               | Coagulation     |
  | TP                | Coagulation     |
  | TCA               | Coagulation     |
  | Fibrinogène       | Coagulation     |
  | Sodium            | Ionogramme      |
  | Potassium         | Ionogramme      |
  | Chlore            | Ionogramme      |
  | Calcium           | Ionogramme      |
  | Phosphore         | Ionogramme      |
  | Magnésium         | Ionogramme      |
```

### Scenario: Correction insensible à la casse

```gherkin
Given le texte OCR brut contient "glycemie" (tout en minuscules, accent manquant)
When le post-processing est exécuté
Then le texte corrigé est "Glycémie" (casse et accents restaurés)
```

---

## Feature: Traitement multi-lignes et cas limites

### Scenario: Le post-processing opère ligne par ligne

```gherkin
Given le texte OCR brut contient plusieurs lignes séparées par des sauts de ligne
When le post-processing est exécuté
Then chaque ligne est traitée indépendamment
And les sauts de ligne sont préservés
And aucun terme n'est matché à cheval sur deux lignes
```

### Scenario: Entrée vide ou contenant uniquement des espaces

```gherkin
Given le texte OCR brut est vide ou ne contient que des espaces/tabulations/sauts de ligne
When le post-processing est exécuté
Then le texte est retourné inchangé
```

### Scenario: Corrections multiples sur un même token

```gherkin
Given le texte OCR brut contient un token qui correspond à plusieurs règles de substitution
When le post-processing est exécuté
Then les substitutions sont appliquées de gauche à droite en un seul passage
And le résultat d'une substitution n'est PAS re-traité par les règles suivantes
```

### Scenario: Collision de dictionnaire (équidistance)

```gherkin
Given le texte OCR brut contient un mot équidistant de deux entrées du dictionnaire
When le post-processing calcule les distances de Levenshtein
Then le mot original est conservé (aucune correction appliquée)
```

---

## Feature: Le texte post-traité est affiché et copié

### Scenario: Le texte affiché et copié est post-traité

```gherkin
Given un résultat OCR post-traité
When l'utilisateur consulte le résultat
Then le texte affiché est le texte post-traité
And le texte copié par "Copier" est le texte post-traité
And le texte brut original n'est pas stocké séparément
```

---

## Contraintes non-fonctionnelles

### @performance Scenario: Le post-processing est quasi-instantané

```gherkin
Given un texte OCR de 500 lignes
When le post-processing est exécuté
Then le temps d'exécution est < 50 ms
```

---

## Out of scope

- Validation des valeurs par rapport aux ranges physiologiques (ex: glycémie 0.3-5.0 g/L)
- Structuration du texte en tableau (nom du test → valeur → unité → range)
- Apprentissage automatique des corrections
- Spell-checking généraliste (pas de dictionnaire français complet)
- Toggle pour désactiver le post-processing
