import path from 'node:path'
import readline from 'node:readline'
import fs from 'node:fs'
import type { CollectLineNumbers, CollectLines, RawErrsMap } from './types'

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
    `Line with index ${lineIndex} does not exist in '${filePath}'.`
  )
}

export function getLineByIndexesFromFile(
  filePath: string,
  lineIndexes: CollectLineNumbers
): Promise<CollectLines> {
  const linesCollect: Partial<CollectLines> = {}
  return new Promise<CollectLines>((resolve, reject) => {
    if (
      Object.values(lineIndexes).some(
        (lineIndex) => lineIndex <= 0 || lineIndex % 1 !== 0
      )
    )
      return reject(new RangeError(`Invalid line number`))

    let cursor = 1
    const input = fs.createReadStream(filePath)
    const rl = readline.createInterface({ input })

    function read(line: string) {
      if (cursor === lineIndexes.next) {
        // the last index
        rl.close()
        input.close()
        linesCollect.next = line
        resolve(linesCollect as CollectLines)
      } else if (cursor === lineIndexes.target) {
        linesCollect.target = line
      } else if (cursor === lineIndexes.prev) {
        linesCollect.prev = line
      }
      cursor++
    }

    rl.on('line', (line) => read(line))
    rl.on('error', reject)

    input.on('end', () => {
      read('')
      reject(createOutOfRangeError(filePath, lineIndexes.target))
    })
  })
}
