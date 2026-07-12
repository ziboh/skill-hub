export type IconKind = 'key' | 'inline-svg' | 'src' | 'local' | 'empty'

export interface IconValue {
  kind: IconKind
  value: string
}

export type IconAsset =
  | { type: 'module-svg'; load: () => Promise<string> }
  | { type: 'module-url'; load: () => Promise<string> }
  | { type: 'inline-svg'; svg: string }
  | { type: 'src'; src: string }

export type ResolvedIcon =
  | { mode: 'svg'; svg: string }
  | { mode: 'img'; src: string }
  | { mode: 'empty' }

export type ParseRule = {
  id: string
  order: number
  test: (raw: string) => boolean
  parse: (raw: string) => IconValue
}
