/**
 * A song's directory name comes from its title, so the library folder is
 * browsable outside the app.
 */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'song' : slug
}

export function uniqueSlug(desired: string, taken: Iterable<string>): string {
  const existing = new Set(taken)
  if (!existing.has(desired)) return desired
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${desired}-${suffix}`
    if (!existing.has(candidate)) return candidate
  }
}

/**
 * Song ids reach the filesystem, so anything that could escape the library
 * directory has to be rejected before it is joined to a path.
 */
export const isSafeSongId = (id: string): boolean => /^[a-z0-9][a-z0-9-]*$/.test(id)
