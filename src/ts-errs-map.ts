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
import type { RawErrsMap, RootAndTarget, TscErrorInfo } from './types'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const newLineRegExp = /\r?\n/
const errCodeRegExp = /error TS(?<errCode>\d+)/
const tscSpinner = ora(chalk.yellow('Start tsc compiling ...'))

function makeTscErrorInfo(errInfo: string): [string, TscErrorInfo] {
  const panicMsg = 'failed to parsing error info.'
  const [errFilePathPos = '', ...errMsgRawArr] = errInfo.split(':')
  if (
    !errFilePathPos ||
    errMsgRawArr.length === 0 ||
    errMsgRawArr.join('').length === 0
  )
    throw new Error(`${panicMsg} (on first split)`)
  const errMsgRaw = errMsgRawArr.join('').trim()

  // get filePath, line, col
  const [errFilePath, errPos] = errFilePathPos
    .slice(0, -1) // removes the ')'
    .split('(')
  if (!errFilePath || !errPos)
    throw new Error(`${panicMsg} (on \`errFilePath\` or \`errPos\`)`)

  const [errLine, errCol] = errPos.split(',')
  if (!errLine || !errCol)
    throw new Error(`${panicMsg} (on \`errLine\` or \`errCol\`)`)

  // get errCode, errMsg
  const execArr = errCodeRegExp.exec(errMsgRaw)
  if (!execArr) throw new Error(`${panicMsg} (on \`errMsgRegExp.exec\`)`)

  const { errCode = '' } = execArr.groups ?? {}
  if (!errCode) throw new Error(`${panicMsg} (on \`errCode\`)`)

  return [
    errFilePath,
    {
      filePath: errFilePath,
      line: Number(errLine),
      col: Number(errCol),
      errCode: Number(errCode),
      errMsg: errMsgRaw.slice(`error TS${errCode}`.length - 1),
    },
  ]
}
export async function getTscCompileStdout(
  // The `cwd` dir requires an existing `tsconfig.json` file
  options: RootAndTarget & {
    pretty?: boolean
  },
  isReCompile = false
) {
  const { root = process.cwd(), pretty = false, targetAbsPath = root } = options
  const baseConfigPath = path.join(root, 'tsconfig.json')
  const baseConfigJSON = jsonc.parse(String(await readFile(baseConfigPath)))
  const tmpConfigPath = path.join(root, 'tsconfig.tmp.json')

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
    const cmd = `tsc --noEmit --pretty ${pretty} -p ${tmpConfigPath}`
    isReCompile
      ? showTscReCompilePathInfo(targetAbsPath)
      : showFirstTscCompilePathInfo({
          cmd,
          root,
          targetAbsPath,
        })
    tscSpinner.start()
    const tscProcess = execaCommand(cmd, {
      cwd: root,
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
export async function getRawErrsMap(
  options: RootAndTarget,
  isReCompile = false
) {
  const tscErrorStdout = await getTscCompileStdout(options, isReCompile)
  const rawErrsMap: RawErrsMap = new Map()

  // Merge details line with main line (i.e. which contains file path)
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
    .map((errInfoLine) => makeTscErrorInfo(errInfoLine))
    .forEach(([errFilePath, errInfo]) => {
      if (!rawErrsMap.has(errFilePath)) {
        rawErrsMap.set(errFilePath, [errInfo])
      } else {
        rawErrsMap.get(errFilePath)?.push(errInfo)
      }
    })
  return rawErrsMap
}
