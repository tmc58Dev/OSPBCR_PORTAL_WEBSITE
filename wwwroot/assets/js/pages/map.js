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
let selectedDistrict = "";
let selectedDistrictLayer = null;
let selectedDistrictLabel = null;
window.selectedMapDistrict = selectedDistrict;

function clearSelectedDistrictHighlight() {
    if (selectedDistrictLayer) {
        selectedDistrictLayer.setStyle(districtBaseStyle);
        selectedDistrictLayer = null;
    }

    if (selectedDistrictLabel) {
        selectedDistrictLabel.getElement()?.classList.remove("selected-district-label");
        selectedDistrictLabel = null;
    }
}

function showSelectedDistrictLabel(districtName, districtLayer) {
    if (selectedDistrictLabel) {
        selectedDistrictLabel.getElement()?.classList.remove("selected-district-label");
    }

    selectedDistrictLabel = districtLayer.getTooltip();
    selectedDistrictLabel?.setContent(t(districtName));
    selectedDistrictLabel?.getElement()?.classList.add("selected-district-label");
}

function highlightDistrictOnMap(districtName) {
    if (!districtName) {
        clearSelectedDistrictHighlight();
        return;
    }

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
    const unavailable = t("Not Available");
    const normalizeNumber = (value) => Number(String(value).replace(/,/g, ""));
    const summarizeStatewideStatistic = fieldName => {
        let hasValues = false;
        const total = Object.values(districtData).reduce((sum, district) => {
            const value = normalizeNumber(district[fieldName]);

            if (!Number.isFinite(value) || value < 0) return sum;

            hasValues = true;
            return sum + value;
        }, 0);

        return hasValues
            ? total.toLocaleString(window.i18n?.getLanguage() || "en-IN")
            : "";
    };
    const isStatewide = !districtName;
    const data = isStatewide
        ? {
            incidentCancerCases: summarizeStatewideStatistic("incidentCancerCases"),
            mortalityCancerCases: summarizeStatewideStatistic("mortalityCancerCases")
        }
        : districtData[districtName];
    const selectedAreaName = isStatewide ? "All Districts" : districtName;
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
    const renderDistrictOptions = () => `
            <option value=""${isStatewide ? " selected" : ""}>${escapeHtml(t("All Districts"))}</option>
        ` + Object.keys(districtData)
            .sort((firstDistrict, secondDistrict) => firstDistrict.localeCompare(secondDistrict))
            .map(district => `
            <option value="${escapeHtml(district)}"${district === districtName ? " selected" : ""}>
                ${escapeHtml(t(district))}
            </option>
        `)
            .join("");
    const statisticsFilters = `
        <div class="info-panel-filters">
            <div class="info-panel-filter info-panel-filter-state">
                <label for="stateStatisticsFilter">${t("Select State")}</label>
                <select id="stateStatisticsFilter" aria-label="${t("Select state for cancer statistics")}">
                    <option value="Odisha" selected>${t("Odisha")}</option>
                </select>
            </div>

            <div class="info-panel-filter">
                <label for="districtStatisticsFilter">${t("Select District")}</label>
                <select id="districtStatisticsFilter" aria-label="${t("Select district for cancer statistics")}">
                    ${renderDistrictOptions()}
                </select>
            </div>
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

            ${statisticsFilters}

            <div class="info-stats-grid">
                <div class="info-stat">
                    <strong>${t("District Name")}</strong>
                    <span>${t(selectedAreaName)}</span>
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

        ${statisticsFilters}

        <div class="info-stats-grid">
            <div class="info-stat info-stat-wide">
                <strong>${t("District Name")}</strong>
                <span>${t(selectedAreaName)}</span>
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

document.addEventListener("languagechange", () => {
    districtLayers.forEach((districtLayer, districtName) => {
        districtLayer.getTooltip()?.setContent(t(districtName));
    });

    renderSelectedDistrict(selectedDistrict);
});

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
    renderSelectedDistrict(selectedDistrict);
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

            layer.bindTooltip(t(districtName), {
                permanent: true,
                direction: "center",
                className: "district-label",
                interactive: false,
                opacity: 1
            });

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
