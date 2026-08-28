/**
 * What a keystroke means, decided away from the DOM so it can be argued with
 * in a test rather than by pressing keys.
 *
 * Nothing here does anything: it turns a keystroke into a name, and the
 * renderer decides what that name is worth.
 */
export type HotkeyAction =
  | 'playPause'
  | 'recordAndPlay'
  | 'discardTake'
  | 'armRecording'
  | 'toStart'
  | 'loop'
  | 'metronomeRunning'
  | 'metronomeTool'
  | 'tunerTool'

export interface Keystroke {
  key: string
  code: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}

interface Binding {
  action: HotkeyAction
  matches: (stroke: Keystroke) => boolean
  /**
   * Whether it still means this while a field has the cursor. Only the
   * function keys do: everything else is a character somebody might be typing,
   * or Home, which in a field belongs to the line rather than the song.
   */
  whileTyping?: boolean
}

const bare = (stroke: Keystroke): boolean =>
  !stroke.ctrlKey && !stroke.metaKey && !stroke.altKey && !stroke.shiftKey

const onlyShift = (stroke: Keystroke): boolean =>
  stroke.shiftKey && !stroke.ctrlKey && !stroke.metaKey && !stroke.altKey

const onlyCtrl = (stroke: Keystroke): boolean =>
  stroke.ctrlKey && !stroke.metaKey && !stroke.altKey && !stroke.shiftKey

const letter = (stroke: Keystroke, which: string): boolean =>
  stroke.key.toLowerCase() === which

/* Order matters: the modified space bars have to be looked at before the
   plain one, which would otherwise answer for all three. */
const BINDINGS: Binding[] = [
  { action: 'recordAndPlay', matches: (s) => s.code === 'Space' && onlyShift(s) },
  { action: 'discardTake', matches: (s) => s.code === 'Space' && onlyCtrl(s) },
  { action: 'playPause', matches: (s) => s.code === 'Space' && bare(s) },
  { action: 'armRecording', matches: (s) => letter(s, 'r') && onlyShift(s) },
  { action: 'toStart', matches: (s) => s.key === 'Home' && bare(s) },
  { action: 'loop', matches: (s) => letter(s, 'l') && bare(s) },
  {
    action: 'metronomeRunning',
    matches: (s) => (s.key === '`' || s.key === '~') && !s.ctrlKey && !s.metaKey && !s.altKey
  },
  { action: 'metronomeTool', matches: (s) => s.key === 'F1' && bare(s), whileTyping: true },
  { action: 'tunerTool', matches: (s) => s.key === 'F2' && bare(s), whileTyping: true }
]

export function actionFor(stroke: Keystroke, typing = false): HotkeyAction | null {
  const found = BINDINGS.find((binding) => binding.matches(stroke))
  if (found === undefined) return null
  if (typing && found.whileTyping !== true) return null
  return found.action
}
