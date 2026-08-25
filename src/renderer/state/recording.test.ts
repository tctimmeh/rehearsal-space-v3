import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const song = vi.hoisted(() => ({
  armRecording: vi.fn(async () => undefined),
  disarmRecording: vi.fn(),
  beginTake: vi.fn(),
  finishTake: vi.fn(async () => undefined),
  refreshBounds: vi.fn()
}))

const engine = vi.hoisted(() => ({
  openEnded: false,
  /* Resolves true the way the engine does once sound is actually running. */
  play: vi.fn(async () => true),
  pause: vi.fn(),
  stop: vi.fn(),
  seek: vi.fn(),
  setBounds: vi.fn(),
  setSpeed: vi.fn(),
  setPitch: vi.fn(),
  whenEnded: vi.fn(),
  setOpenEnded: vi.fn((open: boolean) => {
    engine.openEnded = open
  }),
  get isOpenEnded() {
    return engine.openEnded
  },
  position: 0
}))

vi.mock('@renderer/audio/engine', () => ({ audioEngine: engine }))
vi.mock('@renderer/state/song', () => ({
  useSong: Object.assign(() => song, { getState: () => song })
}))

const { useRecording, followTransportForRecording } = await import('./recording')
const { useTransport } = await import('./transport')

/** The machine turns on promises, so let them run before looking. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

let unwire = () => undefined as void

beforeEach(() => {
  unwire = followTransportForRecording()
  useRecording.setState({ phase: 'off' })
  useTransport.setState({ playing: false, position: 0, start: 0, end: 120, speed: 1 })
  engine.openEnded = false
})

afterEach(() => {
  unwire()
  vi.clearAllMocks()
})

const arm = async () => {
  useRecording.getState().toggle()
  await settle()
}

/**
 * The complaint this exists to answer: pressing record and then play captured
 * the gap between the two, so a vocal sung over a guitar sat seconds late and
 * every layer drifted further.
 */
describe('arming', () => {
  it('opens the input without capturing anything', async () => {
    await arm()

    expect(useRecording.getState().phase).toBe('armed')
    expect(song.armRecording).toHaveBeenCalled()
    expect(song.beginTake).not.toHaveBeenCalled()
  })

  it('starts the take when the player is engaged, and not before', async () => {
    await arm()
    expect(song.beginTake).not.toHaveBeenCalled()

    useTransport.getState().play()
    await settle()

    expect(song.beginTake).toHaveBeenCalledTimes(1)
    expect(useRecording.getState().phase).toBe('recording')
  })

  it('starts straight away when armed over a song already playing', async () => {
    useTransport.getState().play()
    await arm()

    expect(useRecording.getState().phase).toBe('recording')
    expect(song.beginTake).toHaveBeenCalledTimes(1)
  })

  it('lets the input go again when disarmed without recording', async () => {
    await arm()
    useRecording.getState().toggle()
    await settle()

    expect(useRecording.getState().phase).toBe('off')
    expect(song.disarmRecording).toHaveBeenCalled()
    expect(song.finishTake).not.toHaveBeenCalled()
  })
})

describe('finishing', () => {
  const record = async () => {
    await arm()
    useTransport.getState().play()
    await settle()
  }

  it('stops the player, the take and the arming together', async () => {
    await record()

    useTransport.getState().stop()
    await settle()

    expect(song.finishTake).toHaveBeenCalledTimes(1)
    expect(useRecording.getState().phase).toBe('off')
    expect(song.disarmRecording).toHaveBeenCalled()
  })

  it('punches out on pause and stays ready for another take', async () => {
    await record()

    useTransport.getState().pause()
    await settle()

    expect(song.finishTake).toHaveBeenCalledTimes(1)
    expect(useRecording.getState().phase).toBe('armed')
    expect(song.disarmRecording).not.toHaveBeenCalled()

    useTransport.getState().play()
    await settle()
    expect(song.beginTake).toHaveBeenCalledTimes(2)
  })

  it('punches out from the button without stopping the player', async () => {
    await record()

    useRecording.getState().toggle()
    await settle()

    expect(song.finishTake).toHaveBeenCalledTimes(1)
    expect(useTransport.getState().playing).toBe(true)
    expect(useRecording.getState().phase).toBe('off')
  })
})

/**
 * Recording the first channel of a new song means playing past an end that has
 * not been written yet — otherwise the playhead stops dead at 00:00.
 */
describe('the timeline', () => {
  it('opens as soon as recording is armed', async () => {
    await arm()
    expect(engine.setOpenEnded).toHaveBeenLastCalledWith(true)
  })

  it('closes again once the take has been kept', async () => {
    await arm()
    useTransport.getState().play()
    await settle()
    useTransport.getState().stop()
    await settle()

    expect(engine.setOpenEnded).toHaveBeenLastCalledWith(false)
    expect(song.refreshBounds).toHaveBeenCalled()
  })

  it('stays open between takes while still armed', async () => {
    await arm()
    useTransport.getState().play()
    await settle()
    useTransport.getState().pause()
    await settle()

    expect(engine.isOpenEnded).toBe(true)
  })
})

describe('when the input will not open', () => {
  it('does not sit there armed over a device it never got', async () => {
    song.armRecording.mockRejectedValueOnce(new Error('NotAllowedError'))

    await arm()

    expect(useRecording.getState().phase).toBe('off')
    expect(engine.isOpenEnded).toBe(false)
  })
})

/**
 * The first play of a session waits for a WASM module to load. A take that
 * begins when the button was pressed rather than when sound started would
 * record that wait as silence at its head — the original complaint, smaller.
 */
describe('when the engine takes a moment to start', () => {
  it('waits for sound before beginning the take', async () => {
    let release = (_started: boolean) => undefined as void
    engine.play.mockReturnValueOnce(new Promise<boolean>((resolve) => (release = resolve)))
    await arm()

    useTransport.getState().play()
    await settle()
    expect(song.beginTake).not.toHaveBeenCalled()

    release(true)
    await settle()
    expect(song.beginTake).toHaveBeenCalledTimes(1)
  })

  it('never begins a take for a play that was overtaken by a stop', async () => {
    engine.play.mockResolvedValueOnce(false)
    await arm()

    useTransport.getState().play()
    await settle()

    expect(song.beginTake).not.toHaveBeenCalled()
    expect(useRecording.getState().phase).toBe('armed')
  })
})
