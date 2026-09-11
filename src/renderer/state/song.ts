import { create } from 'zustand'

import { placeTake, takeCorrection, trimHead } from '@core/audio/take'
import { songBounds } from '@core/song/bounds'
import { newMetronomeChannel, summarise } from '@core/song/song'
import type { Channel, ChannelBase, PitchOffset, Song, SongSummary } from '@core/song/song'
import type { SeparateRequest } from '@shared/stems'
import { TOOL_META, type ToolId } from '@core/tools'
import { ALL_INPUTS, inputsWorthKeeping, pickInput } from '@core/audio/inputChannels'
import { encodeWav } from '@core/audio/wav'
import { audioEngine } from '@renderer/audio/engine'
import { useConfig } from './config'
import { Recorder } from '@renderer/audio/recorder'
import { renderTake } from '@renderer/audio/renderTake'
import { useTools } from './tools'
import { useJobs } from './jobs'
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
  /** Adds a click track and says which one it added. */
  addMetronome: () => string | null
  /** True from pressing record until the take has been converted. */
  /** Opens the input and holds it, ready for a take to start instantly. */
  armRecording: () => Promise<void>
  disarmRecording: () => void
  beginTake: () => void
  finishTake: () => Promise<void>
  /** Ends a take without keeping any of it. */
  discardTake: () => void
  separate: (request: SeparateRequest) => Promise<void>
  /** True while any of importing, downloading or separating is under way. */
  importing: boolean
  /** How far through decoding a song's channels we are, while that is happening. */
  loading: { decoded: number; total: number } | null
  /** Adds or removes a tag on any song in the library, loaded or not. */
  tagSong: (songId: string, tags: string[]) => Promise<void>
  /**
   * Says whether a song's lyrics file now has anything in it.
   *
   * The library reads that off the disk when it lists the songs, and nothing
   * about saving a song says a word about it, so writing lyrics has to tell it.
   */
  noteLyrics: (songId: string, written: boolean) => void
  /** Puts the timeline back to the length of the song's own channels. */
  refreshBounds: () => void
  /** Writes any pending change now. */
  flush: () => Promise<void>
  /**
   * A channel being changed on trial, and what the file is to keep meanwhile.
   *
   * Trimming a take and lining up a click are tried out before they are
   * agreed to: the song holds the change so it can be heard and seen, and the
   * file keeps what was there until somebody says otherwise. Quitting, or
   * crashing, therefore leaves the channel as it was rather than as it was
   * being experimented with.
   */
  unwritten: { channelId: string; before: Channel } | null
  keepUnwritten: (trial: { channelId: string; before: Channel } | null) => void
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

/** One at a time, and only ever the one, so it needs no more of a name. */
const KEEPING_THE_TAKE = 'keeping-the-take'

/**
 * Waits for the browser to have drawn what was just asked for.
 *
 * A frame, not a microtask: work started in the same turn as a state change
 * runs before anything is painted, so the message it was meant to put up
 * appears only once the work it was announcing has finished.
 */
const painted = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

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
  unwritten: null,

  dismissError: () => set({ error: null }),

  noteLyrics: (songId, written) =>
    set({
      songs: get().songs.map((entry) =>
        entry.id === songId && entry.hasLyrics !== written
          ? { ...entry, hasLyrics: written }
          : entry
      )
    }),

  tagSong: async (songId, tags) => {
    const loaded = get().song
    /* The song being tagged is usually not the one that is open, so this goes
       through the file rather than through the loaded song. */
    if (loaded !== null && loaded.id === songId) {
      get().update({ tags })
      return
    }
    try {
      const song = await window.rehearsal.library.load(songId)
      await window.rehearsal.library.save({ ...song, tags })
      await get().refresh()
    } catch (error) {
      set({ error: `Could not save the tags: ${message(error)}` })
    }
  },

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
    if (patch.loop !== undefined) useTransport.getState().setLoop(song.loop)
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
    if (song === null) return null
    const taken = new Set(song.channels.map((channel) => channel.id))
    let id = 'click'
    for (let n = 2; taken.has(id); n += 1) id = `click-${n}`
    /* Ends where the music starts, which is where a count-in belongs. */
    get().update({ channels: [...song.channels, newMetronomeChannel(id, 0)] })
    return id
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

  discardTake: () => {
    recorder.dropTake()
  },

  finishTake: async () => {
    /*
     * Said before any of the work is done, and painted before any of it runs.
     *
     * Turning a take into a file is a second or two of this window's own time
     * — gathering the blocks, taking back the tempo and pitch it was played
     * against, writing a wav — and then main has to write that out and probe
     * it before its own importing job appears. Nothing was on screen for any
     * of that, which after a long recording reads as the take having been
     * lost. A state change that is never painted is not feedback, so this
     * waits for a frame before the work begins.
     */
    useJobs.getState().startWork({
      id: KEEPING_THE_TAKE,
      title: 'Keeping the take',
      detail: 'Writing down what you just played'
    })
    await painted()

    try {
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

      const captured = trimHead(
        pickInput(take.channels, useConfig.getState().config?.inputChannel ?? ALL_INPUTS),
        trimSeconds,
        take.sampleRate
      )
      if ((captured[0]?.length ?? 0) === 0) {
        set({ error: 'The recording captured nothing.' })
        return
      }

      const played = await asTheSongWillPlayIt(
        captured,
        take.sampleRate,
        {
          pitch: { semitones: transport.semitones, cents: transport.cents },
          speed: transport.speed
        },
        set
      )

      /*
       * A socket each, and each one mono.
       *
       * Two inputs are two things being played, not the two sides of one: a
       * guitar in the first socket and a voice in the second are not a stereo
       * image of anything, and writing them as one would put the guitar hard
       * left and the voice hard right. So they arrive as separate channels, each
       * centred, to be mixed by the person who played them. Sockets that had
       * nothing in them do not arrive at all.
       */
      const worth = inputsWorthKeeping(captured)
      const name = takeName(get().song as Song)
      const named = (index: number): string =>
        worth.length === 1 ? name : `${name} (input ${index + 1})`

      for (const index of worth) {
        const one = played[index]
        if (one === undefined) continue
        const wav = encodeWav([one], take.sampleRate)
        await runAdding(set, get, (song) =>
          window.rehearsal.library.addRecording(song.id, wav, startTime, named(index))
        )
      }
    } finally {
      useJobs.getState().endWork(KEEPING_THE_TAKE)
    }
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

  keepUnwritten: (trial) => {
    set({ unwritten: trial })
    /* What the file should hold has changed, whichever way this went. */
    unsaved = true
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
 * Takes the song's pitch and tempo back off a take, so what was played against
 * a shifted, hurried song lands in the song's own key and its own time.
 *
 * The take is the one thing in a song that was performed against those knobs
 * rather than written before them, so it is the one thing that arrives already
 * carrying their offset. Left alone it meets them a second time on the way out
 * — shifted twice, and sped up twice. The pitch shows as a channel that only
 * sounds right while the knob stays where it was; the tempo is worse, because
 * a take played against a song at 150% does not merely start in the wrong
 * place, it runs away from the music, further with every bar.
 *
 * A shifter that will not run is not worth a lost performance, so the take is
 * kept as it was played and the user is told what they have.
 */
async function asTheSongWillPlayIt(
  captured: Float32Array[],
  sampleRate: number,
  heardAt: { pitch: PitchOffset; speed: number },
  set: (partial: Partial<SongState>) => void
): Promise<Float32Array[]> {
  const correction = takeCorrection(heardAt)
  if (correction.semitones === 0 && correction.rate === 1) return captured

  set({ importing: true })
  try {
    return await renderTake(captured, sampleRate, correction)
  } catch (error) {
    set({ error: `The take was kept as it was played: ${message(error)}` })
    return captured
  } finally {
    set({ importing: false })
  }
}

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
  /* A channel on trial keeps what is being tried: main was handed the file's
     own copy of it, and taking that back would undo the work in progress. */
  const trial = get().unwritten
  const onTrial = current.channels.find((one) => one.id === trial?.channelId) ?? null
  const channels = updated.channels.map((one) =>
    onTrial !== null && one.id === onTrial.id ? onTrial : one
  )
  const song = { ...current, channels }
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
 * The song as the file is to hold it.
 *
 * Everything goes to disk through here, so a channel on trial is put back to
 * what it was in the one place that matters, whatever asked for the write — the
 * timer, an import settling first, or the app being closed.
 */
function asFiled(song: Song, trial: SongState['unwritten']): Song {
  if (trial === null) return song
  return {
    ...song,
    channels: song.channels.map((one) => (one.id === trial.channelId ? trial.before : one))
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
      saved = await window.rehearsal.library.save(asFiled(song, get().unwritten))
    } catch (error) {
      /* Say so rather than dropping the edit silently. Retrying immediately
         would spin against whatever is wrong on disk. */
      set({ error: message(error) })
      return
    }
    if (wrote !== generation) return

    /*
     * Take only what the main process decides — the directory it settled on,
     * the timestamp, and where each channel's audio now lies, since renaming a
     * channel renames its file. Everything else belongs to the user, who may
     * have typed another character or moved a fader while this was in flight.
     *
     * The file has to come back: left behind, the next save would ask for a
     * rename from a name that is no longer there and then write that name
     * into the song, which is a channel pointing at nothing.
     */
    const current = get().song
    if (current === null) return
    const adopted = {
      ...current,
      id: saved.id,
      updatedAt: saved.updatedAt,
      channels: current.channels.map((channel) => {
        const written = saved.channels.find((one) => one.id === channel.id)
        if (channel.kind !== 'audio' || written?.kind !== 'audio') return channel
        return written.file === channel.file ? channel : { ...channel, file: written.file }
      })
    }
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
  /* A region comes with the song; looping it is something you start. */
  transport.setLooping(false)
  transport.setLoop(song.loop)

  /* At its own beginning, which is not where the last song began. Stopping put
     the playhead at the start of the song being left, and a song with a longer
     count-in than that one starts behind it — so pressing play would come in
     partway through the count. Read afresh, because the bounds have just
     moved under the copy taken above. */
  const arrived = useTransport.getState()
  arrived.seek(arrived.start)

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

