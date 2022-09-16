import path from 'node:path'
import url from 'node:url'
import { readFile, rm, writeFile } from 'node:fs/promises'
import jsonc from 'jsonc-parser'
import chalk from 'chalk'
import ora from 'ora'
import { execaCommand } from 'execa'
import {
  showFirstTscCompilePathInfo,
  showTscReCompilePathInfo,
} from './show-console-print'
import { getLineByIndexesFromFile } from './utils'
import type { RawErrsMap, TscErrorInfo } from './types'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const newLineRegExp = /\r?\n/
const errCodeRegExp = /error TS(?<errCode>\d+)/
const tscSpinner = ora(chalk.yellow('Start tsc compiling ...'))

async function getErrPreviewLineByIndexFromFile(
  filePath: string,
  line: number,
  errMsg: string
) {
  // line index is zero-based, so we need to minus 1
  const [prevLine, lineContent, nextLine] = await getLineByIndexesFromFile(
    filePath,
    [line - 1 - 1, line - 1, line - 1 + 1]
  )
  return `${errMsg}

${chalk.gray(`${String(line - 1)} ┆`)}${prevLine}
${chalk.bold.red(`${String(line)} ┆`)}${chalk.bold.underline(lineContent)}
${chalk.gray(`${String(line + 1)} ┆`)}${nextLine}`
}

async function makeTscErrorInfo(
  errInfo: string,
  rootAbsPath: string
): Promise<[string, TscErrorInfo]> {
  const panicMsg = 'failed to parsing error info.'
  const [errFilePathPos = '', ...errMsgRawArr] = errInfo.split(':')
  if (
    !errFilePathPos ||
    errMsgRawArr.length === 0 ||
    errMsgRawArr.join('').length === 0
  ) {
    throw new Error(`${panicMsg} (on first split)`)
  }
  const errMsgRaw = errMsgRawArr.join('').trim()

  // get filePath, line, col
  const [errFilePath, errPos] = errFilePathPos
    .slice(0, -1) // removes the ')'
    .split('(')
  if (!errFilePath || !errPos) {
    throw new Error(`${panicMsg} (on \`errFilePath\` or \`errPos\`)`)
  }

  const [errLine, errCol] = errPos.split(',')
  if (!errLine || !errCol) {
    throw new Error(`${panicMsg} (on \`errLine\` or \`errCol\`)`)
  }

  // get errCode, errMsg
  const execArr = errCodeRegExp.exec(errMsgRaw)
  if (!execArr) {
    throw new Error(`${panicMsg} (on \`errMsgRegExp.exec\`)`)
  }

  const errCodeStr = execArr.groups?.errCode ?? ''
  if (!errCodeStr) {
    throw new Error(`${panicMsg} (on \`errCode\`)`)
  }

  const line = Number(errLine),
    col = Number(errCol),
    errCode = Number(errCodeStr)
  const errMsg = await getErrPreviewLineByIndexFromFile(
    path.join(rootAbsPath, errFilePath),
    line,
    errMsgRaw.slice(`error TS${errCode}`.length)
  )
  return [
    errFilePath,
    {
      filePath: errFilePath,
      errCode,
      line,
      col,
      errMsg,
    },
  ]
}
export async function getTscCompileStdout(
  // The `cwd` dir requires an existing `tsconfig.json` file
  rootAbsPath = process.cwd(),
  isReCompile = false
) {
  const baseConfigPath = path.join(rootAbsPath, 'tsconfig.json')
  const baseConfigJSON = jsonc.parse(String(await readFile(baseConfigPath)))
  const tmpConfigPath = path.join(rootAbsPath, 'tsconfig.tmp.json')

  // Use a temp tsconfig
  try {
    const tmpTsConfig: Record<string, any> = { ...baseConfigJSON }

    // Override some options
    tmpTsConfig.compilerOptions.emitDeclarationOnly = false // Avoid conflict with --noEmit
    tmpTsConfig.compilerOptions.incremental = true
    tmpTsConfig.compilerOptions.tsBuildInfoFile = path.join(
      __dirname,
      'tsconfig.tmp.tsbuildinfo'
    )

    const tsconfigFinalContent = JSON.stringify(tmpTsConfig, null, 2)
    await writeFile(tmpConfigPath, tsconfigFinalContent)
  } catch (err) {
    console.log(
      `${chalk.red('Failed to process `tsconfig.json`')}\n${chalk.red(err)}`
    )
    process.exit()
  }

  let tscErrorStdout = ''
  try {
    const cmd = `tsc --noEmit --pretty false -p ${tmpConfigPath}`
    isReCompile
      ? showTscReCompilePathInfo(rootAbsPath)
      : showFirstTscCompilePathInfo({
          cmd,
          rootAbsPath,
        })
    tscSpinner.start()
    const tscProcess = execaCommand(cmd, {
      cwd: rootAbsPath,
      stdout: 'pipe',
      reject: false,
    })
    tscProcess.stdout?.on('data', (errInfoChunk) => {
      tscErrorStdout += errInfoChunk
    })
    await tscProcess
    tscSpinner.succeed(chalk.yellow('tsc compiling finished.'))
    await rm(tmpConfigPath, { force: true })
  } catch (err) {
    tscSpinner.succeed(chalk.yellow('tsc compiling failed.'))
    console.log(chalk.red(`Error: ${err}`))
  }
  return tscErrorStdout
}
export async function getRawErrsMapFromTsCompile(
  rootAbsPath: string,
  isReCompile = false
) {
  const tscErrorStdout = await getTscCompileStdout(rootAbsPath, isReCompile)
  const rawErrsMap: RawErrsMap = new Map()

  // Merge details line with main line (i.e. which contains file path)
  const infos = await Promise.all(
    tscErrorStdout
      .split(newLineRegExp)
      .reduce<string[]>((prev, next) => {
        if (!next) {
          return prev
        } else if (!next.startsWith(' ')) {
          prev.push(next)
        } else {
          prev[prev.length - 1] += `\n${next}`
        }
        return prev
      }, [])
      .map((errInfoLine) => makeTscErrorInfo(errInfoLine, rootAbsPath))
  )
  infos.forEach(([errFilePath, errInfo]) => {
    if (!rawErrsMap.has(errFilePath)) {
      rawErrsMap.set(errFilePath, [errInfo])
    } else {
      rawErrsMap.get(errFilePath)?.push(errInfo)
    }
  })
  return rawErrsMap
}
