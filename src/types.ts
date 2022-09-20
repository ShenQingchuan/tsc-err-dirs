export type RawErrsMap = Map<string, TscErrorInfo[]>
export interface TscErrorInfo {
  filePath: string
  errCode: number
  errMsg: string
  line: number
  col: number
}
export interface RootAndTarget {
  root: string
  targetAbsPath: string
}
export type Context = RootAndTarget & {
  rawErrsMap: RawErrsMap
  openedDirs: Set<string>
  lastActivePath?: string
}
