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

function syncActiveNavigation() {
    const currentPage = window.location.pathname.split("/").pop() || "home.html";

    document.querySelectorAll(".nav-menu .nav-link[href]").forEach(link => {
        const linkUrl = new URL(link.getAttribute("href"), window.location.href);
        const linkPage = linkUrl.pathname.split("/").pop();
        const isActive = linkPage === currentPage;

        link.classList.toggle("active", isActive);

        if (isActive) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });
}

async function initializeLayout() {
    await Promise.all([
        loadComponent("navbar-container", "components/navbar.html"),
        loadComponent("footer-container", "components/footer.html")
    ]);

    updateNavbarOffset();
    syncNavbarScrollState();
    syncActiveNavigation();

    window.addEventListener("resize", updateNavbarOffset, { passive: true });
    window.addEventListener("scroll", syncNavbarScrollState, { passive: true });
    document.addEventListener("languagechange", () => {
        window.requestAnimationFrame(updateNavbarOffset);
    });
}

document.addEventListener("DOMContentLoaded", initializeLayout);
