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
import { getLineByIndexesFromFile, getRawErrsSumCount } from './utils'
import type {
  CollectLineNumbers,
  Context,
  RawErrsMap,
  TscErrorInfo,
} from './types'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const newLineRegExp = /\r?\n/
const errCodeRegExp = /error TS(?<errCode>\d+)/
const tscSpinner = ora(chalk.yellow('Start tsc compiling ...'))

function guardErrsMapNotEmpty(rawErrsMap: RawErrsMap) {
  const errsCount = getRawErrsSumCount(rawErrsMap)
  if (errsCount === 0) {
    console.log(`\n🎉 ${chalk.bold.greenBright('Found 0 Errors.')}\n`)
    process.exit()
  }
}

async function getErrPreviewLineByIndexFromFile(
  filePath: string,
  line: number,
  errMsg: string
) {
  const lineNumbers: CollectLineNumbers = {
    prev: line - 1 < 0 ? undefined : line - 1,
    target: line,
    next: line + 1,
  }
  const { target, next, prev } = await getLineByIndexesFromFile(
    filePath,
    lineNumbers
  )
  return `${errMsg}

${prev && `${chalk.gray(`${String(line - 1)} ┆`)}${prev}`}
${chalk.bold.red(`${String(line)} ┆`)}${chalk.bold.underline(target)}
${chalk.gray(`${String(line + 1)} ┆`)}${next}`
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
  { root: rootAbsPath = process.cwd(), options }: Context,
  isReCompile = false
) {
  const baseConfigPath = path.join(rootAbsPath, 'tsconfig.json')
  const baseConfigJSON = jsonc.parse(String(await readFile(baseConfigPath)))
  const tmpConfigPath = path.join(rootAbsPath, 'tsconfig.tmp.json')

  // Use a temp tsconfig
  try {
    const tmpTsConfig: Record<string, any> = { ...baseConfigJSON }

    // Override some options
    if (!tmpTsConfig.compilerOptions) {
      tmpTsConfig.compilerOptions = {}
    }
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

  const tscErrorStdoutChunks: string[] = []
  try {
    const cmd = `${options.engine} --noEmit --pretty false ${
      options.engine === 'vue-tsc' ? '' : `-p ${tmpConfigPath}`
    }`
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
    tscProcess.stdout
      ?.on('data', (errInfoChunk) => {
        tscErrorStdoutChunks.push(String(errInfoChunk))
      })
      .on('end', async () => {
        tscSpinner.succeed(chalk.yellow('tsc compiling finished.'))
        await rm(tmpConfigPath, { force: true })
      })
    await tscProcess
  } catch (err) {
    tscSpinner.succeed(chalk.yellow('tsc compiling failed.'))
    console.log(chalk.red(`Error: ${err}`))
  }
  return tscErrorStdoutChunks.join('')
}
export async function getRawErrsMapFromTsCompile(
  ctx: Context,
  isReCompile = false
) {
  const { root: rootAbsPath } = ctx
  const tscErrorStdout = await getTscCompileStdout(ctx, isReCompile)
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

  guardErrsMapNotEmpty(rawErrsMap)
  return rawErrsMap
}
