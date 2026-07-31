const incidenceYear = 2025;
let incidenceChart = null;
let incidenceRequestId = 0;
let selectedIncidenceSex = "";
let selectedIncidenceDistrict = window.selectedMapDistrict || "";

const incidencePalette = [
    "#005b96",
    "#087f8c",
    "#2f855a",
    "#d69e2e",
    "#c05640",
    "#5b6f9e"
];

const incidenceValueLabelPlugin = {
    id: "incidenceValueLabels",
    afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        const meta = chart.getDatasetMeta(0);
        const values = chart.data.datasets[0].data;

        ctx.save();
        ctx.fillStyle = "#0f172a";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        ctx.lineWidth = 4;
        ctx.font = "800 14px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        meta.data.forEach((bar, index) => {
            const value = formatIncidenceCount(values[index]);
            const position = bar.tooltipPosition();
            const labelY = Math.max(position.y - 8, chartArea.top + 14);

            ctx.strokeText(value, position.x, labelY);
            ctx.fillText(value, position.x, labelY);
        });

        ctx.restore();
    }
};

function formatIncidenceCount(value) {
    return new Intl.NumberFormat(window.i18n?.getLanguage() || "en-IN").format(Number(value) || 0);
}

function translateIncidence(key, replacements = {}) {
    if (window.i18n) return window.i18n.t(key, replacements);

    return Object.entries(replacements).reduce(
        (value, [name, replacement]) => value.replaceAll(`{{${name}}}`, replacement),
        key
    );
}

function setIncidenceStatus(message, isError = false) {
    const status = document.getElementById("incidenceStatus");

    if (!status) return;

    status.textContent = message;
    status.classList.toggle("is-error", isError);
}

function showIncidenceEmptyState(message) {
    const chartRegion = document.getElementById("incidenceChartRegion");
    const emptyState = document.getElementById("incidenceEmptyState");

    if (chartRegion) chartRegion.hidden = true;

    if (emptyState) {
        emptyState.textContent = message;
        emptyState.hidden = false;
    }
}

function getIncidenceEndpoint(sex, district) {
    const parameters = new URLSearchParams({ year: String(incidenceYear) });

    if (sex) {
        parameters.set("sex", sex);
    }

    if (district) {
        parameters.set("district", district);
    }

    return `/api/registry/cancer-site-incidence?${parameters.toString()}`;
}

function getSexLabel(sex) {
    if (sex === "1") return translateIncidence("Male");
    if (sex === "2") return translateIncidence("Female");
    return translateIncidence("All patients");
}

function getIncidenceDistrictLabel(district) {
    return district
        ? translateIncidence("{{district}} district", {
            district: translateIncidence(district)
        })
        : translateIncidence("all districts");
}

function renderCancerSiteIncidence(values, sex, district) {
    const canvas = document.getElementById("cancerSiteIncidenceChart");
    const totalElement = document.getElementById("incidenceTotal");
    const siteCountElement = document.getElementById("incidenceSiteCount");

    if (!canvas || typeof Chart === "undefined") {
        throw new Error("The chart library could not be loaded.");
    }

    const totalCases = values.reduce((sum, item) => sum + Number(item.count || 0), 0);
    const chartHeight = 375;
    const canvasContainer = canvas.closest(".incidence-chart-canvas");

    if (canvasContainer) {
        canvasContainer.style.height = `${chartHeight}px`;
    }

    if (totalElement) totalElement.textContent = formatIncidenceCount(totalCases);
    if (siteCountElement) siteCountElement.textContent = formatIncidenceCount(values.length);

    if (incidenceChart) {
        incidenceChart.destroy();
    }

    canvas.setAttribute(
        "aria-label",
        translateIncidence(
            "Vertical bar chart of the top five cancer-site incidence counts for {{sex}} in {{district}} in 2025",
            {
                sex: getSexLabel(sex),
                district: getIncidenceDistrictLabel(district)
            }
        )
    );

    incidenceChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels: values.map(item => `${item.icd10}  ${item.cancerSite}`),
            datasets: [{
                label: translateIncidence("Cancer Cases"),
                data: values.map(item => Number(item.count || 0)),
                backgroundColor: values.map((_, index) => incidencePalette[index % incidencePalette.length]),
                borderWidth: 0,
                borderRadius: 3,
                maxBarThickness: 54
            }]
        },
        options: {
            indexAxis: "x",
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 650
            },
            layout: {
                padding: {
                    top: 28,
                    right: 12
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    titleFont: {
                        size: 15,
                        weight: "700"
                    },
                    bodyFont: {
                        size: 15,
                        weight: "600"
                    },
                    padding: 12,
                    callbacks: {
                        label(context) {
                            return ` ${translateIncidence("Count")}: ${formatIncidenceCount(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        autoSkip: false,
                        color: "#1f2937",
                        maxRotation: 35,
                        minRotation: 0,
                        font: {
                            size: 12,
                            weight: "600"
                        }
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: translateIncidence("REGNO count")
                    },
                    ticks: {
                        precision: 0,
                        callback(value) {
                            return formatIncidenceCount(value);
                        }
                    },
                    grid: {
                        color: "rgba(15, 23, 42, 0.08)"
                    }
                }
            }
        },
        plugins: [incidenceValueLabelPlugin]
    });

    setIncidenceStatus(
        translateIncidence(
            "{{district}} · {{sex}}: {{count}} cases in the top {{siteCount}} ICD-10 site groups.",
            {
                district: getIncidenceDistrictLabel(district),
                sex: getSexLabel(sex),
                count: formatIncidenceCount(totalCases),
                siteCount: formatIncidenceCount(values.length)
            }
        )
    );
}

async function initializeCancerSiteIncidence(
    sex = selectedIncidenceSex,
    district = selectedIncidenceDistrict) {
    selectedIncidenceSex = sex;
    selectedIncidenceDistrict = district;

    const requestId = ++incidenceRequestId;
    const chartRegion = document.getElementById("incidenceChartRegion");
    const emptyState = document.getElementById("incidenceEmptyState");
    const totalElement = document.getElementById("incidenceTotal");
    const siteCountElement = document.getElementById("incidenceSiteCount");

    if (chartRegion) chartRegion.hidden = false;
    if (emptyState) emptyState.hidden = true;
    if (totalElement) totalElement.textContent = "--";
    if (siteCountElement) siteCountElement.textContent = "--";

    if (incidenceChart) {
        incidenceChart.destroy();
        incidenceChart = null;
    }

    setIncidenceStatus(
        translateIncidence("Loading {{sex}} data for {{district}}...", {
            sex: getSexLabel(sex),
            district: getIncidenceDistrictLabel(district)
        })
    );

    try {
        const response = await fetch(getIncidenceEndpoint(sex, district), {
            cache: "no-store",
            headers: {
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`The incidence endpoint returned HTTP ${response.status}.`);
        }

        const values = await response.json();

        if (requestId !== incidenceRequestId) {
            return;
        }

        if (!Array.isArray(values) || values.length === 0) {
            const message = translateIncidence(
                "No valid {{sex}} records were found for {{district}} in 2025.",
                {
                    sex: getSexLabel(sex),
                    district: getIncidenceDistrictLabel(district)
                }
            );

            setIncidenceStatus(message);
            showIncidenceEmptyState(message);
            return;
        }

        renderCancerSiteIncidence(values, sex, district);
    } catch (error) {
        if (requestId !== incidenceRequestId) {
            return;
        }

        console.error("Unable to load cancer-site incidence data.", error);
        const message = translateIncidence("Cancer-site incidence data could not be loaded.");
        setIncidenceStatus(message, true);
        showIncidenceEmptyState(message);
    }
}

document.querySelectorAll("[data-incidence-sex]").forEach(button => {
    button.addEventListener("click", () => {
        const selectedSex = button.dataset.incidenceSex || "";

        document.querySelectorAll("[data-incidence-sex]").forEach(filterButton => {
            const isActive = filterButton === button;
            filterButton.classList.toggle("active", isActive);
            filterButton.setAttribute("aria-pressed", String(isActive));
        });

        initializeCancerSiteIncidence(selectedSex);
    });
});

document.addEventListener("districtchange", event => {
    const district = event.detail?.district || "";

    initializeCancerSiteIncidence(selectedIncidenceSex, district);
});

document.addEventListener("languagechange", () => {
    initializeCancerSiteIncidence();
});

initializeCancerSiteIncidence();
