/** The programs the app runs but does not ship, and shows in its tools panel. */
export const EXTERNAL_TOOLS = ['ffmpeg', 'ffprobe', 'yt-dlp', 'demucs'] as const
export type ExternalTool = (typeof EXTERNAL_TOOLS)[number]

/**
 * Everything the app can put on disk for itself, `uv` included — which is not
 * a tool the app runs on anybody's music, but the one it builds demucs with.
 */
export const PROVIDED_TOOLS = ['ffmpeg', 'ffprobe', 'yt-dlp', 'demucs', 'uv'] as const
export type ProvidedTool = (typeof PROVIDED_TOOLS)[number]

/**
 * The ones that are a single program to download.
 *
 * demucs is the odd one out: a Python program with an environment behind it,
 * which is built rather than downloaded — see `main/tools/demucs.ts`.
 */
export const DOWNLOADED_TOOLS = ['ffmpeg', 'ffprobe', 'yt-dlp', 'uv'] as const
export type DownloadedTool = (typeof DOWNLOADED_TOOLS)[number]

/**
 * The ones fetched as the app starts, without being asked.
 *
 * These three are small and the app is half-useless without them. demucs is
 * hundreds of megabytes and only wanted by somebody separating a track, so it
 * is never fetched unasked; `uv` is only fetched when demucs is.
 */
export const FETCHED_AT_START = ['ffmpeg', 'ffprobe', 'yt-dlp'] as const

const listed = (list: readonly string[], value: string): boolean => list.includes(value)

export const isProvidedTool = (value: string): value is ProvidedTool =>
  listed(PROVIDED_TOOLS, value)

export const isDownloadedTool = (value: string): value is DownloadedTool =>
  listed(DOWNLOADED_TOOLS, value)

/**
 * Whether a copy can be taken away again.
 *
 * What the app fetches unasked it would only fetch again on the next start, so
 * there would be nothing to gain. What it asked about is another matter: it is
 * large, it was a decision, and it can be unmade.
 */
export const isRemovableTool = (tool: ExternalTool): boolean =>
  isProvidedTool(tool) && !listed(FETCHED_AT_START, tool)

/** Which of the places a tool is looked for the one in use was found in. */
export type ToolSource = 'chosen' | 'private' | 'bundled' | 'system'

export const TOOL_SOURCE_NAME: Record<ToolSource, string> = {
  chosen: 'Set by you',
  private: 'Own copy',
  bundled: 'Shipped with the app',
  system: 'From the system'
}

/** A copy being put in place, while it is happening and if it could not be. */
export interface ToolInstall {
  tool: ProvidedTool
  state: 'fetching' | 'failed'
  /** How far through the download, or null while there is no telling. */
  progress: number | null
  error: string | null
}

export interface ToolStatus {
  name: ExternalTool
  /** Absolute path, or null when the tool could not be found. */
  path: string | null
  /** First line of its version output, when it reports one. */
  version: string | null
  /** Where that path was found, or null when there is nothing to say. */
  source: ToolSource | null
  /** What the tool is needed for, so an absence explains itself. */
  purpose: string
}

export const TOOL_PURPOSE: Record<ExternalTool, string> = {
  ffmpeg: 'Converting imported and recorded audio',
  ffprobe: 'Reading the length of an audio file',
  'yt-dlp': 'Downloading audio from a URL',
  demucs: 'Separating a track into stems'
}

/**
 * What installing demucs costs, for the asking of it.
 *
 * uv, a private Python, PyTorch's processor-only build, demucs itself and the
 * weights of both models it separates with. Measured from an install rather
 * than guessed at, and rounded down to nothing finer than somebody deciding
 * would care about.
 */
export const DEMUCS_DOWNLOAD = 'about 450 MB to fetch, and 1.3 GB once it is in place'

export const isExternalTool = (value: unknown): value is ExternalTool =>
  typeof value === 'string' && listed(EXTERNAL_TOOLS, value)
