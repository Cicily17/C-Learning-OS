// C 语言代码补全：输入前两个字母（不区分大小写）提示剩余字母。
// 纯前端词库，无需后端；覆盖关键字、预处理、标准库常用函数与类型。

const KEYWORDS = [
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
  'inline', 'int', 'long', 'register', 'restrict', 'return', 'short',
  'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union',
  'unsigned', 'void', 'volatile', 'while', '_Bool', '_Complex',
]

const PREPROC = [
  'include', 'define', 'ifndef', 'ifdef', 'endif', 'undef', 'pragma',
  'stdio.h', 'stdlib.h', 'string.h', 'math.h', 'ctype.h', 'limits.h',
  'stdbool.h', 'stdint.h', 'time.h', 'stddef.h', 'assert.h',
]

const FUNCTIONS = [
  'printf', 'scanf', 'puts', 'putchar', 'getchar', 'fgets', 'fputs',
  'fprintf', 'fscanf', 'sprintf', 'sscanf', 'fopen', 'fclose', 'fread',
  'fwrite', 'strlen', 'strcpy', 'strncpy', 'strcmp', 'strncmp', 'strcat',
  'strncat', 'strchr', 'strrchr', 'strstr', 'strtok', 'atoi', 'atol',
  'atof', 'strtol', 'malloc', 'calloc', 'realloc', 'free', 'memset',
  'memcpy', 'memmove', 'memcmp', 'qsort', 'bsearch', 'abs', 'labs',
  'fabs', 'sqrt', 'pow', 'floor', 'ceil', 'round', 'rand', 'srand',
  'time', 'exit', 'main', 'isalpha', 'isdigit', 'isspace', 'toupper',
  'tolower', 'assert',
]

const TYPES = ['NULL', 'EOF', 'size_t', 'ptrdiff_t', 'int8_t', 'int32_t', 'uint32_t', 'true', 'false']

// 高频优先：让 "pr" 先联想 printf 而不是 pragma
const POPULAR = [
  'printf', 'scanf', 'int', 'char', 'for', 'while', 'if', 'else', 'return',
  'void', 'main', 'include', 'define', 'float', 'double', 'string.h', 'stdio.h',
  'struct', 'sizeof', 'strlen', 'strcpy', 'strcmp', 'malloc', 'free', 'puts',
  'getchar', 'switch', 'case', 'break', 'continue', 'const', 'unsigned', 'long',
  'short', 'static', 'typedef', 'do', 'enum', 'goto', 'stdlib.h', 'math.h',
]
const POPULAR_RANK: Record<string, number> = {}
POPULAR.forEach((w, i) => { POPULAR_RANK[w] = i })

export const C_WORDS: string[] = Array.from(
  new Set([...KEYWORDS, ...PREPROC, ...FUNCTIONS, ...TYPES]),
).sort((a, b) => {
  const ra = POPULAR_RANK[a] ?? 1000
  const rb = POPULAR_RANK[b] ?? 1000
  return ra - rb || a.length - b.length || a.localeCompare(b)
})

export interface Completion {
  /** 完整候选词 */
  word: string
  /** 已输入前缀 */
  typed: string
  /** 需要补上的剩余字母 */
  remaining: string
  /** 候选在文本中的起始下标 */
  start: number
  /** 候选在文本中的结束下标 */
  end: number
}

/**
 * 根据光标位置取当前正在输入的英文单词，>=2 个字母时返回候选补全。
 * 匹配不区分大小写；remaining 为需要补上的剩余字母。
 */
export function getCompletions(text: string, cursor: number, limit = 8): Completion[] {
  const before = text.slice(0, cursor)
  const match = before.match(/[A-Za-z_][A-Za-z0-9_]*$/)
  if (!match) return []
  const typed = match[0]
  if (typed.length < 2) return []
  const lower = typed.toLowerCase()
  const start = cursor - typed.length
  return C_WORDS
    .filter((w) => w.toLowerCase().startsWith(lower) && w.toLowerCase() !== lower)
    .slice(0, limit)
    .map((word) => ({ word, typed, remaining: word.slice(typed.length), start, end: cursor }))
}

/** 用完整候选词替换光标前的输入片段，返回新文本与新光标位置 */
export function applyCompletion(text: string, c: Completion): { text: string; cursor: number } {
  const next = text.slice(0, c.start) + c.word + text.slice(c.end)
  return { text: next, cursor: c.start + c.word.length }
}
