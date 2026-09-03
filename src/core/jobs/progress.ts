/**
 * Each external tool reports progress in its own way, and none of them make it
 * easy. A reader is handed every output line and returns a fraction between 0
 * and 1 when that line said something, or null when it did not.
 */
export type ProgressReader = (line: string) => number | null

const clampFraction = (value: number): number => Math.min(1, Math.max(0, value))

/** `HH:MM:SS.mmm` as seconds. */
function parseTimecode(timecode: string): number | null {
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(timecode)
  if (match === null) return null
  const [, hours, minutes, seconds] = match
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
}

/**
 * ffmpeg with `-progress pipe:1` writes `key=value` lines. Position comes as
 * `out_time_us`, or as an `out_time` timecode on builds that omit it. Both are
 * useless without knowing how long the input is, which is what ffprobe is for.
 */
export function ffmpegProgress(totalSeconds: number): ProgressReader {
  return (line) => {
    if (totalSeconds <= 0) return null

    const microseconds = /^out_time_us=(\d+)$/.exec(line.trim())
    if (microseconds !== null) {
      return clampFraction(Number(microseconds[1]) / 1_000_000 / totalSeconds)
    }

    const timecode = /^out_time=(\d+:\d{2}:\d{2}(?:\.\d+)?)/.exec(line.trim())
    if (timecode !== null) {
      const seconds = parseTimecode(timecode[1] ?? '')
      return seconds === null ? null : clampFraction(seconds / totalSeconds)
    }

    /* ffmpeg says so itself when it is finished. */
    return line.trim() === 'progress=end' ? 1 : null
  }
}

/**
 * yt-dlp with `--newline` puts each progress update on its own line:
 * `[download]   4.2% of ~12.34MiB at 1.23MiB/s ETA 00:09`
 */
export function ytDlpProgress(): ProgressReader {
  return (line) => {
    const match = /^\[download\]\s+([\d.]+)%/.exec(line.trim())
    if (match === null) return null
    const percent = Number(match[1])
    return Number.isFinite(percent) ? clampFraction(percent / 100) : null
  }
}

/**
 * demucs reports through a tqdm bar on stderr, which arrives as
 * ` 45%|████▌     | 45/100 [00:10<00:12,  4.5it/s]`. A run separates the track
 * in several passes, each restarting the bar at zero, so the fraction can go
 * backwards — that is the tool's shape, not a bug in the reading of it.
 */
export function demucsProgress(): ProgressReader {
  return (line) => {
    const match = /(?:^|\s)(\d{1,3})%\|/.exec(line)
    if (match === null) return null
    const percent = Number(match[1])
    return Number.isFinite(percent) ? clampFraction(percent / 100) : null
  }
}

/** How much of the install is fetching and unpacking wheels: nearly all of it. */
const UV_WHEELS_SHARE = 0.8
const UV_RESOLVED = 0.1

const SIZES: Record<string, number> = { KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 }

/**
 * uv draws a bar when it has a terminal and prints plain lines when it does
 * not, which is what it has here:
 *
 *     Using CPython 3.12.11
 *     Resolved 41 packages in 812ms
 *     Downloading torch (176.1MiB)
 *      Downloaded torch
 *     Prepared 41 packages in 1m 02s
 *     Installed 41 packages in 3.21s
 *
 * None of those carries a percentage, so what is read is the stage it has
 * reached — and, across the long middle where nearly all of the time goes, the
 * sizes it announces for the packages it is fetching, which is as close to a
 * measure as it offers.
 *
 * The reading only ever climbs. uv's wording is not a promise, and a reader
 * that missed a line it expected should sit still rather than jump backwards.
 */
export function uvProgress(): ProgressReader {
  const announced = new Map<string, number>()
  let fetched = 0
  let far = 0

  const climbTo = (fraction: number): number | null => {
    if (fraction <= far) return null
    far = fraction
    return far
  }

  const throughWheels = (): number | null => {
    const total = [...announced.values()].reduce((sum, size) => sum + size, 0)
    if (total <= 0) return null
    return climbTo(UV_RESOLVED + UV_WHEELS_SHARE * clampFraction(fetched / total))
  }

  return (line) => {
    const said = line.trim()

    const downloading = /^Downloading (\S+) \(([\d.]+)(KiB|MiB|GiB)\)/.exec(said)
    if (downloading !== null) {
      const [, name, size, unit] = downloading
      announced.set(name ?? '', Number(size) * (SIZES[unit ?? ''] ?? 0))
      return throughWheels()
    }

    const downloaded = /^Downloaded (\S+)/.exec(said)
    if (downloaded !== null) {
      fetched += announced.get(downloaded[1] ?? '') ?? 0
      return throughWheels()
    }

    if (/^Using CPython /.test(said)) return climbTo(0.04)
    if (/^Creating virtual environment/.test(said)) return climbTo(0.06)
    if (/^Resolved \d+ packages? in /.test(said)) return climbTo(UV_RESOLVED)
    if (/^Prepared \d+ packages? in /.test(said)) return climbTo(0.9)
    if (/^Installed \d+ packages? in /.test(said)) return climbTo(1)
    return null
  }
}
