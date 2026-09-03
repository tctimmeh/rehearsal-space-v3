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

## Packaging

```sh
npm run pack         # typecheck + build + electron-builder
```

Out come two things, both described in
[electron-builder.yml](electron-builder.yml), neither needing an argument:

| | |
|---|---|
| `dist/rehearsal-space-<version>.AppImage` | one file, runs from anywhere, installs nothing |
| `dist/rehearsal-space-<version>.deb` | installs itself, launcher and icons included |

`pack` typechecks and builds but does not run the tests — `npm test` is still
yours to run.

An AppImage wants libfuse2 to mount itself. On a machine without it:

```sh
./dist/rehearsal-space-*.AppImage --appimage-extract-and-run
```

A single target when that is all you want: `npx electron-builder --linux deb`.

### What goes in, and what must not

`files` names `out/**` and `package.json`, and nothing else. Production
dependencies come along on their own; everything else is left behind on
purpose. Without that allowlist electron-builder ships the entire working tree
— every source file, the fourteen megabytes of tuner fixtures, the tsconfigs
and any private working notes lying about — which is both a much larger
download and a copy of the repository handed to whoever runs it. The asar is
about 10 MB; if it grows to 25 again, that is what has happened.

### The icon

`build/icon.png` is drawn by [build/icon.py](build/icon.py) rather than kept
only as a PNG, so it can be changed rather than redrawn:

```sh
python3 build/icon.py       # needs Pillow
```

Nothing in `build/` ships. It is a build resource, and the app itself is
`out/`.

### Getting the name and icon to show

An AppImage is one file and nothing on the system knows it exists. The desktop
matches a running window to a launcher by app id, and takes the name and the
icon from that launcher — on Wayland that is the only route there is, since no
protocol lets a window carry its own icon, so setting `icon` on the
`BrowserWindow` fixes nothing. With no launcher installed the dock has only the
app id to go on, and shows a blank gear labelled `rehearsal-space`.

The `.deb` has none of this trouble: it lays the launcher and the icon down
where the desktop looks, and needs nothing further.

```sh
sudo apt install ./dist/rehearsal-space-*.deb
```

For the AppImage, the `.desktop` entry inside it is not read by anything until
it is installed, so install one:

```sh
./build/install-launcher.sh dist/rehearsal-space-*.AppImage
```

That writes `~/.local/share/applications/rehearsal-space.desktop` and an icon
beside it. The name of that file is not decoration — it has to match the app
id, which Electron takes from the executable inside the AppImage.

It points at the AppImage where it stands, so keep the AppImage somewhere of
its own rather than in `dist`, and run this again if it moves or the version in
its filename changes. Installing the `.deb` as well would give a second entry
for the same app, so remove
`~/.local/share/applications/rehearsal-space.desktop` if you go that way.

`desktopName` in **package.json** and `linux.syncDesktopName` in the builder
config are the other half of this: they name the entry that a real install
would lay down. `desktopName` does not go in the linux section, where it looks
like it belongs — that fails validation with `configuration.linux should be one
of these: null`, which names neither the offending key nor the reason.

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

`ffmpeg`, `ffprobe`, `yt-dlp` and `demucs` are not bundled, but the app keeps
its own copies of the first three. On start it looks for them in
`~/.config/rehearsal-space/tools` (the app's user data directory, wherever the
platform puts it) and fetches whatever is missing from where each project
publishes its releases — the static builds ffmpeg.org points at for each
platform, and yt-dlp's own executables — so an upgrade, a removed package or a
broken `PATH` elsewhere on the machine cannot take them away. A fetched copy
is asked to run before it is kept, so a download cut off part way through is
never mistaken for a tool. `demucs` is a Python program with an environment
behind it and is left to the system.

The download tables in `src/main/tools/releases.ts` cover Linux, macOS and
Windows on x64 and arm64, and the names carry the platform's suffix, so
nothing here is what would stop the app running elsewhere. Every macOS and
Windows build is published as a zip, unpacked in process by
`src/main/tools/zip.ts` — a couple of headers around `zlib`, checked against
the archive's own CRC — because neither platform has anything to unpack one
with that can be relied on. Only the Linux builds are tarballs, and `xz` is
not something Node can undo, so that one path asks `tar`: it is reached only
on Linux, where tar and xz are part of the base system. The macOS and Windows
addresses are written but untested on those platforms; the Apple silicon
ffmpeg addresses carry the ffmpeg series in the name and will need revisiting
when ffmpeg 8 lands.

They are looked for in this order: a path you set in Settings, then the app's
own copy, then `resources/bin` inside the app, then `PATH`. Settings reports
what was found, where it came from, and lets you fetch a copy again — yt-dlp
goes stale within weeks — or point any of them at a specific binary, useful
for a local build that is not installed system-wide. Anything that runs them
goes through the job queue, so the UI never blocks: work reports as a toast with progress, keeps its console log for
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
- **Record** from an input device, choosing which socket. An interface with two
  inputs arrives as one stereo device — a guitar in the first and a microphone
  in the second are the left and right of the same stream, not two devices — so
  the socket is picked and the take is mono. Everything the browser offers to help a phone
  call — echo cancellation, noise suppression, automatic gain — is refused;
  they exist to make speech intelligible by altering it. A take recorded while
  the song plays is placed where the player *was*, which is a little behind the
  playhead: what they were following is what they could hear, and that is the
  output's own latency late. The compensation is an estimate from the graph and
  the driver, not a measured round trip.
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
