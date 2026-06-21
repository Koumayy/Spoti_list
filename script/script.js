// Spoti_list — mise en forme de données musicales (playlists exportées de Spotify)

// État de l'application
const state = {
  playlists: [],     // index des playlists (data/playlists.json)
  tracks: [],        // morceaux de la playlist affichée
  currentId: null,   // id de la playlist affichée
};

let artistsChart = null;
let genresChart = null;

// Raccourcis DOM
const tracksBody = document.getElementById("tracks-body");
const rowTemplate = document.getElementById("track-row-template");
const playlistList = document.getElementById("playlist-list");
const playlistCardTemplate = document.getElementById("playlist-card-template");
const searchInput = document.getElementById("search");

// --- Helpers données --------------------------------------------------------

/** Noms des artistes d'un morceau, séparés par des virgules. */
function getArtistNames(track) {
  return (track.artists ?? []).join(", ");
}

/** Genres d'un morceau (tableau). */
function getTrackGenres(track) {
  return track.genres ?? [];
}

/** Convertit une durée en millisecondes au format « m:ss ». */
function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Formate une date « 2022-08-31 » en « 31 août 2022 » (français). */
function formatDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// --- Liste des morceaux -----------------------------------------------------

/** Construit le tableau des morceaux à partir du template HTML. */
function renderTracks(tracks) {
  tracksBody.replaceChildren();

  if (tracks.length === 0) {
    tracksBody.innerHTML =
      '<tr><td colspan="4" class="text-center text-muted py-4">' +
      "Aucun morceau ne correspond à votre recherche.</td></tr>";
    return;
  }

  tracks.forEach((track) => {
    const row = rowTemplate.content.cloneNode(true);
    row.querySelector(".track-title").textContent = track.name;
    row.querySelector(".track-artist").textContent = getArtistNames(track);
    row.querySelector(".track-album").textContent = track.album ?? "";
    const button = row.querySelector(".btn-details");
    button.dataset.trackId = track.id;
    button.setAttribute("aria-label", `Détails de ${track.name}`);
    tracksBody.appendChild(row);
  });
}

// --- Graphiques -------------------------------------------------------------

/** Compte les occurrences et renvoie les n entrées les plus fréquentes. */
function topEntries(counts, n) {
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

/** Remplit une alternative textuelle cachée pour un graphique (accessibilité). */
function fillChartDescription(id, entries, unit) {
  const list = document.getElementById(id);
  if (!list) return;
  list.replaceChildren();
  entries.forEach((e) => {
    const item = document.createElement("li");
    item.textContent = `${e.label} : ${e.value} ${unit}`;
    list.appendChild(item);
  });
}

/** Graphique en barres horizontales : top 10 des artistes. */
function renderArtistsChart(tracks) {
  const counts = {};
  tracks.forEach((t) =>
    (t.artists ?? []).forEach((name) => {
      counts[name] = (counts[name] ?? 0) + 1;
    })
  );
  const top = topEntries(counts, 10);
  fillChartDescription("artists-chart-desc", top, "morceau(x)");

  if (artistsChart) artistsChart.destroy();
  artistsChart = new Chart(document.getElementById("artists-chart"), {
    type: "bar",
    data: {
      labels: top.map((e) => e.label),
      datasets: [
        { label: "Nombre de morceaux", data: top.map((e) => e.value), backgroundColor: "#6ea8fe" },
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

/** Graphique circulaire : distribution des genres. */
function renderGenresChart(tracks) {
  const counts = {};
  tracks.forEach((t) =>
    getTrackGenres(t).forEach((g) => {
      counts[g] = (counts[g] ?? 0) + 1;
    })
  );
  const entries = topEntries(counts, 12);
  fillChartDescription("genres-chart-desc", entries, "morceau(x)");

  const palette = [
    "#f48fb1", "#90caf9", "#ffe082", "#a5d6a7", "#ce93d8", "#ffab91",
    "#80deea", "#bcaaa4", "#e6ee9c", "#b0bec5", "#9fa8da", "#f8bbd0",
  ];

  if (genresChart) genresChart.destroy();
  genresChart = new Chart(document.getElementById("genres-chart"), {
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
    options: { responsive: true, plugins: { legend: { position: "right" } } },
  });
}

// --- Enrichissement Deezer (extrait audio + pochette) -----------------------
// Les CSV ne contiennent ni extrait ni image. On interroge l'API Deezer en
// JSONP (pas de CORS) par recherche titre + artiste. Une seule requête fournit
// l'extrait audio, la pochette de l'album et la photo de l'artiste.

const deezerCache = new Map();

function deezerJsonp(url) {
  return new Promise((resolve, reject) => {
    const callback = `deezerCb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timer = setTimeout(() => { cleanup(); reject(new Error("Délai dépassé")); }, 8000);
    function cleanup() {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
    }
    window[callback] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("Erreur réseau")); };
    const separator = url.includes("?") ? "&" : "?";
    script.src = `${url}${separator}output=jsonp&callback=${callback}`;
    document.body.appendChild(script);
  });
}

/** Recherche un morceau sur Deezer et renvoie { preview, cover, artistPicture }. */
async function fetchDeezerInfo(track) {
  if (deezerCache.has(track.id)) return deezerCache.get(track.id);

  const query = `${track.name} ${getArtistNames(track)}`;
  const data = await deezerJsonp(
    `https://api.deezer.com/search?limit=1&q=${encodeURIComponent(query)}`
  );
  const hit = data?.data?.[0];
  const info = {
    preview: hit?.preview || null,
    cover: hit?.album?.cover_big || hit?.album?.cover_medium || null,
    artistPicture: hit?.artist?.picture_medium || null,
  };
  deezerCache.set(track.id, info);
  return info;
}

// --- Modal des détails ------------------------------------------------------

const PLACEHOLDER_COVER =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220">' +
    '<rect width="100%" height="100%" fill="#dee2e6"/>' +
    '<text x="50%" y="50%" font-family="sans-serif" font-size="16" fill="#6c757d" ' +
    'text-anchor="middle" dominant-baseline="middle">Pas de pochette</text></svg>'
  );

let currentPreviewToken = 0;

function openTrackModal(track) {
  // Colonne album (cover chargée ensuite via Deezer)
  const cover = document.getElementById("modal-cover");
  cover.src = PLACEHOLDER_COVER;
  cover.alt = "";
  document.getElementById("modal-album").textContent = track.album ?? "—";
  document.getElementById("modal-album-meta").textContent = formatDate(track.releaseDate);

  // Colonne morceau
  document.getElementById("modal-title-value").textContent = track.name;
  document.getElementById("modal-duration").textContent = formatDuration(track.duration_ms);
  document.getElementById("modal-explicit").textContent = track.explicit ? "Oui" : "Non";
  document.getElementById("modal-label").textContent = track.label || "—";

  const popularity = track.popularity ?? 0;
  document.getElementById("modal-popularity").textContent = `${popularity}/100`;
  const bar = document.getElementById("modal-popularity-bar");
  bar.style.width = `${popularity}%`;
  document
    .getElementById("modal-popularity-progress")
    .setAttribute("aria-label", `Popularité : ${popularity} sur 100`);

  renderModalArtists(track);
  renderModalGenres(track);

  // Lien Spotify (URI réel du CSV)
  document.getElementById("modal-spotify").href = track.spotifyUrl ?? "#";

  // Chargement Deezer (extrait + pochette)
  loadDeezer(track, cover);

  bootstrap.Modal.getOrCreateInstance(document.getElementById("track-modal")).show();
}

function renderModalArtists(track) {
  const list = document.getElementById("modal-artists");
  list.replaceChildren();
  (track.artists ?? []).forEach((name) => {
    const badge = document.createElement("span");
    badge.className = "badge bg-light text-dark border";
    badge.textContent = name;
    list.appendChild(badge);
  });
}

function renderModalGenres(track) {
  const container = document.getElementById("modal-genres");
  container.replaceChildren();
  const genres = getTrackGenres(track);
  if (genres.length === 0) {
    container.textContent = "—";
    return;
  }
  genres.forEach((genre) => {
    const badge = document.createElement("span");
    badge.className = "badge bg-secondary";
    badge.textContent = genre;
    container.appendChild(badge);
  });
}

/** Charge l'extrait audio et la pochette depuis Deezer pour le modal. */
async function loadDeezer(track, cover) {
  const preview = document.getElementById("modal-preview");
  const message = document.getElementById("modal-preview-unavailable");
  const token = ++currentPreviewToken;

  preview.pause();
  preview.removeAttribute("src");
  preview.classList.add("d-none");
  message.classList.remove("d-none");
  message.textContent = "Chargement de l'extrait…";

  try {
    const info = await fetchDeezerInfo(track);
    if (token !== currentPreviewToken) return; // un autre morceau a été ouvert

    if (info.cover) {
      cover.src = info.cover;
      cover.alt = `Pochette de l'album ${track.album ?? ""}`;
    }
    if (info.preview) {
      preview.src = info.preview;
      preview.classList.remove("d-none");
      message.classList.add("d-none");
    } else {
      message.textContent = "Extrait audio indisponible.";
    }
  } catch {
    if (token !== currentPreviewToken) return;
    message.textContent = "Extrait audio indisponible.";
  }
}

// --- Sélecteur de playlists -------------------------------------------------

/** Construit les cartes du sélecteur de playlists (via template). */
function renderPlaylistCards() {
  playlistList.replaceChildren();
  state.playlists.forEach((pl) => {
    const card = playlistCardTemplate.content.cloneNode(true);
    const button = card.querySelector(".playlist-card");
    button.dataset.playlistId = pl.id;
    const img = card.querySelector(".playlist-cover");
    img.src = pl.cover || PLACEHOLDER_COVER;
    img.alt = `Pochette de la playlist ${pl.name}`;
    card.querySelector(".playlist-name").textContent = pl.name;
    card.querySelector(".playlist-count").textContent = `${pl.count} titres`;
    playlistList.appendChild(card);
  });
}

/** Met en évidence la carte de la playlist active. */
function highlightActiveCard() {
  playlistList.querySelectorAll(".playlist-card").forEach((card) => {
    const active = card.dataset.playlistId === state.currentId;
    card.classList.toggle("active", active);
    card.setAttribute("aria-selected", active ? "true" : "false");
  });
}

/** Charge et affiche une playlist. */
async function loadPlaylist(id) {
  const playlist = state.playlists.find((p) => p.id === id);
  if (!playlist) return;
  state.currentId = id;
  highlightActiveCard();

  const response = await fetch(playlist.file);
  state.tracks = await response.json();

  searchInput.value = "";
  renderTracks(state.tracks);
  renderArtistsChart(state.tracks);
  renderGenresChart(state.tracks);
}

// --- Initialisation ---------------------------------------------------------

async function init() {
  try {
    const response = await fetch("data/playlists.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.playlists = await response.json();

    renderPlaylistCards();
    await loadPlaylist(state.playlists[0].id);

    // Changement de playlist
    playlistList.addEventListener("click", (event) => {
      const card = event.target.closest(".playlist-card");
      if (card) loadPlaylist(card.dataset.playlistId);
    });

    // Ouverture du modal de détails
    tracksBody.addEventListener("click", (event) => {
      const button = event.target.closest(".btn-details");
      if (!button) return;
      const track = state.tracks.find((t) => t.id === button.dataset.trackId);
      if (track) openTrackModal(track);
    });

    // Filtrage de la liste (titre, artiste ou album)
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim().toLowerCase();
      const filtered = state.tracks.filter((t) =>
        t.name.toLowerCase().includes(query) ||
        getArtistNames(t).toLowerCase().includes(query) ||
        (t.album ?? "").toLowerCase().includes(query)
      );
      renderTracks(filtered);
    });
  } catch (error) {
    console.error("Impossible de charger les playlists :", error);
    tracksBody.innerHTML =
      '<tr><td colspan="4" class="text-center text-danger py-4">' +
      "Erreur lors du chargement des données.</td></tr>";
  }
}

init();
