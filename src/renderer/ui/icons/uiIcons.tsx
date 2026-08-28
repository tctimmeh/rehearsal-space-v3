import { Icon } from './Icon'

export const PlayIcon = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M8 5l11 7-11 7z" />
  </svg>
)

export const StopIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="6" y="6" width="12" height="12" />
  </Icon>
)

export const PauseIcon = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <rect x="7" y="5" width="3.6" height="14" rx="0.6" />
    <rect x="13.4" y="5" width="3.6" height="14" rx="0.6" />
  </svg>
)

/* The return arrow off a keyboard: back to where you came from. */
export const AutoReturnIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M19.5 5.5v6.5a3 3 0 01-3 3H6" />
    <path d="M9.5 11.5L5.5 15l4 3.5" />
  </Icon>
)

/* Round and round: an arrow chasing its own tail between two ends. */
export const LoopIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M7 7h10a3.5 3.5 0 013.5 3.5v0A3.5 3.5 0 0117 14H7a3.5 3.5 0 01-3.5-3.5v0A3.5 3.5 0 017 7z" />
    <path d="M9 4.5L6.2 7 9 9.5" />
  </Icon>
)

/*
 * What the tool is now: a run of music with a stretch marked out on it. The
 * ends are the handles you drag; the trace is what you drag them against.
 */
export const WaveformIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size} strokeWidth={1.6}>
    <path d="M3 12h1.6M19.4 12H21" />
    <path d="M7 5.5v13M17 5.5v13" />
    <path d="M9.4 9.5v5M12 6.5v11M14.6 9.5v5" />
  </Icon>
)

/* Six strings with a fret number sitting on one of them. */
export const TablatureIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size} strokeWidth={1.5}>
    <path d="M3 6h18M3 9.6h18M3 13.2h6M15 13.2h6M3 16.8h18M3 20.4h18" />
    <path d="M9.6 10.4h4.8v5.6H9.6z" fill="currentColor" stroke="none" opacity="0.9" />
  </Icon>
)

export const KebabIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </Icon>
)

export const TunerIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M8.2 2v8.6a3.8 3.8 0 007.6 0V2" />
    <path d="M12 14.4V22" />
  </Icon>
)

export const LyricsEditorIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4.5 2.5h9l6 6v13h-15z" />
    <path d="M13.5 2.5v6h6" />
    <path d="M8 13h8M8 17.5h5" />
  </Icon>
)

export const ChordChartIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="3.5" y="2.5" width="17" height="19" rx="1.5" />
    <path d="M9.2 2.5v19M14.8 2.5v19" />
    <path d="M3.5 8.5h17M3.5 15h17" />
  </Icon>
)

export const ScalesIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 21V10M9.3 21V4M14.6 21v-8M19.9 21V7" />
  </Icon>
)


export const RhymesIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M3 4.5h18M3 9.5h13M3 14.5h16M3 19.5h9" />
  </Icon>
)

export const RecordIcon = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="12" r="6" />
  </svg>
)
