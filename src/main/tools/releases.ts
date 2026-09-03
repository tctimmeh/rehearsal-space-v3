import { FETCHED_TOOLS, type FetchedTool } from '../../shared/tools'

/**
 * Where the app gets its own copies from.
 *
 * Only from where each project publishes its own releases: ffmpeg.org points
 * at John Van Sickle's static Linux builds, with BtbN's — also listed there —
 * as the way through when that host is down, and yt-dlp publishes a single
 * Linux executable with every release of its own.
 */
export interface Download {
  url: string
  /** Whether what arrives is the program itself or a tarball holding it. */
  packing: 'plain' | 'tar.xz'
}

/** One download and the tools it provides: one ffmpeg tarball holds both. */
export interface Release {
  tools: FetchedTool[]
  /** Where to get it, best first. */
  from: Download[]
}

interface Machine {
  platform: string
  arch: string
}

const FFMPEG_BUILDS: Record<string, { vanSickle: string; btbn: string }> = {
  x64: { vanSickle: 'amd64', btbn: 'linux64' },
  arm64: { vanSickle: 'arm64', btbn: 'linuxarm64' }
}

const YT_DLP_BUILDS: Record<string, string> = {
  x64: 'yt-dlp_linux',
  arm64: 'yt-dlp_linux_aarch64'
}

const ffmpegRelease = (arch: string): Release | null => {
  const build = FFMPEG_BUILDS[arch]
  if (build === undefined) return null
  return {
    tools: ['ffmpeg', 'ffprobe'],
    from: [
      {
        url: `https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${build.vanSickle}-static.tar.xz`,
        packing: 'tar.xz'
      },
      {
        url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-${build.btbn}-gpl.tar.xz`,
        packing: 'tar.xz'
      }
    ]
  }
}

const ytDlpRelease = (arch: string): Release | null => {
  const file = YT_DLP_BUILDS[arch]
  if (file === undefined) return null
  return {
    tools: ['yt-dlp'],
    from: [
      {
        url: `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${file}`,
        packing: 'plain'
      }
    ]
  }
}

/**
 * The downloads that between them provide the tools asked for, and nothing
 * else — asking for ffprobe alone still fetches the tarball ffmpeg comes in,
 * because that is the only place it is published.
 *
 * An empty answer means there is nowhere official to get these from for this
 * machine, which is every platform but Linux: the app is not built for them.
 */
export function releasesFor(wanted: readonly FetchedTool[], machine: Machine): Release[] {
  if (machine.platform !== 'linux') return []
  const asked = new Set(wanted)
  const releases = [ffmpegRelease(machine.arch), ytDlpRelease(machine.arch)]
  return releases.filter(
    (release): release is Release =>
      release !== null && release.tools.some((tool) => asked.has(tool))
  )
}

/** Every download for this machine, for fetching a fresh set of copies. */
export const allReleases = (machine: Machine): Release[] => releasesFor(FETCHED_TOOLS, machine)
