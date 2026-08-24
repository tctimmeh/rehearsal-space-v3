export const DEMUCS_MODELS = [
  { id: 'htdemucs', label: 'Four stems', stems: ['vocals', 'drums', 'bass', 'other'] },
  {
    id: 'htdemucs_6s',
    label: 'Six stems',
    stems: ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other']
  }
] as const

export type DemucsModel = (typeof DEMUCS_MODELS)[number]['id']
export type StemName = (typeof DEMUCS_MODELS)[number]['stems'][number]

export interface SeparateRequest {
  channelId: string
  model: DemucsModel
  /** Which of the model's stems to bring back in as channels. */
  stems: string[]
  /** The original is usually not wanted alongside its own parts. */
  muteSource: boolean
}

export const stemsOf = (model: DemucsModel): readonly string[] =>
  DEMUCS_MODELS.find((entry) => entry.id === model)?.stems ?? []
