/* =========================
   TOP BAR
========================= */

// Unified Audio Preview & Playback States
window.activePreviewAudio = window.activePreviewAudio || null;
window.mainAudioWasPlaying = window.mainAudioWasPlaying || false;

// SONGS
function showSongs() {
    currentLibrary = songs;
    clearPlaylistControls();
    displaySongs(currentLibrary);
}

// ARTISTS
function showArtists() {
    DOM.library.container.innerHTML = "";
    clearPlaylistControls();

    const artists = [...new Set(songs.map(song => song.musicbrainz?.artist ?? song.artist))];
    artists.sort();

    artists.forEach(artist => {
        const box = document.createElement("div");
        box.className = "songbox";
        box.innerHTML = `
            <img data-icon="artist" src="imgs/${themes[settings.theme].folder}/artist.png" class="size-[50px]">
            <span class="px-[20px] self-center">${artist}</span>
        `;
        box.addEventListener("click", () => showArtistSongs(artist));
        DOM.library.container.appendChild(box);
    });
}

function showArtistSongs(artist) {
    currentLibrary = songs.filter(song => (song.musicbrainz?.artist ?? song.artist) === artist);
    clearPlaylistControls();
    displaySongs(currentLibrary);
}

// ALBUMS
function showAlbums() {
    clearPlaylistControls();
    DOM.library.container.innerHTML = "";

    const albums = [...new Set(songs.map(song => song.musicbrainz?.album ?? song.album))];
    albums.sort();

    albums.forEach(album => {
        const box = document.createElement("div");
        box.className = "songbox";
        box.innerHTML = `
            <img data-icon="album" src="imgs/${themes[settings.theme].folder}/album.png" class="size-[50px]">
            <span class="px-[20px] self-center">${album}</span>
        `;
        box.addEventListener("click", () => showAlbumSongs(album));
        DOM.library.container.appendChild(box);
    });
}

function showAlbumSongs(album) {
    currentLibrary = songs.filter(song => (song.musicbrainz?.album ?? song.album) === album);
    clearPlaylistControls();
    displaySongs(currentLibrary);
}

// FAVORITES
function showFavorites() {
    clearPlaylistControls();
    DOM.library.container.innerHTML = "";

    currentLibrary = songs.filter(song => song.favorite);

    if (currentLibrary.length === 0) {
        DOM.library.container.innerHTML = `<div class="p-4 text-center opacity-70">No favorite songs yet.</div>`;
        return;
    }

    displaySongs(currentLibrary);
}

// BUTTONS
DOM.topbar.favs.addEventListener("click", showFavorites);
DOM.topbar.playlists.addEventListener("click", showPlaylists);
DOM.topbar.songs.addEventListener("click", showSongs);
DOM.topbar.artists.addEventListener("click", showArtists);
DOM.topbar.albums.addEventListener("click", showAlbums);

/* =========================
   PLAYLISTS
========================= */

let playlists = {};
(async () => {
    playlists = await window.api.loadCache("playlists.json");
})();

function savePlaylists() {
    window.api.saveCache(playlists, "playlists.json");
}
function showPlaylists() {
    clearPlaylistControls();
    DOM.library.container.innerHTML = "";

    const newBox = document.createElement("div");
    newBox.className = "songbox cursor-pointer";
    newBox.innerHTML = `<span class="px-[10px] self-center">+ New Playlist</span>`;
    newBox.addEventListener("click", createPlaylist);
    DOM.library.container.appendChild(newBox);

    const names = Object.keys(playlists);

    if (names.length === 0) {
        const hint = document.createElement("div");
        hint.className = "p-[10px]";
        DOM.library.container.appendChild(hint);
    }

    names.forEach(name => {
        const box = document.createElement("div");
        box.className = "songbox cursor-pointer";
        box.innerHTML = `
            <span class="px-[20px] self-center w-full">${name}</span>
            <span class="px-[10px] self-center opacity-60">${playlists[name].length} SONGS</span>
        `;
        box.addEventListener("click", () => showPlaylistSongs(name));
        DOM.library.container.appendChild(box);
    });
}
function showPlaylistSongs(name) {
    const paths = playlists[name] || [];

    currentLibrary = paths
        .map(path => songs.find(s => s.path.toLowerCase() === path))
        .filter(Boolean);

    document.getElementById("playlistBar")?.remove();

    const bar = document.createElement("div");
    bar.id = "playlistBar";
    bar.className = "flex justify-between items-center mx-6 py-1 mb-2 border-b-1";
    bar.innerHTML = `
        <span class="font-bold">.../PLAYLIST/${name.toUpperCase()}</span>
        <button id="manageBtn" class="default-btn">⚙ MANAGE</button>
    `;

    DOM.library.container.before(bar);
    document.getElementById("manageBtn")?.addEventListener("click", () => managePlaylist(name));

    displaySongs(currentLibrary);
}
async function createPlaylist() {
    const name = await showCustomPrompt({
        title: "CREATE PLAYLIST",
        fields: [{ key: "value", label: "PLAYLIST NAME:", placeholder: "PLST 001" }]
    });

    if (!name || playlists[name]) return;

    playlists[name] = [];
    savePlaylists();
    showPlaylists();
}
async function addSongToPlaylist(song) {
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
        showToast(`ADDED TO "${name}".`);
    } else {
        showToast(`ALREADY IN "${name}".`);
    }
}
async function managePlaylist(playlistName) {
    const songPaths = playlists[playlistName] || [];

    const playlistSongs = songPaths
        .map(path => songs.find(s => s.path.toLowerCase() === path))
        .filter(Boolean);

    const listText = playlistSongs.length > 0
        ? playlistSongs.map((s, idx) => `[${idx + 1}] ${s.musicbrainz?.title ?? s.title}`).join("\n")
        : "(EMPTY PLAYLIST)";

    const response = await showCustomPrompt({
        title: `MANAGE: ${playlistName.toUpperCase()}`,
        message: `${listText}\n\nCOMMANDS:\n• Type number (e.g. "2") to DELETE\n• Type "MOVE 2 TO 1" to reorder\n• Type "CLEAR" to empty\n• Type "DELETE PLAYLIST" to delete`,
        fields: [{ key: "value", label: "COMMAND:", placeholder: "e.g., DELETE PLAYLIST or 1" }]
    });

    if (!response) return;

    const rawInput = typeof response === "string"
        ? response
        : (response.value || response.action || "");

    const input = rawInput.trim().toUpperCase();
    if (!input) return;

    if (input === "DELETE PLAYLIST") {
        delete playlists[playlistName];
        savePlaylists();
        showPlaylists();
        return;
    }

    if (input === "CLEAR") {
        playlists[playlistName] = [];
        savePlaylists();
        showPlaylistSongs(playlistName);
        return;
    }

    if (input.startsWith("MOVE")) {
        const numbers = input.match(/\d+/g);
        if (!numbers || numbers.length < 2) {
            alert("PLEASE SPECIFY TWO NUMBERS (e.g. MOVE 3 TO 1).");
            return;
        }
        const fromIndex = parseInt(numbers[0], 10) - 1;
        const toIndex   = parseInt(numbers[1], 10) - 1;
        const list = playlists[playlistName];
        if (isValidIndex(fromIndex, list) && isValidIndex(toIndex, list)) {
            const [movedPath] = list.splice(fromIndex, 1);
            list.splice(toIndex, 0, movedPath);
            savePlaylists();
            showPlaylistSongs(playlistName);
        } else {
            alert(`INVALID TRACK NUMBERS. Enter numbers between 1 and ${list.length}.`);
        }
        return;
    }

    if (/^\d+$/.test(input)) {
        const deleteIndex = parseInt(input, 10) - 1;
        if (isValidIndex(deleteIndex, playlists[playlistName])) {
            playlists[playlistName].splice(deleteIndex, 1);
            savePlaylists();
            showPlaylistSongs(playlistName);
        } else {
            alert("TRACK NUMBER OUT OF RANGE.");
        }
        return;
    }

    alert("UNRECOGNIZED COMMAND.");
}
function isValidIndex(index, array) {
    return Array.isArray(array) && index >= 0 && index < array.length;
}
function clearPlaylistControls() {
    document.getElementById("playlistBar")?.remove();
    document.getElementById("fabManage")?.remove();
    if (DOM.library.actions) DOM.library.actions.innerHTML = "";
}

/* =========================
   SEARCH BAR
========================= */

DOM.topbar.searchToggle = document.getElementById("search-mode-toggle");

DOM.topbar.searchToggle?.addEventListener("click", () => {
    isOnlineSearch = !isOnlineSearch;
    DOM.topbar.searchToggle.innerText = isOnlineSearch ? "[ONLINE]" : "[LOCAL]";
    DOM.topbar.searchToggle.classList.toggle("bg-white/20", isOnlineSearch);
    searchSongs();
});

DOM.topbar.search.addEventListener("input", () => {
    if (isOnlineSearch) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(searchSongs, 300);
    } else {
        searchSongs();
    }
});

// ==========================================
// ONLINE SEARCH PROVIDERS
// ==========================================

async function searchITunes(query) {
    try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=10`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.results || []).map(item => ({
            source: "iTunes",
            title: item.trackName,
            artist: item.artistName,
            album: item.collectionName || "",
            artwork: item.artworkUrl100,
            previewUrl: item.previewUrl
        }));
    } catch (e) {
        console.warn("iTunes search failed:", e);
        return [];
    }
}
async function searchMusicBrainz(query) {
    try {
        const res = await fetch(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=8`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.recordings || []).map(item => ({
            source: "MusicBrainz",
            title: item.title,
            artist: item['artist-credit']?.[0]?.name || "Unknown Artist",
            album: item.releases?.[0]?.title || "Single / Unknown Album",
            previewUrl: null
        }));
    } catch (e) {
        console.warn("MusicBrainz search failed:", e);
        return [];
    }
}
async function searchLastFm(query) {
    const lastFmKey = typeof apiKey !== "undefined" ? apiKey : (typeof LASTFM_API_KEY !== "undefined" ? LASTFM_API_KEY : null);
    if (!lastFmKey) return [];
    try {
        const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(query)}&api_key=${lastFmKey}&format=json&limit=8`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.results?.trackmatches?.track || []).map(item => ({
            source: "Last.fm",
            title: item.name,
            artist: item.artist,
            album: "Last.fm Result",
            previewUrl: null
        }));
    } catch (e) {
        console.warn("Last.fm search failed:", e);
        return [];
    }
}
async function searchBandcamp(query) {
    try {
        const res = await fetch(`https://bandcamp.com/api/fuzzysearch/1/autocomplete?q=${encodeURIComponent(query)}`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.auto?.results || [])
            .filter(item => item.type === "t" || item.type === "a")
            .slice(0, 6)
            .map(item => ({
                source: "Bandcamp",
                title: item.name,
                artist: item.band_name || "Bandcamp Artist",
                album: item.album_name || "Bandcamp Release",
                artwork: item.img,
                externalUrl: item.url
            }));
    } catch (e) {
        console.warn("Bandcamp search failed:", e);
        return [];
    }
}
async function searchInternetArchive(query) {
    try {
        const res = await fetch(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}+AND+mediatype:(audio)&fl[]=identifier,title,creator,album&sort[]=&rows=5&page=1&output=json`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.response?.docs || []).map(item => ({
            source: "Archive.org",
            title: item.title || "Untitled Recording",
            artist: item.creator || "Unknown Creator",
            album: item.album || "Live / Tape Archive",
            previewUrl: null,
            externalUrl: `https://archive.org/details/${item.identifier}`
        }));
    } catch (e) {
        console.warn("Archive.org search failed:", e);
        return [];
    }
}

function appendSearchHeader(title) {
    const header = document.createElement("div");
    header.className = "w-full pt-4 pb-2 opacity-50 uppercase font-mono text-xs";
    header.textContent = " ☆--- " + title;
    DOM.library.container.appendChild(header);
}

// ==========================================
// GLOBAL DOWNLOAD PROGRESS LISTENER
// ==========================================

let _progressCleanup = null;

window.api.onDownloadProgress((data) => {
    console.log('[Progress]', JSON.stringify(data));

    document.querySelectorAll('.download-btn').forEach(btn => {
        if (btn.getAttribute('data-track-key') === data.trackKey) {
            if (btn.disabled && !btn.innerText.includes('✓')) {
                btn.innerText = `⬇ ${data.percent}%`;
            }
        }
    });
});

/* =========================
   SHARED TRACK CARD RENDERER
========================= */

function buildTrackCard(track, alreadyDownloaded = false) {
    const currentTheme = themes[settings.theme]?.folder || "default";
    const artworkSrc   = track.artwork || `imgs/${currentTheme}/music.png`;
    const trackKey     = `${track.artist}|||${track.title}`;

    const box     = document.createElement("div");
    box.className = "songbox cursor-pointer flex items-center justify-between p-2 mb-1";
    
    // Crucial: Associate the native Javascript object to the element
    box.setAttribute("data-song-ref", "true");
    box._songData = track;

    box.innerHTML = `
        <div class="flex items-center gap-3 overflow-hidden flex-1">
            <img src="${artworkSrc}"
                class="size-[50px] object-cover flex-shrink-0 bg-slate-800"
                onerror="this.src='imgs/${currentTheme}/music.png'">
            <div class="flex flex-col truncate">
                <div class="flex items-center gap-2">
                    <span class="font-medium truncate text-sm">${track.title}</span>
                    <span class="text-[9px] border px-1 opacity-50 uppercase font-mono">
                        ${track.source}
                    </span>
                </div>
                <span class="text-xs opacity-60 truncate">${track.artist}</span>
            </div>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0">
            ${track.previewUrl
                ? `<button class="play-download-preview-btn default-btn text-xs px-2 py-1">▶ PREVIEW</button>`
                : track.externalUrl
                    ? `<a href="${track.externalUrl}" target="_blank"
                        class="default-btn text-xs px-2 py-1 no-underline">↗ VISIT</a>`
                    : `<a href="https://www.youtube.com/results?search_query=${
                            encodeURIComponent(`${track.artist} ${track.title}`)
                        }" target="_blank"
                        class="default-btn text-xs px-2 py-1 no-underline">🔍 YT</a>`
            }
            <button class="download-btn default-btn text-xs px-2 py-1 relative"
                ${alreadyDownloaded ? 'disabled' : ''}>
                ${alreadyDownloaded
                    ? '✓ Saved'
                    : `⬇ Download<span title="Not in library"
                        class="not-downloaded-dot absolute -top-1 -right-1 w-2 h-2 rounded-full bg-current opacity-60"></span>`
                }
            </button>
        </div>
    `;

    // ── Download ──────────────────────────────────────────────────────────────
    const dlBtn = box.querySelector('.download-btn');
    dlBtn?.setAttribute('data-track-key', trackKey);

    dlBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (dlBtn.disabled) return;

        dlBtn.disabled  = true;
        dlBtn.innerHTML = `<span class="animate-spin inline-block">⟳</span> Loading...`;

        let result;
        try {
            result = await window.api.downloadTrack({
                artist:   track.artist,
                title:    track.title,
                album:    track.album  || '',
                coverUrl: track.artwork || null
            });
        } catch (err) {
            result = { success: false, error: err.message || 'Unknown error' };
        }
        if (!result) result = { success: false, error: 'No response from main process' };

        if (result.success) {
            dlBtn.innerHTML = '✓ Saved';
            dlBtn.disabled  = true;
            sessionStorage.setItem(`downloaded:${trackKey}`, '1');
        } else {
            console.error('[Download failed]', result.error);
            dlBtn.disabled  = false;
            dlBtn.innerHTML = `⬇ Download<span title="Not in library"
                class="not-downloaded-dot absolute -top-1 -right-1 w-2 h-2 rounded-full bg-current opacity-60"></span>`;
            dlBtn.title = result.error;
        }
    });


// ── Unified Playback and Preview Toggle ─────────────────────────────────
if (track.previewUrl) {
    const playBtn = box.querySelector('.play-download-preview-btn');
    if (playBtn) {
        playBtn.addEventListener('click', e => e.stopPropagation());
        if (typeof createPreviewToggler === "function") {
            createPreviewToggler(playBtn, track.previewUrl, { play: "▶ PREVIEW", pause: "❚❚ PAUSE" });
        } else {
            console.warn("createPreviewToggler (more.js) not loaded yet — disabling preview button");
            playBtn.disabled = true;
        }
    }
}

    return box;
}

async function renderTrackList(tracks, headerText, { showDownloadAll = false } = {}) {
    DOM.library.container.innerHTML = "";

    const flags = await Promise.all(
        tracks.map(t =>
            window.api.checkDownloaded({ artist: t.artist, title: t.title })
                .catch(() => false)
        )
    );

    appendSearchHeader(headerText);

    if (showDownloadAll && tracks.length > 1) {
        const bar = document.createElement("div");
        bar.className = "flex justify-between items-center px-2 mb-2 border-b-1";
        bar.innerHTML = `
            <span class="opacity-60">${tracks.length} tracks</span>
            <button id="dl-all-btn" class="default-btn">⬇ DOWNLOAD ALL</button>
        `;
        DOM.library.container.appendChild(bar);
    }

    const cards = tracks.map((t, i) => {
        const alreadyDownloaded = flags[i] ||
            sessionStorage.getItem(`downloaded:${t.artist}|||${t.title}`) === '1';
        const card = buildTrackCard(t, alreadyDownloaded);
        DOM.library.container.appendChild(card);
        return card;
    });

    // Sequential "download all"
    document.getElementById("dl-all-btn")?.addEventListener("click", async (e) => {
        const allBtn = e.currentTarget;
        allBtn.disabled = true;

        const pending = cards
            .map(c => c.querySelector('.download-btn'))
            .filter(b => b && !b.disabled);

        for (let i = 0; i < pending.length; i++) {
            allBtn.innerText = `⬇ ${i + 1}/${pending.length}...`;
            pending[i].click();
            while (pending[i].innerHTML.includes('Loading')) {
                await new Promise(r => setTimeout(r, 300));
            }
        }

        allBtn.innerText = '✓ ALL DONE';
    });
}

// ==========================================
// MAIN SEARCH FUNCTION
// ==========================================

async function searchSongs() {
    const rawQuery = DOM.topbar.search.value.trim();
    const query    = rawQuery.toLowerCase();

    if (query === "") {
        displaySongs(currentLibrary);
        return;
    }

    // ==========================================
    // SPOTIFY LINK — auto-detected in any mode
    // ==========================================
    if (/open\.spotify\.com|spotify:(track|album|playlist|artist):/i.test(rawQuery)) {

        if (DOM.topbar.searchToggle) {
            DOM.topbar.searchToggle.innerText = "[SPOTIFY]";
            DOM.topbar.searchToggle.classList.add("bg-white/20");
        }

        DOM.library.container.innerHTML = `
            <div class="p-6 text-center opacity-60 font-mono text-sm">
                <span class="animate-spin inline-block">⟳</span> Reading Spotify link...
            </div>`;

        const res = await window.api.resolveSpotify(rawQuery);

        if (!res?.ok) {
            DOM.library.container.innerHTML = `
                <div class="p-6 text-center opacity-60">
                    Couldn't read that Spotify link.<br>
                    <span class="text-xs opacity-60">${res?.error || 'Unknown error'}</span>
                </div>`;
            return;
        }

        if (res.kind === 'artist') {
            if (!res.artistName) {
                DOM.library.container.innerHTML =
                    `<div class="p-6 text-center opacity-60">Couldn't read that artist.</div>`;
                return;
            }
            DOM.topbar.search.value = res.artistName;
            isOnlineSearch = true;
            if (DOM.topbar.searchToggle) DOM.topbar.searchToggle.innerText = "[ONLINE]";
            return searchSongs();
        }

        if (!res.tracks.length) {
            DOM.library.container.innerHTML =
                `<div class="p-6 text-center opacity-60">That Spotify link had no tracks.</div>`;
            return;
        }

        const label = res.kind === 'track'
            ? `SPOTIFY TRACK`
            : `SPOTIFY ${res.kind.toUpperCase()}: ${res.name || ''} (${res.tracks.length})`;

        await renderTrackList(res.tracks, label, { showDownloadAll: res.kind !== 'track' });

        if (res.truncated) {
            const note = document.createElement("div");
            note.className = "p-3 text-center text-xs opacity-50 font-mono";
            note.textContent = "Note: Spotify embeds only expose ~30 tracks per list.";
            DOM.library.container.appendChild(note);
        }

        return;
    }

    // ==========================================
    // ONLINE SEARCH  
    // ==========================================
    DOM.library.container.innerHTML = "";
    const currentTheme = themes[settings.theme]?.folder || "default";

    if (isOnlineSearch) {
        const providers = [
            { name: "iTunes",       fn: () => searchITunes(query)          },
            { name: "MusicBrainz",  fn: () => searchMusicBrainz(query)     },
            { name: "Last.fm",      fn: () => searchLastFm(query)          },
            { name: "Bandcamp",     fn: () => searchBandcamp(query)        },
            { name: "Archive.org",  fn: () => searchInternetArchive(query) }
        ];

        let completed = 0;
        const total = providers.length;

        DOM.library.container.innerHTML = `
            <div id="search-progress-status" class="p-6 text-center opacity-60 font-mono text-sm">
                Searching online sources: 0% (0/${total})
            </div>`;

        const statusEl = document.getElementById("search-progress-status");

        const settledResults = await Promise.all(
            providers.map(async (p) => {
                try {
                    const results = await p.fn();
                    const arr = Array.isArray(results) ? results : [];
                    completed++;
                    const percent = Math.round((completed / total) * 100);
                    if (statusEl) {
                        statusEl.innerText = `Searching sources... ${percent}% (${completed}/${total})`;
                    }
                    return arr;
                } catch (err) {
                    console.warn(`[Search] ${p.name} failed:`, err.message);
                    completed++;
                    const percent = Math.round((completed / total) * 100);
                    if (statusEl) {
                        statusEl.innerText = `Searching sources... ${percent}% (${completed}/${total})`;
                    }
                    return [];
                }
            })
        );

        DOM.library.container.innerHTML = "";

        const seen            = new Set();
        const combinedResults = [];

        settledResults.flat().forEach(item => {
            if (!item?.title) return;
            const key = `${(item.artist || "").toLowerCase()} - ${(item.title || "").toLowerCase()}`;
            if (!seen.has(key)) {
                seen.add(key);
                combinedResults.push(item);
            }
        });

        if (combinedResults.length === 0) {
            DOM.library.container.innerHTML = `
                <div class="p-6 text-center opacity-60">
                    No online results found for "${query}"
                </div>`;
            return;
        }

        const downloadedFlags = await Promise.all(
            combinedResults.map(track =>
                window.api.checkDownloaded({ artist: track.artist, title: track.title })
                    .catch(() => false)
            )
        );

        appendSearchHeader(`ONLINE RESULTS (${combinedResults.length} FOUND)`);

        // Cleaned up duplicate rendering - uses buildTrackCard!
        combinedResults.forEach((track, idx) => {
            const alreadyDownloaded = downloadedFlags[idx] ||
                sessionStorage.getItem(`downloaded:${track.artist}|||${track.title}`) === '1';

            const box = buildTrackCard(track, alreadyDownloaded);
            DOM.library.container.appendChild(box);
        });

        return;
    }

    // ==========================================
    // LOCAL LIBRARY SEARCH
    // ==========================================

    const matchedSongs = songs.filter(song => {
        const title  = (song.title  || song.name || "").toLowerCase();
        const artist = (song.musicbrainz?.artist ?? song.artist ?? "").toLowerCase();
        const album  = (song.musicbrainz?.album  ?? song.album  ?? "").toLowerCase();
        return title.includes(query) || artist.includes(query) || album.includes(query);
    });

    if (matchedSongs.length > 0) {
        appendSearchHeader("SONGS");
        matchedSongs.forEach(song => {
            const trackTitle  = song.title || song.name || "Unknown Track";
            const trackArtist = song.musicbrainz?.artist ?? song.artist ?? "Unknown Artist";
            const box = document.createElement("div");
            box.className = "songbox cursor-pointer";
            box.innerHTML = `
                <img data-icon="song" src="imgs/${currentTheme}/music.png" class="size-[50px]">
                <div class="px-[20px] flex flex-col justify-center">
                    <span class="font-medium">${trackTitle}</span>
                    <span class="text-xs opacity-60">${trackArtist}</span>
                </div>
            `;
            box.addEventListener("click", () => {
                currentLibrary = matchedSongs;
                loadSong(song);
            });
            DOM.library.container.appendChild(box);
        });
    }

    const matchedArtists = [...new Set(songs.map(song => song.musicbrainz?.artist ?? song.artist))]
        .filter(Boolean)
        .filter(artist => artist.toLowerCase().includes(query))
        .sort();

    if (matchedArtists.length > 0) {
        appendSearchHeader("ARTISTS");
        matchedArtists.forEach(artist => {
            const box = document.createElement("div");
            box.className = "songbox cursor-pointer";
            box.innerHTML = `
                <img data-icon="artist" src="imgs/${currentTheme}/artist.png" class="size-[50px]">
                <span class="px-[20px] self-center font-medium">${artist}</span>
            `;
            box.addEventListener("click", () => showArtistSongs(artist));
            DOM.library.container.appendChild(box);
        });
    }

    const matchedAlbums = [...new Set(songs.map(song => song.musicbrainz?.album ?? song.album))]
        .filter(Boolean)
        .filter(album => album.toLowerCase().includes(query))
        .sort();

    if (matchedAlbums.length > 0) {
        appendSearchHeader("ALBUMS");
        matchedAlbums.forEach(album => {
            const box = document.createElement("div");
            box.className = "songbox cursor-pointer";
            box.innerHTML = `
                <img data-icon="album" src="imgs/${currentTheme}/album.png" class="size-[50px]">
                <span class="px-[20px] self-center font-medium">${album}</span>
            `;
            box.addEventListener("click", () => showAlbumSongs(album));
            DOM.library.container.appendChild(box);
        });
    }

    if (matchedSongs.length === 0 && matchedArtists.length === 0 && matchedAlbums.length === 0) {
        DOM.library.container.innerHTML = `<div class="p-6 text-center opacity-60">No local results found for "${query}"</div>`;
    }
}

/* =========================
   TITLE SCROLL
========================= */

function updateTitleScroll() {
    const title = DOM.library.title;
    const container = DOM.library.songAlbum;

    title.classList.remove("scrolling");

    const overflow = title.scrollWidth - container.clientWidth;

    if (overflow > 0) {
        const padding = 10;
        DOM.library.title.style.setProperty("--scroll-distance", `-${overflow + padding}px`);
        void DOM.library.title.offsetWidth;
        DOM.library.title.classList.add("scrolling");
    }
}

window.addEventListener("load", updateTitleScroll);

const observer = new ResizeObserver(updateTitleScroll);
observer.observe(DOM.library.songAlbum);

/* =========================
   LYRIC WINDOW
========================= */

let dragginglrc = false;
let offsetX = 0;
let offsetY = 0;

const win = DOM.lyrics.window;
const bar = DOM.lyrics.titlebar;

bar.addEventListener("mousedown", e => {
    dragginglrc = true;
    offsetX = e.clientX - win.offsetLeft;
    offsetY = e.clientY - win.offsetTop;
});

document.addEventListener("mousemove", e => {
    if (!dragginglrc) return;
    win.style.left = `${e.clientX - offsetX}px`;
    win.style.top  = `${e.clientY - offsetY}px`;
});

document.addEventListener("mouseup", () => {
    dragginglrc = false;
});

/* =========================
   MIN OR MAX PLAYER
========================= */

window.addEventListener("load", () => {
    if (window.innerWidth >= 1024) {
        player.classList.remove("hidden", "absolute", "w-full");
        player.classList.add("w-[30%]", "flex");
    }
});

window.addEventListener("resize", () => {
    if (window.innerWidth >= 1024) {
        player.classList.remove("hidden", "absolute", "w-full");
        player.classList.add("w-[30%]", "flex");
    } else {
        player.classList.add("hidden", "absolute", "w-full");
        player.classList.remove("w-[30%]", "flex");
    }
});

const miniPlayer = document.getElementById("mini-player");
const player     = document.getElementById("player");
const toggleBtn  = document.getElementById("toggle-player");

let expanded = false;

function openPlayer() {
    expanded = true;
    if (window.innerWidth < 1024) {
        player.classList.remove("hidden");
        player.classList.add("absolute", "w-full");
    }
}

function closePlayer() {
    expanded = false;
    if (window.innerWidth < 1024) {
        player.classList.add("hidden");
        player.classList.remove("absolute", "w-full");
    }
}

function togglePlayer() {
    expanded ? closePlayer() : openPlayer();
}

let startY   = 0;
let dragging = false;

function startDrag(e) {
    if (window.innerWidth >= 1024) return;
    dragging = true;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    player.style.transition = "transform .3s ease";
    player.style.transform  = "";
}
function endDrag(e) {
    if (window.innerWidth >= 1024 || !dragging) return;
    dragging = false;

    const endY  = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const delta = endY - startY;

    if (!expanded && delta < -100) openPlayer();
    if (expanded  && delta >  100) closePlayer();

    player.style.transition = "transform .3s ease";
    player.style.transform  = "";
}
function moveDrag(e) {
    if (window.innerWidth >= 1024 || !dragging) return;

    const y     = e.touches ? e.touches[0].clientY : e.clientY;
    const delta = y - startY;

    player.style.transition = "none";

    if (!expanded) {
        player.style.transform = `translateY(${Math.max(0, 100 + delta)}%)`;
    } else {
        player.style.transform = `translateY(${Math.max(0, delta)}px)`;
    }
}
miniPlayer.addEventListener("pointerdown",  startDrag);
player.addEventListener("pointerdown",      startDrag);
window.addEventListener("pointermove",      moveDrag);
window.addEventListener("pointerup",        endDrag);
window.addEventListener("touchmove",        moveDrag);
window.addEventListener("touchend",         endDrag);
miniPlayer.addEventListener("pointermove",  moveDrag);
player.addEventListener("pointermove",      moveDrag);
miniPlayer.addEventListener("touchmove",    moveDrag);
player.addEventListener("touchmove",        moveDrag);

toggleBtn.addEventListener("click", togglePlayer);
miniPlayer.addEventListener("dblclick", openPlayer);
player.addEventListener("dblclick", closePlayer);

/* =========================
   CUSTOM PROMPT
========================= */

function showCustomPrompt({ title = "INPUT", message = "", fields = [{ key: "value", label: "", defaultValue: "", placeholder: "" }] }) {
    return new Promise((resolve) => {
        const popup          = document.getElementById("custom-prompt-popup");
        const titleEl        = document.getElementById("prompt-popup-title");
        const msgEl          = document.getElementById("prompt-popup-msg");
        const inputsContainer = document.getElementById("prompt-popup-inputs");
        const confirmBtn     = document.getElementById("prompt-popup-confirm");
        const cancelBtn      = document.getElementById("prompt-popup-cancel");
        const closeBtn       = document.getElementById("prompt-popup-close");

        titleEl.innerText = title;

        if (message) {
            msgEl.innerText = message;
            msgEl.classList.remove("hidden");
        } else {
            msgEl.classList.add("hidden");
        }

        inputsContainer.innerHTML = "";
        const inputRefs = {};

        fields.forEach((field, idx) => {
            const wrapper = document.createElement("div");
            wrapper.className = "flex flex-col gap-1";

            if (field.label) {
                const label = document.createElement("label");
                label.className = "opacity-70";
                label.innerText = field.label;
                wrapper.appendChild(label);
            }

            const input = document.createElement("input");
            input.type = "text";
            input.className = "border-2 p-[8px] w-full";
            input.value = field.defaultValue || "";
            input.placeholder = field.placeholder || "";

            wrapper.appendChild(input);
            inputsContainer.appendChild(wrapper);
            inputRefs[field.key] = input;

            if (idx === 0) setTimeout(() => input.focus(), 50);
        });

        popup.classList.remove("hidden");

        const cleanup = () => {
            popup.classList.add("hidden");
            confirmBtn.onclick = null;
            cancelBtn.onclick  = null;
            closeBtn.onclick   = null;
        };

        const handleConfirm = () => {
            const results = {};
            for (const key in inputRefs) {
                results[key] = inputRefs[key].value;
            }
            cleanup();
            resolve(fields.length === 1 ? results.value : results);
        };

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        confirmBtn.onclick = handleConfirm;
        cancelBtn.onclick  = handleCancel;
        closeBtn.onclick   = handleCancel;
    });
}
