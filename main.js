const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const NodeID3 = require('node-id3');
const { app, BrowserWindow, dialog, ipcMain, shell, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
let mm;
async function initMusicMetadata() {
    if (!mm) {
        mm = await import('music-metadata');
    }
    return mm;
}

const cache = require('./cache');
const coverart = require('./coverart');
const lrclib = require('./lrclib');
const musicbrainz = require('./musicbrainz');
const spotify = require('./spotify'); 

// Dev mode keeps using the project folder (so local testing/data isn't
// silently orphaned) - only a packaged build switches to userData, where
// writes are actually guaranteed to work.
const SETTINGS_FILE = app.isPackaged
    ? path.join(app.getPath('userData'), 'settings.json')
    : path.join(__dirname, 'settings.json');

function sanitizeFilename(name) {
    return name.replace(/[/\\?%*:|"<>]/g, '-').trim();
}

// ------------------------------------------------------------------
// SETTINGS
// ------------------------------------------------------------------

ipcMain.handle('load-settings', async () => {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) return {};
        const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Failed to read settings:', err);
        return {};
    }
});

ipcMain.handle('save-settings', async (event, settings) => {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
        return { success: true };
    } catch (err) {
        console.error('Failed to save settings:', err);
        return { success: false, error: err.message };
    }
});

// ------------------------------------------------------------------
// FILE / IMAGE PICKERS
// ------------------------------------------------------------------

ipcMain.handle('pick-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled) return null;
    return result.filePaths[0];
});

ipcMain.handle('pick-image', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

// ------------------------------------------------------------------
// GENERIC COVER DOWNLOAD (arbitrary URL -> destPath)
// ------------------------------------------------------------------

ipcMain.handle('download-cover', async (event, { url, destPath }) => {
    try {
        const response = await axios({ url, method: 'GET', responseType: 'arraybuffer' });
        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(destPath, Buffer.from(response.data));
        return { success: true, filePath: destPath };
    } catch (err) {
        console.error('Failed to download cover:', err);
        return { success: false, error: err.message };
    }
});

// ------------------------------------------------------------------
// COVER ART ARCHIVE (by MusicBrainz release id)
// ------------------------------------------------------------------

ipcMain.handle('download-cover-art', async (event, releaseId) => {
    try {
        const file = await coverart.downloadCover(releaseId);
        return file;
    } catch (err) {
        console.error('Cover art download failed:', err);
        return null;
    }
});

// ------------------------------------------------------------------
// GENERIC CACHE
// ------------------------------------------------------------------

ipcMain.handle('load-cache', async (event, filename) => {
    try {
        return cache.loadCache(filename);
    } catch (err) {
        console.error('Failed to load cache:', err);
        return {};
    }
});

ipcMain.handle('save-cache', async (event, { data, filename }) => {
    try {
        cache.saveCache(data, filename);
        return { success: true };
    } catch (err) {
        console.error('Failed to save cache:', err);
        return { success: false, error: err.message };
    }
});

// ------------------------------------------------------------------
// LYRICS (LRCLIB)
// ------------------------------------------------------------------

ipcMain.handle('get-lyrics', async (event, song) => {
    try {
        return await lrclib.getLyrics(song);
    } catch (err) {
        console.error('Lyrics lookup failed:', err);
        return null;
    }
});

// ------------------------------------------------------------------
// MUSICBRAINZ
// ------------------------------------------------------------------

ipcMain.handle('musicbrainz-search-candidates', async (event, song) => {
    try {
        return await musicbrainz.searchCandidates(song);
    } catch (err) {
        console.error('MusicBrainz search failed:', err);
        return [];
    }
});

ipcMain.handle('musicbrainz-lookup-recording', async (event, id) => {
    try {
        return await musicbrainz.lookupRecording(id);
    } catch (err) {
        console.error('MusicBrainz lookup failed:', err);
        return null;
    }
});

// ------------------------------------------------------------------
// LIBRARY SCANNING
// ------------------------------------------------------------------

function getMusicFiles(folder) {
    let musicFiles = [];
    const items = fs.readdirSync(folder, { withFileTypes: true });

    for (const item of items) {
        const fullPath = path.join(folder, item.name);
        if (item.isDirectory()) {
            musicFiles.push(...getMusicFiles(fullPath));
        } else if (item.name.match(/\.(mp3|flac|wav|ogg|m4a)$/i)) {
            musicFiles.push(fullPath);
        }
    }

    return musicFiles;
}

ipcMain.handle('scan-music-folder', async (event, folder) => {
    await initMusicMetadata();
    const files = getMusicFiles(folder);
    const songs = [];

    for (const fullPath of files) {
        try {
            const metadata = await mm.parseFile(fullPath);

            let lyrics = null;
            if (metadata.common.lyrics?.length) {
                lyrics = metadata.common.lyrics
                    .map(l => (typeof l === 'string' ? l : (l.text || l.descriptor || '')))
                    .filter(Boolean)
                    .join('\n')
                    .trim();
                if (!lyrics) lyrics = null;
            }

            let cover = null;
            if (metadata.common.picture?.length) {
                const pic = metadata.common.picture[0];
                cover = `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`;
            }

            songs.push({
                path: fullPath,
                album: metadata.common.album?.trim() || 'Unknown Album',
                artist: metadata.common.artist?.trim() || 'Unknown Artist',
                title: metadata.common.title?.trim() || path.parse(fullPath).name,
                track: metadata.common.track?.no || 0,
                duration: metadata.format.duration || 0,
                cover,
                lyrics: { embedded: lyrics, remote: null, source: lyrics ? 'embedded' : 'remote' }
            });
        } catch (err) {
            console.error("Couldn't read:", fullPath, err.message);
        }
    }

    return songs;
});

ipcMain.handle('enrich-songs', async (event, songs) => {
    const MIN_SCORE = 50;

    for (const song of songs) {
        if (!song || !song.path) continue;

        const pathKey = song.path.toLowerCase();
        const tagKey  = `${song.artist}|${song.album}|${song.title}`.toLowerCase();

        const musicbrainzCache = cache.loadCache();
        const cachedEntry = musicbrainzCache[pathKey] || musicbrainzCache[tagKey];

        if (cachedEntry) {
            song.favorite = !!cachedEntry.favorite;
            if (cachedEntry.customCover) song.customCover = cachedEntry.customCover;

            if (cachedEntry.disabled === true) {
                if (cachedEntry.musicbrainz) song.musicbrainz = cachedEntry.musicbrainz;
                if (cachedEntry.lyrics) {
                    song.lyrics        = song.lyrics || {};
                    song.lyrics.remote = cachedEntry.lyrics.remote;
                    song.lyrics.synced = cachedEntry.lyrics.synced;
                }
                event.sender.send('song-enriched', song);
                continue;
            }

            if (cachedEntry.searched || cachedEntry.musicbrainz !== undefined) {
                if (cachedEntry.musicbrainz) {
                    song.musicbrainz = cachedEntry.musicbrainz;
                    if (cachedEntry.lyrics) {
                        song.lyrics        = song.lyrics || {};
                        song.lyrics.remote = cachedEntry.lyrics.remote;
                        song.lyrics.synced = cachedEntry.lyrics.synced;
                    }
                }
                event.sender.send('song-enriched', song);
                continue;
            }
        }

        try {
            const candidates = await musicbrainz.searchCandidates(song);
            const topMatch   = candidates && candidates.length > 0 ? candidates[0] : null;

            if (topMatch && topMatch.realScore >= MIN_SCORE) {
                const full    = await musicbrainz.lookupRecording(topMatch.id);
                const release = full?.releases?.[0];

                if (!full?.id || !full.title || !full['artist-credit']?.length) {
                    musicbrainzCache[pathKey] = {
                        ...musicbrainzCache[pathKey],
                        searched:    true,
                        disabled:    false,
                        musicbrainz: null,
                        lyrics:      null
                    };
                } else {
                    const [remoteCover, lyrics] = await Promise.allSettled([
                        release?.id ? coverart.downloadCover(release.id) : Promise.resolve(null),
                        lrclib.getLyrics(song)
                    ]).then(results => [
                        results[0].status === 'fulfilled' ? results[0].value : null,
                        results[1].status === 'fulfilled' ? results[1].value : null
                    ]);

                    song.musicbrainz = {
                        recordingId: full.id,
                        releaseId:   release?.id   ?? null,
                        title:       full.title,
                        artist:      full['artist-credit'].map(a => a.name).join(', '),
                        album:       release?.title ?? null,
                        year:        release?.date  ?? null,
                        genres:      full.genres?.map(g => g.name) ?? [],
                        remoteCover: remoteCover ?? null
                    };

                    if (lyrics) {
                        song.lyrics        = song.lyrics || {};
                        song.lyrics.remote = lyrics.plainLyrics  ?? null;
                        song.lyrics.synced = lyrics.syncedLyrics ?? null;
                    }

                    musicbrainzCache[pathKey] = {
                        ...musicbrainzCache[pathKey],
                        searched:    true,
                        disabled:    false,
                        musicbrainz: song.musicbrainz,
                        lyrics:      { remote: song.lyrics?.remote ?? null, synced: song.lyrics?.synced ?? null }
                    };
                }
            } else {
                musicbrainzCache[pathKey] = {
                    ...musicbrainzCache[pathKey],
                    searched:    true,
                    disabled:    false,
                    musicbrainz: null,
                    lyrics:      null
                };
            }
        } catch (err) {
            console.error(`[Enrichment] Failed for ${song.title || song.path}:`, err.message);
            musicbrainzCache[pathKey] = {
                ...musicbrainzCache[pathKey],
                searched:    true,
                disabled:    false,
                musicbrainz: null,
                lyrics:      null
            };
        } finally {
            musicbrainzCache[tagKey] = musicbrainzCache[pathKey];
            cache.saveCache(musicbrainzCache);
            event.sender.send('song-enriched', song);
        }
    }

    return songs;
});

ipcMain.handle('get-similar-tracks', async (event, { artist, track, apiKey }) => {
    try {
        const response = await axios.get('https://ws.audioscrobbler.com/2.0/', {
            params: {
                method:  'track.getSimilar',
                artist,
                track,
                api_key: apiKey,
                format:  'json'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 8000
        });

        return { success: true, data: response.data };
    } catch (err) {
        console.error('Last.fm Main Process Fetch Error:', err.message);
        return { success: false, error: err.message };
    }
});

// ------------------------------------------------------------------
// TRASH
// ------------------------------------------------------------------

ipcMain.handle('trash-item', async (event, filePath) => {
    try {
        if (filePath && fs.existsSync(filePath)) {
            await shell.trashItem(filePath);
        }
        return { success: true };
    } catch (err) {
        console.error('Failed to trash file:', err);
        return { success: false, error: err.message };
    }
});

// ------------------------------------------------------------------
// DOWNLOAD AUDIO via yt-dlp
// ------------------------------------------------------------------

// yt-dlp.exe can't be executed from inside app.asar once packaged, so it
// has to be shipped as an extraResource (see package.json "build.extraResources")
// and referenced under resourcesPath instead of __dirname when packaged.
const ytDlpPath = app.isPackaged
    ? path.join(process.resourcesPath, 'yt-dlp.exe')
    : path.join(__dirname, 'yt-dlp.exe');

// ------------------------------------------------------------------
// BROWSER DETECTION (for cookie extraction)
// ------------------------------------------------------------------

function detectInstalledBrowsers() {
    if (process.platform !== 'win32') return [];

    const browsers      = [];
    const localAppData  = process.env.LOCALAPPDATA               || '';
    const programFiles  = process.env['ProgramFiles']            || 'C:\\Program Files';
    const programFiles86= process.env['ProgramFiles(x86)']       || 'C:\\Program Files (x86)';

    const browserPaths = {
        firefox: [
            path.join(localAppData,   'Mozilla', 'Firefox'),
            path.join(programFiles,   'Mozilla Firefox'),
            path.join(programFiles86, 'Mozilla Firefox')
        ],
        chrome: [
            path.join(localAppData,   'Google', 'Chrome'),
            path.join(programFiles,   'Google', 'Chrome'),
            path.join(programFiles86, 'Google', 'Chrome')
        ],
        edge: [
            path.join(localAppData,   'Microsoft', 'Edge'),
            path.join(programFiles,   'Microsoft', 'Edge'),
            path.join(programFiles86, 'Microsoft', 'Edge')
        ],
        brave: [
            path.join(localAppData,   'BraveSoftware', 'Brave-Browser'),
            path.join(programFiles,   'BraveSoftware', 'Brave-Browser'),
            path.join(programFiles86, 'BraveSoftware', 'Brave-Browser')
        ]
    };

    for (const [browser, checkPaths] of Object.entries(browserPaths)) {
        for (const checkPath of checkPaths) {
            if (fs.existsSync(checkPath)) {
                browsers.push(browser);
                break;
            }
        }
    }

    return browsers;
}

let cachedCookieBrowser = null;

function getCookieBrowser() {
    if (cachedCookieBrowser !== null) return cachedCookieBrowser;

    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
            if (settings.cookieBrowser && typeof settings.cookieBrowser === 'string') {
                cachedCookieBrowser = settings.cookieBrowser;
                console.log(`[yt-dlp] Cookie browser from settings: ${cachedCookieBrowser}`);
                return cachedCookieBrowser;
            }
            if (settings.cookieBrowser === false || settings.cookieBrowser === 'none') {
                cachedCookieBrowser = false;
                console.log('[yt-dlp] Cookie extraction disabled in settings');
                return cachedCookieBrowser;
            }
        }
    } catch (_) { /* ignore */ }

    const browsers = detectInstalledBrowsers();
    cachedCookieBrowser = browsers.length > 0 ? browsers[0] : false;

    if (cachedCookieBrowser) {
        console.log(`[yt-dlp] Auto-detected browser for cookies: ${cachedCookieBrowser}`);
    } else {
        console.warn('[yt-dlp] No supported browsers detected for cookie extraction');
    }

    return cachedCookieBrowser;
}

ipcMain.handle('get-detected-browser', async () => ({
    current:   getCookieBrowser() || null,
    available: detectInstalledBrowsers()
}));

ipcMain.handle('reset-browser-cache', async () => {
    cachedCookieBrowser = null;
    return { success: true, detected: getCookieBrowser() };
});

// ------------------------------------------------------------------
// YT-DLP HELPERS
// ------------------------------------------------------------------

const YT_CLIENTS = {
    ios:        'ios',
    web:        'web', 
    mweb:       'mweb',
};

function buildYtDlpArgs(searchQuery, basePath, clientString, cookieBrowser, extraArgs = []) {
    const args = [
        searchQuery,
        '--extractor-args', `youtube:player_client=${clientString}`,
        '-f', 'bestaudio/best',
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--ffmpeg-location', app.isPackaged ? process.resourcesPath : __dirname,
        '-o', `${basePath}.%(ext)s`,
        '--no-playlist',
        '--force-overwrites',
        '--no-mtime',
        '--no-write-comments',
        '--no-simulate',
        '--newline',
        '--progress',
        '--progress-template', 'download:[download] %(progress._percent_str)s of %(progress._total_bytes_str)s',
        '--print', 'after_move:filepath',
        '--fragment-retries', '10',
        '--retries', '10',
        ...extraArgs
    ];

    if (cookieBrowser) {
        args.push('--cookies-from-browser', cookieBrowser);
        console.log(`[yt-dlp] Cookies: ${cookieBrowser} | Client: ${clientString}`);
    } else {
        console.log(`[yt-dlp] No cookies | Client: ${clientString}`);
    }

    return args;
}

function spawnYtDlp(args, onProgress, expectedBasePath) {
    return new Promise((resolve, reject) => {
        console.log(`[yt-dlp] Spawning: yt-dlp.exe ${args.join(' ')}`);

        const child = spawn(ytDlpPath, args, {
            windowsHide: true,
            env: { ...process.env }
        });

        let stdoutBuffer    = '';
        let stderrBuffer    = '';
        let stdoutRemainder = '';
        let stderrRemainder = '';
        let lastPercent     = -1;
        let printedPath     = null;
        let resolved        = false;
        let totalBytes      = 0;

        let pollInterval = null;

        if (expectedBasePath) {
            pollInterval = setInterval(() => {
                if (resolved) {
                    clearInterval(pollInterval);
                    return;
                }

                const dir  = path.dirname(expectedBasePath);
                const stem = path.basename(expectedBasePath);

                try {
                    const entries = fs.readdirSync(dir);
                    const partFile = entries.find(e =>
                        e.startsWith(stem) && e.endsWith('.part')
                    );

                    if (partFile && totalBytes > 0) {
                        const partPath = path.join(dir, partFile);
                        try {
                            const stat    = fs.statSync(partPath);
                            const percent = Math.min(
                                Math.round((stat.size / totalBytes) * 100),
                                99
                            );
                            if (percent !== lastPercent && percent > lastPercent) {
                                lastPercent = percent;
                                onProgress?.({ percent });
                            }
                        } catch (_) {}
                    }
                } catch (_) {}
            }, 500);
        }

        const ACTIVITY_MS = 180000;
        const TOTAL_MS    = 600000;
        let activityTimer;

        const resetActivityTimer = () => {
            clearTimeout(activityTimer);
            activityTimer = setTimeout(() => {
                if (resolved) return;
                console.warn('[yt-dlp] No output for 3 minutes — killing');
                child.kill('SIGTERM');
            }, ACTIVITY_MS);
        };

        const totalTimer = setTimeout(() => {
            if (resolved) return;
            console.error('[yt-dlp] Hard 10-minute limit — killing');
            child.kill('SIGTERM');
        }, TOTAL_MS);

        resetActivityTimer();

        const scanForProgress = (line) => {
            const totalMatch = line.match(/of\s+([\d.]+)(KiB|MiB|GiB|B)/i);
            if (totalMatch && totalBytes === 0) {
                const val  = parseFloat(totalMatch[1]);
                const unit = totalMatch[2].toUpperCase();
                totalBytes = unit === 'B'   ? val
                           : unit === 'KIB' ? val * 1024
                           : unit === 'MIB' ? val * 1024 * 1024
                           : unit === 'GIB' ? val * 1024 * 1024 * 1024
                           : 0;
                console.log(`[yt-dlp] Total size: ${totalMatch[1]}${totalMatch[2]} = ${totalBytes} bytes`);
            }

            const match = line.match(/\[download\]\s+([\d.]+)%/);
            if (!match) return false;
            const percent = Math.round(parseFloat(match[1]));
            if (percent !== lastPercent && percent > lastPercent) {
                lastPercent = percent;
                onProgress?.({ percent });
            }
            return true;
        };

        child.stdout.on('data', (chunk) => {
            resetActivityTimer();
            const str = chunk.toString();
            stdoutBuffer += str;

            const combined  = stdoutRemainder + str;
            const lines     = combined.split(/\r?\n/);
            stdoutRemainder = lines.pop() ?? '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (scanForProgress(trimmed)) continue;
                if (trimmed.match(/^[A-Za-z]:[\\\/]/) || trimmed.startsWith('/')) {
                    printedPath = trimmed;
                    console.log(`[yt-dlp] Captured path: ${printedPath}`);
                }
            }
        });

        child.stderr.on('data', (chunk) => {
            resetActivityTimer();
            const str = chunk.toString();
            stderrBuffer += str;

            const combined  = stderrRemainder + str;
            const lines     = combined.split(/\r?\n/);
            stderrRemainder = lines.pop() ?? '';

            for (const line of lines) {
                if (!scanForProgress(line)) {
                    const trimmed = line.trim();
                    if (trimmed) {
                        const tag = trimmed.includes('ffmpeg') ||
                                    trimmed.includes('[ExtractAudio]') ||
                                    trimmed.includes('Destination:')
                            ? '[ffmpeg]' : '[yt-dlp stderr]';
                        console.log(`${tag} ${trimmed}`);
                    }
                }
            }
        });

        child.on('close', (code) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(activityTimer);
            clearTimeout(totalTimer);
            clearInterval(pollInterval);

            if (!printedPath) {
                const lines = stdoutBuffer.trim().split('\n');
                for (let i = lines.length - 1; i >= 0; i--) {
                    const t = lines[i].trim();
                    if (t && (t.match(/^[A-Za-z]:[\\\/]/) || t.startsWith('/'))) {
                        printedPath = t;
                        break;
                    }
                }
            }

            onProgress?.({ percent: 100 });

            resolve({ code, printedPath, stderrBuffer });
        });

        child.on('error', (err) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(activityTimer);
            clearTimeout(totalTimer);
            clearInterval(pollInterval);
            reject(err);
        });
    });
}

function resolveOutputFile(printedPath, basePath) {
    if (printedPath && fs.existsSync(printedPath)) {
        console.log(`[yt-dlp] Output: ${printedPath}`);
        return printedPath;
    }

    const dir  = path.dirname(basePath);
    const stem = path.basename(basePath);
    for (const ext of ['.mp3', '.m4a', '.opus', '.webm', '.ogg']) {
        const candidate = path.join(dir, stem + ext);
        if (fs.existsSync(candidate)) {
            console.log(`[yt-dlp] Found via scan: ${candidate}`);
            return candidate;
        }
    }

    console.warn(`[yt-dlp] Assuming: ${basePath}.mp3`);
    return `${basePath}.mp3`;
}

// ------------------------------------------------------------------
// range HELPERS
// ------------------------------------------------------------------

function startLocalServer(rootDir, port = 0) {
    const mimeTypes = {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
        '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav',
        '.ogg': 'audio/ogg', '.m4a': 'audio/mp4'
    };

    const server = http.createServer((req, res) => {
        const url = decodeURIComponent(req.url.split('?')[0]);

        let filePath;
        if (url.startsWith('/media/')) {
            filePath = url.slice('/media/'.length);
            if (process.platform !== 'win32') filePath = '/' + filePath;
        } else {
            filePath = path.join(rootDir, url === '/' ? 'index.html' : url);
        }

        fs.stat(filePath, (err, stat) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            const ext = path.extname(filePath);
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            const range = req.headers.range;

            if (range) {
                // e.g. "bytes=12345-"
                const match = range.match(/bytes=(\d+)-(\d*)/);
                const start = match ? parseInt(match[1], 10) : 0;
                const end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1;
                const chunkSize = (end - start) + 1;

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': contentType
                });

                fs.createReadStream(filePath, { start, end }).pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': stat.size,
                    'Accept-Ranges': 'bytes',
                    'Content-Type': contentType
                });
                fs.createReadStream(filePath).pipe(res);
            }
        });
    });

    return new Promise(resolve => {
        server.listen(port, '127.0.0.1', () => resolve(server.address().port));
    });
}

// ------------------------------------------------------------------
// DOWNLOAD STREAM  (retry chain across multiple clients)
// ------------------------------------------------------------------

async function downloadAudioStream(searchQuery, targetFilePath, onProgress) {
    const basePath      = targetFilePath.endsWith('.mp3')
        ? targetFilePath.slice(0, -4)
        : targetFilePath;
    const cookieBrowser = getCookieBrowser();

    const dir  = path.dirname(basePath);
    const stem = path.basename(basePath);
    try {
        const entries = fs.readdirSync(dir);
        entries.forEach(entry => {
            if (entry.startsWith(stem) && entry.endsWith('.part')) {
                const partPath = path.join(dir, entry);
                try {
                    fs.unlinkSync(partPath);
                    console.log(`[yt-dlp] Cleaned up stale part file: ${partPath}`);
                } catch (_) {}
            }
        });
    } catch (_) {}

    const attempts = [
        { client: 'web',  cookies: cookieBrowser, label: 'web + cookies'   },
        { client: 'mweb', cookies: cookieBrowser, label: 'mweb + cookies'  },
        { client: 'web',  cookies: null,           label: 'web (no cookies)'},
    ];

    let lastStderr = '';

    for (let i = 0; i < attempts.length; i++) {
        const { client, cookies, label } = attempts[i];
        console.log(`\n[yt-dlp] Attempt ${i + 1}/${attempts.length} — ${label}`);

        const args   = buildYtDlpArgs(searchQuery, basePath, client, cookies);
        const result = await spawnYtDlp(args, onProgress, basePath);
        lastStderr   = result.stderrBuffer;

        if (result.code === 0) {
            console.log(`[yt-dlp] ✓ Attempt ${i + 1} succeeded (${label})`);
            return resolveOutputFile(result.printedPath, basePath);
        }

        const scanned = resolveOutputFile(result.printedPath, basePath);
        if (scanned && fs.existsSync(scanned)) {
            console.log(`[yt-dlp] ✓ File exists despite non-zero exit — using it: ${scanned}`);
            return scanned;
        }

        const isBotCheck    = lastStderr.includes('Sign in to confirm') &&
                              lastStderr.includes('not a bot');
        const isUnavailable = lastStderr.includes('Video unavailable') ||
                              lastStderr.includes('Private video')     ||
                              lastStderr.includes('has been removed');
        const needsPOToken  = lastStderr.includes('po_token') ||
                              lastStderr.includes('PO Token');

        console.warn(`[yt-dlp] ✗ Attempt ${i + 1} failed — bot:${isBotCheck} unavailable:${isUnavailable} potoken:${needsPOToken}`);

        if (isUnavailable) throw new Error('Video is unavailable or private on YouTube.');
    }

    const isBotCheck = lastStderr.includes('Sign in to confirm') &&
                       lastStderr.includes('not a bot');
    if (isBotCheck) {
        throw new Error(
            `YouTube bot-check blocked all clients.\n\n` +
            `Fix:\n` +
            `1. Open Firefox → youtube.com\n` +
            `2. Log in and watch any video for 30 seconds\n` +
            `3. Fully close Firefox\n` +
            `4. Restart this app and retry`
        );
    }

    throw new Error(
        `All ${attempts.length} download attempts failed.\n` +
        `Last error: ${
            lastStderr.split('\n')
                .filter(l => l.includes('ERROR'))
                .slice(-3).join('\n') || lastStderr.slice(-300)
        }`
    );
} 

// ------------------------------------------------------------------
// DOWNLOAD TRACK  (IPC entry point)
// ------------------------------------------------------------------

ipcMain.handle('download-track', async (event, { artist, title, album, coverUrl }) => {
    try {
        const cleanArtist = (artist || 'Unknown Artist').trim();
        const cleanTitle  = (title  || 'Untitled').trim();
        const cleanAlbum  = (album  || 'Unknown Album').trim();

        const sanitizedArtist = sanitizeFilename(cleanArtist);
        const sanitizedTitle  = sanitizeFilename(cleanTitle);

        const trackKey = `${cleanArtist}|||${cleanTitle}`;

        const appMusicDir = path.join(app.getPath('music'), 'side B');
        if (!fs.existsSync(appMusicDir)) fs.mkdirSync(appMusicDir, { recursive: true });

        const targetFilePath = path.join(appMusicDir, `${sanitizedArtist} - ${sanitizedTitle}.mp3`);
        const searchQuery    = `ytsearch1:${cleanArtist} ${cleanTitle} official audio`;

        const onProgress = (data) => {
            try {
                event.sender.send('download-progress', { trackKey, percent: data.percent });
            } catch (_) {}
        };

        console.log(`[download-track] Starting: ${cleanArtist} - ${cleanTitle}`);

        const coverPromise = (async () => {
            if (!coverUrl) return null;
            try {
                let rawBuffer = null;
                if (coverUrl.startsWith('http')) {
                    const response = await axios.get(coverUrl, {
                        responseType: 'arraybuffer',
                        timeout: 7000,
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    rawBuffer = Buffer.from(response.data);
                } else if (fs.existsSync(coverUrl)) {
                    rawBuffer = fs.readFileSync(coverUrl);
                }
                if (rawBuffer && Buffer.isBuffer(rawBuffer)) {
                    const image = nativeImage.createFromBuffer(rawBuffer);
                    if (!image.isEmpty()) {
                        return { imageBuffer: image.toJPEG(90), mimeType: 'image/jpeg' };
                    }
                }
            } catch (err) {
                console.warn('[download-track] Cover fetch failed:', err.message);
            }
            return null;
        })();

        const [actualFilePath, coverData] = await Promise.all([
            downloadAudioStream(searchQuery, targetFilePath, onProgress),
            coverPromise
        ]);

        if (!actualFilePath || !fs.existsSync(actualFilePath)) {
            throw new Error(`Download failed — file not found at: ${actualFilePath}`);
        }

        const tags = {
            title:  cleanTitle,
            artist: cleanArtist,
            album:  cleanAlbum
        };

        if (coverData?.imageBuffer) {
            tags.image = {
                mime:        'image/jpeg',
                type:        { id: 3, name: 'front cover' },
                description: 'Cover Art',
                imageBuffer: coverData.imageBuffer
            };
        }

        let tagged = false;
        for (let i = 0; i < 3; i++) {
            try {
                NodeID3.removeTags(actualFilePath);
                if (NodeID3.write(tags, actualFilePath)) {
                    tagged = true;
                    break;
                }
            } catch (e) {
                console.warn(`[download-track] Tag write attempt ${i + 1} failed:`, e.message);
                await new Promise(r => setTimeout(r, 200));
            }
        }

        if (!tagged) {
            console.warn('[download-track] Tag write failed, audio saved without tags.');
        }

        setImmediate(() => {
            preSeedCache(actualFilePath, cleanArtist, cleanTitle, cleanAlbum)
                .catch(err => console.warn('[download-track] Background cache seed failed:', err.message));
        });

        return { success: true, filePath: actualFilePath };

    } catch (err) {
        console.error('[download-track] Failed:', err);
        return { success: false, error: err.message || 'Unknown error' };
    }
});

ipcMain.handle('check-downloaded', async (event, { artist, title }) => {
    const sanitizedArtist = artist.replace(/[/\\?%*:|"<>]/g, '-').trim();
    const sanitizedTitle  = title.replace(/[/\\?%*:|"<>]/g, '-').trim();
    const filePath = path.join(
        app.getPath('music'),
        'side B',
        `${sanitizedArtist} - ${sanitizedTitle}.mp3`
    );
    return fs.existsSync(filePath);
});

async function preSeedCache(actualFilePath, cleanArtist, cleanTitle, cleanAlbum) { 
    await initMusicMetadata();
    const durationMeta = await mm.parseFile(actualFilePath).catch(() => null);
    const duration     = durationMeta?.format?.duration || 0;

    const pathKey = actualFilePath.toLowerCase();
    const tagKey  = `${cleanArtist}|${cleanAlbum}|${cleanTitle}`.toLowerCase();

    let musicbrainzData = null;
    let lyricsData      = null;

    try {
        const candidates = await musicbrainz.searchCandidates({
            artist: cleanArtist,
            title:  cleanTitle,
            album:  cleanAlbum,
            duration
        });
        const topMatch = candidates?.[0] ?? null;

        if (topMatch && topMatch.realScore >= 50) {
            const full    = await musicbrainz.lookupRecording(topMatch.id);
            const release = full?.releases?.[0];

            if (full?.id && full.title && full['artist-credit']?.length) {
                const [remoteCover, lyrics] = await Promise.allSettled([
                    release?.id ? coverart.downloadCover(release.id) : Promise.resolve(null),
                    lrclib.getLyrics({ title: cleanTitle, artist: cleanArtist, duration })
                ]).then(results => [
                    results[0].status === 'fulfilled' ? results[0].value : null,
                    results[1].status === 'fulfilled' ? results[1].value : null
                ]);

                musicbrainzData = {
                    recordingId: full.id,
                    releaseId:   release?.id   ?? null,
                    title:       full.title,
                    artist:      full['artist-credit'].map(a => a.name).join(', '),
                    album:       release?.title ?? null,
                    year:        release?.date  ?? null,
                    genres:      full.genres?.map(g => g.name) ?? [],
                    remoteCover: remoteCover ?? null
                };

                if (lyrics) {
                    lyricsData = {
                        remote: lyrics.plainLyrics  ?? null,
                        synced: lyrics.syncedLyrics ?? null
                    };
                }
            }
        }
    } catch (err) {
        console.warn('[preSeedCache] MusicBrainz lookup failed:', err.message);
    }

    const musicbrainzCache = cache.loadCache();
    const cacheEntry = {
        searched:    true,
        disabled:    false,
        musicbrainz: musicbrainzData,
        lyrics:      lyricsData
    };
    musicbrainzCache[pathKey] = cacheEntry;
    musicbrainzCache[tagKey]  = cacheEntry;
    cache.saveCache(musicbrainzCache);

    console.log(`[preSeedCache] Done: ${cleanArtist} - ${cleanTitle}`);
}

// ------------------------------------------------------------------
// MUSIC VIDEO DISPLAY (Updated)
// ------------------------------------------------------------------

let videoWindow = null;
let mainWindow = null;
const { BrowserView } = require('electron');
let videoView = null;

ipcMain.handle('get-music-video', async (event, { artist, title }) => {
    const cleanArtist = (artist || '').trim();
    const cleanTitle  = (title  || '').trim();
    if (!cleanTitle) return { success: false, error: 'Missing track title' };

    const searchQuery = `ytsearch1:${cleanArtist} ${cleanTitle} official music video`;
    const cookieBrowser = getCookieBrowser();

    const args = [
        searchQuery, 
        '--skip-download', 
        '--no-playlist',
        '--print', '%(id)s',
        '--extractor-args', 'youtube:player_client=web',
        '--socket-timeout', '30',
        '--force-ipv4' 
    ];
     
    if (cookieBrowser) {
        args.push('--cookies-from-browser', cookieBrowser);
    }

    return new Promise((resolve) => {
        const child = spawn(ytDlpPath, args, { 
            windowsHide: true, 
            env: { ...process.env }
        });
        
        let out = '', errOut = '';
        
        child.stdout.on('data', d => out += d.toString());
        child.stderr.on('data', d => errOut += d.toString());
        
        child.on('close', (code) => {
            const videoId = out.trim().split('\n').filter(Boolean)[0];
            
            if (videoId && videoId.length === 11) {
                console.log(`[get-music-video] Found: ${videoId}`);
                resolve({ success: true, videoId });
            } else {
                resolve({ 
                    success: false, 
                    error: errOut || 'No music video found'
                });
            }
        });
        
        child.on('error', (err) => {
            resolve({ success: false, error: err.message });
        });
    });
}); 
ipcMain.handle('open-video-player', async (event, videoId) => {
    if (!mainWindow) {
        return { success: false, error: 'Main window not found' };
    }

    // If already open, just load new video
    if (videoView) {
        videoView.webContents.loadURL(`https://www.youtube.com/watch?v=${videoId}`);
        return { success: true };
    }

    // Create BrowserView
    videoView = new BrowserView({
        webPreferences: {
            sandbox: true,
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.addBrowserView(videoView);
    
    // Position it over the cover area
    // Adjust these coordinates to match your cover element
    videoView.setBounds({ 
        x: 0,
        y: 0,
        width: 400,
        height: 400
    });

    videoView.webContents.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );

    // ✅ Use webContents.loadURL instead of videoView.loadURL
    videoView.webContents.loadURL(`https://www.youtube.com/watch?v=${videoId}`);

    return { success: true };
});
ipcMain.handle('close-video-player', async () => {
    if (videoView) {
        mainWindow.removeBrowserView(videoView);
        videoView.webContents.destroy();
        videoView = null;
    }
    return { success: true };
});
 
// ------------------------------------------------------------------
// WINDOW
// ------------------------------------------------------------------

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false
        }
    });

    mainWindow.webContents.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    mainWindow.webContents.session.cookies.defaults = {
        url: 'https://www.youtube.com'
    }; 
}

// ------------------------------------------------------------------
// YT-DLP AUTO-UPDATE
// ------------------------------------------------------------------

function updateYtDlp() {
    return new Promise((resolve) => {
        console.log('[yt-dlp] Checking for updates...');

        if (!fs.existsSync(ytDlpPath)) {
            console.error('[yt-dlp] yt-dlp.exe not found at:', ytDlpPath);
            resolve(false);
            return;
        }

        let settled = false;

        const child = spawn(ytDlpPath, ['-U'], {
            windowsHide: true,
            env: { ...process.env }
        });

        child.stdout.on('data', data => console.log(`[yt-dlp update] ${data.toString().trim()}`));
        child.stderr.on('data', data => console.log(`[yt-dlp update] ${data.toString().trim()}`));

        child.on('close', (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            code === 0
                ? console.log('[yt-dlp] Update check complete.')
                : console.warn(`[yt-dlp] Update exited with code ${code}`);
            resolve(code === 0);
        });

        child.on('error', (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            console.error('[yt-dlp] Update failed:', err.message);
            resolve(false);
        });

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill();
            console.warn('[yt-dlp] Update timed out after 30s, continuing anyway');
            resolve(false);
        }, 30000);
    });
}

// ------------------------------------------------------------------
// SPOTIFY LINK RESOLUTION
// ------------------------------------------------------------------

ipcMain.handle('resolve-spotify', async (event, input) => {
    try {
        return await spotify.resolveSpotify(input);
    } catch (err) {
        console.error('Spotify resolve failed:', err);
        return { ok: false, error: err.message };
    }
});

// ------------------------------------------------------------------
// APP LIFECYCLE
// ------------------------------------------------------------------
const http = require('http');

let localServerPort = null;
app.whenReady().then(async () => {
    await updateYtDlp().then(updated => {
        if (updated) console.log('[app] yt-dlp is up to date');
    });

    localServerPort = await startLocalServer(__dirname);
    createWindow();
    mainWindow.loadURL(`http://127.0.0.1:${localServerPort}/index.html`);

    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
            console.error('[app] Update check failed:', err);
        });
    }
}); 
ipcMain.handle('get-server-port', () => localServerPort);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});