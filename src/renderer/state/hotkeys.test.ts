// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const engine = vi.hoisted(() => ({
  play: vi.fn(async () => true),
  pause: vi.fn(),
  stop: vi.fn(),
  seek: vi.fn(),
  setBounds: vi.fn(),
  setLoop: vi.fn(),
  setSpeed: vi.fn(),
  setPitch: vi.fn(),
  setOpenEnded: vi.fn(),
  whenEnded: vi.fn(),
  position: 0
}))
vi.mock('@renderer/audio/engine', () => ({ audioEngine: engine }))

const { followHotkeys } = await import('./hotkeys')
const { useTransport } = await import('./transport')
const { useRecording } = await import('./recording')
const { useTools } = await import('./tools')
const { useSong } = await import('./song')
const { useConfig } = await import('./config')

let unwire = () => undefined as void

const press = (init: KeyboardEventInit) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))

const lift = (init: KeyboardEventInit) =>
  window.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, ...init }))

beforeEach(() => {
  unwire = followHotkeys()
  useTransport.setState({
    playing: false,
    position: 40,
    start: 0,
    end: 120,
    loop: { start: 20, end: 30 },
    looping: false,
    playedFrom: null
  })
  useRecording.setState({ phase: 'off' })
  /* No config loaded, so the keys fall back to what they are shipped set to. */
  useConfig.setState({ config: null })
  vi.clearAllMocks()
})

afterEach(() => {
  unwire()
  vi.restoreAllMocks()
})

describe('Home', () => {
  it('takes the playhead to the top of the song', () => {
    press({ key: 'Home' })

    expect(useTransport.getState().position).toBe(0)
  })

  /* Somewhere to go back to without breaking off what you are listening to. */
  it('does not stop the music to do it', () => {
    useTransport.setState({ playing: true })

    press({ key: 'Home' })

    expect(useTransport.getState().playing).toBe(true)
    expect(engine.pause).not.toHaveBeenCalled()
    expect(engine.stop).not.toHaveBeenCalled()
  })
})

describe('the arrow keys', () => {
  it('step the playhead back and forward', () => {
    press({ key: 'ArrowRight' })
    expect(useTransport.getState().position).toBe(43)

    press({ key: 'ArrowLeft' })
    expect(useTransport.getState().position).toBe(40)
  })

  it('take a longer stride for each modifier', () => {
    press({ key: 'ArrowRight', ctrlKey: true })
    expect(useTransport.getState().position).toBe(46)

    press({ key: 'ArrowRight', shiftKey: true })
    expect(useTransport.getState().position).toBe(56)

    press({ key: 'ArrowRight', ctrlKey: true, shiftKey: true })
    expect(useTransport.getState().position).toBe(71)
  })

  it('go however far the settings say', () => {
    useConfig.setState({
      config: { nudge: { plain: 25, ctrl: 1, shift: 1, both: 1 } } as never
    })

    press({ key: 'ArrowRight' })

    expect(useTransport.getState().position).toBe(65)
  })

  /* The same as going to the start: this is for finding the passage again
     while it is still running. */
  it('do not stop the music', () => {
    useTransport.setState({ playing: true })

    press({ key: 'ArrowLeft' })

    expect(useTransport.getState().playing).toBe(true)
    expect(engine.pause).not.toHaveBeenCalled()
  })

  it('stay inside the song', () => {
    press({ key: 'ArrowLeft', ctrlKey: true, shiftKey: true })
    press({ key: 'ArrowLeft', ctrlKey: true, shiftKey: true })
    press({ key: 'ArrowLeft', ctrlKey: true, shiftKey: true })
    press({ key: 'ArrowLeft', ctrlKey: true, shiftKey: true })

    expect(useTransport.getState().position).toBe(0)
  })
})

/**
 * Held down, an arrow keeps moving — on the app's own cadence rather than the
 * system's key repeat, whose rate is somebody's setting for typing and would
 * cross a whole song in an eyeblink.
 */
describe('holding an arrow down', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('keeps going while it is held', () => {
    press({ key: 'ArrowRight' })
    expect(useTransport.getState().position).toBe(43)

    vi.advanceTimersByTime(300 + 150 * 3)

    expect(useTransport.getState().position).toBe(52)
  })

  it('stops when it is let go', () => {
    press({ key: 'ArrowRight' })
    vi.advanceTimersByTime(300 + 150)
    lift({ key: 'ArrowRight' })
    const reached = useTransport.getState().position

    vi.advanceTimersByTime(5000)

    expect(useTransport.getState().position).toBe(reached)
  })

  it('does not run on after the window has gone away', () => {
    press({ key: 'ArrowRight' })
    vi.advanceTimersByTime(300)
    window.dispatchEvent(new Event('blur'))
    const reached = useTransport.getState().position

    vi.advanceTimersByTime(5000)

    expect(useTransport.getState().position).toBe(reached)
  })

  /* A single press is a single step: nothing happens until it has been held
     long enough to mean it. */
  it('takes one step for a press and a quick release', () => {
    press({ key: 'ArrowRight' })
    vi.advanceTimersByTime(100)
    lift({ key: 'ArrowRight' })
    vi.advanceTimersByTime(5000)

    expect(useTransport.getState().position).toBe(43)
  })

  /*
   * A modifier reached for part-way through a hold arrives as a key of its
   * own, not as another arrow. It must lengthen the stride rather than stop
   * the hold — which is what it did, because a key the app does not answer
   * for was being taken as a reason to let go.
   */
  it('goes further when Shift is reached for part-way through', () => {
    press({ key: 'ArrowRight' })
    vi.advanceTimersByTime(300)
    press({ key: 'Shift', shiftKey: true })
    const reached = useTransport.getState().position

    vi.advanceTimersByTime(150)

    expect(useTransport.getState().position).toBe(reached + 10)
  })

  it('goes further again with Ctrl reached for as well', () => {
    press({ key: 'ArrowRight' })
    vi.advanceTimersByTime(300)
    press({ key: 'Shift', shiftKey: true })
    press({ key: 'Control', shiftKey: true, ctrlKey: true })
    const reached = useTransport.getState().position

    vi.advanceTimersByTime(150)

    expect(useTransport.getState().position).toBe(reached + 15)
  })

  it('goes back to the short stride when the modifier is let go', () => {
    press({ key: 'ArrowRight' })
    press({ key: 'Shift', shiftKey: true })
    vi.advanceTimersByTime(300)
    lift({ key: 'Shift', shiftKey: false })
    const reached = useTransport.getState().position

    vi.advanceTimersByTime(150)

    expect(useTransport.getState().position).toBe(reached + 3)
  })

  it('does not keep going when a key it has no answer for takes the arrow over', () => {
    press({ key: 'ArrowRight' })
    vi.advanceTimersByTime(300)
    press({ key: 'Alt', altKey: true })
    const reached = useTransport.getState().position

    vi.advanceTimersByTime(5000)

    expect(useTransport.getState().position).toBe(reached)
  })

  /* Another key doing its own job is no reason to stop scrubbing. */
  it('carries on through a keystroke that means something else', () => {
    press({ key: 'ArrowRight' })
    vi.advanceTimersByTime(300)
    press({ key: 'l' })
    const reached = useTransport.getState().position

    vi.advanceTimersByTime(150)

    expect(useTransport.getState().position).toBeGreaterThan(reached)
  })
})

describe('L', () => {
  it('goes round the region from the top of it, playing', () => {
    press({ key: 'l' })

    const transport = useTransport.getState()
    expect(transport.looping).toBe(true)
    expect(transport.position).toBe(20)
    expect(transport.playing).toBe(true)
  })

  it('takes you to the top of the region even from inside it', () => {
    useTransport.setState({ position: 26 })

    press({ key: 'l' })

    expect(useTransport.getState().position).toBe(20)
  })

  it('lets go when it is already going round', () => {
    press({ key: 'l' })

    press({ key: 'l' })

    expect(useTransport.getState().looping).toBe(false)
    expect(useTransport.getState().playing).toBe(true)
  })

  it('does nothing when there is no region to go round', () => {
    useTransport.setState({ loop: null })

    press({ key: 'l' })

    expect(useTransport.getState().playing).toBe(false)
  })
})

describe('recording from the keyboard', () => {
  it('arms and disarms on shift and R', () => {
    press({ key: 'R', shiftKey: true })
    expect(useRecording.getState().phase).toBe('armed')

    press({ key: 'R', shiftKey: true })
    expect(useRecording.getState().phase).toBe('off')
  })

  it('arms and plays on shift and space', () => {
    press({ code: 'Space', shiftKey: true })

    expect(useRecording.getState().phase).not.toBe('off')
    expect(useTransport.getState().playing).toBe(true)
  })

  it('carries on playing rather than starting again', () => {
    useTransport.setState({ playing: true })

    press({ code: 'Space', shiftKey: true })

    expect(engine.play).not.toHaveBeenCalled()
  })
})

/**
 * The order is the whole of it: disarming before stopping means the stop finds
 * nothing to finish, so the take is dropped rather than written.
 */
describe('throwing a take away', () => {
  it('stops the player and keeps nothing', () => {
    const discardTake = vi.fn()
    const finishTake = vi.fn(async () => undefined)
    useSong.setState({ discardTake, finishTake, disarmRecording: vi.fn(), refreshBounds: vi.fn() })
    useRecording.setState({ phase: 'recording' })

    press({ code: 'Space', ctrlKey: true })

    expect(discardTake).toHaveBeenCalled()
    expect(finishTake).not.toHaveBeenCalled()
    expect(useRecording.getState().phase).toBe('off')
    expect(engine.stop).toHaveBeenCalled()
  })

  it('does nothing when nothing is being recorded', () => {
    press({ code: 'Space', ctrlKey: true })

    expect(engine.stop).not.toHaveBeenCalled()
  })
})

/**
 * The tablature editor is a focusable div rather than a text field, because
 * its cursor stands on a moment rather than between two characters. Nothing
 * would otherwise recognise it as somewhere a keystroke is being typed, and
 * space would play the song while somebody is writing a bar.
 */
describe('while something is being typed into', () => {
  const typedInto = (element: HTMLElement) => {
    document.body.append(element)
    element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }))
    element.remove()
  }

  it('leaves the space bar alone in an editor that says it is being typed into', () => {
    const editor = document.createElement('div')
    editor.dataset['typing'] = 'true'

    typedInto(editor)

    expect(useTransport.getState().playing).toBe(false)
  })

  it('still answers it from anything else', () => {
    typedInto(document.createElement('div'))

    expect(useTransport.getState().playing).toBe(true)
  })
})

describe('the tool keys', () => {
  it('show and hide the metronome on F1', () => {
    press({ key: 'F1' })
    expect(useTools.getState().open.metronome).toBe(true)

    press({ key: 'F1' })
    expect(useTools.getState().open.metronome).toBe(false)
  })

  it('show and hide the tuner on F2', () => {
    press({ key: 'F2' })

    expect(useTools.getState().open.tuner).toBe(true)
  })
})
