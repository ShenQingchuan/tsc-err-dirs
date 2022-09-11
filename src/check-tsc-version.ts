import semver from 'semver'
import binaryVersion from 'bin-version'
import semverTruncate from 'semver-truncate'
import chalk from 'chalk'
import type { Options } from 'bin-version'

async function checkBinaryVersion(
  binary: string,
  semverRange: string,
  options?: Options
) {
  if (typeof binary !== 'string' || typeof semverRange !== 'string') {
    throw new TypeError('`binary` and `semverRange` arguments required')
  }

  if (!semver.validRange(semverRange)) {
    throw new Error('Invalid version range')
  }

  const version = await binaryVersion(binary, options)

  if (semver.satisfies(semverTruncate(version, 'patch'), semverRange)) {
    return
  }

  const error = new Error(
    `${binary} ${version} doesn't satisfy the version requirement of ${semverRange}`
  )
  error.name = 'InvalidBinaryVersion'
  throw error
}

export default async function ensureTscVersion() {
  try {
    await checkBinaryVersion('tsc', '>=4.5')
  } catch (tscVersionErr) {
    console.log(`\n${chalk.red(tscVersionErr)}\n`)
    process.exit()
  }
}
