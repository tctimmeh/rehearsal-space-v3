import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'

import {
  PAN_SPEED_MAX,
  PAN_SPEED_MIN,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  ZOOM_SPEED_MAX,
  ZOOM_SPEED_MIN,
  type AppConfig
} from '../shared/config'
import { isExternalTool, type ExternalTool } from '../shared/tools'
import { writeAtomically } from './library/library'

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const number = (raw: unknown, fallback: number, min: number, max: number): number =>
  typeof raw === 'number' && Number.isFinite(raw) ? clamp(raw, min, max) : fallback

const configPath = (): string => join(app.getPath('userData'), 'config.json')

export const defaultConfig = (): AppConfig => ({
  libraryPath: join(app.getPath('music'), 'Rehearsal Space'),
  lastSongId: null,
  uiScale: 1.2,
  showCents: false,
  /* A wheel notch moves a sixth of the window, and zooms by a fifth of a
     doubling — about 19%. Fine work wants a wheel that moves every time
     without throwing the view about. */
  panSpeed: 0.15,
  zoomSpeed: 0.25,
  toolPaths: {}
})

let cached: AppConfig | null = null

/**
 * Config is a plain file the user can open, so every field is parsed with a
 * fallback and a broken file degrades to defaults rather than failing to boot.
 */
function parse(raw: unknown, defaults: AppConfig): AppConfig {
  if (typeof raw !== 'object' || raw === null) return defaults
  const record = raw as Record<string, unknown>
  return {
    libraryPath:
      typeof record['libraryPath'] === 'string' && record['libraryPath'] !== ''
        ? record['libraryPath']
        : defaults.libraryPath,
    lastSongId: typeof record['lastSongId'] === 'string' ? record['lastSongId'] : null,
    uiScale:
      typeof record['uiScale'] === 'number' && Number.isFinite(record['uiScale'])
        ? clamp(record['uiScale'], UI_SCALE_MIN, UI_SCALE_MAX)
        : defaults.uiScale,
    showCents:
      typeof record['showCents'] === 'boolean' ? record['showCents'] : defaults.showCents,
    panSpeed: number(record['panSpeed'], defaults.panSpeed, PAN_SPEED_MIN, PAN_SPEED_MAX),
    zoomSpeed: number(record['zoomSpeed'], defaults.zoomSpeed, ZOOM_SPEED_MIN, ZOOM_SPEED_MAX),
    toolPaths: parseToolPaths(record['toolPaths'])
  }
}

/** Only known tools with a non-empty path survive; the rest is somebody's typo. */
function parseToolPaths(raw: unknown): Partial<Record<ExternalTool, string>> {
  if (typeof raw !== 'object' || raw === null) return {}
  const paths: Partial<Record<ExternalTool, string>> = {}
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isExternalTool(name) && typeof value === 'string' && value !== '') paths[name] = value
  }
  return paths
}

export async function readConfig(): Promise<AppConfig> {
  if (cached !== null) return cached
  const defaults = defaultConfig()
  try {
    cached = parse(JSON.parse(await readFile(configPath(), 'utf8')), defaults)
  } catch {
    cached = defaults
  }
  return cached
}

/** Settings are read, changed and written back, so changes have to queue. */
let writing: Promise<unknown> = Promise.resolve()

export function updateConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const next = writing.then(
    () => applyPatch(patch),
    () => applyPatch(patch)
  )
  writing = next.catch(() => undefined)
  return next
}

async function applyPatch(patch: Partial<AppConfig>): Promise<AppConfig> {
  const next = parse({ ...(await readConfig()), ...patch }, defaultConfig())
  await writeAtomically(configPath(), `${JSON.stringify(next, null, 2)}\n`)
  cached = next
  return next
}
