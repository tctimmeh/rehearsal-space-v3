import { describe, expect, it } from 'vitest'

import { applicationMenuFor, reloadsAnything } from './appMenu'

const roles = (items: ReturnType<typeof applicationMenuFor>) =>
  (items ?? []).map((item) => item.role ?? item.label)

const edit = () =>
  (applicationMenuFor('darwin') ?? []).find((item) => item.label === 'Edit')?.submenu

describe('the application menu', () => {
  /* The whole reason there is none: a menu answers Ctrl-R above the page, and
     Ctrl-R is how a repeat is marked in the tablature. */
  it('is nothing at all where nothing needs one', () => {
    expect(applicationMenuFor('linux')).toBeNull()
    expect(applicationMenuFor('win32')).toBeNull()
  })

  /* macOS routes cut, copy and paste through the menu: without one, no text
     field in the app answers ⌘C or ⌘V. */
  it('gives macOS the editing it cannot do without', () => {
    expect(Array.isArray(edit())).toBe(true)
    const items = Array.isArray(edit()) ? edit() : []
    expect((items as { role?: string }[]).map((one) => one.role)).toEqual([
      'cut',
      'copy',
      'paste',
      undefined,
      'selectAll'
    ])
  })

  it('gives it the furniture a Mac app is expected to have', () => {
    expect(roles(applicationMenuFor('darwin'))).toEqual(['appMenu', 'Edit', 'windowMenu'])
  })

  /*
   * The one thing that must never come back. A View menu, a reload item, or
   * the developer tools would each put Ctrl-R — and ⌘R — back above the page.
   */
  it('leaves no way to reload the window', () => {
    expect(reloadsAnything(applicationMenuFor('darwin') ?? [])).toBe(false)
  })

  it('would notice if one were put back', () => {
    expect(reloadsAnything([{ role: 'viewMenu' }])).toBe(true)
    expect(reloadsAnything([{ label: 'View', submenu: [{ role: 'reload' }] }])).toBe(true)
    expect(reloadsAnything([{ label: 'Edit', submenu: [{ role: 'copy' }] }])).toBe(false)
  })

  /* The editors keep undo histories of their own, and a menu item would be
     answered before them. */
  it('leaves undo to the editors that already do it', () => {
    const items = (Array.isArray(edit()) ? edit() : []) as { role?: string }[]

    expect(items.map((one) => one.role)).not.toContain('undo')
    expect(items.map((one) => one.role)).not.toContain('redo')
  })
})
