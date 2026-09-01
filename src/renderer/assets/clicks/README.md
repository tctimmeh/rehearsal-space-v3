# Metronome clicks

Nine voices, each a pair: one recording for an ordinary beat and a different
one for an accented beat. Nothing is pitch-shifted to make an accent — beat one
is a different hit, the way a drummer plays it.

| Voice | Beat | Accent |
| --- | --- | --- |
| Beep | 1100 Hz tone | a fifth up |
| Block | 502 Hz tone | an octave up |
| Woodblock | large block | a smaller block, an octave up |
| Hi-hat | closed hat | closed hat, struck harder |
| Hi-hat Open | closed hat | open hat |
| Kick | kick | kick, struck harder |
| Snare | snare | snare, struck harder |
| Kick-Snare | snare | kick |
| Sticks | sticks | sticks, struck harder |

Two voices share a beat recording rather than duplicating it: Hi-hat Open uses
the closed Hi-hat beat, and Kick-Snare uses the Snare beat.

## Levels

Every beat sits at the same perceived loudness, so changing voice does not
change how loud the metronome is, and every accent sits exactly 4 dB above its
own beat. Peaks therefore differ widely between files, from -23 to -3 dBFS —
that is the point, not a mistake. Nothing is normalised to a peak.

Loudness is measured as Zwicker specific loudness over the K-weighting of
ITU-R BS.1770, with Schroeder masking spread between the critical bands, taken
over the loudest 40 ms. Three simpler measures were tried and each failed
audibly:

- **Total A-weighted energy** rewards a long sustain, so matching the open
  hi-hat turned its attack down until it sat quieter than its own accent.
- **Plain energy of any weighting**, including BS.1770 at any window length,
  has no notion of bandwidth, and put the tone-based clicks about 8 dB under
  the kit — a tone in one critical band really is quieter than a snare
  spreading the same energy across a dozen.
- **Band summation without masking spread** overcorrects the other way,
  crediting a broadband hit some 30 dB over a tone of equal energy. The spread
  brings that to about 14 dB.

Three voices then carry a trim by ear on top of the model, because no
reweighting got them right: Block and Snare (and Kick-Snare, which shares the
snare) up 4 dB, Woodblock up 3, Beep down 3.

## Sources

Beep and Block are synthesised here from scratch, matched to the measured
pitch, harmonic balance and decay curve of the Ableton and Cubase metronome
clicks. No sample data from either is used.

Woodblock is from the [Versilian Community Sample
Library](https://github.com/sgossner/VCSL), which is CC0. The kit voices are
the project's own recordings.

## Repairs

The open hi-hat was cut off at 375 ms while still ringing at -13 dB, which left
a hole before the next beat. Its tail is carried out to 700 ms — far enough to
reach the next beat at any tempo down to 85 — by synthesising from the spectrum
of its own closing stretch and laying it under the decay its envelope was
already following. Looping the tail instead left the loop period audible as
pumping.

Onsets needed nothing: every source hit already started within half a
millisecond of its file.
