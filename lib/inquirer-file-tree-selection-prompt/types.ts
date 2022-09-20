export interface Node {
  name: string
  path: string
  type: 'directory' | 'file'
  parent?: Node | undefined
  children?: Node[]
  open?: boolean
  isValid?: boolean
  hasValidChild?: boolean
  _rootNode?: boolean
}
