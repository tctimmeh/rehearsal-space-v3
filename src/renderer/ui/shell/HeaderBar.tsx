import { useEffect, useRef, useState } from 'react'

import { useTransport } from '@renderer/state/transport'
import { PITCH_MAX, PITCH_MIN, SPEED_MAX, SPEED_MIN } from '@renderer/state/transport'
import { useView, VIEWS } from '@renderer/state/view'
import { KebabIcon, PauseIcon, PlayIcon, StopIcon } from '../icons/uiIcons'
import { IconButton, Knob, Tabs } from '../primitives'

const formatSpeed = (speed: number) => `${Math.round(speed * 100)}%`

const formatPitch = (semitones: number) => {
  if (semitones === 0) return '0 st'
  const sign = semitones > 0 ? '+' : '−'
  const magnitude = Math.abs(semitones)
  const whole = Math.trunc(magnitude)
  const cents = Math.round((magnitude - whole) * 100)
  return cents === 0 ? `${sign}${whole} st` : `${sign}${whole}.${String(cents).padStart(2, '0')} st`
}

export function HeaderBar({ title, artist }: { title: string; artist: string }) {
  const { view, setView } = useView()
  const { playing, speed, pitch, toggle, stop, setSpeed, setPitch } = useTransport()

  return (
    <header className="bar">
      <Tabs tabs={VIEWS} active={view} onSelect={setView} />
      <span className="bar__sep" />

      <div className="transport">
        <IconButton label="Stop" onClick={stop}>
          <StopIcon />
        </IconButton>
        <IconButton label={playing ? 'Pause' : 'Play'} variant="go" onClick={toggle}>
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
          onChange={setSpeed}
          format={formatSpeed}
        />
        <Knob
          label="Pitch"
          value={pitch}
          min={PITCH_MIN}
          max={PITCH_MAX}
          step={0.5}
          defaultValue={0}
          onChange={setPitch}
          format={formatPitch}
        />
      </div>

      <div className="song-id">
        <div className="song-id__title">{title}</div>
        <div className="song-id__artist">{artist || 'No artist'}</div>
      </div>

      <AppMenu />
    </header>
  )
}

function AppMenu() {
  const [open, setOpen] = useState(false)
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

  return (
    <div className="menu-wrap" ref={wrap}>
      <IconButton
        label="Menu"
        engaged={open}
        className="menu-btn"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <KebabIcon />
      </IconButton>
      {open ? (
        <div className="menu" role="menu">
          <MenuItem label="Settings" shortcut="Ctrl+," />
          <MenuItem label="Library folder" />
          <MenuItem label="Help" shortcut="F1" />
          <MenuItem label="About" />
          <div className="menu__sep" />
          <MenuItem label="Quit" shortcut="Ctrl+Q" onClick={() => window.close()} />
        </div>
      ) : null}
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
  onClick?: () => void
}) {
  return (
    <button type="button" role="menuitem" className="menu__item" onClick={onClick}>
      <span>{label}</span>
      {shortcut === undefined ? null : <kbd>{shortcut}</kbd>}
    </button>
  )
}
