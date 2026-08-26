# Guitar recordings, for checking the tuner

Thirty-four recordings of a real guitar, and what each one is really doing.
They exist because the tuner was twice tuned against a synthetic string that
turned out to be nothing like a real one — about forty times noisier — and
every mechanism built to survive that invention made the needle worse on an
actual instrument.

    npm run test:tuner

Kept out of the ordinary suite because it decodes fourteen megabytes of audio.

## What is here

`recordings/` — five strings (low E, A, D, B, high E), four gestures, both
straight down a cable and through a microphone in a room:

| | |
|---|---|
| `held-note` | struck and left to ring — what "steady" has to mean |
| `fine-tune` | the last few cents, by small nudges. The case that matters |
| `big-retune` | dropped a semitone or two and wound back |
| `soft-pluck` | played gently, which is quieter than the onset threshold |
| `tuning-d-after-strumming-g-major` | a chord ringing while a string is tuned |

Trimmed to where a string is actually sounding, and FLAC, which is lossless —
the audio is bit-for-bit what was recorded.

`reference.json` — where each pluck is and the pitch it settles on, worked out
offline by `tools/build-reference.py` with windows four times longer than the
tuner's and no deadline. That is what makes it a reference and not a second
opinion. Rebuild it after adding or replacing a recording:

    python3 fixtures/tuner/tools/build-reference.py

It needs `numpy` and `ffmpeg`. Read what it says about only trusting notes it
can pin down: an early version believed the tail of a softly plucked low E,
which by then was noise reading an octave low, and the check blamed the tuner
for disagreeing.

## Adding to these

Record straight to what the fake audio device accepts — 16-bit mono at 44.1k:

    arecord -D plughw:1,0 -f S16_LE -r 44100 -c 1 -d 30 new-recording.wav

Then trim it, convert it with `ffmpeg -i new.wav -c:a flac`, drop it in
`recordings/`, and rebuild the reference. The name says which string it is.
