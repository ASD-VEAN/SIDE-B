# SIDE B

A retro, terminal-styled desktop music player built with Electron. Point it at a local music folder and it handles the rest — matching your tracks against MusicBrainz, pulling in synced lyrics, fetching cover art, and wrapping it all in a CRT/command-line aesthetic with a handful of selectable themes.

## Features

- **Local library scanning** — point SIDE B at a folder and it reads your files directly
- **Automatic metadata enrichment** — matches tracks against MusicBrainz for accurate title/artist/album/genre, with manual override or disable per song if a match is wrong
- **Synced lyrics** — fetched from LRCLib, with a built-in editor if you want to paste/correct your own
- **10-band equalizer** with custom presets
- **Themes** — MATRIX, GAMEBOY, CYBERPUNK, ERR0R, WARNING, NOIR, POWERSHELL, ENTHROPY, and GENESIS, each with their own icon set and (for a couple of them) reactive visual effects
- **Custom fonts and wallpapers**
- **Playlists, favorites, and a play queue** (play next / add to queue)
- **Similar Tracks & Album Explorer** — discover related songs and album tracklists, with instant preview playback
- **Download tracks** by searching and pulling audio via yt-dlp, including Spotify link resolution(saves to music/side b only)
- **Music video playback**
- **Visualizer** and **sleep timer**

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)
- `yt-dlp.exe`, `ffmpeg.exe`, and `ffprobe.exe` placed in the project root (used for downloading and converting audio)

### Install

```bash
npm install
```

### Run in development

```bash
npm start
```
(if you have slow internet like me, download electron binary manually, terminals tend to time out unless you increase the timeout by hand. if you did download manually you instead have to use something along the lines of: "node_modules\electron\dist\electron.exe .")

### Build a Windows portable executable

```bash
npm run build:win
```

The build output lands in `dist/`. This bundles `yt-dlp.exe`/`ffmpeg.exe`/`ffprobe.exe` as external resources alongside the app rather than inside the archive, since they need to be run directly.

## Tech

Electron, vanilla JS/HTML/CSS on the frontend, with MusicBrainz, LRCLib, Cover Art Archive, and yt-dlp powering enrichment, lyrics, artwork, and downloads respectively. A local HTTP server handles audio streaming to support seeking.

A mobile version (Capacitor-based) is in early progress.

## Notes/bugs

Please so keep in mind that this is a very early build and i am an independent developer and not funded. Because of this, everything used is free so while using the app you might have problems with the following:
- music video playback: i did and still am trying to find a stable workaround. some videos don't allow embeds(I've temporarily put in an option to open videos in your browser to combat this) and I'm trying to fix the bot verification problem but for the time being, if you log into youtube any time within the app the problem goes away)
- similars/album explorer: these features both run on itunes, which can limit you or sometimes fully disconnect since, again, i didn't pay for an API. yes, i could add a few seconds of padding, but i didn't want to slow it, but i will be trying to fix this. for now, just try again in a few minuets.
- other API related setbacks: to my knowledge, musicbrainz, cover art archive and LRCLib should function well. but if you have any problems thats totally normal because, again, free APIs aren't very flexible.

just an overall warning, metadata fetching can be inaccurate, especially with bad naming. musicbrainz doesn't have many popular/mainstream albums. i am working on finding a better replacement.

## License

## License

Public domain — Do whatever you want with it. I would love to see improvements i couldn't make myself. If you think your version is genuinly better... well, go ahead. It's yours now. i renounce my rights to the crown. 
