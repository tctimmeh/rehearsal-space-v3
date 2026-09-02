import type { ReactElement } from 'react'

import type { ChannelSubject } from '@core/song/channelSubject'
import { Icon } from './Icon'

/**
 * Literal rather than abstract, and drawn to fill the box edge to edge — an
 * abstract mark buys nothing at 18px. A guitar and an acoustic share a
 * silhouette apart from the sound hole; the channel name always sits beside
 * the icon.
 */
const guitarBody = (
  <path d="M12 8.8c-2.4 0-4 1.2-4 2.8 0 1 .6 1.8 1.4 2.4-1.4.9-2.4 2.4-2.4 4.2 0 2.6 2.2 4.4 5 4.4s5-1.8 5-4.4c0-1.8-1-3.3-2.4-4.2.8-.6 1.4-1.4 1.4-2.4 0-1.6-1.6-2.8-4-2.8z" />
)
const guitarNeck = (
  <>
    <path d="M10.8 9V3.6h2.4V9" />
    <rect x="9.8" y="1.2" width="4.4" height="2.4" rx=".5" />
  </>
)

const keyboardBlackKeys = (
  <>
    <rect x="5.6" y="5" width="2.6" height="8" fill="currentColor" stroke="none" />
    <rect x="12.2" y="5" width="2.6" height="8" fill="currentColor" stroke="none" />
    <rect x="17.4" y="5" width="2.6" height="8" fill="currentColor" stroke="none" />
  </>
)

const SUBJECT_GLYPHS: Record<ChannelSubject, ReactElement> = {
  music: (
    <>
      <path d="M9 19V4.2l11-2.4V16.6" />
      <ellipse cx="6" cy="19.6" rx="3" ry="2.4" />
      <ellipse cx="17" cy="17.2" rx="3" ry="2.4" />
    </>
  ),
  vocals: (
    <>
      <rect x="8.4" y="2" width="7.2" height="12.4" rx="3.6" />
      <path d="M10.3 5.6h3.4M10.3 8.4h3.4" />
      <path d="M5 11.4a7 7 0 0014 0" />
      <path d="M12 18.4V22M8.2 22h7.6" />
    </>
  ),
  guitar: (
    <>
      {guitarBody}
      {guitarNeck}
    </>
  ),
  acoustic: (
    <>
      {guitarBody}
      <circle cx="12" cy="17.4" r="1.8" />
      {guitarNeck}
    </>
  ),
  /* The same guitar laid on the diagonal: the longest line in the box, so the
     neck runs ~40% longer. Reads as "guitar with too much neck", which is what
     a bass is. */
  bass: (
    <g transform="rotate(45 12 12)">
      <path d="M12 15.5c-1.9 0-3.2 1-3.2 2.3 0 .8.5 1.5 1.1 2-1.1.7-1.9 1.9-1.9 3.3 0 2.1 1.8 3.4 4 3.4s4-1.3 4-3.4c0-1.4-.8-2.6-1.9-3.3.6-.5 1.1-1.2 1.1-2 0-1.3-1.3-2.3-3.2-2.3z" />
      <path d="M10.9 15.6V1.5h2.2v14.1" />
      <rect x="9.8" y="-1.6" width="4.4" height="3.1" rx=".6" />
    </g>
  ),
  drums: (
    <>
      <ellipse cx="12" cy="9.5" rx="9" ry="3.6" />
      <path d="M3 9.5v5.6c0 2 4 3.6 9 3.6s9-1.6 9-3.6V9.5" />
      <path d="M5.4 2.4l4 4.8M18.6 2.4l-4 4.8" />
    </>
  ),
  piano: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="1.6" />
      <path d="M8.7 5v14M15.3 5v14" />
      {keyboardBlackKeys}
    </>
  ),
  synth: (
    <>
      <rect x="2" y="10.5" width="20" height="9" rx="1.4" />
      <path d="M8.7 10.5v9M15.3 10.5v9" />
      <circle cx="5.6" cy="6" r="2" />
      <circle cx="11.2" cy="6" r="2" />
      <path d="M15.6 6h6.4" />
    </>
  ),
  other: <path d="M2 12h3.2l2.6-8.4 3.4 16.8 3-11.2 2.2 4.6H22" />,
  metronome: (
    <>
      <path d="M8.8 2.4h6.4l4 19.2H4.8z" />
      <path d="M6.4 15h11.2" />
      <path d="M12 20L15.6 5.2" />
      <rect x="13.5" y="9.3" width="3.6" height="2.3" rx=".4" transform="rotate(-76 15.3 10.4)" />
    </>
  ),
  lyrics: <path d="M3 4.5h18M3 9.5h13M3 14.5h16M3 19.5h9" />
}

export function SubjectIcon({ subject, size = 18 }: { subject: ChannelSubject; size?: number }) {
  return (
    <Icon size={size} strokeWidth={1.8}>
      {SUBJECT_GLYPHS[subject]}
    </Icon>
  )
}
