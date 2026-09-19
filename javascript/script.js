// Section to handle button clicks and update the Status message per feature in the homepage.

// Lock File section 
document.getElementById("LockButton").onclick = function() {
    document.getElementById("lockMessage").textContent =
        "Status: File locking process shall start once all fields are done. Please wait for the process to complete.";
}

// Remove Lock from File section
document.getElementById("UnlockButton").onclick = function() {
    document.getElementById("unlockMessage").textContent =
        "Status: File unlocking process shall start once all fields are done. Please wait for the process to complete.";
}

// Client-side file locking / unlocking logic with the use of the native Web Crypto API. 
// This is a secure way to encrypt and decrypt files in the browser without sending any data to a server.

function bufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// Key derivation 

// Turns a plain-text password into an AES-GCM CryptoKey.
// The same password + same salt will always produce the same key,
// which is how we're able to re-derive it later to unlock the file.
async function deriveKeyFromPassword(password, saltBytes) {
    const encoder = new TextEncoder();

    const passwordKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
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
}

// Lock (encrypt) 

async function lockFile(file, password) {
    const fileBuffer = await file.arrayBuffer();

    // Random salt (for key derivation) and IV (for the cipher) — both
    // need to be unique per file, and both are safe to store alongside
    // the ciphertext (they aren't secret, only the password is).
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const key = await deriveKeyFromPassword(password, salt);

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        fileBuffer
    );

    const lockedPayload = {
        format: "FileSecureCrypt-locked",
        version: 1,
        originalName: file.name,
        originalType: file.type || "application/octet-stream",
        salt: bufferToBase64(salt),
        iv: bufferToBase64(iv),
        data: bufferToBase64(encryptedBuffer)
    };

    return new Blob([JSON.stringify(lockedPayload)], { type: "application/json" });
}

// Unlock (decrypt)

async function unlockFile(file, password) {
    const text = await file.text();

    let payload;
    try {
        payload = JSON.parse(text);
    } catch (err) {
        throw new Error("That doesn't look like a valid .locked file.");
    }

    if (!payload || payload.format !== "FileSecureCrypt-locked" || !payload.salt || !payload.iv || !payload.data) {
        throw new Error("That doesn't look like a valid .locked file.");
    }

    const salt = new Uint8Array(base64ToBuffer(payload.salt));
    const iv = new Uint8Array(base64ToBuffer(payload.iv));
    const encryptedBuffer = base64ToBuffer(payload.data);

    const key = await deriveKeyFromPassword(password, salt);

    let decryptedBuffer;
    try {
        decryptedBuffer = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encryptedBuffer
        );
    } catch (err) {
        throw new Error("Incorrect password, or the file is corrupted.");
    }

    return {
        blob: new Blob([decryptedBuffer], { type: payload.originalType || "application/octet-stream" }),
        name: payload.originalName || "unlocked-file"
    };
}

// Small UI helpers 

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function renderFilePreview(previewEl, file, resultNote) {
    previewEl.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "file-info";

    if (file.type && file.type.startsWith("image/")) {
        const img = document.createElement("img");
        img.className = "preview-thumb";
        img.src = URL.createObjectURL(file);
        img.alt = file.name;
        wrapper.appendChild(img);
    }

    const name = document.createElement("p");
    name.className = "file-name";
    name.textContent = file.name;
    wrapper.appendChild(name);

    const meta = document.createElement("p");
    meta.className = "file-meta";
    meta.textContent = formatFileSize(file.size) + (file.type ? " · " + file.type : "");
    wrapper.appendChild(meta);

    if (resultNote) {
        const note = document.createElement("p");
        note.className = "lock-result";
        note.textContent = resultNote;
        wrapper.appendChild(note);
    }

    previewEl.appendChild(wrapper);
}

function clearPreview(previewEl) {
    previewEl.innerHTML = '<p class="empty-state">No file selected yet.</p>';
}

function setStatus(el, text, statusType) {
    el.textContent = "Status: " + text;
    el.classList.remove("status-success", "status-error");
    if (statusType === "success") el.classList.add("status-success");
    if (statusType === "error") el.classList.add("status-error");
}

// Lock File section

const lockForm = document.getElementById("lock-form");
const lockFileInput = document.getElementById("lock-file");
const lockPasswordInput = document.getElementById("lock-password");
const lockVerifyInput = document.getElementById("lock-verify-password");
const lockVerifyError = document.getElementById("lock-verify-password-error");
const lockMessage = document.getElementById("lockMessage");
const lockPreview = document.getElementById("lock-preview");
const lockButton = document.getElementById("LockButton");

lockFileInput.addEventListener("change", () => {
    const file = lockFileInput.files[0];
    if (file) {
        renderFilePreview(lockPreview, file);
    } else {
        clearPreview(lockPreview);
    }
});

lockVerifyInput.addEventListener("input", () => {
    const mismatch = lockVerifyInput.value.length > 0 && lockVerifyInput.value !== lockPasswordInput.value;
    lockVerifyError.hidden = !mismatch;
    lockVerifyInput.setAttribute("aria-invalid", mismatch ? "true" : "false");
});

lockForm.addEventListener("reset", () => {
    clearPreview(lockPreview);
    lockVerifyError.hidden = true;
    setStatus(lockMessage, "Awaiting lock...");
});

lockForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const file = lockFileInput.files[0];
    const password = lockPasswordInput.value;
    const verifyPassword = lockVerifyInput.value;

    if (!file) {
        setStatus(lockMessage, "Please choose a file first.", "error");
        return;
    }

    if (password !== verifyPassword) {
        lockVerifyError.hidden = false;
        setStatus(lockMessage, "Passwords do not match.", "error");
        return;
    }

    lockButton.disabled = true;
    setStatus(lockMessage, "Locking your file, please wait...");

    try {
        const lockedBlob = await lockFile(file, password);
        const lockedName = file.name + ".locked";

        downloadBlob(lockedBlob, lockedName);
        renderFilePreview(lockPreview, file, "Locked and downloaded as " + lockedName);
        setStatus(lockMessage, "File locked and downloaded as " + lockedName + ".", "success");
    } catch (err) {
        console.error(err);
        setStatus(lockMessage, "Something went wrong while locking the file.", "error");
    } finally {
        lockButton.disabled = false;
    }
});

// Remove Lock from File section

const unlockForm = document.getElementById("remove-lock-form");
const unlockFileInput = document.getElementById("unlock-file");
const unlockPasswordInput = document.getElementById("unlock-password");
const unlockMessage = document.getElementById("unlockMessage");
const unlockPreview = document.getElementById("unlock-preview");
const unlockButton = document.getElementById("UnlockButton");

unlockFileInput.addEventListener("change", () => {
    const file = unlockFileInput.files[0];
    if (file) {
        renderFilePreview(unlockPreview, file);
    } else {
        clearPreview(unlockPreview);
    }
});

unlockForm.addEventListener("reset", () => {
    clearPreview(unlockPreview);
    setStatus(unlockMessage, "Awaiting unlock...");
});

unlockForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const file = unlockFileInput.files[0];
    const password = unlockPasswordInput.value;

    if (!file) {
        setStatus(unlockMessage, "Please choose a .locked file first.", "error");
        return;
    }

    unlockButton.disabled = true;
    setStatus(unlockMessage, "Unlocking your file, please wait...");

    try {
        const { blob, name } = await unlockFile(file, password);

        downloadBlob(blob, name);
        renderFilePreview(unlockPreview, file, "Unlocked and downloaded as " + name);
        setStatus(unlockMessage, "File unlocked and downloaded as " + name + ".", "success");
    } catch (err) {
        console.error(err);
        setStatus(unlockMessage, err.message || "Something went wrong while unlocking the file.", "error");
    } finally {
        unlockButton.disabled = false;
    }
});