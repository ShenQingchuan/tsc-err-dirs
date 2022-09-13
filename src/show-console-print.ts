import chalk from 'chalk'
import packageJSON from '../package.json'

export function showAppHeader() {
  console.log(
    `\n${chalk.bold.blue(`
 _____         _____           ____  _          
|_   _|__  ___| ____|_ __ _ __|  _ \\(_)_ __ ___ 
  | |/ __|/ __|  _| | '__| '__| | | | | '__/ __|
  | |\\__ \\ (__| |___| |  | |  | |_| | | |  \\__ \\
  |_||___/\\___|_____|_|  |_|  |____/|_|_|  |___/  ${chalk.cyanBright(
    `[version: v${packageJSON.version}]`
  )}
  `)}`
  )
}
export function showFirstTscCompilePathInfo({
  cmd,
  rootAbsPath,
}: {
  cmd: string
  rootAbsPath: string
}) {
  console.log(
    `\n$ ${chalk.yellowBright(rootAbsPath)}\n  ${chalk.bold.gray(
      `tsc running for the first time ...`
    )}\n ${chalk.green('▷')} ${chalk.grey(` ${cmd}`)}\n`
  )
}
export function showTscReCompilePathInfo(rootAbsPath: string) {
  console.log(
    `${chalk.bold.gray(
      `Start re-run tsc on ${chalk.bold.blue(rootAbsPath)} ...`
    )}\n`
  )
}
