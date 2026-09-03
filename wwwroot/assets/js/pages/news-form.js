(() => {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const form = document.querySelector(".cms-form");
        const input = form?.querySelector('input[type="file"][name="Photos"]');
        const gallery = form?.querySelector("[data-photo-gallery]");
        const orderInputs = form?.querySelector("[data-photo-order-inputs]");
        const count = form?.querySelector("[data-photo-count]");
        const error = form?.querySelector("[data-photo-error]");
        const undo = form?.querySelector("[data-photo-undo]");

        if (!form || !input || !gallery || !orderInputs || !count || !error || !undo) return;

        const maxPhotos = Number.parseInt(gallery.dataset.maxPhotos || "100", 10);
        const maxPhotoBytes = 5 * 1024 * 1024;
        const newEntries = new Map();
        const previewUrls = new Set();
        const removalHistory = [];
        let draggedCard = null;

        const fileKey = (file) => `${file.name}:${file.size}:${file.lastModified}`;
        const isValidWebp = (file) =>
            file.name.toLowerCase().endsWith(".webp") && file.type.toLowerCase() === "image/webp";
        const activeCards = () =>
            Array.from(gallery.querySelectorAll(".existing-photo-item:not(.is-removed)"));

        function showError(message) {
            error.textContent = message;
            error.hidden = !message;
        }

        function clearPreviewUrls() {
            previewUrls.forEach((url) => URL.revokeObjectURL(url));
            previewUrls.clear();
        }

        function createMoveButton(direction, label, symbol) {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.movePhoto = String(direction);
            button.setAttribute("aria-label", label);
            button.title = label;
            button.textContent = symbol;
            return button;
        }

        function createNewPhotoCard(file) {
            const url = URL.createObjectURL(file);
            previewUrls.add(url);

            const card = document.createElement("article");
            card.className = "existing-photo-item is-new-photo";
            card.dataset.newPhoto = "";
            card.draggable = true;

            const position = document.createElement("span");
            position.className = "photo-order-number";
            position.dataset.photoPosition = "";
            position.setAttribute("aria-label", "Image position");

            const image = document.createElement("img");
            image.src = url;
            image.alt = `New photo preview: ${file.name}`;

            const actions = document.createElement("div");
            actions.className = "photo-preview-actions";
            const label = document.createElement("span");
            label.textContent = file.name;
            label.title = file.name;

            const controls = document.createElement("div");
            controls.className = "photo-order-actions";
            controls.append(
                createMoveButton(-1, "Move photo earlier", "←"),
                createMoveButton(1, "Move photo later", "→")
            );

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "photo-remove-button";
            remove.textContent = "Remove";
            remove.addEventListener("click", () => {
                removalHistory.push({ type: "new", card, nextSibling: card.nextSibling });
                card.remove();
                syncPhotoState();
                showError("");
            });

            controls.appendChild(remove);
            actions.append(label, controls);
            card.append(position, image, actions);
            newEntries.set(card, { file, url });
            return card;
        }

        function syncPhotoState() {
            const cards = activeCards();
            const transfer = new DataTransfer();
            const orderedTokens = [];
            let newPhotoIndex = 0;

            cards.forEach((card, index) => {
                const newEntry = newEntries.get(card);
                if (newEntry) {
                    transfer.items.add(newEntry.file);
                    orderedTokens.push(`new:${newPhotoIndex++}`);
                } else if (card.dataset.photoPath) {
                    orderedTokens.push(card.dataset.photoPath);
                }

                const position = card.querySelector("[data-photo-position]");
                if (position) {
                    position.textContent = String(index + 1);
                    position.setAttribute("aria-label", `Image position ${index + 1} of ${cards.length}`);
                }
                card.setAttribute("aria-label", `Image ${index + 1} of ${cards.length}`);

                const earlier = card.querySelector('[data-move-photo="-1"]');
                const later = card.querySelector('[data-move-photo="1"]');
                if (earlier) earlier.disabled = index === 0;
                if (later) later.disabled = index === cards.length - 1;
            });

            input.files = transfer.files;
            orderInputs.replaceChildren(...orderedTokens.map((token) => {
                const hidden = document.createElement("input");
                hidden.type = "hidden";
                hidden.name = "PhotoOrder";
                hidden.value = token;
                return hidden;
            }));

            count.textContent = `${cards.length} of ${maxPhotos} photos selected`;
            count.classList.toggle("is-limit", cards.length === maxPhotos);
            input.setCustomValidity(cards.length > 0 ? "" : "Add at least one WebP photo.");
            undo.hidden = removalHistory.length === 0;
        }

        function moveCard(card, direction) {
            const cards = activeCards();
            const index = cards.indexOf(card);
            const targetIndex = index + direction;
            if (index < 0 || targetIndex < 0 || targetIndex >= cards.length) return;

            const target = cards[targetIndex];
            if (direction < 0) gallery.insertBefore(card, target);
            else gallery.insertBefore(target, card);
            syncPhotoState();
        }

        gallery.querySelectorAll("[data-existing-photo]").forEach((card) => {
            const checkbox = card.querySelector("[data-remove-photo-checkbox]");
            const remove = card.querySelector("[data-remove-existing-photo]");
            if (!checkbox || !remove) return;

            if (checkbox.checked) {
                card.classList.add("is-removed");
                removalHistory.push({ type: "existing", card });
            }

            remove.addEventListener("click", () => {
                checkbox.checked = true;
                card.classList.add("is-removed");
                removalHistory.push({ type: "existing", card });
                syncPhotoState();
                showError("");
            });
        });

        input.addEventListener("change", () => {
            const incomingFiles = Array.from(input.files || []);
            const knownFiles = new Set(activeCards()
                .map((card) => newEntries.get(card)?.file)
                .filter(Boolean)
                .map(fileKey));
            const rejected = [];

            for (const file of incomingFiles) {
                if (!isValidWebp(file)) {
                    rejected.push(`${file.name} is not a valid WebP file.`);
                    continue;
                }
                if (file.size > maxPhotoBytes) {
                    rejected.push(`${file.name} is larger than 5 MB.`);
                    continue;
                }
                if (knownFiles.has(fileKey(file))) continue;
                if (activeCards().length >= maxPhotos) {
                    rejected.push(`Only ${maxPhotos} photos can be added to one News Card.`);
                    break;
                }
                gallery.appendChild(createNewPhotoCard(file));
                knownFiles.add(fileKey(file));
            }

            syncPhotoState();
            showError(rejected.join(" "));
        });

        gallery.addEventListener("click", (event) => {
            const button = event.target.closest?.("[data-move-photo]");
            if (!button) return;
            moveCard(
                button.closest(".existing-photo-item"),
                Number.parseInt(button.dataset.movePhoto, 10)
            );
        });

        gallery.addEventListener("dragstart", (event) => {
            const card = event.target.closest?.(".existing-photo-item:not(.is-removed)");
            if (!card) return;
            draggedCard = card;
            card.classList.add("is-dragging");
            event.dataTransfer.effectAllowed = "move";
        });

        gallery.addEventListener("dragover", (event) => {
            if (!draggedCard) return;
            const target = event.target.closest?.(".existing-photo-item:not(.is-removed)");
            if (!target || target === draggedCard) return;
            event.preventDefault();
            const cards = activeCards();
            if (cards.indexOf(target) < cards.indexOf(draggedCard)) {
                gallery.insertBefore(draggedCard, target);
            } else {
                gallery.insertBefore(draggedCard, target.nextSibling);
            }
        });

        gallery.addEventListener("dragend", () => {
            if (draggedCard) draggedCard.classList.remove("is-dragging");
            draggedCard = null;
            syncPhotoState();
        });

        undo.addEventListener("click", () => {
            const lastRemoval = removalHistory.pop();
            if (!lastRemoval) return;
            if (activeCards().length >= maxPhotos) {
                removalHistory.push(lastRemoval);
                showError(`Remove another photo before restoring this one. The limit is ${maxPhotos}.`);
                syncPhotoState();
                return;
            }

            if (lastRemoval.type === "existing") {
                const checkbox = lastRemoval.card.querySelector("[data-remove-photo-checkbox]");
                if (checkbox) checkbox.checked = false;
                lastRemoval.card.classList.remove("is-removed");
            } else if (lastRemoval.nextSibling?.parentNode === gallery) {
                gallery.insertBefore(lastRemoval.card, lastRemoval.nextSibling);
            } else {
                gallery.appendChild(lastRemoval.card);
            }

            syncPhotoState();
            showError("");
        });

        form.addEventListener("submit", (event) => {
            syncPhotoState();
            const total = activeCards().length;
            if (total < 1 || total > maxPhotos) {
                event.preventDefault();
                input.reportValidity();
            }
        });

        window.addEventListener("beforeunload", clearPreviewUrls);
        syncPhotoState();
    });
})();
