# tsc-err-dirs [![npm](https://img.shields.io/npm/v/@slackoff/tsc-err-dirs.svg)](https://npmjs.com/package/@slackoff/tsc-err-dirs)

按文件树目录展示 tsc 错误数量，可以在更改文件后实时更新。

## 效果截图

<img width="612" alt="image" src="https://user-images.githubusercontent.com/46062972/190348158-a42b47d5-468f-4b9e-b555-36f6dc680fc4.png">

## 环境需求
 
- node 版本: >=16
- tsc 版本: >=4.5.5
- 安装 [Nerd Font](https://github.com/ryanoasis/nerd-fonts)

> 警告：推荐在 Mac OS 或 Linux 下使用该 CLI 应用，在 Windows 的 shell 中可能有诸多限制导致效果无法实现。

## 安装

```bash
npm i -g @slackoff/tsc-err-dirs
```

## 使用方法

```bash
# the project root path MUST contains `tsconfig.json`
tsc-err-dirs <path-to-your-project-root>
```

## 原理

因为 `tsc` 无法在单独编译一个大项目中的某一个文件，我们必须找一个替代方案。

1. 使用 `tsc --noEmit --pretty false` 来获取没有美化过的报错信息。
2. 提取出 stdout 然后解析成结构化的每个文件的错误信息数据。
3. 使用 [inquirer-file-tree-selection-prompt](https://www.npmjs.com/package/inquirer-file-tree-selection-prompt) 来显示一个每个目录包含其错误数的文件树。


## License

[MIT](./LICENSE) License © 2022 [ShenQingchuan](https://github.com/ShenQingchuan)
