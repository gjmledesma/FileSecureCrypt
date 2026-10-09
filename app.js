const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());

const HISTORY_FILE = path.join(__dirname, "lock-history.json");

// Reads the locked-file history from lock-history.json.
// If the file doesn't exist yet (first time running the app), or the
// file is empty/broken, an empty list can be seen.
function readHistory() {
    if (!fs.existsSync(HISTORY_FILE)) {
        return [];
    }

    var fileText = fs.readFileSync(HISTORY_FILE, "utf8");

    try {
        return JSON.parse(fileText);
    } catch (err) {
        return [];
    }
}

// Saves the given history list back to lock-history.json.
function writeHistory(history) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/index.html", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/index.html#lock", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html#lock"));
});

app.get("/index.html#remove-lock", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html#remove-lock"));
});

app.get("/about.html", (req, res) => {
    res.sendFile(path.join(__dirname, "about.html"));
});

// Send the current locked-file history to the website so it can
// show the list of files locked so far.
app.get("/api/lock-history", (req, res) => {
    var history = readHistory();
    res.json(history);
});

// Add a newly locked file's name to the history.
// The browser calls this after it finishes locking a file.
app.post("/api/lock-history", (req, res) => {
    var fileName = req.body && req.body.fileName;

    if (!fileName) {
        res.status(400).json({ error: "Missing fileName." });
        return;
    }

    var history = readHistory();

    history.push({
        fileName: fileName,
        lockedAt: new Date().toISOString()
    });

    writeHistory(history);

    res.json({ success: true });
});

app.listen(3000, () => {
    console.log("FileSecureCrypt backend is running on port 3000.");
});