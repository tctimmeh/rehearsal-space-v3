# Working on Rehearsal Space

A desktop tool for practising and writing songs. **Not a DAW** — no effects
chains, no sample-accurate editing. Every feature answers "this helps someone
learn or write a song", and features are judged on whether they'd be reached for
with a guitar in hand.

[DEV.md](DEV.md) has the build, packaging, release and subsystem detail.

## Layout

```
src/
  core/      pure TypeScript — no Electron, no DOM. Logic and its tests live here.
  main/      Electron main: windows, IPC, job queue, external tools, the library
  preload/   the one contextBridge surface
  shared/    the IPC contract, imported by both sides
  renderer/  React UI and the audio engine
    ui/primitives  the two materials (see below)
    ui/shell       header, scrub bar, tool rail, stage, drawer, mixer dock
    ui/views       Library, Player
    ui/tools       the tool registry and each tool's panel
    audio/         the Web Audio graph and the clock everything reads
```

Logic goes in `core` and is tested there; components stay thin renderers of it.
A pure function with a test beats a component that does arithmetic.

## Style

- **No formatter, ever.** Style is by hand. Never run prettier here.
- Comments explain *why*, and only what the code cannot be made to say itself.
  Prefer better names and smaller functions to a comment. Where a comment earns
  its place it usually records the failure that made the code what it is.
- Match the surrounding prose: plain words, no marketing, no hedging.
- Commit messages say what changed and what it fixes, in prose.

## The material rule

The whole aesthetic, defined at the top of `renderer/ui/theme.css`:

- something you **read** → `.well` (dark inset)
- something you **touch** → `.raised` (top highlight, drop shadow)
- pressed → the well treatment; **latched** → the well, lit from inside in
  `--engaged` (a user setting)
- something that is **running** keeps its own green and glows: `--go-glow`

## Verifying UI behaviour

Unit tests miss what the running app shows. Several bugs this session were only
visible in the real thing. When it matters, drive the app.

**Build in a separate worktree, never the working copy** — `out/` is what the
user's running app loads, so a harness built here is picked up by their app and
does whatever it was written to do to their songs.

```sh
git worktree add -f --detach /tmp/rs-verify "$(git rev-parse HEAD)"
ln -s "$PWD/node_modules" /tmp/rs-verify/node_modules
rsync -a --delete --exclude node_modules --exclude out --exclude .git ./ /tmp/rs-verify/
```

Copy `src` in with rsync each time; `git checkout` inside the worktree restores
the commit it was made at and silently reverts the work being tested.

Every launch must move `HOME` to a scratch directory. `--user-data-dir` alone is
not enough and fails quietly: the library folder is a *setting inside* the
config file, so a run with no config falls back to the real library and edits
real songs while looking isolated.

```sh
env -u ELECTRON_RUN_AS_NODE HOME=/tmp/rs-home \
  RS_LOG=/tmp/drive.log RS_CAPTURE=/tmp/shot.png RS_CAPTURE_DELAY=8000 \
  npx electron . --no-sandbox
```

- `RS_CAPTURE` renders offscreen to a PNG and exits; `RS_CAPTURE_DELAY` waits.
  Do **not** pass `--disable-gpu` — `capturePage` then never returns.
- `ELECTRON_RUN_AS_NODE` in the environment breaks Electron; unset it.
- Inject a drive by patching `src/main/index.ts` in the worktree and reading the
  DOM back through `webContents.executeJavaScript`. **Read the DOM and computed
  styles rather than judging from a screenshot.**
- CDP `Input.dispatchMouseEvent` takes **CSS pixels**, not device pixels — do
  not scale by the interface zoom.
- Never open the real audio interface (a Roland Rubix22 is attached); use
  Chromium's fake-device flags.

## Tests

`npx vitest run` — 1400+, fast. Both typechecks (`npm run typecheck`) and
`npm run build` before committing; vitest strips types and will not catch a type
error in a test file.

**Confirm every new test fails against the old code.** Revert the fix in a copy,
run it, put it back. A test that passes either way is a test that proves nothing,
and several this session did until checked.

When a test disagrees with the code, suspect the fixture first: most failures
here have been a fixture that was wrong, not behaviour that was.

## Things that have bitten

- A channel id is unique **inside its song and nowhere else** — every song's
  first recording has the id `Take 1`. Nothing global may be keyed by it.
- A metronome channel is anchored at its **end**; its start is derived and may be
  before 00:00. So the song's own bounds move while its start marker is dragged.
- The song's directory name follows its title, and a channel's audio filename
  follows the channel's name. Both are renamed on save, and both are skipped
  while a job holds the song (`heldStill`).
- The renderer must adopt `id` and each channel's `file` back from a save, and
  nothing else — the rest is the user's, who may have typed while it was away.

## Never

- Rewrite git history without being asked.
- Delete `~/.config/rehearsal-space/config.json`.
- Track `tab-notation.txt` (it is in `.git/info/exclude`).
