import { describe, expect, it } from 'vitest'

import { editItemsFor, type Clicked } from './editMenu'

const clicked = (over: Partial<Clicked> = {}): Clicked => ({
  isEditable: false,
  selectionText: '',
  editFlags: { canCut: false, canCopy: false, canPaste: false, canSelectAll: true },
  ...over
})

const roles = (items: ReturnType<typeof editItemsFor>) =>
  items.map((item) => item.role ?? item.type)

describe('the menu a right-click puts up', () => {
  it('offers what a text field is for', () => {
    const items = editItemsFor(clicked({ isEditable: true }))

    expect(roles(items)).toEqual(['cut', 'copy', 'paste', 'separator', 'selectAll'])
  })

  /* Greyed rather than absent: a menu whose items move about depending on
     what is selected is a menu you have to read every time. */
  it('offers them greyed when there is nothing to do with them', () => {
    const items = editItemsFor(
      clicked({
        isEditable: true,
        editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true }
      })
    )

    expect(items.map((item) => item.enabled)).toEqual([false, false, true, undefined, true])
  })

  /* Words worth copying, somewhere they cannot be typed. */
  it('offers copy alone where there is a selection but nothing to type in', () => {
    const items = editItemsFor(
      clicked({ selectionText: 'a line of the song', editFlags: { ...clicked().editFlags, canCopy: true } })
    )

    expect(roles(items)).toEqual(['copy'])
    expect(items[0]?.enabled).toBe(true)
  })

  /* An empty menu is worse than no menu: it comes up, says nothing, and has
     to be dismissed. */
  it('puts up nothing at all where there is nothing to offer', () => {
    expect(editItemsFor(clicked())).toEqual([])
    expect(editItemsFor(clicked({ selectionText: '   \n ' }))).toEqual([])
  })

  /* The editors here keep undo histories of their own, and Chromium's would
     quietly disagree with them. */
  it('leaves undo to the editors that already do it', () => {
    const items = editItemsFor(clicked({ isEditable: true }))

    expect(roles(items)).not.toContain('undo')
    expect(roles(items)).not.toContain('redo')
  })
})
