import { writeFile } from 'node:fs/promises'
import { app, type BrowserWindow } from 'electron'

/** Long enough for the boot sequence — config, library, last song — to settle. */
const SETTLE_MS = 1500

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
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
  const image = await window.webContents.capturePage()
  await writeFile(path, image.toPNG())
  app.exit(0)
}
