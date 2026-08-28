import { create } from 'zustand'

/**
 * Which of the app's dialogs is showing.
 *
 * Out here rather than inside the menu that opens them, because the keyboard
 * opens some of them too and a dialog cannot belong to one of the two ways in.
 */
export type Dialog = 'settings' | 'advanced' | 'recording' | 'tools' | 'shortcuts' | null

interface DialogState {
  dialog: Dialog
  show: (dialog: Dialog) => void
}

export const useDialog = create<DialogState>((set) => ({
  dialog: null,
  show: (dialog) => set({ dialog })
}))
