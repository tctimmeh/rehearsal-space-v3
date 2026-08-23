import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import type { PlaceholderChannel } from '@renderer/state/placeholder'
import { SubjectIcon } from '../icons/subjectIcons'
import { Fader } from '../primitives'

export interface BusState {
  id: 'music' | 'click'
  label: string
  gain: number
  color: string
}

interface MixerDockProps {
  channels: PlaceholderChannel[]
  buses: BusState[]
  onChannelChange: (id: string, patch: Partial<PlaceholderChannel>) => void
  onBusChange: (id: BusState['id'], gain: number) => void
}

const gainToDb = (gain: number): string =>
  gain <= 0.0001 ? '−∞ dB' : `${(20 * Math.log10(gain)).toFixed(1).replace('-', '−')} dB`

export function MixerDock({ channels, buses, onChannelChange, onBusChange }: MixerDockProps) {
  return (
    <div className="dock">
      <span className="dock__label">Mix</span>

      <div className="strips">
        {channels.map((channel) => (
          <ChannelStrip
            key={channel.id}
            channel={channel}
            onChange={(patch) => onChannelChange(channel.id, patch)}
          />
        ))}
      </div>

      <div className="buses">
        {buses.map((bus) => (
          <div key={bus.id} className="bus">
            <span className="bus__name">{bus.label}</span>
            <Fader
              label={`${bus.label} level`}
              value={bus.gain}
              onChange={(gain) => onBusChange(bus.id, gain)}
              capColor={bus.color}
              height={62}
            />
            <span className="bus__db">{gainToDb(bus.gain)}</span>
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
  channel: PlaceholderChannel
  onChange: (patch: Partial<PlaceholderChannel>) => void
}) {
  const color = CHANNEL_SUBJECT_COLOR[channel.subject]
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
