'use strict'
/**
 * `file-tree-slection` type prompt
 *
 * forked from https://github.com/anc95/inquirer-file-tree-selection
 */

import path from 'node:path'
import fs from 'node:fs'
import chalk from 'chalk'
import figures from 'figures'
import cliCursor from 'cli-cursor'
import { fromEvent } from 'rxjs'
import { filter, map, share, takeUntil } from 'rxjs/operators'
import observe from 'inquirer/lib/utils/events.js'
import Base from 'inquirer/lib/prompts/base.js'
import Paginator from 'inquirer/lib/utils/paginator.js'
import type { Answers, Question, Transformer } from 'inquirer'
import type { Node } from './types'

type FileTreeSelectionPromptOptions<T extends Answers = any> = Pick<
  Question<T>,
  'type' | 'name' | 'message' | 'filter' | 'validate' | 'default'
> & {
  transformer?: Transformer<T>
  /**
   * count of items show in terminal. default: 10
   */
  pageSize?: number
  /**
   * if true, will only show directory. Default: false
   */
  onlyShowDir?: boolean
  /**
   * if true, will only show valid files (if validate is provided). Default: false.
   */
  onlyShowValid?: boolean
  /**
   * if true, will hide children of valid directories (if validate is provided). Default: false.
   */
  hideChildrenOfValid?: boolean
  /**
   * Default to be current process.cwd()
   */
  root?: string
  /**
   * Hide root, Default: false
   */
  hideRoot?: boolean
  /**
   * show `..` in inside root dir, and you the user can press space on it to go upper directory. Default: false
   */
  enableGoUpperDirectory?: boolean
  /**
   * cache opened directories
   * ()
   */
  openedDirs?: string[]
  onDirAction?: (path: string, actionType: 'open' | 'close') => void
}

declare module 'inquirer' {
  interface QuestionMap<T> {
    fileTreeSelection: Omit<FileTreeSelectionPromptOptions<T>, 'type'> & {
      type: 'file-tree-selection'
    }
  }
}

const isSubPath = (parent: string, child: string) => {
  return !path.relative(parent, child).startsWith('.')
}
const getParentDir = (dir: string) => {
  return path.dirname(dir)
}
const getUpperDirNode = (dir: string) => {
  const parentDir = getParentDir(dir)

  const parentNode: Node = {
    name: '..',
    path: parentDir,
    type: 'directory',
    isValid: true,
  }

  return parentNode
}

/**
 * type: string
 * onlyShowDir: boolean (default: false)
 */
class FileTreeSelectionPrompt extends Base<
  FileTreeSelectionPromptOptions & { states: any }
> {
  rootNode: Node
  firstRender: boolean
  shownList: Node[]
  paginator: Paginator
  done?: (...args: any[]) => void
  active?: Node

  get fileTree() {
    if (this.opt.hideRoot) {
      return this.rootNode
    }

    return {
      children: [this.rootNode],
    }
  }

  constructor(questions: any, rl: any, answers: any) {
    super(questions, rl, answers)

    const root = path.resolve(process.cwd(), this.opt.root || '.')
    const rootNode: Node = {
      path: root,
      type: 'directory',
      name: '.(root directory)',
      _rootNode: true,
    }

    this.rootNode = rootNode

    this.shownList = []

    this.firstRender = true

    this.opt = {
      ...{
        default: null,
        pageSize: 10,
        onlyShowDir: false,
      },
      ...this.opt,
    }

    this.paginator = new Paginator(this.screen)
  }

  /**
   * Start the Inquiry session
   * @param  {Function} cb  Callback when prompt is done
   * @return {this}
   */

  async _run(cb: any) {
    this.done = cb

    const events = observe(this.rl)

    const validation = this.handleSubmitEvents(
      events.line.pipe(map(() => this.active!.path))
    )
    validation.success.forEach(this.onSubmit.bind(this))
    validation.error.forEach(this.onError.bind(this))

    events.normalizedUpKey
      .pipe(takeUntil(validation.success))
      .forEach(this.onUpKey.bind(this))
    events.normalizedDownKey
      .pipe(takeUntil(validation.success))
      .forEach(this.onDownKey.bind(this))
    events.keypress
      .pipe(
        filter(({ key }) => key.name === 'right'),
        share()
      )
      .pipe(takeUntil(validation.success))
      .forEach(this.onRigthKey.bind(this))
    events.keypress
      .pipe(
        filter(({ key }) => key.name === 'left'),
        share()
      )
      .pipe(takeUntil(validation.success))
      .forEach(this.onLeftKey.bind(this))
    events.keypress
      .pipe(
        filter(({ key }) => key.name === 'q'),
        share()
      )
      .pipe(takeUntil(validation.success))
      .forEach(() => {
        process.exit(0)
      })

    events.spaceKey
      .pipe(takeUntil(validation.success))
      .forEach(this.onSpaceKey.bind(this, false))

    function normalizeKeypressEvents(value: string, key: any) {
      return { value, key: key || {} }
    }
    fromEvent((this.rl as any).input, 'keypress', normalizeKeypressEvents)
      .pipe(
        filter(({ key }) => key && key.name === 'tab'),
        share()
      )
      .pipe(takeUntil(validation.success))
      .forEach(this.onSpaceKey.bind(this, true))

    cliCursor.hide()
    if (this.firstRender) {
      const rootNode = this.rootNode
      await this.prepareChildren(rootNode)
      rootNode.open = true
      this.active = this.active || rootNode.children?.[0]
      if (this.active) {
        await this.prepareChildren(this.active)
      }
      this.render()
    }

    return this
  }

  renderFileTree(root = this.fileTree, indent = 2) {
    const children = root.children || []

    let output = ''
    const transformer = this.opt.transformer
    const isFinal = this.status === 'answered'
    let showValue

    children.forEach((itemPath) => {
      if (this.opt.onlyShowDir && itemPath.type !== 'directory') {
        return
      }

      this.shownList.push(itemPath)
      const prefix =
        itemPath.type === 'directory'
          ? itemPath.open
            ? `${figures.arrowDown} `
            : `${figures.arrowRight} `
          : itemPath === this.active
          ? `${figures.play} `
          : ''

      // when multiple is true, add radio icon at prefix
      const safeIndent =
        indent - prefix.length + 2 > 0 ? indent - prefix.length + 2 : 0

      if (itemPath.name === '..') {
        showValue = `${' '.repeat(
          safeIndent
        )}${prefix}..(Press \`Space\` to go parent directory)\n`
      } else if (transformer) {
        const transformedValue = transformer(itemPath.path, this.answers, {
          isFinal,
        })
        showValue = `${' '.repeat(safeIndent) + prefix + transformedValue}\n`
      } else {
        showValue = `${
          ' '.repeat(safeIndent) +
          prefix +
          itemPath.name +
          (itemPath.type === 'directory' ? path.sep : '')
        }\n`
      }

      if (itemPath === this.active && itemPath.isValid) {
        output += chalk.bold.cyan(showValue)
      } else if (itemPath === this.active && !itemPath.isValid) {
        output += chalk.red(showValue)
      } else {
        output += showValue
      }
      if (itemPath.open) {
        output += this.renderFileTree(itemPath, indent + 2)
      }
    })

    return output
  }

  getChildrenByPath(_path: string, parentNode: Node): Node[] {
    return fs.readdirSync(_path, { withFileTypes: true }).map((item) => {
      const childPath = path.resolve(_path, item.name)
      return {
        parent: parentNode,
        type: item.isDirectory()
          ? 'directory'
          : ('file' as 'directory' | 'file'),
        name: item.name,
        path: childPath,
      }
    })
  }

  async prepareChildren(node: Node): Promise<any> {
    const parentPath = node.path

    try {
      if (
        node.name === '..' ||
        !fs.lstatSync(parentPath).isDirectory() ||
        node.children ||
        node.open === true
      ) {
        return
      }

      const children = this.getChildrenByPath(parentPath, node)
      if (this.opt.openedDirs && this.opt.openedDirs.length > 0) {
        for (const child of children) {
          if (this.opt.openedDirs.includes(child.path)) {
            await this.prepareChildren(child)
            child.open = true
          }
        }
      }

      node.children = children
    } catch {
      // maybe for permission denied, we cant read the dir
      // do nothing here
    }

    const validate = this.opt.validate
    const filter = async (val: any) => {
      if (!this.opt.filter) {
        return val
      }

      // eslint-disable-next-line no-return-await, unicorn/no-array-method-this-argument
      return await this.opt.filter(val, this.answers)
    }

    if (validate) {
      const addValidity = async (fileObj: Node) => {
        const isValid = await validate(await filter(fileObj.path), this.answers)
        fileObj.isValid = false
        if (isValid === true) {
          if (this.opt.onlyShowDir) {
            if (fileObj.type === 'directory') {
              fileObj.isValid = true
            }
          } else {
            fileObj.isValid = true
          }
        }
        if (fileObj.children) {
          if (this.opt.hideChildrenOfValid && fileObj.isValid) {
            fileObj.children.length = 0
          }
          const children = fileObj.children.map((x: any) => x)
          for (
            let index = 0, length = children.length;
            index < length;
            index++
          ) {
            const child = children[index]
            await addValidity(child)
            if (child.isValid) {
              fileObj.hasValidChild = true
            }
            if (
              this.opt.onlyShowValid &&
              !child.hasValidChild &&
              !child.isValid
            ) {
              const spliceIndex = fileObj.children.indexOf(child)
              fileObj.children.splice(spliceIndex, 1)
            }
          }
        }
      }
      await addValidity(node)
    }

    if (this.opt.enableGoUpperDirectory && node === this.rootNode) {
      this.rootNode.children?.unshift(getUpperDirNode(this.rootNode.path))
    }

    // When it's single selection and has default value, we should expand to the default file.
    if (this.firstRender && this.opt.default) {
      const defaultPath = this.opt.default
      const founded = node.children?.find((item) => {
        if (item.name === '..') {
          return false
        }
        if (
          item.path === defaultPath ||
          defaultPath.includes(`${item.path}${path.sep}`)
        ) {
          item.open = true
          return true
        }
        return false
      })

      if (founded) {
        if (founded.path === defaultPath) {
          this.active = founded

          let parent = founded.parent

          while (parent && !parent._rootNode) {
            parent.open = true
            parent = parent.parent
          }
        } else {
          // eslint-disable-next-line no-return-await
          return await this.prepareChildren(founded)
        }
      }
    }

    !this.firstRender && this.render()
  }

  /**
   * Render the prompt to screen
   * @return {FileTreeSelectionPrompt} self
   */
  render(error?: any) {
    // Render question
    let message = this.getQuestion()

    if (this.firstRender) {
      message += chalk.dim('(Use arrow keys, Use space to toggle folder)')
    }

    if (this.status === 'answered') {
      message += chalk.cyan(this.active?.path ?? '')
    } else {
      this.shownList = []
      const fileTreeStr = this.renderFileTree()
      message += `\n${this.paginator.paginate(
        `${fileTreeStr}----------------`,
        this.shownList.indexOf(this.active!),
        this.opt.pageSize
      )}`
    }

    const bottomContent = error ? `\n${chalk.red('>> ')}${error}` : ''

    this.firstRender = false
    this.screen.render(message, bottomContent)
  }

  onEnd(state: { value: any }) {
    this.status = 'answered'
    // this.answer = state.value;

    // Re-render prompt
    this.render()

    this.screen.done()
    this.done?.(state.value)
  }

  onError(state: { isValid: any }) {
    this.render(state.isValid)
  }

  /**
   * When user press `enter` key
   */

  onSubmit(state: { value: any }) {
    this.status = 'answered'

    this.render()

    this.screen.done()
    cliCursor.show()
    this.done?.(state.value)
  }

  moveActive(distance = 0) {
    const currentIndex = this.shownList.indexOf(this.active!)
    let index = currentIndex + distance

    if (index >= this.shownList.length) {
      index = 0
    } else if (index < 0) {
      index = this.shownList.length - 1
    }

    this.active = this.shownList[index]

    if (this.active.name !== '..') {
      this.prepareChildren(this.active)
    }

    this.render()
  }

  /**
   * When user press a key
   */
  onUpKey() {
    this.moveActive(-1)
  }

  onDownKey() {
    this.moveActive(1)
  }

  onLeftKey() {
    if (!this.active) return
    if (
      (this.active.type === 'file' || !this.active.open) &&
      this.active.parent
    ) {
      this.active = this.active.parent
    }
    this.active.open = false
    this.render()
    this.opt.onDirAction?.(this.active.path, 'close')
  }

  onRigthKey() {
    if (!this.active) return
    this.active.open = true
    this.render()
    this.opt.onDirAction?.(this.active.path, 'open')
  }

  async onSpaceKey(triggerByTab = false) {
    if (!this.active) return
    if (
      !triggerByTab &&
      this.active.name === '..' &&
      isSubPath(this.active.path, this.rootNode.path)
    ) {
      this.rootNode = {
        ...this.active,
        name: path.basename(this.active.path),
      }
      await this.prepareChildren(this.rootNode)
      this.active = this.rootNode.children![0]
      this.firstRender = true
      this.rootNode.open = true
      this.render()
      this.firstRender = false
      return
    }

    if (!triggerByTab) {
      if (this.active.isValid === false) {
        return
      }

      this.render()
      return
    }

    if (this.active.children && this.active.children.length === 0) {
      return
    }

    this.active.open = !this.active.open
    this.render()
  }
}

export default FileTreeSelectionPrompt
