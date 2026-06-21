// Spoti_list — mise en forme de données musicales issues de Spotify

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
    row.querySelector(".track-album").textContent = track.album?.name ?? "";
    const button = row.querySelector(".btn-details");
    button.dataset.trackId = track.id;
    button.setAttribute("aria-label", `Détails de ${track.name}`);
    tracksBody.appendChild(row);
  });
}

/**
 * Convertit une durée en millisecondes en format « m:ss ».
 */
function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/**
 * Choisit une image d'album de taille moyenne (la 2e si disponible).
 */
function getCoverUrl(track) {
  const images = track.album?.images ?? [];
  return images[1]?.url ?? images[0]?.url ?? "";
}

/**
 * Formate une date « 2022-08-31 » en « 31 août 2022 » (français).
 */
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

/**
 * Construit la liste des artistes (avatar, nom, popularité, followers)
 * dans le modal à partir d'un template.
 */
function renderModalArtists(track) {
  const list = document.getElementById("modal-artists");
  const template = document.getElementById("artist-item-template");
  list.replaceChildren();

  (track.artists ?? []).forEach((artist) => {
    const item = template.content.cloneNode(true);
    const avatar = item.querySelector(".artist-avatar");
    const avatarUrl = artist.images?.[0]?.url ?? "";
    avatar.src = avatarUrl;
    avatar.alt = avatarUrl ? `Photo de ${artist.name}` : "";

    item.querySelector(".artist-name").textContent = artist.name;
    const followers = (artist.followers?.total ?? 0).toLocaleString("fr-FR");
    item.querySelector(".artist-meta").textContent =
      `Popularité : ${artist.popularity}/100 · Followers : ${followers}`;
    list.appendChild(item);
  });
}

/**
 * Construit les badges de genres dans le modal.
 */
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

// --- Récupération des extraits audio via l'API Deezer ---------------------
// Les preview_url stockés dans le JSON expirent ~1 h après l'export. On va
// donc chercher un lien frais en direct depuis l'API Deezer. Comme cette API
// n'autorise pas le CORS, on l'appelle en JSONP (output=jsonp&callback=...).

const previewCache = new Map();
let currentPreviewToken = 0;

/**
 * Appelle une URL de l'API Deezer en JSONP et renvoie les données (Promise).
 */
function deezerJsonp(url) {
  return new Promise((resolve, reject) => {
    const callback = `deezerCb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Délai dépassé"));
    }, 8000);

    function cleanup() {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
    }

    window[callback] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("Erreur réseau"));
    };

    const separator = url.includes("?") ? "&" : "?";
    script.src = `${url}${separator}output=jsonp&callback=${callback}`;
    document.body.appendChild(script);
  });
}

/**
 * Récupère un extrait frais à partir de l'identifiant Deezer du morceau.
 */
async function fetchPreviewById(trackId) {
  const key = `id:${trackId}`;
  if (previewCache.has(key)) return previewCache.get(key);

  const data = await deezerJsonp(`https://api.deezer.com/track/${trackId}`);
  if (!data || !data.preview) throw new Error("Aucun extrait disponible");
  previewCache.set(key, data.preview);
  return data.preview;
}

/**
 * Repli : récupère un extrait via une recherche titre + artiste.
 */
async function fetchPreviewBySearch(query) {
  const key = `q:${query}`;
  if (previewCache.has(key)) return previewCache.get(key);

  const data = await deezerJsonp(
    `https://api.deezer.com/search?limit=1&q=${encodeURIComponent(query)}`
  );
  const preview = data?.data?.[0]?.preview;
  if (!preview) throw new Error("Aucun extrait disponible");
  previewCache.set(key, preview);
  return preview;
}

/**
 * Renvoie un lien d'extrait frais : d'abord via l'ID Deezer, sinon recherche.
 */
async function getFreshPreviewUrl(track) {
  if (track.id) {
    try {
      return await fetchPreviewById(track.id);
    } catch {
      /* on tente la recherche ci-dessous */
    }
  }
  return fetchPreviewBySearch(`${track.name} ${getArtistNames(track)}`);
}

/**
 * Charge l'extrait audio du morceau dans le lecteur du modal.
 */
async function loadPreview(track) {
  const preview = document.getElementById("modal-preview");
  const message = document.getElementById("modal-preview-unavailable");
  const token = ++currentPreviewToken;

  preview.pause();
  preview.removeAttribute("src");
  preview.classList.add("d-none");
  message.classList.remove("d-none");
  message.textContent = "Chargement de l'extrait…";

  try {
    const url = await getFreshPreviewUrl(track);
    if (token !== currentPreviewToken) return; // un autre morceau a été ouvert
    preview.src = url;
    preview.classList.remove("d-none");
    message.classList.add("d-none");
  } catch {
    if (token !== currentPreviewToken) return;
    preview.classList.add("d-none");
    message.textContent = "Extrait audio indisponible.";
    message.classList.remove("d-none");
  }
}

/**
 * Remplit puis ouvre le modal avec les détails d'un morceau.
 */
function openTrackModal(track) {
  const album = track.album ?? {};

  // Colonne album
  const cover = document.getElementById("modal-cover");
  const coverUrl = getCoverUrl(track);
  cover.src = coverUrl;
  cover.alt = coverUrl ? `Pochette de l'album ${album.name ?? ""}` : "";
  document.getElementById("modal-album").textContent = album.name ?? "—";
  document.getElementById("modal-album-meta").textContent =
    `${formatDate(album.release_date)} · ${album.total_tracks ?? 0} titre(s)`;
  document.getElementById("modal-album-popularity").textContent =
    `Popularité : ${album.popularity ?? 0}/100`;

  // Colonne morceau
  document.getElementById("modal-title-value").textContent = track.name;
  document.getElementById("modal-duration").textContent = formatDuration(track.duration_ms);
  document.getElementById("modal-track-number").textContent = track.track_number ?? "—";
  document.getElementById("modal-explicit").textContent = track.explicit ? "Oui" : "Non";

  // Popularité du morceau (barre + texte)
  const popularity = track.popularity ?? 0;
  document.getElementById("modal-popularity").textContent = `${popularity}/100`;
  const bar = document.getElementById("modal-popularity-bar");
  bar.style.width = `${popularity}%`;
  document
    .getElementById("modal-popularity-progress")
    .setAttribute("aria-label", `Popularité : ${popularity} sur 100`);

  renderModalArtists(track);
  renderModalGenres(track);

  // Lecteur audio : on récupère un lien frais depuis l'API Deezer
  // (les preview_url du JSON expirent ~1 h après l'export).
  loadPreview(track);

  // Lien « Ouvrir dans Spotify » (recherche du titre + artistes)
  const query = encodeURIComponent(`${track.name} ${getArtistNames(track)}`);
  document.getElementById("modal-spotify").href =
    `https://open.spotify.com/search/${query}`;

  bootstrap.Modal.getOrCreateInstance(document.getElementById("track-modal")).show();
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
 * Remplit une liste cachée servant d'alternative textuelle à un graphique
 * (accessibilité : les données restent lisibles par les lecteurs d'écran).
 */
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
  fillChartDescription("artists-chart-desc", top, "morceau(x)");

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
  fillChartDescription("genres-chart-desc", entries, "morceau(x)");

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

    // Ouverture du modal au clic sur un bouton « Détails »
    tracksBody.addEventListener("click", (event) => {
      const button = event.target.closest(".btn-details");
      if (!button) return;
      const track = state.tracks.find((t) => t.id === button.dataset.trackId);
      if (track) openTrackModal(track);
    });

    // Filtrage de la liste (titre, artiste ou album)
    const searchInput = document.getElementById("search");
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim().toLowerCase();
      const filtered = state.tracks.filter((t) =>
        t.name.toLowerCase().includes(query) ||
        getArtistNames(t).toLowerCase().includes(query) ||
        (t.album?.name ?? "").toLowerCase().includes(query)
      );
      renderTracks(filtered);
    });
  } catch (error) {
    console.error("Impossible de charger les morceaux :", error);
    tracksBody.innerHTML =
      '<tr><td colspan="4" class="text-center text-danger py-4">' +
      "Erreur lors du chargement des données.</td></tr>";
  }
}

init();
