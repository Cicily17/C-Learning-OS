/**
 * 教学用的 C 常量表达式求值器。
 * 只处理不含副作用、类型可推断的表达式：字面量、已初始化的数值变量、
 * 数组元素、sizeof、算术 / 关系 / 逻辑 / 位运算与三目运算。
 * 任何不确定的情况一律返回 null，避免在讲解里给出错误结果。
 */

export type CValue = number | string | null

export interface CVar {
  type: string
  value?: number | string
  isArray?: boolean
  isChar?: boolean
  isFloat?: boolean
  /** 一维或多维数组按行展开后的元素 */
  elements?: (number | string)[]
  /** 数组长度（未初始化时也能知道） */
  length?: number
  /** 指针指向的变量名（仅限 &var 的简单情况） */
  pointsTo?: string
  /** 结构体 / 共用体的已知成员值 */
  members?: Record<string, number | string>
  /** 单行元素个数，二维数组用它换算下标 */
  cols?: number
  elemSize?: number
}

export type CVars = Map<string, CVar>

const TYPE_SIZE: Record<string, number> = {
  char: 1, short: 2, int: 4, long: 4, 'long long': 8,
  float: 4, double: 8, 'long double': 16, size_t: 8, 'void*': 8,
}

const CONSTANTS: Record<string, number> = {
  INT_MAX: 2147483647, INT_MIN: -2147483648,
  UINT_MAX: 4294967295, CHAR_MAX: 127, CHAR_MIN: -128,
  SHRT_MAX: 32767, LLONG_MAX: 9223372036854775807,
  true: 1, false: 0, NULL: 0,
}

const NUM_RE = /^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)(?:[uUlLfF]*)$/

type Tok = { k: 'num'; v: number } | { k: 'op'; v: string } | { k: 'str'; v: string } | { k: 'id'; v: string }

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === '"' || c === "'") {
      const quote = c
      let j = i + 1
      let raw = ''
      while (j < src.length && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < src.length) { raw += src[j] + src[j + 1]; j += 2; continue }
        raw += src[j]; j++
      }
      if (j >= src.length) return null
      if (quote === '"') out.push({ k: 'str', v: unescapeC(raw) })
      else {
        const val = unescapeC(raw)
        out.push({ k: 'num', v: val.length ? val.charCodeAt(0) : 0 })
      }
      i = j + 1
      continue
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i
      while (j < src.length && /[0-9a-fA-FxX.eE+\-uUlLfF]/.test(src[j])) {
        if ((src[j] === '+' || src[j] === '-') && !/[eE]/.test(src[j - 1])) break
        j++
      }
      const raw = src.slice(i, j)
      if (!NUM_RE.test(raw)) return null
      const n = Number(raw.replace(/[uUlLfF]+$/, ''))
      if (Number.isNaN(n)) return null
      out.push({ k: 'num', v: n })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++
      out.push({ k: 'id', v: src.slice(i, j) })
      i = j
      continue
    }
    const three = src.slice(i, i + 2)
    if (['<<', '>>', '<=', '>=', '==', '!=', '&&', '||'].includes(three)) {
      out.push({ k: 'op', v: three }); i += 2; continue
    }
    if ('+-*/%<>&|^!~?:(),'.includes(c)) { out.push({ k: 'op', v: c }); i++; continue }
    return null
  }
  return out
}

export function unescapeC(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '\\') { out += raw[i]; continue }
    const n = raw[i + 1]
    if (n === undefined) break
    switch (n) {
      case 'n': out += '\n'; break
      case 't': out += '\t'; break
      case 'r': out += '\r'; break
      case '0': out += '\0'; break
      case 'a': out += '\x07'; break
      case 'b': out += '\b'; break
      case 'f': out += '\f'; break
      case 'v': out += '\v'; break
      case '\\': out += '\\'; break
      case '"': out += '"'; break
      case "'": out += "'"; break
      default: out += n
    }
    i++
  }
  return out
}

export function escapeForDisplay(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')
}

function resolveArrayRefs(expr: string, vars?: CVars): string | null {
  if (!vars) return expr
  // two-dimensional reference first
  let out = expr.replace(/\b([A-Za-z_]\w*)\s*\[\s*([^\][]+?)\s*\]\s*\[\s*([^\][]+?)\s*\]/g, (m, name, r, c) => {
    const v = vars.get(name)
    if (!v?.elements || !v.cols) return m
    const row = evalC(r, vars)
    const col = evalC(c, vars)
    if (typeof row !== 'number' || typeof col !== 'number') return m
    const idx = row * v.cols + col
    const val = v.elements[idx]
    return typeof val === 'number' ? String(val) : m
  })
  out = out.replace(/\b([A-Za-z_]\w*)\s*\[\s*([^\][]+?)\s*\]/g, (m, name, idxExpr) => {
    const v = vars.get(name)
    if (!v?.elements) return m
    const idx = evalC(idxExpr, vars)
    if (typeof idx !== 'number' || idx < 0 || idx >= v.elements.length) return m
    const val = v.elements[idx]
    return typeof val === 'number' ? String(val) : m
  })
  return out
}

export function evalC(rawExpr: string, vars?: CVars): CValue {
  if (!rawExpr) return null
  let expr = rawExpr.trim().replace(/;\s*$/, '').replace(/\/\*.*?\*\//g, '').trim()
  if (!expr) return null
  const pureString = expr.match(/^"([\s\S]*)"$/)
  if (pureString) return unescapeC(pureString[1])
  const floatMode = /\(\s*(?:double|float)\s*\)/.test(expr)

  expr = expr.replace(/\(\s*(?:const\s+)?(?:unsigned\s+|signed\s+)?(?:long\s+long|long\s+double|long|short|int|char|float|double|size_t|void\s*\*)\s*\)/g, ' ')
  expr = expr.replace(/sizeof\s*\(\s*([A-Za-z_]\w*)\s*\)/g, (m, name) => {
    const v = vars?.get(name)
    if (v?.isArray && v.elemSize) return String((v.length ?? v.elements?.length ?? 0) * v.elemSize)
    if (v && !v.isArray) return String(v.type.trim().endsWith('*') ? 8 : (TYPE_SIZE[v.type.trim()] ?? 4))
    return m
  })
  expr = expr.replace(/sizeof\s*\(\s*([A-Za-z_]\w*)\s*\[[^\]]*\]\s*\)/g, (m, name) => {
    const v = vars?.get(name)
    if (v?.isArray && v.elemSize) return String(v.elemSize)
    return m
  })
  expr = expr.replace(/strlen\s*\(\s*([A-Za-z_]\w*)\s*\)/g, (m, name) => {
    const v = vars?.get(name)
    if (v?.isArray && v.isChar && v.elements) {
      const end = v.elements.indexOf(0)
      return String(end >= 0 ? end : v.elements.length)
    }
    return m
  })
  expr = expr.replace(/sizeof\s*\(\s*(unsigned\s+)?(long\s+long|long|short|int|char|float|double|size_t)\s*\)/g,
    (_m, u, t) => String(TYPE_SIZE[(u ? 'unsigned ' : '') + t] ?? TYPE_SIZE[t] ?? 4))

  const resolved = resolveArrayRefs(expr, vars)
  if (resolved === null) return null
  expr = resolved

  expr = expr.replace(/\b([A-Za-z_]\w*)\b/g, (m) => {
    if (m in CONSTANTS) return String(CONSTANTS[m])
    const v = vars?.get(m)
    if (v && typeof v.value === 'number' && !v.isArray) return String(v.value)
    return m
  })
  // 引号外仍有标识符，说明存在无法静态求值的名字
  let inQuote = ''
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (inQuote) {
      if (ch === '\\') { i++; continue }
      if (ch === inQuote) inQuote = ''
      continue
    }
    if (ch === '"' || ch === "'") { inQuote = ch; continue }
    if (/[A-Za-z_]/.test(ch)) return null
  }

  const toks = tokenize(expr)
  if (!toks || !toks.length) return null

  let pos = 0
  const peek = () => toks[pos]
  const eat = (v?: string) => {
    const t = toks[pos]
    if (!t) return null
    if (v !== undefined && !(t.k === 'op' && t.v === v)) return null
    pos++
    return t
  }

  const binaryPrec: Record<string, number> = {
    '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5,
    '==': 6, '!=': 6, '<': 7, '<=': 7, '>': 7, '>=': 7,
    '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
  }

  function parseUnary(): CValue {
    const t = peek()
    if (!t) return null
    if (t.k === 'op' && ['+', '-', '!', '~'].includes(t.v)) {
      pos++
      const v = parseUnary()
      if (typeof v !== 'number') return null
      if (t.v === '-') return -v
      if (t.v === '+') return v
      if (t.v === '!') return v === 0 ? 1 : 0
      return ~v
    }
    return parsePrimary()
  }

  function parsePrimary(): CValue {
    const t = peek()
    if (!t) return null
    if (t.k === 'num') { pos++; return t.v }
    if (t.k === 'str') { pos++; return t.v }
    if (t.k === 'op' && t.v === '(') {
      pos++
      const v = parseTernary()
      if (!eat(')')) return null
      return v
    }
    return null
  }

  function parseBinary(minPrec: number): CValue {
    let left = parseUnary()
    while (true) {
      const t = peek()
      if (!t || t.k !== 'op') break
      const prec = binaryPrec[t.v]
      if (!prec || prec < minPrec) break
      pos++
      if (t.v === '&&') {
        if (left === 0) { parseBinary(prec + 1); left = 0; continue }
      }
      if (t.v === '||') {
        if (left !== 0 && left !== null) { parseBinary(prec + 1); left = 1; continue }
      }
      const right = parseBinary(prec + 1)
      if (typeof left === 'string' || typeof right === 'string') return null
      if (typeof left !== 'number' || typeof right !== 'number') return null
      switch (t.v) {
        case '+': left = left + right; break
        case '-': left = left - right; break
        case '*': left = left * right; break
        case '/':
          if (right === 0) return null
          left = floatMode && !Number.isInteger(left) || floatMode || !Number.isInteger(left) || !Number.isInteger(right)
            ? left / right
            : Math.trunc(left / right)
          break
        case '%':
          if (right === 0) return null
          left = left % right; break
        case '<<': left = left << right; break
        case '>>': left = left >> right; break
        case '&': left = left & right; break
        case '|': left = left | right; break
        case '^': left = left ^ right; break
        case '==': left = left === right ? 1 : 0; break
        case '!=': left = left !== right ? 1 : 0; break
        case '<': left = left < right ? 1 : 0; break
        case '<=': left = left <= right ? 1 : 0; break
        case '>': left = left > right ? 1 : 0; break
        case '>=': left = left >= right ? 1 : 0; break
        case '&&': left = left && right ? 1 : 0; break
        case '||': left = left || right ? 1 : 0; break
        default: return null
      }
    }
    return left
  }

  function parseTernary(): CValue {
    const cond = parseBinary(1)
    const t = peek()
    if (t && t.k === 'op' && t.v === '?') {
      pos++
      const a = parseTernary()
      if (!eat(':')) return null
      const b = parseTernary()
      if (typeof cond !== 'number') return null
      return cond !== 0 ? a : b
    }
    return cond
  }

  const result = parseTernary()
  if (pos !== toks.length) return null
  return result
}

export interface FormatSegment {
  kind: 'text' | 'spec'
  text?: string
  spec?: string
  flags?: string
  width?: number
  precision?: number
  length?: string
  conv?: string
}

export function parseFormat(format: string): FormatSegment[] {
  const segs: FormatSegment[] = []
  let text = ''
  let i = 0
  while (i < format.length) {
    if (format[i] !== '%') { text += format[i]; i++; continue }
    if (format[i + 1] === '%') { text += '%'; i += 2; continue }
    if (text) { segs.push({ kind: 'text', text }); text = '' }
    let j = i + 1
    let flags = ''
    while (j < format.length && '-+ 0#'.includes(format[j])) { flags += format[j]; j++ }
    let widthStr = ''
    while (j < format.length && /\d/.test(format[j])) { widthStr += format[j]; j++ }
    let precision: number | undefined
    if (format[j] === '.') {
      j++
      let p = ''
      while (j < format.length && /\d/.test(format[j])) { p += format[j]; j++ }
      precision = p ? Number(p) : 0
    }
    let length = ''
    for (const cand of ['hh', 'll', 'h', 'l', 'z', 'j', 't', 'L']) {
      if (format.startsWith(cand, j)) { length = cand; j += cand.length; break }
    }
    const conv = format[j]
    if (!conv) { text += format.slice(i); break }
    j++
    segs.push({
      kind: 'spec', spec: format.slice(i, j), flags,
      width: widthStr ? Number(widthStr) : undefined,
      precision, length, conv,
    })
    i = j
  }
  if (text) segs.push({ kind: 'text', text })
  return segs
}

function pad(text: string, width: number | undefined, flags = '', numeric = false): string {
  if (!width || text.length >= width) return text
  const fill = flags.includes('0') && numeric ? '0' : ' '
  if (flags.includes('-')) return text.padEnd(width, fill)
  if (fill === '0' && /^[+-]/.test(text)) return text[0] + text.slice(1).padStart(width - 1, '0')
  return text.padStart(width, fill)
}

export interface PrintfEval {
  text: string | null
  segments: { spec?: string; arg?: string; value?: string; conv?: string }[]
  specCount: number
  argCount: number
  warnings: string[]
}

export function evalPrintf(format: string, args: string[], vars?: CVars): PrintfEval {
  const segs = parseFormat(format)
  const specs = segs.filter((s) => s.kind === 'spec')
  const warnings: string[] = []
  if (specs.length !== args.length) {
    warnings.push(`格式符有 ${specs.length} 个，实参有 ${args.length} 个，数量不一致`)
  }
  let out = ''
  let complete = true
  let argIndex = 0
  const used: PrintfEval['segments'] = []

  for (const seg of segs) {
    if (seg.kind === 'text') { out += unescapeC(seg.text || ''); continue }
    const argExpr = args[argIndex]
    argIndex++
    const value = argExpr !== undefined ? evalC(argExpr, vars) : null
    let rendered: string | null = null
    const conv = seg.conv || ''
    if (typeof value === 'number') {
      switch (conv) {
        case 'd': case 'i': rendered = String(Math.trunc(value)); break
        case 'u': rendered = String(Math.trunc(value) >>> 0); break
        case 'x': rendered = (Math.trunc(value) >>> 0).toString(16); break
        case 'X': rendered = (Math.trunc(value) >>> 0).toString(16).toUpperCase(); break
        case 'o': rendered = (Math.trunc(value) >>> 0).toString(8); break
        case 'c': rendered = String.fromCharCode(Math.trunc(value)); break
        case 'f': case 'F': rendered = value.toFixed(seg.precision ?? 6); break
        case 'e': case 'E': rendered = value.toExponential(seg.precision ?? 6); break
        case 'g': case 'G': rendered = String(Number(value.toPrecision(seg.precision ?? 6))); break
        case 'z': case 'l': case 'h': rendered = String(Math.trunc(value)); break
        case 's': rendered = null; break
        default: rendered = null
      }
      if (rendered !== null && conv !== 's') rendered = pad(rendered, seg.width, seg.flags, true)
    } else if (typeof value === 'string') {
      if (conv === 's') {
        rendered = seg.precision !== undefined ? value.slice(0, seg.precision) : value
        rendered = pad(rendered, seg.width, seg.flags)
      } else if (conv === 'c' && value.length) rendered = value[0]
    }
    if (rendered === null) complete = false
    else out += rendered
    used.push({ spec: seg.spec, arg: argExpr, value: rendered ?? undefined, conv })
  }
  return { text: complete && specs.length === args.length ? out : null, segments: used, specCount: specs.length, argCount: args.length, warnings }
}
