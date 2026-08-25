import { useEffect, useRef, useState } from 'react'

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
import { IconButton, Knob, Tabs } from '../primitives'
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
  const showCentsPreference = useConfig((state) => state.config?.showCents ?? false)

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

  /* The toggle reveals the fine control, but a cent offset already in use is
     never hidden — that would leave the song detuned with nothing on screen
     saying so. Zero it (double-click the knob) and it puts itself away. */
  const showCents = showCentsPreference || cents !== 0

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
        <Knob
          label="Pitch"
          value={semitones}
          min={SEMITONES_MIN}
          max={SEMITONES_MAX}
          step={1}
          defaultValue={0}
          onChange={changeSemitones}
          format={formatSemitones}
          travel={264}
        />
        <CentsToggle on={showCentsPreference} inUse={cents !== 0} />
        {showCents ? (
          <Knob
            label="Cents"
            value={cents}
            min={CENTS_MIN}
            max={CENTS_MAX}
            step={1}
            defaultValue={0}
            onChange={changeCents}
            format={formatCents}
          />
        ) : null}
      </div>

      <div className="song-id">
        <div className="song-id__title">{song?.title ?? 'No song loaded'}</div>
        <div className="song-id__artist">{song === null ? '' : song.artist || 'No artist'}</div>
      </div>

      <AppMenu />
    </header>
  )
}

function CentsToggle({ on, inUse }: { on: boolean; inUse: boolean }) {
  const setPreference = useConfig((state) => state.set)
  const label = inUse && !on ? 'Cents in use' : on ? 'Hide cents' : 'Fine tune in cents'

  return (
    <button
      type="button"
      className="raised cents-toggle"
      data-engaged={on}
      title={label}
      aria-label={label}
      aria-pressed={on}
      onClick={() => void setPreference({ showCents: !on })}
    >
      ¢
    </button>
  )
}

type Dialog = 'settings' | 'recording' | 'tools' | null

function AppMenu() {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const revealLibraryFolder = useConfig((state) => state.revealLibraryFolder)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

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
          <div className="menu__sep" />
          <MenuItem label="Library folder" onClick={choose(() => void revealLibraryFolder())} />
          <div className="menu__sep" />
          <MenuItem label="Quit" shortcut="Ctrl+Q" onClick={choose(() => window.close())} />
        </div>
      ) : null}

      {dialog === 'settings' ? <SettingsModal onDismiss={dismiss} /> : null}
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
