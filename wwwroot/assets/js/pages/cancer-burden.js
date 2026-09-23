const cancerBurdenTranslate = (key, replacements = {}) => {
    if (window.i18n) return window.i18n.t(key, replacements);

    return Object.entries(replacements).reduce(
        (value, [name, replacement]) => value.replaceAll(`{{${name}}}`, replacement),
        key
    );
};

document.addEventListener("DOMContentLoaded", initializeCancerBurdenPdfCarousel);

let cancerBurdenLanguageAtLoad = null;

document.addEventListener("languagechange", (event) => {
    if (cancerBurdenLanguageAtLoad && event.detail?.language !== cancerBurdenLanguageAtLoad) {
        window.location.reload();
    }
});

async function initializeCancerBurdenPdfCarousel() {
    cancerBurdenLanguageAtLoad = window.i18n?.getLanguage() || "en";
    const carousel = document.querySelector("[data-cancer-burden-pdf-carousel]");
    const track = document.getElementById("cancerBurdenPdfTrack");
    const select = document.getElementById("cancerBurdenPdfFilter");

    if (!carousel || !track || !select) return;

    try {
        const [districtsResponse, recordsResponse] = await Promise.all([
            fetch("assets/data/district-trainings.json", {
                headers: { "Accept": "application/json" }
            }).catch(() => null),
            fetch(
                `api/content/cancer-burden-pdfs?language=${encodeURIComponent(cancerBurdenLanguageAtLoad)}`,
                { cache: "no-store", headers: { "Accept": "application/json" } }
            )
        ]);

        if (!recordsResponse.ok) throw new Error(`Cancer burden PDFs HTTP ${recordsResponse.status}`);

        const districtCollator = new Intl.Collator("en", {
            sensitivity: "base",
            numeric: true
        });
        const normalizeDistrictName = (value) => String(value || "")
            .trim()
            .toLocaleLowerCase("en");
        const districtsPayload = districtsResponse?.ok
            ? await districtsResponse.json()
            : { districts: [] };
        const staticDistricts = (districtsPayload.districts || [])
            .map((item) => String(item.name || "").trim())
            .filter(Boolean);
        const records = (await recordsResponse.json())
            .filter((record) => record.district && record.pdfPath)
            .sort((left, right) =>
                districtCollator.compare(left.district, right.district) ||
                districtCollator.compare(left.title, right.title)
            );
        const districtNames = new Map();
        [...staticDistricts, ...records.map((record) => String(record.district).trim())]
            .filter(Boolean)
            .forEach((district) => {
                const normalized = normalizeDistrictName(district);
                if (!districtNames.has(normalized)) districtNames.set(normalized, district);
            });
        const districts = Array.from(districtNames.values()).sort(districtCollator.compare);

        if (districts.length === 0) {
            select.innerHTML = `<option>${cancerBurdenTranslate("Districts unavailable")}</option>`;
            select.disabled = true;
            track.innerHTML = emptyCancerBurdenSlide(
                cancerBurdenTranslate("District cancer burden PDF records are not available right now.")
            );
            return;
        }

        const recordsByDistrict = new Map(
            records.map((record) => [normalizeDistrictName(record.district), record])
        );
        const slidesData = districts.map((district) => ({
            district,
            record: recordsByDistrict.get(normalizeDistrictName(district)) || null
        }));

        select.disabled = false;
        select.innerHTML = slidesData.map((item, index) => `
            <option value="${index}">${escapeCancerBurdenHtml(cancerBurdenTranslate(item.district))}</option>
        `).join("");

        track.innerHTML = slidesData.map((item) => {
            const translatedDistrict = cancerBurdenTranslate(item.district);
            const district = escapeCancerBurdenHtml(translatedDistrict);

            if (!item.record) {
                return `
                    <article class="district-pdf-slide">
                        <div class="district-pdf-meta">
                            <span class="district-pdf-label">${district}</span>
                            <h4>${cancerBurdenTranslate("District Cancer Burden PDF")}</h4>
                            <p>${escapeCancerBurdenHtml(cancerBurdenTranslate("{{district}} district PDF will be added soon.", { district: translatedDistrict }))}</p>
                        </div>
                        <div class="district-pdf-frame-shell district-pdf-placeholder">
                            <div class="district-pdf-placeholder-copy">
                                <h4>${district}</h4>
                                <p>${cancerBurdenTranslate("PDF not available yet.")}</p>
                            </div>
                        </div>
                    </article>
                `;
            }

            const title = window.OSPBCRRichText?.sanitize(item.record.title) ||
                escapeCancerBurdenHtml(item.record.title);
            const description = window.OSPBCRRichText?.sanitize(item.record.description) ||
                escapeCancerBurdenHtml(item.record.description);
            const pdfPath = escapeCancerBurdenHtml(encodeURI(item.record.pdfPath));
            const previewPath = escapeCancerBurdenHtml(encodeURI(item.record.previewPath));

            return `
                <article class="district-pdf-slide">
                    <div class="district-pdf-meta">
                        <span class="district-pdf-label">${district}</span>
                        <div class="district-pdf-rich-title rich-text-title rich-text-content" role="heading" aria-level="4">${title}</div>
                        <div class="district-pdf-rich-text rich-text-content">${description}</div>
                        <div class="district-pdf-actions">
                            <a class="view-btn training-report-btn" href="${pdfPath}" target="_blank" rel="noopener noreferrer">${cancerBurdenTranslate("View PDF")}</a>
                            <a class="download-btn training-report-btn" href="${pdfPath}" download>${cancerBurdenTranslate("Download PDF")}</a>
                        </div>
                    </div>
                    <div class="district-pdf-frame-shell district-pdf-preview-shell">
                        <img
                            class="district-pdf-preview-image"
                            src="${previewPath}"
                            alt="${escapeCancerBurdenHtml(cancerBurdenTranslate("{{district}} cancer burden PDF preview", { district: translatedDistrict }))}"
                            loading="lazy"
                        >
                    </div>
                </article>
            `;
        }).join("");

        const slides = Array.from(track.querySelectorAll(".district-pdf-slide"));
        const controls = Array.from(carousel.querySelectorAll(".gallery-nav"));
        let currentIndex = 0;
        let autoSlideTimer = null;

        if (slides.length === 0) return;

        function updateCarousel() {
            track.style.transform = `translateX(-${currentIndex * 100}%)`;
            select.value = String(currentIndex);
            slides.forEach((slide, index) => slide.setAttribute("aria-hidden", String(index !== currentIndex)));
        }

        function moveCarousel(direction) {
            currentIndex = (currentIndex + direction + slides.length) % slides.length;
            updateCarousel();
        }

        function stopAutoSlide() {
            if (autoSlideTimer) {
                window.clearInterval(autoSlideTimer);
                autoSlideTimer = null;
            }
        }

        function startAutoSlide() {
            stopAutoSlide();
            autoSlideTimer = window.setInterval(() => moveCarousel(1), 4500);
        }

        controls.forEach((button) => {
            button.addEventListener("click", () => {
                moveCarousel(Number(button.dataset.direction));
                startAutoSlide();
            });
        });

        select.addEventListener("change", (event) => {
            currentIndex = Number(event.target.value);
            updateCarousel();
            startAutoSlide();
        });
        carousel.addEventListener("mouseenter", stopAutoSlide);
        carousel.addEventListener("mouseleave", startAutoSlide);

        updateCarousel();
        startAutoSlide();
    } catch (error) {
        console.error("Cancer burden PDF records could not be loaded.", error);
        select.innerHTML = `<option>${cancerBurdenTranslate("Unavailable")}</option>`;
        select.disabled = true;
        track.innerHTML = emptyCancerBurdenSlide(
            cancerBurdenTranslate("Cancer burden PDF data could not be loaded.")
        );
    }
}

function emptyCancerBurdenSlide(message) {
    return `
        <article class="district-pdf-slide">
            <div class="district-pdf-meta">
                <h4>${escapeCancerBurdenHtml(message)}</h4>
            </div>
        </article>
    `;
}

function escapeCancerBurdenHtml(value) {
    const element = document.createElement("div");
    element.textContent = String(value || "");
    return element.innerHTML;
}
