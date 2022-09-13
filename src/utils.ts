import path from 'node:path'
import readline from 'node:readline'
import fs from 'node:fs'
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

function createOutOfRangeError(filePath: string, lineIndex: number) {
  return new RangeError(
    `Line with index ${lineIndex} does not exist in '${filePath}'. Note that line indexing is zero-based`
  )
}

export function getLineByIndexFromFile(filePath: string, lineIndex: number) {
  return new Promise<string>((resolve, reject) => {
    if (lineIndex < 0 || lineIndex % 1 !== 0)
      return reject(new RangeError(`Invalid line number`))

    let cursor = 0
    const input = fs.createReadStream(filePath)
    const rl = readline.createInterface({ input })

    rl.on('line', (line) => {
      if (cursor++ === lineIndex) {
        rl.close()
        input.close()
        resolve(line)
      }
    })

    rl.on('error', reject)

    input.on('end', () => {
      reject(createOutOfRangeError(filePath, lineIndex))
    })
  })
}
