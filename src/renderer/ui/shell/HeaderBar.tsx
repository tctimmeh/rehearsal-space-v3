import { useEffect, useRef, useState } from 'react'

import { useConfig } from '@renderer/state/config'
import { useSong } from '@renderer/state/song'
import {
  PITCH_MAX,
  PITCH_MIN,
  SPEED_MAX,
  SPEED_MIN,
  useTransport
} from '@renderer/state/transport'
import { useView, VIEWS } from '@renderer/state/view'
import { KebabIcon, PauseIcon, PlayIcon, StopIcon } from '../icons/uiIcons'
import { IconButton, Knob, Tabs } from '../primitives'
import { SettingsModal } from './SettingsModal'

const formatSpeed = (speed: number) => `${Math.round(speed * 100)}%`

const formatPitch = (semitones: number) => {
  if (semitones === 0) return '0 st'
  const sign = semitones > 0 ? '+' : '−'
  const magnitude = Math.abs(semitones)
  const whole = Math.trunc(magnitude)
  const cents = Math.round((magnitude - whole) * 100)
  return cents === 0 ? `${sign}${whole} st` : `${sign}${whole}.${String(cents).padStart(2, '0')} st`
}

export function HeaderBar() {
  const { view, setView } = useView()
  const song = useSong((state) => state.song)
  const update = useSong((state) => state.update)
  const { playing, speed, pitch, toggle, stop, setSpeed, setPitch } = useTransport()

  /* Tempo and pitch are part of the song, so they come back on next load. */
  const changeSpeed = (next: number) => {
    setSpeed(next)
    update({ playback: { speed: next, pitch } })
  }
  const changePitch = (next: number) => {
    setPitch(next)
    update({ playback: { speed, pitch: next } })
  }

  return (
    <header className="bar">
      <Tabs tabs={VIEWS} active={view} onSelect={setView} />
      <span className="bar__sep" />

      <div className="transport">
        <IconButton label="Stop" onClick={stop} disabled={song === null}>
          <StopIcon />
        </IconButton>
        <IconButton
          label={playing ? 'Pause' : 'Play'}
          variant="go"
          onClick={toggle}
          disabled={song === null}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
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
          value={pitch}
          min={PITCH_MIN}
          max={PITCH_MAX}
          step={0.5}
          defaultValue={0}
          onChange={changePitch}
          format={formatPitch}
        />
      </div>

      <div className="song-id">
        <div className="song-id__title">{song?.title ?? 'No song loaded'}</div>
        <div className="song-id__artist">{song === null ? '' : song.artist || 'No artist'}</div>
      </div>

      <AppMenu />
    </header>
  )
}

function AppMenu() {
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
          <MenuItem label="Settings" shortcut="Ctrl+," onClick={choose(() => setSettingsOpen(true))} />
          <MenuItem label="Library folder" onClick={choose(() => void revealLibraryFolder())} />
          <div className="menu__sep" />
          <MenuItem label="Quit" shortcut="Ctrl+Q" onClick={choose(() => window.close())} />
        </div>
      ) : null}

      {settingsOpen ? <SettingsModal onDismiss={() => setSettingsOpen(false)} /> : null}
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
