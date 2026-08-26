import { vi } from 'vitest'

/**
 * jsdom implements no part of pointer capture, so anything that drags throws
 * the moment it is let go. The methods do nothing here beyond existing —
 * capture only matters when a pointer can leave the element it started on,
 * and in jsdom the test decides where every event lands anyway.
 */
export function installPointerCapture(): void {
  const captured = new Set<number>()
  HTMLElement.prototype.setPointerCapture = vi.fn((id: number) => void captured.add(id))
  HTMLElement.prototype.releasePointerCapture = vi.fn((id: number) => void captured.delete(id))
  HTMLElement.prototype.hasPointerCapture = vi.fn((id: number) => captured.has(id))
}
