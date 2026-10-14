// Section to handle button clicks
// and update the Status message per feature in the homepage.

// Clicking "Lock File" button in Lock File feature
document.getElementById("LockButton").onclick = function() {
    document.getElementById("lockMessage").textContent =
        "Status: File locking process shall start once all fields are done. Please wait for the process to complete.";
}

// Clicking "Remove Lock" button in Remove Lock from File feature
document.getElementById("UnlockButton").onclick = function() {
    document.getElementById("unlockMessage").textContent =
        "Status: File unlocking process shall start once all fields are done. Please wait for the process to complete.";
}

// Clicking "Clear" button in Lock File feature
document.getElementById("LockClearButton").onclick = function() {
    document.getElementById("lockMessage").textContent =
        "Status: Awaiting lock. Proceed in selecting a file and entering a password to lock the file.";
    document.getElementById("lock-indicator").className = "status-indicator";
}

// Clicking "Clear" button in Remove Lock from File feature
document.getElementById("UnlockClearButton").onclick = function() {
    document.getElementById("unlockMessage").textContent =
        "Status: Awaiting unlock. Proceed in selecting a .locked file and entering the password to unlock the file.";
    document.getElementById("unlock-indicator").className = "status-indicator";
}

// Expanded status message updates for the Lock File and Remove Lock from File features,
// to provide more clarity to the user about the process of each including expected and invalid outcomes.
//
// FULL DISCLOSURE: This portion of the JavaScript code starting below
// was written with MINOR assistance by Anthropic's Claude AI,
// The code was then reviewed, modified, and tested by the group to
// ensure it reflects the correct update messages to the website.

// Lock File section

var lockForm = document.getElementById("lock-form");
var lockFileInput = document.getElementById("lock-file");
var lockPasswordInput = document.getElementById("lock-password");
var lockVerifyInput = document.getElementById("lock-verify-password");
var lockVerifyError = document.getElementById("lock-verify-password-error");
var lockMessage = document.getElementById("lockMessage");
var lockButton = document.getElementById("LockButton");
var lockIndicator = document.getElementById("lock-indicator");
var lockHistoryList = document.getElementById("lock-history-list");

lockVerifyInput.addEventListener("input", function() {
    var passwordsDoNotMatch = lockVerifyInput.value.length > 0 && lockVerifyInput.value !== lockPasswordInput.value;

    if (passwordsDoNotMatch) {
        lockVerifyError.hidden = false;
        lockVerifyInput.setAttribute("aria-invalid", "true");
    } else {
        lockVerifyError.hidden = true;
        lockVerifyInput.setAttribute("aria-invalid", "false");
    }
});

lockForm.addEventListener("submit", async function(event) {
    
    // stop the form from trying to send the file to a server
    event.preventDefault();

    var file = lockFileInput.files[0];
    var password = lockPasswordInput.value;
    var verifyPassword = lockVerifyInput.value;

    if (!file) {
        setStatus(lockMessage, "Please choose a file first.", "error", lockIndicator);
        return;
    }

    if (password !== verifyPassword) {
        lockVerifyError.hidden = false;
        setStatus(lockMessage, "Passwords do not match.", "error", lockIndicator);
        return;
    }

    lockButton.disabled = true;
    setStatus(lockMessage, "Locking your file, please wait...", "loading", lockIndicator);

    try {
        var lockedBlob = await lockFile(file, password);
        var lockedName = file.name + ".locked";

        downloadBlob(lockedBlob, lockedName);
        setStatus(lockMessage, "File locked and downloaded as " + lockedName + ".", "success", lockIndicator);

        await saveLockHistory(file.name);
        await loadLockHistory();
    } catch (err) {
        console.error(err);
        setStatus(lockMessage, "Something went wrong while locking the file.", "error", lockIndicator);
    }

    lockButton.disabled = false;
});

// Remove Lock from File section

var unlockForm = document.getElementById("remove-lock-form");
var unlockFileInput = document.getElementById("unlock-file");
var unlockPasswordInput = document.getElementById("unlock-password");
var unlockMessage = document.getElementById("unlockMessage");
var unlockButton = document.getElementById("UnlockButton");
var unlockIndicator = document.getElementById("unlock-indicator");

unlockForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    var file = unlockFileInput.files[0];
    var password = unlockPasswordInput.value;

    if (!file) {
        setStatus(unlockMessage, "Please choose a .locked file first.", "error", unlockIndicator);
        return;
    }

    unlockButton.disabled = true;
    setStatus(unlockMessage, "Unlocking your file, please wait...", "loading", unlockIndicator);

    try {
        var unlockedResult = await unlockFile(file, password);

        downloadBlob(unlockedResult.blob, unlockedResult.name);
        setStatus(unlockMessage, "File unlocked and downloaded as " + unlockedResult.name + ".", "success", unlockIndicator);
    } catch (err) {
        console.error(err);
        setStatus(unlockMessage, err.message || "Something went wrong while unlocking the file.", "error", unlockIndicator);
    }

    unlockButton.disabled = false;
});

// Locked-file history
//
// The server (app.js) keeps a simple local record of the names of files
// that have been locked so far to reflect in the site's locked files history list.

async function loadLockHistory() {
    try {
        var response = await fetch("/api/lock-history");
        var history = await response.json();

        renderLockHistory(history);
    } catch (err) {
        console.error(err);
    }
}

// Tells the server that a file was locked, so it can be added to
// the history that is kept on the server.
async function saveLockHistory(fileName) {
    try {
        await fetch("/api/lock-history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileName: fileName })
        });
    } catch (err) {
        console.error(err);
    }
}

// Redraws the "Previously Locked Files" list using the history we got
// back from the server.
function renderLockHistory(history) {
    lockHistoryList.innerHTML = "";

    if (!history || history.length === 0) {
        var emptyItem = document.createElement("li");
        emptyItem.className = "empty-state";
        emptyItem.textContent = "No local files locked yet.";
        lockHistoryList.appendChild(emptyItem);
        return;
    }

    for (var i = history.length - 1; i >= 0; i--) {
        var item = document.createElement("li");
        item.textContent = history[i].fileName;
        lockHistoryList.appendChild(item);
    }
}

loadLockHistory();

// Client-side file locking / unlocking logic with the use of the native Web Crypto API.
//
// FULL DISCLOSURE: This chunk of JavaScript code starting below was written with MAJOR assistance by Anthropic's Claude AI,
// which greatly helped establish the structure and logic of the Lock File and Unlock File feature.
// The code was then reviewed and tested by the group to ensure it links to the HTML and CSS files correctly,
// and that it works as intended.
//
// Note: instead of using JSON to save the salt/iv/data together, everything is combined
// together into one plain text string, with a new line between each piece. That way it is
// easy to read and put back together with .split("\n") later on.

var LOCK_FILE_HEADER = "FileSecureCrypt-locked-v1";

// Turns bytes (like a salt, an iv, or encrypted data) into plain text
// so it can be saved inside a normal text file.
function bufferToBase64(buffer) {
    var binaryText = "";
    var bytes = new Uint8Array(buffer);

    for (var i = 0; i < bytes.length; i++) {
        binaryText = binaryText + String.fromCharCode(bytes[i]);
    }

    return btoa(binaryText);
}

function base64ToBuffer(base64Text) {
    var binaryText = atob(base64Text);
    var bytes = new Uint8Array(binaryText.length);

    for (var i = 0; i < binaryText.length; i++) {
        bytes[i] = binaryText.charCodeAt(i);
    }

    return bytes.buffer;
}

// Key derivation
async function deriveKeyFromPassword(password, saltBytes) {
    var encoder = new TextEncoder();

    var passwordKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    var derivedKey = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: saltBytes,
            iterations: 250000,
            hash: "SHA-256"
        },
        passwordKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );

    return derivedKey;
}

// Lock (encrypt)

async function lockFile(file, password) {
    var fileBuffer = await file.arrayBuffer();

    // Random salt (for key derivation) and IV (for the cipher) - both
    // need to be unique per file, and both are safe to store alongside
    // the encrypted data (they aren't secret, only the password is).
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));

    var key = await deriveKeyFromPassword(password, salt);

    var encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        fileBuffer
    );

    // put the original file name/type and the encrypted data into one
    // plain text file, with each piece separated by a new line.
    var originalName = file.name;
    var originalType = file.type || "application/octet-stream";
    var saltText = bufferToBase64(salt);
    var ivText = bufferToBase64(iv);
    var dataText = bufferToBase64(encryptedBuffer);

    var lockedFileText =
        LOCK_FILE_HEADER + "\n" +
        originalName + "\n" +
        originalType + "\n" +
        saltText + "\n" +
        ivText + "\n" +
        dataText;

    return new Blob([lockedFileText], { type: "text/plain" });
}

// Unlock (decrypt)

async function unlockFile(file, password) {
    var lockedFileText = await file.text();

    // split the plain text file back into the pieces we saved earlier
    var lines = lockedFileText.split("\n");

    if (lines.length !== 6 || lines[0] !== LOCK_FILE_HEADER) {
        throw new Error("That doesn't look like a valid .locked file.");
    }

    var originalName = lines[1];
    var originalType = lines[2];
    var saltText = lines[3];
    var ivText = lines[4];
    var dataText = lines[5];

    var salt = new Uint8Array(base64ToBuffer(saltText));
    var iv = new Uint8Array(base64ToBuffer(ivText));
    var encryptedBuffer = base64ToBuffer(dataText);

    var key = await deriveKeyFromPassword(password, salt);

    var decryptedBuffer;
    try {
        decryptedBuffer = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encryptedBuffer
        );
    } catch (err) {
        throw new Error("Incorrect password, or the file is corrupted.");
    }

    var unlockedBlob = new Blob([decryptedBuffer], { type: originalType || "application/octet-stream" });

    return {
        blob: unlockedBlob,
        name: originalName || "unlocked-file"
    };
}

// Small UI helper

// Makes the browser download a Blob as a file, using the given file name.
function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

// Updates one of the status messages on the page, and colors it
// green for success or red for error. If an indicator element is
// given too, it also shows a spinner (loading), a checkmark
// (success), or a crossed-out mark (error) next to the message.
function setStatus(el, text, statusType, indicatorEl) {
    el.textContent = "Status: " + text;
    el.classList.remove("status-success", "status-error");

    if (statusType === "success") {
        el.classList.add("status-success");
    }
    if (statusType === "error") {
        el.classList.add("status-error");
    }

    if (indicatorEl) {
        setIndicator(indicatorEl, statusType);
    }
}

// Swaps an indicator span to show either a loading spinner, a
// checkmark, a crossed-out mark, or nothing at all.
function setIndicator(indicatorEl, state) {
    indicatorEl.className = "status-indicator";

    if (state === "loading") {
        indicatorEl.classList.add("is-loading");
    }
    if (state === "success") {
        indicatorEl.classList.add("is-success");
    }
    if (state === "error") {
        indicatorEl.classList.add("is-error");
    }
}