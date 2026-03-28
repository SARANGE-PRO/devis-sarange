# Architecture du Projet - Devis Sarange

## 1. Stack Technique

- **Frontend** : React (Next.js 15 - App Router)
- **Styling** : Tailwind CSS v4
- **Icônes** : Lucide React
- **Typographie** : Inter (Google Font via `next/font`)

## 2. Design System & Charte Graphique (extrait de brandsarange.html)

### Typographie
- **Police** : Inter (Google Font)
- **Logo / Display** : `font-weight: 900` (Black) — tracking `-0.05em` — uppercase
- **Titres H1-H3** : `font-weight: 700` (Bold) — tracking `-0.025em`
- **Paragraphe / Body** : `font-weight: 400` (Regular) — `leading-relaxed`
- **Boutons & UI** : `font-weight: 700` (Bold) ou `600` (Semibold)

### Palette de Couleurs
| Nom                  | Code Hex  | Classes Tailwind                    |
|----------------------|-----------|-------------------------------------|
| Orange Action        | `#F97316` | `bg-orange-500` / `text-orange-500` |
| Slate Dark           | `#0F172A` | `bg-slate-900` / `text-slate-900`   |
| Slate 300            | `#CBD5E1` | `text-slate-300`                    |
| Fond de page         | `#F8FAFC` | `bg-slate-50`                       |

### Composants UI
- **Primary CTA** : `bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-full shadow-lg shadow-orange-500/30 hover:-translate-y-0.5 transition-all`
- **Conteneurs / Cartes** : `bg-white rounded-2xl border border-slate-200 shadow-sm`
- **Inputs (focus)** : `focus:border-orange-500 focus:ring-2 focus:ring-orange-200`
- **Nav Link Hover** : `text-orange-500`
- **Tags / Labels** : `bg-orange-100 text-orange-700 text-xs font-bold px-3 py-1 rounded-full`

## 3. Structure de l'Application

| Étape | Description | Statut |
|-------|-------------|--------|
| 1 | Formulaire Client (En-tête du devis) | 🚧 En cours |
| 2 | Panier Interactif (Catalogue de prix basé sur Excel) | ⬜ À faire |
| 3 | Récapitulatif & Tarification (HT, TVA, TTC) | ⬜ À faire |
| 4 | Générateur PDF final | ⬜ À faire |

## 4. Modèles de Données

### Catalogue de produits (source : TARIF SARANGE V1 2025.xlsx)

| Catégorie | Feuille Excel | Dimensions (cm) |
|-----------|---------------|-----------------|
| Fenêtre 1 vantail | `Fenêtre 1V` | H: 55-155 / L: 50-120 |
| Fenêtre 2 vantaux | `Fenêtre 2V` | H: 55-175 / L: 80-170 |
| Fenêtre 3 vantaux | `Fenêtre 3V` | H: 55-175 / L: 150-280 |
| Fenêtre 4 vantaux | `Fenêtre 4V` | H: 55-175 / L: 180-350 |
| Fenêtre 2V+1F | `Fenêtre 2V+1F` | H: 55-175 / L: 150-280 |
| Fenêtre 2V+2F | `Fenêtre 2V+2F` | H: 55-175 / L: 180-350 |
| Fenêtre Fixe | `Fenêtre Fixe` | H: 35-175 / L: 40-280 |
| Fenêtre Soufflet | `Fenêtre Soufflet` | H: 45-105 / L: 50-160 |
| Coulissant 2V 2R | `Coulissant 2 vantaux 2 rails` | Grille 1000 lignes |
| Porte-Fenêtre 1V | `Porte-Fenêtre 1V` | H: 195-235 / L: 70-100 |
| Porte-Fenêtre 2V | `Porte-Fenêtre 2V` | H: 195-235 / L: 100-180 |
| Porte-Fenêtre 2V+1F | `Porte-Fenêtre 2V+1F` | H: 195-235 / L: 170-270 |
| Porte-Fenêtre 2V+2F | `Porte-Fenêtre 2V+2F` | H: 195-235 / L: 200-280 |
| Porte Entrée Réno | `Porte Entrée RENO` | H: 195-235 / L: 90-110 |
| Porte Entrée Neuf | `Porte Entrée NEUF` | H: 195-235 / L: 90-110 |
| Volet Filaire | `Volet Filaire` | H: 100-300 / L: 100-300 |
| Volet Radio | `Volet Radio` | H: 100-300 / L: 100-300 |

### Règles tarifaires
- **Bicoloration** : +35% après remise (sauf volets et panneaux de porte)
- **Coloration 2 faces** : +40% après remise (sauf volets et panneaux de porte)
- **Volets coloration 2 faces** : +10% sur le prix de base
- **Porte bicoloration** : +35% / coloration 2 faces : +40% sur le prix sans panneau
- **Petits bois** : +30 € par carré après remise
- **Pose menuiserie** : 250 €
- **Pose volet** : 100 €
- **Pose porte** : 400 €

## 5. Journal d'avancement

- [x] Création du fichier `architecture.md`
- [x] Initialisation du projet Next.js + Tailwind CSS
- [x] Extraction des données tarifaires Excel
- [x] Création du layout principal (Sidebar + zone de contenu)
- [ ] Création du formulaire client (Étape 1)
- [ ] Intégration du catalogue de produits (Étape 2)
- [ ] Récapitulatif et tarification (Étape 3)
- [ ] Génération PDF (Étape 4)
