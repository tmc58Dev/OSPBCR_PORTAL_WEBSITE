(function () {
    "use strict";

    const supportedLanguages = ["en", "hi", "or"];
    const storageKey = "ospbcr-language";
    const languageMeta = {
        en: { htmlLang: "en", label: "English" },
        hi: { htmlLang: "hi", label: "हिन्दी" },
        or: { htmlLang: "or", label: "ଓଡ଼ିଆ" }
    };
    const catalogs = new Map();
    const catalogIndexes = new Map();
    const originalText = new WeakMap();
    const originalAttributes = new WeakMap();
    let currentLanguage = getSavedLanguage();
    const originalDocumentTitle = document.title;
    const scriptBasePath = getScriptBasePath();
    let observer;
    let isApplying = false;

    function getScriptBasePath() {
        const script = document.currentScript;
        const src = script?.getAttribute("src") || "assets/js/core/i18n.js";
        return src.replace(/assets\/js\/core\/i18n\.js(?:\?.*)?$/, "assets/i18n/");
    }

    function getSavedLanguage() {
        try {
            const saved = localStorage.getItem(storageKey);
            return supportedLanguages.includes(saved) ? saved : "en";
        } catch (error) {
            return "en";
        }
    }

    function saveLanguage(language) {
        try {
            localStorage.setItem(storageKey, language);
        } catch (error) {
            console.warn("Language preference could not be saved in this browser.");
        }
    }

    function normalize(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function escapeRegularExpression(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function compileTemplate(template) {
        const names = [];
        const parts = String(template).split(/({{[^{}]+}})/g);
        const pattern = parts.map((part) => {
            const match = part.match(/^{{([^{}]+)}}$/);

            if (!match) return escapeRegularExpression(part);
            names.push(match[1]);
            return "(.+?)";
        }).join("");

        return {
            names,
            expression: new RegExp(`^${pattern}$`)
        };
    }

    function applyTemplate(template, names, captures, resolveCapture = value => value) {
        let value = template;

        names.forEach((name, index) => {
            value = value.replaceAll(`{{${name}}}`, resolveCapture(captures[index]));
        });

        return value;
    }

    function indexCatalog(language, catalog) {
        const reverseExact = new Map();
        const forwardTemplates = [];
        const reverseTemplates = [];

        Object.entries(catalog).forEach(([key, value]) => {
            if (value !== key && !reverseExact.has(value)) {
                reverseExact.set(value, key);
            }

            if (key.includes("{{")) {
                const compiledKey = compileTemplate(key);
                forwardTemplates.push({ key, value, ...compiledKey });
            }

            if (value.includes("{{")) {
                const compiledValue = compileTemplate(value);
                reverseTemplates.push({
                    key,
                    names: compiledValue.names,
                    expression: compiledValue.expression
                });
            }
        });

        catalogIndexes.set(language, {
            reverseExact,
            forwardTemplates,
            reverseTemplates
        });
    }

    async function loadCatalog(language) {
        if (catalogs.has(language)) return catalogs.get(language);

        try {
            const [response, overridesResponse] = await Promise.all([
                fetch(`${scriptBasePath}${language}.json`),
                fetch(`${scriptBasePath}${language}.overrides.json`)
            ]);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const baseCatalog = await response.json();
            const overrides = overridesResponse.ok ? await overridesResponse.json() : {};
            const catalog = { ...baseCatalog, ...overrides };
            catalogs.set(language, catalog);
            indexCatalog(language, catalog);
            return catalog;
        } catch (error) {
            console.error(`Unable to load ${language} translations:`, error);
            const emptyCatalog = {};
            catalogs.set(language, emptyCatalog);
            return emptyCatalog;
        }
    }

    function translate(source, replacements = {}) {
        const key = normalize(source);
        const catalog = catalogs.get(currentLanguage) || {};
        const indexes = catalogIndexes.get(currentLanguage);
        let value = currentLanguage === "en" ? key : catalog[key];

        if (value === undefined && currentLanguage !== "en" && indexes) {
            const template = indexes.forwardTemplates.find((entry) => entry.expression.test(key));

            if (template) {
                const captures = key.match(template.expression).slice(1);
                value = applyTemplate(
                    template.value,
                    template.names,
                    captures,
                    capture => translate(capture)
                );
            }
        }

        if (value === undefined) value = key;

        Object.entries(replacements).forEach(([name, replacement]) => {
            value = value.replaceAll(`{{${name}}}`, replacement);
        });

        return value;
    }

    function resolveOriginal(source) {
        const value = normalize(source);
        const indexes = catalogIndexes.get(currentLanguage);

        if (currentLanguage === "en" || !indexes) return value;
        if (indexes.reverseExact.has(value)) return indexes.reverseExact.get(value);

        for (const template of indexes.reverseTemplates) {
            const match = value.match(template.expression);
            if (!match) continue;

            return applyTemplate(
                template.key,
                template.names,
                match.slice(1),
                capture => indexes.reverseExact.get(normalize(capture)) || normalize(capture)
            );
        }

        return value;
    }

    function translateTextNode(node) {
        if (!normalize(node.nodeValue)) return;
        if (node.parentElement?.closest("[data-i18n-skip]")) return;
        if (!originalText.has(node)) originalText.set(node, resolveOriginal(node.nodeValue));

        const source = originalText.get(node);
        const translated = translate(source);
        const leading = node.nodeValue.match(/^\s*/)?.[0] || "";
        const trailing = node.nodeValue.match(/\s*$/)?.[0] || "";
        const nextValue = `${leading}${translated}${trailing}`;
        if (node.nodeValue !== nextValue) node.nodeValue = nextValue;
    }

    function translateAttributes(element) {
        if (element.closest?.("[data-i18n-skip]")) return;

        const attributes = ["placeholder", "title", "aria-label", "alt"];
        let stored = originalAttributes.get(element);

        if (!stored) {
            stored = {};
            originalAttributes.set(element, stored);
        }

        attributes.forEach((attribute) => {
            if (!element.hasAttribute(attribute)) return;
            if (!(attribute in stored)) stored[attribute] = resolveOriginal(element.getAttribute(attribute));
            const nextValue = translate(stored[attribute]);
            if (element.getAttribute(attribute) !== nextValue) {
                element.setAttribute(attribute, nextValue);
            }
        });
    }

    function translateRoot(root = document.body) {
        if (!root || isApplying) return;
        isApplying = true;

        try {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                    const parent = node.parentElement;
                    return parent &&
                        !parent.closest("[data-i18n-skip]") &&
                        !["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT;
                }
            });

            const textNodes = [];
            while (walker.nextNode()) textNodes.push(walker.currentNode);
            textNodes.forEach(translateTextNode);

            if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root);
            root.querySelectorAll?.("[placeholder], [title], [aria-label], [alt]").forEach(translateAttributes);
            syncLanguageControls();
        } finally {
            isApplying = false;
        }
    }

    function setControlAttribute(control, attribute, value) {
        if (control.getAttribute(attribute) !== value) {
            control.setAttribute(attribute, value);
        }
    }

    function syncLanguageControls() {
        document.querySelectorAll("[data-language-switcher]").forEach((control) => {
            if (control.value !== currentLanguage) {
                control.value = currentLanguage;
            }
            const label = translate("Select language");
            setControlAttribute(control, "aria-label", label);
            setControlAttribute(control, "title", label);
        });
    }

    async function setLanguage(language, options = {}) {
        if (!supportedLanguages.includes(language)) return;
        currentLanguage = language;
        saveLanguage(language);
        await loadCatalog(language);

        document.documentElement.lang = languageMeta[language].htmlLang;
        document.documentElement.dataset.language = language;
        document.title = translate(originalDocumentTitle);
        translateRoot(document.body);

        if (!options.silent) {
            document.dispatchEvent(new CustomEvent("languagechange", { detail: { language } }));
        }
    }

    function watchDom() {
        observer = new MutationObserver((mutations) => {
            if (isApplying) return;
            const roots = new Set();

            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) roots.add(node);
                    if (node.nodeType === Node.TEXT_NODE && node.parentElement) roots.add(node.parentElement);
                });
            });

            roots.forEach((root) => translateRoot(root));
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    async function init() {
        await loadCatalog(currentLanguage);
        await setLanguage(currentLanguage, { silent: true });
        watchDom();

        document.dispatchEvent(new CustomEvent("languagechange", {
            detail: { language: currentLanguage }
        }));

        document.addEventListener("change", (event) => {
            if (event.target.matches("[data-language-switcher]")) {
                setLanguage(event.target.value);
            }
        });

        document.dispatchEvent(new CustomEvent("i18nready", { detail: { language: currentLanguage } }));
    }

    window.i18n = {
        init,
        setLanguage,
        t: translate,
        translateRoot,
        getLanguage: () => currentLanguage,
        getLanguages: () => supportedLanguages.map((code) => ({ code, ...languageMeta[code] }))
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
