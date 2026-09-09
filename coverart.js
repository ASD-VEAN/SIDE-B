const https = require("https");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

// Same reasoning as CACHE_DIR in cache.js - dev mode uses the project
// folder, packaged builds use userData.
const COVER_FOLDER = app.isPackaged
    ? path.join(app.getPath("userData"), "cache", "covers")
    : path.join(__dirname, "cache", "covers");

if (!fs.existsSync(COVER_FOLDER)) {
    fs.mkdirSync(COVER_FOLDER, { recursive: true });
}

function download(url, destination) {

    return new Promise((resolve, reject) => {

        const options = {headers: {"User-Agent": "RetroPlayer/1.0 (your@email.com)"}};

        https.get(url, options, res => {

            console.log("HTTP", res.statusCode, url);

            if (
                [301, 302, 307, 308].includes(res.statusCode) &&
                res.headers.location
            ) {

                console.log("Redirect ->", res.headers.location);

                res.resume(); // discard redirect body

                return resolve(
                    download(res.headers.location, destination)
                );

            }

            if (res.statusCode !== 200) {

                res.resume();

                return resolve(null);

            }

            const stream =
                fs.createWriteStream(destination);

            res.pipe(stream);

            stream.on("finish", () => {

                stream.close(() => {

                    console.log("Saved:", destination);

                    resolve(destination);

                });

            });

            stream.on("error", err => {

                fs.unlink(destination, () => {});

                reject(err);

            });

        }).on("error", reject);

    });

}

async function downloadCover(releaseId) {

    const file =
        path.join(COVER_FOLDER, `${releaseId}.jpg`);

    // Already downloaded
    if (fs.existsSync(file)) {

        console.log("Using cached cover:", releaseId);

        return file;

    }

    console.log("Downloading cover:", releaseId);

    const url =
        `https://coverartarchive.org/release/${releaseId}/front`;

    return download(url, file);

}

module.exports = {
    downloadCover
};