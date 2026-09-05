/**
 * Colours that belong to a tool or to the chrome, as against to a channel.
 *
 * Channel identity lives in `channelSubject`, where a colour means "this is
 * the bass". These mean nothing of the sort: they are a tool choosing how to
 * mark up its own text. They were borrowed from the channel table for a while,
 * which put a `lyrics` entry in a list of instruments to make the lookup
 * type-check — a channel nothing could ever create.
 */
export const TOOL_ACCENT = {
  /** Section headings in the lyrics editor. */
  lyricSection: '#2dd4bf',
  /** Chords over the lyrics: gold against the sections' teal, warm against
      cool, because two warm colours read as the same thing. */
  lyricChord: '#eab54a',
  /** Roman numerals in the chord chart. */
  chordDegree: '#a78bfa'
} as const

/**
 * What a latched control may be lit with.
 *
 * Teal by default because it is the one part of the palette that means
 * nothing else: green is the transport and solo, red is mute, amber is the
 * playhead. The rest are here because which of them reads best is a matter of
 * the room and the screen, which is the user's to judge and not ours.
 */
export const ENGAGED_COLORS = [
  { id: 'teal', label: 'Teal', hex: '#5ee0d5' },
  { id: 'blue', label: 'Blue', hex: '#7cc7ff' },
  { id: 'amber', label: 'Amber', hex: '#ffd166' },
  { id: 'green', label: 'Green', hex: '#6fd99a' },
  { id: 'violet', label: 'Violet', hex: '#a78bfa' },
  { id: 'neutral', label: 'Neutral', hex: '#e6e8ef' }
] as const

export type EngagedColorId = (typeof ENGAGED_COLORS)[number]['id']

export const ENGAGED_COLOR_IDS = ENGAGED_COLORS.map((one) => one.id) as readonly EngagedColorId[]

export const ENGAGED_COLOR_DEFAULT: EngagedColorId = 'teal'

export const isEngagedColorId = (value: unknown): value is EngagedColorId =>
  typeof value === 'string' && (ENGAGED_COLOR_IDS as readonly string[]).includes(value)

export interface EngagedTheme {
  /** The glyph or label of the latched control. */
  color: string
  /** Its border: the hue taken most of the way down to the button's own edge. */
  rim: string
  /** The inset well, and the hue glowing out of it. */
  glow: string
}

const BUTTON_EDGE = [11, 12, 14]
/** Far enough down to read as an edge rather than as a second, brighter glow. */
const RIM_STRENGTH = 0.26
const GLOW_STRENGTH = 0.32

const channels = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
]

const hex2 = (value: number): string => Math.round(value).toString(16).padStart(2, '0')

/**
 * One hue, made into the three things the CSS needs.
 *
 * Derived rather than written out six times over: a hue that is only half
 * applied — a bright glow inside a rim still the colour of the last one —
 * looks like a mistake, and six hand-tuned sets is six chances to make it.
 */
export function engagedTheme(hex: string): EngagedTheme {
  const [r, g, b] = channels(hex)
  const rim = [r, g, b]
    .map((value, index) => hex2((BUTTON_EDGE[index] as number) + (value - (BUTTON_EDGE[index] as number)) * RIM_STRENGTH))
    .join('')
  return {
    color: hex,
    rim: `#${rim}`,
    glow: `inset 0 2px 4px rgba(0, 0, 0, 0.75), inset 0 0 9px rgba(${r}, ${g}, ${b}, ${GLOW_STRENGTH})`
  }
}

export const engagedThemeOf = (id: EngagedColorId): EngagedTheme =>
  engagedTheme((ENGAGED_COLORS.find((one) => one.id === id) ?? ENGAGED_COLORS[0]).hex)
