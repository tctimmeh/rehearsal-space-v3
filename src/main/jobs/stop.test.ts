import { describe, expect, it } from 'vitest'

import { groupsChildren, stopWork } from './stop'

describe('stopping a job', () => {
  /* The negative pid is the whole point: it signals the group, not the one
     process, so the ffmpeg yt-dlp started goes too. */
  it('signals the process group where there are groups', () => {
    for (const platform of ['linux', 'darwin']) {
      expect(stopWork(platform, 4321, 'SIGTERM')).toEqual({
        kind: 'signal',
        pid: -4321,
        signal: 'SIGTERM'
      })
    }
  })

  it('asks the group again, harder, when it is asked to', () => {
    expect(stopWork('linux', 4321, 'SIGKILL')).toEqual({
      kind: 'signal',
      pid: -4321,
      signal: 'SIGKILL'
    })
  })

  /*
   * Windows has no process groups: `process.kill(-pid)` there throws, and a
   * cancel that threw and was swallowed would look like a dead button while
   * demucs carried on for another four minutes.
   */
  it('walks the tree by pid on Windows, which has no groups', () => {
    expect(stopWork('win32', 4321, 'SIGTERM')).toEqual({
      kind: 'command',
      command: 'taskkill',
      args: ['/pid', '4321', '/t', '/f']
    })
  })

  /* taskkill offers one kind of stop, so both asks are the same command. */
  it('has only the one way to stop things on Windows', () => {
    expect(stopWork('win32', 7, 'SIGKILL')).toEqual(stopWork('win32', 7, 'SIGTERM'))
  })

  /* Starting a child in its own group is what makes the group signal work,
     and on Windows it buys nothing the tree walk does not already do. */
  it('puts children in a group of their own only where that means something', () => {
    expect(groupsChildren('linux')).toBe(true)
    expect(groupsChildren('darwin')).toBe(true)
    expect(groupsChildren('win32')).toBe(false)
  })
})
