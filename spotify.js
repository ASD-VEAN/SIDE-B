const axios = require('axios');

const SPOTIFY_RE = new RegExp(
    'open\\.spotify\\.com/(?:intl-[a-z]{2}/)?(track|album|playlist|artist)/([A-Za-z0-9]+)' +
    '|spotify:(track|album|playlist|artist):([A-Za-z0-9]+)',
    'i'
);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function parseSpotifyUrl(input) {
    if (!input || typeof input !== 'string') return null;
    const m = input.match(SPOTIFY_RE);
    if (!m) return null;
    return {
        type: (m[1] || m[3]).toLowerCase(),
        id:    m[2] || m[4]
    };
}

// ── Pull the __NEXT_DATA__ JSON blob out of an embed page ────────────────────
async function fetchEmbedData(type, id) {
    const url = `https://open.spotify.com/embed/${type}/${id}`;
    const res = await axios.get(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
        timeout: 12000
    });

    const match = res.data.match(
        /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );
    if (!match) throw new Error('Could not parse Spotify embed page');

    const json = JSON.parse(match[1]);
    return json?.props?.pageProps?.state?.data?.entity ?? null;
}

// ── oEmbed — no auth, works for every entity type (name + thumbnail only) ────
async function fetchOEmbed(type, id) {
    const url = `https://open.spotify.com/oembed?url=${
        encodeURIComponent(`https://open.spotify.com/${type}/${id}`)
    }`;
    const res = await axios.get(url, {
        headers: { 'User-Agent': UA },
        timeout: 10000
    });
    return res.data; // { title, thumbnail_url, ... }
}

function pickCover(entity) {
    const sources = entity?.coverArt?.sources || entity?.visualIdentity?.image || [];
    if (!sources.length) return null;
    // Largest available
    return sources.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a)).url;
}

function artistsToString(arr) {
    if (!Array.isArray(arr) || !arr.length) return 'Unknown Artist';
    return arr.map(a => a.name || a.profile?.name).filter(Boolean).join(', ');
}

// ── Normalise one embed track into the app's track shape ─────────────────────
function mapTrack(t, fallbackAlbum, fallbackCover) {
    return {
        source:      'Spotify',
        title:       t.title || t.name || 'Untitled',
        artist:      artistsToString(t.artists || t.subtitle && [{ name: t.subtitle }]),
        album:       fallbackAlbum || '',
        artwork:     pickCover(t) || fallbackCover || null,
        previewUrl:  t.audioPreview?.url || null,
        externalUrl: t.uid || t.uri
            ? `https://open.spotify.com/track/${(t.uri || '').split(':').pop()}`
            : null
    };
}

// ── Main entry point ─────────────────────────────────────────────────────────
async function resolveSpotify(input) {
    const parsed = parseSpotifyUrl(input);
    if (!parsed) return { ok: false, error: 'Not a Spotify link' };

    const { type, id } = parsed;

    // Artist pages have no usable track list in the embed —
    // return the artist name so the caller can run a normal search.
    if (type === 'artist') {
        try {
            const meta = await fetchOEmbed('artist', id);
            return {
                ok:         true,
                kind:       'artist',
                artistName: meta?.title || null,
                tracks:     []
            };
        } catch (err) {
            return { ok: false, error: `Spotify artist lookup failed: ${err.message}` };
        }
    }

    try {
        const entity = await fetchEmbedData(type, id);
        if (!entity) throw new Error('Empty Spotify response');

        const cover = pickCover(entity);

        // ── Single track ──────────────────────────────────────────────────────
        if (type === 'track') {
            return {
                ok:    true,
                kind:  'track',
                name:  entity.title || entity.name || '',
                tracks: [{
                    source:      'Spotify',
                    title:       entity.title || entity.name || 'Untitled',
                    artist:      artistsToString(entity.artists),
                    album:       entity.relatedEntityName || '',
                    artwork:     cover,
                    previewUrl:  entity.audioPreview?.url || null,
                    externalUrl: `https://open.spotify.com/track/${id}`
                }]
            };
        }

        // ── Album / playlist ──────────────────────────────────────────────────
        const list = entity.trackList || entity.trackListLite || [];
        const albumName = type === 'album' ? (entity.title || entity.name || '') : '';

        const tracks = list.map(t => mapTrack(t, albumName, cover));

        return {
            ok:       true,
            kind:     type,
            name:     entity.title || entity.name || '',
            truncated: list.length >= 30, // embeds usually cap around 30
            tracks
        };

    } catch (err) {
        console.error('[spotify] resolve failed:', err.message);
        return { ok: false, error: err.message };
    }
}

module.exports = { parseSpotifyUrl, resolveSpotify };