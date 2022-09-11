import path from 'node:path'
import type { RawErrsMap } from './types'

export function getRawErrsSumCount(rawErrsMap: RawErrsMap) {
  return [...rawErrsMap.values()].reduce((prev, next) => {
    return (prev += next.length)
  }, 0)
}
export function getTargetDir(dirArg: string): string {
  if (!dirArg) {
    throw new Error("You didn't give a directory path")
  }
  const targetDir = dirArg.startsWith('.')
    ? path.join(process.cwd(), dirArg)
    : dirArg.startsWith('/')
    ? dirArg
    : (() => {
        throw new Error('invalid directory path')
      })()

  return targetDir
}
export function isFilePath(absPath: string) {
  return (absPath.split(path.sep).pop()?.split('.').length ?? 0) > 1
}
