export type LanguageOption = {
  code: string
  name: string
  enabled: boolean
  default?: boolean
}

/** 本模板固定仅中文前台；不再提供 English 开关。 */
export const DEFAULT_LANGUAGES: LanguageOption[] = [
  { code: 'zh-CN', name: '中文', enabled: true, default: true },
]

export const LANGUAGES_KEY = 'languages'
