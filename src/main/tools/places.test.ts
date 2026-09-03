import { describe, expect, it } from 'vitest'

import { whereToolsLive } from './places'

describe('where to start looking for a tool', () => {
  it('starts where the package manager would have put it', () => {
    expect(whereToolsLive({ platform: 'linux', arch: 'x64' })).toBe('/usr/bin')
  })

  /* Homebrew moved when the Macs did. */
  it('knows Homebrew is somewhere else on Apple silicon', () => {
    expect(whereToolsLive({ platform: 'darwin', arch: 'arm64' })).toBe('/opt/homebrew/bin')
    expect(whereToolsLive({ platform: 'darwin', arch: 'x64' })).toBe('/usr/local/bin')
  })

  /* A path that does not exist is worse than none: the dialog opens on
     nothing at all rather than wherever it was last useful. */
  it('has nowhere in particular to suggest on Windows', () => {
    expect(whereToolsLive({ platform: 'win32', arch: 'x64' })).toBeUndefined()
  })
})
