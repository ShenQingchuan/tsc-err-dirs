# tsc-err-dirs [![npm](https://img.shields.io/npm/v/@slackoff/tsc-err-dirs.svg)](https://npmjs.com/package/@slackoff/tsc-err-dirs)

[中文文档](./README-CN.md)

Display tsc errors count on file tree, can hot update when you change those files.

## Screeshot

<img width="612" alt="image" src="https://user-images.githubusercontent.com/46062972/190348158-a42b47d5-468f-4b9e-b555-36f6dc680fc4.png">

## Requirement
 
- node version: >=16
- tsc version: >=4.5.5
- Installed [Nerd Font](https://github.com/ryanoasis/nerd-fonts)

> **Warning**: We recommend you to use this CLI app in Mac OS or Linux, 
  since it's using a lot of shell features which may not have good support in Windows.

## Install

```bash
npm i -g @slackoff/tsc-err-dirs
```

## Usage

```bash
# the project root path MUST contains `tsconfig.json`
tsc-err-dirs <path-to-your-project-root>
```

## Internal

Since `tsc` doesn't provide a way to get the errors count of each file, we have to use a trick to get it.

1. Use `tsc --noEmit --pretty false` to get all the errors of each file which are not prettified format.
2. Extract stdout and parse it to get the errors info of each file.
3. Use [inquirer-file-tree-selection-prompt](https://www.npmjs.com/package/inquirer-file-tree-selection-prompt) to display the errors count on file tree.


## License

[MIT](./LICENSE) License © 2022 [ShenQingchuan](https://github.com/ShenQingchuan)
