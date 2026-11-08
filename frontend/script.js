
const API = "http://localhost:3000/api";
const dialogError = document.getElementById("dialogError");
const homeButton = document.getElementById("homeButton");
const recycleBinButton = document.getElementById("recycleBinButton");
const backButton = document.getElementById("backButton");
const forwardButton = document.getElementById("forwardButton");

const newFolderButton = document.getElementById("newFolderButton");
const newFileButton = document.getElementById("newFileButton");
const pasteButton = document.getElementById("pasteButton");
const cancelClipboardButton =
    document.getElementById("cancelClipboardButton");

const createDialog = document.getElementById("createDialog");
const createForm = document.getElementById("createForm");
const dialogTitle = document.getElementById("dialogTitle");
const itemName = document.getElementById("itemName");

const closeDialogButton = document.getElementById("closeDialogButton");
const cancelButton = document.getElementById("cancelButton");

const fileArea = document.getElementById("fileArea");
const statusMessage = document.getElementById("statusMessage");

const gridViewButton = document.getElementById("gridViewButton");
const listViewButton = document.getElementById("listViewButton");

let selectedItemType = "folder";
let viewingRecycleBin = false;
let clipboardState = {
    mode: "NONE",
    name: null
};
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
async function loadRecycleBin() {
    return await apiRequest("/recycle-bin");
}
// Get clipboard status from the C core.
async function updateClipboardUI() {
    try {
        const clipboard = await apiRequest("/clipboard");
        clipboardState = clipboard;

        const hasItem = clipboard.mode !== "NONE";

        pasteButton.hidden = !hasItem;
        cancelClipboardButton.hidden = !hasItem;

        if (hasItem) {
            pasteButton.textContent = `Paste ${clipboard.name}`;
        }
    } catch (error) {
        console.error("Clipboard status error:", error);
    }
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
}

// Render folder and file icons
function renderItems(items) {
    fileArea.replaceChildren();

    if (items.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "empty-message";
        emptyMessage.textContent = viewingRecycleBin
            ? "Your Recycle Bin is empty."
            : "This folder is empty.";

        fileArea.appendChild(emptyMessage);
        return;
    }

    items.forEach((item) => {
        const itemElement = document.createElement("div");
        itemElement.className = "file-item";
        if (
    clipboardState.mode === "MOVE" &&
    clipboardState.name === item.name
) {
    itemElement.classList.add("cut-item");
}
        if (
    clipboardState.mode === "MOVE" &&
    clipboardState.name === item.name
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
        name.textContent = item.name;

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

        itemElement.appendChild(actions);
        fileArea.appendChild(itemElement);
    });
}
// Refresh path, items, and item count
async function refreshFileSystem() {
    const [path, items] = await Promise.all([
        loadPath(),
        loadItems()
    ]);

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
}

// Open create dialog
function openCreateDialog(type) {
    selectedItemType = type;

    dialogTitle.textContent =
        type === "folder" ? "Create Folder" : "Create File";

    itemName.placeholder =
        type === "folder" ? "Enter folder name" : "Enter file name";

    itemName.value = "";
    createDialog.showModal();
    itemName.focus();
}

newFolderButton?.addEventListener("click", () => {
    openCreateDialog("folder");
});

newFileButton?.addEventListener("click", () => {
    openCreateDialog("file");
});
// Paste the clipboard item into the current folder
pasteButton.addEventListener("click", async () => {
    try {
        await apiRequest("/paste", {
            method: "POST"
        });

       await updateClipboardUI();
await refreshCurrentView();

        statusMessage.textContent = "Item pasted successfully.";
    } catch (error) {
        statusMessage.textContent = error.message;
    }
});


// Cancel the current clipboard operation
cancelClipboardButton.addEventListener("click", async () => {
    try {
        await apiRequest("/cancel-clipboard", {
            method: "POST"
        });

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

    try {
        statusMessage.textContent = "Creating...";

        await apiRequest(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name })
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