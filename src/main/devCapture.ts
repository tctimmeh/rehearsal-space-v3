import { writeFile } from 'node:fs/promises'
import { app, type BrowserWindow } from 'electron'

/** Long enough for the boot sequence — config, library, last song — to settle. */
const DEFAULT_SETTLE_MS = 1500

const settleMs = (): number => {
  const override = Number(process.env['RS_CAPTURE_DELAY'] ?? '')
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_SETTLE_MS
}

/**
 * Renders the window offscreen to a PNG and quits. This is how the UI gets
 * checked on a headless or Wayland session where a screen grab isn't
 * available. Development only.
 */
export function requestedCapturePath(): string | null {
  if (app.isPackaged) return null
  return process.env['RS_CAPTURE'] ?? null
}

export async function captureAndExit(window: BrowserWindow, path: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, settleMs()))
  const image = await window.webContents.capturePage()
  await writeFile(path, image.toPNG())
  app.exit(0)
}
