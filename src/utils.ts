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
    `Line with index ${lineIndex} does not exist in '${filePath}'.`
  )
}

export function getLineByIndexesFromFile(
  filePath: string,
  lineIndexes: number[]
) {
  return new Promise<string[]>((resolve, reject) => {
    if (lineIndexes.some((lineIndex) => lineIndex <= 0 || lineIndex % 1 !== 0))
      return reject(new RangeError(`Invalid line number`))

    let cursor = 1
    const input = fs.createReadStream(filePath)
    const rl = readline.createInterface({ input })
    const linesCollect: string[] = []

    function read(line: string) {
      if (cursor === Math.max(...lineIndexes)) {
        // the last index
        rl.close()
        input.close()
        resolve([...linesCollect, line])
      } else if (lineIndexes.includes(cursor)) {
        linesCollect.push(line)
      }
      cursor++
    }

    rl.on('line', (line) => read(line))
    rl.on('error', reject)

    input.on('end', () => {
      read('')
      reject(
        createOutOfRangeError(
          filePath,
          lineIndexes[Math.floor(lineIndexes.length / 2)]
        )
      )
    })
  })
}
