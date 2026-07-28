function initializeCountUp(root = document) {

    const statNumbers = Array.from(root.querySelectorAll("[data-count-to]"));

    if (statNumbers.length === 0) {
        return;
    }

    const formatValue = (value, element) => {
        const suffix = element.dataset.countSuffix || "";
        const prefix = element.dataset.countPrefix || "";
        const shouldFormat = element.dataset.countFormat === "locale";
        const language = window.i18n?.getLanguage() || "en";
        const roundedValue = Math.round(value);
        const displayValue = shouldFormat ? roundedValue.toLocaleString(language) : String(roundedValue);

        return `${prefix}${displayValue}${suffix}`;
    };

    const animateValue = (element) => {
        if (element.dataset.countAnimated === "true") {
            return;
        }

        const target = Number(element.dataset.countTo);

        if (!Number.isFinite(target)) {
            return;
        }

        element.dataset.countAnimated = "true";

        if (typeof gsap !== "undefined") {
            const counter = { value: 0 };

            gsap.to(counter, {
                value: target,
                duration: target >= 1000 ? 2 : 1.6,
                ease: "power2.out",
                snap: { value: 1 },
                onUpdate: () => {
                    element.textContent = formatValue(counter.value, element);
                }
            });

            return;
        }

        const duration = target >= 1000 ? 2000 : 1600;
        const startTime = performance.now();

        const tick = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            element.textContent = formatValue(target * eased, element);

            if (progress < 1) {
                window.requestAnimationFrame(tick);
            }
        };

        window.requestAnimationFrame(tick);
    };

    if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {
        statNumbers.forEach((element) => {
            ScrollTrigger.create({
                trigger: element,
                start: "top 88%",
                once: true,
                onEnter: () => animateValue(element)
            });
        });

        return;
    }

    const observer = new IntersectionObserver((entries, activeObserver) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }

            animateValue(entry.target);
            activeObserver.unobserve(entry.target);
        });
    }, { threshold: 0.35 });

    statNumbers.forEach((element) => observer.observe(element));

}

window.initializeCountUp = initializeCountUp;

document.addEventListener("DOMContentLoaded", () => initializeCountUp());
