// Les musiques du Marill — mise en forme de données musicales issues de Spotify

// État de l'application
const state = {
  tracks: [],
};

// Raccourcis DOM
const tracksBody = document.getElementById("tracks-body");
const rowTemplate = document.getElementById("track-row-template");

/**
 * Renvoie la liste des noms d'artistes d'un morceau, séparés par des virgules.
 */
function getArtistNames(track) {
  return (track.artists || []).map((a) => a.name).join(", ");
}

/**
 * Construit le tableau des morceaux à partir du template HTML.
 */
function renderTracks(tracks) {
  tracksBody.replaceChildren();

  tracks.forEach((track) => {
    const row = rowTemplate.content.cloneNode(true);
    row.querySelector(".track-title").textContent = track.name;
    row.querySelector(".track-artist").textContent = getArtistNames(track);
    row.querySelector(".track-album").textContent = track.album?.name ?? "";
    tracksBody.appendChild(row);
  });
}

/**
 * Renvoie l'ensemble (dédoublonné) des genres d'un morceau,
 * en combinant les genres de l'album et ceux des artistes.
 */
function getTrackGenres(track) {
  const genres = new Set(track.album?.genres ?? []);
  (track.artists ?? []).forEach((a) =>
    (a.genres ?? []).forEach((g) => genres.add(g))
  );
  return [...genres];
}

/**
 * Compte les occurrences puis renvoie les n entrées les plus fréquentes,
 * sous forme [{ label, value }] triées par valeur décroissante.
 */
function topEntries(counts, n) {
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

/**
 * Graphique en barres horizontales : top 10 des artistes par nb de morceaux.
 */
function renderArtistsChart(tracks) {
  const counts = {};
  tracks.forEach((t) =>
    (t.artists ?? []).forEach((a) => {
      counts[a.name] = (counts[a.name] ?? 0) + 1;
    })
  );
  const top = topEntries(counts, 10);

  new Chart(document.getElementById("artists-chart"), {
    type: "bar",
    data: {
      labels: top.map((e) => e.label),
      datasets: [
        {
          label: "Nombre de morceaux",
          data: top.map((e) => e.value),
          backgroundColor: "#6ea8fe",
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

/**
 * Graphique circulaire : distribution des genres musicaux.
 */
function renderGenresChart(tracks) {
  const counts = {};
  tracks.forEach((t) =>
    getTrackGenres(t).forEach((g) => {
      counts[g] = (counts[g] ?? 0) + 1;
    })
  );
  const entries = topEntries(counts, 99);

  const palette = [
    "#f48fb1", "#90caf9", "#ffe082", "#a5d6a7", "#ce93d8",
    "#ffab91", "#80deea", "#bcaaa4", "#e6ee9c", "#b0bec5",
  ];

  new Chart(document.getElementById("genres-chart"), {
    type: "pie",
    data: {
      labels: entries.map((e) => e.label),
      datasets: [
        {
          data: entries.map((e) => e.value),
          backgroundColor: entries.map((_, i) => palette[i % palette.length]),
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "right" } },
    },
  });
}

/**
 * Charge les données puis initialise l'affichage.
 */
async function init() {
  try {
    const response = await fetch("data/tracks.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.tracks = await response.json();
    renderTracks(state.tracks);
    renderArtistsChart(state.tracks);
    renderGenresChart(state.tracks);
  } catch (error) {
    console.error("Impossible de charger les morceaux :", error);
    tracksBody.innerHTML =
      '<tr><td colspan="4" class="text-center text-danger py-4">' +
      "Erreur lors du chargement des données.</td></tr>";
  }
}

init();
