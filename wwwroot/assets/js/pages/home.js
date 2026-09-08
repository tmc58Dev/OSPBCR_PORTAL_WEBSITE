console.log("OS-PBCR Home Page Loaded");

document.addEventListener("DOMContentLoaded", () => {

    const footerContainer = document.getElementById("footer-container");

    if (!footerContainer) {
        return;
    }

    let observer = null;

    const initializeVisitCount = () => {
        const footerContent = footerContainer.querySelector(".footer-content");

        if (!footerContent || footerContent.querySelector("[data-website-visit-count]")) {
            return;
        }

        observer?.disconnect();

        const counter = document.createElement("div");
        counter.className = "footer-visit-count";
        counter.setAttribute("role", "status");
        counter.setAttribute("aria-label", "Website visit count");
        counter.innerHTML = `
            <span class="footer-visit-count-label">Website Visits</span>
            <strong class="footer-visit-count-value" data-website-visit-count aria-live="polite">&mdash;</strong>
            <span class="footer-visit-count-note">Counted once per browser</span>
        `;

        const footerBottom = footerContent.querySelector(".footer-bottom");
        footerContent.insertBefore(counter, footerBottom);

        const visitCount = counter.querySelector("[data-website-visit-count]");
        let totalVisits = null;

        const displayVisitCount = () => {
            if (!Number.isSafeInteger(totalVisits) || totalVisits < 0) {
                return;
            }

            const language = window.i18n?.getLanguage() || document.documentElement.lang || "en";
            visitCount.textContent = totalVisits.toLocaleString(language);
        };

        const loadVisitCount = async () => {
            try {
                const response = await fetch("api/content/website-visits", {
                    method: "POST",
                    cache: "no-store",
                    credentials: "same-origin",
                    headers: { "Accept": "application/json" }
                });

                if (!response.ok) {
                    throw new Error(`Website visit request failed with status ${response.status}.`);
                }

                const payload = await response.json();
                const count = Number(payload.count);

                if (!Number.isSafeInteger(count) || count < 0) {
                    throw new Error("Website visit response contained an invalid count.");
                }

                totalVisits = count;
                displayVisitCount();
            } catch (error) {
                console.error("Website visit count could not be loaded.", error);
                visitCount.textContent = "Unavailable";
            }
        };

        document.addEventListener("languagechange", displayVisitCount);
        loadVisitCount();
    };

    initializeVisitCount();

    if (!footerContainer.querySelector(".footer-content")) {
        observer = new MutationObserver(initializeVisitCount);
        observer.observe(footerContainer, { childList: true });
    }

});

document.addEventListener("DOMContentLoaded", () => {

    const hero = document.querySelector(".hero-section");

    if (!hero) {
        return;
    }

    const background = hero.querySelector(".hero-background");
    const slides = background ? Array.from(background.querySelectorAll(".hero-background-slide")) : [];
    const prevButton = hero.querySelector(".hero-prev");
    const nextButton = hero.querySelector(".hero-next");
    const autoplayDelay = 3000;

    if (!background || slides.length < 2 || !prevButton || !nextButton) {
        return;
    }

    const shuffledSlides = shuffleArray(slides.slice());
    shuffledSlides.forEach((slide) => background.appendChild(slide));

    let activeIndex = 0;
    let autoplayId = 0;

    preloadHeroImages(shuffledSlides);

    function showSlide(index) {

        activeIndex = (index + shuffledSlides.length) % shuffledSlides.length;

        shuffledSlides.forEach((slide, slideIndex) => {

            const isActive = slideIndex === activeIndex;

            slide.classList.toggle("is-active", isActive);
            slide.setAttribute("aria-hidden", String(!isActive));

        });

    }

    function stopAutoplay() {

        if (autoplayId) {
            window.clearTimeout(autoplayId);
            autoplayId = 0;
        }

    }

    function startAutoplay() {

        stopAutoplay();
        autoplayId = window.setTimeout(() => {
            window.requestAnimationFrame(() => {
                showSlide(activeIndex + 1);
                startAutoplay();
            });
        }, autoplayDelay);

    }

    function restartAutoplay() {

        startAutoplay();

    }

    prevButton.addEventListener("click", () => {
        showSlide(activeIndex - 1);
        restartAutoplay();
    });

    nextButton.addEventListener("click", () => {
        showSlide(activeIndex + 1);
        restartAutoplay();
    });

    document.addEventListener("visibilitychange", () => {

        if (document.hidden) {
            stopAutoplay();
            return;
        }

        startAutoplay();

    });

    showSlide(0);
    startAutoplay();

});

document.addEventListener("DOMContentLoaded", () => {

    const section = document.querySelector("[data-news-section]");
    const carousel = document.querySelector("[data-news-carousel]");
    const track = document.querySelector("[data-news-track]");
    const previous = document.querySelector("[data-news-previous]");
    const next = document.querySelector("[data-news-next]");
    const position = document.querySelector("[data-news-position]");
    const languageButtons = Array.from(document.querySelectorAll("[data-news-language]"));
    const dateOrderButtons = Array.from(document.querySelectorAll("[data-news-date-order]"));

    if (!section || !carousel || !track || !previous || !next || !position ||
        !languageButtons.length || !dateOrderButtons.length) {
        return;
    }

    const cardsPerPage = 6;
    let cards = [];
    let pages = [];
    let activeIndex = 0;
    let requestVersion = 0;
    let newsLanguage = currentLanguage();
    let newsDateOrder = "desc";
    let touchStartX = 0;
    const languageNames = {
        en: "English",
        hi: "हिन्दी",
        or: "ଓଡ଼ିଆ"
    };
    const imageControlLabels = {
        en: { previous: "Previous photo", next: "Next photo" },
        hi: { previous: "पिछला चित्र", next: "अगला चित्र" },
        or: { previous: "ପୂର୍ବ ଫଟୋ", next: "ପରବର୍ତ୍ତୀ ଫଟୋ" }
    };
    const viewMoreLabels = {
        en: "View More",
        hi: "और देखें",
        or: "ଅଧିକ ଦେଖନ୍ତୁ"
    };

    function currentLanguage() {
        return window.i18n?.getLanguage?.() || localStorage.getItem("ospbcr-language") || "en";
    }

    function syncLanguageFilter() {
        languageButtons.forEach((button) => {
            const isActive = button.dataset.newsLanguage === newsLanguage;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        });
    }

    function syncDateOrderFilter() {
        dateOrderButtons.forEach((button) => {
            const isActive = button.dataset.newsDateOrder === newsDateOrder;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        });
    }

    function showCardImage(card, index) {
        const imageTrack = card?.querySelector("[data-news-image-track]");
        const images = Array.from(card?.querySelectorAll("[data-news-card-image]") || []);
        if (!imageTrack || !images.length) return;

        const activeImageIndex = (index + images.length) % images.length;
        card.dataset.activeImage = String(activeImageIndex);
        imageTrack.style.transform = `translateX(-${activeImageIndex * 100}%)`;
        images.forEach((image, imageIndex) => {
            image.setAttribute("aria-hidden", String(imageIndex !== activeImageIndex));
        });
        card.querySelectorAll("[data-news-image-dot]").forEach((dot, dotIndex) => {
            dot.classList.toggle("is-active", dotIndex === activeImageIndex);
        });
        const imagePosition = card.querySelector("[data-news-image-position]");
        if (imagePosition) {
            imagePosition.textContent = `${activeImageIndex + 1} / ${images.length}`;
        }
    }

    function moveCardImage(card, direction) {
        if (!card) return;
        const currentImage = Number.parseInt(card.dataset.activeImage || "0", 10);
        showCardImage(card, currentImage + direction);
    }

    function show(index) {
        if (!pages.length) return;
        activeIndex = (index + pages.length) % pages.length;
        track.style.transform = `translateX(-${activeIndex * 100}%)`;
        pages.forEach((page, pageIndex) => {
            const isActivePage = pageIndex === activeIndex;
            page.setAttribute("aria-hidden", String(!isActivePage));
            page.querySelectorAll(".news-card").forEach((card) => {
                card.querySelectorAll("a, button").forEach((control) => {
                    control.tabIndex = isActivePage ? 0 : -1;
                });
            });
        });
        const firstCard = (activeIndex * cardsPerPage) + 1;
        const lastCard = Math.min(firstCard + cardsPerPage - 1, cards.length);
        position.textContent = `${firstCard}–${lastCard} / ${cards.length}`;
    }

    function createMedia(item) {
        const media = document.createElement("div");
        media.className = "trending-card-media";
        const imagePaths = Array.isArray(item.imagePaths) && item.imagePaths.length
            ? item.imagePaths
            : [item.imagePath].filter(Boolean);
        const imageTrack = document.createElement("div");
        imageTrack.className = "trending-card-gallery";
        imageTrack.dataset.newsImageTrack = "";
        imageTrack.setAttribute(
            "aria-label",
            `${item.title}: ${imagePaths.length} photo${imagePaths.length === 1 ? "" : "s"}`
        );
        imagePaths.forEach((path, imageIndex) => {
            const image = document.createElement("img");
            image.src = path;
            image.alt = imageIndex === 0 ? item.title : `${item.title} — photo ${imageIndex + 1}`;
            image.loading = "lazy";
            image.decoding = "async";
            image.dataset.newsCardImage = "";
            image.setAttribute("aria-hidden", String(imageIndex !== 0));
            imageTrack.appendChild(image);
        });
        media.appendChild(imageTrack);
        const language = document.createElement("span");
        language.className = "trending-card-language";
        language.textContent = languageNames[item.language] || item.language.toUpperCase();
        media.appendChild(language);
        if (imagePaths.length > 1) {
            const labels = imageControlLabels[item.language] || imageControlLabels.en;
            const previousImage = document.createElement("button");
            previousImage.type = "button";
            previousImage.className = "trending-image-control trending-image-previous";
            previousImage.dataset.newsImagePrevious = "";
            previousImage.setAttribute("aria-label", labels.previous);
            previousImage.title = labels.previous;
            previousImage.innerHTML = '<span aria-hidden="true">‹</span>';

            const nextImage = document.createElement("button");
            nextImage.type = "button";
            nextImage.className = "trending-image-control trending-image-next";
            nextImage.dataset.newsImageNext = "";
            nextImage.setAttribute("aria-label", labels.next);
            nextImage.title = labels.next;
            nextImage.innerHTML = '<span aria-hidden="true">›</span>';

            media.append(previousImage, nextImage);

            const photoCount = document.createElement("span");
            photoCount.className = "trending-card-photo-count";
            photoCount.dataset.newsImagePosition = "";
            photoCount.textContent = `1 / ${imagePaths.length}`;
            media.appendChild(photoCount);

            if (imagePaths.length <= 10) {
                const dots = document.createElement("div");
                dots.className = "trending-card-image-dots";
                dots.setAttribute("aria-hidden", "true");
                imagePaths.forEach((_, imageIndex) => {
                    const dot = document.createElement("span");
                    dot.dataset.newsImageDot = "";
                    dot.classList.toggle("is-active", imageIndex === 0);
                    dots.appendChild(dot);
                });
                media.appendChild(dots);
            }
        }

        return media;
    }

    function createCard(item) {
        const article = document.createElement("article");
        article.className = "news-card trending-card";
        article.id = `home-news-${item.id}-${item.language}`;
        article.dataset.i18nSkip = "";
        article.lang = item.language;
        article.dataset.activeImage = "0";

        const copy = document.createElement("div");
        copy.className = "trending-card-content";
        const title = document.createElement("h2");
        title.textContent = item.title;
        const date = document.createElement("time");
        date.className = "trending-card-date";
        date.textContent = item.publishDate;
        date.dateTime = toIsoDate(item.publishDate);
        const link = document.createElement("a");
        link.className = "trending-learn-more";
        const trendingQuery = new URLSearchParams({
            language: item.language,
            dateOrder: newsDateOrder
        });
        link.href = `trending.html?${trendingQuery.toString()}`;
        link.textContent = viewMoreLabels[item.language] || viewMoreLabels.en;
        link.setAttribute("aria-label", `${link.textContent}: ${item.title}`);
        copy.append(title, date, link);
        article.append(createMedia(item), copy);
        return article;
    }

    async function loadNews() {
        const version = ++requestVersion;
        const language = newsLanguage;
        syncLanguageFilter();
        syncDateOrderFilter();
        carousel.setAttribute("aria-busy", "true");
        try {
            const response = await fetch(`api/content/news?language=${encodeURIComponent(language)}`, {
                cache: "no-store",
                headers: { "Accept": "application/json" }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const items = await response.json();
            if (version !== requestVersion) return;

            const direction = newsDateOrder === "asc" ? 1 : -1;
            const sortedItems = [...items].sort((left, right) => {
                const dateDifference = newsDateValue(left.publishDate) - newsDateValue(right.publishDate);
                if (dateDifference !== 0) return dateDifference * direction;
                return (Number(left.id) - Number(right.id)) * direction;
            });
            const pageElements = [];
            for (let index = 0; index < sortedItems.length; index += cardsPerPage) {
                const page = document.createElement("div");
                page.className = "news-card-page";
                page.dataset.newsPage = "";
                page.setAttribute("role", "group");
                page.setAttribute("aria-roledescription", "slide");
                sortedItems
                    .slice(index, index + cardsPerPage)
                    .forEach((item) => page.appendChild(createCard(item)));
                pageElements.push(page);
            }

            track.replaceChildren(...pageElements);
            pages = Array.from(track.querySelectorAll("[data-news-page]"));
            cards = Array.from(track.querySelectorAll(".news-card"));
            activeIndex = 0;
            section.hidden = cards.length === 0;
            const hasMultiplePages = pages.length > 1;
            previous.disabled = !hasMultiplePages;
            next.disabled = !hasMultiplePages;
            previous.setAttribute("aria-disabled", String(!hasMultiplePages));
            next.setAttribute("aria-disabled", String(!hasMultiplePages));
            position.hidden = cards.length === 0;
            cards.forEach((card, cardIndex) => {
                card.setAttribute("aria-label", `${cardIndex + 1} of ${cards.length}`);
            });
            pages.forEach((page, pageIndex) => {
                page.setAttribute("aria-label", `${pageIndex + 1} of ${pages.length}`);
            });
            show(0);
        } catch (error) {
            console.error("News Cards could not be loaded.", error);
            if (version === requestVersion) {
                section.hidden = true;
            }
        } finally {
            if (version === requestVersion) {
                carousel.removeAttribute("aria-busy");
            }
        }
    }

    previous.addEventListener("click", () => {
        show(activeIndex - 1);
    });
    next.addEventListener("click", () => {
        show(activeIndex + 1);
    });
    carousel.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            show(activeIndex - 1);
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            show(activeIndex + 1);
        }
    });
    carousel.addEventListener("click", (event) => {
        const previousImage = event.target.closest("[data-news-image-previous]");
        const nextImage = event.target.closest("[data-news-image-next]");
        if (!previousImage && !nextImage) return;

        const card = (previousImage || nextImage).closest(".news-card");
        moveCardImage(card, previousImage ? -1 : 1);
    });
    carousel.addEventListener("touchstart", (event) => {
        touchStartX = event.changedTouches[0]?.clientX || 0;
    }, { passive: true });
    carousel.addEventListener("touchend", (event) => {
        const touchEndX = event.changedTouches[0]?.clientX || 0;
        const distance = touchEndX - touchStartX;
        if (Math.abs(distance) > 45) {
            show(activeIndex + (distance < 0 ? 1 : -1));
        }
    }, { passive: true });
    languageButtons.forEach((button) => {
        button.addEventListener("click", () => {
            newsLanguage = button.dataset.newsLanguage || "en";
            loadNews();
        });
    });
    dateOrderButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const requestedOrder = button.dataset.newsDateOrder;
            if (requestedOrder !== "asc" && requestedOrder !== "desc") return;
            if (requestedOrder === newsDateOrder) return;
            newsDateOrder = requestedOrder;
            loadNews();
        });
    });
    document.addEventListener("languagechange", (event) => {
        newsLanguage = event.detail?.language || currentLanguage();
        loadNews();
    });
    syncLanguageFilter();
    syncDateOrderFilter();
    loadNews();

});

function toIsoDate(value) {

    const [day, month, year] = String(value || "").split("/");
    return day && month && year ? `${year}-${month}-${day}` : "";

}

function newsDateValue(value) {

    const [day, month, year] = String(value || "").split("/").map(Number);
    return day && month && year ? Date.UTC(year, month - 1, day) : 0;

}

function shuffleArray(items) {

    for (let index = items.length - 1; index > 0; index -= 1) {

        const swapIndex = Math.floor(Math.random() * (index + 1));
        [items[index], items[swapIndex]] = [items[swapIndex], items[index]];

    }

    return items;

}

function preloadHeroImages(slides) {

    slides.forEach((slide) => {

        const image = slide.querySelector("img");

        if (!image) {
            return;
        }

        image.loading = "eager";
        image.decoding = "async";

        if (image.decode) {
            image.decode().catch(() => {});
        }

    });

}
