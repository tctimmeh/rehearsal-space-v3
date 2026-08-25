import { create } from 'zustand'

import { placeTake, trimHead } from '@core/audio/take'
import { songBounds } from '@core/song/bounds'
import { newMetronomeChannel, summarise } from '@core/song/song'
import type { Channel, ChannelBase, Song, SongSummary } from '@core/song/song'
import type { SeparateRequest } from '@shared/stems'
import { TOOL_META, type ToolId } from '@core/tools'
import { ALL_INPUTS, pickInput } from '@core/audio/inputChannels'
import { encodeWav } from '@core/audio/wav'
import { audioEngine } from '@renderer/audio/engine'
import { useConfig } from './config'
import { Recorder } from '@renderer/audio/recorder'
import { useTools } from './tools'
import { useTransport } from './transport'

interface SongState {
  songs: SongSummary[]
  song: Song | null
  /** Set when a song on disk cannot be read, so the library can say so. */
  error: string | null

  refresh: () => Promise<void>
  create: () => Promise<void>
  load: (id: string) => Promise<void>
  unload: () => Promise<void>
  remove: (id: string) => Promise<void>
  /** Applies a change immediately and saves it shortly after. */
  update: (patch: Partial<Song>) => void
  updateChannel: (id: string, patch: MixerPatch) => void
  updateBus: (bus: 'music' | 'click', gain: number) => void
  /** Imports files as new channels. Empty `paths` opens a file picker. */
  importAudio: (paths?: string[]) => Promise<void>
  removeChannel: (channelId: string) => Promise<void>
  downloadAudio: (url: string) => Promise<void>
  addMetronome: () => void
  /** True from pressing record until the take has been converted. */
  /** Opens the input and holds it, ready for a take to start instantly. */
  armRecording: () => Promise<void>
  disarmRecording: () => void
  beginTake: () => void
  finishTake: () => Promise<void>
  separate: (request: SeparateRequest) => Promise<void>
  /** True while any of importing, downloading or separating is under way. */
  importing: boolean
  /** How far through decoding a song's channels we are, while that is happening. */
  loading: { decoded: number; total: number } | null
  /** Puts the timeline back to the length of the song's own channels. */
  refreshBounds: () => void
  /** Writes any pending change now. */
  flush: () => Promise<void>
  dismissError: () => void
}

/** The parts of a channel the mixer can change, common to both channel kinds. */
export type MixerPatch = Partial<Pick<ChannelBase, 'name' | 'subject' | 'gain' | 'muted' | 'soloed'>>

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * A fader drag produces a change per pixel, and saving renames directories and
 * writes files, so edits are coalesced rather than written as they arrive.
 */
const SAVE_DELAY_MS = 400

const recorder = new Recorder()

const takeName = (song: Song): string => {
  const takes = song.channels.filter((channel) => channel.name.startsWith('Take ')).length
  return `Take ${takes + 1}`
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let unsaved = false
let saving: Promise<void> | null = null
/** Bumped whenever a different song becomes the loaded one. */
let generation = 0

function cancelPendingSave(): void {
  if (saveTimer !== null) clearTimeout(saveTimer)
  saveTimer = null
  unsaved = false
}

export const useSong = create<SongState>((set, get) => ({
  songs: [],
  song: null,
  error: null,
  importing: false,
  loading: null,

  dismissError: () => set({ error: null }),

  refreshBounds: () => {
    const song = get().song
    if (song !== null) applyBounds(song)
  },

  refresh: async () => {
    set({ songs: await window.rehearsal.library.list() })
  },

  create: async () => {
    await get().flush()
    const song = await window.rehearsal.library.create()
    await get().refresh()
    await get().load(song.id)
  },

  load: async (id) => {
    /* Loading a song unloads the current one, stopping playback if necessary. */
    await get().flush()
    generation += 1
    useTransport.getState().stop()

    /* Announced before the song has even been read, so pressing play in the
       meantime waits for it rather than running the clock over silence. */
    const loaded = audioEngine.beginLoad()
    set({ loading: { decoded: 0, total: 0 } })
    try {
      const song = await window.rehearsal.library.load(id)
      set({ song, error: null })
      applySongState(song)
      await loadIntoEngine(song, (decoded, total) => set({ loading: { decoded, total } }))
      await window.rehearsal.library.rememberLastSong(song.id)
    } catch (error) {
      set({ song: null, error: message(error) })
    } finally {
      set({ loading: null })
      loaded()
    }
  },

  unload: async () => {
    await get().flush()
    generation += 1
    useTransport.getState().stop()
    set({ song: null })
    await window.rehearsal.library.rememberLastSong(null)
  },

  remove: async (id) => {
    const wasLoaded = get().song?.id === id
    /* Writing a song we are about to delete would recreate its directory. */
    if (wasLoaded) cancelPendingSave()
    await window.rehearsal.library.remove(id)
    if (wasLoaded) {
      generation += 1
      useTransport.getState().stop()
      set({ song: null })
      await window.rehearsal.library.rememberLastSong(null)
    }
    await get().refresh()
  },

  update: (patch) => {
    const current = get().song
    if (current === null) return
    const song = { ...current, ...patch }
    set({ song })
    /* Adding, removing or moving a channel changes where the song begins and ends. */
    if (patch.channels !== undefined) applyBounds(song)
    audioEngine.applyMix(song)
    unsaved = true
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void get().flush()
    }, SAVE_DELAY_MS)
  },

  updateChannel: (id, patch) => {
    const song = get().song
    if (song === null) return
    get().update({
      channels: song.channels.map((channel) =>
        channel.id === id ? ({ ...channel, ...patch } as Channel) : channel
      )
    })
  },

  updateBus: (bus, gain) => {
    const song = get().song
    if (song === null) return
    get().update({ buses: { ...song.buses, [bus]: gain } })
  },

  importAudio: async (paths) => {
    await runAdding(set, get, (song) =>
      paths === undefined || paths.length === 0
        ? window.rehearsal.library.chooseAudio(song.id)
        : window.rehearsal.library.importAudio(song.id, paths)
    )
  },

  addMetronome: () => {
    const song = get().song
    if (song === null) return
    const taken = new Set(song.channels.map((channel) => channel.id))
    let id = 'click'
    for (let n = 2; taken.has(id); n += 1) id = `click-${n}`
    /* Ends where the music starts, which is where a count-in belongs. */
    get().update({ channels: [...song.channels, newMetronomeChannel(id, 0)] })
  },

  armRecording: async () => {
    if (get().song === null) return
    try {
      await recorder.open(audioEngine.audioContext, useConfig.getState().config?.inputDeviceId)
      set({ error: null })
    } catch (error) {
      set({ error: `Could not open the input: ${message(error)}` })
      throw error
    }
  },

  disarmRecording: () => {
    recorder.close()
  },

  beginTake: () => {
    recorder.beginTake((contextTime) => audioEngine.songTimeAt(contextTime))
  },

  finishTake: async () => {
    const take = recorder.endTake()
    if (take === null) {
      set({ error: 'The recording captured nothing.' })
      return
    }

    const transport = useTransport.getState()
    const { startTime, trimSeconds } = placeTake({
      songTimeAtFirstSample: take.songTimeAtFirstSample,
      audibleDelay: audioEngine.audibleDelay,
      inputLatency: take.inputLatency,
      speed: transport.speed,
      earliest: transport.start
    })

    /* Only the socket the instrument is in, so a two-input interface does not
       produce a take with the guitar on one side and the room on the other. */
    const kept = trimHead(
      pickInput(take.channels, useConfig.getState().config?.inputChannel ?? ALL_INPUTS),
      trimSeconds,
      take.sampleRate
    )
    if ((kept[0]?.length ?? 0) === 0) {
      set({ error: 'The recording captured nothing.' })
      return
    }

    const wav = encodeWav(kept, take.sampleRate)
    await runAdding(set, get, (song) =>
      window.rehearsal.library.addRecording(song.id, wav, startTime, takeName(song))
    )
  },

  downloadAudio: async (url) => {
    await runAdding(set, get, (song) => window.rehearsal.library.downloadAudio(song.id, url))
  },

  separate: async (request) => {
    await runAdding(set, get, (song) => window.rehearsal.library.separate(song.id, request))
  },

  removeChannel: async (channelId) => {
    const song = get().song
    if (song === null) return
    await get().flush()
    try {
      adoptChannels(set, get, await window.rehearsal.library.removeChannel(song.id, channelId))
    } catch (error) {
      set({ error: message(error) })
    }
    await get().refresh()
  },

  flush: async () => {
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = null
    /* Loop because an edit made while a write was in flight leaves more to do. */
    while (unsaved || saving !== null) {
      saving ??= writeUntilQuiet(get, set).finally(() => {
        saving = null
      })
      await saving
    }
  }
}))

/**
 * Everything that adds channels goes the same way: settle anything unsaved
 * first, since the song on disk is about to change underneath us, then take
 * the channel list back from whatever main wrote.
 */
async function runAdding(
  set: (partial: Partial<SongState>) => void,
  get: () => SongState,
  work: (song: Song) => Promise<Song | null>
): Promise<void> {
  const song = get().song
  if (song === null) return
  await get().flush()

  set({ importing: true, error: null })
  try {
    const updated = await work(song)
    if (updated !== null) adoptChannels(set, get, updated)
  } catch (error) {
    set({ error: message(error) })
  } finally {
    set({ importing: false })
  }
  await get().refresh()
}

/**
 * Main owns the channel list while an import is running — it writes the file
 * itself — but the user may have been editing the title all the while, so only
 * the channels are taken from what comes back.
 */
function adoptChannels(
  set: (partial: Partial<SongState>) => void,
  get: () => SongState,
  updated: Song
): void {
  const current = get().song
  if (current === null || current.id !== updated.id) return
  const song = { ...current, channels: updated.channels }
  set({ song })
  applyBounds(song)
  void loadIntoEngine(song)
}

/** Decodes whatever the song now refers to, and applies the mix to it. */
async function loadIntoEngine(
  song: Song,
  onProgress?: (decoded: number, total: number) => void
): Promise<void> {
  try {
    await audioEngine.load(
      song,
      (file) => window.rehearsal.library.readAudio(song.id, file),
      onProgress
    )
  } catch (error) {
    useSong.setState({ error: message(error) })
  }
}

/**
 * Writes the loaded song, then writes it again if it changed while we were
 * waiting. Only one write is ever in flight: a second one built from
 * pre-rename state would ask the main process to rename a directory that no
 * longer exists.
 */
async function writeUntilQuiet(
  get: () => SongState,
  set: (partial: Partial<SongState>) => void
): Promise<void> {
  while (unsaved) {
    const song = get().song
    if (song === null) {
      unsaved = false
      return
    }

    unsaved = false
    const wrote = generation

    let saved: Song
    try {
      saved = await window.rehearsal.library.save(song)
    } catch (error) {
      /* Say so rather than dropping the edit silently. Retrying immediately
         would spin against whatever is wrong on disk. */
      set({ error: message(error) })
      return
    }
    if (wrote !== generation) return

    /*
     * Take only what the main process decides — the directory name it settled
     * on, and the timestamp. Everything else belongs to the user, who may have
     * typed another character while this was in flight.
     */
    const current = get().song
    if (current === null) return
    const adopted = { ...current, id: saved.id, updatedAt: saved.updatedAt }
    set({ song: adopted, error: null })

    if (saved.id !== song.id) {
      /* The directory was renamed, so the whole list is keyed differently. */
      await get().refresh()
    } else {
      restateSummary(set, get, adopted)
    }
  }
}

/**
 * Keeps the library's row for a song in step with the song itself. Only a title
 * that changes the directory name used to prompt this, so re-crediting a song —
 * which changes no filename at all — left the library still showing "No artist"
 * while the header showed otherwise.
 */
function restateSummary(
  set: (partial: Partial<SongState>) => void,
  get: () => SongState,
  song: Song
): void {
  const { songs } = get()
  const existing = songs.find((entry) => entry.id === song.id)
  if (existing === undefined) return
  /* Lyrics are a file on disk, which saving the song says nothing about. */
  set({ songs: songs.map((entry) => (entry.id === song.id ? summarise(song, existing.hasLyrics) : entry)) })
}

/** Song-scoped state that lives outside the song store: transport and tools. */
function applySongState(song: Song): void {
  const transport = useTransport.getState()
  transport.setSemitones(song.playback.pitch.semitones)
  transport.setCents(song.playback.pitch.cents)
  transport.setSpeed(song.playback.speed)
  applyBounds(song)

  const songScoped = (id: ToolId) => TOOL_META[id].scope === 'song'
  useTools.getState().setOpenScoped(songScoped, song.openTools)
}

/**
 * Seeking tears down and rebuilds every source node, so it must happen for
 * seeking and nothing else. Moving a fader arrives here as a channel change
 * like any other, and used to seek to the position the UI last drew — which is
 * behind the audio clock, so playback was dragged backwards on every pixel of
 * the drag.
 */
function applyBounds(song: Song): void {
  const transport = useTransport.getState()
  const [start, end] = songBounds(song)

  /* While a take is running the song reaches wherever the playhead has got to.
     Saving an unrelated edit mid-take must not shorten the timeline under it,
     and must never drag the playhead back to where the channels happen to
     stop — the whole point is to be recording past that. */
  const openEnded = audioEngine.isOpenEnded
  const reach = openEnded ? Math.max(end, transport.end) : end
  if (start === transport.start && reach === transport.end) return

  transport.setBounds(start, reach)
  if (openEnded) return

  /* Only move the playhead if the song no longer reaches it. */
  const position = audioEngine.position
  const clamped = Math.min(end, Math.max(start, position))
  if (clamped !== position) transport.seek(clamped)
}

