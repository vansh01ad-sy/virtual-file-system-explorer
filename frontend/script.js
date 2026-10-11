
const newFolderButton = document.getElementById("newFolderButton");
const newFileButton = document.getElementById("newFileButton");

const createDialog = document.getElementById("createDialog");
const createForm = document.getElementById("createForm");
const dialogTitle = document.getElementById("dialogTitle");
const itemName = document.getElementById("itemName");

const closeDialogButton = document.getElementById("closeDialogButton");
const cancelButton = document.getElementById("cancelButton");

const gridViewButton = document.getElementById("gridViewButton");
const listViewButton = document.getElementById("listViewButton");
const fileArea = document.getElementById("fileArea");

const statusMessage = document.getElementById("statusMessage");

let selectedItemType = "folder";


// Open the create dialog
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

newFolderButton.addEventListener("click", () => {
    openCreateDialog("folder");
});

newFileButton.addEventListener("click", () => {
    openCreateDialog("file");
});


// Close the dialog
closeDialogButton.addEventListener("click", () => {
    createDialog.close();
});

cancelButton.addEventListener("click", () => {
    createDialog.close();
});


// Handle form submission
createForm.addEventListener("submit", (event) => {
    event.preventDefault();

    createDialog.close();
});


// Switch between grid and list views
function setView(view) {
    const isGrid = view === "grid";

    fileArea.classList.toggle("grid-view", isGrid);
    fileArea.classList.toggle("list-view", !isGrid);

    gridViewButton.classList.toggle("active", isGrid);
    listViewButton.classList.toggle("active", !isGrid);

    statusMessage.textContent =
        isGrid ? "Grid view selected." : "List view selected.";
}

gridViewButton.addEventListener("click", () => {
    setView("grid");
});

listViewButton.addEventListener("click", () => {
    setView("list");
});


// Initial status
statusMessage.textContent = "Ready to explore.";
