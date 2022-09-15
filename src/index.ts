#!/usr/bin/env node
import path from 'node:path'
import chokidar from 'chokidar'
import cac from 'cac'
import chalk from 'chalk'
import inquirer from 'inquirer'
import inquirerFileTreeSelection from 'inquirer-file-tree-selection-prompt'
import ensureTscVersion from './check-tsc-version'
import { showAppHeader } from './show-console-print'
import { getRawErrsSumCount, getTargetDir, isFilePath } from './utils'
import { getRawErrsMapFromTsCompile } from './ts-errs-map'
import type { Context, RawErrsMap } from './types'

inquirer.registerPrompt('file-tree-selection', inquirerFileTreeSelection)

function showFileErrs(options: {
  selectedPath: string
  rootAbsPath: string
  rawErrsMap: RawErrsMap
}) {
  const { selectedPath, rootAbsPath, rawErrsMap } = options
  const foundErrsByFilePath =
    [...rawErrsMap.entries()].find(([relativeToRoot]) =>
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
function isOptionPathContained({
  root,
  optionPath,
}: {
  root: string
  optionPath: string
}) {
  return (relativeToRoot: string) => {
    const absPath = path.join(root, relativeToRoot)
    return absPath.includes(optionPath)
  }
}
function createOptionPathTransformer({
  root,
  targetAbsPath,
  rawErrsMap,
}: Context) {
  return (optionPath: string) => {
    const errsCountNumLength = String(getRawErrsSumCount(rawErrsMap)).length
    if (optionPath === targetAbsPath) {
      return chalk.yellowBright(`root: ${targetAbsPath}`)
    }

    const optionPathLastUnit = optionPath.split(path.sep).pop() ?? ''
    const optionPathIsFilePath = isFilePath(optionPathLastUnit)
    const colorFn = optionPathIsFilePath
      ? chalk.blue
      : chalk.italic.bold.yellowBright
    const errsCountInPath = [...rawErrsMap.keys()]
      .filter(isOptionPathContained({ root, optionPath }))
      .reduce((prev, hasErrPath) => {
        return prev + (rawErrsMap.get(hasErrPath)?.length ?? 0)
      }, 0)
    return `${chalk.bold.redBright(
      `${String(errsCountInPath).padStart(errsCountNumLength)} errors`
    )} ${colorFn(
      `${optionPathIsFilePath ? '\uF0F6' : '\uF413'} ${optionPathLastUnit}`
    )}`
  }
}
function showSelectFilePrompt(ctx: Context) {
  const { root, targetAbsPath, rawErrsMap } = ctx
  const prompt = inquirer.prompt({
    type: 'file-tree-selection',
    name: 'file',
    message: 'select file to show error details',
    pageSize: 20,
    root: targetAbsPath, // this `root` property is different, it's used for display a directory's file tree
    // Maybe some tsc errors are out of this root
    onlyShowValid: true,
    validate: (optionPath: string) => {
      const hasErrilesUnderRoot = [...rawErrsMap.keys()].some(
        isOptionPathContained({ root, optionPath })
      )
      return hasErrilesUnderRoot
    },
    transformer: createOptionPathTransformer(ctx),
  })
  return prompt
}
function guardErrsMapNotEmpty(rawErrsMap: RawErrsMap) {
  const errsCount = getRawErrsSumCount(rawErrsMap)
  if (errsCount === 0) {
    console.log(`\n🎉 ${chalk.bold.greenBright('Found 0 Errors.')}\n`)
    process.exit()
  }
}

try {
  await ensureTscVersion()
  const cli = cac('tsc-err-dirs')
  showAppHeader(cli)

  const parsedEnvArgs = cli.parse()
  const rootDirArg = parsedEnvArgs.args[0]
  const rootAbsPath = getTargetDir(rootDirArg)
  if (isFilePath(rootAbsPath)) {
    throw new Error("Can't run tsc-err-dirs on single file.")
  }

  // Generate a map to store errors info
  const _initRawErrsMap = await getRawErrsMapFromTsCompile(rootAbsPath)
  guardErrsMapNotEmpty(_initRawErrsMap)

  // Watch the `rootAbsPath` for any changes
  const rootWatcher = await new Promise<chokidar.FSWatcher>((resolve) => {
    const watchTarget = `${path.join(rootAbsPath, '**/*.(ts|tsx)')}`
    const _watcher = chokidar
      .watch(watchTarget, {
        awaitWriteFinish: true,
      })
      .on('ready', () => {
        console.log(
          `${chalk.blue(`[WATCH] ${chalk.white(watchTarget)} is ready`)}\n`
        )
        resolve(_watcher)
      })
  })

  const ctx = {
    root: rootAbsPath,
    targetAbsPath: rootAbsPath,
    rawErrsMap: _initRawErrsMap,
  }
  // Bind watcher to the selector view
  const selectFile = async (ctx: Context) => {
    return new Promise<string>((resolveSelectFile, rejectSelectFile) => {
      const prompt = showSelectFilePrompt(ctx)
      rootWatcher.on('change', (changedPath) => {
        // @ts-expect-error: The `close` method is protected in TypeScript
        // But we need it to close the selector view
        prompt.ui.close()
        const fileChangedMsg = `\n${chalk.blue(
          `[WATCH] ${chalk.white(changedPath)} has changed ...`
        )}`
        rejectSelectFile(
          new Error(fileChangedMsg) // throw out message for chokidar change event
        )
      })

      prompt.then(({ file: selectedFilePath }) => {
        console.log() // start a new line to avoid next line print on the same line
        resolveSelectFile(selectedFilePath)
      })
    })
  }

  // Show `File-Select` prompt view
  let selectedPath = rootAbsPath
  do {
    // Aggregation by file path and make an interactive view to select
    try {
      selectedPath = await selectFile({
        ...ctx,
        targetAbsPath: selectedPath,
      })
    } catch (error) {
      // Re-generate a map to store errors info
      if (error instanceof Error) {
        console.log(error.message)
        ctx.rawErrsMap.clear()
        ctx.rawErrsMap = await getRawErrsMapFromTsCompile(rootAbsPath, true)
        guardErrsMapNotEmpty(ctx.rawErrsMap)
        continue
      }
    }
    if (!selectedPath) {
      throw new Error('failed to select file!')
    }
    if (isFilePath(selectedPath)) {
      // show selected file's pretty tsc errors information
      showFileErrs({
        selectedPath,
        rootAbsPath,
        rawErrsMap: ctx.rawErrsMap,
      })
      selectedPath = rootAbsPath
    }
    // eslint-disable-next-line no-constant-condition
  } while (true)
} catch (err) {
  console.log(chalk.red(`\n${err}`))
}
