export const EXTERNAL_TOOLS = ['ffmpeg', 'ffprobe', 'yt-dlp', 'demucs'] as const
export type ExternalTool = (typeof EXTERNAL_TOOLS)[number]

/**
 * The tools the app keeps its own copy of.
 *
 * These three are single self-contained programs published as downloads, so
 * the app can hold a copy of its own and stop depending on what the machine
 * happens to have. demucs is a Python program with an environment behind it
 * and is left to the system.
 */
export const FETCHED_TOOLS = ['ffmpeg', 'ffprobe', 'yt-dlp'] as const
export type FetchedTool = (typeof FETCHED_TOOLS)[number]

export const isFetchedTool = (tool: ExternalTool): tool is FetchedTool =>
  (FETCHED_TOOLS as readonly ExternalTool[]).includes(tool)

/** Which of the places a tool is looked for the one in use was found in. */
export type ToolSource = 'chosen' | 'private' | 'bundled' | 'system'

export const TOOL_SOURCE_NAME: Record<ToolSource, string> = {
  chosen: 'Set by you',
  private: 'Own copy',
  bundled: 'Shipped with the app',
  system: 'From the system'
}

/** A copy being fetched, while it is being fetched and if it could not be. */
export interface ToolInstall {
  tool: FetchedTool
  state: 'fetching' | 'failed'
  /** How far through the download, or null while unpacking or checking it. */
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

export const isExternalTool = (value: unknown): value is ExternalTool =>
  typeof value === 'string' && (EXTERNAL_TOOLS as readonly string[]).includes(value)
