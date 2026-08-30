/**
 * A piece of tablature, as a document rather than as the text it is drawn as.
 *
 * The text is a rendering. Editing it as text would mean rewriting columns on
 * every keystroke and inferring the rhythm back out of them afterwards, which
 * is the trap the sketch this was built from invites: it describes bars
 * "expanding" and markers "moving", but those are consequences of the layout,
 * not things anybody edits. What is edited is which fret is on which string at
 * which moment.
 */

/** A fret number, or 'x' for a muted string. Nothing else is written here. */
export type Fret = string

/**
 * What is drawn in the single column after a slot.
 *
 * A slide or a hammer-on is not a note; it is the join between two of them, so
 * it lives in the gap rather than in either. That also explains the one thing
 * in the sketch its own prose contradicts — a slide into a note with nothing
 * before it — which is simply this character on an empty slot.
 */
export type Technique = '-' | '/' | '\\' | '^'

export const TECHNIQUES: Technique[] = ['-', '/', '\\', '^']

/**
 * Where in a beat a slot falls: the beat itself, its `e`, its `&`, or its `a`.
 *
 * A beat always holds the beat and the `&` — that is what an eighth is — and
 * may hold either or both sixteenths between them. So a beat is two, three or
 * four slots, never a fixed division, which is what the sketch describes when
 * it says shift-right on the beat "creates the e subdivision": it inserts one
 * slot, not two.
 */
export type Sixteenth = 0 | 1 | 2 | 3
export const ON_BEAT: Sixteenth = 0
export const OFF_BEAT: Sixteenth = 2
export const SIXTEENTH_MARKS: Record<Sixteenth, string> = { 0: '', 1: 'e', 2: '&', 3: 'a' }

/**
 * One moment: what every string is doing, and how each joins to the next.
 *
 * A technique belongs to a string rather than to the moment, because a slide
 * on the third string says nothing about what the second is doing — and the
 * sketch agrees, putting the character after "the note under the cursor",
 * which is somewhere on one string.
 */
export interface Slot {
  at: Sixteenth
  /** One entry per string, top row first. Null is a string not played. */
  frets: (Fret | null)[]
  after: Technique[]
}

/**
 * One beat, and whatever it was divided into.
 *
 * Two slots is a beat and its eighth; four is sixteenths. The division is not
 * recorded anywhere — it is how many slots there are — so there is no way for
 * the two to disagree.
 */
export interface Beat {
  /** In order, always beginning on the beat and always holding its `&`. */
  slots: Slot[]
  /** Written above the beat, so it stays put when the bar changes width. */
  chord: string | null
}

export interface Bar {
  beats: Beat[]
}

export interface TabDoc {
  strings: number
  bars: Bar[]
}

/** Where the cursor is. Beats and slots are counted within their parent. */
export interface Cursor {
  bar: number
  beat: number
  slot: number
  string: number
}

export const HIGHEST_FRET = 24
export const BEATS_MIN = 3
export const BEATS_MAX = 12
/** A beat is either halved or quartered. Thirds are not written here. */
export const isFret = (text: string): boolean => {
  if (text === 'x') return true
  if (!/^\d{1,2}$/.test(text)) return false
  return Number(text) <= HIGHEST_FRET
}

export const emptySlot = (strings: number, at: Sixteenth = ON_BEAT): Slot => ({
  at,
  frets: Array.from({ length: strings }, () => null),
  after: Array.from({ length: strings }, () => '-' as Technique)
})

/** A plain beat: the beat and its eighth, with no sixteenths between them. */
export const emptyBeat = (strings: number): Beat => ({
  slots: [emptySlot(strings, ON_BEAT), emptySlot(strings, OFF_BEAT)],
  chord: null
})

export const emptyBar = (strings: number, beats = 4): Bar => ({
  beats: Array.from({ length: beats }, () => emptyBeat(strings))
})

export const newTab = (strings = 6, beats = 4): TabDoc => ({
  strings,
  bars: [emptyBar(strings, beats)]
})

export const slotIsEmpty = (slot: Slot): boolean =>
  slot.frets.every((fret) => fret === null) && slot.after.every((join) => join === '-')

export const beatIsEmpty = (beat: Beat): boolean =>
  beat.chord === null && beat.slots.every(slotIsEmpty)

export const barIsEmpty = (bar: Bar): boolean => bar.beats.every(beatIsEmpty)

/** How many beats a bar is in, which is what the time signature amounts to here. */
export const beatCount = (bar: Bar): number => bar.beats.length

/**
 * Puts the document back into a state that can be written down.
 *
 * Two things drift while editing. A beat that was divided into sixteenths and
 * then emptied should go back to eighths — but not while the cursor is still
 * standing in it, or the ground moves under whoever is typing, so collapsing
 * waits until they leave and is done here. And there is always one spare bar
 * at the end to write into: without it there would be no way to start a bar
 * that does not exist yet.
 */
export function normalise(doc: TabDoc, keep?: { bar: number; beat: number }): TabDoc {
  const bars = doc.bars.map((bar, index) =>
    collapseBar(bar, keep?.bar === index ? keep.beat : null)
  )

  /* Everything after the last bar with anything in it is spare, and one spare
     bar is all that is wanted. */
  let last = bars.length - 1
  while (last >= 0 && barIsEmpty(bars[last] as Bar)) last -= 1

  const kept = bars.slice(0, last + 1)
  const spare = bars[last + 1]
  /* A bar made to follow the last real one is in the same time as it. */
  const shape = bars[last] ?? emptyBar(doc.strings)

  /* A spare bar that is already there is kept rather than built afresh. It is
     empty and collapsed, which is all a new one would be — and the cursor may
     be standing in it, having just made room for a sixteenth that an empty
     replacement would sweep away. */
  kept.push(spare ?? emptyBar(doc.strings, beatCount(shape)))

  /* Nothing drifted, so nothing changed. Worth saying by handing back the same
     document rather than an equal one: the callers ask whether the document
     moved, and every cursor key comes through here. */
  return unmoved(doc.bars, kept) ? doc : { ...doc, bars: kept }
}

const unmoved = (before: Bar[], after: Bar[]): boolean =>
  before.length === after.length && before.every((bar, index) => bar === after[index])

const collapseBar = (bar: Bar, keep: number | null): Bar => {
  const beats = bar.beats.map((beat, index) => (index === keep ? beat : collapseBeat(beat)))
  return beats.every((beat, index) => beat === bar.beats[index]) ? bar : { beats }
}

/**
 * A sixteenth with nothing in it goes away again.
 *
 * The beat and its `&` always stay, however empty: they are what a beat is.
 * Only the `e` and the `a` come and go — and not while the cursor is standing
 * in the beat, or emptying a sixteenth would close the gap under whoever is
 * about to type into it. Which beat to leave alone is the caller's to say.
 */
function collapseBeat(beat: Beat): Beat {
  const kept = beat.slots.filter(
    (slot) => slot.at === ON_BEAT || slot.at === OFF_BEAT || !slotIsEmpty(slot)
  )
  return kept.length === beat.slots.length ? beat : { ...beat, slots: kept }
}
