export type RawErrsMap = Map<string, TscErrorInfo[]>
export interface TscErrorInfo {
  filePath: string
  errCode: number
  errMsg: string
  line: number
  col: number
}
export interface CollectLineNumbers {
  target: number
  next: number
  prev?: number
}
export type CollectLines = {
  [key in keyof CollectLineNumbers]: string
}
export interface RootAndTarget {
  root: string
  targetAbsPath: string
}
export interface OptionContext {
  engine: 'tsc' | 'vue-tsc'
}
export type Context = RootAndTarget & {
  rawErrsMap: RawErrsMap
  openedDirs: Set<string>
  options: OptionContext
  lastActivePath?: string
}
