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
        const [districtResponse, recordsResponse] = await Promise.all([
            fetch("assets/data/district-trainings.json", {
                headers: { "Accept": "application/json" }
            }),
            fetch(`/api/content/cancer-burden-pdfs?language=${encodeURIComponent(cancerBurdenLanguageAtLoad)}`, {
                headers: { "Accept": "application/json" }
            })
        ]);
        if (!districtResponse.ok) throw new Error(`Districts HTTP ${districtResponse.status}`);
        if (!recordsResponse.ok) throw new Error(`Cancer burden PDFs HTTP ${recordsResponse.status}`);

        const districtPayload = await districtResponse.json();
        const districtCollator = new Intl.Collator("en", {
            sensitivity: "base",
            numeric: true
        });
        const districts = (districtPayload.districts || [])
            .map((item) => String(item.name || "").trim())
            .filter(Boolean)
            .sort((left, right) => districtCollator.compare(left, right));
        const records = (await recordsResponse.json()).sort((left, right) =>
            left.district.localeCompare(right.district) || left.title.localeCompare(right.title)
        );

        if (districts.length === 0) {
            select.innerHTML = `<option>${cancerBurdenTranslate("Districts unavailable")}</option>`;
            select.disabled = true;
            track.innerHTML = emptyCancerBurdenSlide(
                cancerBurdenTranslate("District data could not be loaded.")
            );
            return;
        }

        const recordByDistrict = new Map(
            records.map((record) => [record.district.toLocaleLowerCase(), record])
        );
        const slidesData = districts.map((district) => ({
            district,
            record: recordByDistrict.get(district.toLocaleLowerCase()) || null
        }));

        select.innerHTML = slidesData.map((item, index) => `
            <option value="${index}">${escapeCancerBurdenHtml(cancerBurdenTranslate(item.district))}</option>
        `).join("");

        track.innerHTML = slidesData.map((item) => {
            const district = escapeCancerBurdenHtml(cancerBurdenTranslate(item.district));

            if (!item.record) {
                return `
                    <article class="district-pdf-slide">
                        <div class="district-pdf-meta">
                            <span class="district-pdf-label">${district}</span>
                            <h4>${cancerBurdenTranslate("District Cancer Burden PDF")}</h4>
                            <p>${cancerBurdenTranslate("{{district}} district factsheet will be added soon.", { district })}</p>
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

            const title = escapeCancerBurdenHtml(item.record.title);
            const description = escapeCancerBurdenHtml(item.record.description);
            const pdfPath = escapeCancerBurdenHtml(encodeURI(item.record.pdfPath));
            const previewPath = escapeCancerBurdenHtml(encodeURI(item.record.previewPath));

            return `
                <article class="district-pdf-slide">
                    <div class="district-pdf-meta">
                        <span class="district-pdf-label">${district}</span>
                        <h4>${title}</h4>
                        <p>${description}</p>
                        <div class="district-pdf-actions">
                            <a class="view-btn training-report-btn" href="${pdfPath}" target="_blank" rel="noopener noreferrer">${cancerBurdenTranslate("View PDF")}</a>
                            <a class="download-btn training-report-btn" href="${pdfPath}" download>${cancerBurdenTranslate("Download PDF")}</a>
                        </div>
                    </div>
                    <div class="district-pdf-frame-shell district-pdf-preview-shell">
                        <img
                            class="district-pdf-preview-image"
                            src="${previewPath}"
                            alt="${district} ${cancerBurdenTranslate("cancer burden PDF preview")}" 
                            loading="lazy"
                        >
                    </div>
                </article>
            `;
        }).join("");

        const slides = Array.from(track.querySelectorAll(".district-pdf-slide"));
        const controls = Array.from(carousel.querySelectorAll(".gallery-nav"));
        // Always begin with the first district alphabetically, even when its PDF is unavailable.
        let currentIndex = 0;
        let autoSlideTimer = null;

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
            if (slides.length > 1 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                autoSlideTimer = window.setInterval(() => moveCarousel(1), 4500);
            }
        }

        controls.forEach((button) => {
            button.disabled = slides.length < 2;
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
        carousel.addEventListener("focusin", stopAutoSlide);
        carousel.addEventListener("focusout", startAutoSlide);

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
