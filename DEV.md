# Developing Rehearsal Space

Electron + React + TypeScript. See [CLAUDE.md](CLAUDE.md) for conventions and
the layout of `src`.

```sh
npm install
npm run dev          # live-reloading Electron app
npm run build        # typecheck + production build into out/
npm test             # vitest
npm run pack         # build + electron-builder
```

**Linux:** Electron's SUID sandbox helper needs to be owned by root, which a
plain `npm install` does not do; `dev` and `start` set `ELECTRON_DISABLE_SANDBOX=1`.
Launching the binary by hand wants `--no-sandbox`. If `ELECTRON_RUN_AS_NODE` is
set in your shell, Electron starts as plain Node — unset it.

`RS_CAPTURE=/path/shot.png` renders the window offscreen to a PNG and exits,
which is how the UI is looked at over SSH or on Wayland. `RS_CAPTURE_DELAY`
(ms) waits longer.

## Testing

Most tests are pure and run in node — music and timing maths, the song schema,
progress parsers — plus the filesystem modules against a temp directory and the
job queue against real processes.

Component tests are the exception, and exist for one specific failure: a
component holding a copy of state that it also edits. A controlled input then
resets to the stale copy after every keystroke, so only the last character
survives — which presents as a field "appending one letter" rather than as a
stale read. Those declare `@vitest-environment jsdom` and drive real key events,
because nothing less reproduces it.

## Playback

One `AudioContext` owns the graph:

```
source (playbackRate = speed) -> channel gain -> Music bus -> [pitch] -> master
metronome                     -> Click bus    -> [delay]   ----------> master
```

Song time comes from the audio hardware's clock rather than being counted in
frames, so it stays right whether or not the UI is being drawn. Seeking rebuilds
the source nodes at a new offset, which is what lets scrubbing continue without
interrupting playback.

Tempo and pitch are independent by construction: `playbackRate` resamples for
tempo, and one pitch shifter on the Music bus corrects the pitch that causes,
set to `semitones - 12 * log2(speed)`. One phase vocoder for the whole song,
however many channels.

The music always runs through the shifter. Set to no shift it is transparent —
measured at −126 dB against a direct render, which is float rounding — so
routing around it buys nothing, and routing around it is what made touching a
knob interrupt the music: the shifter needs its own 120 ms of latency to fill
before it produces anything, and the two paths sit that far apart in time. So
there is one path, one constant 120 ms of output latency, and the click bus is
delayed to match.

Decoded channels are cached per song. Ids are unique only within a song, so
nothing decoded for one song may be kept when another loads.

## Adding channels

Four ways in, all through the job queue so none of them blocks the UI:

- **Import** a file from disk, or drop it on the window.
- **Download** from a URL with `yt-dlp`. Two jobs rather than one, because they
  are two things: a download that depends on somebody else's server, and a
  conversion that does not.
- **Record** from an input device, choosing which socket. An interface with two
  inputs arrives as one stereo device — a guitar in the first and a mic in the
  second are the left and right of one stream, not two devices — so the socket is
  picked and the take is mono. Everything the browser offers to help a phone call
  (echo cancellation, noise suppression, auto gain) is refused: they exist to
  make speech intelligible by altering it. A take recorded while the song plays
  is placed where the player *was*, which is the output's own latency behind the
  playhead — an estimate from the graph and the driver, not a measured round trip.

  A take is also the one thing in a song performed *against* the pitch and tempo
  knobs rather than written before them, so both are taken back off it on the way
  in (`takeCorrection`), or it meets them a second time on the way out. The pitch
  half shows as a channel that only sounds right while the knob stays put; the
  tempo half is worse, being a drift rather than an offset — a take recorded at
  150% ran a second early within three seconds.
- **Separate** into stems with `demucs`. One job, not seven: demucs writes to a
  predictable place, so every conversion is planned before anything runs. The
  original is kept and, by default, muted.

## Metronome channels

A metronome channel is anchored at its **end** — where the music picks the beat
back up — and its start is derived, at negative song time for a count-in. The
last beat *finishes* on the end time rather than starting there.

Both ends are placed by eye against the waveform, and the tempo is nudged to
whatever divides the span between them evenly: the BPM given only decides how
many beats fit. A click that drifts off the music it was lined up against is
worse than one a fraction of a BPM from what was typed.

Clicks are scheduled ahead against the audio clock, never fired by a timer —
timers are far too coarse to land on a beat.

## Storage

Settings live in `config.json` under Electron's userData directory
(`~/.config/rehearsal-space` on Linux): the library folder, the last song open,
interface scale, engaged colour, wheel speeds, tool paths.

The library is one directory per song, named after the song's title — rename a
song and the folder follows, so the library stays browsable outside the app.
A channel's audio file is named after the channel for the same reason.

```
<library>/coast-road/
  song.json     versioned; parsed with fallbacks, so a hand-edit cannot brick it
  audio/        one Ogg Vorbis file per audio channel, named for the channel
  peaks/        precomputed min/max envelopes, four zoom levels, filed by channel id
  tabs/         one text file per tablature
  lyrics.txt    plain text, copy-pasteable
```

## External tools

`ffmpeg`, `ffprobe`, `yt-dlp` and `demucs` are not bundled, but the app keeps
its own copies of the first three. On start it looks in `<userData>/tools` and
fetches whatever is missing from where each project publishes releases, so an
upgrade or a broken `PATH` elsewhere cannot take them away. A fetched copy is
run before it is kept, so a truncated download is never mistaken for a tool.

`yt-dlp` updates itself at every start with its own `-U`: it is the one tool
here that goes stale by itself, keeping up with sites that change under it. Only
the app's own copy is touched — a package manager's file is that package
manager's business. It is quiet about it: no network at startup is an ordinary
morning.

The download tables in `src/main/tools/releases.ts` cover Linux, macOS and
Windows on x64 and arm64. macOS and Windows builds are zips, unpacked in process
by `src/main/tools/zip.ts` (a couple of headers around `zlib`, checked against
the archive's own CRC), and gzipped tarballs by `tar.ts` the same way, because
neither platform has anything to unpack one with that can be relied on. Only the
Linux ffmpeg builds are `xz`, which Node cannot undo, so that one path asks
`tar` — reached only on Linux, where tar and xz are base system.

Tools are looked for in this order: a path set in Settings, the app's own copy,
`resources/bin` inside the app, then `PATH`.

### demucs

A Python program with an environment behind it, so it is built rather than
downloaded — and it is the better part of a gigabyte, so it is never fetched
unasked. Ask for stems without it and the app offers to install its own, saying
what that costs.

Saying yes fetches [uv](https://docs.astral.sh/uv/) — one static binary from
Astral, pinned to a version because the whole install rests on which flags it
answers to — and has it build a private Python and install demucs from PyPI with
PyTorch's processor-only build (`--torch-backend=cpu`, a fifth of the size).
It runs as one job, so it reports progress, keeps its log and can be cancelled.

Everything lands under `<userData>/tools/demucs`, and the environment variables
in `src/main/tools/demucsEnv.ts` are what keep it there. Two are load-bearing
beyond tidiness: `HF_HOME`, or the weights fetched during the install are
fetched again at the first separation; and `PATH` with the app's tools directory
first, because demucs falls back to `ffmpeg` for audio it cannot read itself —
which is every channel here, they are all ogg — and the app's ffmpeg is
deliberately not on the machine's PATH.

The install ends by running the demucs it just built. Not ceremony: 4.1.0
imports `numpy` on every platform but declares it only for Intel macs, so
installing exactly what it asks for leaves an environment that cannot import it.

Which demucs depends on the machine. `sphn`, which 4.1 reads audio with,
publishes wheels for Linux x86_64, Apple silicon and Windows x64 and nowhere
else — so on an Intel Mac or an ARM Linux box the app installs **4.0.1**, the
last demucs that decoded through torchaudio. Same arguments, same files, same
two models, so nothing above `demucsEnv.ts` knows the difference; pinned to
Python 3.11, `torch<2.3` (PyTorch stopped building for Intel Macs after 2.2) and
`numpy<2` (a torch built against numpy 1 does not refuse numpy 2, it crashes).
Windows on ARM is the only machine that cannot have it at all.

## Packaging

`npm run pack` produces, for whatever platform you are on, the files described
in [electron-builder.yml](electron-builder.yml):

| | |
|---|---|
| `rehearsal-space-<version>-linux-x86_64.AppImage` | one file, runs from anywhere |
| `rehearsal-space-<version>-linux-amd64.deb` | installs itself, launcher and icons included |
| `rehearsal-space-<version>-mac-arm64.dmg` | Apple silicon |
| `rehearsal-space-<version>-mac-x64.dmg` | Intel |
| `rehearsal-space-<version>-win-x64.exe` | installs for the current user, no administrator |
| `rehearsal-space-<version>-win-x64.zip` | the same, unpacked |

The platform and processor are in the name because a release holds a file for
each, and "which one do I want" should be answerable from the name. `pack` does
not run the tests.

An AppImage wants libfuse2 to mount itself; without it,
`./dist/rehearsal-space-*.AppImage --appimage-extract-and-run`. Windows packages
fine from Linux — nothing here is compiled — but macOS needs a Mac, the icon
conversion alone being a macOS-only program.

`files` names `out/**` and `package.json` and nothing else. Without that
allowlist electron-builder ships the whole working tree: every source file, the
fourteen megabytes of tuner fixtures, and any private notes lying about. The
asar is about 10 MB; if it grows to 25, that is what has happened.

### Releases

[`.github/workflows/release.yml`](.github/workflows/release.yml) builds all
three platforms and, when the commit is tagged `v<version>`, puts the files on a
**draft** release. Draft, because a build that packages is not a build that
works. Run it by hand (`workflow_dispatch`) and it builds the same files as
artifacts, publishing nothing. The tag has to agree with `package.json` and the
workflow refuses if it does not.

```sh
npm version minor          # writes package.json and tags it
git push --follow-tags
```

Nothing is signed with a real certificate. macOS builds are ad-hoc signed —
enough to run on Apple silicon, which refuses unsigned code outright — but not
notarised, so a first open has to be through the context menu. Windows builds
are unsigned, so SmartScreen warns until the download earns a reputation. What
that looks like to somebody downloading one is in
[build/release-notes.md](build/release-notes.md), which every release carries as
its notes. Real signing is a paid Apple account plus `CSC_LINK` /
`CSC_KEY_PASSWORD` (and `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID` to notarise), with `identity: null` out of the config.

[`check.yml`](.github/workflows/check.yml) runs the typecheck and tests on every
push and pull request, on one machine: the suite is about what the app does, not
what the platform does.

### The icon, and getting it to show

`build/icon.png` is drawn by [build/icon.py](build/icon.py) (`python3
build/icon.py`, needs Pillow) so it can be changed rather than redrawn. Nothing
in `build/` ships.

An AppImage is one file and nothing on the system knows it exists. The desktop
matches a window to a launcher by app id and takes the name and icon from there
— on Wayland that is the only route, so setting `icon` on the `BrowserWindow`
fixes nothing. With no launcher the dock shows a blank gear labelled
`rehearsal-space`. The `.deb` lays a launcher down itself; for the AppImage:

```sh
./build/install-launcher.sh dist/rehearsal-space-*.AppImage
```

That writes `~/.local/share/applications/rehearsal-space.desktop` and an icon
beside it, pointing at the AppImage where it stands — so keep it somewhere of
its own and run this again if it moves. The filename has to match the app id.
`desktopName` in **package.json** and `linux.syncDesktopName` in the builder
config are the other half; `desktopName` does not go in the linux section, where
it looks like it belongs — that fails validation with a message naming neither
the key nor the reason.
