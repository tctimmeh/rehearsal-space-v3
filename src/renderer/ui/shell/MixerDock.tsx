import { useState } from 'react'

import { faderToGain, gainToDb, gainToFader } from '@core/mix/fader'
import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import type { AudioChannel, Channel } from '@core/song/song'
import type { DemucsModel } from '@shared/stems'
import { useAlign } from '@renderer/state/align'
import { useSong, type MixerPatch } from '@renderer/state/song'
import { openTool } from '@renderer/state/toolActions'
import { ChannelEditor } from '../channels/ChannelEditor'
import { DownloadDialog } from '../channels/DownloadDialog'
import { StemsDialog } from '../channels/StemsDialog'
import { SubjectIcon } from '../icons/subjectIcons'
import { Button, Fader, Modal } from '../primitives'
import { StripMenu, StripMenuItem } from './StripMenu'

const BUSES = [
  { id: 'music', label: 'Music', color: CHANNEL_SUBJECT_COLOR.music },
  { id: 'click', label: 'Click', color: CHANNEL_SUBJECT_COLOR.metronome }
] as const

/**
 * The mixer, and everything to do with the channels in it.
 *
 * Adding, renaming, splitting and removing all used to live in a view of their
 * own that had to be gone to and come back from. They belong where the
 * channels are.
 */
export function MixerDock() {
  /*
   * Read here rather than handed in. The dock now edits the song it draws, and
   * a component holding a copy of state it also edits shows the copy: every
   * keystroke in the rename field would be undone by the render after it.
   */
  const song = useSong((state) => state.song)
  const {
    updateChannel,
    updateBus,
    update,
    importAudio,
    downloadAudio,
    separate,
    removeChannel,
    addMetronome,
    importing
  } = useSong()

  /*
   * Ids, not channels. Holding a copy would freeze a dialog against a song
   * that keeps changing underneath it — its own edits included, so a
   * controlled input would reset on every keystroke.
   */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [stemsId, setStemsId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const byId = (id: string | null) =>
    id === null || song === null
      ? null
      : (song.channels.find((channel) => channel.id === id) ?? null)

  if (song === null) return null

  const editing = byId(editingId)
  const deleting = byId(deletingId)
  const stemsChannel = byId(stemsId)
  const stems = stemsChannel?.kind === 'audio' ? (stemsChannel as AudioChannel) : null

  return (
    <div className="dock">
      <span className="dock__label">Mix</span>

      <div className="strips">
        {song.channels.map((channel) => (
          <ChannelStrip
            key={channel.id}
            channel={channel}
            busy={importing}
            onChange={(patch) => updateChannel(channel.id, patch)}
            onEdit={() => setEditingId(channel.id)}
            onSplit={() => setStemsId(channel.id)}
            onDelete={() => setDeletingId(channel.id)}
          />
        ))}

        <div className="strip strip--add">
          <StripMenu label="Add a channel" className="strip__add" face="+">
            {(close) => (
              <>
                <StripMenuItem
                  label="Import audio…"
                  disabled={importing}
                  onClick={() => {
                    close()
                    void importAudio()
                  }}
                />
                <StripMenuItem
                  label="Download from a URL…"
                  disabled={importing}
                  onClick={() => {
                    close()
                    setDownloading(true)
                  }}
                />
                <StripMenuItem
                  label="Add a click track"
                  disabled={importing}
                  onClick={() => {
                    close()
                    /* A click track is added in order to line it up, so the
                       tool for lining it up comes with it. */
                    const added = addMetronome()
                    if (added === null) return
                    useAlign.getState().align(added)
                    openTool('align')
                  }}
                />
              </>
            )}
          </StripMenu>
          <span className="strip__add-note">
            {song.channels.length === 0 ? 'Add a channel, or drop a file on the window' : 'Add'}
          </span>
        </div>
      </div>

      <div className="buses">
        {BUSES.map((bus) => (
          <div key={bus.id} className="bus">
            <span className="bus__name">{bus.label}</span>
            <Fader
              label={`${bus.label} level`}
              value={gainToFader(song.buses[bus.id])}
              readout={gainToDb(song.buses[bus.id])}
              onChange={(position) => updateBus(bus.id, faderToGain(position))}
              capColor={bus.color}
              height={62}
            />
            <span className="bus__db">{gainToDb(song.buses[bus.id])}</span>
          </div>
        ))}
      </div>

      {editing === null ? null : (
        <ChannelEditor
          channel={editing}
          onDone={() => setEditingId(null)}
          onChange={(patch) =>
            update({
              channels: song.channels.map((entry) =>
                entry.id === editing.id ? ({ ...entry, ...patch } as Channel) : entry
              )
            })
          }
        />
      )}

      {stems === null ? null : (
        <StemsDialog
          busy={importing}
          onDismiss={() => setStemsId(null)}
          onSeparate={(model: DemucsModel, chosen, muteSource) => {
            setStemsId(null)
            void separate({ channelId: stems.id, model, stems: chosen, muteSource })
          }}
        />
      )}

      {!downloading ? null : (
        <DownloadDialog
          busy={importing}
          onDismiss={() => setDownloading(false)}
          onDownload={(url) => {
            setDownloading(false)
            void downloadAudio(url)
          }}
        />
      )}

      {deleting === null ? null : (
        <Modal
          title={`Delete "${deleting.name}"?`}
          {...(deleting.kind === 'audio'
            ? { subtitle: 'Its audio and waveform are removed from the song folder.' }
            : {})}
          onDismiss={() => setDeletingId(null)}
          footer={
            <>
              <Button onClick={() => setDeletingId(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  void removeChannel(deleting.id)
                  setDeletingId(null)
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p className="modal__note">This cannot be undone.</p>
        </Modal>
      )}
    </div>
  )
}

function ChannelStrip({
  channel,
  busy,
  onChange,
  onEdit,
  onSplit,
  onDelete
}: {
  channel: Channel
  busy: boolean
  onChange: (patch: MixerPatch) => void
  onEdit: () => void
  onSplit: () => void
  onDelete: () => void
}) {
  const color = CHANNEL_SUBJECT_COLOR[channel.subject]
  /* Solo is a per-part decision; there is nothing to solo a click against. */
  const soloable = channel.kind !== 'metronome'

  return (
    <div className="strip">
      <div className="strip__name">
        <span className="strip__name-icon" style={{ color }}>
          <SubjectIcon subject={channel.subject} size={20} />
        </span>
        <span className="strip__name-text">{channel.name}</span>
      </div>

      <Fader
        label={`${channel.name} level`}
        value={gainToFader(channel.gain)}
        readout={gainToDb(channel.gain)}
        onChange={(position) => onChange({ gain: faderToGain(position) })}
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
        <StripMenu label={`${channel.name} actions`} className="ms-btn strip__more" face="⋯">
          {(close) => (
            <>
              <StripMenuItem
                label="Edit…"
                onClick={() => {
                  close()
                  onEdit()
                }}
              />
              <StripMenuItem
                label="Split into stems…"
                disabled={busy || channel.kind !== 'audio'}
                onClick={() => {
                  close()
                  onSplit()
                }}
              />
              <StripMenuItem
                label="Delete channel…"
                onClick={() => {
                  close()
                  onDelete()
                }}
              />
            </>
          )}
        </StripMenu>
      </div>
    </div>
  )
}
