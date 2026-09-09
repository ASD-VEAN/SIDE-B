/* =========================
    CRT SYNCING TEXT ANIMATOR
========================= */
const SYNC_FRAMES = [
    "[SYNCING]",
    "[SYNCING.]",
    "[SYNCING..]",
    "[SYNCING...]"
];
let syncFrameIndex = 0;
setInterval(() => {
    syncFrameIndex = (syncFrameIndex + 1) % SYNC_FRAMES.length;
    document.querySelectorAll(".crt-syncing").forEach(el => {
        el.textContent = SYNC_FRAMES[syncFrameIndex];
    });
}, 250);

/* =========================
    LIBRARY DISPLAY
========================= */

function displaySongs(songList) {
    DOM.library.container.innerHTML = "";

    songList.forEach((song, index) => {
        const songbox = document.createElement("div");
        if (song.path) {
            songbox.dataset.path = song.path.toLowerCase();
        }

        const isActive = window.currentSong && (
            (song.path && window.currentSong.path === song.path) || 
            (song.id && window.currentSong.id === song.id)
        );
        songbox.className = `songbox ${isActive ? "active" : ""}`.trim();

        // Check if track is still waiting for enrichment
        const pathKey = (song.path || "").toLowerCase();
        const cached = musicbrainzCache[pathKey];
        const isSearching = !song.musicbrainz && (!cached || !cached.searched);

        songbox.innerHTML = `
    <span class="pl-[10px] w-[50px] self-center flex items-center gap-1">
        ${index + 1}.
    </span>

    <div class="flex flex-col w-full self-center pl-[10px]">
        <span class="song-title">${song.musicbrainz?.title ?? song.title}</span>
        <span class="artist-slot">
    ${isSearching 
        ? `<span class="crt-syncing opacity-50">${SYNC_FRAMES[0]}</span>` 
        : `<span class="song-artist">${song.musicbrainz?.artist ?? song.artist}</span>`
    }
</span>
    </div>

    <span class="song-album p-[5px] w-full self-center lg:text-wrap truncate">
        ${song.musicbrainz?.album ?? song.album}
    </span>

    <span class="w-fit px-[10px] self-center">
        ${formatDuration(song.duration)}
    </span>

    <div class="relative flex-shrink-0 self-center px-[10px]">
        <button class="queue-trigger p-1 text-sm opacity-60 hover:opacity-100 cursor-pointer" title="Playback options">•••</button>
        <div class="queue-menu hidden absolute right-0 mt-1 border-2 text-xs z-50 flex flex-col min-w-[120px] shadow-lg bg">
            <button class="queue-play-next text-left px-3 py-2 ">⏭ PLAY NEXT</button>
            <button class="queue-add text-left px-3 py-2">⇶ ADD TO QUEUE</button>
            <button class="addtopl text-left px-3 py-2">🗁 ADD TO PLAYLIST</button>
            <button class="favorite text-left px-3 py-2">☆ FAVORITE</button>
        </div>
    </div>
`;

// ── Bind Dropdown Operations ──────────────────────────────────────────
const trigger     = songbox.querySelector(".queue-trigger");
const menu        = songbox.querySelector(".queue-menu");
const btnPlayNext = songbox.querySelector(".queue-play-next");
const btnAddQueue = songbox.querySelector(".queue-add");
const favorite = songbox.querySelector(".favorite");
const addtopl = songbox.querySelector(".addtopl");

trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isCurrentlyHidden = menu.classList.contains("hidden");
    closeAllQueueMenus();
    if (isCurrentlyHidden) {
        menu.classList.remove("hidden");
    }
});

btnPlayNext.addEventListener("click", (e) => {
    e.stopPropagation();
    playNext(song);
    menu.classList.add("hidden");
});
btnAddQueue.addEventListener("click", (e) => {
    e.stopPropagation();
    addToQueue(song);
    menu.classList.add("hidden");
});
favorite.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdownFavorite(song.path);
    menu.classList.add("hidden");
});
addtopl.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    dropdownaddSongToPlaylist(song);
    menu.classList.add("hidden");
});

        songbox.addEventListener("click", () => {
            currentLibrary = songList;
            loadSong(song);
            displaySongs(songList); 
        });

        DOM.library.container.appendChild(songbox);
    });
}
function updateActiveSongUI() {
    if (!window.currentSong) return;

    const container = DOM.library?.container || document.getElementById("songs-container");
    if (!container) return;

    const songBoxes = container.querySelectorAll(".songbox");

    songBoxes.forEach((box) => {
        const isCurrent = box.dataset.path === window.currentSong.path || box.dataset.id == window.currentSong.id;

        if (isCurrent) {
            box.classList.add("active");
        } else {
            box.classList.remove("active");
        }
    });
}

/* =========================
    REAL-TIME IPC LISTENER 
========================= */
if (window.api && window.api.onSongEnriched) {
    window.api.onSongEnriched((updatedSong) => {
        if (!updatedSong || !updatedSong.path) return;

        const pathKey = updatedSong.path.toLowerCase();

        // 1. Update memory list object
        const songInList = songs.find(s => s.path && s.path.toLowerCase() === pathKey);
        if (songInList) {
            Object.assign(songInList, updatedSong);
        }

        // 2. Target exact song row element
        const songbox = document.querySelector(`.songbox[data-path="${pathKey}"]`);
        if (songbox) {
            const titleEl = songbox.querySelector(".song-title");
            const albumEl = songbox.querySelector(".song-album");

            if (titleEl) titleEl.textContent = updatedSong.musicbrainz?.title ?? updatedSong.title;
            if (albumEl) albumEl.textContent = updatedSong.musicbrainz?.album ?? updatedSong.album;
            const artistSlot = songbox.querySelector(".artist-slot");
            if (artistSlot) {
                artistSlot.innerHTML = `<span class="song-artist">${updatedSong.musicbrainz?.artist ?? updatedSong.artist}</span>`;
             }
        }

        // 3. Update player UI immediately if active
        if (window.currentSong && window.currentSong.path.toLowerCase() === pathKey) {
            window.currentSong = { ...window.currentSong, ...updatedSong };

            if (DOM.miniPlayer?.title) DOM.miniPlayer.title.textContent = updatedSong.musicbrainz?.title ?? updatedSong.title;
            if (DOM.miniPlayer?.artist) DOM.miniPlayer.artist.textContent = updatedSong.musicbrainz?.artist ?? updatedSong.artist;

            const cover = resolveCoverPath(updatedSong.customCover) ??
                          resolveCoverPath(updatedSong.musicbrainz?.remoteCover) ??
                          resolveCoverPath(updatedSong.cover);

            if (cover && DOM.library?.cover) {
                DOM.library.cover.querySelector("img").src = cover;
            }
        }
    });
}

const addBtn = document.getElementById("addtoplaylist");
if (addBtn) {
    const newBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newBtn, addBtn);
    newBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (window.currentSong) {
            addSongToPlaylist(window.currentSong);
        }
    });
}

/* =========================
    FAVORITE
========================= */
const favoriteImg = document.getElementById("favorite");

function toggleFavorite(path) {
    if (!path) return;

    const pathKey = path.toLowerCase();
    const song = songs.find(s => s.path.toLowerCase() === pathKey);

    if (song) {
        song.favorite = !song.favorite;

        if (!musicbrainzCache[pathKey]) {
            musicbrainzCache[pathKey] = {};
        }

        musicbrainzCache[pathKey].favorite = song.favorite;
        window.api.saveCache(musicbrainzCache);
        updateFavoriteIcon();
    }
}
function updateFavoriteIcon() {
    const favoriteImg = document.getElementById("favorite");
    if (!favoriteImg) return;

    const activeSong = window.currentSong;

    if (!activeSong) {
        favoriteImg.src = `imgs/${themes[settings.theme].folder}/star-nf.png`;
        return;
    }

    const themeFolder = themes[settings.theme]?.folder || "default";
    favoriteImg.src = activeSong.favorite 
        ? `imgs/${themeFolder}/star-f.png` 
        : `imgs/${themeFolder}/star-nf.png`;
}
if (favoriteImg) {
    favoriteImg.addEventListener("click", () => {
        if (currentSong && currentSong.path) {
            toggleFavorite(currentSong.path);
        }
    });
} else {
    console.error("Element #favorite was not found in the DOM!");
}