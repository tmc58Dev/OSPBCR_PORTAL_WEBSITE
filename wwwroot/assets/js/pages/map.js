// =====================================
// MAP INITIALIZATION
// =====================================

const map = L.map("map").setView([20.3, 85.8], 7);
const districtLayers = new Map();
const leafletDistrictNameAliases = Object.freeze({
    Baleshwar: "Balasore",
    Debagarh: "Deogarh",
    Jajapur: "Jajpur",
    Kendujhar: "Keonjhar",
    Nabarangapur: "Nabarangpur",
    Subarnapur: "Sonepur"
});
const toSqlDistrictName = districtName =>
    leafletDistrictNameAliases[districtName] || districtName;
const districtBaseStyle = {
    color: "#ffffff",
    weight: 1,
    fillColor: "#1E7FB8",
    fillOpacity: 0.75
};
const districtHighlightStyle = {
    fillColor: "#930140",
    fillOpacity: 0.95,
    weight: 2,
    color: "#000"
};
let selectedDistrict = "Khordha";
let selectedDistrictLayer = null;
let selectedDistrictLabel = null;
window.selectedMapDistrict = selectedDistrict;

function showSelectedDistrictLabel(districtName, districtLayer) {
    if (selectedDistrictLabel) {
        map.removeLayer(selectedDistrictLabel);
    }

    const labelContent = document.createElement("span");
    labelContent.textContent = t(districtName);

    selectedDistrictLabel = L.tooltip({
        permanent: true,
        direction: "top",
        className: "district-label selected-district-label",
        interactive: false,
        opacity: 1,
        offset: [0, -4]
    })
        .setLatLng(districtLayer.getBounds().getCenter())
        .setContent(labelContent)
        .addTo(map);
}

function highlightDistrictOnMap(districtName) {
    const sqlDistrictName = toSqlDistrictName(districtName);
    const districtLayer = districtLayers.get(sqlDistrictName);

    if (!districtLayer) {
        return;
    }

    if (selectedDistrictLayer && selectedDistrictLayer !== districtLayer) {
        selectedDistrictLayer.setStyle(districtBaseStyle);
    }

    selectedDistrictLayer = districtLayer;
    selectedDistrictLayer.setStyle(districtHighlightStyle);
    selectedDistrictLayer.bringToFront?.();
    showSelectedDistrictLabel(sqlDistrictName, districtLayer);
}

// =====================================
// TILE LAYER
// =====================================

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution: "© OpenStreetMap Contributors"
    }
).addTo(map);

// =====================================
// UPDATE SIDE PANEL
// =====================================

const t = (key, replacements = {}) => {
    if (window.i18n) return window.i18n.t(key, replacements);

    return Object.entries(replacements).reduce(
        (value, [name, replacement]) => value.replaceAll(`{{${name}}}`, replacement),
        key
    );
};

function updatePanel(districtName) {

    const panel = document.getElementById("infoPanel");

    const data = districtData[districtName];
    const unavailable = t("Not Available");
    const normalizeNumber = (value) => Number(String(value).replace(/,/g, ""));
    const statValue = (value, options = {}) => {
        if (!value) return `<span>${unavailable}</span>`;

        if (!options.count) return `<span>${value}</span>`;

        const numberValue = normalizeNumber(value);
        if (Number.isNaN(numberValue)) return `<span>${value}</span>`;

        return `<span data-count-to="${numberValue}" data-count-format="locale">${value}</span>`;
    };
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    }[character]));
    const renderDistrictOptions = () => Object.keys(districtData)
        .sort((firstDistrict, secondDistrict) => firstDistrict.localeCompare(secondDistrict))
        .map(district => `
            <option value="${escapeHtml(district)}"${district === districtName ? " selected" : ""}>
                ${escapeHtml(t(district))}
            </option>
        `)
        .join("");
    const districtFilter = `
        <div class="info-panel-filter">
            <label for="districtStatisticsFilter">${t("Select District")}</label>
            <select id="districtStatisticsFilter" aria-label="${t("Select district for cancer statistics")}">
                ${renderDistrictOptions()}
            </select>
        </div>
    `;
    const bindDistrictFilter = () => {
        const districtSelect = panel.querySelector("#districtStatisticsFilter");

        districtSelect?.addEventListener("change", event => {
            renderSelectedDistrict(event.target.value);
        });
    };

    if (!data) {

        panel.innerHTML = `
            <div class="info-panel-header">
                <span>${t("PBCR Odisha")}</span>
                <h2>${t("District Cancer Statistics")} 2025</h2>
            </div>

            ${districtFilter}

            <div class="info-stats-grid">
                <div class="info-stat">
                    <strong>${t("District Name")}</strong>
                    <span>${t(districtName)}</span>
                </div>
                <div class="info-stat">
                    <strong>${t("Population as of 2025")}</strong>
                    <span>${unavailable}</span>
                </div>
                <div class="info-stat">
                    <strong>${t("Cancer Cases")}</strong>
                    <span>${unavailable}</span>
                </div>
                <div class="info-stat">
                    <strong>${t("Incident Cancer Cases")}</strong>
                    <span>${unavailable}</span>
                </div>
                <div class="info-stat">
                    <strong>${t("Mortality Cancer Cases")}</strong>
                    <span>${unavailable}</span>
                </div>
            </div>
        `;

        bindDistrictFilter();

        return;
    }

    panel.innerHTML = `
        <div class="info-panel-header">
            <span>${t("PBCR Odisha")}</span>
            <h2>${t("District Cancer Statistics")} 2025</h2>
        </div>

        ${districtFilter}

        <div class="info-stats-grid">
            <div class="info-stat info-stat-wide">
                <strong>${t("District Name")}</strong>
                <span>${t(districtName)}</span>
            </div>

            <div class="info-stat">
                <strong>${t("Population as of 2025")}</strong>
                ${statValue(data.population, { count: true })}
            </div>

            <div class="info-stat">
                <strong>${t("Cancer Cases")}</strong>
                ${statValue(data.cancerCases, { count: true })}
            </div>

            <div class="info-stat">
                <strong>${t("Incident Cancer Cases")}</strong>
                ${statValue(data.incidentCancerCases, { count: true })}
            </div>

            <div class="info-stat">
                <strong>${t("Mortality Cancer Cases")}</strong>
                ${statValue(data.mortalityCancerCases, { count: true })}
            </div>
        </div>
    `;

    bindDistrictFilter();

    window.initializeCountUp?.(panel);
}

const renderSelectedDistrict = (districtName) => {
    districtName = toSqlDistrictName(districtName);
    const districtChanged = selectedDistrict !== districtName;

    selectedDistrict = districtName;
    window.selectedMapDistrict = districtName;
    updatePanel(districtName);
    highlightDistrictOnMap(districtName);

    if (districtChanged) {
        document.dispatchEvent(new CustomEvent("districtchange", {
            detail: { district: districtName }
        }));
    }
};

document.addEventListener("languagechange", () => renderSelectedDistrict(selectedDistrict));

// =====================================
// COLLAPSE MAP WHILE PAGE SCROLLS DOWN
// =====================================

const dashboardCollapseBreakpoint = 1200;
const dashboardCollapseOffset = 40;
let lastScrollY = window.scrollY;

function syncDashboardScrollState() {

    const isDesktopLayout = window.innerWidth > dashboardCollapseBreakpoint;
    const currentScrollY = window.scrollY;
    const isScrollingDown = currentScrollY > lastScrollY;
    const shouldCollapse =
        isDesktopLayout &&
        isScrollingDown &&
        currentScrollY > dashboardCollapseOffset;
    const shouldExpand =
        !isDesktopLayout ||
        currentScrollY <= dashboardCollapseOffset;

    if (shouldCollapse) {

        document.body.classList.add("map-dashboard-collapsed");
    }

    if (shouldExpand) {

        document.body.classList.remove("map-dashboard-collapsed");

        window.setTimeout(
            () => map.invalidateSize(),
            380
        );
    }

    lastScrollY = Math.max(currentScrollY, 0);
}

window.addEventListener(
    "scroll",
    () => window.requestAnimationFrame(syncDashboardScrollState),
    { passive: true }
);

window.addEventListener(
    "resize",
    () => window.requestAnimationFrame(syncDashboardScrollState),
    { passive: true }
);

// =====================================
// DEFAULT DISTRICT
// =====================================

window.addEventListener("load", async () => {
    await window.loadDistrictDataFromApi?.();
    renderSelectedDistrict("Khordha");
});

// =====================================
// LOAD GEOJSON
// =====================================

fetch("assets/data/Orissa.geojson?v=20260727-sql-district-names-v2")

.then(response => response.json())

.then(data => {

    const geoLayer = L.geoJSON(data, {

        style: districtBaseStyle,

        onEachFeature: function(feature, layer) {

            const districtName = toSqlDistrictName(
                feature.properties.Dist_Name
            );

            districtLayers.set(districtName, layer);

            layer.on({

                click: function() {

                    renderSelectedDistrict(districtName);
                }

            });
        }

    }).addTo(map);

    map.fitBounds(
        geoLayer.getBounds()
    );

    highlightDistrictOnMap(selectedDistrict);

})

.catch(error => {

    console.error(
        "GeoJSON Error:",
        error
    );

});
