import { create } from 'zustand'

import type { Channel, ChannelBase, Song, SongSummary } from '@core/song/song'
import { TOOL_META, type ToolId } from '@core/tools'
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
  /** Writes any pending change now. */
  flush: () => Promise<void>
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
    try {
      const song = await window.rehearsal.library.load(id)
      set({ song, error: null })
      applySongState(song)
      await window.rehearsal.library.rememberLastSong(song.id)
    } catch (error) {
      set({ song: null, error: message(error) })
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
    set({ song: { ...current, ...patch } })
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
    set({ song: { ...current, id: saved.id, updatedAt: saved.updatedAt }, error: null })
    if (saved.id !== song.id) await get().refresh()
  }
}

/** Song-scoped state that lives outside the song store: transport and tools. */
function applySongState(song: Song): void {
  const transport = useTransport.getState()
  transport.setSpeed(song.playback.speed)
  transport.setSemitones(song.playback.pitch.semitones)
  transport.setCents(song.playback.pitch.cents)
  transport.setBounds(...songBounds(song))

  const songScoped = (id: ToolId) => TOOL_META[id].scope === 'song'
  useTools.getState().setOpenScoped(songScoped, song.openTools)
}

/**
 * The timeline runs from the earliest channel start — negative when a count-in
 * exists — to the last moment any channel is still playing.
 */
export function songBounds(song: Song): [start: number, end: number] {
  let start = 0
  let end = 0
  for (const channel of song.channels) {
    if (channel.kind === 'audio') {
      start = Math.min(start, channel.startTime)
      end = Math.max(end, channel.startTime + channel.duration)
    } else {
      end = Math.max(end, channel.endTime)
    }
  }
  return [start, end]
}
