(function () {
    "use strict";

    function initializeCmsNewsCards() {
        const grid = document.querySelector(".cms-content-grid");
        if (!grid) return;
        const cards = Array.from(grid.querySelectorAll("[data-cms-news-card]"));
        const rotatingCards = cards.filter(
            (card) => card.querySelectorAll("[data-cms-news-card-image]").length > 1
        );
        if (!rotatingCards.length) return;

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const rotationDelay = 2000;
        let rotationTimer = 0;
        let interactionPaused = false;

        function showImage(card, index) {
            const track = card.querySelector("[data-cms-news-image-track]");
            const images = Array.from(card.querySelectorAll("[data-cms-news-card-image]"));
            if (!track || !images.length) return;

            const activeIndex = (index + images.length) % images.length;
            card.dataset.activeImage = String(activeIndex);
            track.style.transform = `translateX(-${activeIndex * 100}%)`;

            images.forEach((image, imageIndex) => {
                image.setAttribute("aria-hidden", String(imageIndex !== activeIndex));
            });

            card.querySelectorAll("[data-cms-news-image-dot]").forEach((dot, dotIndex) => {
                dot.classList.toggle("is-active", dotIndex === activeIndex);
            });

            const position = card.querySelector("[data-cms-news-image-position]");
            if (position) position.textContent = `${activeIndex + 1} / ${images.length}`;
        }

        function moveImage(card, direction) {
            const currentIndex = Number.parseInt(card.dataset.activeImage || "0", 10);
            showImage(card, currentIndex + direction);
        }

        function stopRotation() {
            if (!rotationTimer) return;
            window.clearInterval(rotationTimer);
            rotationTimer = 0;
        }

        function startRotation() {
            stopRotation();
            if (interactionPaused || reduceMotion.matches || document.hidden) return;

            rotationTimer = window.setInterval(() => {
                rotatingCards.forEach((card) => moveImage(card, 1));
            }, rotationDelay);
        }

        function pauseRotation() {
            interactionPaused = true;
            stopRotation();
        }

        function resumeRotation() {
            interactionPaused = false;
            startRotation();
        }

        grid.addEventListener("click", (event) => {
            const previous = event.target.closest?.("[data-cms-news-image-previous]");
            const next = event.target.closest?.("[data-cms-news-image-next]");
            if (!previous && !next) return;

            const card = (previous || next).closest("[data-cms-news-card]");
            moveImage(card, previous ? -1 : 1);
        });

        grid.addEventListener("mouseenter", pauseRotation);
        grid.addEventListener("mouseleave", resumeRotation);
        grid.addEventListener("focusin", pauseRotation);
        grid.addEventListener("focusout", (event) => {
            if (!grid.contains(event.relatedTarget)) resumeRotation();
        });
        grid.addEventListener("touchstart", pauseRotation, { passive: true });
        grid.addEventListener("touchend", resumeRotation, { passive: true });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) stopRotation();
            else startRotation();
        });
        reduceMotion.addEventListener?.("change", startRotation);

        startRotation();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeCmsNewsCards);
    } else {
        initializeCmsNewsCards();
    }
})();
