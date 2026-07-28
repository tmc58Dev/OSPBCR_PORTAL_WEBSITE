// Main JavaScript
// ======================================
// ACTIVE NAVIGATION
// ======================================

document.addEventListener("DOMContentLoaded", () => {

    const currentPage =
        window.location.pathname.split("/").pop();

    const navLinks =
        document.querySelectorAll(".nav-link");

    navLinks.forEach(link => {

        const href = link.getAttribute("href");

        if (href === currentPage) {

            link.classList.add("active");

        }

    });

});


// ======================================
// PAGE LOAD ANIMATION
// ======================================

window.addEventListener("load", () => {

    if (typeof gsap !== "undefined") {

        gsap.from("main", {

            opacity: 0,

            y: 20,

            duration: 0.6,

            ease: "power3.out"

        });

    }

});


// ======================================
// SCROLL REVEAL SECTIONS
// ======================================

document.addEventListener("DOMContentLoaded", () => {

    if (typeof gsap === "undefined") return;

    const sections =
        document.querySelectorAll("section");

    sections.forEach(section => {

        gsap.from(section, {

            scrollTrigger: section,

            opacity: 0,

            y: 40,

            duration: 0.8,

            ease: "power3.out"

        });

    });

});


// ======================================
// CARD ANIMATIONS
// ======================================

document.addEventListener("DOMContentLoaded", () => {

    if (typeof gsap === "undefined") return;

    const cards = document.querySelectorAll(
        ".mission-card, .quick-card, .participant-card, .district-card, .team-card, .objective-card, .partner-card"
    );

    cards.forEach(card => {

        gsap.from(card, {

            scrollTrigger: card,

            opacity: 0,

            y: 30,

            duration: 0.5,

            ease: "power3.out"

        });

    });

});


// ======================================
// TABLE ROW ANIMATION
// ======================================

document.addEventListener("DOMContentLoaded", () => {

    if (typeof gsap === "undefined") return;

    const rows =
        document.querySelectorAll("tbody tr");

    rows.forEach((row, index) => {

        gsap.from(row, {

            scrollTrigger: row,

            opacity: 0,

            y: 15,

            duration: 0.4,

            delay: index * 0.05,

            ease: "power2.out"

        });

    });

});


// ======================================
// SVG MAP SUPPORT
// ======================================

document.addEventListener("DOMContentLoaded", () => {

    const districts =
        document.querySelectorAll(".odisha-map path");

    districts.forEach(district => {

        district.addEventListener("click", () => {

            districts.forEach(item => {

                item.classList.remove("active-district");

            });

            district.classList.add("active-district");

        });

    });

});