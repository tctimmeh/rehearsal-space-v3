import { engagedThemeOf, ENGAGED_COLOR_DEFAULT } from '@core/ui/accents'
import { useConfig } from './config'

/**
 * Puts the chosen colour for a latched control on the document.
 *
 * The stylesheet works in tokens and never names a colour, so this is the one
 * place the choice becomes real, and every engaged control changes at once —
 * the rail, the tabs, the tag filters, the stems dialog.
 */
export function followEngagedColor(): () => void {
  const apply = (): void => {
    const { color, rim, glow } = engagedThemeOf(
      useConfig.getState().config?.engagedColor ?? ENGAGED_COLOR_DEFAULT
    )
    const style = document.documentElement.style
    style.setProperty('--engaged', color)
    style.setProperty('--engaged-rim', rim)
    style.setProperty('--engaged-glow', glow)
  }

  apply()
  return useConfig.subscribe(apply)
}
