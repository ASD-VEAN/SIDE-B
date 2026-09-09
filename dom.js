function closeAllQueueMenus() {
    document.querySelectorAll(".queue-menu").forEach(menu => {
        menu.classList.add("hidden");
    });
}

document.addEventListener("click", (e) => {
    if (!e.target.closest(".queue-trigger")) {
        closeAllQueueMenus();
    }
});

document.addEventListener("scroll", (e) => {
    if (e.target.classList && e.target.classList.contains("overflow-y-auto")) {
        closeAllQueueMenus();
    }
}, true);

const DOM = {

    // =========================
    // PLAYER
    // =========================

    player: {

        play: document.getElementById("play"),
        next: document.getElementById("next"),
        back: document.getElementById("back"),

        shuffle: document.getElementById("shuffle"),
        loop: document.getElementById("loop"),

        shuffleImage: document.getElementById("shuffle").querySelector("img"),

        loopImage: document
            .getElementById("loop")
            .querySelector("img"),

        slider: document.getElementById("progress"),

        currentTime: document.getElementById("progress-value"),
        totalTime: document.getElementById("overall-value"),
    },

    miniPlayer: {
    cover: document.getElementById("mini-cover"),
    title: document.getElementById("mini-title"),
    artist: document.getElementById("mini-artist"),

    play: document.getElementById("mini-play"),
    next: document.getElementById("mini-next"),
    back: document.getElementById("mini-back")
    },

    // =========================
    // LIBRARY
    // =========================

    library: {

        container: document.getElementById("library"),
        cover: document.getElementById("cover"),
        title: document.getElementById("title"),
        songAlbum: document.getElementById("songalbum"),

    },

    // =========================
    // TOP BAR
    // =========================

    topbar: {

        search: document.getElementById("search"),
        favs: document.getElementById("favs-btn"),
        songs: document.getElementById("songs-btn"),
        artists: document.getElementById("artists-btn"),
        albums: document.getElementById("albums-btn"),
        playlists: document.getElementById("playlists-btn"),
        searchToggle: document.getElementById("search-mode-toggle")

    },

    // =========================
    // FOLDER POPUP
    // =========================

    folder: {

        button: document.getElementById("file-select")

    },

    // =========================
    // SETTINGS
    // =========================

    settings: {

        popup: document.getElementById("settings-popup"),
        button: document.getElementById("settings-btn"),

        folderPath: document.getElementById("file-src"),

    songs: document.getElementById("info-songs"),
    albums: document.getElementById("info-albums"),
    artists: document.getElementById("info-artists"),
    duration: document.getElementById("info-duration"),

    wallpaper: document.getElementById("current-wallpaper"),
    theme: document.getElementById("current-theme"),
    font: document.getElementById("current-font"),
    wallpaperButton: document.getElementById("wallpaper-btn"),
    themeButtons: document.querySelectorAll(".theme-btn"),
    fontButtons: document.querySelectorAll(".font-btn")
    },

    lyrics: {
    container: document.getElementById("lyrics-container"),
    counter: document.getElementById("lyrics-counter"),
    current: document.getElementById("lyrics-current"),
    popup: document.getElementById("lyrics-popup"),
    close: document.getElementById("closeLyrics"),
    window: document.getElementById("lyrics-window"),
    titlebar: document.getElementById("lyrics-titlebar"),
    button: document.getElementById("lyric-btn")
    },

    wallpaper: {
        popup: document.getElementById("wallpaper-popup"),
        close: document.getElementById("close-wallpaper"),
        custom: document.getElementById("custom-wallpaper"),
        none: document.getElementById("no-wallpaper"),
        presets: document.querySelectorAll("[data-wallpaper]")
    },

    theme: {
        open: document.getElementById("theme-btn"),
        close: document.getElementById("close-theme"),
        custom:document.getElementById("custom-theme"),
        popup: document.getElementById("theme-popup")
    },

    font: {
        open: document.getElementById("font-btn"),
        close: document.getElementById("close-font"),
        custom:document.getElementById("custom-font"),
        popup: document.getElementById("font-popup")
    }

};

const themes = {

    MATRIX: {
        main: "#76CB65",
        second:"#76cb650e",
        third: "#000000",
        folder: "MATRIX"
    },

    GAMEBOY: {
        main: "#21260e",
        second:"#767c5e1e",
        third: "#8c9470",
        folder: "GAMEBOY"
    },

    CYBERPUNK: {
        main: "#78c591",
        second:"#86e2b710",
        third: "#000000",
        folder: "CYBERPUNK"
    },

    ERR0R: {
        main: "#5e1414",
        second:"#25040411",
        third: "#000000",
        folder: "ERR0R"
    },

    WARNING: {
        main: "#ee6404",
        second:"#441e021c",
        third: "#0a0a0a",
        folder: "WARNING"
    },

    NOIR: {
        main: "#a3a3a3",
        second:"#a3a3a30c",
        third: "#0a0a0a",
        folder: "NOIR"
    },

    POWERSHELL: {
        main: "#b3b3b3",
        second:"#e1e2b711",
        third: "#18173b",
        folder: "POWERSHELL"
    },

    ENTHROPY: {
        main: "#b6ae9e",
        second:"#b6ae9e08",
        third: "#050505",
        folder: "ENTHROPY"
    },

    GENESIS: {
        main: "#000000",
        second:"#00000010",
        third: "#ffffff",
        folder: "GENESIS"
    }


};

const fonts = {

    VT323: {
    family: "'VT323', 'Vazirmatn', monospace",
    size: "16px"
    },

    PERFECTDOSVGA437: {
        family: "'Perfect DOS VGA 437', 'Vazirmatn', monospace",
        size: "14px"
    },

    PIXELOPERATOR: {
        family: "'Pixel Operator', 'Vazirmatn', monospace",
        size: "16px"
    },

    IBMPLEXMONO: {
        family: "'IBM Plex Mono', 'Vazirmatn', monospace",
        size: "14px"
    },

    OXANIUM: {
        family: "'Oxanium', 'Vazirmatn', monospace",
        size: "15px"
    },

    ORBITRON: {
        family: "'Orbitron', 'Vazirmatn', monospace",
        size: "13px"
    },

    SILKSCREEN: {
        family: "'Silkscreen', 'Vazirmatn', monospace",
        size: "14px"
    },

    WALLPOET: {
        family: "'Wallpoet', 'Vazirmatn', monospace",
        size: "14px"
    }

};

DOM.more = {

    popup: document.getElementById("more-popup"),

    open: document.getElementById("more"),

    delete: document.getElementById("delete"),

    sleep: document.getElementById("sleeptimer"),

    eq: document.getElementById("eq"),

    visualizer: document.getElementById("vis"),

    speed: document.getElementById("speed"),

    editInfo: document.getElementById("edit-info"),

    refresh: document.getElementById("editmd"),

    disable: document.getElementById("nomd"),

    lyrics: document.getElementById("edit-lyrics"),

    recs: document.getElementById("recs"),

    artist: document.getElementById("gotoartist"),

    album: document.getElementById("gotoalbum"),

    links: document.getElementById("external-links"),

    info: document.getElementById("more-info"),

    statusCover: document.getElementById("status-cover"),

    statusMetadata: document.getElementById("status-mb"),

    statusLyrics: document.getElementById("status-lyrics")

};