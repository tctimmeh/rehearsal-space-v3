import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import type { Channel, Song } from '@core/song/song'
import { useSong, type MixerPatch } from '@renderer/state/song'
import { SubjectIcon } from '../icons/subjectIcons'
import { Fader } from '../primitives'

const BUSES = [
  { id: 'music', label: 'Music', color: CHANNEL_SUBJECT_COLOR.music },
  { id: 'click', label: 'Click', color: CHANNEL_SUBJECT_COLOR.metronome }
] as const

const gainToDb = (gain: number): string =>
  gain <= 0.0001 ? '−∞ dB' : `${(20 * Math.log10(gain)).toFixed(1).replace('-', '−')} dB`

export function MixerDock({ song }: { song: Song }) {
  const { updateChannel, updateBus } = useSong()

  return (
    <div className="dock">
      <span className="dock__label">Mix</span>

      <div className="strips">
        {song.channels.length === 0 ? (
          <p className="dock__empty">No channels yet. Add one from Setup.</p>
        ) : (
          song.channels.map((channel) => (
            <ChannelStrip
              key={channel.id}
              channel={channel}
              onChange={(patch) => updateChannel(channel.id, patch)}
            />
          ))
        )}
      </div>

      <div className="buses">
        {BUSES.map((bus) => (
          <div key={bus.id} className="bus">
            <span className="bus__name">{bus.label}</span>
            <Fader
              label={`${bus.label} level`}
              value={song.buses[bus.id]}
              onChange={(gain) => updateBus(bus.id, gain)}
              capColor={bus.color}
              height={62}
            />
            <span className="bus__db">{gainToDb(song.buses[bus.id])}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChannelStrip({
  channel,
  onChange
}: {
  channel: Channel
  onChange: (patch: MixerPatch) => void
}) {
  const color = CHANNEL_SUBJECT_COLOR[channel.subject]
  /* Solo is a per-part decision; there is nothing to solo a click against. */
  const soloable = channel.kind !== 'metronome'

  return (
    <div className="strip">
      <div className="strip__name">
        <span style={{ color }}>
          <SubjectIcon subject={channel.subject} size={20} />
        </span>
        <span>{channel.name}</span>
      </div>

      <Fader
        label={`${channel.name} level`}
        value={channel.gain}
        onChange={(gain) => onChange({ gain })}
        capColor={color}
      />

      <div className="strip__buttons">
        <button
          type="button"
          className="raised ms-btn ms-btn--mute"
          data-engaged={channel.muted}
          aria-pressed={channel.muted}
          title={`Mute ${channel.name}`}
          onClick={() => onChange({ muted: !channel.muted })}
        >
          M
        </button>
        <button
          type="button"
          className="raised ms-btn ms-btn--solo"
          data-engaged={channel.soloed}
          aria-pressed={channel.soloed}
          disabled={!soloable}
          title={soloable ? `Solo ${channel.name}` : 'Metronome channels cannot be soloed'}
          onClick={() => onChange({ soloed: !channel.soloed })}
        >
          S
        </button>
      </div>
    </div>
  )
}
