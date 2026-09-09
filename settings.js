let settings = {};
let musicbrainzCache = {};
let lyricsCache = {};
const albumCache = {};

function basenameOf(p) {
    if (!p) return "";
    return p.replace(/\\/g, "/").split("/").pop();
}

async function persistSettings() {
    const result = await window.api.saveSettings(settings);
    if (!result.success) {
        console.error("Save failed:", result.error);
    }
}

/* =========================
    CHOOSE LIBRARY
========================= */

document.getElementById("xsettingpopup").addEventListener("click", () => {
   DOM.settings.popup.classList.add("hidden");
});

DOM.settings.button.addEventListener("click", () => {
    DOM.settings.popup.classList.remove("hidden");
});

DOM.folder.button.addEventListener("click", async () => {

    const folder = await window.api.pickFolder();

    if (!folder) return;

    settings.musicFolder = folder;
    await persistSettings();

    await loadLibraryFromFolder(folder);

});

document.getElementById("clear-cache")?.addEventListener("click", async () => {
    const confirmed = confirm(
        "CLEAR CACHE? This is a fresh slate: every song's MusicBrainz match, " +
        "any manual metadata edits, disabled/skip flags, and any manually " +
        "entered lyrics will be wiped and re-fetched from scratch next time " +
        "it's needed. Favorites, plsylists and custom covers are kept." +
        "If all you want is to delete a songs metadata: " +
        "CLICK SONG > MORE > DELETE METADATA"
    );
    if (!confirmed) return;

    const result = await window.api.clearCache();
    if (!result.success) {
        alert(`Failed to clear cache: ${result.error}`);
        return;
    }

    musicbrainzCache = await window.api.loadCache();
    lyricsCache = {};

    currentLibrary.forEach(song => {
        delete song.musicbrainz;
        if (song.lyrics) {
            song.lyrics.remote = null;
            song.lyrics.synced = null;
            song.lyrics.lines  = null;
            song.lyrics.source = null;
        }
    });

    showToast("Cache cleared");
    displaySongs(currentLibrary);

    if (currentLibrary.length > 0) {
        await enrichSongs(currentLibrary);
    }
});


async function loadLibraryFromFolder(folder) {
    if (!folder) return;

    songs = await window.api.scanMusicFolder(folder);
    currentLibrary = songs;

    displaySongs(currentLibrary);

    await enrichSongs(currentLibrary);

    displaySongs(currentLibrary);
    updateLibraryInfo(folder);

    if (currentLibrary.length > 0) {
        loadSong(currentLibrary[0], false);
    }
}

async function enrichSongs(songList) {
    const enriched = await window.api.enrichSongs(songList);
   enriched.forEach((updated, i) => {
        Object.assign(songList[i], updated);
    });
    musicbrainzCache = await window.api.loadCache();

    displaySongs(currentLibrary);
    updateLibraryInfo(settings.musicFolder);
}

/* =========================
   APP BOOTSTRAP
========================= */

async function initializeApp() {
    settings = await window.api.loadSettings();
    musicbrainzCache = await window.api.loadCache();
    lyricsCache = await window.api.loadCache("lyrics.json");

    setTheme(settings.theme || "MATRIX");
    setFont(settings.font || "VT323");
    setWallpaper(settings.wallpaper || null);

    if (settings.musicFolder) {
        try {
            await loadLibraryFromFolder(settings.musicFolder);
        } catch (err) {
            console.error("Failed to load library:", err);
        }
    }
}

/* =========================
   SETTINGS PAGE
========================= */

function updateLibraryInfo(folder) {

    DOM.settings.folderPath.textContent =
        folder ? "├── " + folder : "├── No folder selected";

    DOM.settings.songs.textContent =
        songs.length;

    DOM.settings.albums.textContent =
        new Set(
            songs.map(song => song.musicbrainz?.album ?? song.album)
        ).size;

    DOM.settings.artists.textContent =
        new Set(
            songs.map(song => song.musicbrainz?.artist ?? song.artist)
        ).size;

    const totalSeconds =
        songs.reduce(
            (sum, song) => sum + song.duration,
            0
        );

    DOM.settings.duration.textContent =
        formatLongDuration(totalSeconds);

}

/* =========================
   WALLPAPER PAGE
========================= */

DOM.settings.wallpaperButton.addEventListener("click", () => {
    DOM.wallpaper.popup.classList.remove("hidden");
});

DOM.wallpaper.close.addEventListener("click", () => {
    DOM.wallpaper.popup.classList.add("hidden");
});

function setWallpaper(imagePath) {

    if (!imagePath) {

        DOM.library.container.style.backgroundImage = "none";

    } else {

        const url = imagePath.replace(/\\/g, "/");

        DOM.library.container.style.backgroundImage =
            `linear-gradient(rgba(0,0,0,.8), rgba(0,0,0,.8)),
             url("file:///${url}")`;

        DOM.library.container.style.backgroundPosition = "center";
        DOM.library.container.style.backgroundRepeat = "no-repeat";
        DOM.library.container.style.backgroundSize = "cover";
    }

    settings.wallpaper = imagePath;
    persistSettings();

    DOM.settings.wallpaper.textContent =
        imagePath ? basenameOf(imagePath) : "None";
}

DOM.wallpaper.presets.forEach(button => {

    button.addEventListener("click", () => {

        setWallpaper(
            "imgs/" + button.dataset.wallpaper
        );

        DOM.wallpaper.popup.classList.add("hidden");

    });

});

DOM.wallpaper.none.addEventListener("click", () => {

    setWallpaper(null);

    DOM.wallpaper.popup.classList.add("hidden");

});

DOM.wallpaper.custom.addEventListener("click", async () => {

    const file = await window.api.pickImage();

    if (!file)
        return;

    setWallpaper(file);

    DOM.wallpaper.popup.classList.add("hidden");

});

/* =========================
   THEME PAGE
========================= */

DOM.theme.open.addEventListener("click", () => {
    DOM.theme.popup.classList.remove("hidden");
});

DOM.theme.close.addEventListener("click", () => {
    DOM.theme.popup.classList.add("hidden");
});

function setTheme(colorthemes) {

    const theme = themes[colorthemes];

    if (!theme) return;

    document.documentElement.style.setProperty("--main", theme.main);
    document.documentElement.style.setProperty("--second", theme.second);
    document.documentElement.style.setProperty("--third", theme.third);

    // Lets style.css hook into more than just the 3 color vars
    // (border style/radius, shadows, spacing, background texture, etc.)
    document.documentElement.dataset.theme = colorthemes;

    document.querySelectorAll("[data-icon]").forEach(icon => {
    icon.src = `imgs/${theme.folder}/${icon.dataset.icon}.png`; });

    settings.theme = colorthemes;
    persistSettings();

    DOM.settings.theme.textContent = colorthemes;

    DOM.theme.popup.classList.add("hidden");
}

DOM.settings.themeButtons.forEach(button => {

    button.addEventListener("click", () => {

        setTheme(button.dataset.theme);

    });


});

/* =========================
   FONT PAGE
========================= */

DOM.font.open.addEventListener("click", () => {
    DOM.font.popup.classList.remove("hidden");
});

DOM.font.close.addEventListener("click", () => {
    DOM.font.popup.classList.add("hidden");
});

function setFont(appfont){

    const font = fonts[appfont];

    if(!font) return;

document.documentElement.style.setProperty("--font", font.family);
document.documentElement.style.setProperty("--font-size", font.size);

    settings.font = appfont;
    persistSettings();

    DOM.settings.font.textContent = appfont;

}

DOM.settings.fontButtons.forEach(button => {

    button.addEventListener("click", () => {

        setFont(button.dataset.font);

        DOM.font.popup.classList.add("hidden");

    });

});

/* =========================
   EXTRACT AS TEXT
========================= */

async function copyToClipboard(text, typeName) {
    try {
        await navigator.clipboard.writeText(text);
        showToast(`${typeName} copied to clipboard!`);
    } catch (err) {
        console.error(`Failed to copy ${typeName}: `, err);
    }
}
function showToast(message) {
    const existing = document.getElementById("queue-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "queue-toast";
    toast.className = "fixed bottom-5 right-5 bg-neutral-900 text-main border border-main px-4 py-2 z-[9999] shadow-lg animate-bounce";
    toast.textContent = `${message.toUpperCase()}`;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 2500);
}

document.getElementById("songsext")?.addEventListener("click", () => {
    const songList = songs
        .map(s => `${s.artist || "Unknown Artist"} - ${s.title || s.name || "Unknown Artist"}`)
        .join("\n");

    copyToClipboard(songList, "Songs");
});

document.getElementById("albumsext")?.addEventListener("click", () => {
    const albums = [...new Set(songs.map(s => s.musicbrainz?.album ?? s.album))]
        .filter(Boolean)
        .sort();

    copyToClipboard(albums.join("\n"), "Albums");
});

document.getElementById("artistsext")?.addEventListener("click", () => {
    const artists = [...new Set(songs.map(s => s.musicbrainz?.artist ?? s.artist))]
        .filter(Boolean)
        .sort();

    copyToClipboard(artists.join("\n"), "Artists");
});

document.getElementById("favext")?.addEventListener("click", () => {
    const favList = songs
        .filter(s => s.favorite)
        .map(s => `${s.title || s.name || "Unknown Track"} - ${s.artist || "Unknown Artist"}`)
        .join("\n");

    if (!favList) {
        copyToClipboard("No favorite songs found.", "Favorites");
        return;
    }

    copyToClipboard(favList, "Favorites");
});