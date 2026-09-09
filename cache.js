const fs = require("fs");
const path = require("path");
const { app } = require("electron");

// Same reasoning as SETTINGS_FILE in main.js - dev mode uses the project
// folder, packaged builds use userData.
const CACHE_DIR = app.isPackaged
    ? path.join(app.getPath("userData"), "cache")
    : path.join(__dirname, "cache");

function cacheFilePath(filename = "musicbrainz.json") {
    return path.join(CACHE_DIR, filename);
}

function loadCache(filename = "musicbrainz.json") {

    const file = cacheFilePath(filename);

    if (!fs.existsSync(file))
        return {};

    return JSON.parse(fs.readFileSync(file, "utf8"));

}

function saveCache(cache, filename = "musicbrainz.json") {

    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    fs.writeFileSync(
        cacheFilePath(filename),
        JSON.stringify(cache, null, 4)
    );

}

module.exports = {
    loadCache,
    saveCache
};