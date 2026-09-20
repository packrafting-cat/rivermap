const DIFFICULTY_COLORS = {
  "II": "#2ca25f",
  "III": "#78b7d9",
  "IV": "#f1b641",
  "IV+": "#e87b32",
  "V": "#d94841",
  "V+": "#7b2cbf"
};

let map;
let riverData = null;
let selectedDifficulties = new Set(["II", "III", "IV", "IV+", "V", "V+"]);

const sourceId = "river-sections";
const lineLayerId = "river-sections-line";
const lineOutlineLayerId = "river-sections-outline";

const searchInput = document.getElementById("search");
const clearSearchButton = document.getElementById("clear-search");
const countElement = document.getElementById("section-count");
const loadingElement = document.getElementById("loading");
const resetViewButton = document.getElementById("reset-view");
const mobilePanelToggle = document.getElementById("mobile-panel-toggle");
const sidebar = document.querySelector(".sidebar");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSelectedFeatures() {
  if (!riverData) return [];

  const search = searchInput.value.trim().toLowerCase();

  return riverData.features.filter((feature) => {
    const p = feature.properties || {};
    const difficulty = String(p.difficulty || "");

    if (!selectedDifficulties.has(difficulty)) {
      return false;
    }

    if (!search) {
      return true;
    }

    const haystack = [
      p.river,
      p.section,
      p.country,
      p.region,
      p.description
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });
}

function updateMapData() {
  const features = getSelectedFeatures();

  if (!map || !map.getSource(sourceId)) return;

  map.getSource(sourceId).setData({
    type: "FeatureCollection",
    features
  });

  countElement.textContent = features.length;
}

function difficultyColorExpression() {
  return [
    "match",
    ["get", "difficulty"],
    "II", DIFFICULTY_COLORS["II"],
    "III", DIFFICULTY_COLORS["III"],
    "IV", DIFFICULTY_COLORS["IV"],
    "IV+", DIFFICULTY_COLORS["IV+"],
    "V", DIFFICULTY_COLORS["V"],
    "V+", DIFFICULTY_COLORS["V+"],
    "#607080"
  ];
}

function buildPopup(feature) {
  const p = feature.properties || {};
  const difficulty = escapeHtml(p.difficulty || "—");
  const color = DIFFICULTY_COLORS[p.difficulty] || "#607080";

  const links = [];

  if (p.wikiloc) {
    links.push(
      `<a href="${escapeHtml(p.wikiloc)}" target="_blank" rel="noopener">Wikiloc ↗</a>`
    );
  }

  if (p.guide_url) {
    links.push(
      `<a href="${escapeHtml(p.guide_url)}" target="_blank" rel="noopener">Guía ↗</a>`
    );
  }

  return `
    <div class="popup">
      <div class="popup-header">
        <p class="popup-river">${escapeHtml(p.river || "Río")}</p>
        <h2 class="popup-title">${escapeHtml(p.section || "Sección")}</h2>
      </div>

      <div class="popup-body">
        <div class="popup-badges">
          <span
            class="badge difficulty"
            style="background:${color}"
          >${difficulty}</span>

          ${p.country ? `<span class="badge">${escapeHtml(p.country)}</span>` : ""}
          ${p.region ? `<span class="badge">${escapeHtml(p.region)}</span>` : ""}
        </div>

        <div class="popup-grid">
          <div>
            <span class="popup-field-label">Longitud</span>
            <span class="popup-field-value">${escapeHtml(p.length_km)} km</span>
          </div>

          <div>
            <span class="popup-field-label">Pendiente</span>
            <span class="popup-field-value">${escapeHtml(p.gradient_m_km)} m/km</span>
          </div>

          <div>
            <span class="popup-field-label">Put-in</span>
            <span class="popup-field-value">${escapeHtml(p.put_in)}</span>
          </div>

          <div>
            <span class="popup-field-label">Take-out</span>
            <span class="popup-field-value">${escapeHtml(p.take_out)}</span>
          </div>
        </div>

        ${
          p.description
            ? `<p class="popup-description">${escapeHtml(p.description)}</p>`
            : ""
        }

        ${links.length ? `<div class="popup-links">${links.join("")}</div>` : ""}
      </div>
    </div>
  `;
}

function fitToFeatures(features) {
  if (!features.length) return;

  const bounds = new maplibregl.LngLatBounds();

  features.forEach((feature) => {
    const coordinates = feature.geometry.coordinates;

    coordinates.forEach((coordinate) => {
      bounds.extend(coordinate);
    });
  });

  map.fitBounds(bounds, {
    padding: {
      top: 80,
      bottom: 80,
      left: 80,
      right: 80
    },
    maxZoom: 12,
    duration: 900
  });
}

async function loadGeoJSON() {
  const response = await fetch("data/rivers.geojson");

  if (!response.ok) {
    throw new Error(`No se pudo cargar rivers.geojson (${response.status})`);
  }

  riverData = await response.json();
}

function initialiseMap() {
  map = new maplibregl.Map({
    container: "map",

    // Demo style público de MapLibre.
    // Más adelante podemos cambiarlo por un estilo propio
    // (MapTiler, Stadia, OpenFreeMap, etc.).
    style: "https://demotiles.maplibre.org/style.json",

    center: [10, 35],
    zoom: 2
  });

  map.addControl(
    new maplibregl.NavigationControl({
      visualizePitch: true
    }),
    "top-right"
  );

  map.addControl(
    new maplibregl.ScaleControl({
      maxWidth: 120,
      unit: "metric"
    }),
    "bottom-right"
  );

  map.on("load", () => {
    map.addSource(sourceId, {
      type: "geojson",
      data: riverData
    });

    // Línea exterior para darle algo más de contraste.
    map.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": difficultyColorExpression(),
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1, 2,
          5, 3,
          9, 5,
          14, 7
        ],
        "line-opacity": 0.9
      }
    });

    // Capa invisible ligeramente más gruesa para facilitar el clic.
    map.addLayer({
      id: lineOutlineLayerId,
      type: "line",
      source: sourceId,
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": "rgba(0,0,0,0)",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1, 8,
          5, 10,
          9, 13,
          14, 16
        ]
      }
    });

    map.on("mouseenter", lineLayerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", lineLayerId, () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", lineLayerId, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;

      new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        offset: 12,
        maxWidth: "370px"
      })
        .setLngLat(event.lngLat)
        .setHTML(buildPopup(feature))
        .addTo(map);
    });

    // También hacemos clic sobre la capa invisible.
    map.on("mouseenter", lineOutlineLayerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", lineOutlineLayerId, () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", lineOutlineLayerId, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;

      new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        offset: 12,
        maxWidth: "370px"
      })
        .setLngLat(event.lngLat)
        .setHTML(buildPopup(feature))
        .addTo(map);
    });

    updateMapData();
    fitToFeatures(riverData.features);
    loadingElement.style.display = "none";
  });
}

function initialiseControls() {
  document
    .querySelectorAll('#difficulty-filters input[type="checkbox"]')
    .forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedDifficulties.add(checkbox.value);
        } else {
          selectedDifficulties.delete(checkbox.value);
        }

        updateMapData();
      });
    });

  searchInput.addEventListener("input", () => {
    updateMapData();
  });

  clearSearchButton.addEventListener("click", () => {
    searchInput.value = "";
    updateMapData();
    searchInput.focus();
  });

  resetViewButton.addEventListener("click", () => {
    searchInput.value = "";

    selectedDifficulties = new Set(
      [...document.querySelectorAll('#difficulty-filters input[type="checkbox"]')]
        .map((checkbox) => checkbox.value)
    );

    document
      .querySelectorAll('#difficulty-filters input[type="checkbox"]')
      .forEach((checkbox) => {
        checkbox.checked = true;
      });

    updateMapData();
    fitToFeatures(riverData.features);
  });

  mobilePanelToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

async function init() {
  try {
    initialiseControls();
    await loadGeoJSON();
    initialiseMap();
  } catch (error) {
    console.error(error);
    loadingElement.innerHTML = `
      <strong>Error:</strong>&nbsp; ${escapeHtml(error.message)}
    `;
  }
}

init();
