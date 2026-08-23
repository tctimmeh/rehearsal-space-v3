export const EXTERNAL_TOOLS = ['ffmpeg', 'ffprobe', 'yt-dlp', 'demucs'] as const
export type ExternalTool = (typeof EXTERNAL_TOOLS)[number]

export interface ToolStatus {
  name: ExternalTool
  /** Absolute path, or null when the tool could not be found. */
  path: string | null
  /** First line of its version output, when it gave one. */
  version: string | null
  /** What the tool is needed for, so an absence explains itself. */
  purpose: string
}

export const TOOL_PURPOSE: Record<ExternalTool, string> = {
  ffmpeg: 'Converting imported and recorded audio',
  ffprobe: 'Reading the length of an audio file',
  'yt-dlp': 'Downloading audio from a URL',
  demucs: 'Separating a track into stems'
}
