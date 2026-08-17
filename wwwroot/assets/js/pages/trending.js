(function () {
    "use strict";

    const supportedLanguages = ["en", "hi", "or"];
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
    const messages = {
        en: {
            loading: "Loading published News Cards…",
            empty: "No published News Cards are available in this language yet.",
            error: "News Cards are temporarily unavailable. Please try again shortly.",
            published: "Published On :",
            previousPhoto: "Previous photo",
            nextPhoto: "Next photo",
            pauseSlideshow: "Pause",
            playSlideshow: "Play"
        },
        hi: {
            loading: "प्रकाशित समाचार कार्ड लोड हो रहे हैं…",
            empty: "इस भाषा में अभी कोई प्रकाशित समाचार कार्ड उपलब्ध नहीं है।",
            error: "समाचार कार्ड अस्थायी रूप से उपलब्ध नहीं हैं। कृपया थोड़ी देर बाद पुनः प्रयास करें।",
            published: "प्रकाशित दिनांक :",
            previousPhoto: "पिछला चित्र",
            nextPhoto: "अगला चित्र",
            pauseSlideshow: "रोकें",
            playSlideshow: "चलाएँ"
        },
        or: {
            loading: "ପ୍ରକାଶିତ ସମ୍ବାଦ କାର୍ଡଗୁଡ଼ିକ ଲୋଡ୍ ହେଉଛି…",
            empty: "ଏହି ଭାଷାରେ ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ପ୍ରକାଶିତ ସମ୍ବାଦ କାର୍ଡ ଉପଲବ୍ଧ ନାହିଁ।",
            error: "ସମ୍ବାଦ କାର୍ଡଗୁଡ଼ିକ ସାମୟିକ ଭାବେ ଉପଲବ୍ଧ ନାହିଁ। ଦୟାକରି କିଛି ସମୟ ପରେ ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
            published: "ପ୍ରକାଶିତ ତାରିଖ :",
            previousPhoto: "ପୂର୍ବ ଫଟୋ",
            nextPhoto: "ପରବର୍ତ୍ତୀ ଫଟୋ",
            pauseSlideshow: "ବିରତ କରନ୍ତୁ",
            playSlideshow: "ଚଲାନ୍ତୁ"
        }
    };

    document.addEventListener("DOMContentLoaded", () => {
        const list = document.querySelector("[data-trending-list]");
        const status = document.querySelector("[data-trending-status]");
        const filters = Array.from(document.querySelectorAll("[data-trending-language]"));
        const dateOrderFilters = Array.from(document.querySelectorAll("[data-trending-date-order]"));

        if (!list || !status || !filters.length || !dateOrderFilters.length) {
            return;
        }

        const query = new URLSearchParams(window.location.search);
        const requestedLanguage = normalizeLanguage(query.get("language"));
        const requestedDateOrder = normalizeDateOrder(query.get("dateOrder"));
        let activeLanguage = requestedLanguage || currentWebsiteLanguage();
        let activeDateOrder = requestedDateOrder || "desc";
        let loadedItems = [];
        let requestVersion = 0;
        let imageTimer = 0;
        let interactionPaused = false;
        let ignoreInitialWebsiteLanguage = Boolean(requestedLanguage);
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const imageRotationDelay = 2000;

        function currentWebsiteLanguage() {
            const language = window.i18n?.getLanguage?.() || localStorage.getItem("ospbcr-language") || "en";
            return language === "hi" || language === "or" ? language : "en";
        }

        function normalizeLanguage(language) {
            return supportedLanguages.includes(language || "") ? language : "";
        }

        function normalizeDateOrder(order) {
            return order === "asc" || order === "desc" ? order : "";
        }

        function currentMessages() {
            return messages[currentWebsiteLanguage()] || messages.en;
        }

        function imagePathsFor(item) {
            return Array.isArray(item.imagePaths) && item.imagePaths.length
                ? item.imagePaths
                : [item.imagePath].filter(Boolean);
        }

        function syncFilters() {
            filters.forEach((button) => {
                const selected = button.dataset.trendingLanguage === activeLanguage;
                button.classList.toggle("is-active", selected);
                button.setAttribute("aria-pressed", String(selected));
            });
            dateOrderFilters.forEach((button) => {
                const selected = button.dataset.trendingDateOrder === activeDateOrder;
                button.classList.toggle("is-active", selected);
                button.setAttribute("aria-pressed", String(selected));
            });
        }

        function updateUrl() {
            const nextQuery = new URLSearchParams(window.location.search);
            nextQuery.set("language", activeLanguage);
            nextQuery.set("dateOrder", activeDateOrder);
            const nextUrl = `${window.location.pathname}?${nextQuery.toString()}`;
            window.history.replaceState(null, "", nextUrl);
        }

        function setStatus(message, error = false) {
            status.textContent = message;
            status.classList.toggle("is-error", error);
            status.hidden = false;
        }

        function stopImageRotation() {
            if (imageTimer) {
                window.clearInterval(imageTimer);
                imageTimer = 0;
            }
        }

        function showCardImage(card, index) {
            const imageTrack = card?.querySelector("[data-trending-image-track]");
            const images = Array.from(card?.querySelectorAll("[data-trending-card-image]") || []);
            if (!imageTrack || !images.length) return;

            const activeImageIndex = (index + images.length) % images.length;
            card.dataset.activeImage = String(activeImageIndex);
            imageTrack.style.transform = `translateX(-${activeImageIndex * 100}%)`;
            images.forEach((image, imageIndex) => {
                image.setAttribute("aria-hidden", String(imageIndex !== activeImageIndex));
            });
            card.querySelectorAll("[data-trending-image-dot]").forEach((dot, dotIndex) => {
                dot.classList.toggle("is-active", dotIndex === activeImageIndex);
            });
            const imagePosition = card.querySelector("[data-trending-image-position]");
            if (imagePosition) {
                imagePosition.textContent = `${activeImageIndex + 1} / ${images.length}`;
            }
        }

        function moveCardImage(card, direction) {
            if (!card) return;
            const currentImage = Number.parseInt(card.dataset.activeImage || "0", 10);
            showCardImage(card, currentImage + direction);
        }

        function startImageRotation() {
            stopImageRotation();
            const rotatingCards = Array.from(list.querySelectorAll(".trending-card"))
                .filter((card) => card.querySelectorAll("[data-trending-card-image]").length > 1);

            if (rotatingCards.length && !interactionPaused && !reduceMotion.matches && !document.hidden) {
                imageTimer = window.setInterval(() => {
                    rotatingCards.forEach((card) => {
                        const currentImage = Number.parseInt(card.dataset.activeImage || "0", 10);
                        showCardImage(card, currentImage + 1);
                    });
                }, imageRotationDelay);
            }
        }

        function pauseImageRotation() {
            interactionPaused = true;
            stopImageRotation();
        }

        function resumeImageRotation() {
            interactionPaused = false;
            startImageRotation();
        }

        function createMedia(item) {
            const media = document.createElement("div");
            media.className = "trending-card-media";

            const imagePaths = imagePathsFor(item);
            const gallery = document.createElement("div");
            gallery.className = "trending-card-gallery";
            gallery.dataset.trendingImageTrack = "";
            gallery.setAttribute(
                "aria-label",
                `${item.title}: ${imagePaths.length} photo${imagePaths.length === 1 ? "" : "s"}`
            );

            imagePaths.forEach((path, index) => {
                const image = document.createElement("img");
                image.src = path;
                image.alt = index === 0 ? item.title : `${item.title} — photo ${index + 1}`;
                image.loading = "lazy";
                image.decoding = "async";
                image.dataset.trendingCardImage = "";
                image.setAttribute("aria-hidden", String(index !== 0));
                gallery.appendChild(image);
            });

            const language = document.createElement("span");
            language.className = "trending-card-language";
            language.textContent = languageNames[item.language] || item.language.toUpperCase();
            media.append(gallery, language);

            if (imagePaths.length > 1) {
                const copy = messages[item.language] || messages.en;
                const previous = document.createElement("button");
                previous.type = "button";
                previous.className = "trending-image-control trending-image-previous";
                previous.dataset.trendingImagePrevious = "";
                previous.setAttribute("aria-label", copy.previousPhoto);
                previous.title = copy.previousPhoto;
                previous.innerHTML = '<span aria-hidden="true">‹</span>';

                const next = document.createElement("button");
                next.type = "button";
                next.className = "trending-image-control trending-image-next";
                next.dataset.trendingImageNext = "";
                next.setAttribute("aria-label", copy.nextPhoto);
                next.title = copy.nextPhoto;
                next.innerHTML = '<span aria-hidden="true">›</span>';

                media.append(previous, next);

                const photoCount = document.createElement("span");
                photoCount.className = "trending-card-photo-count";
                photoCount.dataset.trendingImagePosition = "";
                photoCount.textContent = `1 / ${imagePaths.length}`;
                media.appendChild(photoCount);

                if (imagePaths.length <= 10) {
                    const dots = document.createElement("div");
                    dots.className = "trending-card-image-dots";
                    dots.setAttribute("aria-hidden", "true");
                    imagePaths.forEach((_, imageIndex) => {
                        const dot = document.createElement("span");
                        dot.dataset.trendingImageDot = "";
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
            article.className = "trending-card";
            article.id = `news-${item.id}-${item.language}`;
            article.lang = item.language;
            article.dataset.activeImage = "0";

            const content = document.createElement("div");
            content.className = "trending-card-content";

            const title = document.createElement("h2");
            title.textContent = item.title;

            const date = document.createElement("time");
            date.className = "trending-card-date";
            date.textContent = item.publishDate;
            date.dateTime = toIsoDate(item.publishDate);

            const viewMore = document.createElement("a");
            viewMore.className = "trending-learn-more";
            const detailQuery = new URLSearchParams({
                news: String(item.id),
                language: item.language,
                dateOrder: activeDateOrder
            });
            viewMore.href = `news-detail.html?${detailQuery.toString()}`;
            viewMore.textContent = viewMoreLabels[item.language] || viewMoreLabels.en;
            viewMore.setAttribute("aria-label", `${viewMore.textContent}: ${item.title}`);

            content.append(title, date, viewMore);
            article.append(createMedia(item), content);
            return article;
        }

        function newsDateValue(value) {
            const [day, month, year] = String(value || "").split("/").map(Number);
            return day && month && year ? Date.UTC(year, month - 1, day) : 0;
        }

        function sortedItems(items) {
            const direction = activeDateOrder === "asc" ? 1 : -1;
            return [...items].sort((left, right) => {
                const dateDifference = newsDateValue(left.publishDate) - newsDateValue(right.publishDate);
                if (dateDifference !== 0) return dateDifference * direction;
                return (Number(left.id) - Number(right.id)) * direction;
            });
        }

        function renderNews() {
            list.replaceChildren(...sortedItems(loadedItems).map(createCard));
            status.hidden = loadedItems.length > 0;
            status.classList.remove("is-error");
            if (!loadedItems.length) setStatus(currentMessages().empty);
            startImageRotation();
        }

        async function loadNews() {
            const version = ++requestVersion;
            syncFilters();
            updateUrl();
            list.setAttribute("aria-busy", "true");
            setStatus(currentMessages().loading);
            stopImageRotation();

            try {
                const response = await fetch(`/api/content/news?language=${encodeURIComponent(activeLanguage)}`, {
                    cache: "no-store",
                    headers: { "Accept": "application/json" }
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const items = await response.json();
                if (version !== requestVersion) return;

                loadedItems = items;
                renderNews();
            } catch (error) {
                console.error("Trending News Cards could not be loaded.", error);
                if (version !== requestVersion) return;
                loadedItems = [];
                list.replaceChildren();
                stopImageRotation();
                setStatus(currentMessages().error, true);
            } finally {
                if (version === requestVersion) {
                    list.removeAttribute("aria-busy");
                }
            }
        }

        filters.forEach((button) => {
            button.addEventListener("click", () => {
                const language = normalizeLanguage(button.dataset.trendingLanguage);
                if (!language || language === activeLanguage) return;
                activeLanguage = language;
                loadNews();
            });
        });

        dateOrderFilters.forEach((button) => {
            button.addEventListener("click", () => {
                const dateOrder = normalizeDateOrder(button.dataset.trendingDateOrder);
                if (!dateOrder || dateOrder === activeDateOrder) return;
                activeDateOrder = dateOrder;
                syncFilters();
                updateUrl();
                renderNews();
            });
        });

        list.addEventListener("click", (event) => {
            const previousImage = event.target.closest?.("[data-trending-image-previous]");
            const nextImage = event.target.closest?.("[data-trending-image-next]");
            if (previousImage || nextImage) {
                const card = (previousImage || nextImage).closest(".trending-card");
                moveCardImage(card, previousImage ? -1 : 1);
            }
        });
        list.addEventListener("mouseenter", pauseImageRotation);
        list.addEventListener("mouseleave", resumeImageRotation);
        list.addEventListener("focusin", pauseImageRotation);
        list.addEventListener("focusout", (event) => {
            if (!list.contains(event.relatedTarget)) {
                resumeImageRotation();
            }
        });
        list.addEventListener("touchstart", pauseImageRotation, { passive: true });
        list.addEventListener("touchend", resumeImageRotation, { passive: true });
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                stopImageRotation();
            } else {
                startImageRotation();
            }
        });
        reduceMotion.addEventListener?.("change", () => {
            startImageRotation();
        });

        document.addEventListener("languagechange", (event) => {
            if (ignoreInitialWebsiteLanguage) {
                ignoreInitialWebsiteLanguage = false;
                return;
            }
            const language = normalizeLanguage(event.detail?.language);
            if (!language || language === activeLanguage) return;
            activeLanguage = language;
            loadNews();
        });

        loadNews();
    });

    function toIsoDate(value) {
        const [day, month, year] = String(value || "").split("/");
        return day && month && year ? `${year}-${month}-${day}` : "";
    }
})();
