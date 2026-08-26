#!/usr/bin/env python3
"""
Works out what each recording is really doing, so the replay check has
something trustworthy to compare the tuner against.

The tuner has 50ms and a few thousand samples to make its mind up. This has
the whole file, windows four times longer, and no deadline, which is what
makes it a reference rather than a second opinion. Run it after adding or
replacing a recording:

    python3 fixtures/tuner/tools/build-reference.py
"""
import json, math, pathlib, subprocess, sys
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from reference import yin

HERE = pathlib.Path(__file__).resolve().parents[1]
STRINGS = [('high-e', 329.628), ('-d-', 146.832), ('-e', 82.407), ('-a', 110.0), ('-b', 246.942)]

def string_of(name):
    for tag, hz in STRINGS:
        if tag in name or name.endswith(tag.strip('-')):
            return hz
    raise SystemExit(f'no string in the name {name!r}')

def samples(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 's16le', '-ac', '1',
                          '-ar', '44100', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768.0, 44100

def notes(x, sr):
    """Each pluck, and the pitch it settles on once the attack has gone.

    A note is only used if it can be pinned down confidently. A softly plucked
    string is into the noise floor within a couple of seconds, and the tail of
    it will happily read an octave low or not a pitch at all — believing that
    would put nonsense in the reference and blame the tuner for disagreeing.
    """
    hop = int(sr * 0.025); win = int(sr * 0.2)
    read = [(i / sr, *yin(x[i:i + win], sr), float(np.sqrt((x[i:i + win] ** 2).mean())))
            for i in range(0, len(x) - win, hop)]
    loud = sorted(r[3] for r in read)[int(len(read) * 0.95)]
    gate = max(0.002, loud * 0.2)
    struck = [b[0] for a, b in zip(read, read[1:])
              if b[3] > gate and b[3] > a[3] * 1.7]
    struck = [t for i, t in enumerate(struck) if i == 0 or t - struck[i - 1] > 1.0]

    out = []
    for i, on in enumerate(struck):
        end = struck[i + 1] if i + 1 < len(struck) else read[-1][0]
        sure = [(t, f) for t, f, clarity, level in read
                if f is not None and on <= t < end and clarity > 0.9 and level > gate * 0.5]
        if end - on < 1.2 or len(sure) < 12:
            continue
        settled = float(np.median([f for _, f in sure[len(sure) // 2:]]))
        # One more pass, without whatever disagreed by more than a semitone.
        agreeing = [f for _, f in sure[len(sure) // 2:]
                    if abs(1200 * math.log2(f / settled)) < 100]
        if len(agreeing) < 6:
            continue
        out.append([round(on, 3), round(end, 3), round(float(np.median(agreeing)), 3)])
    return out

def main():
    built = {}
    for path in sorted((HERE / 'recordings').glob('*.flac')):
        x, sr = samples(path)
        name = path.stem
        built[name] = {'string': string_of(name), 'notes': notes(x, sr)}
        print(f'{name:44} {len(built[name]["notes"]):3} notes')
    (HERE / 'reference.json').write_text(json.dumps(built, indent=1, sort_keys=True) + '\n')

if __name__ == '__main__':
    main()
