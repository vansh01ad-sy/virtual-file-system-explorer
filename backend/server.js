
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
        "http://127.0.0.1:5500",
        "http://localhost:5500"
    ]
}));                                 

app.use(express.json());

// Start the C filesystem once.
// Do NOT launch main.exe separately.
const cProgram = spawn(
    path.resolve(__dirname, "../c-core/main.exe"),
    [],
    { stdio: ["pipe", "pipe", "inherit"] }
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
            type: Number(parts[2]) === 0 ? "folder" : "file"
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

    // Other commands must end with END.
    if (line.startsWith("PATH|")) {
        request.result = { path: line.slice(5) };
    } else if (line.startsWith("OK|")) {
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

cProgram.on("close", (code) => {
    cExited = true;

    const error = new Error(
        `C filesystem stopped (exit code ${code}).`
    );

    while (pendingRequests.length > 0) {
        pendingRequests.shift().reject(error);
    }

    console.log(error.message);
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

// Create file
app.post("/api/files", async (req, res) => {
    const { name } = req.body ?? {};

    if (!validName(name)) {
        return res.status(400).json({ error: "Invalid file name." });
    }

    try {
        res.json(await sendCommand("CREATE_FILE|" + name));
    } catch (error) {
        res.status(400).json({ error: error.message });
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

app.listen(PORT, () => {
    console.log(`NodeVault API running at http://localhost:${PORT}`);
});

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