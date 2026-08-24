# Rehearsal Space

Rehearsal Space is an all-in-one tool for music practice and song-writing.

See [SPEC.md](SPEC.md) for what it does.

## Running it

```sh
npm install
npm run dev          # live-reloading Electron app
npm run build        # typecheck + production build into out/
npm test             # vitest: pure logic, main-process modules, and components
```

### Linux notes

Electron's SUID sandbox helper needs to be owned by root, which it is not in a
plain `npm install`. The `dev` and `start` scripts set `ELECTRON_DISABLE_SANDBOX=1`
to work around it. If you launch the binary by hand, pass `--no-sandbox`.

If `ELECTRON_RUN_AS_NODE` is set in your shell, Electron starts as plain Node and
`require('electron')` returns the npm helper instead of the real module. Unset it
(`env -u ELECTRON_RUN_AS_NODE ...`).

### Looking at the UI without a screen

Setting `RS_CAPTURE=/path/shot.png` renders the window offscreen to a PNG and
exits. Useful on Wayland, over SSH, or in CI. `RS_CAPTURE_DELAY` (milliseconds)
waits longer before the shot when something slow is still loading.

```sh
npm run build
env -u ELECTRON_RUN_AS_NODE ELECTRON_DISABLE_SANDBOX=1 \
  RS_CAPTURE=/tmp/shot.png npx electron .
```

## Layout

```
src/
  main/      Electron main: windows, IPC, the job queue, external tools, library
  preload/   the one contextBridge surface
  shared/    the IPC contract, imported by both sides
  core/      pure TypeScript — no Electron, no DOM. This is where the tests are,
             and what a future mobile/web app reuses.
  renderer/  React UI and the audio engine
    ui/primitives   the two materials: raised things you touch, wells you read
    ui/shell        header, scrub bar, tool rail, stage, drawer, mixer dock
    ui/views        Library, Player, Setup
    ui/tools        the tool registry and each tool's panel
```

## Testing

Most tests are pure and run in node — music and timing maths, the song schema,
progress parsers — plus the filesystem modules against a temp directory, and
the job queue against real processes.

Component tests are the exception, and exist for one specific failure: a
component holding a copy of state that it also edits. A controlled input then
resets to the stale copy after every keystroke, so only the last character
survives, which presents as the field "appending one letter" rather than as a
stale read. Those tests declare `@vitest-environment jsdom` in a docblock and
drive real key events, because nothing less reproduces it.

When adding one, check it fails against the bug before trusting it to catch the
bug.

## External tools

`ffmpeg`, `ffprobe`, `yt-dlp` and `demucs` are not bundled. They are
looked for in this order: a path you set in Settings, then the app's own
`resources/bin`, then `PATH`. Settings reports what was found and lets you
point any of them at a specific binary — useful for a local build that is not
installed system-wide. Anything that runs them goes through the job queue, so the UI never
blocks: work reports as a toast with progress, keeps its console log for
diagnosis, and cancelling kills the whole process tree rather than orphaning
workers. Successful jobs take themselves off the queue; failures stay until
dismissed.

## Where things are stored

Settings live in `config.json` under Electron's userData directory
(`~/.config/rehearsal-space` on Linux): the library folder, the last song that
was open, and the interface scale.

The library is one directory per song, and the directory name follows the
song's title — rename a song and the folder is renamed with it, so the library
stays browsable outside the app.

```
<library>/comeback-season/
  song.json     versioned; parsed with fallbacks, so a hand-edit cannot brick it
  audio/        one Ogg Vorbis file per audio channel
  peaks/        precomputed min/max waveform envelopes, four zoom levels
  lyrics.txt    plain text, copy-pasteable        (M9)
```
