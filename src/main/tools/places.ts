import type { Machine } from './releases'

/**
 * Where to open the file picker when somebody goes looking for a tool
 * themselves, or nowhere in particular.
 *
 * This is only a starting point for a dialog, so being wrong costs a click
 * and being right saves one. It is where a package manager on that platform
 * would have put the thing being looked for — which on Windows is nowhere in
 * particular, so the dialog is left to open wherever it likes.
 */
export function whereToolsLive({ platform, arch }: Machine): string | undefined {
  if (platform === 'linux') return '/usr/bin'
  /* Homebrew moved when the Macs did: Apple silicon keeps it out of /usr. */
  if (platform === 'darwin') return arch === 'arm64' ? '/opt/homebrew/bin' : '/usr/local/bin'
  return undefined
}
