import { useCallback } from 'react'

/**
 * A field that arrives with its contents ready to be replaced.
 *
 * Somewhere a name is being changed, the name that is there is nearly always
 * the wrong one — that is why the box is open — so the useful thing is to be
 * able to start typing. Selecting rather than clearing keeps the old name
 * there to be looked at, and to be kept by pressing Escape.
 *
 * A ref rather than an effect, so it happens as the field arrives and cannot
 * fight anything that focuses something else afterwards. It is stable, so it
 * runs when the field is mounted and not on every keystroke into it.
 */
export function useSelectOnOpen<T extends HTMLInputElement | HTMLTextAreaElement>(): (
  field: T | null
) => void {
  return useCallback((field: T | null) => {
    field?.select()
  }, [])
}
