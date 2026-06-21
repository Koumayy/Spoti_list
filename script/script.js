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
 * Charge les données puis initialise l'affichage.
 */
async function init() {
  try {
    const response = await fetch("data/tracks.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.tracks = await response.json();
    renderTracks(state.tracks);
  } catch (error) {
    console.error("Impossible de charger les morceaux :", error);
    tracksBody.innerHTML =
      '<tr><td colspan="4" class="text-center text-danger py-4">' +
      "Erreur lors du chargement des données.</td></tr>";
  }
}

init();
