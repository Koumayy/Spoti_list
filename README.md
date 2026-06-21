# Spoti_list

Petit site web qui met en forme un jeu de données musicales issu de Spotify
(32 morceaux exportés au format JSON).
Lien vers le site: https://koumayy.github.io/Spoti_list/
## Fonctionnalités

- **Liste des morceaux** générée dynamiquement depuis `data/tracks.json`
  via l'élément HTML `<template>` (titre, artiste(s), album).
- **Graphiques Chart.js** :
  - Top 10 des artistes par nombre de morceaux (barres horizontales) ;
  - Distribution des genres musicaux (camembert).
- **Détails d'un morceau** dans un modal Bootstrap : pochette, artistes,
  album, genres, durée, date de sortie, popularité et extrait audio.
- **Barre de recherche** filtrant par titre, artiste ou album.
- **Responsive** (mise en page Bootstrap) et **accessible** (WCAG) :
  contrastes AA, hiérarchie de titres, `aria-label`, alternatives
  textuelles des graphiques.

## Technologies

- [Bootstrap 5](https://getbootstrap.com/) — mise en page et composants
- [Chart.js](https://www.chartjs.org/) — graphiques
- JavaScript natif (aucun framework)

## Lancer le projet

Le chargement des données utilise `fetch`, il faut donc servir le dossier
via un serveur local (le double-clic sur `index.html` ne suffit pas) :

```bash
npx http-server . -p 8080
```

Puis ouvrir <http://localhost:8080>.

## Structure

```
Spoti_list/
├── index.html        # Structure de la page + templates
├── style/style.css   # Styles personnalisés (couleurs de la marque)
├── script/script.js  # Chargement des données, tableau, graphiques, modal
└── data/tracks.json  # Jeu de données (32 morceaux)
```
