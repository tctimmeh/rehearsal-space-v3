import { describe, expect, it } from 'vitest'

import { allReleases, executableName, releasesFor } from './releases'

const linux = { platform: 'linux', arch: 'x64' }

describe('where copies come from', () => {
  it('gets ffmpeg and ffprobe from the one tarball they are published in', () => {
    const releases = releasesFor(['ffmpeg', 'ffprobe'], linux)

    expect(releases.filter((release) => release.tools.includes('ffmpeg'))).toHaveLength(1)
    expect(releases[0]?.tools).toEqual(['ffmpeg', 'ffprobe'])
  })

  /* ffprobe is not published on its own; the tarball is where it lives. */
  it('fetches that tarball for ffprobe alone', () => {
    expect(releasesFor(['ffprobe'], linux)[0]?.tools).toContain('ffmpeg')
  })

  it('leaves out what was not asked for', () => {
    expect(releasesFor(['yt-dlp'], linux).flatMap((release) => release.tools)).toEqual(['yt-dlp'])
  })

  it('takes yt-dlp as it is published, rather than out of an archive', () => {
    expect(releasesFor(['yt-dlp'], linux)[0]?.from[0]?.packing).toBe('plain')
  })

  /* One host being down is not a reason for the app to be without ffmpeg. */
  it('has somewhere else to try for ffmpeg', () => {
    const from = releasesFor(['ffmpeg'], linux)[0]?.from ?? []

    expect(from.length).toBeGreaterThan(1)
    expect(new Set(from.map((one) => new URL(one.url).host)).size).toBe(from.length)
  })

  it('asks each host for the build the machine can run', () => {
    const urls = allReleases({ platform: 'linux', arch: 'arm64' })
      .flatMap((release) => release.from)
      .map((one) => one.url)

    expect(urls.some((url) => url.includes('amd64') || url.includes('linux64'))).toBe(false)
    expect(urls.every((url) => /arm64|aarch64/.test(url))).toBe(true)
  })

  it('has nowhere to get them for a machine nobody publishes for', () => {
    expect(allReleases({ platform: 'linux', arch: 'mips' })).toEqual([])
    expect(allReleases({ platform: 'freebsd', arch: 'x64' })).toEqual([])
    expect(allReleases({ platform: 'darwin', arch: 'ppc' })).toEqual([])
  })

  it('offers only addresses it can be held to', () => {
    for (const download of allReleases(linux).flatMap((release) => release.from)) {
      expect(download.url.startsWith('https://')).toBe(true)
    }
  })
})

/*
 * The app is built for Linux, but nothing here should be what stops it
 * running elsewhere: unpacking an archive is the only part that needs a
 * program of its own, and only Linux publishes these as tarballs.
 */
describe('the other platforms', () => {
  const every = (machine: { platform: string; arch: string }) =>
    allReleases(machine).flatMap((release) => release.from)

  it('has all three for macOS, on either chip', () => {
    for (const arch of ['x64', 'arm64']) {
      const tools = allReleases({ platform: 'darwin', arch }).flatMap((release) => release.tools)
      expect(tools.sort()).toEqual(['ffmpeg', 'ffprobe', 'yt-dlp'])
    }
  })

  it('has all three for Windows, on either chip', () => {
    for (const arch of ['x64', 'arm64']) {
      const tools = allReleases({ platform: 'win32', arch }).flatMap((release) => release.tools)
      expect(tools.sort()).toEqual(['ffmpeg', 'ffprobe', 'yt-dlp'])
    }
  })

  /* A tarball is the one thing that cannot be unpacked without help. */
  it('asks for nothing but zips and plain programs away from Linux', () => {
    for (const machine of [
      { platform: 'darwin', arch: 'x64' },
      { platform: 'darwin', arch: 'arm64' },
      { platform: 'win32', arch: 'x64' },
      { platform: 'win32', arch: 'arm64' }
    ]) {
      expect(every(machine).map((one) => one.packing)).not.toContain('tar.xz')
    }
  })

  it('takes the Windows programs by the names Windows gives them', () => {
    expect(executableName('ffmpeg', 'win32')).toBe('ffmpeg.exe')
    expect(executableName('ffmpeg', 'darwin')).toBe('ffmpeg')
    expect(executableName('ffmpeg', 'linux')).toBe('ffmpeg')
  })

  it('asks each host for the build the chip can run', () => {
    expect(every({ platform: 'win32', arch: 'arm64' }).every((one) => !one.url.includes('win64'))).toBe(true)
    expect(every({ platform: 'darwin', arch: 'arm64' }).some((one) => one.url.includes('arm'))).toBe(true)
  })
})
