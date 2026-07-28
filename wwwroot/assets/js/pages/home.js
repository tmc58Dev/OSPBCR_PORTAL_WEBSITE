console.log("OS-PBCR Home Page Loaded");

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

    if (!section || !carousel || !track || !previous || !next || !position || !languageButtons.length) {
        return;
    }

    const cardsPerPage = 6;
    let cards = [];
    let pages = [];
    let activeIndex = 0;
    let timer = 0;
    let imageTimer = 0;
    let requestVersion = 0;
    let newsLanguage = currentLanguage();
    let touchStartX = 0;
    let interactionPaused = false;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const languageNames = {
        en: "English",
        hi: "हिन्दी",
        or: "ଓଡ଼ିଆ"
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

    function stopRotation() {
        if (timer) {
            window.clearInterval(timer);
            timer = 0;
        }
    }

    function stopImageRotation() {
        if (imageTimer) {
            window.clearInterval(imageTimer);
            imageTimer = 0;
        }
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

    function startImageRotation() {
        stopImageRotation();
        const activeCards = Array.from(
            pages[activeIndex]?.querySelectorAll(".news-card") || []
        ).filter((card) => card.querySelectorAll("[data-news-card-image]").length > 1);
        if (activeCards.length && !interactionPaused && !reduceMotion.matches && !document.hidden) {
            imageTimer = window.setInterval(() => {
                activeCards.forEach((card) => {
                    const currentImage = Number.parseInt(card.dataset.activeImage || "0", 10);
                    showCardImage(card, currentImage + 1);
                });
            }, 1500);
        }
    }

    function startRotation() {
        stopRotation();
        if (pages.length > 1 && !interactionPaused && !reduceMotion.matches && !document.hidden) {
            timer = window.setInterval(() => show(activeIndex + 1), 5500);
        }
    }

    function pauseCarousels() {
        interactionPaused = true;
        stopRotation();
        stopImageRotation();
    }

    function resumeCarousels() {
        interactionPaused = false;
        startRotation();
        startImageRotation();
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
        startImageRotation();
    }

    function createCard(item) {
        const article = document.createElement("article");
        article.className = "news-card";
        article.dataset.i18nSkip = "";
        article.lang = item.language;

        const frame = document.createElement("div");
        frame.className = "news-card-frame";

        const media = document.createElement("div");
        media.className = "news-card-media";
        const imagePaths = Array.isArray(item.imagePaths) && item.imagePaths.length
            ? item.imagePaths
            : [item.imagePath].filter(Boolean);
        const imageTrack = document.createElement("div");
        imageTrack.className = "news-card-image-track";
        imageTrack.dataset.newsImageTrack = "";
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
        language.className = "news-card-language";
        language.textContent = languageNames[item.language] || item.language.toUpperCase();
        media.appendChild(language);
        if (imagePaths.length > 1) {
            const photoCount = document.createElement("span");
            photoCount.className = "news-card-photo-count";
            photoCount.dataset.newsImagePosition = "";
            photoCount.textContent = `1 / ${imagePaths.length}`;
            media.appendChild(photoCount);

            if (imagePaths.length <= 10) {
                const dots = document.createElement("div");
                dots.className = "news-card-image-dots";
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

        const copy = document.createElement("div");
        copy.className = "news-card-copy";
        const title = document.createElement("h3");
        title.textContent = item.title;
        const date = document.createElement("time");
        date.className = "news-card-date";
        date.textContent = item.publishDate;
        date.dateTime = toIsoDate(item.publishDate);
        const link = document.createElement("a");
        link.className = "news-card-more";
        link.href = `trending.html?news=${encodeURIComponent(item.id)}&language=${encodeURIComponent(item.language)}&dateOrder=desc&view=20260726-auto-image-slider`;
        link.textContent = viewMoreLabels[item.language] || viewMoreLabels.en;
        link.setAttribute("aria-label", `${link.textContent}: ${item.title}`);
        copy.append(title, date, link);
        frame.append(media, copy);
        article.appendChild(frame);
        article.dataset.activeImage = "0";
        return article;
    }

    async function loadNews() {
        const version = ++requestVersion;
        const language = newsLanguage;
        syncLanguageFilter();
        carousel.setAttribute("aria-busy", "true");
        stopRotation();
        stopImageRotation();
        try {
            const response = await fetch(`/api/content/news?language=${encodeURIComponent(language)}`, {
                cache: "no-store",
                headers: { "Accept": "application/json" }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const items = await response.json();
            if (version !== requestVersion) return;

            const sortedItems = [...items].sort(
                (left, right) => newsDateValue(right.publishDate) - newsDateValue(left.publishDate)
            );
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
            startRotation();
        } catch (error) {
            console.error("News Cards could not be loaded.", error);
            if (version === requestVersion) {
                section.hidden = true;
                stopRotation();
                stopImageRotation();
            }
        } finally {
            if (version === requestVersion) {
                carousel.removeAttribute("aria-busy");
            }
        }
    }

    previous.addEventListener("click", () => {
        show(activeIndex - 1);
        startRotation();
    });
    next.addEventListener("click", () => {
        show(activeIndex + 1);
        startRotation();
    });
    carousel.addEventListener("mouseenter", pauseCarousels);
    carousel.addEventListener("mouseleave", resumeCarousels);
    carousel.addEventListener("focusin", pauseCarousels);
    carousel.addEventListener("focusout", (event) => {
        if (!carousel.contains(event.relatedTarget)) {
            resumeCarousels();
        }
    });
    carousel.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            show(activeIndex - 1);
            startRotation();
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            show(activeIndex + 1);
            startRotation();
        }
    });
    carousel.addEventListener("touchstart", (event) => {
        touchStartX = event.changedTouches[0]?.clientX || 0;
        pauseCarousels();
    }, { passive: true });
    carousel.addEventListener("touchend", (event) => {
        const touchEndX = event.changedTouches[0]?.clientX || 0;
        const distance = touchEndX - touchStartX;
        if (Math.abs(distance) > 45) {
            show(activeIndex + (distance < 0 ? 1 : -1));
        }
        resumeCarousels();
    }, { passive: true });
    languageButtons.forEach((button) => {
        button.addEventListener("click", () => {
            newsLanguage = button.dataset.newsLanguage || "en";
            loadNews();
        });
    });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopRotation();
            stopImageRotation();
        } else {
            startRotation();
            startImageRotation();
        }
    });
    document.addEventListener("languagechange", (event) => {
        newsLanguage = event.detail?.language || currentLanguage();
        loadNews();
    });
    reduceMotion.addEventListener?.("change", () => {
        startRotation();
        startImageRotation();
    });

    syncLanguageFilter();
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
