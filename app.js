"use strict";

(function () {
    /* ── Config ── */
    const OWM_KEY = "5f0af5bbd4a8259eeb3c759055346070";
    const DEFAULT_LAT = 43.8828;
    const DEFAULT_LON = -79.4403;
    const GEO_TIMEOUT = 10000;

    /* ── State ── */
    let map;
    let apiData = {};
    let mapFrames = [];
    let lastPastFramePosition = -1;
    let radarLayers = [];
    let activeOverlay = "radar";
    let optionColorScheme = 4;
    const optionTileSize = 512;
    const optionSmoothData = 1;
    const optionSnowColors = 1;
    let animationPosition = 0;
    let animationTimer = false;
    let loadingTilesCount = 0;
    let loadedTilesCount = 0;
    let currentBaseName = "streets";
    let owmLayer = null;

    /* ── DOM refs ── */
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);
    const elLoading = $("#loading-overlay");
    const elApp = $("#app");
    const elLocation = $("#location-name");
    const elDateTime = $("#current-datetime");
    const elTimestamp = $("#timestamp");
    const elAnimControls = $("#anim-controls");
    const elColorScheme = $("#color-scheme");
    const elColors = $("#colors");

    /* ── Base Layers ── */
    const baseLayers = {
        streets: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
            maxZoom: 19
        }),
        satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Maxar, Earthstar, USDA, USGS, AeroGRID, IGN',
            maxZoom: 19
        }),
        topo: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
            maxZoom: 17
        }),
        dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
            attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
            maxZoom: 20,
            subdomains: "abcd"
        })
    };

    /* ── OWM Overlay Layers ── */
    function createOWMLayer(layer) {
        return L.tileLayer(
            "https://tile.openweathermap.org/map/" + layer + "/{z}/{x}/{y}.png?appid=" + OWM_KEY,
            { opacity: 0.6, maxZoom: 19 }
        );
    }

    /* ── Initialize Map ── */
    function initMap(lat, lon) {
        map = L.map("mapid", {
            center: [lat, lon],
            zoom: 8,
            zoomControl: true,
            layers: [baseLayers.streets]
        });

        /* Load RainViewer data */
        fetchRainViewer();

        /* Show app */
        elLoading.classList.add("hidden");
        elApp.classList.remove("hidden");

        /* Fix Leaflet rendering after container becomes visible */
        setTimeout(function () { map.invalidateSize(); }, 200);
    }

    /* ── RainViewer ── */
    function fetchRainViewer() {
        fetch("https://api.rainviewer.com/public/weather-maps.json")
            .then(r => r.json())
            .then(data => {
                apiData = data;
                initializeOverlay(activeOverlay);
            })
            .catch(err => {
                console.error("RainViewer error:", err);
                elTimestamp.textContent = "Radar data unavailable";
            });
    }

    function initializeOverlay(kind) {
        /* Clear existing radar/satellite layers */
        for (let path in radarLayers) {
            if (radarLayers[path] && map.hasLayer(radarLayers[path])) {
                map.removeLayer(radarLayers[path]);
            }
        }
        mapFrames = [];
        radarLayers = [];
        animationPosition = 0;
        loadingTilesCount = 0;
        loadedTilesCount = 0;

        /* Remove OWM layer if present */
        if (owmLayer && map.hasLayer(owmLayer)) {
            map.removeLayer(owmLayer);
            owmLayer = null;
        }

        if (!apiData) return;

        if (kind === "satellite" && apiData.satellite && apiData.satellite.infrared) {
            mapFrames = apiData.satellite.infrared;
            lastPastFramePosition = mapFrames.length - 1;
            showFrame(lastPastFramePosition, true);
            showAnimControls(true);
            showColorScheme(false);
        } else if (kind === "radar" && apiData.radar) {
            mapFrames = apiData.radar.past || [];
            if (apiData.radar.nowcast) {
                mapFrames = mapFrames.concat(apiData.radar.nowcast);
            }
            lastPastFramePosition = (apiData.radar.past || []).length - 1;
            showFrame(lastPastFramePosition, true);
            showAnimControls(true);
            showColorScheme(true);
        } else if (kind === "clouds") {
            owmLayer = createOWMLayer("clouds_new");
            owmLayer.addTo(map);
            showAnimControls(false);
            showColorScheme(false);
            elTimestamp.textContent = "";
        } else if (kind === "precipitation") {
            owmLayer = createOWMLayer("precipitation_new");
            owmLayer.addTo(map);
            showAnimControls(false);
            showColorScheme(false);
            elTimestamp.textContent = "";
        } else if (kind === "temp") {
            owmLayer = createOWMLayer("temp_new");
            owmLayer.addTo(map);
            showAnimControls(false);
            showColorScheme(false);
            elTimestamp.textContent = "";
        } else if (kind === "wind") {
            owmLayer = createOWMLayer("wind_new");
            owmLayer.addTo(map);
            showAnimControls(false);
            showColorScheme(false);
            elTimestamp.textContent = "";
        }
    }

    function showAnimControls(show) {
        elAnimControls.style.display = show ? "block" : "none";
    }

    function showColorScheme(show) {
        elColorScheme.style.display = show ? "block" : "none";
    }

    /* ── Tile Loading Tracking ── */
    function startLoadingTile() { loadingTilesCount++; }
    function finishLoadingTile() {
        setTimeout(function () { loadedTilesCount++; }, 250);
    }
    function isTilesLoading() { return loadingTilesCount > loadedTilesCount; }

    /* ── Animation ── */
    function addLayer(frame) {
        if (!radarLayers[frame.path]) {
            const isRadar = activeOverlay === "radar";
            const colorScheme = isRadar ? optionColorScheme : 0;
            const smooth = isRadar ? optionSmoothData : 0;
            const snow = isRadar ? optionSnowColors : 0;

            const source = L.tileLayer(
                apiData.host + frame.path + "/" + optionTileSize + "/{z}/{x}/{y}/" +
                colorScheme + "/" + smooth + "_" + snow + ".png",
                { tileSize: 256, opacity: 0.01, zIndex: frame.time }
            );

            source.on("loading", startLoadingTile);
            source.on("load", finishLoadingTile);
            source.on("remove", finishLoadingTile);

            radarLayers[frame.path] = source;
        }

        if (!map.hasLayer(radarLayers[frame.path])) {
            map.addLayer(radarLayers[frame.path]);
        }
    }

    function showFrame(nextPosition, force) {
        const preloadDir = nextPosition - animationPosition > 0 ? 1 : -1;
        changeRadarPosition(nextPosition, false, force);
        changeRadarPosition(nextPosition + preloadDir, true);
    }

    function changeRadarPosition(position, preloadOnly, force) {
        if (mapFrames.length === 0) return;

        while (position >= mapFrames.length) position -= mapFrames.length;
        while (position < 0) position += mapFrames.length;

        const currentFrame = mapFrames[animationPosition];
        const nextFrame = mapFrames[position];

        addLayer(nextFrame);

        if (preloadOnly || (isTilesLoading() && !force)) return;

        animationPosition = position;

        if (currentFrame && radarLayers[currentFrame.path]) {
            radarLayers[currentFrame.path].setOpacity(0);
        }
        if (radarLayers[nextFrame.path]) {
            radarLayers[nextFrame.path].setOpacity(0.7);
        }

        /* Update timestamp */
        const isFuture = nextFrame.time > Date.now() / 1000;
        const dt = new Date(nextFrame.time * 1000);
        const timeStr = dt.toLocaleString("en-US", {
            weekday: "short", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit", timeZoneName: "short"
        });

        if (isFuture) {
            elTimestamp.innerHTML = '<span class="forecast-label">Forecast</span> ' + timeStr;
        } else {
            elTimestamp.innerHTML = '<span class="past-label">Past</span> ' + timeStr;
        }
    }

    function stopAnim() {
        if (animationTimer) {
            clearTimeout(animationTimer);
            animationTimer = false;
            $("#icon-play").style.display = "";
            $("#icon-pause").style.display = "none";
            return true;
        }
        return false;
    }

    function playAnim() {
        showFrame(animationPosition + 1);
        animationTimer = setTimeout(playAnim, 500);
        $("#icon-play").style.display = "none";
        $("#icon-pause").style.display = "";
    }

    function playStop() {
        if (!stopAnim()) playAnim();
    }

    /* ── Location ── */
    function setLocation(lat, lon) {
        const locUrl = "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" +
            lat + "&longitude=" + lon + "&localityLanguage=en";
        fetch(locUrl)
            .then(r => r.json())
            .then(data => {
                const name = data.principalSubdivision
                    ? data.city + ", " + data.principalSubdivision
                    : data.city + ", " + data.countryName;
                if (elLocation) elLocation.textContent = name;
            })
            .catch(() => {
                if (elLocation) elLocation.textContent = "Unknown Location";
            });
    }

    /* ── Date/Time ── */
    function updateDateTime() {
        if (elDateTime) {
            const now = new Date();
            elDateTime.textContent = now.toLocaleString("en-US", {
                weekday: "short", year: "numeric", month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short"
            });
        }
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    /* ── Event Listeners ── */

    /* Layer tabs */
    $$(".tab-btn[data-layer]").forEach(btn => {
        btn.addEventListener("click", () => {
            $$(".tab-btn[data-layer]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            stopAnim();
            activeOverlay = btn.dataset.layer;
            initializeOverlay(activeOverlay);
        });
    });

    /* Base map buttons */
    $$(".basemap-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            $$(".basemap-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const newBase = btn.dataset.base;
            if (currentBaseName !== newBase) {
                map.removeLayer(baseLayers[currentBaseName]);
                baseLayers[newBase].addTo(map);
                currentBaseName = newBase;
            }
        });
    });

    /* Animation controls */
    $("#btn-prev").addEventListener("click", () => {
        stopAnim();
        showFrame(animationPosition - 1, true);
    });

    $("#btn-next").addEventListener("click", () => {
        stopAnim();
        showFrame(animationPosition + 1, true);
    });

    $("#btn-play").addEventListener("click", playStop);

    /* Color scheme */
    elColors.addEventListener("change", () => {
        optionColorScheme = parseInt(elColors.value, 10);
        initializeOverlay(activeOverlay);
    });

    /* Keyboard navigation */
    document.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft") {
            stopAnim();
            showFrame(animationPosition - 1, true);
            e.preventDefault();
        } else if (e.key === "ArrowRight") {
            stopAnim();
            showFrame(animationPosition + 1, true);
            e.preventDefault();
        } else if (e.key === " ") {
            playStop();
            e.preventDefault();
        }
    });

    /* ── Init ── */
    function init() {
        if (navigator.geolocation) {
            const geoTimer = setTimeout(() => {
                console.log("Geolocation timeout, using default");
                startWithCoords(DEFAULT_LAT, DEFAULT_LON);
            }, GEO_TIMEOUT);

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    clearTimeout(geoTimer);
                    startWithCoords(pos.coords.latitude, pos.coords.longitude);
                },
                () => {
                    clearTimeout(geoTimer);
                    startWithCoords(DEFAULT_LAT, DEFAULT_LON);
                },
                { timeout: GEO_TIMEOUT }
            );
        } else {
            startWithCoords(DEFAULT_LAT, DEFAULT_LON);
        }
    }

    function startWithCoords(lat, lon) {
        setLocation(lat, lon);
        initMap(lat, lon);
    }

    init();
})();
