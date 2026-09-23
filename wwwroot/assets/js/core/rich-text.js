(function () {
    "use strict";

    const allowedTags = new Set([
        "A", "ABBR", "ADDRESS", "ARTICLE", "B", "BIG", "BLOCKQUOTE", "BR", "CAPTION", "CITE",
        "CODE", "DD", "DEL", "DIV", "DL", "DT", "EM", "FIGCAPTION", "FIGURE", "FONT", "FOOTER",
        "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "I", "INS", "KBD", "LI", "MAIN",
        "MARK", "NAV", "OL", "P", "PRE", "Q", "S", "SAMP", "SECTION", "SMALL", "SPAN", "STRIKE",
        "STRONG", "SUB", "SUP", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TIME", "TR", "U",
        "UL", "VAR"
    ]);
    const discardedTags = new Set([
        "APPLET", "BASE", "BUTTON", "EMBED", "FORM", "FRAME", "FRAMESET", "IFRAME", "INPUT",
        "LINK", "MATH", "META", "OBJECT", "SCRIPT", "SELECT", "STYLE", "SVG", "TEXTAREA", "XML"
    ]);
    const allowedStyles = new Set([
        "background-color", "border", "border-bottom", "border-collapse", "border-left", "border-right",
        "border-top", "color", "font-family", "font-size", "font-style", "font-variant", "font-weight",
        "letter-spacing", "line-height", "list-style-position", "list-style-type", "margin-bottom",
        "margin-left", "margin-right", "margin-top", "padding-left", "padding-right", "text-align",
        "tab-size", "text-decoration", "text-decoration-line", "text-indent", "text-transform", "vertical-align",
        "white-space", "word-break", "word-spacing"
    ]);
    const savedSelections = new WeakMap();

    function safeLink(value) {
        const text = String(value || "").trim();
        if (/^(https?:|mailto:|tel:)/i.test(text) || /^(\/|#)/.test(text)) return text;
        return "";
    }

    function isSafeCssValue(value) {
        return Boolean(value) && !/[{}<>\u0000-\u001f]|url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:/i.test(value);
    }

    function isLength(value, options = {}) {
        if (value === "0" || (options.normal && value === "normal") || (options.auto && value === "auto")) return true;
        const match = /^(-?\d{1,4}(?:\.\d{1,3})?)(px|pt|pc|em|rem|ex|ch|cm|mm|in|%)$/i.exec(value);
        if (!match) return false;
        const amount = Math.abs(Number(match[1]));
        const unit = match[2].toLowerCase();
        if (unit === "%") return amount <= (options.percentMax || 100);
        if (["em", "rem", "ex", "ch"].includes(unit)) return amount <= 40;
        if (["in", "cm"].includes(unit)) return amount <= 20;
        if (unit === "mm") return amount <= 200;
        return amount <= 1200;
    }

    function isAllowedStyle(property, value) {
        if (!isSafeCssValue(value)) return false;
        if (["color", "background-color"].includes(property)) return value.length <= 80;
        if (property === "font-family") return value.length <= 200 && !/[;{}]/.test(value);
        if (property === "font-size") return isLength(value, { percentMax: 500 }) || /^(xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)$/i.test(value);
        if (property === "font-weight") return /^(normal|bold|bolder|lighter|[1-9]00)$/i.test(value);
        if (property === "font-style") return /^(normal|italic|oblique(?:\s+-?\d{1,2}deg)?)$/i.test(value);
        if (property === "font-variant") return /^(normal|small-caps)$/i.test(value);
        if (property === "text-align") return /^(start|end|left|center|right|justify)$/i.test(value);
        if (["text-decoration", "text-decoration-line"].includes(property)) return /^(?:none|underline|overline|line-through)(?:\s+(?:underline|overline|line-through))*$/i.test(value);
        if (property === "text-transform") return /^(none|capitalize|uppercase|lowercase)$/i.test(value);
        if (property === "line-height") return /^(?:normal|\d{1,3}(?:\.\d{1,3})?)$/i.test(value) || isLength(value, { percentMax: 500 });
        if (["letter-spacing", "word-spacing"].includes(property)) return isLength(value, { normal: true });
        if (["margin-top", "margin-right", "margin-bottom", "margin-left", "padding-left", "padding-right", "text-indent"].includes(property)) return isLength(value, { auto: property.startsWith("margin-") });
        if (property === "vertical-align") return /^(baseline|sub|super|text-top|text-bottom|middle|top|bottom)$/i.test(value) || isLength(value);
        if (property === "list-style-position") return /^(inside|outside)$/i.test(value);
        if (property === "list-style-type") return /^[a-z-]{1,40}$/i.test(value);
        if (property === "border-collapse") return /^(collapse|separate)$/i.test(value);
        if (property === "white-space") return /^(normal|nowrap|pre|pre-wrap|pre-line|break-spaces)$/i.test(value);
        if (property === "word-break") return /^(normal|break-all|keep-all|break-word)$/i.test(value);
        if (property === "tab-size") return /^(?:[1-9]|1[0-6])$/.test(value) || isLength(value);
        if (property === "border" || property.startsWith("border-")) return value.length <= 100 && /^[\w\s#(),.%+-]+$/u.test(value);
        return false;
    }

    function cleanStyle(element) {
        const declarations = [];
        allowedStyles.forEach((property) => {
            const value = element.style.getPropertyValue(property).trim();
            if (isAllowedStyle(property, value)) declarations.push(`${property}: ${value}`);
        });
        // Word page/text-box widths break responsive pages. Width is meaningful only in tables.
        if (["TABLE", "TD", "TH"].includes(element.tagName)) {
            const width = element.style.getPropertyValue("width").trim();
            if (isLength(width)) declarations.push(`width: ${width}`);
        }
        return declarations.join("; ");
    }

    function exposeWordListMarkers(fragment) {
        const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_COMMENT);
        const comments = [];
        while (walker.nextNode()) comments.push(walker.currentNode);
        comments.forEach((comment) => {
            const value = comment.nodeValue || "";
            if (/^\[if\s+!supportLists\]/i.test(value)) {
                const marker = document.createElement("template");
                marker.innerHTML = value.replace(/^\[if\s+!supportLists\]>/i, "").replace(/<!\[endif\]$/i, "");
                comment.replaceWith(document.createTextNode(marker.content.textContent || ""));
            } else comment.remove();
        });
    }

    function removeLeadingCharacters(element, count) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let remaining = count;
        while (remaining > 0 && walker.nextNode()) {
            const node = walker.currentNode;
            const removed = Math.min(node.nodeValue.length, remaining);
            node.nodeValue = node.nodeValue.slice(removed);
            remaining -= removed;
        }
    }

    function convertWordLists(fragment) {
        const paragraphs = Array.from(fragment.querySelectorAll("p")).filter((paragraph) =>
            /MsoListParagraph/i.test(paragraph.className) || /mso-list\s*:/i.test(paragraph.getAttribute("style") || ""));
        let list = null;
        paragraphs.forEach((paragraph) => {
            const match = /^\s*((?:\d+|[a-z]|[ivxlcdm]+)[.)]|[•·▪◦])\s+/i.exec(paragraph.textContent || "");
            const tag = match && !/[•·▪◦]/.test(match[1]) ? "OL" : "UL";
            if (!list || list.tagName !== tag || list.nextElementSibling !== paragraph) {
                list = document.createElement(tag.toLowerCase());
                paragraph.before(list);
            }
            if (match) removeLeadingCharacters(paragraph, match[0].length);
            const item = document.createElement("li");
            item.append(...paragraph.childNodes);
            list.appendChild(item);
            paragraph.remove();
        });
    }

    function sanitizeRichText(value) {
        const template = document.createElement("template");
        template.innerHTML = String(value || "").replace(/\u0000/g, "");
        exposeWordListMarkers(template.content);
        convertWordLists(template.content);

        Array.from(template.content.querySelectorAll("*")).forEach((element) => {
            if (discardedTags.has(element.tagName)) return element.remove();
            if (!allowedTags.has(element.tagName)) return element.replaceWith(...element.childNodes);
            const href = element.tagName === "A" ? safeLink(element.getAttribute("href")) : "";
            const style = cleanStyle(element);
            const face = element.tagName === "FONT" && /^[\w\s,'"-]+$/u.test(element.getAttribute("face") || "") ? element.getAttribute("face") : "";
            const size = element.tagName === "FONT" && /^[1-7]$/.test(element.getAttribute("size") || "") ? element.getAttribute("size") : "";
            const color = element.tagName === "FONT" && /^[#(),.%\w\s-]+$/u.test(element.getAttribute("color") || "") ? element.getAttribute("color") : "";
            const align = /^(start|end|left|center|right|justify)$/i.test(element.getAttribute("align") || "") ? element.getAttribute("align") : "";
            const direction = /^(ltr|rtl|auto)$/i.test(element.getAttribute("dir") || "") ? element.getAttribute("dir") : "";
            const language = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(element.getAttribute("lang") || "") ? element.getAttribute("lang") : "";
            const colSpan = /^(?:[1-9]|[1-9]\d)$/.test(element.getAttribute("colspan") || "") ? element.getAttribute("colspan") : "";
            const rowSpan = /^(?:[1-9]|[1-9]\d)$/.test(element.getAttribute("rowspan") || "") ? element.getAttribute("rowspan") : "";
            const listStart = /^-?\d{1,6}$/.test(element.getAttribute("start") || "") ? element.getAttribute("start") : "";
            const listType = /^(1|a|A|i|I|disc|circle|square)$/.test(element.getAttribute("type") || "") ? element.getAttribute("type") : "";
            Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
            const finalStyle = [style, align ? `text-align: ${align}` : ""].filter(Boolean).join("; ");
            if (finalStyle) element.setAttribute("style", finalStyle);
            if (face) element.setAttribute("face", face);
            if (size) element.setAttribute("size", size);
            if (color) element.setAttribute("color", color);
            if (direction) element.setAttribute("dir", direction);
            if (language) element.setAttribute("lang", language);
            if (["TD", "TH"].includes(element.tagName) && colSpan) element.setAttribute("colspan", colSpan);
            if (["TD", "TH"].includes(element.tagName) && rowSpan) element.setAttribute("rowspan", rowSpan);
            if (element.tagName === "OL" && listStart) element.setAttribute("start", listStart);
            if (["OL", "UL"].includes(element.tagName) && listType) element.setAttribute("type", listType);
            if (href) {
                element.setAttribute("href", href);
                element.setAttribute("target", "_blank");
                element.setAttribute("rel", "noopener noreferrer");
            }
        });
        return template.innerHTML;
    }

    function plainTextToHtml(value) {
        const text = String(value || "");
        if (!text) return "";
        const holder = document.createElement("div");
        holder.textContent = text;
        holder.style.whiteSpace = "pre-wrap";
        holder.style.tabSize = "4";
        return holder.outerHTML;
    }

    function forcePastedTextToBlack(value) {
        const template = document.createElement("template");
        template.innerHTML = sanitizeRichText(value);

        Array.from(template.content.querySelectorAll("*")).forEach((element) => {
            element.removeAttribute("color");
            element.style.setProperty("color", "#000000");
        });

        Array.from(template.content.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue)
            .forEach((node) => {
                const wrapper = document.createElement("span");
                wrapper.style.setProperty("color", "#000000");
                node.replaceWith(wrapper);
                wrapper.appendChild(node);
            });

        return sanitizeRichText(template.innerHTML);
    }

    function storedValueToHtml(value) {
        const text = String(value || "");
        return /<\/?[a-z][\s\S]*>/i.test(text) ? sanitizeRichText(text) : plainTextToHtml(text);
    }

    function toPlainText(value) {
        const holder = document.createElement("div");
        holder.innerHTML = sanitizeRichText(value);
        return holder.textContent.replace(/\s+/g, " ").trim();
    }

    window.OSPBCRRichText = Object.freeze({ sanitize: sanitizeRichText, toPlainText });

    function rememberSelection(editor) {
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (editor.contains(range.commonAncestorContainer)) savedSelections.set(editor, range.cloneRange());
    }

    function restoreSelection(editor) {
        editor.focus();
        const saved = savedSelections.get(editor);
        if (!saved) return;
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(saved);
    }

    function notifyInput(editor) {
        rememberSelection(editor);
        editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function execute(command, value, editor) {
        restoreSelection(editor);
        document.execCommand("styleWithCSS", false, true);
        document.execCommand(command, false, value);
        notifyInput(editor);
    }

    function button(label, title, action) {
        const control = document.createElement("button");
        control.type = "button";
        control.className = "wysiwyg-control";
        control.innerHTML = label;
        control.title = title;
        control.setAttribute("aria-label", title);
        control.addEventListener("mousedown", (event) => event.preventDefault());
        control.addEventListener("click", action);
        return control;
    }

    function select(command, label, options, editor) {
        const control = document.createElement("select");
        control.className = "wysiwyg-select";
        control.title = label;
        control.setAttribute("aria-label", label);
        options.forEach(([value, text]) => control.add(new Option(text, value)));
        control.addEventListener("change", () => {
            if (control.value) execute(command, control.value, editor);
            control.selectedIndex = 0;
        });
        return control;
    }

    function choice(label, options, action) {
        const control = document.createElement("select");
        control.className = "wysiwyg-select";
        control.title = label;
        control.setAttribute("aria-label", label);
        options.forEach(([value, text]) => control.add(new Option(text, value)));
        control.addEventListener("change", () => {
            if (control.value) action(control.value);
            control.selectedIndex = 0;
        });
        return control;
    }

    function applyFontSize(editor, points) {
        restoreSelection(editor);
        const existingFonts = Array.from(editor.querySelectorAll("font[size='7']"));
        existingFonts.forEach((font) => font.setAttribute("data-existing-font-size", "true"));
        document.execCommand("styleWithCSS", false, false);
        document.execCommand("fontSize", false, "7");
        editor.querySelectorAll("font[size='7']:not([data-existing-font-size])").forEach((font) => {
            const span = document.createElement("span");
            span.style.fontSize = `${points}pt`;
            while (font.firstChild) span.appendChild(font.firstChild);
            font.replaceWith(span);
        });
        existingFonts.forEach((font) => font.removeAttribute("data-existing-font-size"));
        document.execCommand("styleWithCSS", false, true);
        notifyInput(editor);
    }

    function selectedTextParts(editor) {
        restoreSelection(editor);
        const selection = window.getSelection();
        if (!selection?.rangeCount || selection.isCollapsed) return [];
        const range = selection.getRangeAt(0);
        const parts = [];
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (!range.intersectsNode(node)) continue;
            const start = node === range.startContainer ? range.startOffset : 0;
            const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
            if (end > start) parts.push({ node, start, end });
        }
        return parts;
    }

    function changeCase(editor, mode) {
        const parts = selectedTextParts(editor);
        const transform = mode === "upper"
            ? (text) => text.toLocaleUpperCase()
            : mode === "lower"
                ? (text) => text.toLocaleLowerCase()
                : (text) => text.toLocaleLowerCase().replace(/(^|[^\p{L}\p{N}])([\p{L}])/gu, (_, before, letter) => before + letter.toLocaleUpperCase());
        parts.forEach(({ node, start, end }) => {
            node.nodeValue = node.nodeValue.slice(0, start) + transform(node.nodeValue.slice(start, end)) + node.nodeValue.slice(end);
        });
        notifyInput(editor);
    }

    function selectedBlocks(editor) {
        restoreSelection(editor);
        const selection = window.getSelection();
        if (!selection?.rangeCount) return [];
        const range = selection.getRangeAt(0);
        const selector = "p,div,h1,h2,h3,h4,h5,h6,blockquote,pre,li,td,th";
        const matches = Array.from(editor.querySelectorAll(selector)).filter((element) => range.intersectsNode(element));
        if (matches.length) return matches.filter((element) => !matches.some((other) => other !== element && element.contains(other)));
        const origin = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
            ? range.commonAncestorContainer
            : range.commonAncestorContainer.parentElement;
        const closest = origin?.closest(selector);
        return closest && editor.contains(closest) ? [closest] : [];
    }

    function applyParagraphStyle(editor, property, value) {
        const blocks = selectedBlocks(editor);
        if (!blocks.length) {
            execute("formatBlock", "p", editor);
            return applyParagraphStyle(editor, property, value);
        }
        blocks.forEach((block) => { block.style[property] = value; });
        notifyInput(editor);
    }

    function clearAllFormatting(editor) {
        restoreSelection(editor);
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        document.execCommand("removeFormat", false, null);
        document.execCommand("unlink", false, null);
        if (range) {
            editor.querySelectorAll("[style],font").forEach((element) => {
                if (!range.intersectsNode(element)) return;
                element.removeAttribute("style");
                ["face", "size", "color", "bgcolor", "align"].forEach((attribute) => element.removeAttribute(attribute));
            });
        }
        notifyInput(editor);
    }

    function insertLink(editor) {
        const href = window.prompt("Enter an http(s), mailto, tel, /path, or #anchor link:", "https://");
        if (href === null) return;
        const clean = safeLink(href);
        if (!clean) return window.alert("Enter a valid link.");
        execute("createLink", clean, editor);
    }

    function insertTable(editor) {
        const rows = Math.min(20, Math.max(0, Number.parseInt(window.prompt("Rows (1–20):", "2") || "0", 10)));
        const columns = Math.min(12, Math.max(0, Number.parseInt(window.prompt("Columns (1–12):", "2") || "0", 10)));
        if (!rows || !columns) return;
        const body = Array.from({ length: rows }, () => `<tr>${"<td><br></td>".repeat(columns)}</tr>`).join("");
        execute("insertHTML", `<table><tbody>${body}</tbody></table><p><br></p>`, editor);
    }

    function createToolbar(editor) {
        const toolbar = document.createElement("div");
        toolbar.className = "wysiwyg-toolbar";
        toolbar.setAttribute("role", "toolbar");
        toolbar.setAttribute("aria-label", "Rich text formatting");
        const command = (name, label, title, value = null) => button(label, title, () => execute(name, value, editor));
        const fontSizes = [["", "Font Size"], ...Array.from({ length: 40 }, (_, index) => {
            const size = String(index + 1);
            return [size, `${size} pt`];
        })];
        toolbar.append(
            command("bold", "<b>B</b>", "Bold"), command("italic", "<i>I</i>", "Italic"),
            command("underline", "<u>U</u>", "Underline"), command("strikeThrough", "<s>S</s>", "Strikethrough"),
            command("superscript", "X<sup>2</sup>", "Superscript"), command("subscript", "X<sub>2</sub>", "Subscript"),
            select("fontName", "Font family", [["", "Font Style"], ["Aptos", "Aptos"], ["Aptos Display", "Aptos Display"], ["Arial", "Arial"], ["Arial Black", "Arial Black"], ["Bahnschrift", "Bahnschrift"], ["Book Antiqua", "Book Antiqua"], ["Bookman Old Style", "Bookman Old Style"], ["Calibri", "Calibri"], ["Cambria", "Cambria"], ["Candara", "Candara"], ["Century Gothic", "Century Gothic"], ["Constantia", "Constantia"], ["Corbel", "Corbel"], ["Courier New", "Courier New"], ["Franklin Gothic Medium", "Franklin Gothic Medium"], ["Garamond", "Garamond"], ["Georgia", "Georgia"], ["Helvetica", "Helvetica"], ["Lucida Sans Unicode", "Lucida Sans Unicode"], ["Noto Sans", "Noto Sans"], ["Noto Serif", "Noto Serif"], ["Noto Sans Devanagari", "Noto Sans Devanagari"], ["Noto Serif Devanagari", "Noto Serif Devanagari"], ["Noto Sans Oriya", "Noto Sans Oriya"], ["Noto Serif Oriya", "Noto Serif Oriya"], ["Palatino Linotype", "Palatino Linotype"], ["Segoe UI", "Segoe UI"], ["Tahoma", "Tahoma"], ["Times New Roman", "Times New Roman"], ["Trebuchet MS", "Trebuchet MS"], ["Verdana", "Verdana"]], editor),
            choice("Font size", fontSizes, (value) => applyFontSize(editor, value)),
            select("formatBlock", "Paragraph style", [["", "Paragraph"], ["p", "Normal"], ["h1", "Heading 1"], ["h2", "Heading 2"], ["h3", "Heading 3"], ["h4", "Heading 4"], ["blockquote", "Quote"], ["pre", "Preformatted"]], editor),
            button("Line Break", "Insert line break", () => execute("insertHTML", "<br>", editor)),
            choice("Change case", [["", "Change Case"], ["upper", "UPPERCASE"], ["lower", "lowercase"], ["title", "Title Case"]], (value) => changeCase(editor, value)),
            command("justifyLeft", "⇤", "Align left"), command("justifyCenter", "↔", "Align center"),
            command("justifyRight", "⇥", "Align right"), command("justifyFull", "☰", "Justify"),
            command("insertUnorderedList", "Bullets", "Bulleted list"), command("insertOrderedList", "Numbering", "Numbered list"),
            choice("Line spacing", [["", "Line Spacing"], ["1", "1.0"], ["1.15", "1.15"], ["1.5", "1.5"], ["2", "2.0"], ["2.5", "2.5"], ["3", "3.0"]], (value) => applyParagraphStyle(editor, "lineHeight", value)),
            choice("Paragraph spacing", [["", "Paragraph Spacing"], ["0pt", "0 pt"], ["3pt", "3 pt"], ["6pt", "6 pt"], ["8pt", "8 pt"], ["10pt", "10 pt"], ["12pt", "12 pt"], ["18pt", "18 pt"], ["24pt", "24 pt"]], (value) => applyParagraphStyle(editor, "marginBottom", value)),
            command("outdent", "← Indent", "Decrease indent"), command("indent", "Indent →", "Increase indent"),
            button("Link", "Insert hyperlink", () => insertLink(editor)), command("unlink", "Unlink", "Remove hyperlink"),
            button("Table", "Insert table", () => insertTable(editor)),
            button("Clear All Formatting", "Clear all formatting", () => clearAllFormatting(editor))
        );
        return toolbar;
    }

    function createEditor(textarea) {
        if (textarea.dataset.richTextReady === "true") return;
        textarea.dataset.richTextReady = "true";
        const required = textarea.required || textarea.dataset.valRequired !== undefined;
        const shell = document.createElement("div");
        shell.className = "wysiwyg-editor";
        const editor = document.createElement("div");
        editor.className = "wysiwyg-surface rich-text-content";
        editor.contentEditable = "true";
        editor.setAttribute("role", "textbox");
        editor.setAttribute("aria-multiline", "true");
        editor.setAttribute("aria-required", String(required));
        editor.setAttribute("aria-label", textarea.labels?.[0]?.textContent?.trim() || "Rich text editor");
        editor.spellcheck = true;
        editor.innerHTML = storedValueToHtml(textarea.value);
        const toolbar = createToolbar(editor);
        const message = document.createElement("span");
        message.className = "wysiwyg-limit-message";
        message.setAttribute("role", "alert");
        message.hidden = true;
        textarea.classList.add("wysiwyg-source");
        textarea.required = false;
        textarea.tabIndex = -1;
        textarea.insertAdjacentElement("afterend", shell);
        shell.append(toolbar, editor, message);
        let accepted = sanitizeRichText(editor.innerHTML);

        const sync = () => {
            const sanitized = sanitizeRichText(editor.innerHTML);
            if (sanitized.length > textarea.maxLength) {
                editor.innerHTML = accepted;
                editor.setAttribute("aria-invalid", "true");
                message.textContent = `This field accepts up to ${textarea.maxLength.toLocaleString()} characters, including formatting.`;
                message.hidden = false;
                return false;
            }
            accepted = sanitized;
            textarea.value = sanitized;
            editor.removeAttribute("aria-invalid");
            message.hidden = true;
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        };
        editor.addEventListener("paste", (event) => {
            const clipboard = event.clipboardData;
            if (!clipboard) return;
            const sourceHtml = clipboard.getData("text/html");
            const sourceText = clipboard.getData("text/plain");
            if (!sourceHtml && !sourceText) return;
            const source = (sourceHtml ? sanitizeRichText(sourceHtml) : "") || plainTextToHtml(sourceText);
            const html = forcePastedTextToBlack(source);
            if (!html) return;
            event.preventDefault();
            execute("insertHTML", html, editor);
        });
        editor.addEventListener("input", sync);
        editor.addEventListener("blur", sync);
        ["keyup", "mouseup", "focus"].forEach((name) => editor.addEventListener(name, () => rememberSelection(editor)));
        toolbar.addEventListener("pointerdown", () => rememberSelection(editor), true);
        editor.closest("form")?.addEventListener("submit", (event) => {
            if (!sync() || (required && !editor.textContent.trim())) {
                event.preventDefault();
                editor.setAttribute("aria-invalid", "true");
                editor.focus();
            }
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll(".cms-main textarea[data-rich-text], .cms-main textarea[data-word-paste]").forEach(createEditor);
        document.querySelectorAll("[data-rich-text-display]").forEach((element) => {
            element.innerHTML = sanitizeRichText(element.textContent);
            element.classList.add("rich-text-content");
        });
    });
})();
