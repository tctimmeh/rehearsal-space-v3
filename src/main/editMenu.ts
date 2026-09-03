import type { MenuItemConstructorOptions } from 'electron'

/**
 * The menu a right-click puts up, which the app has to provide itself.
 *
 * Electron ships no context menu at all — Chromium's own is not there — so
 * without this, right-clicking a text field does nothing whatever, which is
 * not what a text field does anywhere else on the machine.
 *
 * Only what a text field is for: no undo or redo, because the editors here
 * keep undo histories of their own and Chromium's would quietly disagree with
 * them, and nothing at all where there is neither a field nor a selection —
 * an empty menu is worse than none.
 */

/** The parts of Electron's `context-menu` parameters this decides from. */
export interface Clicked {
  isEditable: boolean
  selectionText: string
  editFlags: {
    canCut: boolean
    canCopy: boolean
    canPaste: boolean
    canSelectAll: boolean
  }
}

export function editItemsFor({
  isEditable,
  selectionText,
  editFlags
}: Clicked): MenuItemConstructorOptions[] {
  if (isEditable) {
    return [
      { role: 'cut', enabled: editFlags.canCut },
      { role: 'copy', enabled: editFlags.canCopy },
      { role: 'paste', enabled: editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: editFlags.canSelectAll }
    ]
  }

  /* Words worth copying, somewhere they cannot be typed: the lyrics as they
     are read, a job's log, the version in the about box. */
  if (selectionText.trim() !== '') return [{ role: 'copy', enabled: editFlags.canCopy }]

  return []
}
