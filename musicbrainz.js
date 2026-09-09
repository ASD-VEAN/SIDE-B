const https = require("https");
const levenshtein = require("fast-levenshtein");
const MIN_REQUEST_INTERVAL_MS = 1000;
let lastRequestTime = 0;

async function throttle() {
    const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestTime);
    if (wait > 0) await new Promise(res => setTimeout(res, wait));
    lastRequestTime = Date.now();
}

function request(url) {
    return new Promise((resolve, reject) => {
        throttle().then(() => {
            https.get(url, {
                headers: {
                    "User-Agent": "RetroPlayer/1.0 (your@email.com)"
                }
            }, res => {
                let body = "";
                res.on("data", c => body += c);
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (err) {
                        reject(err);
                    }
                });
            }).on("error", reject);
        });
    });
}

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
    const distance = levenshtein.get(a, b);
    return 1 - distance / Math.max(a.length, b.length);
}

async function search(song) {
    const queries = [
        [
            `recording:"${escapeMB(song.title)}"~`,
            `artist:"${escapeMB(song.artist)}"`
        ].join(" AND "),
        [
            `recording:${escapeMB(song.title)}`,
            `artist:${escapeMB(song.artist)}`
        ].join(" AND "),

        `recording:${escapeMB(song.title)}`
    ];

    for (const query of queries) {
        const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&limit=20&fmt=json`;
        const result = await request(url);

        if (result.recordings?.length) {
            return result;
        }
    }

    return { recordings: [] };
}

async function searchCandidates(song) {
    const searchRes = await search(song);
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

async function lookupRecording(id) {
    return request(
        `https://musicbrainz.org/ws/2/recording/${id}?inc=releases+artists+genres+tags&fmt=json`
    );
}

module.exports = {
    search,
    searchCandidates,
    lookupRecording
};