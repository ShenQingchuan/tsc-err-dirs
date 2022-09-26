import type { OptionContext } from './types'
import type { CAC } from 'cac'

const optionsDefMap: Record<string, string[]> = {
  engine: ['e', 'engine'],
}
const createDefaultOptionsContext = (): OptionContext => {
  return {
    engine: 'tsc',
  }
}

export function getCliOptionsContext(cli: CAC) {
  const optionsContext = createDefaultOptionsContext()
  Object.entries(cli.options).forEach(([cliOptionKey, cliOptionValue]) => {
    Object.entries(optionsDefMap).forEach(
      ([cliOptionDefKey, cliOptionDefKeys]) => {
        if (cliOptionDefKeys.includes(cliOptionKey)) {
          Reflect.set(optionsContext, cliOptionDefKey, cliOptionValue)
        }
      }
    )
  })

  return optionsContext
}
