/**
 * Says that this Escape has been answered.
 *
 * Escape has no default action of its own, so preventing it does nothing to
 * the browser: it is purely a mark left on the event. Dialogs, drawers, menus
 * and panels each listen on the window and cannot see one another, so the
 * keystroke itself is the only thing they have in common — and whoever wants
 * to know whether a press went unanswered has nothing else to ask.
 *
 * Marking it does not stop anything else from closing on the same press: two
 * things open at once should both let go, which they did before there was
 * anything reading the mark.
 */
export const escapeAnswered = (event: KeyboardEvent): void => event.preventDefault()

/**
 * Whether a press has been answered by now.
 *
 * Only true once the keystroke has been all the way round, since the listeners
 * that might answer it are on the window in whatever order they were added —
 * so this is asked from a timeout rather than from the listener itself.
 */
export const wasEscapeAnswered = (event: KeyboardEvent): boolean => event.defaultPrevented
