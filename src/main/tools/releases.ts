import { FETCHED_TOOLS, type FetchedTool } from '../../shared/tools'

/**
 * Where the app gets its own copies from.
 *
 * Only from where each project publishes its own releases: the static builds
 * ffmpeg.org points at for each platform, and yt-dlp's own executables. Where
 * two hosts are listed there, both are kept — one being down is not the app
 * being without ffmpeg.
 */
export type Packing = 'plain' | 'zip' | 'tar.xz'

export interface Download {
  url: string
  /** Whether what arrives is the program itself or an archive holding it. */
  packing: Packing
}

/** One download and the tools it provides: a Linux ffmpeg tarball holds both. */
export interface Release {
  tools: FetchedTool[]
  /** Where to get it, best first. */
  from: Download[]
}

export interface Machine {
  platform: string
  arch: string
}

/** What the program is called on this platform, which Windows spells with a suffix. */
export const executableName = (tool: FetchedTool, platform: string): string =>
  platform === 'win32' ? `${tool}.exe` : tool

const YT_DLP = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'
const BTBN = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest'

const ytDlp = (file: string): Release => ({
  tools: ['yt-dlp'],
  from: [{ url: `${YT_DLP}/${file}`, packing: 'plain' }]
})

const btbn = (build: string): Download => ({
  url: `${BTBN}/ffmpeg-master-latest-${build}-gpl.${build.startsWith('win') ? 'zip' : 'tar.xz'}`,
  packing: build.startsWith('win') ? 'zip' : 'tar.xz'
})

const linux = (arch: string): Release[] | null => {
  const builds: Record<string, { vanSickle: string; btbn: string; ytDlp: string }> = {
    x64: { vanSickle: 'amd64', btbn: 'linux64', ytDlp: 'yt-dlp_linux' },
    arm64: { vanSickle: 'arm64', btbn: 'linuxarm64', ytDlp: 'yt-dlp_linux_aarch64' }
  }
  const build = builds[arch]
  if (build === undefined) return null
  return [
    {
      tools: ['ffmpeg', 'ffprobe'],
      from: [
        {
          url: `https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${build.vanSickle}-static.tar.xz`,
          packing: 'tar.xz'
        },
        btbn(build.btbn)
      ]
    },
    ytDlp(build.ytDlp)
  ]
}

/**
 * macOS publishes each program on its own, and by a different hand for each
 * chip: evermeet.cx builds for Intel, OSX Experts for Apple silicon. The
 * Apple silicon addresses carry the ffmpeg series in the name, so they need
 * revisiting when ffmpeg 8 lands — until then a failed fetch says so plainly
 * and whatever is on PATH is used instead.
 */
const macOs = (arch: string): Release[] | null => {
  const each = (tool: 'ffmpeg' | 'ffprobe'): Release | null => {
    if (arch === 'x64') {
      return {
        tools: [tool],
        from: [{ url: `https://evermeet.cx/ffmpeg/getrelease/${tool}/zip`, packing: 'zip' }]
      }
    }
    if (arch === 'arm64') {
      return {
        tools: [tool],
        from: [{ url: `https://www.osxexperts.net/${tool}71arm.zip`, packing: 'zip' }]
      }
    }
    return null
  }

  const ffmpeg = each('ffmpeg')
  const ffprobe = each('ffprobe')
  if (ffmpeg === null || ffprobe === null) return null
  /* One binary for both chips, so there is nothing to choose between. */
  return [ffmpeg, ffprobe, ytDlp('yt-dlp_macos')]
}

const windows = (arch: string): Release[] | null => {
  const builds: Record<string, { btbn: string; ytDlp: string }> = {
    x64: { btbn: 'win64', ytDlp: 'yt-dlp.exe' },
    arm64: { btbn: 'winarm64', ytDlp: 'yt-dlp_arm64.exe' }
  }
  const build = builds[arch]
  if (build === undefined) return null
  return [
    {
      tools: ['ffmpeg', 'ffprobe'],
      from: [
        btbn(build.btbn),
        /* gyan.dev builds Intel only, and is the second place to try. */
        ...(arch === 'x64'
          ? [
              {
                url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
                packing: 'zip' as const
              }
            ]
          : [])
      ]
    },
    ytDlp(build.ytDlp)
  ]
}

const forMachine = ({ platform, arch }: Machine): Release[] => {
  const releases =
    platform === 'linux'
      ? linux(arch)
      : platform === 'darwin'
        ? macOs(arch)
        : platform === 'win32'
          ? windows(arch)
          : null
  return releases ?? []
}

/**
 * The downloads that between them provide the tools asked for, and nothing
 * else — asking for ffprobe alone still fetches the tarball ffmpeg comes in
 * on Linux, because that is the only place it is published there.
 *
 * An empty answer means there is nowhere official to get these from for this
 * machine, and the tools have to come from the system as they used to.
 */
export function releasesFor(wanted: readonly FetchedTool[], machine: Machine): Release[] {
  const asked = new Set(wanted)
  return forMachine(machine).filter((release) => release.tools.some((tool) => asked.has(tool)))
}

/** Every download for this machine, for fetching a fresh set of copies. */
export const allReleases = (machine: Machine): Release[] => releasesFor(FETCHED_TOOLS, machine)
