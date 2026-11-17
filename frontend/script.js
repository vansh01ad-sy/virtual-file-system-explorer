
const API = "http://localhost:3000/api";
const dialogError = document.getElementById("dialogError");
const homeButton = document.getElementById("homeButton");
const recycleBinButton = document.getElementById("recycleBinButton");
const breadcrumbHomeButton =
    document.getElementById("breadcrumbHomeButton");
const backButton = document.getElementById("backButton");
const forwardButton = document.getElementById("forwardButton");

const newFolderButton = document.getElementById("newFolderButton");
const newFileButton = document.getElementById("newFileButton");


const createDialog = document.getElementById("createDialog");
const createForm = document.getElementById("createForm");
const dialogTitle = document.getElementById("dialogTitle");
const itemName = document.getElementById("itemName");

const closeDialogButton = document.getElementById("closeDialogButton");
const cancelButton = document.getElementById("cancelButton");

const fileArea = document.getElementById("fileArea");
const statusMessage = document.getElementById("statusMessage");
const selectionActions =
    document.getElementById("selectionActions");
const cutSelectedButton = document.getElementById("cutSelectedButton");
const copySelectedButton = document.getElementById("copySelectedButton");
const pasteSelectedButton = document.getElementById("pasteSelectedButton");
const renameSelectedButton = document.getElementById("renameSelectedButton");
const deleteSelectedButton = document.getElementById("deleteSelectedButton");
const cancelClipboardToolbarButton = document.getElementById("cancelClipboardToolbarButton");
const restoreSelectedButton =
    document.getElementById("restoreSelectedButton");

const permanentDeleteSelectedButton =
    document.getElementById("permanentDeleteSelectedButton");
const gridViewButton = document.getElementById("gridViewButton");
const listViewButton = document.getElementById("listViewButton");
const sortDropdown = document.getElementById("sortDropdown");

// Entire filesystem search dialog
const filesystemSearchDialog =
    document.getElementById("filesystemSearchDialog");

const globalSearchResults =
    document.getElementById("globalSearchResults");

const globalSearchCount =
    document.getElementById("globalSearchCount");

const closeSearchDialog =
    document.getElementById("closeSearchDialog");

// Virtual Disk DOM elements
const diskUsageFill = document.getElementById("diskUsageFill");
const diskUsedText = document.getElementById("diskUsedText");
const diskTotalText = document.getElementById("diskTotalText");
const diskBlocksText = document.getElementById("diskBlocksText");
const diskPercentText = document.getElementById("diskPercentText");

const fileSizeGroup = document.getElementById("fileSizeGroup");
const itemSize = document.getElementById("itemSize");
const fileSizeHint = document.getElementById("fileSizeHint");
const propertiesSelectedButton = document.getElementById("propertiesSelectedButton");

const storagePropertiesDialog = document.getElementById("storagePropertiesDialog");
const closeStorageDialogButton = document.getElementById("closeStorageDialogButton");
const propItemName = document.getElementById("propItemName");
const propItemType = document.getElementById("propItemType");
const propItemSize = document.getElementById("propItemSize");
const propItemBlocks = document.getElementById("propItemBlocks");
const propResizeRow = document.getElementById("propResizeRow");
const propNewSizeInput = document.getElementById("propNewSizeInput");
const applyResizeButton = document.getElementById("applyResizeButton");
const propResizeError = document.getElementById("propResizeError");
const propBlockList = document.getElementById("propBlockList");
let currentInspectedItem = null;

function formatBytes(bytes) {
    if (bytes === 0 || bytes === undefined || bytes === null) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1) + " " + sizes[i];
}

async function loadDiskStatus() {
    try {
        const disk = await apiRequest("/disk");
        if (!disk) return;

        const usedFormatted = formatBytes(disk.usedBytes);
        const totalFormatted = formatBytes(disk.totalBytes);

        if (diskUsedText) diskUsedText.textContent = usedFormatted;
        if (diskTotalText) diskTotalText.textContent = totalFormatted;
        if (diskBlocksText) diskBlocksText.textContent = `${disk.allocatedBlocks.toLocaleString()} / ${disk.totalBlocks.toLocaleString()} blocks`;
        if (diskPercentText) diskPercentText.textContent = `${disk.utilization}%`;
        if (diskUsageFill) diskUsageFill.style.width = `${Math.min(100, Number(disk.utilization))}%`;
    } catch (err) {
        console.error("Failed to load disk status:", err);
    }
}


let selectedItemType = "folder";
let viewingRecycleBin = false;
let clipboardState = {
    mode: "NONE",
    name: null,
    path: null
};
let currentFolderPath = "/";

// Send a request to the Node.js API
function setView(view) {
    const isGrid = view === "grid";

    fileArea.classList.toggle("grid-view", isGrid);
    fileArea.classList.toggle("list-view", !isGrid);

    gridViewButton.classList.toggle("active", isGrid);
    listViewButton.classList.toggle("active", !isGrid);

    gridViewButton.setAttribute("aria-pressed", String(isGrid));
    listViewButton.setAttribute("aria-pressed", String(!isGrid));
}

gridViewButton.addEventListener("click", () => setView("grid"));
listViewButton.addEventListener("click", () => setView("list"));
async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API}${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Request failed.");
    }

    return data;
}

// Get the current path
async function loadPath() {
    const data = await apiRequest("/path");
    return data.path;
}

// Get current folder contents
async function loadItems() {
    return await apiRequest("/items");
}
// Change filesystem sorting mode
async function changeSortMode(mode) {
    try {
        await apiRequest("/sort", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ mode: Number(mode) })
        });
        localStorage.setItem("nodeVaultSortMode", String(mode));
        await refreshFileSystem();

        statusMessage.textContent = "Sorting updated successfully.";
    } catch (error) {
        statusMessage.textContent =
            `Sorting error: ${error.message}`;
    }
}
async function loadRecycleBin() {
    return await apiRequest("/recycle-bin");
}
// Get clipboard status from the C core.
async function updateClipboardUI() {
    try {
        const clipboard = await apiRequest("/clipboard");
        clipboardState = clipboard;

        const hasItem = clipboard.mode !== "NONE";

        // Show or hide the new cancel button
        cancelClipboardToolbarButton.disabled = !hasItem;

        // Update Paste and other selection actions
        updateSelectionActions();

    } catch (error) {
        console.error("Clipboard status error:", error);
    }
}
function updateSelectionActions() {
    const selectedItem = fileArea.querySelector(".file-item.is-selected");
    const hasSelection = !!selectedItem;

    if (propertiesSelectedButton) {
        propertiesSelectedButton.disabled = !hasSelection;
    }

    // Home toolbar buttons
    cutSelectedButton.disabled = !hasSelection || viewingRecycleBin;
    copySelectedButton.disabled = !hasSelection || viewingRecycleBin;
    renameSelectedButton.disabled = !hasSelection || viewingRecycleBin;
    deleteSelectedButton.disabled = !hasSelection || viewingRecycleBin;

    pasteSelectedButton.disabled =
        clipboardState.mode === "NONE" || viewingRecycleBin;

    cancelClipboardToolbarButton.disabled =
        clipboardState.mode === "NONE" || viewingRecycleBin;

    // Recycle Bin toolbar buttons
    restoreSelectedButton.disabled = !hasSelection || !viewingRecycleBin;
    permanentDeleteSelectedButton.disabled =
        !hasSelection || !viewingRecycleBin;
}
async function refreshCurrentView() {
    if (viewingRecycleBin) {
        const items = await loadRecycleBin();

        renderItems(items);

        document.getElementById("currentPath").textContent = "Recycle Bin";
        document.querySelector(".directory-heading h2").textContent =
            "Recycle Bin";

        document.getElementById("itemCount").textContent =
            `${items.length} ${items.length === 1 ? "item" : "items"}`;
    } else {
        await refreshFileSystem();

        document.querySelector(".directory-heading h2").textContent =
            "All Items";
    }

    await loadDiskStatus();
}

// Render folder and file icons
function renderItems(items) {
    fileArea.replaceChildren();
    // Clicking empty space deselects all items
fileArea.addEventListener("click", (event) => {
    if (event.target === fileArea) {
        fileArea.querySelectorAll(".file-item").forEach((element) => {
            element.classList.remove("is-selected", "search-result-selected");
        });
        updateSelectionActions();
    }
});
    if (items.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "empty-message";
        emptyMessage.textContent = viewingRecycleBin
            ? "Your Recycle Bin is empty."
            : "This folder is empty.";

        fileArea.appendChild(emptyMessage);
        updateSelectionActions();
        return;
    }

    items.forEach((item) => {
        const itemElement = document.createElement("div");
        itemElement.className = "file-item";
        // Single-click to select an item
// Single-click to select an item
// Single-click to select an item
itemElement.addEventListener("click", () => {
    fileArea.querySelectorAll(".file-item").forEach((element) => {
        element.classList.remove("is-selected");
    });

    itemElement.classList.add("is-selected");

    updateSelectionActions();
});;
        const itemPath =
    `${currentFolderPath === "/" ? "" : currentFolderPath}/${item.name}`;

if (
    !viewingRecycleBin &&
    clipboardState.mode === "MOVE" &&
    clipboardState.path === itemPath
) {
    itemElement.classList.add("cut-item");
}
        

        const icon = document.createElement("span");
icon.className = `file-item-icon ${item.type}`;

if (item.type === "folder") {
    icon.innerHTML = `
        <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M4 10a4 4 0 0 1 4-4h12l5 6h15a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"
                  fill="#DCA43A"/>
            <path d="M4 17a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v21a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"
                  fill="#F7D477"/>
            <path d="M4 23h40v15a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"
                  fill="#EFC052"/>
        </svg>`;
} else {
    icon.innerHTML = `
        <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M10 3h19l11 11v29a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z"
                  fill="#FFFFFF" stroke="#A6B4C5" stroke-width="1.5"/>
            <path d="M29 3v11h11" fill="#D7E4F4"/>
            <path d="M29 3l11 11H32a3 3 0 0 1-3-3z"
                  fill="#B8CDE7"/>
            <path d="M14 25h18M14 31h18M14 37h13"
                  stroke="#6698D0" stroke-width="2"
                  stroke-linecap="round"/>
        </svg>`;
}

        
const name = document.createElement("span");
name.className = "file-item-name";

const query = searchInput.value.trim();

if (query && searchScope.value === "CURRENT") {
    const index = item.name.toLowerCase().indexOf(query.toLowerCase());

    if (index !== -1) {
        name.append(
            document.createTextNode(item.name.slice(0, index))
        );

        const highlight = document.createElement("mark");
        highlight.className = "search-highlight";
        highlight.textContent = item.name.slice(index, index + query.length);

        name.append(highlight);

        name.append(
            document.createTextNode(item.name.slice(index + query.length))
        );
    } else {
        name.textContent = item.name;
    }
} else {
    name.textContent = item.name;
}


        itemElement.append(icon, name);

        const actions = document.createElement("div");
actions.className = "file-item-actions";

const menuButton = document.createElement("button");
menuButton.type = "button";
menuButton.className = "more-actions-button";
menuButton.textContent = "⋮";
menuButton.setAttribute("aria-label", `Actions for ${item.name}`);
menuButton.setAttribute("aria-expanded", "false");

const menu = document.createElement("div");
menu.className = "item-actions-menu";
menu.hidden = true;

menuButton.addEventListener("click", (event) => {
    event.stopPropagation();

    const willOpen = menu.hidden;

    // Close every other open menu
    document.querySelectorAll(".item-actions-menu").forEach((otherMenu) => {
        otherMenu.hidden = true;

        const otherButton = otherMenu.previousElementSibling;
        if (otherButton) {
            otherButton.setAttribute("aria-expanded", "false");
        }
    });

    // Toggle the menu we clicked
    menu.hidden = !willOpen;
    menuButton.setAttribute("aria-expanded", String(willOpen));
});

const actionButton = (label, handler) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-action";
    button.textContent = label;

    button.addEventListener("click", async (event) => {
        event.stopPropagation();
        menu.hidden = true;
        menuButton.setAttribute("aria-expanded", "false");
        await handler();
    });

    menu.appendChild(button);
};

actions.append(menuButton, menu);

        if (viewingRecycleBin) {
            actionButton("Restore", async () => {
                try {
                    await apiRequest("/restore", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: item.name })
                    });

                    await refreshCurrentView();
                    statusMessage.textContent = `Restored: ${item.name}`;
                } catch (error) {
                    statusMessage.textContent = `Error: ${error.message}`;
                }
            });
            
            actionButton("Delete Permanently", async () => {
                if (!confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) {
                    return;
                }

                try {
                    await apiRequest("/permanent-delete", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: item.name })
                    });

                    await refreshCurrentView();
                    statusMessage.textContent =
                        `Permanently deleted: ${item.name}`;
                } catch (error) {
                    statusMessage.textContent = `Error: ${error.message}`;
                }
            });
        } else {
            if (item.type === "folder") {
                actionButton("Open", async () => {
    try {
        await apiRequest("/open", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: item.name })
        });

        await refreshFileSystem();
        statusMessage.textContent = `Opened ${item.name}`;
    } catch (error) {
        statusMessage.textContent = `Error: ${error.message}`;
    }
});
                itemElement.addEventListener("dblclick", async () => {
                    try {
                        await apiRequest("/open", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name: item.name })
                        });
               
                        await refreshFileSystem();
                        statusMessage.textContent = `Opened ${item.name}`;
                    } catch (error) {
                        statusMessage.textContent = `Error: ${error.message}`;
                    }
                });
            }
            actionButton("Copy", async () => {
    try {
        await apiRequest("/copy", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: item.name })
        });

        await updateClipboardUI();
        statusMessage.textContent = `${item.name} copied.`;
    } catch (error) {
        statusMessage.textContent = error.message;
    }
});

actionButton("Cut", async () => {
    try {
        await apiRequest("/cut", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: item.name })
        });

        await updateClipboardUI();
await refreshCurrentView();

statusMessage.textContent = `${item.name} ready to move.`;
    } catch (error) {
        statusMessage.textContent = error.message;
    }
});
            actionButton("Rename", async () => {
            const newName = prompt(
                "Enter the new name:",
                item.name
            );

            if (newName === null) return;

            const trimmedName = newName.trim();

            if (!trimmedName) {
                statusMessage.textContent =
                    "Name cannot be empty.";
                return;
            }

            if (trimmedName === item.name) {
                statusMessage.textContent =
                    "Name unchanged.";
                return;
            }

            try {
                await apiRequest("/rename", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        oldName: item.name,
                        newName: trimmedName
                    })
                });

                await refreshCurrentView();

                statusMessage.textContent =
                    `Renamed "${item.name}" to "${trimmedName}".`;
            } catch (error) {
                statusMessage.textContent =
                    `Error: ${error.message}`;
            }
        });
            actionButton("Delete", async () => {
                if (!confirm(`Move "${item.name}" to the Recycle Bin?`)) {
                    return;
                }

                try {
                    await apiRequest("/delete", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: item.name })
                    });

                    await refreshCurrentView();
                    statusMessage.textContent = `Moved to Recycle Bin: ${item.name}`;
                } catch (error) {
                    statusMessage.textContent = `Error: ${error.message}`;
                }
            });
        }

        actionButton("Storage Info", () => {
            showStorageProperties(item.name, item.type);
        });

        if (item.type === "file" && item.size !== undefined) {
            const sizeEl = document.createElement("span");
            sizeEl.className = "file-item-size";
            sizeEl.textContent = formatBytes(item.size);
            itemElement.appendChild(sizeEl);
        }

        itemElement.appendChild(actions);
        fileArea.appendChild(itemElement);
    });
    updateSelectionActions();
}
// Refresh path, items, and item count
async function refreshFileSystem() {
    const [path, items] = await Promise.all([
        loadPath(),
        loadItems()
    ]);
    currentFolderPath = path;
    renderItems(items);

    // Remove leading slashes for a cleaner breadcrumb.
    const pathDisplay = document.getElementById("currentPath");

    if (pathDisplay) {
        const cleanPath = path.replace(/^\/+/, "");
        pathDisplay.textContent = cleanPath || "Home";
    }

    const itemCount = document.getElementById("itemCount");

    if (itemCount) {
        itemCount.textContent =
            `${items.length} ${items.length === 1 ? "item" : "items"}`;
    }

    await loadDiskStatus();
}

function getAutoExtensionInfo(name) {
    const ext = name.includes(".") ? "." + name.split(".").pop().toLowerCase() : "";
    switch (ext) {
        case ".mp4":
        case ".mkv":
        case ".avi":
            return "Auto: 2 MB (512 blocks)";
        case ".mp3":
        case ".wav":
        case ".flac":
            return "Auto: ~1.2 MB (308 blocks)";
        case ".exe":
        case ".msi":
        case ".iso":
            return "Auto: ~1.5 MB (384 blocks)";
        case ".zip":
        case ".rar":
        case ".7z":
        case ".tar":
        case ".gz":
            return "Auto: 800 KB (200 blocks)";
        case ".jpg":
        case ".jpeg":
        case ".png":
        case ".gif":
        case ".webp":
            return "Auto: 350 KB (88 blocks)";
        case ".pdf":
            return "Auto: 96 KB (24 blocks)";
        case ".docx":
        case ".xlsx":
        case ".pptx":
            return "Auto: 48 KB (12 blocks)";
        case ".c":
        case ".h":
        case ".cpp":
        case ".java":
        case ".py":
        case ".js":
        case ".jsx":
        case ".ts":
        case ".html":
        case ".css":
        case ".json":
            return "Auto: 8 KB (2 blocks)";
        case ".txt":
        case ".md":
        case ".log":
        case ".csv":
        case ".dat":
            return "Auto: 4 KB (1 block)";
        default:
            return "Auto: 4 KB (1 block)";
    }
}

// Open create dialog
function openCreateDialog(type) {
    selectedItemType = type;

    dialogTitle.textContent =
        type === "folder" ? "Create Folder" : "Create File";

    itemName.placeholder =
        type === "folder" ? "Enter folder name" : "Enter file name (e.g. notes.pdf)";

    if (fileSizeGroup) {
        fileSizeGroup.hidden = type !== "file";
        if (itemSize) itemSize.value = "";
        if (fileSizeHint) {
            fileSizeHint.textContent = "Auto-assigned based on extension (e.g. .pdf → 96 KB, .mp3 → 1.2 MB)";
        }
    }

    itemName.value = "";
    if (dialogError) {
        dialogError.hidden = true;
        dialogError.textContent = "";
    }
    createDialog.showModal();
    itemName.focus();
}

itemName?.addEventListener("input", () => {
    if (selectedItemType === "file" && fileSizeHint) {
        const val = itemName.value.trim();
        if (val) {
            fileSizeHint.textContent = getAutoExtensionInfo(val);
        } else {
            fileSizeHint.textContent = "Auto-assigned based on extension (e.g. .pdf → 96 KB, .mp3 → 1.2 MB)";
        }
    }
});

newFolderButton?.addEventListener("click", () => {
    openCreateDialog("folder");
});

newFileButton?.addEventListener("click", () => {
    openCreateDialog("file");
});
function getSelectedItemName() {
    const selectedItem = fileArea.querySelector(".file-item.is-selected");

    if (!selectedItem) return null;

    return selectedItem.querySelector(".file-item-name")?.textContent.trim() || null;
}
// Cut selected item
cutSelectedButton.addEventListener("click", async () => {
    const name = getSelectedItemName();
    if (!name) return;

    try {
        await apiRequest("/cut", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });

        await updateClipboardUI();
        await refreshCurrentView();

        statusMessage.textContent = `${name} ready to move.`;
    } catch (error) {
        statusMessage.textContent = error.message;
    }
});

// Copy selected item
copySelectedButton.addEventListener("click", async () => {
    const name = getSelectedItemName();
    if (!name) return;

    try {
        await apiRequest("/copy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });

        await updateClipboardUI();

        statusMessage.textContent = `${name} copied.`;
    } catch (error) {
        statusMessage.textContent = error.message;
    }
});

// Paste clipboard item
pasteSelectedButton.addEventListener("click", async () => {
    if (clipboardState.mode === "NONE") return;

    try {
        await apiRequest("/paste", { method: "POST" });

        await updateClipboardUI();
        await refreshCurrentView();

        statusMessage.textContent = "Item pasted successfully.";
    } catch (error) {
        statusMessage.textContent = error.message;
    }
});

// Rename selected item
renameSelectedButton.addEventListener("click", async () => {
    const oldName = getSelectedItemName();
    if (!oldName) return;

    const newName = prompt("Enter the new name:", oldName);
    if (newName === null) return;

    const trimmedName = newName.trim();

    if (!trimmedName) {
        statusMessage.textContent = "Name cannot be empty.";
        return;
    }

    if (trimmedName === oldName) return;

    try {
        await apiRequest("/rename", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                oldName,
                newName: trimmedName
            })
        });

        await refreshCurrentView();

        statusMessage.textContent =
            `Renamed "${oldName}" to "${trimmedName}".`;
    } catch (error) {
        statusMessage.textContent = error.message;
    }
});

// Delete selected item
deleteSelectedButton.addEventListener("click", async () => {
    const name = getSelectedItemName();
    if (!name) return;

    if (!confirm(`Move "${name}" to the Recycle Bin?`)) return;

    try {
        await apiRequest("/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });

        await refreshCurrentView();

        statusMessage.textContent = `Moved to Recycle Bin: ${name}`;
    } catch (error) {
        statusMessage.textContent = error.message;
    }
});
// Restore selected item from Recycle Bin
restoreSelectedButton.addEventListener("click", async () => {
    const name = getSelectedItemName();
    if (!name) return;

    try {
        await apiRequest("/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });

        await refreshCurrentView();

        statusMessage.textContent = `Restored: ${name}`;
    } catch (error) {
        statusMessage.textContent = error.message;
    }
});
// Permanently delete selected item from Recycle Bin
permanentDeleteSelectedButton.addEventListener("click", async () => {
    const name = getSelectedItemName();
    if (!name) return;

    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) {
        return;
    }

    try {
        await apiRequest("/permanent-delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });

        await refreshCurrentView();
        statusMessage.textContent = `Permanently deleted: ${name}`;
    } catch (error) {
        statusMessage.textContent = error.message;
    }
});



// Cancel the current clipboard operation
cancelClipboardToolbarButton.addEventListener("click", async () => {
    try {
        await apiRequest("/cancel-clipboard", { method: "POST" });

        await updateClipboardUI();
        await refreshCurrentView();

        statusMessage.textContent = "Clipboard operation cancelled.";
    } catch (error) {
        statusMessage.textContent = error.message;
    }
});
// Close dialog buttons
closeDialogButton?.addEventListener("click", () => {
    createDialog.close();
});

cancelButton?.addEventListener("click", () => {
    createDialog.close();
});

// Create folder or file
createForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = itemName.value.trim();

    if (!name) {
        statusMessage.textContent = "Please enter a name.";
        return;
    }

    const endpoint =
        selectedItemType === "folder" ? "/folders" : "/files";

    const payload = { name };
    if (selectedItemType === "file" && itemSize && itemSize.value.trim() !== "") {
        payload.size = Number(itemSize.value);
    }

    try {
        statusMessage.textContent = "Creating...";

        await apiRequest(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        createDialog.close();
        await refreshFileSystem();

        statusMessage.textContent =
            `${selectedItemType === "folder" ? "Folder" : "File"} created: ${name}`;
    } catch (error) {
    dialogError.textContent = error.message;
    dialogError.hidden = false;
    itemName.focus();
}
});
// Navigate to filesystem root (Home)
async function navigateHome() {
    try {
        viewingRecycleBin = false;
        updateSidebar();

        // Clear active search
        searchInput.value = "";
        clearSearchButton.hidden = true;
        searchSuggestions.hidden = true;
        searchRequestId++;

        if (filesystemSearchDialog.open) {
            filesystemSearchDialog.close();
        }

        await apiRequest("/navigate-to", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ path: "/" })
        });

        await refreshFileSystem();

        document.querySelector(".directory-heading h2").textContent =
            "All Items";

        statusMessage.textContent = "Returned to Home.";
    } catch (error) {
        statusMessage.textContent = `Navigation error: ${error.message}`;
    }
}
// Back and Forward navigation
async function navigateHistory(direction) {
    try {
        statusMessage.textContent = "Navigating...";

        await apiRequest(`/${direction}`, {
            method: "POST"
        });

        await refreshFileSystem();
        statusMessage.textContent = "Ready to explore.";
    } catch (error) {
        statusMessage.textContent = `Error: ${error.message}`;
    }
}

backButton?.addEventListener("click", () => {
    navigateHistory("back");
});

forwardButton?.addEventListener("click", () => {
    navigateHistory("forward");
});
function updateSidebar() {
    homeButton.classList.toggle("active", !viewingRecycleBin);
    recycleBinButton.classList.toggle("active", viewingRecycleBin);

    newFolderButton.hidden = viewingRecycleBin;
    newFileButton.hidden = viewingRecycleBin;
    sortDropdown.classList.toggle("sort-disabled", viewingRecycleBin);
sortDropdown.setAttribute("aria-disabled", String(viewingRecycleBin));
    // Home toolbar actions
    cutSelectedButton.hidden = viewingRecycleBin;
    copySelectedButton.hidden = viewingRecycleBin;
    pasteSelectedButton.hidden = viewingRecycleBin;
    cancelClipboardToolbarButton.hidden = viewingRecycleBin;
    renameSelectedButton.hidden = viewingRecycleBin;
    deleteSelectedButton.hidden = viewingRecycleBin;

    // Recycle Bin toolbar actions
    restoreSelectedButton.hidden = !viewingRecycleBin;
    permanentDeleteSelectedButton.hidden = !viewingRecycleBin;

    updateSelectionActions();
}

homeButton.addEventListener("click", async () => {
    viewingRecycleBin = false;
    updateSidebar();

    try {
        await refreshCurrentView();
        statusMessage.textContent = "Ready to explore.";
    } catch (error) {
        statusMessage.textContent = `Error: ${error.message}`;
    }
});

breadcrumbHomeButton.addEventListener("click", navigateHome);

recycleBinButton.addEventListener("click", async () => {
    viewingRecycleBin = true;
    updateSidebar();

    try {
        await refreshCurrentView();
        statusMessage.textContent = "Viewing Recycle Bin.";
    } catch (error) {
        statusMessage.textContent = `Error: ${error.message}`;
    }
});
// Initial load
updateSidebar();
statusMessage.textContent = "Connecting to filesystem...";

refreshFileSystem()
    .then(() => {
        statusMessage.textContent = "Ready to explore.";
    })
    .catch((error) => {
        statusMessage.textContent =
            `Connection failed: ${error.message}`;
    });

document.addEventListener("click", (event) => {
    if (event.target.closest(".file-item-actions")) {
        return;
    }

    document.querySelectorAll(".item-actions-menu").forEach((menu) => {
        menu.hidden = true;

        const menuButton = menu.previousElementSibling;
        if (menuButton) {
            menuButton.setAttribute("aria-expanded", "false");
        }
    });
});


// Custom search dropdown functionality
function setupCustomDropdown(dropdownId, selectId) {
    const dropdown = document.getElementById(dropdownId);
    const trigger = dropdown.querySelector(".dropdown-trigger");
    const menu = dropdown.querySelector(".dropdown-menu");
    const label = dropdown.querySelector(".dropdown-label");
    const select = document.getElementById(selectId);
    const options = dropdown.querySelectorAll(".dropdown-option");

    // Open or close dropdown
    trigger.addEventListener("click", () => {
        const isOpen = dropdown.classList.contains("open");

        // Close other custom dropdowns
        document.querySelectorAll(".custom-dropdown").forEach((other) => {
            other.classList.remove("open");
            other.querySelector(".dropdown-menu").hidden = true;
            other.querySelector(".dropdown-trigger")
                .setAttribute("aria-expanded", "false");
        });

        if (!isOpen) {
            dropdown.classList.add("open");
            menu.hidden = false;
            trigger.setAttribute("aria-expanded", "true");
        }
    });

    // Select an option
    options.forEach((option) => {
        option.addEventListener("click", () => {
            const value = option.dataset.value;

            select.value = value;
            label.textContent = option.textContent.replace("✓", "").trim();

            options.forEach((item) => {
                item.classList.remove("active");
                item.querySelector(".option-check").textContent = "";
            });

            option.classList.add("active");
            option.querySelector(".option-check").textContent = "✓";

            // Notify JavaScript listeners about the change
            select.dispatchEvent(new Event("change", { bubbles: true }));

            menu.hidden = true;
            dropdown.classList.remove("open");
            trigger.setAttribute("aria-expanded", "false");
        });
    });
}

// Initialize both dropdowns
// Initialize all custom dropdowns
setupCustomDropdown("scopeDropdown", "searchScope");
setupCustomDropdown("modeDropdown", "searchMode");
setupCustomDropdown("sortDropdown", "sortMode");

// Apply sorting when the selected option changes
const sortMode = document.getElementById("sortMode");

// Restore previously selected sorting mode
const savedSortMode = localStorage.getItem("nodeVaultSortMode");

if (["1", "2", "3", "4"].includes(savedSortMode)) {
    sortMode.value = savedSortMode;

    const selectedOption = sortDropdown.querySelector(
        `.dropdown-option[data-value="${savedSortMode}"]`
    );

    if (selectedOption) {
        sortDropdown.querySelector(".dropdown-label").textContent =
            selectedOption.textContent.replace("✓", "").trim();

        sortDropdown.querySelectorAll(".dropdown-option").forEach(option => {
            option.classList.remove("active");
            option.querySelector(".option-check").textContent = "";
        });

        selectedOption.classList.add("active");
        selectedOption.querySelector(".option-check").textContent = "✓";
    }

    changeSortMode(savedSortMode);
}

sortMode.addEventListener("change", () => {
    changeSortMode(sortMode.value);
});

// Close dropdowns when clicking outside
document.addEventListener("click", (event) => {
    if (event.target.closest(".custom-dropdown")) {
        return;
    }

    document.querySelectorAll(".custom-dropdown").forEach((dropdown) => {
        dropdown.classList.remove("open");
        dropdown.querySelector(".dropdown-menu").hidden = true;
        dropdown.querySelector(".dropdown-trigger")
            .setAttribute("aria-expanded", "false");
    });
});

// Close dropdowns with Escape
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        document.querySelectorAll(".custom-dropdown").forEach((dropdown) => {
            dropdown.classList.remove("open");
            dropdown.querySelector(".dropdown-menu").hidden = true;
            dropdown.querySelector(".dropdown-trigger")
                .setAttribute("aria-expanded", "false");
        });
    }
});

// Search elements
const searchInput = document.getElementById("searchInput");
const searchScope = document.getElementById("searchScope");
const searchMode = document.getElementById("searchMode");
const searchSuggestions = document.getElementById("searchSuggestions");
const clearSearchButton = document.getElementById("clearSearchButton");

let searchRequestId = 0;

// Choose the correct backend search endpoint
function getSearchEndpoint(query) {
    const scope = searchScope.value;
    const mode = searchMode.value;

    const endpoint = mode === "PREFIX"
        ? "/search/prefix"
        : "/search";

    return `${endpoint}?q=${encodeURIComponent(query)}&scope=${scope}`;
}

// Fetch search results
async function performSearch(query) {
    return await apiRequest(getSearchEndpoint(query));
}

// Show autocomplete suggestions
function renderSearchSuggestions(results) {
    searchSuggestions.replaceChildren();

    if (results.length === 0) {
        const empty = document.createElement("div");
        empty.className = "suggestion-empty";
        empty.textContent = "No matching items found.";

        searchSuggestions.appendChild(empty);
    } else {
        results.slice(0, 6).forEach((item) => {
            const suggestion = document.createElement("button");
            suggestion.type = "button";
            suggestion.className = "search-suggestion";

            const name = document.createElement("span");
            name.textContent = item.name;

            const details = document.createElement("small");
            details.textContent = `${item.type} • ${item.path}`;

            suggestion.append(name, details);

            suggestion.addEventListener("click", () => {
                searchInput.value = item.name;
                searchSuggestions.hidden = true;
                showFullSearchResults(item.name);
            });

            searchSuggestions.appendChild(suggestion);
        });
    }

    searchSuggestions.hidden = false;
}


// Search while typing
searchInput.addEventListener("input", async () => {
    const query = searchInput.value.trim();
    clearSearchButton.hidden = query.length === 0;

    const requestId = ++searchRequestId;

    if (query.length === 0) {
        searchSuggestions.hidden = true;

        if (filesystemSearchDialog.open) {
    renderGlobalSearchResults([], "");
}
        await refreshCurrentView();

        document.querySelector(".directory-heading h2").textContent =
            viewingRecycleBin ? "Recycle Bin" : "All Items";

        return;
    }

    try {
        const results = await performSearch(query);

        if (requestId !== searchRequestId) return;

        // Current Folder: display results in the file area
        if (searchScope.value === "CURRENT") {
            searchSuggestions.hidden = true;

            document.querySelector(".directory-heading h2").textContent =
                "Search Results";

            document.getElementById("itemCount").textContent =
                `${results.length} ${results.length === 1 ? "item" : "items"}`;

            if (results.length === 0) {
                fileArea.replaceChildren();

                const empty = document.createElement("p");
                empty.className = "empty-message";
                empty.textContent = "No matching items found.";

                fileArea.appendChild(empty);
            } else {
                renderItems(results);
            }

            statusMessage.textContent =
                `Found ${results.length} matching items.`;

            return;
        }

        // Entire Filesystem: display the search dialog
if (!filesystemSearchDialog.open) {
    filesystemSearchDialog.show();

    // Keep typing in the search bar after opening results
    searchInput.focus({ preventScroll: true });
}

document.body.classList.add("global-search-active");

renderGlobalSearchResults(results, query);

    } catch (error) {
        if (requestId !== searchRequestId) return;

        statusMessage.textContent = `Search error: ${error.message}`;
    }
});
// Refresh search when scope or algorithm changes
searchScope.addEventListener("change", () => {
    searchInput.dispatchEvent(new Event("input"));
});

searchMode.addEventListener("change", () => {
    searchInput.dispatchEvent(new Event("input"));
});

// Display complete search results
async function showFullSearchResults(query) {
    try {
        statusMessage.textContent = "Searching...";

        const results = await performSearch(query);

        searchSuggestions.hidden = true;
        fileArea.replaceChildren();

        if (results.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-message";
            empty.textContent = "No matching items found.";

            fileArea.appendChild(empty);
        } else {
            results.forEach((item) => {
                const result = document.createElement("div");
                result.className = "search-result-item";

                const name = document.createElement("strong");
                name.textContent = item.name;

                const details = document.createElement("span");
                details.textContent = `${item.type} • ${item.path}`;

                result.append(name, details);
                fileArea.appendChild(result);
            });
        }

        document.querySelector(".directory-heading h2").textContent =
            "Search Results";

        document.getElementById("itemCount").textContent =
            `${results.length} ${results.length === 1 ? "result" : "results"}`;

        statusMessage.textContent = `Found ${results.length} matching items.`;
    } catch (error) {
        statusMessage.textContent = `Search error: ${error.message}`;
    }
}

// Press Enter for complete results
searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        const query = searchInput.value.trim();

        if (query) {
            searchRequestId++;
            showFullSearchResults(query);
        }
    }

    if (event.key === "Escape") {
        searchSuggestions.hidden = true;
    }
});

// Clear search and restore current folder
clearSearchButton.addEventListener("click", async () => {
    searchRequestId++;
    searchInput.value = "";
    clearSearchButton.hidden = true;
    searchSuggestions.hidden = true;
    // Clear previous global search results
if (filesystemSearchDialog.open) {
    renderGlobalSearchResults([], "");
}

    try {
        await refreshCurrentView();

        document.querySelector(".directory-heading h2").textContent =
            viewingRecycleBin ? "Recycle Bin" : "All Items";

        statusMessage.textContent = "Ready to explore.";
    } catch (error) {
        statusMessage.textContent = error.message;
    }
});

// Hide suggestions when clicking outside
document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-container")) {
        searchSuggestions.hidden = true;
    }
});


// Render entire filesystem search results
function renderGlobalSearchResults(results, query) {
    globalSearchResults.replaceChildren();

    globalSearchCount.textContent =
        `${results.length} ${results.length === 1 ? "result" : "results"} found`;

    if (results.length === 0) {
        const empty = document.createElement("div");
        empty.className = "global-search-empty";
        empty.textContent = "No matching items found.";

        globalSearchResults.appendChild(empty);
        return;
    }

    results.forEach((item) => {
        const row = document.createElement("div");
        row.className = "global-search-result";

        const icon = document.createElement("div");
        icon.className = "global-result-icon";
        icon.textContent = item.type === "folder" ? "📁" : "📄";

        const details = document.createElement("div");
        details.className = "global-result-details";

        const name = document.createElement("span");
        name.className = "global-result-name";

        const index = item.name.toLowerCase().indexOf(query.toLowerCase());

        if (index !== -1) {
            name.append(
                document.createTextNode(item.name.slice(0, index))
            );

            const highlight = document.createElement("mark");
            highlight.className = "global-search-highlight";
            highlight.textContent =
                item.name.slice(index, index + query.length);

            name.append(highlight);

            name.append(
                document.createTextNode(item.name.slice(index + query.length))
            );
        } else {
            name.textContent = item.name;
        }

        const path = document.createElement("span");
        path.className = "global-result-path";
        path.textContent = item.path;

        details.append(name, path);

        const arrow = document.createElement("button");
        arrow.type = "button";
        arrow.className = "global-result-arrow";
        arrow.textContent = "→";
        arrow.title = "Go to location";

        // Navigation will be connected in the next step.
        // Navigate to the item's parent folder
arrow.addEventListener("click", async () => {
    try {
        statusMessage.textContent = `Locating ${item.name}...`;

        // Extract the parent folder path
        const lastSlash = item.path.lastIndexOf("/");
        const parentPath = item.path.slice(0, lastSlash) || "/";

        // Navigate through the backend
        await apiRequest("/navigate-to", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                path: parentPath
            })
        });

        // Close global search
        filesystemSearchDialog.close();
        searchInput.value = "";
clearSearchButton.hidden = true;
searchSuggestions.hidden = true;

        // Return to the normal filesystem view
        viewingRecycleBin = false;
        updateSidebar();

        await refreshFileSystem();

        // Find and highlight the selected item
        const matchingItem = [...fileArea.querySelectorAll(".file-item")]
            .find(element =>
                element.querySelector(".file-item-name")?.textContent === item.name
            );

        if (matchingItem) {
            matchingItem.classList.add("search-result-selected");
            matchingItem.scrollIntoView({
                behavior: "smooth",
                block: "nearest"
            });
        }

        statusMessage.textContent = `Located: ${item.name}`;

    } catch (error) {
        statusMessage.textContent = `Navigation error: ${error.message}`;
    }
});
        row.append(icon, details, arrow);
        globalSearchResults.appendChild(row);
    });
}

// Close entire filesystem search dialog
closeSearchDialog.addEventListener("click", () => {
    filesystemSearchDialog.close();
    document.body.classList.remove("global-search-active");
});
filesystemSearchDialog.addEventListener("close", () => {
    document.body.classList.remove("global-search-active");
});

// Storage Properties Inspection and Resizing
async function showStorageProperties(name, type) {
    if (!storagePropertiesDialog) return;
    currentInspectedItem = { name, type };

    propItemName.textContent = name;
    propItemType.textContent = type === "folder" ? "Folder" : "File";
    if (propResizeError) {
        propResizeError.hidden = true;
        propResizeError.textContent = "";
    }

    if (propResizeRow) propResizeRow.hidden = (type === "folder" || viewingRecycleBin);
    if (propNewSizeInput) propNewSizeInput.value = "";

    try {
        const storage = await apiRequest(`/files/${encodeURIComponent(name)}/storage`);

        if (type === "folder") {
            if (storage.sizeBytes === 0) {
                propItemSize.textContent = "0 B (Empty folder)";
                propItemBlocks.textContent = "0 blocks";
                if (propBlockList) {
                    propBlockList.innerHTML = '<span class="empty-blocks">Folder is empty (0 blocks allocated).</span>';
                }
            } else {
                propItemSize.textContent = `${storage.sizeBytes.toLocaleString()} bytes (${formatBytes(storage.sizeBytes)}) - Content Total`;
                propItemBlocks.textContent = `${storage.blockCount} ${storage.blockCount === 1 ? "block" : "blocks"} (${(storage.blockCount * 4096).toLocaleString()} bytes allocated in folder)`;

                if (propBlockList) {
                    propBlockList.replaceChildren();
                    if (!storage.blocks || storage.blocks.length === 0) {
                        propBlockList.innerHTML = '<span class="empty-blocks">0 blocks allocated.</span>';
                    } else {
                        storage.blocks.forEach(bId => {
                            const chip = document.createElement("span");
                            chip.className = "block-chip";
                            chip.textContent = `#${bId}`;
                            propBlockList.appendChild(chip);
                        });
                    }
                }
            }
        } else {
            propItemSize.textContent = `${storage.sizeBytes.toLocaleString()} bytes (${formatBytes(storage.sizeBytes)})`;
            propItemBlocks.textContent = `${storage.blockCount} ${storage.blockCount === 1 ? "block" : "blocks"} (${(storage.blockCount * 4096).toLocaleString()} bytes allocated)`;
            if (propNewSizeInput) propNewSizeInput.value = storage.sizeBytes;

            if (propBlockList) {
                propBlockList.replaceChildren();
                if (!storage.blocks || storage.blocks.length === 0) {
                    propBlockList.innerHTML = '<span class="empty-blocks">0 blocks allocated (zero-byte file).</span>';
                } else {
                    storage.blocks.forEach(bId => {
                        const chip = document.createElement("span");
                        chip.className = "block-chip";
                        chip.textContent = `#${bId}`;
                        propBlockList.appendChild(chip);
                    });
                }
            }
        }
    } catch (err) {
        propItemSize.textContent = "Unknown";
        propItemBlocks.textContent = "Unknown";
        if (propBlockList) {
            propBlockList.innerHTML = `<span class="dialog-error">${err.message}</span>`;
        }
    }

    storagePropertiesDialog.showModal();
}

propertiesSelectedButton?.addEventListener("click", () => {
    const selectedItem = fileArea.querySelector(".file-item.is-selected");
    if (!selectedItem) return;
    const nameEl = selectedItem.querySelector(".file-item-name");
    const iconEl = selectedItem.querySelector(".file-item-icon");
    if (!nameEl) return;
    const name = nameEl.textContent.trim();
    const isFolder = iconEl?.classList.contains("folder");
    showStorageProperties(name, isFolder ? "folder" : "file");
});

applyResizeButton?.addEventListener("click", async () => {
    if (!currentInspectedItem || currentInspectedItem.type !== "file") return;

    const newSize = Number(propNewSizeInput.value);
    if (isNaN(newSize) || newSize < 0) {
        if (propResizeError) {
            propResizeError.textContent = "Please enter a valid non-negative size.";
            propResizeError.hidden = false;
        }
        return;
    }

    try {
        await apiRequest("/files/size", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: currentInspectedItem.name, size: newSize })
        });

        if (propResizeError) propResizeError.hidden = true;
        statusMessage.textContent = `Resized "${currentInspectedItem.name}" to ${formatBytes(newSize)}`;
        await showStorageProperties(currentInspectedItem.name, currentInspectedItem.type);
        await refreshFileSystem();
    } catch (err) {
        if (propResizeError) {
            propResizeError.textContent = err.message;
            propResizeError.hidden = false;
        }
    }
});

closeStorageDialogButton?.addEventListener("click", () => {
    storagePropertiesDialog.close();
});