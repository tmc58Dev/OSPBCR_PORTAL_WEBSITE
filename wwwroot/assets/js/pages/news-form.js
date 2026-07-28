(() => {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const form = document.querySelector(".cms-form");
        const input = form?.querySelector('input[type="file"][name="Photos"]');
        const gallery = form?.querySelector("[data-photo-gallery]");
        const count = form?.querySelector("[data-photo-count]");
        const error = form?.querySelector("[data-photo-error]");
        const undo = form?.querySelector("[data-photo-undo]");

        if (!form || !input || !gallery || !count || !error || !undo) {
            return;
        }

        const maxPhotos = Number.parseInt(gallery.dataset.maxPhotos || "100", 10);
        const maxPhotoBytes = 5 * 1024 * 1024;
        const selectedFiles = [];
        const previewUrls = [];
        const removalHistory = [];
        const existingCards = Array.from(gallery.querySelectorAll("[data-existing-photo]"));

        function fileKey(file) {
            return `${file.name}:${file.size}:${file.lastModified}`;
        }

        function isValidWebp(file) {
            return file.name.toLowerCase().endsWith(".webp") && file.type.toLowerCase() === "image/webp";
        }

        function activeExistingCount() {
            return existingCards.filter((card) => {
                const checkbox = card.querySelector("[data-remove-photo-checkbox]");
                return checkbox && !checkbox.checked;
            }).length;
        }

        function totalPhotoCount() {
            return activeExistingCount() + selectedFiles.length;
        }

        function showError(message) {
            error.textContent = message;
            error.hidden = !message;
        }

        function updateStatus() {
            const total = totalPhotoCount();
            count.textContent = `${total} of ${maxPhotos} photos selected`;
            count.classList.toggle("is-limit", total === maxPhotos);
            input.setCustomValidity(total > 0 ? "" : "Add at least one WebP photo.");
            undo.hidden = removalHistory.length === 0;
        }

        function syncFileInput() {
            const transfer = new DataTransfer();
            selectedFiles.forEach((file) => transfer.items.add(file));
            input.files = transfer.files;
        }

        function clearPreviewUrls() {
            previewUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
        }

        function renderSelectedFiles() {
            gallery.querySelectorAll("[data-new-photo]").forEach((card) => card.remove());
            clearPreviewUrls();

            selectedFiles.forEach((file, index) => {
                const url = URL.createObjectURL(file);
                previewUrls.push(url);

                const card = document.createElement("article");
                card.className = "existing-photo-item is-new-photo";
                card.dataset.newPhoto = "";

                const image = document.createElement("img");
                image.src = url;
                image.alt = `New photo preview: ${file.name}`;

                const actions = document.createElement("div");
                actions.className = "photo-preview-actions";

                const label = document.createElement("span");
                label.textContent = file.name;
                label.title = file.name;

                const remove = document.createElement("button");
                remove.type = "button";
                remove.textContent = "Remove";
                remove.addEventListener("click", () => {
                    const removedFile = selectedFiles[index];
                    removalHistory.push({ type: "new", file: removedFile, index });
                    selectedFiles.splice(index, 1);
                    syncFileInput();
                    renderSelectedFiles();
                    updateStatus();
                    showError("");
                });

                actions.append(label, remove);
                card.append(image, actions);
                gallery.appendChild(card);
            });
        }

        existingCards.forEach((card) => {
            const checkbox = card.querySelector("[data-remove-photo-checkbox]");
            const remove = card.querySelector("[data-remove-existing-photo]");
            if (!checkbox || !remove) {
                return;
            }

            if (checkbox.checked) {
                card.classList.add("is-removed");
                removalHistory.push({ type: "existing", card });
            }

            remove.addEventListener("click", () => {
                checkbox.checked = true;
                card.classList.add("is-removed");
                removalHistory.push({ type: "existing", card });
                updateStatus();
                showError("");
            });
        });

        input.addEventListener("change", () => {
            const incomingFiles = Array.from(input.files || []);
            const knownFiles = new Set(selectedFiles.map(fileKey));
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
                if (knownFiles.has(fileKey(file))) {
                    continue;
                }
                if (totalPhotoCount() >= maxPhotos) {
                    rejected.push(`Only ${maxPhotos} photos can be added to one News Card.`);
                    break;
                }
                selectedFiles.push(file);
                knownFiles.add(fileKey(file));
            }

            syncFileInput();
            renderSelectedFiles();
            updateStatus();
            showError(rejected.join(" "));
        });

        undo.addEventListener("click", () => {
            const lastRemoval = removalHistory.pop();
            if (!lastRemoval) {
                return;
            }
            if (totalPhotoCount() >= maxPhotos) {
                removalHistory.push(lastRemoval);
                showError(`Remove another photo before restoring this one. The limit is ${maxPhotos}.`);
                updateStatus();
                return;
            }

            if (lastRemoval.type === "existing") {
                const checkbox = lastRemoval.card.querySelector("[data-remove-photo-checkbox]");
                if (checkbox) {
                    checkbox.checked = false;
                    lastRemoval.card.classList.remove("is-removed");
                }
            } else if (lastRemoval.type === "new") {
                selectedFiles.splice(
                    Math.min(lastRemoval.index, selectedFiles.length),
                    0,
                    lastRemoval.file
                );
                syncFileInput();
                renderSelectedFiles();
            }

            updateStatus();
            showError("");
        });

        form.addEventListener("submit", (event) => {
            updateStatus();
            if (totalPhotoCount() < 1 || totalPhotoCount() > maxPhotos) {
                event.preventDefault();
                input.reportValidity();
            }
        });

        window.addEventListener("beforeunload", clearPreviewUrls);
        updateStatus();
    });
})();
