import chalk from 'chalk'
import fetch from 'node-fetch'
import packageJSON from '../package.json'

export function showAppHeader() {
  const localVersion = packageJSON.version
  console.log(
    `\n${chalk.bold.blue(`
 _                                   _ _          
| |_ ___  ___    ___ _ __ _ __    __| (_)_ __ ___ 
| __/ __|/ __|  / _ \\ '__| '__|  / _\` | | '__/ __|
| |_\\__ \\ (__  |  __/ |  | |    | (_| | | |  \\__ \\
 \\__|___/\\___|  \\___|_|  |_|     \\__,_|_|_|  |___/  ${chalk.cyanBright(
   `[version: v${localVersion}]`
 )}
  `)}`
  )

  // Tips for latest version check
  fetch('https://registry.npmjs.org/-/package/@slackoff/tsc-err-dirs/dist-tags')
    .then((resp) => resp.json())
    .then((respJson: any) => {
      const respJsonLatest = respJson.latest
      if (respJsonLatest && respJsonLatest !== localVersion) {
        console.log(
          `\n💡 Latest version is ${chalk.bold.yellow(
            String(respJsonLatest)
          )},\n` +
            `   we recommend you to update by \`npm i -g @slackoff/tsc-err-dirs@latest\``
        )
      }
    })
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
