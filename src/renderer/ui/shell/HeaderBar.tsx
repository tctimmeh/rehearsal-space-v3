import { useEffect, useState } from 'react'

import { useConfig } from '@renderer/state/config'
import { useSong } from '@renderer/state/song'
import {
  CENTS_MAX,
  CENTS_MIN,
  SEMITONES_MAX,
  SEMITONES_MIN,
  SPEED_MAX,
  SPEED_MIN,
  useTransport
} from '@renderer/state/transport'
import { useView, VIEWS } from '@renderer/state/view'
import { KebabIcon, PauseIcon, PlayIcon, RecordIcon, StopIcon } from '../icons/uiIcons'
import { IconButton, Knob, Tabs, useDismiss } from '../primitives'
import { AdvancedModal } from './AdvancedModal'
import { SettingsModal } from './SettingsModal'
import { RecordingModal } from './RecordingModal'
import { useRecording } from '@renderer/state/recording'
import type { RecordPhase } from '@core/record/arming'
import { ToolsModal } from './ToolsModal'

const formatSpeed = (speed: number) => `${Math.round(speed * 100)}%`

const signed = (value: number, unit: string) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)} ${unit}`

const formatSemitones = (semitones: number) => signed(semitones, 'st')
const formatCents = (cents: number) => signed(cents, '¢')

/** Armed says what will happen; recording says what is happening. */
const RECORD_LABELS: Record<RecordPhase, string> = {
  off: 'Arm recording',
  armed: 'Armed — starts with the player',
  recording: 'Recording — click to finish the take'
}

export function HeaderBar() {
  const { view, setView } = useView()
  const song = useSong((state) => state.song)
  const loading = useSong((state) => state.loading)
  const phase = useRecording((state) => state.phase)
  const toggleRecording = useRecording((state) => state.toggle)
  const update = useSong((state) => state.update)
  const { playing, speed, semitones, cents, toggle, stop, setSpeed, setSemitones, setCents } =
    useTransport()

  /* Tempo and pitch are part of the song, so they come back on next load. */
  const changeSpeed = (next: number) => {
    setSpeed(next)
    update({ playback: { speed: next, pitch: { semitones, cents } } })
  }
  const changeSemitones = (next: number) => {
    setSemitones(next)
    update({ playback: { speed, pitch: { semitones: next, cents } } })
  }
  const changeCents = (next: number) => {
    setCents(next)
    update({ playback: { speed, pitch: { semitones, cents: next } } })
  }

  return (
    <header className="bar">
      <Tabs tabs={VIEWS} active={view} onSelect={setView} />
      <span className="bar__sep" />

      <div className="transport">
        <IconButton label="Stop" onClick={stop} disabled={song === null || loading !== null}>
          <StopIcon />
        </IconButton>
        <IconButton
          label={playing ? 'Pause' : 'Play'}
          variant="go"
          onClick={toggle}
          disabled={song === null || loading !== null}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </IconButton>
        <span className="transport__sep" />
        <IconButton
          label={RECORD_LABELS[phase]}
          className={`icon-btn--record-${phase}`}
          engaged={phase === 'recording'}
          disabled={song === null || loading !== null}
          onClick={toggleRecording}
        >
          <RecordIcon />
        </IconButton>
      </div>

      <div className="knobs">
        <Knob
          label="Tempo"
          value={speed}
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={0.01}
          defaultValue={1}
          onChange={changeSpeed}
          format={formatSpeed}
        />
        <PitchControls
          semitones={semitones}
          cents={cents}
          onSemitones={changeSemitones}
          onCents={changeCents}
        />
      </div>

      <SongIdentity />

      <AppMenu />
    </header>
  )
}

/**
 * Pitch, folded away.
 *
 * It is set once for a song, if at all, and then left alone — which is a poor
 * reason to spend two knobs' worth of the bar on it. What it may not do is go
 * quiet: a shift left on by accident is a baffling thing to listen to, so
 * whenever the pitch is anything other than nothing the button says so instead
 * of saying "Pitch".
 */
function PitchControls({
  semitones,
  cents,
  onSemitones,
  onCents
}: {
  semitones: number
  cents: number
  onSemitones: (value: number) => void
  onCents: (value: number) => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useDismiss<HTMLDivElement>(open, () => setOpen(false))

  const shifted = semitones !== 0 || cents !== 0
  const summary = [
    semitones === 0 ? null : formatSemitones(semitones),
    cents === 0 ? null : formatCents(cents)
  ].filter((part) => part !== null)

  return (
    <div className="menu-wrap pitch" ref={wrap}>
      <button
        type="button"
        className="raised pitch__face"
        aria-label={
          shifted ? `Pitch controls, shifted ${summary.join(' ')}` : 'Pitch controls'
        }
        aria-expanded={open}
        data-engaged={open}
        data-shifted={shifted}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {shifted ? summary.join(' ') : 'Pitch'}
      </button>

      {open ? (
        <div className="menu pitch__panel">
          <Knob
            label="Pitch"
            value={semitones}
            min={SEMITONES_MIN}
            max={SEMITONES_MAX}
            step={1}
            defaultValue={0}
            onChange={onSemitones}
            format={formatSemitones}
            travel={264}
          />
          <Knob
            label="Cents"
            value={cents}
            min={CENTS_MIN}
            max={CENTS_MAX}
            step={1}
            defaultValue={0}
            onChange={onCents}
            format={formatCents}
          />
        </div>
      ) : null}
    </div>
  )
}

/**
 * The song's name and artist, which are also where they are changed.
 *
 * They used to be fields in a view of their own. There is only one place a
 * song says what it is called, so that is the place to rename it.
 */
function SongIdentity() {
  const song = useSong((state) => state.song)
  const update = useSong((state) => state.update)
  const [open, setOpen] = useState(false)
  const wrap = useDismiss<HTMLDivElement>(open, () => setOpen(false))

  if (song === null) {
    return (
      <div className="song-id">
        <div className="song-id__title">No song loaded</div>
        <div className="song-id__artist" />
      </div>
    )
  }

  return (
    <div className="song-id song-id--editable" ref={wrap}>
      <button
        type="button"
        className="song-id__face"
        aria-label="Song name and artist"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className="song-id__title">{song.title}</span>
        <span className="song-id__artist">{song.artist || 'No artist'}</span>
      </button>

      {open ? (
        /* Both fields save as they are typed, so Enter has nothing to do but
           mean "done". Listening here rather than on each field so it holds
           for whatever else ends up in the panel. */
        <div
          className="menu song-id__panel"
          onKeyDown={(event) => {
            if (event.key === 'Enter') setOpen(false)
          }}
        >
          <label className="field">
            <span>Name</span>
            <input
              className="well input"
              aria-label="Name"
              value={song.title}
              autoFocus
              onChange={(event) => void update({ title: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Artist</span>
            <input
              className="well input"
              aria-label="Artist"
              value={song.artist}
              placeholder="No artist"
              onChange={(event) => void update({ artist: event.target.value })}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}


type Dialog = 'settings' | 'advanced' | 'recording' | 'tools' | null

function AppMenu() {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const revealLibraryFolder = useConfig((state) => state.revealLibraryFolder)
  const wrap = useDismiss<HTMLDivElement>(open, () => setOpen(false))

  const choose = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  const dismiss = () => setDialog(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ',' || !event.ctrlKey) return
      event.preventDefault()
      setDialog('settings')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="menu-wrap" ref={wrap}>
      <IconButton
        label="Menu"
        engaged={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <KebabIcon />
      </IconButton>

      {open ? (
        <div className="menu" role="menu">
          <MenuItem label="Settings" shortcut="Ctrl+," onClick={choose(() => setDialog('settings'))} />
          <MenuItem label="Recording…" onClick={choose(() => setDialog('recording'))} />
          <MenuItem label="External tools…" onClick={choose(() => setDialog('tools'))} />
          <MenuItem label="Advanced settings…" onClick={choose(() => setDialog('advanced'))} />
          <div className="menu__sep" />
          <MenuItem label="Library folder" onClick={choose(() => void revealLibraryFolder())} />
          <div className="menu__sep" />
          <MenuItem label="Quit" shortcut="Ctrl+Q" onClick={choose(() => window.close())} />
        </div>
      ) : null}

      {dialog === 'settings' ? <SettingsModal onDismiss={dismiss} /> : null}
      {dialog === 'advanced' ? <AdvancedModal onDismiss={dismiss} /> : null}
      {dialog === 'recording' ? <RecordingModal onDismiss={dismiss} /> : null}
      {dialog === 'tools' ? <ToolsModal onDismiss={dismiss} /> : null}
    </div>
  )
}

function MenuItem({
  label,
  shortcut,
  onClick
}: {
  label: string
  shortcut?: string
  onClick: () => void
}) {
  return (
    <button type="button" role="menuitem" className="menu__item" onClick={onClick}>
      <span>{label}</span>
      {shortcut === undefined ? null : <kbd>{shortcut}</kbd>}
    </button>
  )
}
