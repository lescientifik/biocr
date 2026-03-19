---
description: Configuration Tesseract.js v2 avec tessdata_best, PSM 6, fra+eng, et binarisation Sauvola interne.
---

# OCR Engine v2 — Configuration Tesseract optimisée

## Contexte

La v1 utilise `tessdata_fast` (fra uniquement) avec la config par défaut de Tesseract. La v2 optimise la configuration pour les bilans biologiques scannés.

---

## Feature: Modèle tessdata_best bundlé

### Scenario: Le modèle français best est utilisé par défaut

```gherkin
Given l'application chargée pour la première fois
When le worker Tesseract est initialisé
Then le modèle chargé est `fra.traineddata` depuis `public/tesseract/lang/`
And le modèle est la version `tessdata_best` (float LSTM, ~4 MB compressé)
And aucune requête réseau n'est nécessaire
```

### Scenario: Le modèle anglais best est aussi bundlé

```gherkin
Given l'application chargée
When la langue est changée à "English"
Then le modèle `eng.traineddata` (tessdata_best) est chargé depuis `public/tesseract/lang/`
And aucune requête réseau n'est nécessaire
```

### Scenario: Le bundle total reste sous 25 MB

```gherkin
Given les assets dans public/ (WASM, workers, tessdata_best fra + eng, pdfjs)
When on calcule la taille totale
Then le total est < 25 MB
```

### Scenario: Sélection de la langue anglaise

```gherkin
Given l'utilisateur sélectionne "English" dans le sélecteur de langue
When le worker Tesseract est initialisé (ou réinitialisé)
Then la langue passée à Tesseract est "eng+fra" (anglais primaire, français secondaire)
And les deux modèles eng.traineddata et fra.traineddata sont chargés
```

### Scenario: Langues disponibles dans le sélecteur

```gherkin
Given l'application chargée
When l'utilisateur ouvre le sélecteur de langue
Then seules les langues "Français" et "English" sont proposées
And les langues deu, spa, ita ne sont PAS disponibles
And aucun mécanisme de téléchargement en ligne n'est proposé
```

---

## Feature: Configuration Tesseract optimisée

### Scenario: PSM 6 pour les zones utilisateur

```gherkin
Given une zone dessinée par l'utilisateur
When l'OCR est lancé sur cette zone
Then Tesseract est configuré avec PSM 6 (assume a single uniform block of text)
```

### Scenario: PSM 3 pour l'OCR global (document entier)

```gherkin
Given aucune zone dessinée (OCR sur document entier)
When l'OCR est lancé
Then Tesseract est configuré avec PSM 3 (fully automatic page segmentation)
```

### Scenario: Langue fra+eng combinée

```gherkin
Given la langue sélectionnée est "Français"
When le worker Tesseract est initialisé
Then la langue passée à Tesseract est "fra+eng"
And les termes français et anglais sont reconnus (ex: "Glycémie", "HDL", "CRP")
```

### Scenario: Espaces inter-mots préservés

```gherkin
Given un document avec des colonnes alignées par espaces
When l'OCR est lancé
Then la configuration Tesseract inclut `preserve_interword_spaces: '1'`
And les alignements de colonnes sont préservés dans le texte de sortie
```

### Scenario: DPI explicite à 300

```gherkin
Given un crop de zone preprocessé
When l'OCR est lancé
Then la configuration Tesseract inclut `user_defined_dpi: '300'`
And Tesseract ne tente pas de deviner le DPI depuis les métadonnées
```

### Scenario: Binarisation Sauvola interne activée

```gherkin
Given un crop en niveaux de gris (non binaire) envoyé à Tesseract
When Tesseract traite l'image
Then la configuration NE définit PAS `thresholding_method` pour désactiver Sauvola
And la binarisation adaptative par défaut de Tesseract est utilisée
```

---

## Feature: Configuration Tesseract passée au worker

### Scenario: Le worker reçoit la config OCR complète

```gherkin
Given le worker Tesseract initialisé
When `recognize()` est appelé
Then les paramètres suivants sont configurés via `worker.setParameters()` avant l'appel à `recognize()` :
  | Paramètre                    | Valeur  | Note                          |
  | tessedit_pageseg_mode        | 6 ou 3  | Dynamique selon le contexte   |
  | preserve_interword_spaces    | 1       |                               |
  | user_defined_dpi             | 300     |                               |
And tessedit_pageseg_mode vaut 6 pour les zones utilisateur, 3 pour l'OCR global
```

### Scenario: Le PSM est dynamique selon le contexte

```gherkin
Given le worker Tesseract initialisé
When `recognize()` est appelé avec un flag `isGlobalOcr = true`
Then `tessedit_pageseg_mode` est `3`
When `recognize()` est appelé avec `isGlobalOcr = false`
Then `tessedit_pageseg_mode` est `6`
```

---

## Feature: Gestion d'erreurs du worker OCR

### Scenario: Échec de l'initialisation du worker

```gherkin
Given l'application tente d'initialiser le worker Tesseract
When l'initialisation échoue (ex : WASM non chargé, mémoire insuffisante)
Then un toast s'affiche : "Impossible d'initialiser le moteur OCR"
And le bouton OCR reste activé pour permettre une nouvelle tentative
And le worker est recréé au prochain lancement
```

### Scenario: Échec de recognize()

```gherkin
Given le worker Tesseract est initialisé et une zone est envoyée pour OCR
When l'appel recognize() échoue (exception ou rejet de promesse)
Then un toast s'affiche avec le message d'erreur
And la zone reçoit un résultat vide avec confidence = 0
And le pipeline continue avec les zones suivantes le cas échéant
```

---

## Feature: Changement de langue pendant l'OCR

### Scenario: Changement de langue pendant un OCR en cours

```gherkin
Given un OCR est en cours avec la langue "fra+eng"
When l'utilisateur change la langue sélectionnée à "English"
Then l'OCR en cours continue avec la langue "fra+eng"
And le changement de langue est mis en file d'attente
And le prochain OCR lancé utilisera la langue "eng+fra"
```

---

## Feature: Cycle de vie du worker Tesseract

### Scenario: Création paresseuse et terminaison du worker

```gherkin
Given l'application chargée (aucun OCR lancé encore)
When aucun OCR n'a été demandé
Then aucun worker Tesseract n'est créé

When l'utilisateur lance un premier OCR
Then un unique worker Tesseract est créé (création paresseuse)

When l'utilisateur ferme le fichier ou quitte la page (page unload)
Then le worker Tesseract est terminé (worker.terminate())
```

---

## Out of scope

- Multi-pass OCR (voting entre plusieurs PSM/models)
- Whitelists de caractères (peu fiable avec LSTM)
- Réentraînement du modèle sur des bilans biologiques
- Langues autres que fra et eng bundlées
