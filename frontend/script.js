
const API = "http://localhost:3000/api";

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

let selectedItemType = "folder";

// Send a request to the Node.js API
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

// Render folder and file icons
function renderItems(items) {
    fileArea.replaceChildren();

    if (items.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.textContent = "This folder is empty.";
        emptyMessage.className = "empty-message";
        fileArea.appendChild(emptyMessage);
        return;
    }

    items.forEach((item) => {
        const itemElement = document.createElement("button");
        itemElement.type = "button";
        itemElement.className = "file-item";

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

        // Double-click a folder to open it
        if (item.type === "folder") {
            itemElement.addEventListener("dblclick", async () => {
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
        }

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
        statusMessage.textContent = `Error: ${error.message}`;
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
