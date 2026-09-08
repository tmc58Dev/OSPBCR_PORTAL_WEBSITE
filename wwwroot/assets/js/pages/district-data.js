let districtData = {
    "Angul": {
        population: "1,273,821",
        cancerCases: "2,450",
        updated: "08-Jun-2026"
    },

    "Boudh": {
        population: "441,162",
        cancerCases: "810",
        updated: "08-Jun-2026"
    },

    "Balangir": {
        population: "1,648,997",
        cancerCases: "3,120",
        updated: "08-Jun-2026"
    },

    "Balasore": {
        population: "2,320,529",
        cancerCases: "4,980",
        updated: "08-Jun-2026"
    },

    "Bargarh": {
        population: "1,481,255",
        cancerCases: "2,940",
        updated: "08-Jun-2026"
    },

    "Bhadrak": {
        population: "1,506,522",
        cancerCases: "3,110",
        updated: "08-Jun-2026"
    },

    "Cuttack": {
        population: "2,624,470",
        cancerCases: "5,820",
        updated: "08-Jun-2026"
    },

    "Deogarh": {
        population: "312,520",
        cancerCases: "590",
        updated: "08-Jun-2026"
    },

    "Dhenkanal": {
        population: "1,192,811",
        cancerCases: "2,150",
        updated: "08-Jun-2026"
    },

    "Gajapati": {
        population: "577,817",
        cancerCases: "1,050",
        updated: "08-Jun-2026"
    },

    "Ganjam": {
        population: "3,529,031",
        cancerCases: "7,180",
        updated: "08-Jun-2026"
    },

    "Jagatsinghapur": {
        population: "1,136,971",
        cancerCases: "2,640",
        updated: "08-Jun-2026"
    },

    "Jajpur": {
        population: "1,827,192",
        cancerCases: "3,890",
        updated: "08-Jun-2026"
    },

    "Jharsuguda": {
        population: "579,505",
        cancerCases: "1,420",
        updated: "08-Jun-2026"
    },

    "Kalahandi": {
        population: "1,576,869",
        cancerCases: "2,850",
        updated: "08-Jun-2026"
    },

    "Kandhamal": {
        population: "733,110",
        cancerCases: "1,210",
        updated: "08-Jun-2026"
    },

    "Kendrapara": {
        population: "1,440,361",
        cancerCases: "3,100",
        updated: "08-Jun-2026"
    },

    "Keonjhar": {
        population: "1,801,733",
        cancerCases: "3,420",
        updated: "08-Jun-2026"
    },

    "Khordha": {
        population: "2,251,673",
        cancerCases: "6,120",
        updated: "08-Jun-2026"
    },

    "Koraput": {
        population: "1,379,647",
        cancerCases: "2,380",
        updated: "08-Jun-2026"
    },

    "Malkangiri": {
        population: "613,192",
        cancerCases: "980",
        updated: "08-Jun-2026"
    },

    "Mayurbhanj": {
        population: "2,519,738",
        cancerCases: "4,820",
        updated: "08-Jun-2026"
    },

    "Nabarangpur": {
        population: "1,220,946",
        cancerCases: "1,940",
        updated: "08-Jun-2026"
    },

    "Nayagarh": {
        population: "962,789",
        cancerCases: "1,870",
        updated: "08-Jun-2026"
    },

    "Nuapada": {
        population: "610,382",
        cancerCases: "1,120",
        updated: "08-Jun-2026"
    },

    "Puri": {
        population: "1,698,730",
        cancerCases: "7,541",
        updated: "08-Jun-2026"
    },

    "Rayagada": {
        population: "967,911",
        cancerCases: "1,750",
        updated: "08-Jun-2026"
    },

    "Sambalpur": {
        population: "1,041,099",
        cancerCases: "2,490",
        updated: "08-Jun-2026"
    },

    "Sonepur": {
        population: "610,183",
        cancerCases: "1,150",
        updated: "08-Jun-2026"
    },

    "Sundargarh": {
        population: "2,093,437",
        cancerCases: "4,610",
        updated: "08-Jun-2026"
    }
};

window.loadDistrictDataFromApi = async function loadDistrictDataFromApi() {
    try {
        const response = await fetch("api/registry/district-statistics", {
            headers: {
                "Accept": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`District statistics API failed with ${response.status}`);
        }

        const apiData = await response.json();

        if (!Array.isArray(apiData) || apiData.length === 0) {
            return;
        }

        districtData = apiData.reduce((values, item) => {
            if (!item.district) {
                return values;
            }

            const existingDistrictData = values[item.district] || {};

            values[item.district] = {
                population:
                    formatRegistryNumber(item.population) ||
                    existingDistrictData.population ||
                    "",
                cancerCases: formatRegistryNumber(item.cancerCases),
                incidentCancerCases: formatRegistryNumber(item.incidentCancerCases),
                mortalityCancerCases: formatRegistryNumber(item.mortalityCancerCases)
            };

            return values;
        }, { ...districtData });
    } catch (error) {
        console.warn("Using fallback district map data.", error);
    }
};

function formatRegistryNumber(value) {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue) || numberValue <= 0) {
        return "";
    }

    return numberValue.toLocaleString(window.i18n?.getLanguage() || "en");
}
