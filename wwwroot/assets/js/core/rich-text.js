(function () {
    "use strict";

    const allowedTags = new Set([
        "A", "B", "BLOCKQUOTE", "BR", "CODE", "DIV", "EM", "FONT", "H1", "H2", "H3", "H4",
        "HR", "I", "LI", "OL", "P", "PRE", "S", "SPAN", "STRIKE", "STRONG", "SUB", "SUP", "U", "UL"
    ]);
    const discardedTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "FORM"]);
    const allowedStyles = new Set(["background-color", "color", "font-family", "font-size", "text-align"]);
    const savedSelections = new WeakMap();

    function safeLink(value) {
        const text = String(value || "").trim();
        if (!text) return "";
        if (/^(https?:|mailto:|tel:)/i.test(text)) return text;
        if (/^(\/|#)/.test(text)) return text;
        return "";
    }

    function cleanStyle(element) {
        const declarations = [];
        Array.from(element.style).forEach((property) => {
            if (!allowedStyles.has(property)) return;
            const value = element.style.getPropertyValue(property).trim();
            if (!value || /url\s*\(|expression\s*\(|javascript:/i.test(value)) return;
            if (property === "text-align" && !/^(left|center|right|justify)$/i.test(value)) return;
            if (property === "font-size" && !/^(?:[1-9]\d?(?:\.\d+)?(?:px|pt|em|rem|%)|xx-small|x-small|small|medium|large|x-large|xx-large)$/i.test(value)) return;
            if (property === "font-family" && !/^[\w\s,'"-]+$/u.test(value)) return;
            declarations.push(`${property}: ${value}`);
        });
        return declarations.join("; ");
    }

    function sanitizeRichText(value) {
        const template = document.createElement("template");
        template.innerHTML = String(value || "");

        Array.from(template.content.querySelectorAll("*")).forEach((element) => {
            if (discardedTags.has(element.tagName)) {
                element.remove();
                return;
            }
            if (!allowedTags.has(element.tagName)) {
                element.replaceWith(...element.childNodes);
                return;
            }

            const href = element.tagName === "A" ? safeLink(element.getAttribute("href")) : "";
            const style = cleanStyle(element);
            const face = element.tagName === "FONT" && /^[\w\s,'"-]+$/u.test(element.getAttribute("face") || "")
                ? element.getAttribute("face")
                : "";
            const size = element.tagName === "FONT" && /^[1-7]$/.test(element.getAttribute("size") || "")
                ? element.getAttribute("size")
                : "";
            const color = element.tagName === "FONT" && /^[#(),.%\w\s-]+$/u.test(element.getAttribute("color") || "")
                ? element.getAttribute("color")
                : "";

            Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
            if (style) element.setAttribute("style", style);
            if (face) element.setAttribute("face", face);
            if (size) element.setAttribute("size", size);
            if (color) element.setAttribute("color", color);
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
        if (/<\/?[a-z][\s\S]*>/i.test(text)) return sanitizeRichText(text);
        const holder = document.createElement("div");
        holder.textContent = text;
        return holder.innerHTML.replace(/\r?\n/g, "<br>");
    }

    window.OSPBCRRichText = Object.freeze({ sanitize: sanitizeRichText });

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll(".cms-main textarea:not([data-plain-text])").forEach(createEditor);
    });

    function createEditor(textarea) {
        if (textarea.dataset.richTextReady === "true") return;
        textarea.dataset.richTextReady = "true";
        const isRequired = textarea.required || textarea.dataset.valRequired !== undefined;

        const shell = document.createElement("div");
        shell.className = "wysiwyg-editor";
        const toolbar = document.createElement("div");
        toolbar.className = "wysiwyg-toolbar";
        toolbar.setAttribute("role", "toolbar");
        toolbar.setAttribute("aria-label", "Text formatting");
        const editor = document.createElement("div");
        editor.className = "wysiwyg-surface";
        editor.contentEditable = "true";
        editor.setAttribute("role", "textbox");
        editor.setAttribute("aria-multiline", "true");
        editor.setAttribute("aria-required", String(isRequired));
        editor.setAttribute("aria-label", textarea.labels?.[0]?.textContent?.trim() || "Rich text editor");
        editor.spellcheck = true;
        editor.innerHTML = plainTextToHtml(textarea.value);

        const commands = [
            ["bold", "B", "Bold"], ["italic", "I", "Italic"], ["underline", "U", "Underline"],
            ["strikeThrough", "S", "Strikethrough"], ["subscript", "X₂", "Subscript"],
            ["superscript", "X²", "Superscript"]
        ];
        commands.forEach(([command, label, title]) => toolbar.appendChild(commandButton(command, label, title, editor)));

        toolbar.append(
            commandSelect("fontName", "Font family", [
                ["", "Font"], ["Arial", "Arial"], ["Georgia", "Georgia"], ["Tahoma", "Tahoma"],
                ["Times New Roman", "Times New Roman"], ["Verdana", "Verdana"],
                ["Noto Sans Devanagari", "Noto Sans Devanagari"], ["Noto Sans Oriya", "Noto Sans Oriya"]
            ], editor),
            commandSelect("fontSize", "Font size", [
                ["", "Size"], ["1", "10 pt"], ["2", "12 pt"], ["3", "14 pt"], ["4", "18 pt"],
                ["5", "24 pt"], ["6", "32 pt"], ["7", "48 pt"]
            ], editor),
            commandSelect("formatBlock", "Paragraph style", [
                ["", "Paragraph"], ["p", "Paragraph"], ["h1", "Heading 1"], ["h2", "Heading 2"],
                ["h3", "Heading 3"], ["h4", "Heading 4"], ["blockquote", "Blockquote"], ["pre", "Code block"]
            ], editor),
            colorControl("foreColor", "Text color", editor),
            colorControl("hiliteColor", "Highlight color", editor)
        );

        [
            ["justifyLeft", "⇤", "Left align"], ["justifyCenter", "↔", "Center align"],
            ["justifyRight", "⇥", "Right align"], ["justifyFull", "☰", "Justify"],
            ["insertUnorderedList", "• List", "Bulleted list"], ["insertOrderedList", "1. List", "Numbered list"]
        ].forEach(([command, label, title]) => toolbar.appendChild(commandButton(command, label, title, editor)));

        toolbar.append(
            actionButton("↵", "Line break", () => execute("insertHTML", "<br>", editor)),
            actionButton("¶", "Paragraph break", () => execute("insertParagraph", null, editor)),
            actionButton("―", "Horizontal rule", () => execute("insertHorizontalRule", null, editor)),
            actionButton("Link", "Insert hyperlink", () => insertLink(editor)),
            actionButton("Clear", "Clear formatting", () => {
                execute("removeFormat", null, editor);
                execute("unlink", null, editor);
            })
        );

        textarea.classList.add("wysiwyg-source");
        textarea.required = false;
        textarea.tabIndex = -1;
        textarea.insertAdjacentElement("afterend", shell);
        shell.append(toolbar, editor);

        const sync = () => {
            textarea.value = sanitizeRichText(editor.innerHTML);
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
        };
        editor.addEventListener("input", sync);
        editor.addEventListener("blur", sync);
        ["keyup", "mouseup", "focus"].forEach((eventName) =>
            editor.addEventListener(eventName, () => rememberSelection(editor)));
        toolbar.addEventListener("pointerdown", () => rememberSelection(editor), true);
        editor.closest("form")?.addEventListener("submit", (event) => {
            sync();
            const hasContent = Boolean(editor.textContent.trim());
            editor.setAttribute("aria-invalid", String(isRequired && !hasContent));
            if (isRequired && !hasContent) {
                event.preventDefault();
                editor.focus();
            }
        });
    }

    function rememberSelection(editor) {
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (editor.contains(range.commonAncestorContainer)) {
            savedSelections.set(editor, range.cloneRange());
        }
    }

    function execute(command, value, editor) {
        editor.focus();
        const range = savedSelections.get(editor);
        if (range) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }
        document.execCommand("styleWithCSS", false, true);
        document.execCommand(command, false, value);
        rememberSelection(editor);
        editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function commandButton(command, label, title, editor) {
        return actionButton(label, title, () => execute(command, null, editor));
    }

    function actionButton(label, title, action) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "wysiwyg-control";
        button.textContent = label;
        button.title = title;
        button.setAttribute("aria-label", title);
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", action);
        return button;
    }

    function commandSelect(command, label, options, editor) {
        const select = document.createElement("select");
        select.className = "wysiwyg-select";
        select.title = label;
        select.setAttribute("aria-label", label);
        options.forEach(([value, text]) => select.add(new Option(text, value)));
        select.addEventListener("change", () => {
            if (select.value) execute(command, select.value, editor);
            select.selectedIndex = 0;
        });
        return select;
    }

    function colorControl(command, label, editor) {
        const wrapper = document.createElement("label");
        wrapper.className = "wysiwyg-color-control";
        wrapper.title = label;
        wrapper.setAttribute("aria-label", label);
        const text = document.createElement("span");
        text.textContent = command === "foreColor" ? "A" : "▣";
        const input = document.createElement("input");
        input.type = "color";
        input.value = command === "foreColor" ? "#1f2937" : "#fff2a8";
        input.addEventListener("input", () => execute(command, input.value, editor));
        wrapper.append(text, input);
        return wrapper;
    }

    function insertLink(editor) {
        const href = window.prompt("Enter an http(s), mailto, tel, /path, or #anchor link:", "https://");
        if (href === null) return;
        const safeHref = safeLink(href);
        if (!safeHref) {
            window.alert("Enter a valid link.");
            return;
        }
        execute("createLink", safeHref, editor);
    }
})();
