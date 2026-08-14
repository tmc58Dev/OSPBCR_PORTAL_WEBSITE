document.addEventListener("DOMContentLoaded", initializeOdishaCircularCarousel);

let odishaCircularLanguageAtLoad = null;

document.addEventListener("languagechange", (event) => {
    if (odishaCircularLanguageAtLoad && event.detail?.language !== odishaCircularLanguageAtLoad) {
        window.location.reload();
    }
});

async function initializeOdishaCircularCarousel() {
    odishaCircularLanguageAtLoad = window.i18n?.getLanguage() || "en";
    const carousel = document.querySelector("[data-odisha-circular-carousel]");
    const track = document.getElementById("odishaCircularTrack");
    const select = document.getElementById("odishaCircularFilter");

    if (!carousel || !track || !select) return;

    try {
        const response = await fetch(`/api/content/odisha-circulars?language=${encodeURIComponent(odishaCircularLanguageAtLoad)}`, {
            headers: { "Accept": "application/json" }
        });
        if (!response.ok) throw new Error(`Odisha circulars HTTP ${response.status}`);

        const records = (await response.json()).sort((left, right) =>
            left.district.localeCompare(right.district) ||
            left.title.localeCompare(right.title) ||
            left.id - right.id
        );

        if (records.length === 0) {
            select.innerHTML = "<option>No circulars available</option>";
            select.disabled = true;
            track.innerHTML = emptyOdishaCircularSlide("Odisha State circulars will be added soon.");
            return;
        }

        select.innerHTML = records.map((record, index) => `
            <option value="${index}">${escapeOdishaCircularHtml(record.title)}</option>
        `).join("");

        track.innerHTML = records.map((record) => {
            const district = escapeOdishaCircularHtml(record.district);
            const title = escapeOdishaCircularHtml(record.title);
            const description = escapeOdishaCircularHtml(record.description);
            const pdfPath = escapeOdishaCircularHtml(encodeURI(record.pdfPath));
            const previewPath = escapeOdishaCircularHtml(encodeURI(record.previewPath));

            return `
                <article class="district-pdf-slide">
                    <div class="district-pdf-meta">
                        <span class="district-pdf-label">${district}</span>
                        <h4>${title}</h4>
                        <p>${description}</p>
                        <div class="district-pdf-actions">
                            <a class="view-btn training-report-btn" href="${pdfPath}" target="_blank" rel="noopener noreferrer">View PDF</a>
                            <a class="download-btn training-report-btn" href="${pdfPath}" download>Download PDF</a>
                        </div>
                    </div>
                    <div class="district-pdf-frame-shell district-pdf-preview-shell">
                        <img
                            class="district-pdf-preview-image"
                            src="${previewPath}"
                            alt="${district} Odisha State circular PDF preview"
                            loading="lazy"
                            decoding="async"
                        >
                    </div>
                </article>
            `;
        }).join("");

        const slides = Array.from(track.querySelectorAll(".district-pdf-slide"));
        const controls = Array.from(carousel.querySelectorAll(".gallery-nav"));
        let currentIndex = 0;
        let autoSlideTimer = null;

        function updateCarousel() {
            track.style.transform = `translateX(-${currentIndex * 100}%)`;
            select.value = String(currentIndex);
            slides.forEach((slide, index) =>
                slide.setAttribute("aria-hidden", String(index !== currentIndex))
            );
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
        console.error("Odisha State circular records could not be loaded.", error);
        select.innerHTML = "<option>Unavailable</option>";
        select.disabled = true;
        track.innerHTML = emptyOdishaCircularSlide("Odisha State circular data could not be loaded.");
    }
}

function emptyOdishaCircularSlide(message) {
    return `
        <article class="district-pdf-slide">
            <div class="district-pdf-meta">
                <h4>${escapeOdishaCircularHtml(message)}</h4>
            </div>
        </article>
    `;
}

function escapeOdishaCircularHtml(value) {
    const element = document.createElement("div");
    element.textContent = String(value || "");
    return element.innerHTML;
}
