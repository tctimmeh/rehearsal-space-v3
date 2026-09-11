import { useEffect, useState } from 'react'

import { faderToGain, gainToDb, gainToFader } from '@core/mix/fader'
import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import type { AudioChannel, Channel } from '@core/song/song'
import type { DemucsModel } from '@shared/stems'
import { useWaveformEdit } from '@renderer/state/waveformEdit'
import { useSong, type MixerPatch } from '@renderer/state/song'
import { openTool } from '@renderer/state/toolActions'
import { useToolNamed, useToolStatus } from '@renderer/state/toolStatus'
import { ChannelEditor } from '../channels/ChannelEditor'
import { DemucsInstallDialog } from '../channels/DemucsInstallDialog'
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
    splitting,
    arriving
  } = useSong()

  /*
   * Ids, not channels. Holding a copy would freeze a dialog against a song
   * that keeps changing underneath it — its own edits included, so a
   * controlled input would reset on every keystroke.
   */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [stemsId, setStemsId] = useState<string | null>(null)
  /* Separating needs demucs, which is the one tool the app does not fetch
     unasked. Knowing whether it is there decides which dialog this is. */
  const demucs = useToolNamed('demucs')
  const installDemucs = useToolStatus((state) => state.install)
  const watchTools = useToolStatus((state) => state.watch)
  useEffect(() => watchTools(), [watchTools])
  const [downloading, setDownloading] = useState(false)
  /* Trimming a take or lining up a click, both opened from the channel they
     act on. Beginning one while another is open asks about that one first. */
  const beginEdit = useWaveformEdit((state) => state.begin)

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

      <div className="strips" onWheel={scrollAlong}>
        {song.channels.map((channel) => (
          <ChannelStrip
            key={channel.id}
            channel={channel}
            splitting={splitting.includes(channel.id)}
            elsewhere={splitting.length > 0}
            onChange={(patch) => updateChannel(channel.id, patch)}
            onEdit={() => setEditingId(channel.id)}
            onSplit={() => setStemsId(channel.id)}
            onTrim={() => beginEdit('trim', channel)}
            onAlign={() => beginEdit('click', channel)}
            onDelete={() => setDeletingId(channel.id)}
          />
        ))}

        {arriving.map((name) => (
          <ArrivingStrip key={name} name={name} />
        ))}

        <div className="strip strip--add">
          <StripMenu label="Add a channel" className="strip__add" face="+">
            {(close) => (
              <>
                <StripMenuItem
                  label="Import audio…"
                  onClick={() => {
                    close()
                    void importAudio()
                  }}
                />
                <StripMenuItem
                  label="Download from a URL…"
                  onClick={() => {
                    close()
                    setDownloading(true)
                  }}
                />
                <StripMenuItem
                  label="Add a click track"
                  onClick={() => {
                    close()
                    /* A click track is added in order to line it up, so the
                       tool for lining it up comes with it. */
                    const added = addMetronome()
                    if (added === null) return
                    const click = useSong.getState().song?.channels.find((c) => c.id === added)
                    if (click !== undefined) useWaveformEdit.getState().begin('click', click)
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

      {stems === null || demucs.found || !demucs.known ? null : (
        <DemucsInstallDialog
          whyNot={demucs.whyNot}
          installing={demucs.installing}
          onDismiss={() => setStemsId(null)}
          onInstall={() => {
            setStemsId(null)
            void installDemucs('demucs')
          }}
        />
      )}

      {stems === null || !demucs.found ? null : (
        <StemsDialog
          busy={splitting.length > 0}
          onDismiss={() => setStemsId(null)}
          onSeparate={(model: DemucsModel, chosen, muteSource) => {
            setStemsId(null)
            void separate({ channelId: stems.id, model, stems: chosen, muteSource })
          }}
        />
      )}

      {!downloading ? null : (
        <DownloadDialog
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
  splitting,
  elsewhere,
  onChange,
  onEdit,
  onSplit,
  onTrim,
  onAlign,
  onDelete
}: {
  channel: Channel
  /** demucs is reading this channel's file right now. */
  splitting: boolean
  /** It is reading some other channel's, which is enough to be going on with. */
  elsewhere: boolean
  onChange: (patch: MixerPatch) => void
  onEdit: () => void
  onSplit: () => void
  onTrim: () => void
  onAlign: () => void
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
              {channel.kind === 'audio' ? (
                <>
                  {/* One separation at a time: demucs takes every core and a
                      couple of gigabytes, and two of them race each other to a
                      standstill. Everything else here is the song's own file
                      and is free to happen alongside. */}
                  <StripMenuItem
                    label="Split into stems…"
                    disabled={elsewhere}
                    onClick={() => {
                      close()
                      onSplit()
                    }}
                  />
                  <StripMenuItem
                    label="Trim and place…"
                    onClick={() => {
                      close()
                      onTrim()
                    }}
                  />
                </>
              ) : (
                <StripMenuItem
                  label="Align Click…"
                  onClick={() => {
                    close()
                    onAlign()
                  }}
                />
              )}
              {/* Deleting takes the audio file with it, and a separation
                  running on this channel is reading that file. */}
              <StripMenuItem
                label="Delete channel…"
                disabled={splitting}
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

/**
 * A take that has stopped but is not a channel yet.
 *
 * It stands where the channel will stand, under the name it will have, so what
 * was just played is somewhere from the moment the player stops rather than
 * nowhere for a second or two. There is nothing to mix on it and nothing to
 * press: the fader's place is held by something that says only that it is on
 * its way.
 */
function ArrivingStrip({ name }: { name: string }) {
  return (
    <div className="strip strip--arriving">
      <div className="strip__name">
        <span className="strip__name-icon" style={{ color: CHANNEL_SUBJECT_COLOR.other }}>
          <SubjectIcon subject="other" size={20} />
        </span>
        <span className="strip__name-text">{name}</span>
      </div>

      <div className="strip__arriving" role="status" aria-label={`${name} is being kept`}>
        <i />
      </div>
      <span className="strip__arriving-note">Keeping…</span>
    </div>
  )
}

/** A wheel notch reported as lines rather than pixels, in pixels. */
const A_LINE = 16

/**
 * Sends the wheel along the row of strips.
 *
 * A mouse wheel gives its notches as `deltaY`, and there is nothing above or
 * below the mixer to spend them on — the strips run sideways. A notch is about
 * a hundred pixels, which is about one strip, so this lands where you would
 * expect without a speed to tune.
 *
 * A trackpad swiped sideways already arrives as `deltaX` and is scrolled by
 * the browser; adding it again here would move twice as far as the finger.
 */
function scrollAlong(event: React.WheelEvent<HTMLElement>): void {
  if (event.deltaX !== 0) return
  const notch = event.deltaMode === 1 ? event.deltaY * A_LINE : event.deltaY
  event.currentTarget.scrollLeft += notch
}
