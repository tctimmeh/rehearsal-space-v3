/**
 * What a keystroke means, decided away from the DOM so it can be argued with
 * in a test rather than by pressing keys.
 *
 * Nothing here does anything: it turns a keystroke into a name, and the
 * renderer decides what that name is worth.
 */
export type HotkeyAction =
  | 'playPause'
  | 'nudgeBack'
  | 'nudgeForward'
  | 'recordAndPlay'
  | 'discardTake'
  | 'armRecording'
  | 'toStart'
  | 'loop'
  | 'tempoDown'
  | 'tempoUp'
  | 'metronomeRunning'
  | 'metronomeTool'
  | 'tunerTool'
  | 'settings'

/**
 * How far an arrow key moves the playhead, in seconds.
 *
 * Four sizes on the same pair of keys: a nudge for finding the phrase again,
 * and progressively longer strides for crossing a song. Settable, because how
 * far "a bit" is depends on what is being practised.
 */
export interface NudgeSeconds {
  plain: number
  ctrl: number
  shift: number
  both: number
}

export const DEFAULT_NUDGE: NudgeSeconds = { plain: 3, ctrl: 6, shift: 10, both: 15 }

/** Which of the four a keystroke is asking for. */
export const nudgeFor = (stroke: Keystroke, nudge: NudgeSeconds): number => {
  if (stroke.ctrlKey && stroke.shiftKey) return nudge.both
  if (stroke.shiftKey) return nudge.shift
  if (stroke.ctrlKey) return nudge.ctrl
  return nudge.plain
}

export interface Keystroke {
  key: string
  code: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}

/** What the list of them is divided into, in the order it is shown. */
export const HOTKEY_GROUPS = ['Playing', 'Recording', 'Tools'] as const
export type HotkeyGroup = (typeof HOTKEY_GROUPS)[number]

interface Binding {
  action: HotkeyAction
  matches: (stroke: Keystroke) => boolean
  /** How the key is written down, and what it does, for the list of them. */
  keys: string
  /** A function where what the key does depends on what it is set to. */
  does: string | ((nudge: NudgeSeconds) => string)
  group: HotkeyGroup
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

/* Ctrl and Shift choose how far, so both are welcome and neither is required.
   Alt and the meta key belong to the window manager. */
const anyStride = (stroke: Keystroke): boolean => !stroke.metaKey && !stroke.altKey

const strides = (nudge: NudgeSeconds, way: string): string =>
  `Move ${way} ${nudge.plain}s — Ctrl ${nudge.ctrl}s, Shift ${nudge.shift}s, ` +
  `both ${nudge.both}s. Hold to keep moving`

/* Order matters: the modified space bars have to be looked at before the
   plain one, which would otherwise answer for all three. */
const BINDINGS: Binding[] = [
  {
    action: 'recordAndPlay',
    matches: (s) => s.code === 'Space' && onlyShift(s),
    keys: 'Shift + Space',
    does: 'Arm recording and play',
    group: 'Recording'
  },
  {
    action: 'discardTake',
    matches: (s) => s.code === 'Space' && onlyCtrl(s),
    keys: 'Ctrl + Space',
    does: 'Stop, and throw away the take in progress',
    group: 'Recording'
  },
  {
    action: 'playPause',
    matches: (s) => s.code === 'Space' && bare(s),
    keys: 'Space',
    does: 'Play or pause',
    group: 'Playing'
  },
  {
    action: 'nudgeBack',
    matches: (s) => s.key === 'ArrowLeft' && anyStride(s),
    keys: '←',
    does: (nudge) => strides(nudge, 'back'),
    group: 'Playing'
  },
  {
    action: 'nudgeForward',
    matches: (s) => s.key === 'ArrowRight' && anyStride(s),
    keys: '→',
    does: (nudge) => strides(nudge, 'forward'),
    group: 'Playing'
  },
  {
    action: 'armRecording',
    matches: (s) => letter(s, 'r') && onlyShift(s),
    keys: 'Shift + R',
    does: 'Arm or disarm recording',
    group: 'Recording'
  },
  {
    action: 'toStart',
    matches: (s) => s.key === 'Home' && bare(s),
    keys: 'Home',
    does: 'Go to the start, without stopping',
    group: 'Playing'
  },
  {
    action: 'loop',
    matches: (s) => letter(s, 'l') && bare(s),
    keys: 'L',
    does: 'Go round the loop region, or stop going round',
    group: 'Playing'
  },
  {
    action: 'tempoDown',
    /* Shift is ignored: the same key writes `_`, and reaching for it to get a
       bigger step is a reasonable thing to try. */
    matches: (s) => (s.key === '-' || s.key === '_') && !s.ctrlKey && !s.metaKey && !s.altKey,
    keys: '-',
    does: 'Slow the metronome down, while it is out',
    group: 'Tools'
  },
  {
    action: 'tempoUp',
    matches: (s) => (s.key === '=' || s.key === '+') && !s.ctrlKey && !s.metaKey && !s.altKey,
    keys: '=',
    does: 'Speed the metronome up, while it is out',
    group: 'Tools'
  },
  {
    action: 'metronomeRunning',
    matches: (s) => (s.key === '`' || s.key === '~') && !s.ctrlKey && !s.metaKey && !s.altKey,
    keys: '`',
    does: 'Start or stop the metronome',
    group: 'Tools'
  },
  {
    action: 'metronomeTool',
    matches: (s) => s.key === 'F1' && bare(s),
    whileTyping: true,
    keys: 'F1',
    does: 'Show or hide the metronome',
    group: 'Tools'
  },
  {
    action: 'tunerTool',
    matches: (s) => s.key === 'F2' && bare(s),
    whileTyping: true,
    keys: 'F2',
    does: 'Show or hide the tuner',
    group: 'Tools'
  },
  {
    action: 'settings',
    matches: (s) => s.key === ',' && onlyCtrl(s),
    keys: 'Ctrl + ,',
    does: 'Settings',
    group: 'Tools'
  }
]

/**
 * The same table, written out for the list of them.
 *
 * Read from the bindings themselves so the list cannot come to disagree with
 * what the keys do — a help page that lies is worse than none.
 */
/** So the list can be held to accounting for every one of them. */
export const BINDING_COUNT = BINDINGS.length

export const hotkeysInGroup = (
  group: HotkeyGroup,
  nudge: NudgeSeconds = DEFAULT_NUDGE
): { keys: string; does: string }[] =>
  BINDINGS.filter((binding) => binding.group === group).map(({ keys, does }) => ({
    keys,
    does: typeof does === 'string' ? does : does(nudge)
  }))

export function actionFor(stroke: Keystroke, typing = false): HotkeyAction | null {
  const found = BINDINGS.find((binding) => binding.matches(stroke))
  if (found === undefined) return null
  if (typing && found.whileTyping !== true) return null
  return found.action
}
