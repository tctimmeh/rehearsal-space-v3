/**
 * How to stop a job, which is not the same question on every platform.
 *
 * Every tool here starts other programs — yt-dlp runs ffmpeg, demucs runs
 * workers, uv runs a compiler now and then — and a survivor holds the output
 * pipes open, which delays `close` until it finishes anyway. So a cancel that
 * only stopped the process we spawned would appear to do nothing at all. The
 * whole tree has to go, and the two platforms spell that differently enough
 * that it is worth deciding here rather than in the middle of the manager.
 */

export type Stop =
  /** Signal a process group: the negative pid is what makes it the group. */
  | { kind: 'signal'; pid: number; signal: NodeJS.Signals }
  /** Run something that does the killing, for a platform with no groups. */
  | { kind: 'command'; command: string; args: string[] }

/**
 * Windows has no process groups and no signals worth the name. `taskkill /t`
 * walks the tree from a pid, and `/f` is the only kind of stop it offers —
 * so the polite first ask and the forceful second are the same thing there,
 * and the second finds nothing left to kill, which is no worse than tidy.
 */
export function stopWork(platform: string, pid: number, signal: NodeJS.Signals): Stop {
  if (platform === 'win32') {
    return { kind: 'command', command: 'taskkill', args: ['/pid', String(pid), '/t', '/f'] }
  }
  return { kind: 'signal', pid: -pid, signal }
}

/** Whether a child should be put in a group of its own when it is started. */
export const groupsChildren = (platform: string): boolean => platform !== 'win32'
