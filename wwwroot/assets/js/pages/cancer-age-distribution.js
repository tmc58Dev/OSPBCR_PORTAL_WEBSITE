const cancerAgeYear = 2025;

const cancerAgeRequestIds = {
    incidence: 0,
    mortality: 0
};

const selectedCancerAgeSex = {
    incidence: "",
    mortality: ""
};

const cancerAgeCharts = new Map();
const cancerAgePalette = [
    "#005b96",
    "#087f8c",
    "#2f855a",
    "#d69e2e",
    "#c05640",
    "#7656a8"
];

const cancerAgeDefinitions = [
    {
        kind: "incidence",
        ageGroup: "Pediatric",
        ageLabel: "0–14",
        chartId: "incidencePediatricChart",
        regionId: "incidencePediatricRegion",
        emptyId: "incidencePediatricEmpty",
        breakdownId: "incidencePediatricBreakdown",
        statusId: "incidencePediatricStatus"
    },
    {
        kind: "incidence",
        ageGroup: "Geriatric",
        ageLabel: "64 and Above",
        chartId: "incidenceGeriatricChart",
        regionId: "incidenceGeriatricRegion",
        emptyId: "incidenceGeriatricEmpty",
        breakdownId: "incidenceGeriatricBreakdown",
        statusId: "incidenceGeriatricStatus"
    },
    {
        kind: "mortality",
        ageGroup: "Pediatric",
        ageLabel: "0–14",
        chartId: "mortalityPediatricChart",
        regionId: "mortalityPediatricRegion",
        emptyId: "mortalityPediatricEmpty",
        breakdownId: "mortalityPediatricBreakdown",
        statusId: "mortalityPediatricStatus"
    },
    {
        kind: "mortality",
        ageGroup: "Geriatric",
        ageLabel: "64 and Above",
        chartId: "mortalityGeriatricChart",
        regionId: "mortalityGeriatricRegion",
        emptyId: "mortalityGeriatricEmpty",
        breakdownId: "mortalityGeriatricBreakdown",
        statusId: "mortalityGeriatricStatus"
    }
];

function translateCancerAge(key, replacements = {}) {
    if (window.i18n) return window.i18n.t(key, replacements);

    return Object.entries(replacements).reduce(
        (value, [name, replacement]) => value.replaceAll(`{{${name}}}`, replacement),
        key
    );
}

function formatCancerAgeCount(value) {
    return new Intl.NumberFormat(window.i18n?.getLanguage() || "en-IN")
        .format(Number(value) || 0);
}

function getCancerAgeSexLabel(sex) {
    if (sex === "1") return translateCancerAge("Male");
    if (sex === "2") return translateCancerAge("Female");
    return translateCancerAge("All patients");
}

function getCancerAgeDistrictLabel(district) {
    return district
        ? translateCancerAge("{{district}} district", {
            district: translateCancerAge(district)
        })
        : translateCancerAge("all districts");
}

function getCancerAgeEndpoint(kind, district, sex) {
    const parameters = new URLSearchParams({ year: String(cancerAgeYear) });

    if (district) {
        parameters.set("district", district);
    }

    if (sex) {
        parameters.set("sex", sex);
    }

    return `/api/registry/cancer-age-${kind}?${parameters.toString()}`;
}

function getCancerAgeDefinitions(kind) {
    return cancerAgeDefinitions.filter(definition => definition.kind === kind);
}

function destroyCancerAgeChart(chartId) {
    const chart = cancerAgeCharts.get(chartId);

    if (chart) {
        chart.destroy();
        cancerAgeCharts.delete(chartId);
    }
}

function setCancerAgeBreakdownMessage(definition, message) {
    const breakdown = document.getElementById(definition.breakdownId);

    if (!breakdown) return;

    const text = document.createElement("span");
    text.className = "age-chart-breakdown-loading";
    text.textContent = message;
    breakdown.replaceChildren(text);
}

function setCancerAgeLoading(definition, district, sex) {
    destroyCancerAgeChart(definition.chartId);

    const region = document.getElementById(definition.regionId);
    const empty = document.getElementById(definition.emptyId);
    const status = document.getElementById(definition.statusId);

    if (region) region.hidden = false;
    if (empty) empty.hidden = true;

    setCancerAgeBreakdownMessage(
        definition,
        translateCancerAge("Loading cancer sites...")
    );

    if (status) {
        status.classList.remove("is-error");
        status.textContent = translateCancerAge(
            "Loading {{sex}} {{ageGroup}} {{kind}} cancer sites for {{district}}...",
            {
                sex: getCancerAgeSexLabel(sex),
                ageGroup: translateCancerAge(definition.ageGroup.toLowerCase()),
                kind: translateCancerAge(definition.kind),
                district: getCancerAgeDistrictLabel(district)
            }
        );
    }
}

function setCancerAgeError(definition) {
    destroyCancerAgeChart(definition.chartId);

    const region = document.getElementById(definition.regionId);
    const empty = document.getElementById(definition.emptyId);
    const status = document.getElementById(definition.statusId);
    const message = translateCancerAge(
        "Cancer-site age-distribution data could not be loaded."
    );

    if (region) region.hidden = true;
    if (empty) {
        empty.hidden = false;
        empty.textContent = message;
    }

    setCancerAgeBreakdownMessage(definition, message);

    if (status) {
        status.classList.add("is-error");
        status.textContent = message;
    }
}

function renderCancerSiteBreakdown(definition, values, colors) {
    const breakdown = document.getElementById(definition.breakdownId);

    if (!breakdown) return;

    const rows = values.map((value, index) => {
        const row = document.createElement("span");
        const dot = document.createElement("i");
        const site = document.createElement("span");
        const count = document.createElement("strong");

        row.className = "age-chart-breakdown-row";
        dot.className = "age-chart-dot";
        dot.style.backgroundColor = colors[index];
        site.className = "age-chart-site-name";
        site.title = `${value.icd10} ${value.cancerSite}`;
        site.textContent = `${value.icd10} ${value.cancerSite}`;
        count.textContent = formatCancerAgeCount(value.count);

        row.append(dot, site, count);
        return row;
    });

    breakdown.replaceChildren(...rows);
}

function renderCancerAgeChart(definition, values, district, sex) {
    const canvas = document.getElementById(definition.chartId);
    const region = document.getElementById(definition.regionId);
    const empty = document.getElementById(definition.emptyId);
    const status = document.getElementById(definition.statusId);

    if (!canvas || typeof Chart === "undefined") {
        throw new Error("The chart library could not be loaded.");
    }

    const sites = values
        .filter(value =>
            String(value.ageGroup || "").toLowerCase() ===
            definition.ageGroup.toLowerCase())
        .map(value => ({
            ageGroup: value.ageGroup,
            icd10: String(value.icd10 || ""),
            cancerSite: String(value.cancerSite || ""),
            count: Number(value.count || 0)
        }))
        .filter(value => value.count > 0);

    const total = sites.reduce((sum, value) => sum + value.count, 0);
    const sexLabel = getCancerAgeSexLabel(sex);
    const kindLabel = translateCancerAge(definition.kind);

    destroyCancerAgeChart(definition.chartId);

    if (status) {
        status.classList.remove("is-error");
        status.textContent = translateCancerAge(
            "{{district}} · {{sex}} · Ages {{ageRange}}: {{count}} records across {{siteCount}} cancer sites.",
            {
                district: getCancerAgeDistrictLabel(district),
                sex: sexLabel,
                ageRange: definition.ageLabel,
                count: formatCancerAgeCount(total),
                siteCount: formatCancerAgeCount(sites.length)
            }
        );
    }

    if (sites.length === 0) {
        const message = translateCancerAge(
            "No {{sex}} {{ageGroup}} {{kind}} cancer-site records were found for {{district}} in 2025.",
            {
                sex: sexLabel,
                ageGroup: translateCancerAge(definition.ageGroup.toLowerCase()),
                kind: kindLabel,
                district: getCancerAgeDistrictLabel(district)
            }
        );

        if (region) region.hidden = true;
        if (empty) {
            empty.hidden = false;
            empty.textContent = message;
        }

        setCancerAgeBreakdownMessage(definition, message);
        return;
    }

    if (region) region.hidden = false;
    if (empty) empty.hidden = true;

    const colors = sites.map(
        (_, index) => cancerAgePalette[index % cancerAgePalette.length]
    );
    const labels = sites.map(value => `${value.icd10} ${value.cancerSite}`);
    const counts = sites.map(value => value.count);

    renderCancerSiteBreakdown(definition, sites, colors);

    canvas.setAttribute(
        "aria-label",
        translateCancerAge(
            "Pie chart of {{sex}} {{ageGroup}} cancer-site {{kind}} counts for {{district}} in 2025",
            {
                sex: sexLabel,
                ageGroup: translateCancerAge(definition.ageGroup.toLowerCase()),
                kind: kindLabel,
                district: getCancerAgeDistrictLabel(district)
            }
        )
    );

    const chart = new Chart(canvas, {
        type: "pie",
        data: {
            labels,
            datasets: [{
                data: counts,
                backgroundColor: colors,
                borderColor: "#ffffff",
                borderWidth: 3,
                hoverOffset: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 650
            },
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        boxWidth: 12,
                        boxHeight: 12,
                        padding: 12,
                        color: "#334155",
                        font: {
                            size: 10,
                            weight: "700"
                        },
                        generateLabels(chartInstance) {
                            const dataset = chartInstance.data.datasets[0];

                            return chartInstance.data.labels.map((label, index) => ({
                                text: `${label}: ${formatCancerAgeCount(dataset.data[index])}`,
                                fillStyle: dataset.backgroundColor[index],
                                strokeStyle: "#ffffff",
                                lineWidth: 2,
                                hidden: !chartInstance.getDataVisibility(index),
                                index
                            }));
                        }
                    }
                },
                tooltip: {
                    padding: 11,
                    callbacks: {
                        label(context) {
                            const count = Number(context.raw || 0);
                            const percentage = total > 0
                                ? ((count / total) * 100).toFixed(1)
                                : "0.0";

                            return ` ${context.label}: ${formatCancerAgeCount(count)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });

    cancerAgeCharts.set(definition.chartId, chart);
}

async function loadCancerAgeDistribution(
    kind,
    district = window.selectedMapDistrict || "",
    sex = selectedCancerAgeSex[kind]) {
    const requestId = ++cancerAgeRequestIds[kind];
    const definitions = getCancerAgeDefinitions(kind);

    definitions.forEach(definition =>
        setCancerAgeLoading(definition, district, sex));

    try {
        const response = await fetch(getCancerAgeEndpoint(kind, district, sex), {
            cache: "no-store",
            headers: {
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`The ${kind} age endpoint returned HTTP ${response.status}.`);
        }

        const values = await response.json();

        if (requestId !== cancerAgeRequestIds[kind]) {
            return;
        }

        definitions.forEach(definition =>
            renderCancerAgeChart(
                definition,
                Array.isArray(values) ? values : [],
                district,
                sex));
    } catch (error) {
        if (requestId !== cancerAgeRequestIds[kind]) {
            return;
        }

        console.error(`Unable to load ${kind} age-site data.`, error);
        definitions.forEach(setCancerAgeError);
    }
}

function loadAllCancerAgeDistributions(
    district = window.selectedMapDistrict || "") {
    return Promise.all([
        loadCancerAgeDistribution(
            "incidence",
            district,
            selectedCancerAgeSex.incidence),
        loadCancerAgeDistribution(
            "mortality",
            district,
            selectedCancerAgeSex.mortality)
    ]);
}

document.querySelectorAll("[data-incidence-sex]").forEach(button => {
    button.addEventListener("click", () => {
        selectedCancerAgeSex.incidence = button.dataset.incidenceSex || "";
        loadCancerAgeDistribution("incidence");
    });
});

document.querySelectorAll("[data-mortality-sex]").forEach(button => {
    button.addEventListener("click", () => {
        selectedCancerAgeSex.mortality = button.dataset.mortalitySex || "";
        loadCancerAgeDistribution("mortality");
    });
});

document.addEventListener("districtchange", event => {
    loadAllCancerAgeDistributions(event.detail?.district || "");
});

document.addEventListener("languagechange", () => {
    loadAllCancerAgeDistributions();
});

loadAllCancerAgeDistributions();
