async function loadComponent(id, file) {
    const response = await fetch(file, { cache: "no-store" });
    const html = await response.text();
    const target = document.getElementById(id);

    if (target) {
        target.innerHTML = html;
    }
}

function updateNavbarOffset() {
    const navbar = document.querySelector(".navbar-custom");

    if (!navbar) return;

    const height = Math.ceil(navbar.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--navbar-offset", `${height}px`);
}

function syncNavbarScrollState() {
    const navbar = document.querySelector(".navbar-custom");

    if (!navbar) return;

    const scrolled = window.scrollY > 8;
    navbar.classList.toggle("navbar-scrolled", scrolled);
}

async function initializeLayout() {
    await Promise.all([
        loadComponent("navbar-container", "components/navbar.html"),
        loadComponent("footer-container", "components/footer.html")
    ]);

    updateNavbarOffset();
    syncNavbarScrollState();

    window.addEventListener("resize", updateNavbarOffset, { passive: true });
    window.addEventListener("scroll", syncNavbarScrollState, { passive: true });
    document.addEventListener("languagechange", () => {
        window.requestAnimationFrame(updateNavbarOffset);
    });
}

document.addEventListener("DOMContentLoaded", initializeLayout);
