/**
 * What the tablature editor answers to, written down.
 *
 * The editor takes every key while it has the cursor, which makes it the one
 * place in the app where nothing on screen says what is possible — there is no
 * button for typing a fret. So the keys are listed here, and the editor shows
 * the list.
 *
 * These are not the app's own hotkeys and are not in that table: they only
 * mean anything inside the editor, and `data-typing` is what keeps the app's
 * keys out while they do.
 */

export const TAB_KEY_GROUPS = [
  'Moving about',
  'Writing notes',
  'Rhythm',
  'Beats and bars',
  'Sections'
] as const

export type TabKeyGroup = (typeof TAB_KEY_GROUPS)[number]

interface TabKey {
  keys: string
  does: string
  group: TabKeyGroup
}

const KEYS: TabKey[] = [
  { keys: '← → ↑ ↓', does: 'Move the cursor, as the tablature is drawn', group: 'Moving about' },
  { keys: 'Click', does: 'Put the cursor where you point', group: 'Moving about' },
  {
    keys: 'Esc',
    does: 'Step out of the tablature, and back in when there is nothing else to leave',
    group: 'Moving about'
  },

  {
    keys: '0 – 24',
    does: 'Fret the string under the cursor. Two digits in quick succession make one number',
    group: 'Writing notes'
  },
  { keys: 'X', does: 'A muted string', group: 'Writing notes' },
  { keys: 'Del', does: 'Take the note away', group: 'Writing notes' },
  { keys: '/', does: 'Slide up into the note', group: 'Writing notes' },
  { keys: '\\', does: 'Slide down into it', group: 'Writing notes' },
  { keys: '^', does: 'Hammer on or pull off', group: 'Writing notes' },
  { keys: 'P', does: 'Damp it with the heel of the hand, or let it ring', group: 'Writing notes' },
  { keys: 'V', does: 'Half a beat more vibrato', group: 'Writing notes' },
  { keys: 'Shift + V', does: 'Half a beat less', group: 'Writing notes' },
  { keys: 'B', does: 'Bend the note up', group: 'Writing notes' },
  { keys: 'R', does: 'Release a bend back down', group: 'Writing notes' },
  { keys: '.', does: 'Staccato: cut the note short', group: 'Writing notes' },
  { keys: 'Ctrl + Z', does: 'Undo', group: 'Writing notes' },
  { keys: 'Ctrl + Y', does: 'Redo', group: 'Writing notes' },

  { keys: 'Shift + →', does: 'Divide the beat, making room for a sixteenth', group: 'Rhythm' },
  {
    keys: 'Shift + ←',
    does: 'Close the sixteenth up again, once nothing is written in it',
    group: 'Rhythm'
  },
  { keys: 'Ctrl + →', does: 'One more beat in the bar', group: 'Rhythm' },
  { keys: 'Ctrl + ←', does: 'One fewer', group: 'Rhythm' },

  { keys: 'S', does: 'Start picking out beats, and stop', group: 'Beats and bars' },
  { keys: '← →', does: 'Reach further while picking them out', group: 'Beats and bars' },
  { keys: 'Ctrl + C', does: 'Copy the beats picked out', group: 'Beats and bars' },
  { keys: 'Ctrl + X', does: 'Cut them', group: 'Beats and bars' },
  { keys: 'Del', does: 'Empty them, leaving the bars', group: 'Beats and bars' },
  { keys: 'Ctrl + V', does: 'Paste at the cursor', group: 'Beats and bars' },
  { keys: 'Ctrl + ↑', does: 'Name the chord over this beat', group: 'Beats and bars' },

  {
    keys: 'Ctrl + R',
    does: 'Begin a repeat here, or end one — whichever half of the bar you are in',
    group: 'Beats and bars'
  },
  { keys: '0', does: 'Typed as the times round, takes the repeat off', group: 'Beats and bars' },

  {
    keys: 'Ctrl + T',
    does: 'Begin a section here, with room above it to say what it is',
    group: 'Sections'
  },
  { keys: '↑', does: 'From the top string, up into the words', group: 'Sections' },
  { keys: '↑ ↓', does: 'Out of the words, into the music either side', group: 'Sections' },
  {
    keys: 'Del',
    does: 'Emptied of its words, a section closes and the music re-joins',
    group: 'Sections'
  }
]

/** So the list can be held to accounting for every one of them. */
export const TAB_KEY_COUNT = KEYS.length

export const tabKeysInGroup = (group: TabKeyGroup): { keys: string; does: string }[] =>
  KEYS.filter((key) => key.group === group).map(({ keys, does }) => ({ keys, does }))
