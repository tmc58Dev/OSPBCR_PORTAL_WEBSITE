(() => {
    const card = document.getElementById("populationProjectionCard");
    if (!card) return;

    const elements = {
        status: document.getElementById("projectionStatus"),
        areaBadge: document.getElementById("projectionAreaBadge"),
        statsTitle: document.getElementById("projectionStatsTitle"),
        statsContext: document.getElementById("projectionStatsContext"),
        district: document.getElementById("projectionDistrictFilter"),
        block: document.getElementById("projectionBlockFilter"),
        age: document.getElementById("projectionAgeFilter"),
        category: document.getElementById("projectionCategoryFilter"),
        gender: document.getElementById("projectionGenderFilter"),
        reset: document.getElementById("projectionResetFilters"),
        population: document.getElementById("projectionPopulation"),
        populationLabel: document.getElementById("projectionPopulationLabel"),
        male: document.getElementById("projectionMale"),
        female: document.getElementById("projectionFemale"),
        maleShare: document.getElementById("projectionMaleShare"),
        femaleShare: document.getElementById("projectionFemaleShare"),
        coverage: document.getElementById("projectionCoverage"),
        sexRatio: document.getElementById("projectionSexRatio"),
        change: document.getElementById("projectionChange"),
        largestCohort: document.getElementById("projectionLargestCohort"),
        stateShare: document.getElementById("projectionStateShare"),
        pyramidContext: document.getElementById("projectionPyramidContext"),
        pyramid: document.getElementById("projectionAgePyramid")
    };
    const yearButtons = [...document.querySelectorAll("[data-projection-year]")];
    const numberFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
    const compactFormatter = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
    const percentFormatter = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const state = {
        model: null,
        year: 2025,
        mapKey: "",
        block: "",
        ageGroup: "All ages",
        category: "Overall",
        gender: "Both"
    };

    const fillSelect = (select, values, selectedValue, labelForValue = value => value) => {
        const fragment = document.createDocumentFragment();
        values.forEach(value => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = labelForValue(value);
            option.selected = value === selectedValue;
            fragment.appendChild(option);
        });
        select.replaceChildren(fragment);
    };

    const dimensions = () => state.model.dimensions;
    const districtForMapKey = mapKey => state.model.districts.find(district => district.mapKey === mapKey);
    const selectedDistrict = () => state.mapKey ? districtForMapKey(state.mapKey) : null;
    const selectedBlock = () => selectedDistrict()?.blocks.find(block => block.name === state.block) || null;
    const selectedValues = () => selectedBlock()?.values || selectedDistrict()?.values || state.model.state.values;

    const offset = (year, ageGroup, category, gender) => {
        const source = dimensions();
        const yearIndex = source.years.indexOf(year);
        const ageIndex = source.ageGroups.indexOf(ageGroup);
        const categoryIndex = source.categories.indexOf(category);
        const genderIndex = source.genders.indexOf(gender);
        return (((yearIndex * source.ageGroups.length + ageIndex) * source.categories.length + categoryIndex)
            * source.genders.length) + genderIndex;
    };

    const readPopulation = (values, year, ageGroup, category, gender) =>
        Number(values[offset(year, ageGroup, category, gender)] || 0);

    const populationForGenderFilter = (values, year, ageGroup, category, gender) => {
        if (gender !== "Both") return readPopulation(values, year, ageGroup, category, gender);
        return readPopulation(values, year, ageGroup, category, "Male")
            + readPopulation(values, year, ageGroup, category, "Female");
    };

    const formatPercentage = value => Number.isFinite(value) ? `${percentFormatter.format(value)}%` : "Not available";

    const updateBlockOptions = () => {
        const district = selectedDistrict();
        const values = district ? ["", ...district.blocks.map(block => block.name)] : [""];
        const allLabel = district ? `All blocks (${district.blocks.length})` : "All blocks — select a district";
        fillSelect(elements.block, values, state.block, value => value || allLabel);
        elements.block.disabled = !district;
    };

    const renderPyramid = (values, areaName) => {
        const ageGroups = dimensions().ageGroups.filter(ageGroup => ageGroup !== "All ages");
        const rows = ageGroups.map(ageGroup => ({
            ageGroup,
            male: readPopulation(values, state.year, ageGroup, state.category, "Male"),
            female: readPopulation(values, state.year, ageGroup, state.category, "Female")
        }));
        const maximum = Math.max(1, ...rows.flatMap(row => [row.male, row.female]));
        const fragment = document.createDocumentFragment();

        rows.slice().reverse().forEach(row => {
            const chartRow = document.createElement("div");
            chartRow.className = "projection-pyramid-row";
            const isAgeFiltered = state.ageGroup === "All ages" || state.ageGroup === row.ageGroup;
            chartRow.classList.toggle("is-muted", !isAgeFiltered);

            const maleValue = document.createElement("span");
            maleValue.className = "projection-pyramid-value projection-pyramid-value-male";
            maleValue.textContent = compactFormatter.format(row.male);

            const maleTrack = document.createElement("div");
            maleTrack.className = "projection-pyramid-track projection-pyramid-track-male";
            const maleBar = document.createElement("span");
            maleBar.className = "projection-pyramid-bar projection-pyramid-bar-male";
            maleBar.style.width = `${(row.male / maximum) * 100}%`;
            maleBar.title = `${row.ageGroup}, Male: ${numberFormatter.format(row.male)}`;
            maleTrack.appendChild(maleBar);

            const label = document.createElement("strong");
            label.className = "projection-pyramid-age";
            label.textContent = row.ageGroup;

            const femaleTrack = document.createElement("div");
            femaleTrack.className = "projection-pyramid-track projection-pyramid-track-female";
            const femaleBar = document.createElement("span");
            femaleBar.className = "projection-pyramid-bar projection-pyramid-bar-female";
            femaleBar.style.width = `${(row.female / maximum) * 100}%`;
            femaleBar.title = `${row.ageGroup}, Female: ${numberFormatter.format(row.female)}`;
            femaleTrack.appendChild(femaleBar);

            const femaleValue = document.createElement("span");
            femaleValue.className = "projection-pyramid-value projection-pyramid-value-female";
            femaleValue.textContent = compactFormatter.format(row.female);

            if (state.gender === "Male") {
                femaleTrack.classList.add("is-gender-muted");
                femaleValue.classList.add("is-gender-muted");
            } else if (state.gender === "Female") {
                maleTrack.classList.add("is-gender-muted");
                maleValue.classList.add("is-gender-muted");
            }

            chartRow.append(maleValue, maleTrack, label, femaleTrack, femaleValue);
            fragment.appendChild(chartRow);
        });

        elements.pyramid.replaceChildren(fragment);
        elements.pyramid.setAttribute(
            "aria-label",
            `${areaName} ${state.year} population pyramid for ${state.category}, showing male and female population by age group.`
        );
    };

    const render = () => {
        if (!state.model) return;
        const district = selectedDistrict();
        const block = selectedBlock();
        const values = selectedValues();
        const areaName = block?.name || district?.name || state.model.state.name;
        const areaDescription = block
            ? `${block.name} block, ${district.name} district`
            : district
                ? `${district.name} district — all ${district.blocks.length} blocks`
                : "Odisha — all districts";

        yearButtons.forEach(button => {
            const active = Number(button.dataset.projectionYear) === state.year;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        elements.district.value = state.mapKey;
        elements.block.value = state.block;
        elements.age.value = state.ageGroup;
        elements.category.value = state.category;
        elements.gender.value = state.gender;

        const male = readPopulation(values, state.year, state.ageGroup, state.category, "Male");
        const female = readPopulation(values, state.year, state.ageGroup, state.category, "Female");
        const both = male + female;
        const selectedTotal = state.gender === "Male" ? male : state.gender === "Female" ? female : both;
        const baseline = populationForGenderFilter(values, 2025, state.ageGroup, state.category, state.gender);
        const change = baseline ? ((selectedTotal - baseline) / baseline) * 100 : NaN;
        const stateTotal = populationForGenderFilter(
            state.model.state.values,
            state.year,
            state.ageGroup,
            state.category,
            state.gender
        );
        const shareOfState = stateTotal ? (selectedTotal / stateTotal) * 100 : NaN;
        const sexRatio = male ? Math.round((female / male) * 1000) : NaN;
        const genderLabel = state.gender === "Both" ? "Both genders" : state.gender;
        const coverage = block
            ? `1 block in ${district.name}`
            : district
                ? `${district.blocks.length} blocks`
                : `${state.model.source.districts} districts · ${state.model.source.districtBlockPairs} blocks`;

        const cohorts = dimensions().ageGroups
            .filter(ageGroup => ageGroup !== "All ages")
            .map(ageGroup => ({
                ageGroup,
                value: populationForGenderFilter(values, state.year, ageGroup, state.category, state.gender)
            }));
        const largestCohort = cohorts.reduce((largest, cohort) => cohort.value > largest.value ? cohort : largest, cohorts[0]);

        elements.areaBadge.textContent = areaName;
        elements.statsTitle.textContent = areaDescription;
        elements.statsContext.textContent = block
            ? `Projection for the selected block within ${district.name} district.`
            : district
                ? `District projection inclusive of all ${district.blocks.length} blocks.`
                : "Statewide projection inclusive of all districts and blocks.";
        elements.population.textContent = numberFormatter.format(selectedTotal);
        elements.populationLabel.textContent = `${state.ageGroup} · ${state.category} · ${genderLabel}`;
        elements.male.textContent = numberFormatter.format(male);
        elements.female.textContent = numberFormatter.format(female);
        elements.maleShare.textContent = both ? `${formatPercentage((male / both) * 100)} of both genders` : "Not available";
        elements.femaleShare.textContent = both ? `${formatPercentage((female / both) * 100)} of both genders` : "Not available";
        elements.coverage.textContent = coverage;
        elements.sexRatio.textContent = Number.isFinite(sexRatio) ? numberFormatter.format(sexRatio) : "Not available";
        elements.change.textContent = state.year === 2025 ? "Baseline year" : `${change >= 0 ? "+" : ""}${formatPercentage(change)}`;
        elements.change.classList.toggle("is-negative", change < 0);
        elements.largestCohort.textContent = `${largestCohort.ageGroup} (${compactFormatter.format(largestCohort.value)})`;
        elements.stateShare.textContent = district || block ? formatPercentage(shareOfState) : "100.0%";
        elements.pyramidContext.textContent = `${areaName} · ${state.year} · ${state.category}`;
        elements.status.textContent = `Showing ${areaDescription} for ${state.year}.`;
        renderPyramid(values, areaName);
    };

    const selectDistrictByMapKey = mapKey => {
        if (!state.model) {
            state.mapKey = mapKey || "";
            return;
        }
        state.mapKey = districtForMapKey(mapKey) ? mapKey : "";
        state.block = "";
        updateBlockOptions();
        render();
    };

    const selectedDistrictBlockNames = () =>
        selectedDistrict()?.blocks.map(block => block.name) || [];

    const sendBlockOptionsToMap = () => {
        document.dispatchEvent(new CustomEvent("population:projectionblockoptions", {
            detail: {
                mapKey: state.mapKey,
                block: state.block,
                blockNames: selectedDistrictBlockNames()
            }
        }));
    };

    const initialize = async () => {
        try {
            const response = await fetch("assets/data/population-data.json", { cache: "no-store" });
            if (!response.ok) throw new Error(`population-data.json: ${response.status}`);
            state.model = await response.json();

            fillSelect(
                elements.district,
                ["", ...state.model.districts.map(district => district.mapKey)],
                state.mapKey,
                mapKey => mapKey ? districtForMapKey(mapKey).name : `All Odisha (${state.model.source.districts} districts)`
            );
            fillSelect(elements.age, dimensions().ageGroups, state.ageGroup);
            fillSelect(elements.category, dimensions().categories, state.category);
            updateBlockOptions();

            [elements.district, elements.age, elements.category, elements.gender, elements.reset]
                .forEach(control => { control.disabled = false; });
            card.setAttribute("aria-busy", "false");
            render();
            sendBlockOptionsToMap();
        } catch (error) {
            console.error("Population projection data error:", error);
            elements.status.textContent = "Population projection data could not be loaded. Please refresh the page.";
            elements.status.classList.add("is-error");
            card.setAttribute("aria-busy", "false");
        }
    };

    yearButtons.forEach(button => {
        button.addEventListener("click", () => {
            state.year = Number(button.dataset.projectionYear);
            render();
        });
    });
    elements.district.addEventListener("change", () => {
        selectDistrictByMapKey(elements.district.value);
        document.dispatchEvent(new CustomEvent("population:projectiondistrictrequest", {
            detail: {
                mapKey: state.mapKey,
                blockNames: selectedDistrictBlockNames()
            }
        }));
    });
    elements.block.addEventListener("change", () => {
        state.block = elements.block.value;
        render();
        document.dispatchEvent(new CustomEvent("population:projectionblockrequest", {
            detail: {
                mapKey: state.mapKey,
                block: state.block,
                blockNames: selectedDistrictBlockNames()
            }
        }));
    });
    elements.age.addEventListener("change", () => {
        state.ageGroup = elements.age.value;
        render();
    });
    elements.category.addEventListener("change", () => {
        state.category = elements.category.value;
        render();
    });
    elements.gender.addEventListener("change", () => {
        state.gender = elements.gender.value;
        render();
    });
    elements.reset.addEventListener("click", () => {
        state.year = 2025;
        state.block = "";
        state.ageGroup = "All ages";
        state.category = "Overall";
        state.gender = "Both";
        updateBlockOptions();
        render();
        document.dispatchEvent(new CustomEvent("population:projectionblockrequest", {
            detail: {
                mapKey: state.mapKey,
                block: "",
                blockNames: selectedDistrictBlockNames()
            }
        }));
    });
    document.addEventListener("population:mapdistrictchange", event => {
        selectDistrictByMapKey(event.detail?.mapKey || "");
        sendBlockOptionsToMap();
    });
    document.addEventListener("population:mapblockchange", event => {
        const requestedDistrict = event.detail?.mapKey || "";
        const requestedBlock = event.detail?.block || "";
        if (!state.model) {
            state.mapKey = requestedDistrict;
            state.block = requestedBlock;
            return;
        }

        state.mapKey = districtForMapKey(requestedDistrict) ? requestedDistrict : "";
        updateBlockOptions();
        state.block = selectedDistrict()?.blocks.some(block => block.name === requestedBlock)
            ? requestedBlock
            : "";
        render();
    });

    initialize();
})();

(() => {
    const mapElement = document.getElementById("populationGisMap");
    if (!mapElement) return;

    const statusElement = document.getElementById("gisStatus");
    const districtSelect = document.getElementById("gisDistrictSelect");
    const blockSelect = document.getElementById("gisBlockSelect");
    const blockToggle = document.querySelector('[data-gis-layer="blocks"]');
    const popupToggleButton = document.getElementById("gisPopupToggleButton");
    const resetButton = document.getElementById("gisResetButton");
    const numberFormatter = new Intl.NumberFormat("en-IN");
    const dataRoot = "assets/data/nhm-gis/";
    const dataVersion = "20260822-spatial-village-block-alignment-v2";
    const requestCache = new Map();

    if (typeof L === "undefined") {
        statusElement.textContent = "The map library could not be loaded. Please refresh the page.";
        statusElement.classList.add("is-error");
        return;
    }

    const setStatus = (message, isError = false) => {
        statusElement.textContent = message;
        statusElement.classList.toggle("is-error", isError);
    };

    const loadJson = file => {
        if (!requestCache.has(file)) {
            requestCache.set(file, fetch(`${dataRoot}${file}?v=${dataVersion}`).then(response => {
                if (!response.ok) throw new Error(`${file}: ${response.status}`);
                return response.json();
            }));
        }
        return requestCache.get(file);
    };

    const createPane = (name, zIndex) => {
        const pane = map.createPane(name);
        pane.style.zIndex = String(zIndex);
        return pane;
    };

    const map = L.map(mapElement, {
        preferCanvas: true,
        zoomControl: true,
        minZoom: 6,
        maxZoom: 17
    }).setView([20.3, 85.8], 7);

    createPane("districtPane", 410);
    createPane("blockPane", 420);
    createPane("districtLabelPane", 425);
    createPane("blockLabelPane", 426);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);

    const layerState = {
        metadata: null,
        districts: null,
        districtLabels: null,
        blocks: null,
        blockLabels: null,
        activePopup: null,
        lastPopupDescriptor: null,
        popupsEnabled: true,
        selectedDistrict: "",
        selectedBlock: "",
        selectedBlockDisplayName: "",
        projectionBlockNames: []
    };
    const districtFeatureLayers = new Map();
    const districtNameLabels = new Map();
    const blockFeatureLayers = new Map();
    const blockLabelGroups = new Map();
    const blockNameLabels = new Map();
    const gisBlockNamesByDistrict = new Map();
    const projectionBlockCrosswalks = new Map();
    const handledSelectionEvents = new WeakSet();
    const districtBaseStyle = {
        pane: "districtPane",
        color: "#075985",
        weight: 1.6,
        fillColor: "#7dd3fc",
        fillOpacity: 0.15
    };
    const districtSelectedStyle = {
        color: "#063f5e",
        weight: 3,
        fillColor: "#38bdf8",
        fillOpacity: 0.24
    };

    const text = value => value === null || value === undefined || value === "" ? "Not available" : String(value);
    const districtNameAliases = new Map([
        ["BARGARH", "BARAGARH"],
        ["KENDRAPARA", "KENDRAPADA"],
        ["NAWARANGPUR", "NABARANGPUR"]
    ]);
    const normalizeDistrictName = value => {
        const district = String(value || "").trim().toUpperCase();
        return districtNameAliases.get(district) || district;
    };
    const normalizeBlockName = value => String(value || "").trim().toUpperCase();
    const compactBlockName = value => normalizeBlockName(value).replace(/[^A-Z0-9]/g, "");
    const blockLayerKey = (district, block) => `${district}::${normalizeBlockName(block)}`;
    const markSelectionEventHandled = event => {
        if (event?.originalEvent && typeof event.originalEvent === "object") {
            handledSelectionEvents.add(event.originalEvent);
        }
    };
    const ringContainsLatLng = (ring, latLng) => {
        let inside = false;
        const x = latLng.lng;
        const y = latLng.lat;

        for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
            const currentPoint = ring[current];
            const previousPoint = ring[previous];
            const intersects = (currentPoint[1] > y) !== (previousPoint[1] > y) &&
                x < (previousPoint[0] - currentPoint[0]) * (y - currentPoint[1]) /
                (previousPoint[1] - currentPoint[1]) + currentPoint[0];
            if (intersects) inside = !inside;
        }
        return inside;
    };
    const geometryContainsLatLng = (geometry, latLng) => {
        const polygonContainsLatLng = polygon => Boolean(polygon?.length) &&
            ringContainsLatLng(polygon[0], latLng) &&
            !polygon.slice(1).some(ring => ringContainsLatLng(ring, latLng));

        if (geometry?.type === "Polygon") {
            return polygonContainsLatLng(geometry.coordinates);
        }
        if (geometry?.type === "MultiPolygon") {
            return geometry.coordinates.some(polygonContainsLatLng);
        }
        return false;
    };
    const featureLayerAtLatLng = (geoJsonLayer, latLng, predicate = () => true) => {
        let matchingLayer = null;
        if (!geoJsonLayer || !map.hasLayer(geoJsonLayer)) return matchingLayer;

        geoJsonLayer.eachLayer(featureLayer => {
            if (matchingLayer || featureLayer.options.interactive === false ||
                !predicate(featureLayer.feature?.properties || {})) return;
            if (featureLayer.getBounds && !featureLayer.getBounds().contains(latLng)) return;
            if (geometryContainsLatLng(featureLayer.feature?.geometry, latLng)) {
                matchingLayer = featureLayer;
            }
        });
        return matchingLayer;
    };

    const syncToolbarBlockSelect = (district, blockNames = [], selectedBlock = "") => {
        blockSelect.replaceChildren();
        const allBlocksOption = document.createElement("option");
        allBlocksOption.value = "";
        allBlocksOption.textContent = district
            ? `All blocks (${blockNames.length})`
            : "All blocks — select a district";
        blockSelect.appendChild(allBlocksOption);

        blockNames.forEach(blockName => {
            const option = document.createElement("option");
            option.value = blockName;
            option.textContent = blockName;
            blockSelect.appendChild(option);
        });

        blockSelect.disabled = !district;
        blockSelect.value = blockNames.includes(selectedBlock) ? selectedBlock : "";
    };

    const blockNameVariants = value => {
        const name = String(value || "");
        const variants = [name, name.replace(/\s*\([^)]*\)/g, "")];
        name.replace(/\(([^)]+)\)/g, (_, innerName) => {
            variants.push(innerName);
            return "";
        });
        return [...new Set(variants.map(compactBlockName).filter(Boolean))];
    };

    const levenshteinDistance = (left, right) => {
        let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
        for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
            const current = [leftIndex];
            for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
                current[rightIndex] = Math.min(
                    current[rightIndex - 1] + 1,
                    previous[rightIndex] + 1,
                    previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
                );
            }
            previous = current;
        }
        return previous[right.length];
    };

    const blockNameSimilarity = (left, right) => Math.max(
        ...blockNameVariants(left).flatMap(leftVariant =>
            blockNameVariants(right).map(rightVariant =>
                1 - (levenshteinDistance(leftVariant, rightVariant) /
                    Math.max(leftVariant.length, rightVariant.length, 1))
            )
        )
    );

    const buildBlockCrosswalk = (district, projectionBlockNames) => {
        const mapBlockNames = gisBlockNamesByDistrict.get(district) || [];
        const crosswalk = new Map();
        const usedMapBlocks = new Set();

        projectionBlockNames.forEach(projectionBlock => {
            const exactMatch = mapBlockNames.find(mapBlock =>
                !usedMapBlocks.has(mapBlock) &&
                compactBlockName(mapBlock) === compactBlockName(projectionBlock)
            );
            if (!exactMatch) return;
            crosswalk.set(normalizeBlockName(projectionBlock), exactMatch);
            usedMapBlocks.add(exactMatch);
        });

        const candidates = projectionBlockNames
            .filter(projectionBlock => !crosswalk.has(normalizeBlockName(projectionBlock)))
            .flatMap(projectionBlock => mapBlockNames
                .filter(mapBlock => !usedMapBlocks.has(mapBlock))
                .map(mapBlock => ({
                    projectionBlock,
                    mapBlock,
                    score: blockNameSimilarity(projectionBlock, mapBlock)
                })))
            .sort((left, right) => right.score - left.score);

        candidates.forEach(({ projectionBlock, mapBlock }) => {
            const projectionKey = normalizeBlockName(projectionBlock);
            if (crosswalk.has(projectionKey) || usedMapBlocks.has(mapBlock)) return;
            crosswalk.set(projectionKey, mapBlock);
            usedMapBlocks.add(mapBlock);
        });

        projectionBlockCrosswalks.set(district, crosswalk);
        return crosswalk;
    };

    const resolveMapBlockName = (district, requestedBlock, projectionBlockNames = []) => {
        const requestedKey = normalizeBlockName(requestedBlock);
        if (!requestedKey) return "";
        if (blockFeatureLayers.has(blockLayerKey(district, requestedKey))) return requestedKey;

        const crosswalk = projectionBlockNames.length
            ? buildBlockCrosswalk(district, projectionBlockNames)
            : projectionBlockCrosswalks.get(district);
        return crosswalk?.get(requestedKey) || requestedKey;
    };

    const resolveProjectionBlockName = (district, mapBlock, projectionBlockNames = []) => {
        const normalizedMapBlock = normalizeBlockName(mapBlock);
        if (!normalizedMapBlock) return "";
        const crosswalk = projectionBlockNames.length
            ? buildBlockCrosswalk(district, projectionBlockNames)
            : projectionBlockCrosswalks.get(district);

        const exactProjectionBlock = projectionBlockNames.find(projectionBlock =>
            compactBlockName(projectionBlock) === compactBlockName(normalizedMapBlock)
        );
        if (exactProjectionBlock) return exactProjectionBlock;

        const exactMappedBlock = projectionBlockNames.find(projectionBlock =>
            normalizeBlockName(crosswalk?.get(normalizeBlockName(projectionBlock))) === normalizedMapBlock
        );
        if (exactMappedBlock) return exactMappedBlock;

        const closestProjectionBlock = projectionBlockNames
            .map(projectionBlock => ({
                projectionBlock,
                score: Math.max(
                    blockNameSimilarity(projectionBlock, normalizedMapBlock),
                    blockNameSimilarity(
                        crosswalk?.get(normalizeBlockName(projectionBlock)) || projectionBlock,
                        normalizedMapBlock
                    )
                )
            }))
            .sort((left, right) => right.score - left.score)[0];

        return closestProjectionBlock?.score >= 0.55
            ? closestProjectionBlock.projectionBlock
            : mapBlock;
    };

    const makePopup = (title, rows) => {
        const wrapper = document.createElement("div");
        wrapper.className = "gis-popup";
        const heading = document.createElement("h4");
        heading.textContent = text(title);
        wrapper.appendChild(heading);
        const list = document.createElement("dl");
        rows.forEach(([label, value]) => {
            const row = document.createElement("div");
            const term = document.createElement("dt");
            const detail = document.createElement("dd");
            term.textContent = label;
            detail.textContent = text(value);
            row.append(term, detail);
            list.appendChild(row);
        });
        wrapper.appendChild(list);
        return wrapper;
    };

    const closeActivePopup = () => {
        if (!layerState.activePopup) return;
        const popup = layerState.activePopup;
        layerState.activePopup = null;
        if (map.hasLayer(popup)) map.removeLayer(popup);
    };

    const openPersistentPopup = (latLng, content, onCloseButton) => {
        layerState.lastPopupDescriptor = { latLng, content, onCloseButton };
        closeActivePopup();
        if (!layerState.popupsEnabled) return null;

        const popup = L.popup({
            closeButton: true,
            autoPan: true,
            autoClose: false,
            closeOnClick: false
        })
            .setLatLng(latLng)
            .setContent(content);

        layerState.activePopup = popup;
        popup.once("remove", () => {
            if (layerState.activePopup === popup) layerState.activePopup = null;
        });
        popup.once("add", () => {
            const closeButton = popup.getElement()?.querySelector(".leaflet-popup-close-button");
            if (!closeButton || !onCloseButton) return;
            closeButton.addEventListener("click", onCloseButton, { once: true });
        });
        popup.openOn(map);
        return popup;
    };

    const setPopupsEnabled = enabled => {
        layerState.popupsEnabled = enabled;
        popupToggleButton.setAttribute("aria-pressed", String(enabled));
        popupToggleButton.textContent = enabled ? "Hide popups" : "Show popups";

        if (!enabled) {
            closeActivePopup();
            setStatus("Map popups are turned off. District, block, and village selection remains available.");
            return;
        }

        const descriptor = layerState.lastPopupDescriptor;
        if (descriptor) {
            openPersistentPopup(
                descriptor.latLng,
                descriptor.content,
                descriptor.onCloseButton
            );
        }
        setStatus("Map popups are turned on.");
    };

    const updateSummary = metadata => {
        document.getElementById("gisDistrictCount").textContent = numberFormatter.format(metadata.counts.districts);
        document.getElementById("gisBlockCount").textContent = numberFormatter.format(metadata.counts.blocks);
        document.getElementById("gisVillageCount").textContent = numberFormatter.format(metadata.counts.villages);
        document.getElementById("gisHealthCount").textContent = numberFormatter.format(
            metadata.counts.subcentres + metadata.counts.medicalFacilities
        );
    };

    const districtBlockCount = district => {
        if (!layerState.blocks || !district) return layerState.metadata.counts.blocks;
        return layerState.blocks.toGeoJSON().features.filter(
            feature => feature.properties.DISTRICT === district
        ).length;
    };

    const updateDetails = () => {
        const district = layerState.selectedDistrict;
        const block = layerState.selectedBlock;
        const blockDisplayName = layerState.selectedBlockDisplayName || block;
        const hasBlockGeometry = !block || blockFeatureLayers.has(blockLayerKey(district, block));

        document.getElementById("gisDetailsTitle").textContent = block ? `${blockDisplayName} Block` : district || "Odisha";
        document.getElementById("gisDetailsDescription").textContent = block
            ? hasBlockGeometry
                ? `Showing only ${blockDisplayName} block within ${district} district.`
                : `No block boundary is available in the GIS source for ${blockDisplayName}.`
            : district
                ? `Showing ${district} district and its block boundaries.`
                : "Select a district on the map or from the list to explore blocks.";
        document.getElementById("gisSelectedBlocks").textContent = numberFormatter.format(
            block ? Number(hasBlockGeometry) : districtBlockCount(district)
        );
    };

    const styleDistrictSelection = () => {
        districtFeatureLayers.forEach((featureLayer, district) => {
            const isSelected = district === layerState.selectedDistrict;
            const isHidden = Boolean(layerState.selectedDistrict) && !isSelected;
            featureLayer.options.interactive = !isHidden;
            featureLayer.setStyle(isSelected
                ? districtSelectedStyle
                : isHidden
                    ? {
                        pane: "districtPane",
                        color: "transparent",
                        weight: 0,
                        fillColor: "transparent",
                        fillOpacity: 0,
                        opacity: 0
                    }
                    : districtBaseStyle);
        });
    };

    const syncDistrictLabels = () => {
        if (!layerState.districtLabels) return;
        if (!map.hasLayer(layerState.districtLabels)) layerState.districtLabels.addTo(map);

        districtNameLabels.forEach((label, district) => {
            const districtLayer = districtFeatureLayers.get(district);
            const selectedBlockLayer = blockFeatureLayers.get(blockLayerKey(
                layerState.selectedDistrict,
                layerState.selectedBlock
            ));
            const labelBounds = district === layerState.selectedDistrict && selectedBlockLayer
                ? selectedBlockLayer.getBounds()
                : districtLayer?.getBounds();
            if (labelBounds) {
                label.setLatLng(district === layerState.selectedDistrict && selectedBlockLayer
                    ? [labelBounds.getNorth(), labelBounds.getCenter().lng]
                    : labelBounds.getCenter());
            }

            const labelElement = label.getElement();
            if (!labelElement) return;
            const hidden = Boolean(layerState.selectedDistrict) && district !== layerState.selectedDistrict;
            labelElement.classList.toggle("is-district-label-hidden", hidden);
            labelElement.setAttribute("aria-hidden", String(hidden));
        });
    };

    const syncBlockLabels = () => {
        if (layerState.blockLabels && map.hasLayer(layerState.blockLabels)) {
            map.removeLayer(layerState.blockLabels);
        }
        layerState.blockLabels = null;

        if (!layerState.selectedDistrict || !blockToggle.checked) return;
        blockNameLabels.forEach(({ label, mapName }) => label.setContent(mapName));
        const selectedBlockRecord = blockNameLabels.get(blockLayerKey(
            layerState.selectedDistrict,
            layerState.selectedBlock
        ));
        if (selectedBlockRecord) {
            selectedBlockRecord.label.setContent(
                layerState.selectedBlockDisplayName || selectedBlockRecord.mapName
            );
        }
        const selectedLabels = layerState.selectedBlock
            ? L.layerGroup(selectedBlockRecord ? [selectedBlockRecord.label] : [])
            : blockLabelGroups.get(layerState.selectedDistrict);
        if (!selectedLabels) return;

        selectedLabels.addTo(map);
        layerState.blockLabels = selectedLabels;
    };

    const styleBlockSelection = () => {
        if (!layerState.blocks) return;
        layerState.blocks.eachLayer(featureLayer => {
            const properties = featureLayer.feature.properties;
            const inDistrict = !layerState.selectedDistrict || properties.DISTRICT === layerState.selectedDistrict;
            const isSelectedBlock = !layerState.selectedBlock ||
                normalizeBlockName(properties.T_NAME) === layerState.selectedBlock;
            const selected = inDistrict && isSelectedBlock;
            const hiddenByAreaSelection = Boolean(layerState.selectedDistrict) && !inDistrict;
            const hiddenByBlockSelection = Boolean(layerState.selectedBlock) && !selected;
            const hidden = hiddenByAreaSelection || hiddenByBlockSelection;
            featureLayer.options.interactive = !hidden;
            featureLayer.setStyle({
                pane: "blockPane",
                color: selected ? "#be123c" : hidden ? "transparent" : "#a7b7c0",
                weight: selected ? 1.4 : hidden ? 0 : 0.55,
                fillColor: selected ? "#fb7185" : hidden ? "transparent" : "#d8e2e7",
                fillOpacity: selected ? 0.12 : hidden ? 0 : 0.015,
                opacity: selected ? 0.95 : hidden ? 0 : 0.3
            });
            if (selected && layerState.selectedBlock) featureLayer.bringToFront();
        });
    };

    const openSelectedBlockPopup = (district, block) => {
        const featureLayer = blockFeatureLayers.get(blockLayerKey(district, block));
        if (!featureLayer) return false;

        const properties = featureLayer.feature.properties;
        openPersistentPopup(
            featureLayer.getBounds().getCenter(),
            makePopup(properties.T_NAME, [
                ["District", properties.DISTRICT],
                ["Block code", properties.T_CODE]
            ]),
            () => showAllBlocksForDistrict(district, true)
        );
        return true;
    };

    const openStatePopup = () => {
        if (!layerState.districts || !layerState.metadata) return false;

        openPersistentPopup(
            layerState.districts.getBounds().getCenter(),
            makePopup("Odisha", [
                ["Area", "State"],
                ["Districts", numberFormatter.format(layerState.metadata.counts.districts)],
                ["Blocks", numberFormatter.format(layerState.metadata.counts.blocks)]
            ])
        );
        return true;
    };

    const openSelectedDistrictPopup = district => {
        const featureLayer = districtFeatureLayers.get(district);
        if (!featureLayer) return false;

        openPersistentPopup(
            featureLayer.getBounds().getCenter(),
            makePopup(district, [
                ["Area", "District"],
                ["Blocks", numberFormatter.format(districtBlockCount(district))]
            ]),
            () => selectDistrict("")
        );
        return true;
    };

    const selectDistrict = async (
        district,
        fitMap = true,
        block = "",
        notifyProjection = true,
        projectionBlockNames = []
    ) => {
        layerState.selectedDistrict = district || "";
        layerState.projectionBlockNames = projectionBlockNames;
        syncToolbarBlockSelect(layerState.selectedDistrict, projectionBlockNames, block);
        layerState.selectedBlockDisplayName = layerState.selectedDistrict
            ? normalizeBlockName(block)
            : "";
        layerState.selectedBlock = layerState.selectedDistrict
            ? resolveMapBlockName(layerState.selectedDistrict, block, projectionBlockNames)
            : "";
        if (notifyProjection) {
            document.dispatchEvent(new CustomEvent("population:mapdistrictchange", {
                detail: { mapKey: layerState.selectedDistrict }
            }));
        }
        districtSelect.value = layerState.selectedDistrict;

        styleDistrictSelection();
        styleBlockSelection();
        syncDistrictLabels();
        syncBlockLabels();
        updateDetails();

        const selectedBlockLayer = blockFeatureLayers.get(blockLayerKey(
            layerState.selectedDistrict,
            layerState.selectedBlock
        ));
        const selectedLayer = districtFeatureLayers.get(layerState.selectedDistrict);
        if (fitMap) {
            if (selectedBlockLayer) map.fitBounds(selectedBlockLayer.getBounds(), { padding: [34, 34] });
            else if (selectedLayer) map.fitBounds(selectedLayer.getBounds(), { padding: [24, 24] });
            else if (layerState.districts) map.fitBounds(layerState.districts.getBounds(), { padding: [18, 18] });
        }

        if (layerState.selectedBlock && selectedBlockLayer) {
            openSelectedBlockPopup(layerState.selectedDistrict, layerState.selectedBlock);
        } else if (layerState.selectedDistrict && selectedLayer) {
            openSelectedDistrictPopup(layerState.selectedDistrict);
        } else {
            openStatePopup();
        }

        setStatus(layerState.selectedBlock
            ? selectedBlockLayer
                ? `${layerState.selectedBlockDisplayName} block selected in ${layerState.selectedDistrict}.`
                : `No GIS block boundary is available for ${layerState.selectedBlockDisplayName} in ${layerState.selectedDistrict}.`
            : layerState.selectedDistrict
                ? `${layerState.selectedDistrict} district and block boundaries selected.`
            : "Statewide district and block boundaries are ready.");
    };

    document.addEventListener("population:projectiondistrictrequest", event => {
        const requestedDistrict = event.detail?.mapKey || "";
        const projectionBlockNames = event.detail?.blockNames || [];
        if (!layerState.metadata) {
            layerState.selectedDistrict = requestedDistrict;
            layerState.selectedBlock = "";
            layerState.selectedBlockDisplayName = "";
            layerState.projectionBlockNames = projectionBlockNames;
            syncToolbarBlockSelect(requestedDistrict, projectionBlockNames);
            return;
        }
        selectDistrict(requestedDistrict, true, "", false, projectionBlockNames);
    });

    document.addEventListener("population:projectionblockoptions", event => {
        const requestedDistrict = event.detail?.mapKey || "";
        if (requestedDistrict !== layerState.selectedDistrict) return;
        const projectionBlockNames = event.detail?.blockNames || [];
        layerState.projectionBlockNames = projectionBlockNames;
        syncToolbarBlockSelect(
            requestedDistrict,
            projectionBlockNames,
            event.detail?.block || ""
        );
    });

    document.addEventListener("population:projectionblockrequest", event => {
        const requestedDistrict = event.detail?.mapKey || "";
        const requestedBlock = event.detail?.block || "";
        const projectionBlockNames = event.detail?.blockNames || [];
        if (!layerState.metadata) {
            layerState.selectedDistrict = requestedDistrict;
            layerState.selectedBlock = normalizeBlockName(requestedBlock);
            layerState.selectedBlockDisplayName = normalizeBlockName(requestedBlock);
            layerState.projectionBlockNames = projectionBlockNames;
            return;
        }
        selectDistrict(requestedDistrict, true, requestedBlock, false, projectionBlockNames);
    });

    const selectBlockFromMap = async (district, mapBlock) => {
        layerState.selectedDistrict = district;
        document.dispatchEvent(new CustomEvent("population:mapdistrictchange", {
            detail: { mapKey: district }
        }));

        const projectionBlock = resolveProjectionBlockName(
            district,
            mapBlock,
            layerState.projectionBlockNames
        );
        await selectDistrict(
            district,
            true,
            projectionBlock,
            false,
            layerState.projectionBlockNames
        );
        document.dispatchEvent(new CustomEvent("population:mapblockchange", {
            detail: {
                mapKey: district,
                block: projectionBlock
            }
        }));
    };

    const selectBlockFromOverlay = async (district, rawBlock) => {
        if (!district || !rawBlock) return;
        if (layerState.selectedDistrict !== district) {
            await selectDistrict(district);
        }
        await selectBlockFromMap(district, rawBlock);
    };

    const showAllBlocksForDistrict = (district, showDistrictPopup = false) => {
        const selection = selectDistrict(
            district,
            true,
            "",
            false,
            layerState.projectionBlockNames
        );
        document.dispatchEvent(new CustomEvent("population:mapblockchange", {
            detail: {
                mapKey: district,
                block: ""
            }
        }));
        if (showDistrictPopup && district === layerState.selectedDistrict) {
            openSelectedDistrictPopup(district);
        }
        return selection;
    };

    map.on("click", async event => {
        if (!mapElement.classList.contains("gis-selection-ready") ||
            handledSelectionEvents.has(event.originalEvent)) return;

        const blockLayer = featureLayerAtLatLng(
            layerState.blocks,
            event.latlng,
            properties => !layerState.selectedDistrict ||
                properties.DISTRICT === layerState.selectedDistrict
        );
        if (blockLayer) {
            const properties = blockLayer.feature.properties;
            if (layerState.selectedDistrict) {
                await selectBlockFromMap(properties.DISTRICT, properties.T_NAME);
            } else {
                await selectDistrict(properties.DISTRICT);
            }
            return;
        }

        const districtLayer = featureLayerAtLatLng(layerState.districts, event.latlng);
        if (districtLayer) await selectDistrict(districtLayer.feature.properties.DISTRICT);
    });

    const handleLayerToggle = async event => {
        const checkbox = event.currentTarget;
        const layerName = checkbox.dataset.gisLayer;

        if (layerName === "blocks") {
            if (!layerState.blocks) return;
            if (checkbox.checked) {
                layerState.blocks.addTo(map);
                styleBlockSelection();
            } else {
                map.removeLayer(layerState.blocks);
            }
            syncBlockLabels();
            setStatus(`Block boundaries ${checkbox.checked ? "displayed" : "hidden"}.`);
            return;
        }

    };

    const initialize = async () => {
        try {
            const [metadata, districtData, blockData] = await Promise.all([
                loadJson("index.json"),
                loadJson("districts.geojson"),
                loadJson("blocks.geojson")
            ]);
            layerState.metadata = metadata;
            updateSummary(metadata);

            const districtNames = districtData.features
                .map(feature => normalizeDistrictName(feature.properties.DISTRICT))
                .filter(Boolean)
                .sort();
            [...new Set(districtNames)].forEach(district => {
                const option = document.createElement("option");
                option.value = district;
                option.textContent = district;
                districtSelect.appendChild(option);
            });
            districtSelect.disabled = false;

            layerState.districts = L.geoJSON(districtData, {
                pane: "districtPane",
                style: districtBaseStyle,
                onEachFeature: (feature, featureLayer) => {
                    const district = normalizeDistrictName(feature.properties.DISTRICT);
                    feature.properties.DISTRICT = district;
                    districtFeatureLayers.set(district, featureLayer);
                    featureLayer.on("click", event => {
                        markSelectionEventHandled(event);
                        selectDistrict(district);
                    });
                }
            }).addTo(map);

            layerState.districtLabels = L.layerGroup();
            districtFeatureLayers.forEach((featureLayer, district) => {
                const districtLabel = L.tooltip({
                    pane: "districtLabelPane",
                    permanent: true,
                    direction: "center",
                    className: "gis-district-name-label",
                    interactive: false,
                    opacity: 1
                })
                    .setLatLng(featureLayer.getBounds().getCenter())
                    .setContent(district)
                    .addTo(layerState.districtLabels);
                districtNameLabels.set(district, districtLabel);
            });
            syncDistrictLabels();

            layerState.blocks = L.geoJSON(blockData, {
                pane: "blockPane",
                style: {
                    color: "#be123c",
                    weight: 0.85,
                    fillColor: "#fb7185",
                    fillOpacity: 0.05
                },
                onEachFeature: (feature, featureLayer) => {
                    const properties = feature.properties;
                    const normalizedBlock = normalizeBlockName(properties.T_NAME);
                    blockFeatureLayers.set(blockLayerKey(properties.DISTRICT, normalizedBlock), featureLayer);
                    if (!gisBlockNamesByDistrict.has(properties.DISTRICT)) {
                        gisBlockNamesByDistrict.set(properties.DISTRICT, []);
                    }
                    gisBlockNamesByDistrict.get(properties.DISTRICT).push(normalizedBlock);
                    if (!blockLabelGroups.has(properties.DISTRICT)) {
                        blockLabelGroups.set(properties.DISTRICT, L.layerGroup());
                    }
                    const blockLabel = L.tooltip({
                        pane: "blockLabelPane",
                        permanent: true,
                        direction: "center",
                        className: "gis-block-name-label",
                        interactive: false,
                        opacity: 1
                    })
                        .setLatLng(featureLayer.getBounds().getCenter())
                        .setContent(properties.T_NAME)
                        .addTo(blockLabelGroups.get(properties.DISTRICT));
                    blockNameLabels.set(
                        blockLayerKey(properties.DISTRICT, normalizedBlock),
                        { label: blockLabel, mapName: normalizedBlock }
                    );

                    featureLayer.on("click", event => {
                        markSelectionEventHandled(event);
                        if (layerState.selectedDistrict !== properties.DISTRICT) {
                            selectDistrict(properties.DISTRICT);
                            return;
                        }
                        selectBlockFromMap(properties.DISTRICT, properties.T_NAME);
                    });
                }
            }).addTo(map);

            mapElement.classList.add("gis-selection-ready");

            if (layerState.selectedDistrict) {
                await selectDistrict(
                    layerState.selectedDistrict,
                    true,
                    layerState.selectedBlockDisplayName || layerState.selectedBlock,
                    false,
                    layerState.projectionBlockNames
                );
            }
            else {
                map.fitBounds(layerState.districts.getBounds(), { padding: [18, 18] });
                updateDetails();
                openStatePopup();
                setStatus("Statewide district and block boundaries are ready.");
            }
        } catch (error) {
            mapElement.classList.remove("gis-selection-ready");
            console.error("NHM GIS initialization error:", error);
            setStatus("The NHM GIS map data could not be loaded. Please refresh the page.", true);
        }
    };

    districtSelect.addEventListener("change", event => selectDistrict(event.target.value));
    blockSelect.addEventListener("change", async event => {
        const requestedBlock = event.target.value;
        if (requestedBlock) await selectBlockFromMap(layerState.selectedDistrict, requestedBlock);
        else showAllBlocksForDistrict(layerState.selectedDistrict);
    });
    document.querySelectorAll("[data-gis-layer]").forEach(checkbox => {
        checkbox.addEventListener("change", handleLayerToggle);
    });
    popupToggleButton.addEventListener("click", () => {
        setPopupsEnabled(!layerState.popupsEnabled);
    });
    resetButton.addEventListener("click", () => {
        blockToggle.checked = true;
        if (layerState.blocks && !map.hasLayer(layerState.blocks)) layerState.blocks.addTo(map);
        selectDistrict("");
    });

    if (typeof ResizeObserver !== "undefined") {
        new ResizeObserver(() => map.invalidateSize()).observe(mapElement);
    }

    initialize();
})();
