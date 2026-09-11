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
 *
 * A staccato is not a join but a note cut short, and belongs to the note it
 * follows. It is written here all the same, because the column after a note is
 * the only room text tablature has: there is nowhere above or below a line of
 * dashes to put a dot. Only one of them fits, which is the honest limit of
 * writing music this way — a note is slid into or cut short, not both.
 *
 * A bend says that the note is bent and not how far, and a release that it
 * comes back down. How far was tried three ways — fractions above the staff,
 * spelled out in ASCII, and a letter apiece for a quarter, a half and a whole
 * tone — and every one of them cost more than it was worth for something used
 * this rarely: the first is too small to read, the second spills across
 * columns and collides when two bends are close, and the third is four
 * near-identical characters to remember. Text tablature gives up note
 * durations and dynamics already; how far a bend goes is left to the ear and
 * the recording, which is where it was going to be learned from anyway.
 */
export type Technique = '-' | '/' | '\\' | '^' | '.' | 'b' | 'r'

export const TECHNIQUES: Technique[] = ['-', '/', '\\', '^', '.', 'b', 'r']

/**
 * The cursor's slot when it sits in the column a bar opens with.
 *
 * A technique is written in the column that follows the note it comes out of,
 * so what comes *into* a note is written in the column before it — which the
 * first note of a bar does not have inside the bar. It has the opening column,
 * which is there to keep the notes off the bar line and is otherwise empty, so
 * that is where a slide into a bar's first note goes, and a pre-bend released
 * down to it.
 */
export const OPENING = -1

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
 * How many parts a beat is cut into, when it is not the usual four.
 *
 * Three is three notes in the beat, and six is the beat split at its `&` as it
 * always could be with each half in threes — which is what a sixteenth triplet
 * is, and why it keeps the `&` and loses the `e` and the `a`.
 *
 * Eight is thirty-seconds: the same four places with room between them. The
 * `e`, `&` and `a` stay exactly where they were, on the even numbers, and
 * nothing is written over what falls in the gaps — there is no name for it to
 * be written with, and a note halfway between two marks needs none.
 */
export type Division = 3 | 6 | 8

export const DIVISIONS: Division[] = [3, 6, 8]

/**
 * One moment: what every string is doing, and how each joins to the next.
 *
 * A technique belongs to a string rather than to the moment, because a slide
 * on the third string says nothing about what the second is doing — and the
 * sketch agrees, putting the character after "the note under the cursor",
 * which is somewhere on one string.
 */
export interface Slot {
  /** Which of the beat's divisions this falls on, counted from the beat. */
  at: number
  /** One entry per string, top row first. Null is a string not played. */
  frets: (Fret | null)[]
  after: Technique[]
  /**
   * Damped with the heel of the picking hand.
   *
   * A property of the moment rather than of one string: the hand is on the
   * strings, not on a string, and it is drawn once above the staff whatever is
   * being played underneath.
   */
  palm?: boolean
  /** Half-beats of vibrato, counted from the note and drawn as a wave. */
  vibrato?: number
}

/** How long a vibrato is drawn: a half-beat is one mark, and each adds two. */
export const vibratoWidth = (halves: number): number => Math.max(0, halves * 2 - 1)

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
  /**
   * In threes rather than halves, when it is.
   *
   * Absent is the ordinary beat the rest of this file describes: two slots, or
   * three or four with the sixteenths marked. A beat in threes holds exactly
   * three slots and a beat in sixes exactly six, however empty — the division
   * is something somebody asked for, not something the notes imply, so it does
   * not come and go as they are typed and deleted.
   */
  division?: Division
}

/**
 * What is written over a slot: the `e`, `&` and `a` of a beat in halves, and
 * for a beat in sixes the `&` alone, which is where its second three begins.
 * A beat in threes is marked by nothing at all — three notes evenly spaced
 * between two beat numbers can be nothing else.
 */
export const markOf = (beat: Beat, at: number): string => {
  if (beat.division === undefined) return SIXTEENTH_MARKS[at as Sixteenth] ?? ''
  if (beat.division === 8) {
    return at % 2 === 0 ? (SIXTEENTH_MARKS[(at / 2) as Sixteenth] ?? '') : ''
  }
  return beat.division === 6 && at === 3 ? '&' : ''
}

/** Where the `&` falls: halfway, whatever the beat is cut into. */
export const eighthOf = (beat: Beat): number => (beat.division ?? 4) / 2

/** The slots a beat in threes or sixes is made of, empty and evenly spaced. */
export const dividedSlots = (division: Division, strings: number): Slot[] =>
  Array.from({ length: division }, (_, at) => emptySlot(strings, at))

export interface Bar {
  /** What comes into the first note, per string. Absent when nothing does. */
  into?: Technique[]
  beats: Beat[]
  /**
   * Free text introducing the section this bar opens: a name for it, or a
   * note on how to play it. Absent where the bar carries straight on from the
   * one before, which is nearly always.
   *
   * Kept on the bar rather than in a list beside the document, so it travels
   * with the music it introduces instead of by an index that everything else
   * has to keep in step.
   */
  opens?: string
  /** This bar is where a repeat begins: a double line, and a dot on the staff. */
  repeatStart?: boolean
  /**
   * This bar is where a repeat ends, and how many times it is repeated.
   *
   * One is the plain case — played again once — and says nothing above the
   * bar. More says how many. None at all is not a repeat.
   */
  repeatTimes?: number
}

/**
 * The two strings a repeat's dots sit between, which is the middle of the
 * staff whatever the instrument.
 */
export const isMiddleString = (string: number, strings: number): boolean =>
  string === Math.floor(strings / 2) - 1 || string === Math.floor(strings / 2)

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

export const emptySlot = (strings: number, at: number = ON_BEAT): Slot => ({
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

/**
 * How many strings a tablature can be written for: a four-string bass at one
 * end, an eight-string guitar at the other. A twelve-string is six.
 */
export const STRINGS_MIN = 4
export const STRINGS_MAX = 8

/**
 * Rewrites the document for a different instrument.
 *
 * Strings are added and taken away at the bottom, which is where an instrument
 * gains and loses them: the seventh string of a guitar is a low B below the
 * rest, not a new top string that renumbers everything written above it. So
 * what is already written stays where it was, and anything on a string that
 * has gone goes with it.
 */
export function setStrings(doc: TabDoc, wanted: number): TabDoc {
  const strings = Math.min(STRINGS_MAX, Math.max(STRINGS_MIN, Math.round(wanted)))
  if (strings === doc.strings) return doc

  const resize = <T,>(had: T[], fill: T): T[] =>
    Array.from({ length: strings }, (_, string) => had[string] ?? fill)

  return {
    strings,
    bars: doc.bars.map((bar) => ({
      ...bar,
      ...(bar.into === undefined ? {} : { into: resize(bar.into, '-' as Technique) }),
      beats: bar.beats.map((beat) => ({
        ...beat,
        slots: beat.slots.map((slot) => ({
          ...slot,
          frets: resize(slot.frets, null),
          after: resize(slot.after, '-' as Technique)
        }))
      }))
    }))
  }
}

export const newTab = (strings = 6, beats = 4): TabDoc => ({
  strings,
  bars: [emptyBar(strings, beats)]
})

export const slotIsEmpty = (slot: Slot): boolean =>
  slot.frets.every((fret) => fret === null) && slot.after.every((join) => join === '-')

export const beatIsEmpty = (beat: Beat): boolean =>
  beat.chord === null && beat.slots.every(slotIsEmpty)

export const barIsEmpty = (bar: Bar): boolean =>
  bar.beats.every(beatIsEmpty) && (bar.into ?? []).every((join) => join === '-')

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
export function normalise(
  doc: TabDoc,
  keep?: { bar: number; beat: number; writing?: number }
): TabDoc {
  const bars = doc.bars.map((bar, index) =>
    settleSection(collapseBar(bar, keep?.bar === index ? keep.beat : null), keep?.writing === index)
  )

  /* Everything after the last bar with anything in it is spare, and one spare
     bar is all that is wanted — but a bar introducing a section is holding
     words, which are worth keeping even where no notes have been written under
     them yet. */
  let last = bars.length - 1
  while (last >= 0 && barIsEmpty(bars[last] as Bar) && !opensSection(bars[last] as Bar)) last -= 1

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

/** Whether this bar begins a section, which is to say it has words above it. */
export const opensSection = (bar: Bar): boolean => (bar.opens ?? '').trim() !== ''

/**
 * A section emptied of its words is no longer a section.
 *
 * Not while the cursor is still in it, though: deleting the last character is
 * how you begin retyping, and closing the gap under whoever is typing would
 * take the field away mid-word. It goes when they leave, which is the same
 * bargain a sixteenth is on.
 */
const settleSection = (bar: Bar, writing: boolean): Bar => {
  if (bar.opens === undefined || writing || opensSection(bar)) return bar
  const { opens: _gone, ...rest } = bar
  return rest
}

const collapseBar = (bar: Bar, keep: number | null): Bar => {
  const beats = bar.beats.map((beat, index) => (index === keep ? beat : collapseBeat(beat)))
  return beats.every((beat, index) => beat === bar.beats[index]) ? bar : { ...bar, beats }
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
  /* A beat in threes is the shape it was asked to be, all three or six slots
     of it. Dropping the empty ones would close the gaps under whoever is about
     to fill them in. */
  if (beat.division === 3 || beat.division === 6) return beat

  /*
   * Nothing is written over a thirty-second, so where it falls is counted from
   * the marked place before it: the `e` before the one at three eighths, the
   * `a` before the one at seven. That place has to stay even when nothing is
   * played on it, or what is read back is a note at an eighth of the beat
   * rather than at three of them.
   */
  const anchors = new Set(
    beat.slots.filter((slot) => slot.at % 2 === 1 && !slotIsEmpty(slot)).map((slot) => slot.at - 1)
  )
  const kept = beat.slots.filter(
    (slot) =>
      slot.at === ON_BEAT ||
      slot.at === eighthOf(beat) ||
      !slotIsEmpty(slot) ||
      (beat.division === 8 && anchors.has(slot.at))
  )

  /* Once the last thirty-second has gone the beat goes back to the four places
     it had before, so that what is written down is the plainest thing that
     says the same. */
  if (beat.division === 8 && kept.every((slot) => slot.at % 2 === 0)) {
    const { division: _finer, ...rest } = beat
    return { ...rest, slots: kept.map((slot) => ({ ...slot, at: slot.at / 2 })) }
  }

  return kept.length === beat.slots.length ? beat : { ...beat, slots: kept }
}
