// ==========================================
// 1. GLOBAL STATE & VARIABLES
// ==========================================
let songBoxes = [];
let songs = [];
let currentLibrary = [];
let currentSongIndex = 0;
let shuffle = false;
let loop = false;
let isOnlineSearch = false;
let searchDebounceTimer = null;

window.currentSong = null;

// ==========================================
// 2. TRIGGER DOWNLOAD FROM MAIN PROCESS
// ==========================================
async function triggerDownload(artist, title, buttonEl) {
    if (!window.api?.downloadTrack) {
        alert("Electron API bridge is not connected!");
        return;
    }

    const originalText = buttonEl.innerText;
    buttonEl.disabled = true;
    buttonEl.innerText = "SAVING...";

    // Call the IPC function exposed in preload.js
    const result = await window.api.downloadTrack({ artist, title });

    if (result.success) {
        buttonEl.innerText = "✓ SAVED";
        console.log(`Saved from ${result.source} to: ${result.filePath}`);
    } else {
        alert(`Download failed: ${result.error}`);
        buttonEl.innerText = originalText;
        buttonEl.disabled = false;
    }
}

// ==========================================
// 3. APP BOOTSTRAP
// script.js loads last (see main.html), so by this point every other
// file has finished defining its functions/listeners. initializeApp()
// (defined in settings.js) loads settings/caches over IPC and then
// populates the library.
// ==========================================
initializeApp().catch(err => console.error("Failed to initialize app:", err));