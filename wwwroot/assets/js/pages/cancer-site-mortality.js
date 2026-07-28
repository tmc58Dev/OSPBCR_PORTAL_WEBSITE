const mortalityYear = 2025;
let mortalityChart = null;
let mortalityRequestId = 0;
let selectedMortalitySex = "";
let selectedMortalityDistrict = window.selectedMapDistrict || "";

const mortalityPalette = [
    "#005b96",
    "#087f8c",
    "#2f855a",
    "#d69e2e",
    "#c05640",
    "#5b6f9e"
];

const mortalityValueLabelPlugin = {
    id: "mortalityValueLabels",
    afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        const meta = chart.getDatasetMeta(0);
        const values = chart.data.datasets[0].data;

        ctx.save();
        ctx.fillStyle = "#0f172a";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        ctx.lineWidth = 4;
        ctx.font = "800 14px Arial, sans-serif";
        ctx.textBaseline = "middle";

        meta.data.forEach((bar, index) => {
            const value = formatMortalityCount(values[index]);
            const position = bar.tooltipPosition();
            const labelX = Math.min(position.x + 10, chartArea.right - 6);

            ctx.textAlign = labelX >= chartArea.right - 6 ? "right" : "left";
            ctx.strokeText(value, labelX, position.y);
            ctx.fillText(value, labelX, position.y);
        });

        ctx.restore();
    }
};

function formatMortalityCount(value) {
    return new Intl.NumberFormat(window.i18n?.getLanguage() || "en-IN").format(Number(value) || 0);
}

function translateMortality(key, replacements = {}) {
    if (window.i18n) return window.i18n.t(key, replacements);

    return Object.entries(replacements).reduce(
        (value, [name, replacement]) => value.replaceAll(`{{${name}}}`, replacement),
        key
    );
}

function setMortalityStatus(message, isError = false) {
    const status = document.getElementById("mortalityStatus");

    if (!status) return;

    status.textContent = message;
    status.classList.toggle("is-error", isError);
}

function showMortalityEmptyState(message) {
    const chartRegion = document.getElementById("mortalityChartRegion");
    const emptyState = document.getElementById("mortalityEmptyState");

    if (chartRegion) chartRegion.hidden = true;

    if (emptyState) {
        emptyState.textContent = message;
        emptyState.hidden = false;
    }
}

function getMortalityEndpoint(sex, district) {
    const parameters = new URLSearchParams({ year: String(mortalityYear) });

    if (sex) {
        parameters.set("sex", sex);
    }

    if (district) {
        parameters.set("district", district);
    }

    return `/api/registry/cancer-site-mortality?${parameters.toString()}`;
}

function getMortalitySexLabel(sex) {
    if (sex === "1") return translateMortality("Male");
    if (sex === "2") return translateMortality("Female");
    return translateMortality("All patients");
}

function getMortalityDistrictLabel(district) {
    return district
        ? translateMortality("{{district}} district", {
            district: translateMortality(district)
        })
        : translateMortality("all districts");
}

function renderCancerSiteMortality(values, sex, district) {
    const canvas = document.getElementById("cancerSiteMortalityChart");
    const totalElement = document.getElementById("mortalityTotal");
    const siteCountElement = document.getElementById("mortalitySiteCount");

    if (!canvas || typeof Chart === "undefined") {
        throw new Error("The chart library could not be loaded.");
    }

    const totalDeaths = values.reduce((sum, item) => sum + Number(item.count || 0), 0);
    const chartHeight = Math.max(400, values.length * 64);
    const canvasContainer = canvas.closest(".incidence-chart-canvas");

    if (canvasContainer) {
        canvasContainer.style.height = `${chartHeight}px`;
    }

    if (totalElement) totalElement.textContent = formatMortalityCount(totalDeaths);
    if (siteCountElement) siteCountElement.textContent = formatMortalityCount(values.length);

    if (mortalityChart) {
        mortalityChart.destroy();
    }

    canvas.setAttribute(
        "aria-label",
        translateMortality(
            "Horizontal bar chart of the top five cancer-site mortality counts for {{sex}} in {{district}} in 2025",
            {
                sex: getMortalitySexLabel(sex),
                district: getMortalityDistrictLabel(district)
            }
        )
    );

    mortalityChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels: values.map(item => `${item.icd10}  ${item.cancerSite}`),
            datasets: [{
                label: translateMortality("Unique cancer deaths"),
                data: values.map(item => Number(item.count || 0)),
                backgroundColor: values.map((_, index) => mortalityPalette[index % mortalityPalette.length]),
                borderWidth: 0,
                borderRadius: 3,
                barThickness: 22
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 650
            },
            layout: {
                padding: {
                    right: 72
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
                            return ` ${translateMortality("Unique deaths")}: ${formatMortalityCount(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: translateMortality("Unique REGNO count")
                    },
                    ticks: {
                        precision: 0,
                        callback(value) {
                            return formatMortalityCount(value);
                        }
                    },
                    grid: {
                        color: "rgba(15, 23, 42, 0.08)"
                    }
                },
                y: {
                    ticks: {
                        autoSkip: false,
                        color: "#1f2937",
                        font: {
                            size: 12,
                            weight: "600"
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        },
        plugins: [mortalityValueLabelPlugin]
    });

    setMortalityStatus(
        translateMortality(
            "{{district}} · {{sex}}: {{count}} unique deaths in the top {{siteCount}} ICD-10 site groups.",
            {
                district: getMortalityDistrictLabel(district),
                sex: getMortalitySexLabel(sex),
                count: formatMortalityCount(totalDeaths),
                siteCount: formatMortalityCount(values.length)
            }
        )
    );
}

async function initializeCancerSiteMortality(
    sex = selectedMortalitySex,
    district = selectedMortalityDistrict) {
    selectedMortalitySex = sex;
    selectedMortalityDistrict = district;

    const requestId = ++mortalityRequestId;
    const chartRegion = document.getElementById("mortalityChartRegion");
    const emptyState = document.getElementById("mortalityEmptyState");
    const totalElement = document.getElementById("mortalityTotal");
    const siteCountElement = document.getElementById("mortalitySiteCount");

    if (chartRegion) chartRegion.hidden = false;
    if (emptyState) emptyState.hidden = true;
    if (totalElement) totalElement.textContent = "--";
    if (siteCountElement) siteCountElement.textContent = "--";

    if (mortalityChart) {
        mortalityChart.destroy();
        mortalityChart = null;
    }

    setMortalityStatus(
        translateMortality("Loading {{sex}} mortality data for {{district}}...", {
            sex: getMortalitySexLabel(sex),
            district: getMortalityDistrictLabel(district)
        })
    );

    try {
        const response = await fetch(getMortalityEndpoint(sex, district), {
            cache: "no-store",
            headers: {
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`The mortality endpoint returned HTTP ${response.status}.`);
        }

        const values = await response.json();

        if (requestId !== mortalityRequestId) {
            return;
        }

        if (!Array.isArray(values) || values.length === 0) {
            const message = translateMortality(
                "No valid {{sex}} mortality records were found for {{district}} in 2025.",
                {
                    sex: getMortalitySexLabel(sex),
                    district: getMortalityDistrictLabel(district)
                }
            );

            setMortalityStatus(message);
            showMortalityEmptyState(message);
            return;
        }

        renderCancerSiteMortality(values, sex, district);
    } catch (error) {
        if (requestId !== mortalityRequestId) {
            return;
        }

        console.error("Unable to load cancer-site mortality data.", error);
        const message = translateMortality("Cancer-site mortality data could not be loaded.");
        setMortalityStatus(message, true);
        showMortalityEmptyState(message);
    }
}

document.querySelectorAll("[data-mortality-sex]").forEach(button => {
    button.addEventListener("click", () => {
        const selectedSex = button.dataset.mortalitySex || "";

        document.querySelectorAll("[data-mortality-sex]").forEach(filterButton => {
            const isActive = filterButton === button;
            filterButton.classList.toggle("active", isActive);
            filterButton.setAttribute("aria-pressed", String(isActive));
        });

        initializeCancerSiteMortality(selectedSex);
    });
});

document.addEventListener("districtchange", event => {
    const district = event.detail?.district || "";

    initializeCancerSiteMortality(selectedMortalitySex, district);
});

document.addEventListener("languagechange", () => {
    initializeCancerSiteMortality();
});

initializeCancerSiteMortality();
