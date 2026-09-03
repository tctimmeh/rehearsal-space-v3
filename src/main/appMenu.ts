import type { MenuItemConstructorOptions } from 'electron'

/**
 * The application menu, which is a macOS question and nowhere else's.
 *
 * Everywhere else there is no menu at all, and for a good reason: Electron's
 * default one answers Ctrl-R, Ctrl-Shift-R and F5 by reloading, which throws
 * away everything the renderer is holding and, mid-edit, reads as the app
 * having crashed and come back. A menu accelerator is answered above the page,
 * so the page cannot refuse it — the menu is what has to go. Ctrl-R is also
 * how a repeat is marked in the tablature.
 *
 * macOS cannot be left with nothing, though. Cut, copy, paste and select all
 * are routed through the application menu there, so an app without one has
 * text fields that do not answer ⌘C or ⌘V, and no ⌘Q either. So it gets a
 * menu with exactly what it needs and nothing that reloads anything: no View,
 * no developer tools, no reload under any name.
 *
 * No undo or redo either. The editors here keep undo histories of their own,
 * and a menu item would be answered before them.
 */
export function applicationMenuFor(platform: string): MenuItemConstructorOptions[] | null {
  if (platform !== 'darwin') return null

  return [
    /* About, Services, Hide, Quit — the furniture every Mac app has. */
    { role: 'appMenu' },
    {
      label: 'Edit',
      submenu: [
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    /* ⌘M and ⌘W, which a Mac window is expected to answer. Closing goes
       through the same guard as the button on the window does. */
    { role: 'windowMenu' }
  ]
}

/** Roles that would put a reload back within reach, under any name. */
const RELOADS = ['reload', 'forceReload', 'toggleDevTools', 'viewMenu']

/** Whether a menu leaves any way to reload the window. Held to by a test. */
export const reloadsAnything = (items: MenuItemConstructorOptions[]): boolean =>
  items.some(
    (item) =>
      (item.role !== undefined && RELOADS.includes(item.role)) ||
      (Array.isArray(item.submenu) && reloadsAnything(item.submenu))
  )
