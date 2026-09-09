

(function () {
    if (window.api) return;                 // Electron already provided window.api
    if (!window.Capacitor) return;           // Not Electron, not Capacitor — plain browser, nothing to do

    const { Preferences, Filesystem } = Capacitor.Plugins;

    // Capacitor's Directory/Encoding enums are just string constants —
    // hardcoded here so we don't need a bundler to import them.
    const DIR_DATA = "DATA";
    const ENC_UTF8 = "utf8";

    // ── helpers ──────────────────────────────────────────────────────────────

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // Tiny Levenshtein distance implementation (no bundler available to pull
    // in fast-levenshtein from node_modules for the browser side).
    function levenshtein(a, b) {
        if (a === b) return 0;
        if (!a.length) return b.length;
        if (!b.length) return a.length;

        let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            const row = [i];
            for (let j = 1; j <= b.length; j++) {
                row[j] = a[i - 1] === b[j - 1]
                    ? prev[j - 1]
                    : 1 + Math.min(prev[j - 1], prev[j], row[j - 1]);
            }
            prev = row;
        }
        return prev[b.length];
    }

    async function notImplemented(name) {
        console.warn(`[capacitor-bridge] "${name}" isn't available on Android yet.`);
        return null;
    }

    // ── settings (mirrors main.js's load-settings / save-settings) ────────────

    async function loadSettings() {
        try {
            const { value } = await Preferences.get({ key: "settings" });
            return value ? JSON.parse(value) : {};
        } catch (err) {
            console.warn("[capacitor-bridge] loadSettings failed:", err);
            return {};
        }
    }

    async function saveSettings(settings) {
        try {
            await Preferences.set({ key: "settings", value: JSON.stringify(settings) });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // ── cache (mirrors cache.js — same filenames: musicbrainz.json, lyrics.json) ─

    async function loadCache(filename = "musicbrainz.json") {
        try {
            const result = await Filesystem.readFile({
                path: filename,
                directory: DIR_DATA,
                encoding: ENC_UTF8
            });
            return JSON.parse(result.data);
        } catch (err) {
            return {}; // file doesn't exist yet — same behavior as cache.js
        }
    }

    async function saveCache(data, filename = "musicbrainz.json") {
        try {
            await Filesystem.writeFile({
                path: filename,
                data: JSON.stringify(data, null, 4),
                directory: DIR_DATA,
                encoding: ENC_UTF8
            });
            return { success: true };
        } catch (err) {
            console.warn("[capacitor-bridge] saveCache failed:", err);
            return { success: false, error: err.message };
        }
    }

    // ── lyrics (mirrors lrclib.js) ──────────────────────────────────────────────

    async function getLyrics(song) {
        const params = new URLSearchParams({
            track_name: song.musicbrainz?.title ?? song.title,
            artist_name: song.musicbrainz?.artist ?? song.artist
        });

        try {
            const res = await fetch(`https://lrclib.net/api/search?${params}`);
            if (!res.ok) return null;

            const results = await res.json();
            if (!Array.isArray(results) || !results.length) return null;

            return results.sort((a, b) => {
                const aDiff = Math.abs((a.duration ?? 0) - Math.round(song.duration));
                const bDiff = Math.abs((b.duration ?? 0) - Math.round(song.duration));
                return aDiff - bDiff;
            })[0];
        } catch (err) {
            console.warn("[capacitor-bridge] LRCLIB fetch failed:", err);
            return null;
        }
    }

    // ── musicbrainz (mirrors musicbrainz.js) ────────────────────────────────────

    function escapeMB(text = "") {
        return text.replace(/"/g, '\\"');
    }

    function normalize(str = "") {
        return str
            .replace(/\.[a-z0-9]{2,5}$/i, "")
            .replace(/\[\s*[\w.-]+\.(?:com|net|org|info|co)\s*\]/gi, "")
            .replace(/\([^)]*\)/g, "")
            .replace(/[\[\]{}]/g, "")
            .replace(/[^a-z0-9\s]/gi, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function similarity(a, b) {
        a = normalize(a);
        b = normalize(b);
        if (!a.length || !b.length) return 0;
        const distance = levenshtein(a, b);
        return 1 - distance / Math.max(a.length, b.length);
    }

    async function mbSearch(song) {
        const queries = [
            [`recording:"${escapeMB(song.title)}"~`, `artist:"${escapeMB(song.artist)}"`].join(" AND "),
            [`recording:${escapeMB(song.title)}`, `artist:${escapeMB(song.artist)}`].join(" AND "),
            `recording:${escapeMB(song.title)}`
        ];

        for (const query of queries) {
            const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&limit=20&fmt=json`;
            try {
                const res = await fetch(url, { headers: { Accept: "application/json" } });
                const result = await res.json();
                if (result.recordings?.length) return result;
            } catch (err) {
                console.warn("[capacitor-bridge] MusicBrainz search failed:", err);
            }
        }

        return { recordings: [] };
    }

    async function musicbrainzSearchCandidates(song) {
        const searchRes = await mbSearch(song);
        if (!searchRes.recordings?.length) return [];

        return searchRes.recordings
            .map(r => {
                let score = 0;
                const titleSim = similarity(r.title, song.title);
                score += titleSim < 0.75 ? -100 : titleSim * 100;

                const artist = r["artist-credit"]?.map(a => a.name).join(" ") ?? "";
                if (normalize(artist) === normalize(song.artist)) score += 100;

                const release = r.releases?.[0]?.title ?? "";
                if (normalize(release) === normalize(song.album)) score += 100;

                const diff = Math.abs((r.length ?? 0) - song.duration * 1000);
                score -= diff / 1000;

                const badWords = ["live", "demo", "karaoke", "instrumental", "radio edit", "remaster"];
                for (const word of badWords) {
                    if (r.title.toLowerCase().includes(word)) score -= 50;
                }

                r.realScore = Math.round(score);
                return r;
            })
            .sort((a, b) => b.realScore - a.realScore);
    }

    async function musicbrainzLookupRecording(id) {
        try {
            const res = await fetch(
                `https://musicbrainz.org/ws/2/recording/${id}?inc=releases+artists+genres+tags&fmt=json`,
                { headers: { Accept: "application/json" } }
            );
            return await res.json();
        } catch (err) {
            console.warn("[capacitor-bridge] MusicBrainz lookup failed:", err);
            return null;
        }
    }

    // ── cover art (mirrors coverart.js) ─────────────────────────────────────────

    async function downloadCoverArt(releaseId) {
        const filename = `covers/${releaseId}.jpg`;

        // Already cached from a previous run?
        try {
            const { uri } = await Filesystem.getUri({ path: filename, directory: DIR_DATA });
            return Capacitor.convertFileSrc(uri);
        } catch (_) {
            // not cached yet — fall through to download
        }

        try {
            const res = await fetch(`https://coverartarchive.org/release/${releaseId}/front`);
            if (!res.ok) return null;

            const blob = await res.blob();
            const base64 = await blobToBase64(blob);

            await Filesystem.writeFile({
                path: filename,
                data: base64,
                directory: DIR_DATA,
                recursive: true
            });

            const { uri } = await Filesystem.getUri({ path: filename, directory: DIR_DATA });
            return Capacitor.convertFileSrc(uri);
        } catch (err) {
            console.warn("[capacitor-bridge] Cover art download failed:", err);
            return null;
        }
    }

    // ── spotify (mirrors spotify.js) ────────────────────────────────────────────

    const SPOTIFY_RE = new RegExp(
        "open\\.spotify\\.com/(?:intl-[a-z]{2}/)?(track|album|playlist|artist)/([A-Za-z0-9]+)" +
        "|spotify:(track|album|playlist|artist):([A-Za-z0-9]+)",
        "i"
    );

    function parseSpotifyUrl(input) {
        if (!input || typeof input !== "string") return null;
        const m = input.match(SPOTIFY_RE);
        if (!m) return null;
        return { type: (m[1] || m[3]).toLowerCase(), id: m[2] || m[4] };
    }

    function pickCover(entity) {
        const sources = entity?.coverArt?.sources || entity?.visualIdentity?.image || [];
        if (!sources.length) return null;
        return sources.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a)).url;
    }

    function artistsToString(arr) {
        if (!Array.isArray(arr) || !arr.length) return "Unknown Artist";
        return arr.map(a => a.name || a.profile?.name).filter(Boolean).join(", ");
    }

    function mapTrack(t, fallbackAlbum, fallbackCover) {
        return {
            source: "Spotify",
            title: t.title || t.name || "Untitled",
            artist: artistsToString(t.artists || (t.subtitle && [{ name: t.subtitle }])),
            album: fallbackAlbum || "",
            artwork: pickCover(t) || fallbackCover || null,
            previewUrl: t.audioPreview?.url || null,
            externalUrl: t.uid || t.uri
                ? `https://open.spotify.com/track/${(t.uri || "").split(":").pop()}`
                : null
        };
    }

    async function fetchEmbedData(type, id) {
        const url = `https://open.spotify.com/embed/${type}/${id}`;
        const res = await fetch(url, { headers: { "Accept-Language": "en" } });
        const html = await res.text();

        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!match) throw new Error("Could not parse Spotify embed page");

        const json = JSON.parse(match[1]);
        return json?.props?.pageProps?.state?.data?.entity ?? null;
    }

    async function fetchOEmbed(type, id) {
        const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${type}/${id}`)}`;
        const res = await fetch(url);
        return res.json();
    }

    async function resolveSpotify(input) {
        const parsed = parseSpotifyUrl(input);
        if (!parsed) return { ok: false, error: "Not a Spotify link" };

        const { type, id } = parsed;

        if (type === "artist") {
            try {
                const meta = await fetchOEmbed("artist", id);
                return { ok: true, kind: "artist", artistName: meta?.title || null, tracks: [] };
            } catch (err) {
                return { ok: false, error: `Spotify artist lookup failed: ${err.message}` };
            }
        }

        try {
            const entity = await fetchEmbedData(type, id);
            if (!entity) throw new Error("Empty Spotify response");

            const cover = pickCover(entity);

            if (type === "track") {
                return {
                    ok: true,
                    kind: "track",
                    name: entity.title || entity.name || "",
                    tracks: [{
                        source: "Spotify",
                        title: entity.title || entity.name || "Untitled",
                        artist: artistsToString(entity.artists),
                        album: entity.relatedEntityName || "",
                        artwork: cover,
                        previewUrl: entity.audioPreview?.url || null,
                        externalUrl: `https://open.spotify.com/track/${id}`
                    }]
                };
            }

            const list = entity.trackList || entity.trackListLite || [];
            const albumName = type === "album" ? (entity.title || entity.name || "") : "";
            const tracks = list.map(t => mapTrack(t, albumName, cover));

            return {
                ok: true,
                kind: type,
                name: entity.title || entity.name || "",
                truncated: list.length >= 30,
                tracks
            };
        } catch (err) {
            console.warn("[capacitor-bridge] Spotify resolve failed:", err.message);
            return { ok: false, error: err.message };
        }
    }

    // ── not-yet-implemented on Android — the Option A native-plugin work ───────
    // (folder scanning, tag reading, yt-dlp downloads, file deletion, video lookup)

    window.api = {
        loadSettings,
        saveSettings,

        pickFolder: () => notImplemented("pickFolder"),
        pickImage: () => notImplemented("pickImage"),

        scanMusicFolder: () => notImplemented("scanMusicFolder"),
        enrichSongs: async (songs) => songs, // pass-through until scanning exists
        getSimilarTracks: () => notImplemented("getSimilarTracks"),

        onSongEnriched: () => { /* no-op until scanMusicFolder exists */ },

        downloadCover: () => notImplemented("downloadCover"),
        downloadCoverArt,

        loadCache,
        saveCache,

        getLyrics,

        musicbrainzSearchCandidates,
        musicbrainzLookupRecording,

        trashItem: () => notImplemented("trashItem"),

        downloadTrack: () => notImplemented("downloadTrack"),
        checkDownloaded: async () => ({ downloaded: false }),
        onDownloadProgress: () => { /* no-op until downloadTrack exists */ },

        resolveSpotify,

        getMusicVideo: () => notImplemented("getMusicVideo")
    };

    console.log("[capacitor-bridge] window.api ready (Android/Capacitor mode)");
})();