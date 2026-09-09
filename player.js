let followLyrics = true;
let lyricsTimer = null;
let serverPort = null;

let SERVER_PORT = null;
async function getServerPort() {
    if (SERVER_PORT === null) {
        SERVER_PORT = await window.api.getServerPort();
    }
    return SERVER_PORT;
}

function resolveCoverPath(p) {
    if (!p) return null;

    if (
        p.startsWith("data:") ||
        p.startsWith("http") ||
        p.startsWith("imgs/")
    ) {
        return p;
    }

    // Absolute filesystem path (e.g. cache/covers/*.jpg) — route through local server
    if (SERVER_PORT === null) return null; // not ready yet; caller should re-render once it is
    return `http://127.0.0.1:${SERVER_PORT}/media/${encodeURI(p.replace(/\\/g, "/"))}`;
}

async function loadCustomCovers(songList) {
    for (const song of songList) {
        const pathKey = (song.path || "").toLowerCase();

        // Check IndexedDB if track has a custom cover
        if (typeof CoverStore !== "undefined") {
            const coverURL = await CoverStore.getCoverURL(pathKey);
            if (coverURL) {
                song.cover = coverURL;
            }
        }
    }
    displaySongs(songList);
}

/* =========================
   AUDIO
========================= */

const audio = new Audio();
audio.addEventListener("timeupdate", updateLyrics);

const playImage = DOM.player.play.querySelector("img");
const miniPlayImage = DOM.miniPlayer.play.querySelector("img");

/* =========================
   COVER RENDER
========================= */

function renderCoverArt(song) {
    const cover =
        resolveCoverPath(song.customCover) ??
        resolveCoverPath(song.musicbrainz?.remoteCover) ??
        resolveCoverPath(song.cover) ??
        `imgs/${themes[settings.theme]?.folder ?? "MATRIX"}/music.png`;

    const fallbackCoverSrc = `imgs/${themes[settings.theme]?.folder ?? "MATRIX"}/music.png`;
    DOM.library.cover.innerHTML = `<img src="${cover}" onerror="this.onerror=null;this.src='${fallbackCoverSrc}';" class="w-full h-full object-cover">`;
    DOM.miniPlayer.cover.src = cover;
    DOM.miniPlayer.cover.onerror = () => {
        DOM.miniPlayer.cover.onerror = null;
        DOM.miniPlayer.cover.src = fallbackCoverSrc;
    };
}

let showingVideo = false;
const videoToggleBtn = document.getElementById("video-toggle");

function updateVideoButtonLabel() {
    if (!videoToggleBtn) return;
    videoToggleBtn.textContent = showingVideo ? "✕ COVER" : "▶ VIDEO";
}

let _videoMessageHandler = null;
let _videoTimeoutId = null;

function cleanupVideoListeners() {
    if (_videoMessageHandler) {
        window.removeEventListener("message", _videoMessageHandler);
        _videoMessageHandler = null;
    }
    if (_videoTimeoutId) {
        clearTimeout(_videoTimeoutId);
        _videoTimeoutId = null;
    }
}

function showVideoUnavailable(song, videoId, wasPlaying) {
    cleanupVideoListeners();
    renderCoverArt(song);
    showingVideo = false;
    updateVideoButtonLabel();

    if (wasPlaying) audio.play();

    const notice = document.createElement("div");
    notice.className = "absolute bottom-2 left-2 right-2 text-xs text-center opacity-80 underline cursor-pointer";
    notice.textContent = "Video unavailable here — Watch on YouTube";
    notice.addEventListener("click", () => {
        window.api.openVideoPlayer(videoId); // in-app BrowserView fallback
    });
    DOM.library.cover.appendChild(notice);
}

async function tryLoadVideo(song, videoId, port) {
    const wasPlaying = !audio.paused;
    audio.pause();

    const origin = `http://127.0.0.1:${port}`;
    DOM.library.cover.innerHTML = `
        <iframe 
            id="video-player"
            class="w-full h-full"
            src="https://www.youtube.com/embed/${videoId}?autoplay=1&fs=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(origin)}"
            frameborder="0"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowfullscreen></iframe>`;

    showingVideo = true;

    _videoMessageHandler = (event) => {
        if (!event.origin.includes("youtube.com")) return;
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        if (data.event === "onError") {
            showVideoUnavailable(song, videoId, wasPlaying);
        }
    };
    window.addEventListener("message", _videoMessageHandler);

    // No error after 7s = assume it's playing fine
    _videoTimeoutId = setTimeout(cleanupVideoListeners, 7000);
}

videoToggleBtn?.addEventListener("click", async () => {
    const song = window.currentSong;
    if (!song) return;

    if (showingVideo) {
        cleanupVideoListeners();
        showingVideo = false;
        renderCoverArt(song);
        updateVideoButtonLabel();
        audio.play();
        return;
    }

    const artist = song.musicbrainz?.artist ?? song.artist ?? "";
    const title  = song.musicbrainz?.title  ?? song.title  ?? "";

    videoToggleBtn.disabled = true;
    videoToggleBtn.textContent = "…";

    try {
        const result = await window.api.getMusicVideo({ artist, title });
        if (window.currentSong !== song) return;

        if (result?.success && result.videoId) {
            const port = await getServerPort();
            await tryLoadVideo(song, result.videoId, port);
        } else {
            alert(`No music video found${result?.error ? ": " + result.error : "."}`);
        }
    } catch (err) {
        console.error("Failed to load music video:", err);
        alert("Failed to load music video.");
    } finally {
        videoToggleBtn.disabled = false;
        updateVideoButtonLabel();
    }
});

/* =========================
   LYRICS RENDERING
========================= */

function renderPlainLyrics(text) {
    if (!text?.trim()) {
        DOM.lyrics.container.innerHTML = `<div class="opacity-50 p-4">No lyrics available.</div>`;
        return;
    }

    DOM.lyrics.container.innerHTML = "";

    text.split("\n").forEach(line => {
        const el = document.createElement("div");
        el.className = "lyric-line py-1 opacity-60 transition-all duration-300";
        el.textContent = line.trim() || "\u00A0";
        el.dir = "auto";
        DOM.lyrics.container.appendChild(el);
    });
}
function renderSyncedLyrics(lines) {
    if (!lines?.length) {
        DOM.lyrics.container.innerHTML = `<div class="opacity-50 p-4">No lyrics available.</div>`;
        return;
    }

    DOM.lyrics.container.innerHTML = "";

    lines.forEach((line, index) => {
        const el = document.createElement("div");
        el.className = "lyric-line py-1 opacity-60 transition-all duration-300";
        el.textContent = line.text || "\u00A0";
        el.dir = "auto";
        el.dataset.index = index;
        el.dataset.time  = line.time ?? 0;
        DOM.lyrics.container.appendChild(el);
    });
}

async function loadSong(song, autoplay = true) {
    if (!song) return;
    window.currentSong = song;
    currentSongIndex = currentLibrary.indexOf(song);
    if (currentSongIndex === -1) currentSongIndex = 0;

    const pathKey = (song.path || "").toLowerCase();
    const cached = musicbrainzCache[pathKey];

    if (cached) {
        song.musicbrainz = cached.musicbrainz || song.musicbrainz;
    }

    if (cached?.hasCustomCover && typeof CoverStore !== "undefined") {
        try {
            const customCoverUrl = await CoverStore.getCoverURL(pathKey);
            if (customCoverUrl) {
                if (song.cover && song.cover.startsWith("blob:")) {
                    URL.revokeObjectURL(song.cover);
                }
                song.customCover = customCoverUrl;
            }
        } catch (err) {
            console.error(err);
        }
    }

    const port = await getServerPort();
let formattedPath = `http://127.0.0.1:${port}/media/${encodeURI(song.path.replace(/\\/g, "/"))}`;
audio.src = formattedPath;

    DOM.miniPlayer.title.textContent = song.musicbrainz?.title ?? song.title;
    DOM.miniPlayer.artist.textContent = song.musicbrainz?.artist ?? song.artist;
    
    const artist = song.musicbrainz?.artist ?? song.artist;
    const album = song.musicbrainz?.album ?? song.album;
    const title = song.musicbrainz?.title ?? song.title;

    // clickable title
    DOM.library.title.innerHTML = "> ";
    const artistSpan = document.createElement("span");
    artistSpan.textContent = artist;
    artistSpan.style.cursor = "pointer";
    artistSpan.addEventListener("click", () => showArtistSongs(artist));
    const albumSpan = document.createElement("span");
    albumSpan.textContent = album;
    albumSpan.style.cursor = "pointer";
    albumSpan.addEventListener("click", () => showAlbumSongs(album));
    const titleSpan = document.createElement("span");
    titleSpan.textContent = title;
    DOM.library.title.appendChild(artistSpan);
    DOM.library.title.appendChild(document.createTextNode(" \\ "));
    DOM.library.title.appendChild(albumSpan);
    DOM.library.title.appendChild(document.createTextNode(" \\ "));
    DOM.library.title.appendChild(titleSpan);

    const cover =
    renderCoverArt(song);
    showingVideo = false;
    updateVideoButtonLabel();

    const useRemote = settings.preferRemoteLyrics;
    DOM.lyrics.current.textContent = "";

const lyrics = resolveLyrics(song);
if (lyrics.synced && lyrics.lines?.length) {
    renderSyncedLyrics(lyrics.lines);
} else if (lyrics.text) {
    renderPlainLyrics(lyrics.text);
} else {
    DOM.lyrics.container.innerHTML = `<div class="opacity-50 p-4">No lyrics available.</div>`;
}

    if (!DOM.lyrics.popup.classList.contains("hidden")) {
        populateLyrics();
    }

    if (autoplay) {
        audio.play();
    }

    audio.addEventListener('play', () => {
        if (!audioCtx) {
            setupAudioPipeline(audio);
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }, { once: false });

    updateTitleScroll();

    const songBoxes = document.querySelectorAll(".songbox");
    const currentPath = song.path?.toLowerCase();
    songBoxes.forEach(box => {
        if (currentPath && box.dataset.path === currentPath) {
            box.classList.add("active");
        } else {
            box.classList.remove("active");
        }
    });

    updateFavoriteIcon();
}

/* =========================
   PLAY / PAUSE
========================= */

function togglePlayback() {
    if (audio.paused)
        audio.play();
    else
        audio.pause();
}
DOM.player.play.addEventListener("click", togglePlayback);
DOM.miniPlayer.play.addEventListener("click", togglePlayback);


/* =========================
   PLAY BUTTONS
========================= */

function updatePlayButtons(isPlaying) {

    const theme = themes[settings.theme];

    const image = isPlaying ? "pause" : "play";

    playImage.src = `imgs/${theme.folder}/${image}.png`;
    miniPlayImage.src = `imgs/${theme.folder}/${image}.png`;

}
audio.addEventListener("play", () => updatePlayButtons(true));
audio.addEventListener("pause", () => updatePlayButtons(false));

/* =========================
   QUEUE SYSTEM
========================= */

let playQueue = [];

function addToQueue(song) {
    if (!song) return;
    playQueue.push(song);
    updateQueueUI();
    showToast(`Added "${song.musicbrainz?.title || song.title}" to queue`);
}

function playNext(song) {
    if (!song) return;
    playQueue.unshift(song);
    updateQueueUI();
    showToast(`"${song.musicbrainz?.title || song.title}" will play next`);
}

function removeFromQueue(index) {
    if (index >= 0 && index < playQueue.length) {
        const removed = playQueue.splice(index, 1)[0];
        updateQueueUI();
    }
}

function clearQueue() {
    playQueue = [];
    updateQueueUI();
}

function showQueueManager() {
    const popup = document.getElementById("queue-popup");
    const subtitle = document.getElementById("queue-subtitle");
    const listContainer = document.getElementById("queue-list");

    popup.classList.remove("hidden");

    if (playQueue.length === 0) {
        listContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 gap-2">
                <span>(QUEUE IS EMPTY)</span>
                <span class="opacity-60">Songs you add to play next will appear here.</span>
            </div>`;
        return;
    }

    listContainer.innerHTML = `
        <div class="flex justify-between items-center mb-3 pb-1">
            <span class="opacity-60">${playQueue.length} SONGS QUEUED</span>
            <button id="clear-queue-btn" class="default-btn text-xs text-red-400">✕ CLEAR ALL</button>
        </div>
        <div class="flex flex-col gap-2 max-h-[300px] overflow-y-auto themed-scrollbar" id="queue-list-items"></div>
    `;

    document.getElementById("clear-queue-btn")?.addEventListener("click", () => {
        clearQueue();
        showQueueManager();
    });

    const itemsContainer = document.getElementById("queue-list-items");
    const currentTheme = themes[settings.theme]?.folder || "default";

    playQueue.forEach((song, idx) => {
        const row = document.createElement("div");
        row.className = "p-2 border-1 bg flex items-center justify-between gap-3 text-sm";
        row.innerHTML = `
                <div class="flex items-center gap-3 overflow-hidden flex-1">
                <span>${idx + 1}.</span>
                        <img class="size-10 object-cover flex-shrink-0" src="${song.cover || `imgs/${currentTheme}/music.png`}">
                    <div class="flex flex-col truncate">
                    <span class="font-bold truncate">${song.musicbrainz?.title || song.title}</span>
                    <span class="opacity-70 text-xs truncate">${song.musicbrainz?.artist || song.artist}</span>
                </div>
                </div>

                <button class="remove-queue-item text-red-400 hover:text-red-500 font-mono px-2" data-index="${idx}">✕</button>
            `;

        row.querySelector(".remove-queue-item").addEventListener("click", (e) => {
            e.stopPropagation();
            removeFromQueue(idx);
            showQueueManager(); // Refresh view
        });

        itemsContainer.appendChild(row);
    });
}

function updateQueueUI() {
    const queueBtn = document.getElementById("view-queue-btn");
    if (queueBtn) {
        queueBtn.innerText = `⇶ QUEUE [${playQueue.length}]`;
        queueBtn.classList.toggle("border-main", playQueue.length > 0);
    }
}

document.getElementById("queue-close").addEventListener("click", e => {
    document.getElementById("queue-popup").classList.add("hidden");
});
document.getElementById("view-queue-btn")?.addEventListener("click", showQueueManager);

/* =========================
   DROPDOWN MENU OPTIONS
========================= */

function dropdownFavorite(path) {
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

        showToast(
            song.favorite
                ? `FAVORITED "${song.musicbrainz?.title || song.title}"`
                : `UNFAVORITED "${song.musicbrainz?.title || song.title}"`
        );
    }
}

async function dropdownaddSongToPlaylist(song) {
    const names = Object.keys(playlists);

    const messageText = names.length
        ? `EXISTING: ${names.join(", ")}\n(Type an existing name or a new one to create it)`
        : `CREATING PLAYLIST FOR "${song.musicbrainz?.title ?? song.title}"`;

    const name = await showCustomPrompt({
        title: `ADD TO PLAYLIST`,
        message: messageText,
        fields: [{ key: "value", label: "PLAYLIST NAME:", placeholder: "PLST 001" }]
    });

    if (!name) return;

    if (!playlists[name]) playlists[name] = [];

    const pathKey = song.path.toLowerCase();

    if (!playlists[name].includes(pathKey)) {
        playlists[name].push(pathKey);
        savePlaylists();
        showToast(`ADDED "${song.musicbrainz?.title || song.title}" TO "${name}"`);
    } else {
        showToast(`"${song.musicbrainz?.title || song.title}" IS ALREADY IN "${name}".`);
    }
}

/* =========================
   SHUFFLE / LOOP
========================= */

DOM.player.shuffle.addEventListener("click", () => {
    shuffle = !shuffle;
    if (shuffle) {
        DOM.player.shuffle.classList.add("active");
        DOM.player.shuffleImage.style.filter = "drop-shadow(2px 2px 3px var(--main))";
    } else {
        DOM.player.shuffle.classList.remove("active");
        DOM.player.shuffleImage.style.filter = "";
    }
});

DOM.player.loop.addEventListener("click", () => {
    loop = !loop;
    if (loop) {
        DOM.player.loop.classList.add("active");
        DOM.player.loopImage.style.filter = "drop-shadow(-2px 2px 3px var(--main))";
    } else {
        DOM.player.loop.classList.remove("active");
        DOM.player.loopImage.style.filter = "";
    }
});

/* =========================
   NEXT SONG / TRANSITION LOGIC
========================= */

function nextSong() {
    // 1. Play items in the explicit playback queue first
    if (playQueue.length > 0) {
        const nextFromQueue = playQueue.shift();
        updateQueueUI();
        loadSong(nextFromQueue, true);
        return;
    }

    // 2. Fall back to standard playlist context if queue is empty
    if (currentLibrary.length === 0) return;

    if (shuffle) {
        let random;
        do {
            random = Math.floor(Math.random() * currentLibrary.length);
        } while (currentLibrary.length > 1 && random === currentSongIndex);

        currentSongIndex = random;
    } else {
        currentSongIndex++;
        if (currentSongIndex >= currentLibrary.length) {
            currentSongIndex = 0;
        }
    }

    loadSong(currentLibrary[currentSongIndex], true);
}

DOM.player.next.addEventListener("click", nextSong);
DOM.miniPlayer.next.addEventListener("click", nextSong);

/* =========================
   PREVIOUS SONG
========================= */

function previousSong() {
    if (currentLibrary.length === 0) return;

    if (shuffle) {
        let random;
        do {
            random = Math.floor(Math.random() * currentLibrary.length);
        } while (currentLibrary.length > 1 && random === currentSongIndex);

        currentSongIndex = random;
    } else {
        currentSongIndex--;
        if (currentSongIndex < 0) {
            currentSongIndex = currentLibrary.length - 1;
        }
    }

    loadSong(currentLibrary[currentSongIndex], true);
}

DOM.player.back.addEventListener("click", previousSong);
DOM.miniPlayer.back.addEventListener("click", previousSong);

/* =========================
   AUTO NEXT
========================= */

audio.addEventListener("ended", () => {
    // Loop current playing track if enabled
    if (loop) {
        audio.currentTime = 0;
        audio.play();
        return;
    }

    // Run queue or standard play cycle
    nextSong();
});

/* =========================
   PROGRESS BAR
========================= */

audio.addEventListener("timeupdate", () => {

    DOM.player.slider.max =
        audio.duration || 0;

    DOM.player.slider.value =
        audio.currentTime;

    DOM.player.currentTime.textContent =
        formatTime(
            Math.floor(audio.currentTime)
        );

    DOM.player.totalTime.textContent =
        formatTime(
            Math.floor(audio.duration || 0)
        );

    updateSlider();

});

DOM.player.slider.addEventListener("input", () => {

    audio.currentTime =
        DOM.player.slider.value;

});

function updateSlider() {

    const percent =
        ((DOM.player.slider.value - DOM.player.slider.min) /
        (DOM.player.slider.max - DOM.player.slider.min || 1)) * 100;

    DOM.player.slider.style.setProperty(
        "--progress",
        percent + "%"
    );

}

/* =========================
   TIME FORMATTING
========================= */

function formatTime(seconds) {

    const mins =
        Math.floor(seconds / 60);

    const secs =
        Math.floor(seconds % 60);

    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

}

function formatDuration(seconds) {

    const mins =
        Math.floor(seconds / 60);

    const secs =
        Math.floor(seconds % 60);

    return `${mins}:${String(secs).padStart(2, "0")}`;

}

function formatLongDuration(seconds) {

    seconds = Math.floor(seconds);

    const hours =
        Math.floor(seconds / 3600);

    const mins =
        Math.floor((seconds % 3600) / 60);

    const secs =
        seconds % 60;

    return `${hours}h ${mins}m ${secs}s`;

}


/* =========================
   LYRICS
========================= */

DOM.lyrics.current.addEventListener("click", () => {

    DOM.lyrics.popup.classList.remove("hidden");
    populateLyrics();

});
DOM.lyrics.close.addEventListener("click", () => {

    DOM.lyrics.popup.classList.add("hidden");
    populateLyrics();

});
DOM.lyrics.container.addEventListener("wheel", () => {

    followLyrics = false;

    clearTimeout(lyricsTimer);

    lyricsTimer = setTimeout(() => {

        followLyrics = true;

    }, 4000);

});

// Ensure song.lyrics object always exists defensively
function ensureLyricsObject(song) {
    if (!song) return;
    if (!song.lyrics) {
        song.lyrics = { remote: null, synced: null, embedded: null, lines: [] };
    }
}

async function fetchLyrics(song) {
    if (!song) return;
    ensureLyricsObject(song);

    // If lines already parsed, skip fetching
    if (song.lyrics.lines?.length || song.lyrics.remote) return;

    // 1. Try Cache First
    const pathKey = song.path ? song.path.toLowerCase() : "";
    const cachedEntry = musicbrainzCache[pathKey];

    if (cachedEntry?.lyrics?.synced || cachedEntry?.lyrics?.remote) {
        song.lyrics.remote = cachedEntry.lyrics.remote;
        song.lyrics.synced = cachedEntry.lyrics.synced;
        song.lyrics.lines = parseLRC(song.lyrics.synced);

        if (currentLibrary[currentSongIndex]?.path === song.path) {
            populateLyrics();
        }
        return;
    }

    // 2. Fetch from API
    try {
        const lyrics = await window.api.getLyrics(song);
        if (!lyrics) return;

        song.lyrics.remote = lyrics.plainLyrics || "";
        song.lyrics.synced = lyrics.syncedLyrics || "";
        song.lyrics.lines = parseLRC(song.lyrics.synced);

        if (song.musicbrainz?.recordingId) {
            lyricsCache[song.musicbrainz.recordingId] = lyrics;
            await window.api.saveCache({ data: lyricsCache, filename: "lyrics.json" });
        }

        // Preserve existing cached properties when updating lyrics
        musicbrainzCache[pathKey] = {
            ...(musicbrainzCache[pathKey] || {}),
            musicbrainz: song.musicbrainz || musicbrainzCache[pathKey]?.musicbrainz || null,
            lyrics: {
                remote: song.lyrics.remote,
                synced: song.lyrics.synced
            }
        };

        await window.api.saveCache({ data: musicbrainzCache, filename: "musicbrainz.json" });
        console.log("Lyrics cached:", song.title);

        // Re-render UI if this song is actively playing
        if (currentLibrary[currentSongIndex]?.path === song.path) {
            populateLyrics();
        }
    } catch (err) {
        console.error("Failed to fetch lyrics for:", song.title, err);
    }
}

function parseLRC(text) {
    if (!text) return [];

    return text
        .split("\n")
        .map(line => {
            // Matches [MM:SS], [MM:SS.xx], or [MM:SS.xxx]
            const match = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
            if (!match) return null;

            return {
                time: Number(match[1]) * 60 + Number(match[2]),
                text: match[3].trim() // Can be empty string "" for instrumental lines
            };
        })
        .filter(Boolean);
}

function updateLyrics() {
    const song = window.currentSong;
    if (!song) return;
    ensureLyricsObject(song);

    // Ensure lines array is built if raw synced text exists
    if (!song.lyrics.lines?.length && song.lyrics.synced) {
        song.lyrics.lines = parseLRC(song.lyrics.synced);
    }

    if (song.lyrics.lines?.length) {
        const t = audio.currentTime;
        let current = 0;

        while (
            current + 1 < song.lyrics.lines.length &&
            song.lyrics.lines[current + 1].time <= t
        ) {
            current++;
        }

        renderLyrics(song.lyrics.lines, current);
        updateLyricsPopup(current);
        return;
    }

    // Unsynced Fallbacks
    const remoteText = song.lyrics?.remote ?? null;
    const embeddedText = song.lyrics?.embedded ?? null;
    const plainText = settings.preferRemoteLyrics
        ? (remoteText ?? embeddedText)
        : (embeddedText ?? remoteText);

    if (plainText) {
        DOM.lyrics.current.dir = "auto";
        DOM.lyrics.current.textContent = plainText.split("\n")[0] || "...";
    } else {
        DOM.lyrics.current.textContent = "No lyrics.";
    }
}

function renderLyrics(lines, current) {
    if (!lines || current < 0 || current >= lines.length) {
        DOM.lyrics.current.textContent = "";
        return;
    }

    // Explicitly check for undefined instead of falsy so empty strings render as "..."
    const currentText = lines[current].text;
    DOM.lyrics.current.dir = "auto";
    DOM.lyrics.current.textContent = currentText ? `> ${currentText}` : "> ...";

    if (DOM.lyrics.counter) {
        DOM.lyrics.counter.textContent = `${current + 1} / ${lines.length}`;
    }
}

function populateLyrics() {
    const song = window.currentSong;
    if (!song) return;
    ensureLyricsObject(song);

    // Re-parse lines if needed
    if (!song.lyrics.lines?.length && song.lyrics.synced) {
        song.lyrics.lines = parseLRC(song.lyrics.synced);
    }

    DOM.lyrics.container.innerHTML = "";
    let lines = [];

    if (song.lyrics.lines?.length) {
        lines = song.lyrics.lines.map(x => x.text || "...");
    } else {
        const remoteText = song.lyrics?.remote ?? null;
        const embeddedText = song.lyrics?.embedded ?? null;

        const text = settings.preferRemoteLyrics 
            ? (remoteText ?? embeddedText ?? "")
            : (embeddedText ?? remoteText ?? "");

        lines = text ? text.split("\n") : [];
    }

    lines.forEach(line => {
        const div = document.createElement("div");
        div.className = "lyrics-line";
        div.textContent = line;
        div.dir = "auto";
        DOM.lyrics.container.appendChild(div);
    });

    updateLyrics();
}

function updateLyricsPopup(current) {
    const elements = DOM.lyrics.container.children;
    if (!elements || elements.length === 0) return;

    for (const el of elements) {
        el.classList.remove("lyrics-active");
        el.classList.add("lyrics-dim");
    }

    const currentLine = elements[current];
    if (!currentLine) return;

    currentLine.classList.remove("lyrics-dim");
    currentLine.classList.add("lyrics-active");

    if (followLyrics) {
        currentLine.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    }
}