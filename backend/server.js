
const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");
const readline = require("readline");

const app = express();
const PORT = 3000;

// Allow your Live Server frontend to call this API.
app.use(cors({
    origin: [
        "http://127.0.0.1:5502",
        "http://localhost:5502"
    ]
}));                                 

app.use(express.json());

// Start the C filesystem once.
// Do NOT launch main.exe separately.
const cProgram = spawn(
    path.resolve(__dirname, "../c-core/main.exe"),
    [],
    {
        cwd: __dirname,
        stdio: ["pipe", "pipe", "inherit"]
    }
);


const cOutput = readline.createInterface({
    input: cProgram.stdout
});

let pendingRequests = [];
let cExited = false;

// Read responses from the C program.
cOutput.on("line", (line) => {
    if (line.trim() === "") return;

    const request = pendingRequests[0];
    if (!request) {
        console.log("Unexpected C output:", line);
        return;
    }

    // LIST returns multiple ITEM lines and ends with LIST_END.
    // LIST and RECYCLE_LIST return multiple ITEM lines.
if (
    request.command === "LIST" ||
    request.command === "RECYCLE_LIST"
) {
    if (line.startsWith("ITEM|")) {
        const parts = line.split("|");

        request.items.push({
            name: parts[1],
            type: Number(parts[2]) === 0 ? "folder" : "file",
            size: parts[3] !== undefined ? Number(parts[3]) : 0
        });
    } else if (
        (request.command === "LIST" && line === "LIST_END") ||
        (request.command === "RECYCLE_LIST" && line === "LIST_END")
    ) {
        pendingRequests.shift();
        request.resolve(request.items);
    }

    return;
}

// Handle recursive search results.
if (
    request.command.startsWith("SEARCH|") ||
    request.command.startsWith("PREFIX|")
) {
    if (line.startsWith("RESULT|")) {
        const parts = line.split("|");

        request.results.push({
            name: parts[1],
            type: Number(parts[2]) === 0 ? "folder" : "file",
            path: parts.slice(3).join("|")
        });
    }
    else if (line === "SEARCH_END") {
        pendingRequests.shift();
        request.resolve(request.results);
    }

    return;
}

    // Handle sorting response.
if (request.command.startsWith("SORT|")) {
    if (line.startsWith("SORT_OK|")) {
        pendingRequests.shift();

        request.resolve({
            mode: Number(line.split("|")[1])
        });
    } else if (line.startsWith("ERROR|")) {
        pendingRequests.shift();
        request.reject(new Error(line.slice(6)));
    }

    return;
}
    // Other commands must end with END.
    if (line.startsWith("DISK|")) {
        const parts = line.split("|");
        const totalBytes = Number(parts[1]);
        const usedBytes = Number(parts[2]);
        const freeBytes = Number(parts[3]);
        const totalBlocks = Number(parts[4]);
        const allocatedBlocks = Number(parts[5]);
        const freeBlocks = Number(parts[6]);
        const blockSize = Number(parts[7]);
        const utilization = totalBytes > 0 ? ((usedBytes / totalBytes) * 100).toFixed(2) : "0.00";

        request.result = {
            totalBytes,
            usedBytes,
            freeBytes,
            totalBlocks,
            allocatedBlocks,
            freeBlocks,
            blockSize,
            utilization
        };
    } else if (line.startsWith("STORAGE|")) {
        const parts = line.split("|");
        const name = parts[1];
        const type = Number(parts[2]) === 0 ? "folder" : "file";
        const sizeBytes = Number(parts[3]);
        const blockCount = Number(parts[4]);
        const blockListStr = parts[5] || "";
        const blocks = blockListStr.length > 0 ? blockListStr.split(",").map(Number) : [];

        request.result = {
            name,
            type,
            sizeBytes,
            blockCount,
            blocks
        };
    } else if (line.startsWith("PATH|")) {
    request.result = { path: line.slice(5) };

}  else if (line.startsWith("CLIPBOARD|")) {
    const parts = line.split("|");

    request.result = {
        mode: parts[1],
        name: parts[2] || null,
        path: parts[3] || null
    };
} 
    else if (line.startsWith("OK|")) {
        request.result = { message: line };
    } else if (line.startsWith("ERROR|")) {
        request.error = line.slice(6);
    } else if (line === "END") {
        pendingRequests.shift();

        if (request.error) {
            request.reject(new Error(request.error));
        } else if (request.result) {
            request.resolve(request.result);
        } else {
            request.reject(new Error("Unexpected C response."));
        }
    }
});



cProgram.on("error", (error) => {
    cExited = true;
    console.error("Could not start C program:", error.message);
});

cProgram.on("close", (code, signal) => {
    cExited = true;

    console.log("C PROCESS CLOSED");
    console.log("Exit code:", code);
    console.log("Signal:", signal);

    const error = new Error(
        `C filesystem stopped (exit code ${code}).`
    );

    while (pendingRequests.length > 0) {
        pendingRequests.shift().reject(error);
    }
});

cProgram.stdin.on("error", (error) => {
    if (error.code !== "EPIPE" || !isShuttingDown) {
        console.error("C stdin error:", error.code);
    }
});
function sendCommand(command) {
    return new Promise((resolve, reject) => {
        if (cExited || !cProgram.stdin.writable) {
            reject(new Error("C filesystem is not running."));
            return;
        }

        pendingRequests.push({
              command,
    resolve,
    reject,
    items: [],
     results: [],
    result: null,
    error: null
        });

        cProgram.stdin.write(command + "\n", (error) => {
            if (error) {
                console.error("Failed to send command to C:", error.message);
            }
        });
    });
}

// Validate names before sending them to C.
function validName(name) {
    return typeof name === "string" &&
        name.trim().length > 0 &&
        name.length <= 49 &&
        !/[|\r\n]/.test(name);
}

// Virtual disk statistics
app.get("/api/disk", async (req, res) => {
    try {
        res.json(await sendCommand("DISK_STATUS"));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Current path
app.get("/api/path", async (req, res) => {
    try {
        res.json(await sendCommand("PATH"));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Current folder contents
app.get("/api/items", async (req, res) => {
    try {
        res.json(await sendCommand("LIST"));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Change sorting mode
app.post("/api/sort", async (req, res) => {
    const { mode } = req.body ?? {};

    if (![1, 2, 3, 4].includes(mode)) {
        return res.status(400).json({
            error: "Invalid sorting mode."
        });
    }

    try {
        const result = await sendCommand(`SORT|${mode}`);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});
// Recursive search
app.get("/api/search", async (req, res) => {
    const query = req.query.q;
    const scope = req.query.scope || "ALL";

    if (!validName(query)) {
        return res.status(400).json({
            error: "Invalid search query."
        });
    }

    if (scope !== "ALL" && scope !== "CURRENT") {
        return res.status(400).json({
            error: "Invalid search scope."
        });
    }

    try {
        const results = await sendCommand(
            `SEARCH|${query.trim()}|${scope}`
        );

        res.json(results);
    }
    catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// Trie-based prefix search
app.get("/api/search/prefix", async (req, res) => {
    const query = req.query.q;
    const scope = req.query.scope || "ALL";

    if (!validName(query)) {
        return res.status(400).json({
            error: "Invalid search query."
        });
    }

    if (scope !== "ALL" && scope !== "CURRENT") {
        return res.status(400).json({
            error: "Invalid search scope."
        });
    }

    try {
        const results = await sendCommand(
            `PREFIX|${query.trim()}|${scope}`
        );

        res.json(results);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});
// Clipboard status
app.get("/api/clipboard", async (req, res) => {
    try {
        res.json(await sendCommand("CLIPBOARD_STATUS"));
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// Create folder
app.post("/api/folders", async (req, res) => {
    const { name } = req.body ?? {};

    if (!validName(name)) {
        return res.status(400).json({ error: "Invalid folder name." });
    }

    try {
        res.json(await sendCommand("CREATE_FOLDER|" + name));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

function getAutoFileSize(name) {
    const ext = path.extname(name || "").toLowerCase();
    switch (ext) {
        case ".mp4":
        case ".mkv":
        case ".avi":
            return 2097152; // 2 MB (512 blocks)
        case ".mp3":
        case ".wav":
        case ".flac":
            return 1258291; // ~1.2 MB (308 blocks)
        case ".exe":
        case ".msi":
        case ".iso":
            return 1572864; // ~1.5 MB (384 blocks)
        case ".zip":
        case ".rar":
        case ".7z":
        case ".tar":
        case ".gz":
            return 819200;  // 800 KB (200 blocks)
        case ".jpg":
        case ".jpeg":
        case ".png":
        case ".gif":
        case ".webp":
            return 358400;  // 350 KB (88 blocks)
        case ".pdf":
            return 98304;   // 96 KB (24 blocks)
        case ".docx":
        case ".xlsx":
        case ".pptx":
            return 49152;   // 48 KB (12 blocks)
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
            return 8192;    // 8 KB (2 blocks)
        case ".txt":
        case ".md":
        case ".log":
        case ".csv":
        case ".dat":
            return 4096;    // 4 KB (1 block)
        default:
            return 4096;    // 4 KB default (1 block)
    }
}

// Create file (with optional user-specified size or automatic extension-based sizing)
app.post("/api/files", async (req, res) => {
    const { name, size } = req.body ?? {};

    if (!validName(name)) {
        return res.status(400).json({ error: "Invalid file name." });
    }

    let numSize;
    if (size !== undefined && size !== null && String(size).trim() !== "") {
        numSize = Number(size);
        if (isNaN(numSize) || numSize < 0) {
            return res.status(400).json({ error: "File size must be a non-negative number." });
        }
    } else {
        numSize = getAutoFileSize(name);
    }

    try {
        const cmd = `CREATE_FILE|${name}|${numSize}`;
        res.json(await sendCommand(cmd));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Resize an existing file
app.post("/api/files/size", async (req, res) => {
    const { name, size } = req.body ?? {};

    if (!validName(name)) {
        return res.status(400).json({ error: "Invalid file name." });
    }

    const numSize = Number(size);
    if (isNaN(numSize) || numSize < 0) {
        return res.status(400).json({ error: "File size must be a non-negative number." });
    }

    try {
        res.json(await sendCommand(`SET_FILE_SIZE|${name}|${numSize}`));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get block storage details for a file
app.get("/api/files/:name/storage", async (req, res) => {
    const { name } = req.params;

    if (!validName(name)) {
        return res.status(400).json({ error: "Invalid file name." });
    }

    try {
        res.json(await sendCommand(`FILE_STORAGE|${name}`));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Navigate to a folder using its full path
app.post("/api/navigate-to", async (req, res) => {
    const { path: folderPath } = req.body ?? {};

    if (
        typeof folderPath !== "string" ||
        !folderPath.startsWith("/") ||
        folderPath.length >= 6000 ||
        folderPath.includes("|") ||
        /[\r\n]/.test(folderPath)
    ) {
        return res.status(400).json({
            error: "Invalid folder path."
        });
    }

    try {
        res.json(
            await sendCommand("GOTO_PATH|" + folderPath)
        );
    } catch (error) {
        res.status(400).json({
            error: error.message
        });
    }
});
// Open folder
app.post("/api/open", async (req, res) => {
    const { name } = req.body ?? {};

    if (!validName(name)) {
        return res.status(400).json({ error: "Invalid folder name." });
    }

    try {
        res.json(await sendCommand("OPEN_FOLDER|" + name));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Back
app.post("/api/back", async (req, res) => {
    try {
        res.json(await sendCommand("BACK"));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Forward
app.post("/api/forward", async (req, res) => {
    try {
        res.json(await sendCommand("FORWARD"));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Copy an item
app.post("/api/copy", async (req, res) => {
    const { name } = req.body ?? {};

    if (!validName(name)) {
        return res.status(400).json({
            error: "Invalid item name."
        });
    }

    try {
        res.json(await sendCommand("COPY|" + name));
    } catch (error) {
        res.status(400).json({
            error: error.message
        });
    }
});

// Cut an item
app.post("/api/cut", async (req, res) => {
    const { name } = req.body ?? {};

    if (!validName(name)) {
        return res.status(400).json({
            error: "Invalid item name."
        });
    }

    try {
        res.json(await sendCommand("CUT|" + name));
    } catch (error) {
        res.status(400).json({
            error: error.message
        });
    }
});

// Paste clipboard item
app.post("/api/paste", async (req, res) => {
    try {
        res.json(await sendCommand("PASTE"));
    } catch (error) {
        res.status(400).json({
            error: error.message
        });
    }
});

// Cancel clipboard
app.post("/api/cancel-clipboard", async (req, res) => {
    try {
        res.json(await sendCommand("CANCEL_CLIPBOARD"));
    } catch (error) {
        res.status(400).json({
            error: error.message
        });
    }
});

const server = app.listen(PORT, () => {
    console.log(`NodeVault API running at http://localhost:${PORT}`);
});


let isShuttingDown = false;

async function gracefulShutdown(signal) {
    if (isShuttingDown) return;

    isShuttingDown = true;
    console.log(`\n${signal} received. Shutting down NodeVault...`);

    // Stop accepting new HTTP requests and wait for active ones.
    server.close(() => {
        console.log("API server closed.");

        if (cExited || !cProgram.stdin.writable) {
            return;
        }

        // Wait until the C program has processed EXIT and closed.
        cProgram.once("close", () => {
            console.log("C filesystem saved and closed.");
        });

        cProgram.stdin.end("EXIT\n");
    });
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));


// Recycle an item
app.post("/api/delete", async (req, res) => {
    const { name } = req.body ?? {};

    if (!validName(name)) {
        return res.status(400).json({ error: "Invalid item name." });
    }

    try {
        res.json(await sendCommand("DELETE|" + name));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
app.post("/api/rename", async (req, res) => {
    const { oldName, newName } = req.body ?? {};

    if (
        !validName(oldName) ||
        !validName(newName)
    ) {
        return res.status(400).json({
            error: "Both names must be valid and under 50 characters."
        });
    }

    try {
        const result = await sendCommand(
            `RENAME|${oldName}|${newName}`
        );

        res.json(result);
    } catch (error) {
        res.status(400).json({
            error: error.message
        });
    }
});
// List Recycle Bin items
app.get("/api/recycle-bin", async (req, res) => {
    try {
        res.json(await sendCommand("RECYCLE_LIST"));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Restore an item
app.post("/api/restore", async (req, res) => {
    const { name } = req.body ?? {};

    if (!validName(name)) {
        return res.status(400).json({ error: "Invalid item name." });
    }

    try {
        res.json(await sendCommand("RESTORE|" + name));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Permanently delete an item
app.post("/api/permanent-delete", async (req, res) => {
    const { name } = req.body ?? {};

    if (!validName(name)) {
        return res.status(400).json({ error: "Invalid item name." });
    }

    try {
        res.json(
            await sendCommand("PERMANENT_DELETE|" + name)
        );
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});