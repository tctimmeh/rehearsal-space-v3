# Rehearsal Space

**Learn the song. Write your own.**

Import your favourite tracks, separate instruments, add a count-in, and change tempo or tuning on-the-fly. Got a great song idea? Add lyrics and tablature and record yourself so you don't lose that magic moment. Tuner, metronome, and quick references at your fingertips.

Easy to use, not heavy like a DAW. Just the things you reach for when you want to perfect that solo, capture that idea, or jam along with your favourite artists.

Everything local and simple. No cloud, no account, no data collection, no proprietary formats, no encryption. One tool, everything at hand for practice and writing.

![The player: a waveform with a loop region drawn over the chorus, and the mixer beneath it](docs/images/player.png)

---

## Take a song apart

Drop in an audio file or paste a link to fetch from the web. Split the song into individual instruments, each arriving as its own channel with its own fader, mute and solo.

Learning the bass line? Solo the bass. Singing it? Mute the vocal and keep the band. The separation runs on your own machine; nothing is uploaded anywhere.

<img src="docs/images/stems.png" alt="The stems dialog: choose which instruments to pull out, and whether to mute the original" width="700">

## Slow it down. Move it into your key. Loop till perfect.

Tempo and pitch are separate knobs and neither touches the other.

Take it to 80% to learn the fast part and it stays in tune. Drop it two semitones to sing it comfortably and it stays at speed. Both at once works exactly as you'd hope. Add an A-B loop region to focus on a tough section.

![Tempo at 80% and the song pitched down two semitones, with the pitch popover open](docs/images/pitch-and-tempo.png)

## Count yourself in

Add a click track and line it up against the music waveform anywhere you want, including as a count-in before the music starts.

Just estimate the tempo and set the start and end markers. Actual tempo is nudged so that your clicks land right at the start and the band comes in right at the end. Metronome sounds include standard beeps, hi-hat, kick, snare, cross-sticks, and woodblock.

![The click align tool: beat lines over the waveform, the end marker on the first transient](docs/images/click-align.png)

## Record yourself

![The transport: stopped, playing, and armed to record](docs/images/transport.png)

Arm the record button and capture your great idea or play along with existing music.

Everything stays in sync, on time, and in tune. Record those chords you've been working on then ride the tempo and pitch knobs to dial in the perfect groove.

## Write the tab

An easy tablature editor you can drive entirely from the keyboard.

Every bar has timing marks so you're not guessing about rhythm. Type frets, and it
lays out the bars, moves the beat markers and widens the columns as you go.
Slides, hammer-ons, bends, palm mutes, vibrato, triplets, repeats, sixteenths
and thirty-seconds. Saved as plain text so you can work with it anywhere.

![The tablature editor with a riff, showing a slide, a bend and a slide back down](docs/images/tablature.png)

## Write the words

Chords over the lines, sections in brackets, notes, comments, and temporary lyrics. Transpose the song and every chord moves with it. Plain text, like the tablature. Take it wherever you like.

![The lyrics editor with chords over the words and sections marked](docs/images/lyrics.png)

## And the small things

A metronome and a tuner listening to the same input you record from. Both a keypress away, both out of the way when you're done.  A rhyme finder and a chord chart for when your inpiration needs a little nudge.

![The metronome and tuner](docs/images/gadgets.png)

---

## Download

Grab the file for your machine from
[Releases](../../releases): an AppImage or `.deb` for Linux, a `.dmg` for
macOS, an installer or a zip for Windows.

### External Requirements

`ffmpeg`, `ffprobe` and `yt-dlp` are required. The app will fetch private copies of these on first run.

Stem separation uses local `demucs`, which is a large download. You will be asked the first time you separate stems.

### MacOS

The app is signed, but not notarised, so the system says it cannot check it
for malicious software.

- Open it once and let the warning appear, then dismiss it.
- Go to System Settings → Privacy & Security, scroll to the bottom, and press Open Anyway beside the app's name.
- Confirm once more when asked. It opens normally from then on.


## Building it

```sh
npm install
npm run dev
```

[DEV.md](DEV.md) has the rest: packaging, releases, the audio graph and how the
external tools are handled.
