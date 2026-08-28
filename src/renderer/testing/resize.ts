import { vi } from 'vitest'

/**
 * jsdom does not implement ResizeObserver, and anything that measures itself
 * to lay out — tablature fitting bars to the width — asks for one on mount.
 *
 * It never fires here: jsdom has no layout to change, so every measurement
 * comes back zero and the component keeps whatever width it started with.
 * Observing is all that has to work.
 */
export function installResizeObserver(): void {
  class Nothing {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }
  window.ResizeObserver = Nothing as unknown as typeof ResizeObserver
  globalThis.ResizeObserver = Nothing as unknown as typeof ResizeObserver
}
