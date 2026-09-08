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
        const attachmentInput = form?.querySelector("[data-attachment-input]");
        const attachmentPicker = form?.querySelector("[data-attachment-picker]");
        const attachmentAdd = form?.querySelector("[data-attachment-add]");
        const attachmentSummary = form?.querySelector("[data-attachment-selection]");
        const attachmentError = form?.querySelector("[data-attachment-error]");
        const selectedPdfList = form?.querySelector("[data-selected-pdf-list]");

        if (!form || !input || !gallery || !orderInputs || !count || !error || !undo) return;

        const maxPhotos = Number.parseInt(gallery.dataset.maxPhotos || "100", 10);
        const maxPhotoBytes = 5 * 1024 * 1024;
        const maxAttachmentFiles = 100;
        const maxAttachmentBytes = 25 * 1024 * 1024;
        const maxAllAttachmentBytes = 250 * 1024 * 1024;
        const newEntries = new Map();
        const stagedAttachmentFiles = new Map();
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

        function selectedAttachmentFiles() {
            return Array.from(stagedAttachmentFiles.values());
        }

        function formatMegabytes(bytes) {
            return (bytes / 1024 / 1024).toFixed(2);
        }

        function retainedAttachments() {
            return Array.from(form.querySelectorAll("[data-existing-attachment]"))
                .filter((item) => !item.querySelector("[data-remove-attachment-checkbox]")?.checked);
        }

        function syncAttachmentInput() {
            if (!attachmentInput) return;
            const transfer = new DataTransfer();
            selectedAttachmentFiles().forEach((file) => transfer.items.add(file));
            attachmentInput.files = transfer.files;
        }

        function createSelectedPdfItem(file) {
            const item = document.createElement("li");
            item.className = "selected-pdf-item";

            const icon = document.createElement("span");
            icon.className = "pdf-file-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = "PDF";

            const details = document.createElement("span");
            details.className = "pdf-file-details";
            const name = document.createElement("strong");
            name.textContent = file.name;
            const status = document.createElement("small");
            status.textContent = `${formatMegabytes(file.size)} MB · Ready to upload to this News Card`;
            details.append(name, status);

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "cms-button cms-button-danger cms-button-small";
            remove.textContent = "Delete PDF";
            remove.setAttribute("aria-label", `Delete ${file.name} from the upload list`);
            remove.addEventListener("click", () => {
                stagedAttachmentFiles.delete(fileKey(file));
                syncAttachments();
                showAttachmentError("");
            });

            item.append(icon, details, remove);
            return item;
        }

        function showAttachmentError(message) {
            if (!attachmentError) return;
            attachmentError.textContent = message;
            attachmentError.hidden = !message;
        }

        function syncAttachments() {
            const files = selectedAttachmentFiles();
            const retained = retainedAttachments();
            const totalBytes = retained.reduce(
                (sum, item) => sum + Number.parseInt(item.dataset.attachmentSize || "0", 10),
                files.reduce((sum, file) => sum + file.size, 0)
            );

            syncAttachmentInput();
            if (selectedPdfList) {
                selectedPdfList.replaceChildren(...files.map(createSelectedPdfItem));
                selectedPdfList.hidden = files.length === 0;
            }
            if (attachmentSummary) {
                attachmentSummary.textContent = files.length
                    ? `${files.length} new PDF(s) ready; ${retained.length + files.length} total PDF(s), ${formatMegabytes(totalBytes)} MB.`
                    : `No new PDFs added; ${retained.length} saved PDF(s) kept.`;
            }
        }

        function validateAttachments() {
            if (!attachmentSummary || !attachmentError) return true;
            const files = selectedAttachmentFiles();
            const retained = retainedAttachments();
            const totalCount = retained.length + files.length;
            const totalBytes = retained.reduce(
                (sum, item) => sum + Number.parseInt(item.dataset.attachmentSize || "0", 10),
                files.reduce((sum, file) => sum + file.size, 0)
            );
            const problems = [];

            if (totalCount > maxAttachmentFiles) {
                problems.push("Keep no more than 100 PDF files.");
            }
            if (totalBytes > maxAllAttachmentBytes) {
                problems.push("All PDFs together must be no larger than 250 MB.");
            }
            if (attachmentPicker?.files?.length && !attachmentAdd?.disabled) {
                problems.push("Click Upload PDFs to add the selected files before saving.");
            }
            files.forEach((file) => {
                if (file.size > maxAttachmentBytes) {
                    problems.push(file.name + " is larger than 25 MB.");
                }
                if (!file.name.toLowerCase().endsWith(".pdf") ||
                    (file.type && file.type.toLowerCase() !== "application/pdf")) {
                    problems.push(file.name + " is not a PDF file.");
                }
            });

            const megabytes = totalBytes / 1024 / 1024;
            attachmentSummary.textContent = files.length
                ? files.length + " new PDF(s) ready; " + totalCount + " total PDF(s), " + megabytes.toFixed(2) + " MB."
                : "No new PDFs added; " + retained.length + " saved PDF(s) kept.";
            showAttachmentError(problems.join(" "));
            return problems.length === 0;
        }

        if (attachmentPicker && attachmentAdd) {
            attachmentPicker.addEventListener("change", () => {
                attachmentAdd.disabled = !attachmentPicker.files?.length;
                showAttachmentError("");
            });

            attachmentAdd.addEventListener("click", () => {
                const incomingFiles = Array.from(attachmentPicker.files || []);
                const knownFiles = new Set(stagedAttachmentFiles.keys());
                const retained = retainedAttachments();
                let totalCount = retained.length + stagedAttachmentFiles.size;
                let totalBytes = retained.reduce(
                    (sum, item) => sum + Number.parseInt(item.dataset.attachmentSize || "0", 10),
                    selectedAttachmentFiles().reduce((sum, file) => sum + file.size, 0)
                );
                const rejected = [];

                incomingFiles.forEach((file) => {
                    const key = fileKey(file);
                    if (knownFiles.has(key)) {
                        rejected.push(`${file.name} is already in the upload list.`);
                        return;
                    }
                    if (!file.name.toLowerCase().endsWith(".pdf") ||
                        (file.type && file.type.toLowerCase() !== "application/pdf")) {
                        rejected.push(`${file.name} is not a PDF file.`);
                        return;
                    }
                    if (file.size > maxAttachmentBytes) {
                        rejected.push(`${file.name} is larger than 25 MB.`);
                        return;
                    }
                    if (totalCount >= maxAttachmentFiles) {
                        rejected.push("Only 100 PDFs can be kept on one News Card.");
                        return;
                    }
                    if (totalBytes + file.size > maxAllAttachmentBytes) {
                        rejected.push("All PDFs together must be no larger than 250 MB.");
                        return;
                    }

                    stagedAttachmentFiles.set(key, file);
                    knownFiles.add(key);
                    totalCount += 1;
                    totalBytes += file.size;
                });

                // Keep the merged FileList on the visible, named form field. This makes
                // every accepted batch part of the same eventual News Card submission.
                syncAttachments();
                attachmentAdd.disabled = true;
                showAttachmentError(rejected.join(" "));
            });
        }

        form.querySelectorAll("[data-existing-attachment]").forEach((item) => {
            const checkbox = item.querySelector("[data-remove-attachment-checkbox]");
            const button = item.querySelector("[data-remove-existing-attachment]");
            if (!checkbox || !button) return;

            const updateRemovalState = () => {
                item.classList.toggle("is-removed", checkbox.checked);
                button.textContent = checkbox.checked ? "Undo delete" : "Delete PDF";
                button.setAttribute("aria-pressed", checkbox.checked ? "true" : "false");
                syncAttachments();
                validateAttachments();
            };
            button.addEventListener("click", () => {
                checkbox.checked = !checkbox.checked;
                updateRemovalState();
            });
            updateRemovalState();
        });

        form.addEventListener("submit", (event) => {
            syncPhotoState();
            const total = activeCards().length;
            if (total < 1 || total > maxPhotos) {
                event.preventDefault();
                input.reportValidity();
            }
            if (!validateAttachments()) {
                event.preventDefault();
            }
        });

        window.addEventListener("beforeunload", clearPreviewUrls);
        syncPhotoState();
        syncAttachments();
        validateAttachments();
    });
})();
