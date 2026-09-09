const https = require("https");

async function getLyrics(song) {

    const params = new URLSearchParams({

        track_name: song.musicbrainz?.title ?? song.title,
        artist_name: song.musicbrainz?.artist ?? song.artist

    });

    const url =
        `https://lrclib.net/api/search?${params}`;

    console.log("Searching LRCLIB:", url);

    return new Promise((resolve, reject) => {

        https.get(url, res => {

            let body = "";

            res.on("data", chunk => body += chunk);

            res.on("end", () => {

                if (res.statusCode !== 200) {

                    console.log("LRCLIB:", res.statusCode);

                    return resolve(null);

                }

                try {

                    const results = JSON.parse(body);

                    if (!Array.isArray(results) || !results.length) {

                        console.log("No lyrics found.");

                        return resolve(null);

                    }

                    const best = results.sort((a, b) => {

                        const aDiff = Math.abs(
                            (a.duration ?? 0) - Math.round(song.duration)
                        );

                        const bDiff = Math.abs(
                            (b.duration ?? 0) - Math.round(song.duration)
                        );

                        return aDiff - bDiff;

                    })[0];

                    console.log(
                        "Lyrics found:",
                        best.artistName,
                        "-",
                        best.trackName
                    );

                    resolve(best);

                }

                catch (err) {

                    console.error(err);

                    resolve(null);

                }

            });

        }).on("error", reject);

    });

}

module.exports = { getLyrics };