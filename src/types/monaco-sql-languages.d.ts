// monaco-sql-languages 未随包提供深层路径的类型声明，这里补最小声明
declare module 'monaco-sql-languages/esm/languages/pgsql/pgsql' {
  import type { IMonarchLanguage, LanguageConfiguration } from 'monaco-editor'
  export const conf: LanguageConfiguration
  export const language: IMonarchLanguage
}
