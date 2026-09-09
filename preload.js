const { contextBridge, ipcRenderer } = require('electron');

let _downloadProgressCallback = null;

ipcRenderer.on('download-progress', (_event, data) => {
    if (_downloadProgressCallback) _downloadProgressCallback(data);
});

contextBridge.exposeInMainWorld('api', {

    // ── Server ────────────────────────────────────────────────────────────────
    getServerPort: () => ipcRenderer.invoke('get-server-port'),

    // ── Settings ──────────────────────────────────────────────────────────────
    loadSettings: ()           => ipcRenderer.invoke('load-settings'),
    saveSettings: (settings)   => ipcRenderer.invoke('save-settings', settings),

    // ── Pickers ───────────────────────────────────────────────────────────────
    pickFolder: () => ipcRenderer.invoke('pick-folder'),
    pickImage:  () => ipcRenderer.invoke('pick-image'),

    // ── Library ───────────────────────────────────────────────────────────────
    scanMusicFolder: (folder) => ipcRenderer.invoke('scan-music-folder', folder),
    enrichSongs:     (songs)  => ipcRenderer.invoke('enrich-songs', songs),
    getSimilarTracks:(params) => ipcRenderer.invoke('get-similar-tracks', params),

    // ── Song enrichment events ────────────────────────────────────────────────
    onSongEnriched: (callback) => {
        ipcRenderer.on('song-enriched', (_event, updatedSong) => callback(updatedSong));
    },

    // ── Cover art ─────────────────────────────────────────────────────────────
    downloadCover:    (data)      => ipcRenderer.invoke('download-cover', data),
    downloadCoverArt: (releaseId) => ipcRenderer.invoke('download-cover-art', releaseId),

    // ── Cache ─────────────────────────────────────────────────────────────────
    loadCache: (filename)       => ipcRenderer.invoke('load-cache', filename),
    saveCache: (data, filename) => ipcRenderer.invoke('save-cache', { data, filename }),
    clearCache: () => ipcRenderer.invoke('clear-cache'),

    // ── Lyrics ────────────────────────────────────────────────────────────────
    getLyrics: (song) => ipcRenderer.invoke('get-lyrics', song),

    // ── MusicBrainz ───────────────────────────────────────────────────────────
    musicbrainzSearchCandidates: (song) => ipcRenderer.invoke('musicbrainz-search-candidates', song),
    musicbrainzLookupRecording:  (id)   => ipcRenderer.invoke('musicbrainz-lookup-recording', id),

    // ── Filesystem ────────────────────────────────────────────────────────────
    trashItem: (filePath) => ipcRenderer.invoke('trash-item', filePath),

    // ── Downloads ─────────────────────────────────────────────────────────────
    downloadTrack: (args) => ipcRenderer.invoke('download-track', args),
    checkDownloaded: (args) => ipcRenderer.invoke('check-downloaded', args),
    onDownloadProgress: (callback) => {
        _downloadProgressCallback = callback;
    },
    getMusicVideo: (data) => ipcRenderer.invoke('get-music-video', data),
    openVideoPlayer: (videoId) => ipcRenderer.invoke('open-video-player', videoId),
    closeVideoPlayer: () => ipcRenderer.invoke('close-video-player'),
    // ── spotify ─────────────────────────────────────────────────────────────
    resolveSpotify: (input) => ipcRenderer.invoke('resolve-spotify', input),
});