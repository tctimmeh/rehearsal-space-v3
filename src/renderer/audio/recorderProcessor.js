/**
 * Hands every block of captured audio back to the main thread as it arrives.
 * Nothing is kept here: an AudioWorklet must not grow without bound, and the
 * page is a better place to accumulate a take.
 */
class RehearsalRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input !== undefined && input.length > 0 && (input[0]?.length ?? 0) > 0) {
      /* Copied, because the buffers behind these are reused every block. */
      this.port.postMessage(input.map((channel) => new Float32Array(channel)))
    }
    return true
  }
}

registerProcessor('rehearsal-recorder', RehearsalRecorder)
