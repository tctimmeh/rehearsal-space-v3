/**
 * Static stand-in content so the shell can be built and looked at before the
 * library (M1) and the audio engine (M4) exist. Deleted once those land.
 */
import type { ChannelSubject } from '@core/song/channelSubject'

export interface PlaceholderChannel {
  id: string
  name: string
  subject: ChannelSubject
  kind: 'audio' | 'metronome'
  gain: number
  muted: boolean
  soloed: boolean
  file: string
}

export const PLACEHOLDER_SONG = {
  title: 'Comeback Season',
  artist: 'The Lowlifes',
  start: -4,
  end: 240,
  position: 84
}

export const PLACEHOLDER_CHANNELS: PlaceholderChannel[] = [
  { id: '1', name: 'Vocals', subject: 'vocals', kind: 'audio', gain: 0.84, muted: false, soloed: false, file: 'vocals.ogg' },
  { id: '2', name: 'El. guitar', subject: 'electric', kind: 'audio', gain: 0.7, muted: false, soloed: false, file: 'gtr_l.ogg' },
  { id: '3', name: 'Bass', subject: 'bass', kind: 'audio', gain: 0.78, muted: false, soloed: false, file: 'bass.ogg' },
  { id: '4', name: 'Drums', subject: 'drums', kind: 'audio', gain: 0.88, muted: false, soloed: false, file: 'drums.ogg' },
  { id: '5', name: 'Count-in', subject: 'metronome', kind: 'metronome', gain: 0.56, muted: false, soloed: false, file: '' }
]

export const PLACEHOLDER_LIBRARY = [
  { id: 'a', title: 'Comeback Season', artist: 'The Lowlifes', channels: 5, lyrics: true },
  { id: 'b', title: 'Coast Road', artist: 'The Lowlifes', channels: 3, lyrics: true },
  { id: 'c', title: 'New Song', artist: '', channels: 0, lyrics: false }
]
