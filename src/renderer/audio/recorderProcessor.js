/**
 * Hands blocks of captured audio back to the main thread while a take is
 * running. Nothing is kept here: an AudioWorklet must not grow without bound,
 * and the page is a better place to accumulate a take.
 *
 * Each block carries the time it began. That timestamp is the only accurate
 * one available — a message takes an unknown while to be delivered and read,
 * so noting the clock on arrival would place every take slightly late.
 */
class RehearsalRecorder extends AudioWorkletProcessor {
  constructor() {
    super()
    this.capturing = false
    this.port.onmessage = (event) => {
      this.capturing = event.data.capturing === true
    }
  }

  process(inputs) {
    const input = inputs[0]
    if (this.capturing && input !== undefined && input.length > 0 && (input[0]?.length ?? 0) > 0) {
      /* Copied, because the buffers behind these are reused every block. */
      this.port.postMessage({
        at: currentTime,
        channels: input.map((channel) => new Float32Array(channel))
      })
    }
    return true
  }
}

registerProcessor('rehearsal-recorder', RehearsalRecorder)
