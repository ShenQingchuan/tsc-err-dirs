#!/usr/bin/env node

import path from 'node:path'
import url from 'node:url'
import { rm, writeFile } from 'node:fs/promises'
import cac from 'cac'
import ora from 'ora'
import chalk from 'chalk'
import inquirer from 'inquirer'
import inquirerFileTreeSelection from 'inquirer-file-tree-selection-prompt'
import { execaCommand } from 'execa'

inquirer.registerPrompt('file-tree-selection', inquirerFileTreeSelection)

const newLineRegExp = /\r?\n/
const errCodeRegExp = /error TS(?<errCode>\d+)/
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const cli = cac('tsc-err-dirs')
const tscSpinner = ora(chalk.yellow('Start tsc compiling ...'))

type RawErrsMap = Map<string, TscErrorInfo[]>
interface TscErrorInfo {
  filePath: string
  errCode: number
  errMsg: string
  line: number
  col: number
}
interface RootAndTarget {
  root: string
  targetAbsPath: string
}

function isFilePath(absPath: string) {
  return (absPath.split(path.sep).pop()?.split('.').length ?? 0) > 1
}
function getTargetDir(dirArg: string): string {
  if (!dirArg) {
    throw new Error("You didn't give a directory path")
  }
  const targetDir = dirArg.startsWith('.')
    ? path.join(__dirname, dirArg)
    : dirArg.startsWith('/')
    ? dirArg
    : (() => {
        throw new Error('invalid directory path')
      })()

  return targetDir
}
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
function showFileErrs(options: {
  selectedPath: string
  rootAbsPath: string
  rawAllErrsMap: RawErrsMap
}) {
  const { selectedPath, rootAbsPath, rawAllErrsMap } = options
  const foundErrsByFilePath =
    [...rawAllErrsMap.entries()].find(([relativeToRoot]) =>
      path.join(rootAbsPath, relativeToRoot).includes(selectedPath)
    )?.[1] ?? []
  const selectedFileErrsStdout = foundErrsByFilePath
    .map((errInfo) => {
      return `
${chalk.bold.red(
  `${path.join(rootAbsPath, errInfo.filePath)}(${errInfo.line},${errInfo.col})`
)}
${chalk.blue(`error TS${errInfo.errCode}`)}: ${errInfo.errMsg}
    `
    })
    .join('\n')
  console.log(selectedFileErrsStdout)
}
async function getTscCompileStdout(
  // The `cwd` dir requires an existing `tsconfig.json` file
  options: RootAndTarget & {
    pretty?: boolean
  }
) {
  const { root = process.cwd(), pretty = false, targetAbsPath = root } = options
  const baseConfigPath = path.join(root, 'tsconfig.json')
  const tmpConfigPath = path.join(root, 'tsconfig.tmp.json')

  try {
    const tmpTsConfig: Record<string, any> = {
      extends: baseConfigPath,
      compilerOptions: {
        emitDeclarationOnly: false,
      },
    }
    if (isFilePath(targetAbsPath)) {
      tmpTsConfig.files = [targetAbsPath]
    }
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
    const cmd = `tsc --noEmit --project ${tmpConfigPath} --pretty ${pretty}`
    console.log(
      `\n$ ${chalk.yellowBright(root)}\n  ${chalk.bold.gray(
        `tsc running on ${chalk.bold.blue(targetAbsPath)} ...`
      )}\n`
    )
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
async function getRawErrsMap(options: RootAndTarget) {
  const tscErrorStdout = await getTscCompileStdout(options)
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
async function selectFile(
  options: RootAndTarget & {
    rawErrsMap: RawErrsMap
  }
) {
  const { root, targetAbsPath, rawErrsMap } = options
  const errsCountNumLength = String(
    [...rawErrsMap.values()].reduce((prev, next) => {
      return (prev += next.length)
    }, 0)
  ).length

  // Aggregation by file path and make an interactive view to select
  const isOptionPathHasErr =
    (optionStr: string) => (relativeToRoot: string) => {
      const absPath = path.join(root, relativeToRoot)
      return absPath.includes(optionStr)
    }
  const optionStrTransformer = (optionStr: string) => {
    if (optionStr === targetAbsPath) {
      return chalk.yellowBright(`root: ${targetAbsPath}`)
    }

    const optionStrLastUnit = optionStr.split(path.sep).pop() ?? ''
    const optionStrIsFilePath = isFilePath(optionStrLastUnit)
    const colorFn = optionStrIsFilePath
      ? chalk.blue
      : chalk.italic.bold.yellowBright
    const errsCountInPath = [...rawErrsMap.keys()]
      .filter(isOptionPathHasErr(optionStr))
      .reduce((prev, hasErrPath) => {
        return prev + (rawErrsMap.get(hasErrPath)?.length ?? 0)
      }, 0)
    return `${chalk.bold.redBright(
      `${String(errsCountInPath).padStart(errsCountNumLength)} errors`
    )} ${colorFn(optionStrLastUnit + (optionStrIsFilePath ? '' : '/'))}`
  }
  const selectedFilePath = await inquirer.prompt([
    {
      type: 'file-tree-selection',
      name: 'file',
      message: 'select file to show error details',
      pageSize: 20,
      root: targetAbsPath, // this `root` property is different, it's used for display a directory's file tree
      onlyShowValid: true,
      validate: (optionStr) => {
        return [...rawErrsMap.keys()].some(isOptionPathHasErr(optionStr))
      },
      transformer: optionStrTransformer,
    },
  ])
  return selectedFilePath?.file ?? ''
}

try {
  console.log(
    `\n${chalk.bold.blue(`
_____         _____           ____  _          
|_   _|__  ___| ____|_ __ _ __|  _ \\(_)_ __ ___ 
  | |/ __|/ __|  _| | '__| '__| | | | | '__/ __|
  | |\\__ \\ (__| |___| |  | |  | |_| | | |  \\__ \\
  |_||___/\\___|_____|_|  |_|  |____/|_|_|  |___/
  `)}`
  )
  const parsedEnvArgs = cli.parse()
  const rootDirArg = parsedEnvArgs.args[0]
  const rootAbsPath = getTargetDir(rootDirArg)
  const baseRootAndTarget = {
    root: rootAbsPath,
    targetAbsPath: rootAbsPath,
  }
  const rawAllErrsMap = await getRawErrsMap(baseRootAndTarget)
  let selectedPath = rootAbsPath
  do {
    selectedPath = await selectFile({
      root: rootAbsPath,
      targetAbsPath: selectedPath,
      rawErrsMap: rawAllErrsMap,
    })
    if (!selectedPath) {
      throw new Error('failed to select file!')
    }
  } while (!isFilePath(selectedPath))

  // show selected file's pretty tsc errors information
  showFileErrs({
    selectedPath,
    rootAbsPath,
    rawAllErrsMap,
  })
} catch (err) {
  console.log(chalk.red(`\n${err}`))
}
