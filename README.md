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

### Running against throwaway everything

Anything that launches the app for testing must point `HOME` at a scratch
directory:

```sh
env HOME=/tmp/rs-test XDG_CONFIG_HOME=/tmp/rs-test/.config npx electron .
```

`--user-data-dir` alone is not enough, and the way it fails is quiet. It moves
`config.json` somewhere harmless, but the *library folder* is a setting inside
that file — so a run with no config falls back to the default library, which
lives in the real home directory. The test then reads and writes real songs
while looking perfectly isolated. Overriding `HOME` moves the default itself,
so a run that seeds no settings at all still cannot reach anything real.

Seed a library path explicitly as well if the test needs songs in it. Both
together, not either one.

### Verifying UI behaviour

Driving the app to check something usually means adding a temporary harness to
the renderer and building it. **Do that in a separate worktree, never in the
working copy**, because `out/` is the same directory a running app loads from —
so a harness built here is picked up by whatever the user has open, and does
whatever it was written to do to their songs. Moving `HOME` does not help: it
isolates the run, not the build the user's own app is reading.

```sh
git worktree add -f --detach /tmp/rs-verify "$(git rev-parse HEAD)"
ln -s "$PWD/node_modules" /tmp/rs-verify/node_modules
rsync -a --delete src/ /tmp/rs-verify/src/   # before every run
# then patch, build and run entirely inside /tmp/rs-verify
```

Copy the whole of `src` in each time rather than resetting the worktree with
git. The worktree sits on the commit it was made at, so `git checkout -- src/`
inside it restores *that* commit — which quietly reverted a half-finished
feature to the version before it existed and made a working change look
broken.

### Looking at the UI without a screen

Setting `RS_CAPTURE=/path/shot.png` renders the window offscreen to a PNG and
exits. Useful on Wayland, over SSH, or in CI. `RS_CAPTURE_DELAY` (milliseconds)
waits longer before the shot when something slow is still loading.

```sh
npm run build
env -u ELECTRON_RUN_AS_NODE ELECTRON_DISABLE_SANDBOX=1 \
  HOME=/tmp/rs-test XDG_CONFIG_HOME=/tmp/rs-test/.config \
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
    audio/          the Web Audio graph and the clock everything reads
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

## Playback

One `AudioContext` owns the graph:

```
source (playbackRate = speed) -> channel gain -> Music bus -> [pitch] -> master
metronome                     -> Click bus    -> [delay]   ----------> master
```

Song time is derived from the audio hardware's clock rather than counted in
frames, so it stays right whether or not the UI is being drawn. Seeking rebuilds
the source nodes at a new offset, which is what lets scrubbing continue without
interrupting playback.

Tempo and pitch are independent by construction: `playbackRate` resamples for
tempo, and one pitch shifter on the Music bus corrects the pitch that causes,
set to `semitones - 12 * log2(speed)`. That is one phase vocoder for the whole
song no matter how many channels there are.

The music always runs through the shifter, whether or not anything is being
shifted. Set to no shift it is transparent — measured at -126 dB against a
direct render, which is float rounding — so routing around it buys nothing, and
routing around it is what made touching a knob interrupt the music: the shifter
needs its own 120 ms of latency to fill before it produces anything, and the
two paths sit that far apart in time.

So there is one path, one constant 120 ms of output latency, and the click is
delayed to match it. Changing tempo or pitch tells the shifter a new number and
rewires nothing.

## Adding channels

Three ways in, all through the job queue so none of them blocks the UI:

- **Import** a file from disk, or drop it on the window.
- **Download** from a URL with `yt-dlp`. Two jobs rather than one, because they
  are two things: a download that depends on somebody else's server, and a
  conversion that does not. The file is named after the title, so the channel
  and the song folder are too.
- **Separate** a channel into stems with `demucs`. One job, not seven —
  `demucs` writes to a predictable place, so every conversion is planned before
  anything runs and the whole thing reports as a single piece of work. The
  original is kept and, by default, muted.

## Metronome channels

A metronome channel is anchored at its **end** — the point where the music
picks the beat back up — and its start is derived. That is what makes a
count-in useful: you set where the band comes in and the clicks arrive before
it, at negative song time if need be. The last beat *finishes* on the end time
rather than starting there.

Both ends are placed by eye against the waveform, and the tempo is nudged to
whatever divides the span between them evenly. The BPM given only decides how
many beats fit; the exact tempo follows, so the first click lands on the start
and the last beat finishes on the end. A click that drifts off the music it was
lined up against is worse than one a fraction of a BPM from what was typed.

Clicks are scheduled ahead of time against the audio clock, never fired by a
timer — timers are far too coarse to land on a beat. They ride the Click bus,
which is delayed to match the pitch shifter, so click and music stay level.

A click track is set up entirely in the alignment tool, against the music it
has to fit: it draws the precomputed waveform of whichever channel you are
lining up against, down to a quarter of a second across the window, with the
beat grid over it, the two ends as handles, and the sound, tempo, time
signature and accent beside them. Which zoom level of the pyramid to read, and which peaks fall
in which pixel, are worked out in core where they are tested; the canvas only
draws.

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
