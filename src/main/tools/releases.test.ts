import { describe, expect, it } from 'vitest'

import { allReleases, releasesFor } from './releases'

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
    expect(allReleases({ platform: 'darwin', arch: 'arm64' })).toEqual([])
  })

  it('offers only addresses it can be held to', () => {
    for (const download of allReleases(linux).flatMap((release) => release.from)) {
      expect(download.url.startsWith('https://')).toBe(true)
    }
  })
})
