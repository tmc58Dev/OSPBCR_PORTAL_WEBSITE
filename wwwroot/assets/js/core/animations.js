if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {

    gsap.registerPlugin(ScrollTrigger);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!prefersReducedMotion) {

        window.addEventListener("load", () => {

            gsap.from("main", {
                autoAlpha: 0,
                y: 20,
                duration: 0.65,
                ease: "power3.out",
                clearProps: "transform,opacity,visibility"
            });

        });

        const fadeUpItems = gsap.utils.toArray(".fade-up");
        const materialPopItems = fadeUpItems.filter((item) =>
            item.classList.contains("material-group") &&
            item.closest(".training-materials-section")
        );
        const lightweightFadeItems = fadeUpItems.filter((item) =>
            item.classList.contains("district-card") ||
            item.closest(".district-grid")
        );
        const standardFadeItems = fadeUpItems.filter((item) =>
            !materialPopItems.includes(item) &&
            !lightweightFadeItems.includes(item)
        );

        if (materialPopItems.length > 0) {

            gsap.set(materialPopItems, {
                autoAlpha: 0,
                y: 46,
                scale: 0.92,
                filter: "blur(8px)",
                transformOrigin: "center bottom",
                boxShadow: "0 0 0 rgba(0, 91, 150, 0)"
            });

            ScrollTrigger.batch(materialPopItems, {
                start: "top 86%",
                once: true,
                onEnter: (batch) => {
                    gsap.to(batch, {
                        autoAlpha: 1,
                        y: 0,
                        scale: 1,
                        filter: "blur(0px)",
                        boxShadow: "0 22px 52px rgba(0, 91, 150, 0.16)",
                        duration: 0.76,
                        ease: "back.out(1.35)",
                        stagger: 0.12,
                        clearProps: "transform,opacity,visibility,filter,boxShadow"
                    });
                }
            });

        }

        if (standardFadeItems.length > 0) {

            gsap.set(standardFadeItems, {
                autoAlpha: 0,
                y: 28,
                filter: "blur(6px)"
            });

            ScrollTrigger.batch(standardFadeItems, {
                start: "top 88%",
                once: true,
                onEnter: (batch) => {
                    gsap.to(batch, {
                        autoAlpha: 1,
                        y: 0,
                        filter: "blur(0px)",
                        duration: 0.6,
                        ease: "power3.out",
                        stagger: 0.07,
                        clearProps: "transform,opacity,visibility,filter"
                    });
                }
            });

        }

        if (lightweightFadeItems.length > 0) {

            gsap.set(lightweightFadeItems, {
                autoAlpha: 0,
                y: 12
            });

            ScrollTrigger.batch(lightweightFadeItems, {
                start: "top 92%",
                once: true,
                onEnter: (batch) => {
                    gsap.to(batch, {
                        autoAlpha: 1,
                        y: 0,
                        duration: 0.32,
                        ease: "power2.out",
                        stagger: 0.025,
                        clearProps: "transform,opacity,visibility"
                    });
                }
            });

        }

    } else {

        gsap.set(".fade-up", {
            clearProps: "all"
        });

    }

}
