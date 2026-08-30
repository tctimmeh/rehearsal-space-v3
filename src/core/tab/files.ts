import type { TabFile } from '../song/song'

/**
 * Keeping several tablatures for one song — a lead line, a rhythm part, a bass.
 *
 * They are listed on the song rather than found by reading the folder, so the
 * order and the names are the song's own. What this decides is the two things
 * that have to be unique: which entry is which, and which file is which.
 */
export const DEFAULT_TAB_NAME = 'Tab'

/** A name nobody has used yet: "Rhythm", then "Rhythm 2". */
export function untakenName(tabs: readonly TabFile[], wanted: string): string {
  const asked = wanted.trim() === '' ? DEFAULT_TAB_NAME : wanted.trim()
  const taken = new Set(tabs.map((tab) => tab.name.toLowerCase()))
  if (!taken.has(asked.toLowerCase())) return asked
  for (let n = 2; ; n += 1) {
    const tried = `${asked} ${n}`
    if (!taken.has(tried.toLowerCase())) return tried
  }
}

/**
 * A file nobody has used yet, named after what it holds.
 *
 * The name is reduced to a slug rather than used as it stands, because it
 * becomes a filename: a part called "Lead / Rhythm" must not write itself into
 * a folder that does not exist, and the whole path is confined to the song's
 * own directory besides. `slugify` is not reused for this — it answers "song"
 * for a title it cannot make anything of, which is a strange name for a
 * tablature file.
 */
const stemOf = (name: string): string => {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'tab' : slug
}

export function untakenFile(tabs: readonly TabFile[], name: string): string {
  const stem = stemOf(name)
  const taken = new Set(tabs.map((tab) => tab.file.toLowerCase()))
  const path = (of: string): string => `tabs/${of}.txt`
  if (!taken.has(path(stem).toLowerCase())) return path(stem)
  for (let n = 2; ; n += 1) {
    if (!taken.has(path(`${stem}-${n}`).toLowerCase())) return path(`${stem}-${n}`)
  }
}

/** A new entry for the song's list, with nothing clashing with what is there. */
export function newTabFile(tabs: readonly TabFile[], wanted: string, strings = 6): TabFile {
  const name = untakenName(tabs, wanted)
  const file = untakenFile(tabs, name)
  const taken = new Set(tabs.map((tab) => tab.id))
  let id = stemOf(name)
  for (let n = 2; taken.has(id); n += 1) id = `${stemOf(name)}-${n}`
  return { id, file, name, strings }
}
