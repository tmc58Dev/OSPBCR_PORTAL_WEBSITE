(function () {
    "use strict";

    const supportedLanguages = ["en", "hi", "or"];
    const languageNames = {
        en: "English",
        hi: "\u0939\u093f\u0928\u094d\u0926\u0940",
        or: "\u0b13\u0b21\u0b3c\u0b3f\u0b06"
    };
    const copy = {
        en: {
            loading: "Loading news story\u2026",
            notFound: "This published news story could not be found.",
            error: "The news story is temporarily unavailable. Please try again shortly.",
            published: "Published On :",
            previousPhoto: "Previous photo",
            nextPhoto: "Next photo",
            pauseSlideshow: "Pause",
            playSlideshow: "Play",
            back: "Back to Trending News",
            kicker: "Trending News",
            heading: "Full News Story"
        },
        hi: {
            loading: "\u0938\u092e\u093e\u091a\u093e\u0930 \u0932\u094b\u0921 \u0939\u094b \u0930\u0939\u093e \u0939\u0948\u2026",
            notFound: "\u092f\u0939 \u092a\u094d\u0930\u0915\u093e\u0936\u093f\u0924 \u0938\u092e\u093e\u091a\u093e\u0930 \u0928\u0939\u0940\u0902 \u092e\u093f\u0932\u093e\u0964",
            error: "\u0938\u092e\u093e\u091a\u093e\u0930 \u0905\u0938\u094d\u0925\u093e\u092f\u0940 \u0930\u0942\u092a \u0938\u0947 \u0909\u092a\u0932\u092c\u094d\u0927 \u0928\u0939\u0940\u0902 \u0939\u0948\u0964",
            published: "\u092a\u094d\u0930\u0915\u093e\u0936\u093f\u0924 \u0926\u093f\u0928\u093e\u0902\u0915 :",
            previousPhoto: "\u092a\u093f\u091b\u0932\u093e \u091a\u093f\u0924\u094d\u0930",
            nextPhoto: "\u0905\u0917\u0932\u093e \u091a\u093f\u0924\u094d\u0930",
            pauseSlideshow: "\u0930\u094b\u0915\u0947\u0902",
            playSlideshow: "\u091a\u0932\u093e\u090f\u0901",
            back: "\u091f\u094d\u0930\u0947\u0902\u0921\u093f\u0902\u0917 \u0938\u092e\u093e\u091a\u093e\u0930 \u092a\u0930 \u0935\u093e\u092a\u0938 \u091c\u093e\u090f\u0901",
            kicker: "\u091f\u094d\u0930\u0947\u0902\u0921\u093f\u0902\u0917 \u0938\u092e\u093e\u091a\u093e\u0930",
            heading: "\u092a\u0942\u0930\u093e \u0938\u092e\u093e\u091a\u093e\u0930"
        },
        or: {
            loading: "\u0b38\u0b2e\u0b4d\u0b2c\u0b3e\u0b26 \u0b32\u0b4b\u0b21\u0b4d \u0b39\u0b47\u0b09\u0b1b\u0b3f\u2026",
            notFound: "\u0b0f\u0b39\u0b3f \u0b2a\u0b4d\u0b30\u0b15\u0b3e\u0b36\u0b3f\u0b24 \u0b38\u0b2e\u0b4d\u0b2c\u0b3e\u0b26 \u0b2e\u0b3f\u0b33\u0b3f\u0b32\u0b3e \u0b28\u0b3e\u0b39\u0b3f\u0b01\u0964",
            error: "\u0b38\u0b2e\u0b4d\u0b2c\u0b3e\u0b26\u0b1f\u0b3f \u0b38\u0b3e\u0b2e\u0b5f\u0b3f\u0b15 \u0b2d\u0b3e\u0b2c\u0b30\u0b47 \u0b09\u0b2a\u0b32\u0b2c\u0b4d\u0b27 \u0b28\u0b3e\u0b39\u0b3f\u0b01\u0964",
            published: "\u0b2a\u0b4d\u0b30\u0b15\u0b3e\u0b36\u0b3f\u0b24 \u0b24\u0b3e\u0b30\u0b3f\u0b16 :",
            previousPhoto: "\u0b2a\u0b42\u0b30\u0b4d\u0b2c \u0b2b\u0b1f\u0b4b",
            nextPhoto: "\u0b2a\u0b30\u0b2c\u0b30\u0b4d\u0b24\u0b4d\u0b24\u0b40 \u0b2b\u0b1f\u0b4b",
            pauseSlideshow: "\u0b2c\u0b3f\u0b30\u0b24\u0b3f",
            playSlideshow: "\u0b1a\u0b32\u0b3e\u0b28\u0b4d\u0b24\u0b41",
            back: "\u0b1f\u0b4d\u0b30\u0b47\u0b23\u0b4d\u0b21\u0b3f\u0b02 \u0b38\u0b2e\u0b4d\u0b2c\u0b3e\u0b26\u0b15\u0b41 \u0b2b\u0b47\u0b30\u0b28\u0b4d\u0b24\u0b41",
            kicker: "\u0b1f\u0b4d\u0b30\u0b47\u0b23\u0b4d\u0b21\u0b3f\u0b02 \u0b38\u0b2e\u0b4d\u0b2c\u0b3e\u0b26",
            heading: "\u0b38\u0b2e\u0b4d\u0b2a\u0b42\u0b30\u0b4d\u0b23\u0b4d\u0b23 \u0b38\u0b2e\u0b4d\u0b2c\u0b3e\u0b26"
        }
    };

    document.addEventListener("DOMContentLoaded", () => {
        const status = document.querySelector("[data-news-status]");
        const content = document.querySelector("[data-news-content]");
        const back = document.querySelector("[data-news-back]");
        const backLabel = document.querySelector("[data-news-back-label]");
        const kicker = document.querySelector("[data-news-kicker]");
        const heading = document.querySelector("[data-news-heading]");
        if (!status || !content || !back || !backLabel || !kicker || !heading) return;

        const query = new URLSearchParams(window.location.search);
        const newsId = Number.parseInt(query.get("news") || "", 10);
        const language = normalizeLanguage(query.get("language")) || currentWebsiteLanguage();
        const dateOrder = query.get("dateOrder") === "asc" ? "asc" : "desc";
        const labels = copy[language] || copy.en;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let activeImage = 0;
        let imageCount = 0;
        let rotationTimer = 0;
        let paused = reduceMotion.matches;
        let motionOverride = false;

        document.documentElement.lang = language;
        back.href = `trending.html?${new URLSearchParams({ language, dateOrder }).toString()}`;
        backLabel.textContent = labels.back;
        kicker.textContent = labels.kicker;
        heading.textContent = labels.heading;
        status.textContent = labels.loading;

        function currentWebsiteLanguage() {
            const selected = window.i18n?.getLanguage?.() || localStorage.getItem("ospbcr-language") || "en";
            return normalizeLanguage(selected) || "en";
        }

        function normalizeLanguage(value) {
            return supportedLanguages.includes(value || "") ? value : "";
        }

        function imagePathsFor(item) {
            return Array.isArray(item.imagePaths) && item.imagePaths.length
                ? item.imagePaths
                : [item.imagePath].filter(Boolean);
        }

        function setStatus(message, isError) {
            status.textContent = message;
            status.classList.toggle("is-error", Boolean(isError));
            status.hidden = false;
        }

        function stopRotation() {
            if (!rotationTimer) return;
            window.clearInterval(rotationTimer);
            rotationTimer = 0;
        }

        function showImage(index) {
            const article = content.querySelector(".trending-detail-card");
            const track = article?.querySelector("[data-trending-image-track]");
            if (!article || !track || !imageCount) return;

            activeImage = (index + imageCount) % imageCount;
            article.dataset.activeImage = String(activeImage);
            track.style.transform = `translateX(-${activeImage * 100}%)`;
            article.querySelectorAll("[data-trending-card-image]").forEach((image, imageIndex) => {
                image.setAttribute("aria-hidden", String(imageIndex !== activeImage));
            });
            article.querySelectorAll("[data-trending-image-dot]").forEach((dot, dotIndex) => {
                dot.classList.toggle("is-active", dotIndex === activeImage);
            });
            const position = article.querySelector("[data-trending-image-position]");
            if (position) position.textContent = `${activeImage + 1} / ${imageCount}`;
        }

        function syncPlayback() {
            const control = content.querySelector("[data-news-playback]");
            if (!control) return;
            control.setAttribute("aria-pressed", String(paused));
            control.querySelector("[data-playback-icon]").textContent = paused ? "\u25b6" : "\u275a\u275a";
            control.querySelector("[data-playback-label]").textContent = paused
                ? labels.playSlideshow
                : labels.pauseSlideshow;
        }

        function startRotation() {
            stopRotation();
            syncPlayback();
            if (imageCount > 1 && !paused && (!reduceMotion.matches || motionOverride) && !document.hidden) {
                rotationTimer = window.setInterval(() => showImage(activeImage + 1), 4000);
            }
        }

        function createMedia(item) {
            const media = document.createElement("div");
            media.className = "trending-detail-media";
            const imagePaths = imagePathsFor(item);
            imageCount = imagePaths.length;

            const gallery = document.createElement("div");
            gallery.className = "trending-card-gallery";
            gallery.dataset.trendingImageTrack = "";
            gallery.setAttribute("aria-label", `${item.title}: ${imageCount} photo${imageCount === 1 ? "" : "s"}`);

            imagePaths.forEach((path, index) => {
                const image = document.createElement("img");
                image.src = path;
                image.alt = index === 0 ? item.title : `${item.title} - photo ${index + 1}`;
                image.loading = index === 0 ? "eager" : "lazy";
                image.decoding = "async";
                image.dataset.trendingCardImage = "";
                image.setAttribute("aria-hidden", String(index !== 0));
                gallery.appendChild(image);
            });

            const languageBadge = document.createElement("span");
            languageBadge.className = "trending-card-language";
            languageBadge.textContent = languageNames[item.language] || item.language.toUpperCase();
            media.append(gallery, languageBadge);

            if (imageCount > 1) {
                media.append(
                    createImageButton("previous", labels.previousPhoto),
                    createImageButton("next", labels.nextPhoto)
                );

                const count = document.createElement("span");
                count.className = "trending-card-photo-count";
                count.dataset.trendingImagePosition = "";
                count.textContent = `1 / ${imageCount}`;
                media.appendChild(count);

                if (imageCount <= 10) {
                    const dots = document.createElement("div");
                    dots.className = "trending-card-image-dots";
                    dots.setAttribute("aria-hidden", "true");
                    imagePaths.forEach((_, index) => {
                        const dot = document.createElement("span");
                        dot.dataset.trendingImageDot = "";
                        dot.classList.toggle("is-active", index === 0);
                        dots.appendChild(dot);
                    });
                    media.appendChild(dots);
                }

                const playback = document.createElement("button");
                playback.type = "button";
                playback.className = "trending-image-playback";
                playback.dataset.newsPlayback = "";
                playback.innerHTML =
                    '<span class="trending-playback-icon" data-playback-icon aria-hidden="true"></span>' +
                    '<span data-playback-label></span>';
                media.appendChild(playback);
            }

            return media;
        }

        function createImageButton(direction, label) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `trending-image-control trending-image-${direction}`;
            button.dataset.newsImageDirection = direction;
            button.setAttribute("aria-label", label);
            button.title = label;
            button.innerHTML = `<span aria-hidden="true">${direction === "previous" ? "\u2039" : "\u203a"}</span>`;
            return button;
        }

        function createArticle(item) {
            const article = document.createElement("article");
            article.className = "trending-detail-card";
            article.lang = item.language;
            article.dataset.activeImage = "0";

            const detail = document.createElement("div");
            detail.className = "trending-detail-content";
            const meta = document.createElement("div");
            meta.className = "trending-card-meta";
            const published = document.createElement("span");
            published.textContent = labels.published;
            const date = document.createElement("time");
            date.textContent = item.publishDate;
            date.dateTime = toIsoDate(item.publishDate);
            meta.append(published, date);

            const title = document.createElement("h2");
            title.textContent = item.title;
            const note = document.createElement("p");
            note.className = "trending-card-note";
            note.textContent = item.textNote;
            const footer = document.createElement("footer");
            footer.className = "trending-card-footer";
            const footerText = document.createElement("span");
            footerText.textContent = item.footer;
            footer.appendChild(footerText);

            detail.append(meta, title, note, footer);
            article.append(createMedia(item), detail);
            return article;
        }

        async function loadNews() {
            if (!Number.isInteger(newsId) || newsId <= 0) {
                setStatus(labels.notFound, true);
                return;
            }

            try {
                const response = await fetch(`/api/content/news?language=${encodeURIComponent(language)}`, {
                    cache: "no-store",
                    headers: { "Accept": "application/json" }
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const items = await response.json();
                const selected = items.find((item) => Number(item.id) === newsId && item.language === language);
                if (!selected) {
                    setStatus(labels.notFound, true);
                    return;
                }

                content.replaceChildren(createArticle(selected));
                status.hidden = true;
                heading.textContent = selected.title;
                document.title = `${selected.title} | OSPBCR`;
                startRotation();
            } catch (error) {
                console.error("News story could not be loaded.", error);
                setStatus(labels.error, true);
            }
        }

        content.addEventListener("click", (event) => {
            const directionButton = event.target.closest?.("[data-news-image-direction]");
            if (directionButton) {
                showImage(activeImage + (directionButton.dataset.newsImageDirection === "previous" ? -1 : 1));
                return;
            }

            const playback = event.target.closest?.("[data-news-playback]");
            if (!playback) return;
            paused = !paused;
            if (!paused) motionOverride = true;
            startRotation();
        });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) stopRotation();
            else startRotation();
        });
        reduceMotion.addEventListener?.("change", () => {
            if (reduceMotion.matches && !motionOverride) paused = true;
            startRotation();
        });

        loadNews();
    });

    function toIsoDate(value) {
        const [day, month, year] = String(value || "").split("/");
        return day && month && year ? `${year}-${month}-${day}` : "";
    }
})();
