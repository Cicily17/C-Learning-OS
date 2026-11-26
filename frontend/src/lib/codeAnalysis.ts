/**
 * 面向教学场景的 C 代码拆解器。
 * 目标不是做完整编译器，而是把常见教学示例拆成「这一行在做什么、为什么这样写、
 * 运行时会得到什么」三件事；所有推断都来自代码本身，不依赖后端或大模型。
 */
import { evalC, evalPrintf, escapeForDisplay, parseFormat, unescapeC, type CVar, type CVars } from './cExpr'

export type InsightTone =
  | 'pre' | 'entry' | 'declare' | 'io' | 'flow' | 'return'
  | 'memory' | 'type' | 'shell' | 'comment' | 'block' | 'call'

export interface LineInsight {
  no: number
  code: string
  indent: number
  tag: string
  tone: InsightTone
  title: string
  detail: string
  notes: string[]
}

export interface CodeAnalysis {
  lines: LineInsight[]
  purpose: string
  entry: string
  output: string | null
  /** 每条 printf 产生的输出，形如 `L12 · 输出「Hello, C!\n」` */
  outputsPreview: string[]
  flow: { no: number; text: string }[]
  constructs: string[]
  pitfalls: string[]
  stats: { codeLines: number; statements: number; functions: number }
}

type Ctx = {
  vars: CVars
  typedefs: Map<string, string>
  funcName: string | null
  funcReturn: string
  inMain: boolean
  depth: number
  blocks: { type: string; no: number }[]
  inStruct: string | null
  tracking: boolean
  outputReliable: boolean
  outputs: string[]
  outputTrace: { no: number; text: string }[]
  flow: { no: number; text: string }[]
  tags: string[]
  functions: string[]
  statements: number
  controlSeen: boolean
  funcs: Map<string, { params: string[]; body: string }>
  macros: Map<string, { params: string[] | null; body: string }>
  funcParams: string[]
  funcPending: { name: string; params: string[]; returns: string[]; control: boolean } | null
  globals: CVars
  structs: Map<string, string[]>
}

const TYPE_SIZE: Record<string, number> = {
  char: 1, short: 2, int: 4, long: 4, 'long long': 8,
  float: 4, double: 8, size_t: 8, FILE: 8,
}

const BASE_TYPES = [
  'unsigned long long', 'unsigned long', 'unsigned int', 'unsigned short', 'unsigned char',
  'long long', 'long double', 'long', 'short', 'int', 'char', 'float', 'double',
  'size_t', 'FILE', 'void',
]

const SPECIFIERS = ['static', 'const', 'extern', 'register', 'volatile', 'inline']

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function expandMacros(expr: string, ctx: Ctx): string {
  let cur = expr
  for (let round = 0; round < 8; round++) {
    let next = cur
    ctx.macros.forEach((mac, name) => {
      if (mac.params) {
        const re = new RegExp(`\\b${escapeRe(name)}\\s*\\(([^()]*)\\)`)
        next = next.replace(re, (m, argsRaw) => {
          const args = splitTop(argsRaw, ',')
          let body = mac.body
          mac.params!.forEach((p, i) => {
            body = body.replace(new RegExp(`\\b${escapeRe(p)}\\b`, 'g'), `(${args[i] ?? ''})`)
          })
          return `(${body})`
        })
      } else {
        next = next.replace(new RegExp(`\\b${escapeRe(name)}\\b`, 'g'), `(${mac.body})`)
      }
    })
    if (next === cur) break
    cur = next
  }
  return cur
}

function findCall(expr: string, names: string[]): { name: string; args: string[]; start: number; end: number } | null {
  for (const name of names) {
    const re = new RegExp(`\\b${escapeRe(name)}\\s*\\(`, 'g')
    const m = re.exec(expr)
    if (!m) continue
    const open = expr.indexOf('(', m.index)
    let depth = 0
    let quote = ''
    for (let i = open; i < expr.length; i++) {
      const ch = expr[i]
      if (quote) {
        if (ch === '\\') { i++; continue }
        if (ch === quote) quote = ''
        continue
      }
      if (ch === '"' || ch === "'") { quote = ch; continue }
      if (ch === '(') depth++
      else if (ch === ')') {
        depth--
        if (depth === 0) {
          return { name, args: splitTop(expr.slice(open + 1, i), ','), start: m.index, end: i + 1 }
        }
      }
    }
  }
  return null
}

function findTopLevel(expr: string, targets: string): number[] {
  const out: number[] = []
  let depth = 0
  let quote = ''
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (quote) {
      if (ch === '\\') { i++; continue }
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1)
    else if (depth === 0 && targets.includes(ch)) out.push(i)
  }
  return out
}

function evalWithCalls(expr: string, ctx: Ctx, depth = 0): ReturnType<typeof evalC> {
  if (depth > 42) return null
  const e = expandMacros(expr, ctx).trim()
  if (!e) return null
  const qs = findTopLevel(e, '?')
  if (qs.length) {
    const q = qs[0]
    const colons = findTopLevel(e, ':').filter((i) => i > q)
    const colon = colons[0]
    if (colon !== undefined) {
      const cond = evalWithCalls(e.slice(0, q), ctx, depth + 1)
      if (typeof cond !== 'number') return null
      return evalWithCalls(cond !== 0 ? e.slice(q + 1, colon) : e.slice(colon + 1), ctx, depth + 1)
    }
  }
  const call = findCall(e, [...ctx.funcs.keys()])
  if (!call) return evalC(e, ctx.vars)
  const fn = ctx.funcs.get(call.name)
  if (!fn || fn.params.length !== call.args.length) return null
  const vals = call.args.map((a) => evalWithCalls(a, ctx, depth + 1))
  if (vals.some((v) => typeof v !== 'number')) return null
  let body = fn.body
  fn.params.forEach((p, i) => {
    const n = vals[i] as number
    body = body.replace(new RegExp(`\\b${escapeRe(p)}\\b`, 'g'), n < 0 ? `(${n})` : String(n))
  })
  const value = evalWithCalls(body, ctx, depth + 1)
  if (typeof value !== 'number') return null
  const next = e.slice(0, call.start) + `(${value})` + e.slice(call.end)
  return evalWithCalls(next, ctx, depth + 1)
}

function evalIn(expr: string, ctx: Ctx, depth = 0): ReturnType<typeof evalC> {
  if (!expr) return null
  let e = expandMacros(expr, ctx)
  e = e.replace(/(?<!\*)\*\s*([A-Za-z_]\w*)/g, (m, name) => {
    const ptr = ctx.vars.get(name)
    if (!ptr?.pointsTo) return m
    const target = ctx.vars.get(ptr.pointsTo)
    return typeof target?.value === 'number' ? String(target.value) : m
  })
  e = e.replace(/\b([A-Za-z_]\w*)\s*(?:\.|->)\s*([A-Za-z_]\w*)/g, (m, name, member) => {
    const v = ctx.vars.get(name)
    const mv = v?.members?.[member]
    return typeof mv === 'number' ? String(mv) : m
  })
  return evalWithCalls(e, ctx, depth)
}

function parseMemberNames(body: string): string[] {
  const names: string[] = []
  for (const part of splitTop(body, ';')) {
    const pieces = splitTop(part, ',')
    pieces.forEach((piece, idx) => {
      let p = piece.trim()
      if (idx === 0) p = p.replace(new RegExp(`^(${typePatternForMembers()})\\s+`), '')
      p = p.replace(/\[[^\]]*\]/g, ' ').replace(/\*/g, ' ').trim()
      const m = p.match(/([A-Za-z_]\w*)\s*$/)
      if (m) names.push(m[1])
    })
  }
  return names
}

function typePatternForMembers(): string {
  return '(?:(?:const|static|unsigned|signed|long|short)\\s+)*(?:long\\s+long|long|short|int|char|float|double|struct\\s+\\w+|union\\s+\\w+|enum\\s+\\w+|[A-Z]\\w*)'
}

function typeSize(type: string): number {
  const clean = type.replace(/\s+/g, ' ').replace(/\*+$/, '').trim()
  return TYPE_SIZE[clean] ?? (clean.startsWith('struct') || clean.startsWith('union') ? 4 : 4)
}

function typeName(type: string): string {
  return type.replace(/\s+/g, ' ').replace(/\*+$/, '').trim() || 'int'
}

export function splitTop(text: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let depth = 0
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      cur += ch
      if (ch === '\\') { cur += text[i + 1] ?? ''; i++; continue }
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    if ('([{'.includes(ch)) { depth++; cur += ch; continue }
    if (')]}'.includes(ch)) { depth = Math.max(0, depth - 1); cur += ch; continue }
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}

function stripComment(line: string): { code: string; comment: string } {
  let quote = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (ch === '\\') { i++; continue }
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '/' && line[i + 1] === '/') return { code: line.slice(0, i), comment: line.slice(i + 2).trim() }
  }
  return { code: line, comment: '' }
}

function parseCall(stmt: string): { name: string; args: string[] } | null {
  const m = stmt.match(/^([A-Za-z_]\w*)\s*\(([\s\S]*)\)$/)
  if (!m) return null
  return { name: m[1], args: splitTop(m[2], ',') }
}

function num(n: number): string {
  if (!Number.isFinite(n)) return '?'
  if (Number.isInteger(n)) return String(n)
  return String(Number(n.toFixed(6)))
}

function valueText(v: number | string | null | undefined): string {
  if (typeof v === 'number') return num(v)
  if (typeof v === 'string') return `"${v}"`
  return '未知'
}

function condText(expr: string): string {
  return expr.replace(/\s+/g, ' ').trim()
}

function short(text: string, max = 26): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

function describeFormatC(format: string): { literal: string; specs: string[]; hasNewline: boolean } {
  const segs = parseFormat(format)
  const literal = segs.filter((s) => s.kind === 'text').map((s) => s.text || '').join('')
    .replace(/\\n/g, '\n').replace(/\\t/g, '\t')
  const specs = segs.filter((s) => s.kind === 'spec').map((s) => s.spec || '')
  return { literal, specs, hasNewline: /\\n/.test(format) }
}

function tagOf(tone: InsightTone): string {
  const map: Record<InsightTone, string> = {
    pre: '预处理', entry: '程序入口', declare: '变量声明', io: '输入输出',
    flow: '流程控制', return: '函数返回', memory: '内存管理', type: '类型定义',
    shell: '终端命令', comment: '注释', block: '代码块', call: '函数调用',
  }
  return map[tone]
}

function makeInsight(
  no: number, code: string, tone: InsightTone, title: string, detail: string, notes: string[] = [],
): LineInsight {
  return {
    no, code, indent: Math.max(0, (code.length - code.trimStart().length) / 2),
    tag: tagOf(tone), tone, title, detail,
    notes: [...new Set(notes.filter(Boolean))].slice(0, 4),
  }
}

function typePattern(ctx: Ctx): string {
  const aliases = [...ctx.typedefs.keys()].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return [
    ...aliases.sort((a, b) => b.length - a.length),
    'struct\\s+\\w+', 'union\\s+\\w+', 'enum\\s+\\w+',
    ...BASE_TYPES.map((t) => t.replace(/ /g, '\\s+')),
  ].join('|')
}

function clearRuntimeValues(ctx: Ctx) {
  ctx.tracking = false
  ctx.controlSeen = true
  if (ctx.funcPending) ctx.funcPending.control = true
  ctx.outputReliable = false
  ctx.vars.forEach((v) => {
    if (!v.isArray) v.value = undefined
  })
}

function markFlow(ctx: Ctx, no: number, text: string) {
  if (ctx.inMain && ctx.depth === 1 && ctx.flow.length < 8) {
    ctx.flow.push({ no, text: short(text, 40) })
  }
}

function record(ctx: Ctx, tone: InsightTone) {
  if (!ctx.tags.includes(tone)) ctx.tags.push(tone)
}

function parseInit(expr: string | undefined, type: string, ctx: Ctx): {
  values?: (number | string)[]
  scalar?: number | string
  stringLiteral?: boolean
  unknown?: boolean
} {
  if (!expr) return {}
  const e = expr.trim()
  if (/^"[\s\S]*"$/.test(e)) {
    const text = evalIn(e, ctx)
    if (typeof text === 'string') {
      return { values: [...text].map((c) => c.charCodeAt(0)).concat(0), stringLiteral: true }
    }
  }
  if (e.startsWith('{')) {
    const inner = e.replace(/^\s*\{/, '').replace(/\}\s*$/, '')
    const values: (number | string)[] = []
    for (const part of splitTop(inner, ',')) {
      if (part.startsWith('{')) {
        const sub = part.replace(/^\s*\{/, '').replace(/\}\s*$/, '')
        for (const sp of splitTop(sub, ',')) {
          const v = evalIn(sp, ctx)
          if (typeof v === 'number' || typeof v === 'string') values.push(v)
        }
      } else {
        const v = evalIn(part, ctx)
        if (typeof v === 'number' || typeof v === 'string') values.push(v)
      }
    }
    return { values }
  }
  const v = evalIn(e, ctx)
  if (typeof v === 'number' || typeof v === 'string') return { scalar: v }
  return { unknown: true }
}

function analyzeDeclaration(stmt: string, ctx: Ctx, no: number, member = false): LineInsight | null {
  const re = new RegExp(`^((?:${SPECIFIERS.join('|')})\\s+)*(${typePattern(ctx)})\\s+(\\*+\\s*)?([\\s\\S]+)$`)
  const m = stmt.match(re)
  if (!m) return null
  let type = m[2].replace(/\s+/g, ' ').trim()
  if (m[1]) type = `${m[1].trim()} ${type}`
  const extraStars = (m[3] || '').replace(/\s/g, '')
  const rest = m[4].trim()
  if (!rest || /^[<>=!&|]/.test(rest)) return null

  const decls: {
    name: string; ptr: number; dims: string[]; init?: string; funcPtr?: boolean; params?: string
  }[] = []

  for (const part of splitTop(rest, ',')) {
    const fp = part.match(/^\(\s*\*\s*([A-Za-z_]\w*)\s*\)\s*\(([^)]*)\)\s*(?:=\s*([\s\S]+))?$/)
    if (fp) {
      decls.push({ name: fp[1], ptr: 0, dims: [], init: fp[3], funcPtr: true, params: fp[2] })
      continue
    }
    const arr = part.match(/^(\*+\s*)?([A-Za-z_]\w*)\s*((?:\[[^\]]*\])+)\s*(?:=\s*([\s\S]+))?$/)
    if (arr) {
      decls.push({
        name: arr[2], ptr: (extraStars + (arr[1] || '')).replace(/\s/g, '').length,
        dims: [...arr[3].matchAll(/\[([^\]]*)\]/g)].map((x) => x[1].trim()),
        init: arr[4],
      })
      continue
    }
    const plain = part.match(/^(\*+\s*)?([A-Za-z_]\w*)\s*(?:=\s*([\s\S]+))?$/)
    if (plain) {
      decls.push({
        name: plain[2], ptr: (extraStars + (plain[1] || '')).replace(/\s/g, '').length,
        dims: [], init: plain[3],
      })
    }
  }
  if (!decls.length) return null

  if (member) {
    const d = decls[0]
    return makeInsight(no, '', 'type', `成员 ${d.name}：${typeName(type)}${d.ptr ? ' 指针' : ''}`,
      `结构体成员按声明顺序排列；${typeName(type)} 占 ${typeSize(type)} 字节${d.dims.length ? '（数组会按元素个数倍增）' : ''}。`,
      [])
  }

  const titles: string[] = []
  const heads: string[] = []
  const details: string[] = []
  const notes: string[] = []

  for (const d of decls) {
    const fullType = `${typeName(type)}${d.ptr ? ' ' + '*'.repeat(d.ptr) : ''}`
    const isPtr = d.ptr > 0
    let arrayLen: number | undefined
    let cols: number | undefined
    let elemSize: number | undefined
    let init = d.init
    let vals: (number | string)[] | undefined
    let scalar: number | string | undefined
    let stringLiteral = false
    let isStruct = false
    let memberNames: string[] | undefined
    let structInitValues: (number | string)[] | undefined

    if (d.dims.length) {
      const dims = d.dims.map((x) => (x === '' ? null : evalIn(x, ctx)))
      const product = dims.reduce<number>((acc, x) => (typeof x === 'number' ? acc * x : acc), 1)
      arrayLen = d.dims.some((x) => x === '') ? undefined : product
      cols = typeof dims[dims.length - 1] === 'number' ? dims[dims.length - 1] as number : undefined
      elemSize = typeSize(type)
      const parsed = parseInit(init, type, ctx)
      if (parsed.values) {
        vals = parsed.values
        if (arrayLen === undefined) arrayLen = vals.length
        if (vals.length < arrayLen) vals = vals.concat(Array(arrayLen - vals.length).fill(0))
        if (vals.length > arrayLen) vals = vals.slice(0, arrayLen)
      }
      stringLiteral = !!parsed.stringLiteral
      if (arrayLen !== undefined) ctx.vars.set(d.name, {
        type, isArray: true, length: arrayLen, elements: vals, elemSize, cols,
        isChar: typeName(type) === 'char', isFloat: /float|double/.test(type),
      })
    } else {
      const parsed = parseInit(init, type, ctx)
      scalar = parsed.scalar
      const structKey = typeName(type).replace(/^(struct|union)\s+/, '')
      memberNames = ctx.structs.get(structKey)
      isStruct = /^(struct|union)\b/.test(typeName(type)) || !!memberNames
      structInitValues = parsed.values
      const v: CVar = {
        type: isPtr ? `${type} *` : type, value: scalar,
        isChar: typeName(type) === 'char', isFloat: /float|double/.test(type),
      }
      if (isStruct && parsed.values && memberNames?.length) {
        v.members = {}
        memberNames.forEach((m, i) => { if (parsed.values![i] !== undefined) v.members![m] = parsed.values![i] })
      }
      if (parsed.unknown) v.value = undefined
      if (isPtr) {
        v.value = undefined
        if (d.init && /^&\s*\w+\s*$/.test(d.init.trim())) v.pointsTo = d.init.trim().slice(1).trim()
      }
      ctx.vars.set(d.name, v)
    }

    const nameDesc = `${fullType} ${d.name}${d.dims.length ? d.dims.map((x) => `[${x}]`).join('') : ''}`
    heads.push(`${nameDesc}${d.init ? ` = ${short(d.init.trim(), 16)}` : ''}`)

    if (d.funcPtr) {
      titles.push(`声明函数指针 ${d.name}`)
      details.push(`${d.name} 指向「返回 ${typeName(type)}、参数为 (${d.params || 'void'})」的函数；初始化后可以像函数一样用 ${d.name}(...) 调用。`)
      notes.push('函数指针必须与目标函数的返回类型、参数列表完全一致')
      continue
    }

    if (d.dims.length) {
      const lenText = arrayLen !== undefined ? String(arrayLen) : '由初始化列表决定'
      if (d.dims.length > 1) {
        titles.push(`声明 ${typeName(type)} 二维数组 ${d.name}，共 ${lenText} 个元素`)
        details.push(`${d.dims.map((x) => `[${x}]`).join('')} 按行优先连续存放${cols ? `，每行 ${cols} 个元素` : ''}；访问第二行第三列写 ${d.name}[1][2]。`)
      } else {
        titles.push(`${stringLiteral ? '声明字符数组' : '声明数组'} ${d.name}（长度 ${lenText}）`)
      }
      const partial = vals && d.init && !d.init.trim().startsWith('"') && vals.some((x) => x === 0)
      if (stringLiteral) {
        const textLen = (vals?.length ?? 1) - 1
        details.push(`字符串字面量 "…" 会自动在末尾补 '\\0'，所以数组长度是 ${vals?.length}（${textLen} 个字符 + 1 个结束符）。`)
        notes.push(`sizeof(${d.name}) = ${vals?.length}，strlen(${d.name}) = ${textLen}`)
      } else if (d.dims.length === 1) {
        details.push(arrayLen !== undefined
          ? `连续分配 ${arrayLen} × ${elemSize} = ${(arrayLen * (elemSize || 0))} 字节，合法下标是 0–${arrayLen - 1}。`
          : '数组长度由初始化列表自动推导。')
        if (partial) details.push('初始化列表只写了一部分元素，其余元素由编译器自动补 0。')
        if (!vals) details.push('没有初始化，元素的值不确定。')
        notes.push(`访问 ${d.name}[${arrayLen ?? 'n'}] 就越界了`)
      }
      if (d.dims.length > 1) notes.push('多维数组在内存中仍是连续的一维序列')
    } else if (isPtr) {
      titles.push(`声明指针 ${d.name}，指向 ${typeName(type)}`)
      if (d.init && /^&/.test(d.init.trim())) {
        const target = d.init.trim().slice(1).trim()
        details.push(`&${target} 取出变量的地址，${d.name} 保存这个地址；*${d.name} 就是原变量本身。`)
        notes.push('指针必须指向有效对象后才能解引用')
      } else if (d.init && /^"/.test(d.init.trim())) {
        details.push('指针指向字符串字面量，字面量存放在只读区域，不能通过该指针修改字符。')
        notes.push('char *p = "..." 与 char p[] = "..." 的区别是常考点')
      } else if (d.init && /fopen/.test(d.init)) {
        details.push('fopen 返回文件指针；打开失败时返回 NULL，必须马上检查。')
        notes.push('文件用完要 fclose，否则可能丢失缓冲区里的数据')
      } else if (d.init && /malloc|calloc|realloc/.test(d.init)) {
        details.push('堆内存没有名字，只能通过返回的指针访问；使用完必须 free。')
        notes.push('申请失败会返回 NULL，解引用前必须判断')
      } else {
        details.push('指针变量本身也占内存（64 位下 8 字节），未初始化时指向不确定的地址。')
        notes.push('未初始化的指针称为野指针，不能解引用')
      }
    } else {
      const isStringPointer = /char/.test(type) && d.init && /^"/.test(d.init.trim())
      const initText = scalar !== undefined
        ? `，初始化为 ${valueText(scalar)}`
        : isStruct && structInitValues?.length ? `，按顺序初始化 { ${structInitValues.join(', ')} }` : ''
      titles.push(`声明 ${fullType} ${d.name}${initText}`)
      if (isStringPointer) {
        details.push('这里保存的是字符串首字符的地址，不是字符数组。')
      } else if (isStruct) {
        details.push(`按成员顺序为 ${memberNames?.join('、') || '各成员'} 分配存储，结构体大小还会包含对齐填充${structInitValues?.length ? `；初始化列表 { ${structInitValues.join(', ')} } 依次写入成员` : ''}。`)
      } else {
        details.push(`在栈上为 ${d.name} 分配 ${typeSize(type)} 字节${scalar !== undefined ? `，并写入初值 ${valueText(scalar)}` : '，但没有赋初值'}。作用域从这一行开始，到所在代码块结束。`)
      }
      if (scalar === undefined) notes.push('局部变量未初始化时值不确定，不要直接参与运算')
      if (type.includes('const')) notes.push('const 变量只能在定义时初始化，之后不能赋值')
      if (type.includes('static')) notes.push('static 局部变量只初始化一次，函数返回后值仍然保留')
      if (typeName(type) === 'char' && typeof scalar === 'number') {
        details.push(`字符 '${String.fromCharCode(scalar)}' 在内存中以 ASCII 码 ${scalar} 存放。`)
      }
      if (/double|float/.test(type)) notes.push('浮点数用二进制近似存储，0.1 + 0.2 不会精确等于 0.3')
    }
    if (type.includes('const')) notes.push('const 只读')
    void nameDesc
  }

  ctx.statements += decls.length
  if (ctx.tracking && decls.length === 1 && !decls[0].dims.length && decls[0].ptr === 0) {
    // tracking stays on for straight-line code
  }
  record(ctx, 'declare')
  const title = titles.length === 1 ? titles[0] : `声明 ${heads.join('、')}`
  const detail = details.join('\n')
  return makeInsight(no, '', 'declare', title, detail, notes.slice(0, 4))
}

function describePrintf(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const call = parseCall(stmt)
  if (!call || call.name !== 'printf') return null
  const args = call.args
  const fmtVal = args.length ? evalIn(args[0], ctx) : null
  const format = typeof fmtVal === 'string' ? fmtVal : args[0]?.replace(/^"|"$/g, '') || ''
  const rest = args.slice(1)
  const prepared = rest.map((a) => {
    const v = evalIn(a, ctx)
    if (typeof v === 'number') return String(v)
    if (typeof v === 'string') return JSON.stringify(v)
    return a
  })
  const result = evalPrintf(format, prepared, ctx.vars)
  const fmtInfo = describeFormatC(format)
  const specInfo = result.segments.map((s, i) => {
    const val = s.value !== undefined ? `，得 ${s.value}` : ''
    return `${s.spec} ← ${rest[i] ?? s.arg}${val}`
  })

  let title: string
  if (result.text !== null) {
    const shown = escapeForDisplay(result.text)
    title = result.text.length ? `输出「${short(shown, 30)}」` : '输出空字符串'
    if (fmtInfo.hasNewline && result.text.endsWith('\n')) title = `输出「${short(shown.replace(/\\n$/, ''), 30)}」并换行`
  } else if (fmtInfo.specs.length) {
    let tpl = ''
    let argIdx = 0
    parseFormat(format).forEach((seg) => {
      if (seg.kind === 'text') tpl += unescapeC(seg.text || '')
      else {
        const arg = rest[argIdx] ?? '?'
        argIdx++
        tpl += `<${short(arg, 14)}>`
      }
    })
    title = `输出「${short(tpl.replace(/\n/g, ''), 34)}」`
  } else {
    title = '向标准输出打印一段文本'
  }

  const parts: string[] = []
  if (fmtInfo.literal.trim()) {
    parts.push(`格式串里原样输出「${escapeForDisplay(fmtInfo.literal.trim())}」`)
  }
  if (specInfo.length) parts.push(`${specInfo.join('；')}`)
  if (fmtInfo.hasNewline) parts.push('末尾的 \\n 会换行')
  const detail = parts.length
    ? `${parts.join('；')}。printf 会把结果写到标准输出，返回实际输出的字符数。`
    : '按格式串把内容写到标准输出。'

  const notes: string[] = []
  if (result.specCount !== result.argCount) notes.push(result.warnings[0] || '格式符与参数数量要一一对应')
  if (/(^|[^%])%d/.test(format) && rest.some((a) => /\.\d/.test(a))) notes.push('%d 需要 int，double 要用 %f')
  if (/%f/.test(format) && rest.some((a) => /^\d+$/.test(a.trim()))) notes.push('%f 需要 double，传入整数会得到未定义行为')
  if (fmtInfo.hasNewline) notes.push('没有 \\n 时下一次输出会接在同一行')

  if (ctx.inMain && ctx.tracking) {
    if (result.text !== null) {
      ctx.outputs.push(result.text)
      ctx.outputTrace.push({ no, text: result.text })
    } else ctx.outputReliable = false
  } else if (result.text === null) {
    ctx.outputReliable = false
  }
  ctx.statements++
  record(ctx, 'io')
  return makeInsight(no, '', 'io', title, detail, notes)
}

function describeScanf(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const call = parseCall(stmt)
  if (!call || call.name !== 'scanf') return null
  const args = call.args
  const fmtVal = args.length ? evalIn(args[0], ctx) : null
  const format = typeof fmtVal === 'string' ? fmtVal : args[0]?.replace(/^"|"$/g, '') || ''
  const specs = [...format.matchAll(/%(\d*)(?:hh|h|ll|l|z)?([diuoxXfFeEgGcs])/g)].map((m) => m[0])
  const dests = args.slice(1).map((a) => a.trim())
  const destText = dests.join('、')
  const title = dests.length
    ? `从键盘读入${specs.length > 1 ? ` ${specs.length} 个值` : '一个值'}，写到 ${dests.map((d) => d.replace(/^&/, '')).join('、')}`
    : '从标准输入读取数据'
  const detail = dests.length
    ? `格式串 ${format} 决定如何解析输入：${specs.join('、') || '按格式'} 依次对应 ${dests.join('、')}。scanf 的返回值是成功读取的项数，可以用来判断输入是否合法。`
    : '从标准输入按格式串解析数据。'
  const notes: string[] = []
  if (dests.some((d) => !d.startsWith('&') && !/\[/.test(d))) notes.push('普通变量必须加 &，传地址才能写回')
  notes.push('输入格式必须与格式串匹配，否则读取会失败')
  ctx.outputReliable = false
  ctx.controlSeen = true
  ctx.statements++
  record(ctx, 'io')
  return makeInsight(no, '', 'io', title, detail, notes)
}

function describeAssignment(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const m = stmt.match(/^([A-Za-z_]\w*(?:\s*\[[^\]]*\])?(?:\s*(?:\.|->)\s*\w+)?|\*\s*[A-Za-z_]\w*)\s*(=|\+=|-=|\*=|\/=|%=|<<=|>>=|&=|\|=|\^=)\s*([\s\S]+)$/)
  if (!m) return null
  const dest = m[1].replace(/\s+/g, '')
  const op = m[2]
  const rhs = m[3].trim()
  const rhsVal = evalIn(rhs, ctx)
  const destName = dest.replace(/^\*/, '')
  const before = ctx.vars.get(destName)?.value
  let title = ''
  let detail = ''

  const rhsDesc = rhsVal === null ? short(rhs, 18) : valueText(rhsVal)
  if (dest.startsWith('*')) {
    const target = ctx.vars.get(destName)?.pointsTo
    if (target && ctx.vars.has(target) && typeof rhsVal === 'number') {
      ctx.vars.set(target, { ...(ctx.vars.get(target) as CVar), value: rhsVal })
      title = `通过 ${destName} 把 ${rhsDesc} 写入 ${target}`
      detail = `${destName} 指向 ${target}，所以 *${destName} = ${rhs} 直接改写了 ${target} 的内存；现在 ${target} = ${rhsVal}。`
    } else {
      title = `通过指针把 ${rhsDesc} 写入它指向的变量`
      detail = `*${destName} 表示「${destName} 所指向的那块内存」；写入后原变量随之改变。指针必须已经指向有效对象。`
    }
  } else if (dest.includes('.')) {
    const [base, member] = dest.split('.')
    if (ctx.vars.has(base) && typeof rhsVal === 'number') {
      const bv = ctx.vars.get(base) as CVar
      bv.members = { ...(bv.members || {}), [member]: rhsVal }
      title = `把 ${rhs} 写入 ${dest}`
      detail = `结构体 / 共用体成员 ${member} 与普通变量一样参与赋值；当前 ${dest} = ${rhsVal}。共用体写入一个成员会覆盖其他成员的内存解释。`
    } else {
      title = `把 ${rhsDesc} 赋给 ${dest}`
      detail = `给结构体成员 ${dest} 赋值；成员在内存中按声明顺序排列。`
    }
  } else if (dest.includes('[')) {
    const charDesc = typeof rhsVal === 'number' && /^'.'$/.test(rhs.trim()) ? `${rhs.trim()}（ASCII ${rhsVal}）` : rhsDesc
    title = `把 ${charDesc} 写入 ${dest}`
    detail = `数组元素可以被赋值；下标从 0 开始，越界写入不会报错，但会破坏其他内存。`
  } else if (op !== '=') {
    const baseOp = op.slice(0, -1)
    if (typeof before === 'number' && typeof rhsVal === 'number') {
      const after = baseOp === '+' ? before + rhsVal
        : baseOp === '-' ? before - rhsVal
        : baseOp === '*' ? before * rhsVal
        : baseOp === '/' ? (rhsVal === 0 ? NaN : Math.trunc(before / rhsVal))
        : baseOp === '%' ? (rhsVal === 0 ? NaN : before % rhsVal)
        : baseOp === '<<' ? before << rhsVal
        : baseOp === '>>' ? before >> rhsVal
        : baseOp === '&' ? before & rhsVal
        : baseOp === '|' ? before | rhsVal
        : before ^ rhsVal
      title = `${op} 复合赋值：${dest} 从 ${num(before)} 变为 ${num(after)}`
      detail = `${dest} ${op} ${rhs} 等价于 ${dest} = ${dest} ${baseOp} ${rhs}；先算右侧，再把结果写回 ${dest}。`
      ctx.vars.set(destName, { ...(ctx.vars.get(destName) as CVar), value: after })
    } else {
      title = `${op} 复合赋值，更新 ${dest}`
      detail = `${dest} ${op} ${rhs} 等价于 ${dest} = ${dest} ${baseOp} ${rhs}，可少写一次变量名。`
    }
  } else if (rhs === 'NULL') {
    title = `把 ${dest} 置为 NULL`
    detail = 'NULL 表示空指针，解引用 NULL 会直接崩溃；free 之后置空可以避免悬空指针被误用。'
    if (ctx.vars.has(dest)) ctx.vars.set(dest, { ...(ctx.vars.get(dest) as CVar), pointsTo: undefined, value: undefined })
  } else {
    title = `把 ${rhsDesc} 赋给 ${dest}`
    detail = `= 是赋值：先计算右侧表达式，再把结果写入左侧变量。${typeof before === 'number' ? `赋值前 ${dest} 是 ${num(before)}。` : ''}`
    if (ctx.vars.has(destName)) {
      const v = ctx.vars.get(destName) as CVar
      ctx.vars.set(destName, { ...v, value: rhsVal ?? undefined })
    }
  }
  if (/^\*/.test(dest)) {
    const target = ctx.vars.get(destName)
    if (target && typeof target.value === 'number') {
      // 无法知道指针指向谁时保持原值
    }
  }
  ctx.statements++
  // 指针解引用 / 数组元素写入本质是在改内存，标签用「内存操作」比「变量声明」准确
  const tone: InsightTone = /^\*/.test(dest) || dest.includes('[') ? 'memory' : 'declare'
  record(ctx, tone)
  return makeInsight(no, '', tone, title, detail,
    op === '=' && /^\*/.test(dest) ? ['解引用前先确认指针非 NULL'] : [])
}

function describeIncrement(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const m = stmt.match(/^(\+\+|--)?\s*([A-Za-z_]\w*)\s*(\+\+|--)$/)
  if (!m) return null
  const prefix = !!m[1]
  const name = m[2]
  const isInc = (m[1] || m[3]) === '++'
  const old = ctx.vars.get(name)?.value
  if (typeof old === 'number') {
    ctx.vars.set(name, { ...(ctx.vars.get(name) as CVar), value: old + (isInc ? 1 : -1) })
  }
  const title = `${prefix ? '前置' : '后置'}${isInc ? '自增' : '自减'} ${name}${typeof old === 'number' ? `：${num(old)} → ${num(old + (isInc ? 1 : -1))}` : ''}`
  const detail = prefix
    ? `前置形式先改变 ${name} 的值，再把新值作为表达式结果。单独成句时与 ${name}${isInc ? '++' : '--'} 等价。`
    : `后置形式先取 ${name} 的旧值参与表达式，再${isInc ? '加 1' : '减 1'}。单独成句时与前置形式等价。`
  ctx.statements++
  record(ctx, 'declare')
  return makeInsight(no, '', 'declare', title, detail, [])
}

function describeReturn(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const m = stmt.match(/^return\s*([\s\S]*)$/)
  if (!m) return null
  const expr = m[1].trim()
  if (ctx.funcPending && ctx.funcName === ctx.funcPending.name && ctx.depth === 1 && expr && ctx.funcName !== 'main') {
    ctx.funcPending.returns.push(expr)
  }
  ctx.statements++
  record(ctx, 'return')
  if (!expr) {
    return makeInsight(no, '', 'return', '提前返回，结束当前函数',
      'return; 用于 void 函数：立即结束函数并把控制权交回调用者。', [])
  }
  const val = evalIn(expr, ctx)
  if (ctx.funcName === 'main' && typeof val === 'number') {
    const ok = val === 0
    return makeInsight(no, '', 'return',
      `返回 ${num(val)}，${ok ? '表示程序正常结束' : '表示异常退出'}`,
      `main 的返回值就是进程退出码：0 表示成功，非 0 表示出错。${ok ? '操作系统和脚本会据此判断程序是否跑通。' : '失败分支常用非 0 值提前结束。'}`,
      ['main 必须返回 int'])
  }
  if (ctx.funcName && new RegExp(`\\b${ctx.funcName}\\s*\\(`).test(expr)) {
    return makeInsight(no, '', 'return', `递归调用：把 ${short(expr, 30)} 的结果返回`,
      `这一行把问题拆成更小规模的同类问题，递归必须靠前面的终止条件收敛。以 fact(5) 为例：5×4×3×2×1 = 120。`,
      ['递归要有终止条件，否则会栈溢出'])
  }
  if (/\?[^:]+:/.test(expr)) {
    const cond = expr.split('?')[0].trim()
    const { a, b } = (() => {
      const rest = expr.split('?')[1] || ''
      const idx = rest.lastIndexOf(':')
      return { a: rest.slice(0, idx).trim(), b: rest.slice(idx + 1).trim() }
    })()
    return makeInsight(no, '', 'return', `按条件返回 ${short(a, 12)} 或 ${short(b, 12)}`,
      `三目运算符先判断 ${condText(cond)}，为真取 ${a}，为假取 ${b}，再把结果返回给调用者${typeof val === 'number' ? `；本例结果是 ${num(val)}` : ''}。`,
      [])
  }
  return makeInsight(no, '', 'return',
    `返回 ${short(expr, 24)} 给调用者`,
    `函数在这里结束，表达式 ${expr} 的值成为函数调用的结果${typeof val === 'number' ? `，即 ${num(val)}` : ''}。返回类型是 ${ctx.funcReturn || 'int'}，表达式类型要兼容。`,
    [])
}

function describeBreakContinue(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  if (stmt === 'break') {
    ctx.statements++
    record(ctx, 'flow')
    return makeInsight(no, '', 'flow', 'break：立即结束当前循环 / switch',
      'break 跳出最近的一层循环或 switch，后面的 case 也不会再执行。它只影响一层，不会跳出外层循环。', [])
  }
  if (stmt === 'continue') {
    ctx.statements++
    record(ctx, 'flow')
    return makeInsight(no, '', 'flow', 'continue：跳过本轮剩余语句',
      'continue 立刻进入下一轮：for 会执行更新表达式，while / do-while 会重新判断条件。', [])
  }
  return null
}

function loopIterations(start: number, end: number, cmp: string, step: number): number {
  if (step === 0) return 0
  const reach = (i: number) => cmp === '<' ? i < end : cmp === '<=' ? i <= end : cmp === '>' ? i > end : i >= end
  let n = 0
  let i = start
  while (reach(i) && n < 1000) { n++; i += step }
  return n
}

function headBody(stmt: string, keyword: string): { head: string; rest: string } | null {
  if (!stmt.startsWith(keyword)) return null
  const open = stmt.indexOf('(', keyword.length)
  if (open < 0) return null
  let depth = 0
  let quote = ''
  for (let i = open; i < stmt.length; i++) {
    const ch = stmt[i]
    if (quote) {
      if (ch === '\\') { i++; continue }
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return { head: stmt.slice(open + 1, i).trim(), rest: stmt.slice(i + 1).trim() }
    }
  }
  return null
}

function findTopElse(text: string): number {
  let depth = 0
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') { i++; continue }
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1)
    else if (depth === 0 && text.startsWith('else', i) && !/[A-Za-z0-9_]/.test(text[i - 1] || '')) return i
  }
  return -1
}

function describeInline(rest: string, ctx: Ctx, no: number): LineInsight | null {
  let body = rest.trim()
  if (!body || body === '{') return null
  const wasTracking = ctx.tracking
  ctx.tracking = false
  const elseAt = findTopElse(body)
  if (elseAt >= 0) {
    const left = body.slice(0, elseAt).trim()
    const right = body.slice(elseAt + 4).trim()
    const parts: LineInsight[] = []
    const leftItems = splitTop(left, ';').map((x) => analyzeSimpleStatement(x, ctx, no)).filter(Boolean) as LineInsight[]
    parts.push(...leftItems)
    const elseBody = right.replace(/^\{/, '').replace(/\}\s*$/, '')
    const elseItems = splitTop(elseBody, ';').map((x) => analyzeSimpleStatement(x, ctx, no)).filter(Boolean) as LineInsight[]
    parts.push(...elseItems)
    ctx.tracking = wasTracking
    if (!parts.length) return null
    return makeInsight(no, '', parts[0].tone, `条件分支：${parts.map((p) => p.title).join('；')}`,
      parts.map((p, i) => `${i + 1}. ${p.title}：${p.detail.split('\n')[0]}`).join('\n'),
      parts.flatMap((p) => p.notes).slice(0, 4))
  }
  if (body.startsWith('{') && body.endsWith('}')) body = body.slice(1, -1).trim()
  if (!body) return null
  const items = splitTop(body, ';').map((x) => analyzeSimpleStatement(x, ctx, no)).filter(Boolean) as LineInsight[]
  ctx.tracking = wasTracking
  if (!items.length) return null
  if (items.length === 1) return items[0]
  return makeInsight(no, '', items[0].tone, `连续执行 ${items.length} 条语句`,
    items.map((x, i) => `${i + 1}. ${x.title}：${x.detail.split('\n')[0]}`).join('\n'),
    items.flatMap((x) => x.notes).slice(0, 4))
}

function describeFor(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const hb = headBody(stmt, 'for')
  if (!hb) return null
  const parts = splitTop(hb.head, ';')
  const init = parts[0] || ''
  const cond = parts[1] || ''
  const update = parts[2] || ''
  if (init) {
    if (/^(int|long|short|char|unsigned|size_t|double|float)\b/.test(init)) analyzeDeclaration(init, ctx, no)
    else if (/^[A-Za-z_]\w*\s*=/.test(init)) describeAssignment(init, ctx, no)
  }
  const varMatch = cond.match(/([A-Za-z_]\w*)\s*(<=|>=|<|>)\s*([^&|]+)/)
  let iter: number | null = null
  let rangeText = ''
  let endValue: number | null = null
  if (varMatch) {
    const name = varMatch[1]
    const cmp = varMatch[2]
    const endVal = evalIn(varMatch[3], ctx)
    const startVal = ctx.vars.get(name)?.value
    const stepMatch = update.match(/(\+\+|--|\+=|-=|\*=|\/=)/)
    const step = stepMatch ? (stepMatch[1] === '++' ? 1 : stepMatch[1] === '--' ? -1 : stepMatch[1] === '+=' ? 1 : stepMatch[1] === '-=' ? -1 : 0) : 0
    if (typeof startVal === 'number' && typeof endVal === 'number' && step) {
      iter = loopIterations(startVal, endVal, cmp, step)
      const last = startVal + (iter - 1) * step
      rangeText = `${name} 依次取 ${startVal}${iter > 1 ? ` … ${last}` : ''}`
      endValue = startVal + iter * step
    }
  }
  const inline = describeInline(hb.rest, ctx, no)
  clearRuntimeValues(ctx)
  ctx.statements++
  record(ctx, 'flow')
  const title = iter !== null
    ? `循环 ${iter} 次：${rangeText}`
    : `当 ${condText(cond)} 时重复执行循环体`
  let detail = iter !== null
    ? `① 初始化 ${init || '（无）'}；② 每轮先判断 ${condText(cond)}；③ 本轮结束后执行 ${update || '更新'}。${rangeText}，条件第一次不成立时退出。`
    : `先执行 ${init || '初始化'}；每轮判断 ${condText(cond)}，成立才进入循环体；一轮结束后执行 ${update || '更新表达式'}。循环次数由条件决定。`
  if (inline) detail += `\n循环体：${inline.title}。${inline.detail.split('\n')[0]}`
  const notes: string[] = []
  if (iter !== null && endValue !== null) notes.push(`循环结束后 ${varMatch?.[1]} = ${endValue}，不再满足条件`)
  notes.push('循环变量在 C99 起可以写在 for 内，作用域只在这个循环')
  return makeInsight(no, '', 'flow', title, detail, notes)
}

function describeWhile(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const hb = headBody(stmt, 'while')
  if (!hb) return null
  const cond = hb.head.trim()
  const scanfMatch = cond.match(/scanf\s*\(\s*"([^"]*)"\s*,\s*&?(\w+)\s*\)\s*==\s*1/)
  if (scanfMatch) {
    const inline = describeInline(hb.rest, ctx, no)
    clearRuntimeValues(ctx)
    ctx.statements++
    record(ctx, 'flow')
    return makeInsight(no, '', 'flow', `循环读入 ${scanfMatch[2]}，直到输入失败或 ≤ 0`,
      `条件里的 scanf 每轮读入一个整数并返回成功项数；== 1 表示确实读到了。&& 具有短路特性：只有读取成功时才继续判断 ${scanfMatch[2]} > 0，读取失败就结束循环。${inline ? `\n循环体：${inline.title}。` : ''}`,
      ['输入结束（Ctrl+Z / Ctrl+D）时 scanf 返回 EOF，循环自然退出'])
  }
  const fgetsMatch = cond.match(/fgets\s*\(\s*(\w+)\s*,\s*([^,]+)\s*,\s*(\w+)\s*\)/)
  if (fgetsMatch && !/==|!=/.test(cond)) {
    const inline = describeInline(hb.rest, ctx, no)
    clearRuntimeValues(ctx)
    ctx.statements++
    record(ctx, 'flow')
    return makeInsight(no, '', 'flow', '逐行读取，直到文件结束',
      `fgets 成功读入一行返回缓冲区指针，到达文件末尾或出错返回 NULL；条件直接判断返回值，所以循环会在 EOF 时停止。${inline ? `\n循环体：${inline.title}。` : ''}`,
      ['不要用 while (!feof(fp))，feof 要等读取失败后才置位'])
  }
  const vm = cond.match(/^([A-Za-z_]\w*)\s*(<=|<|>=|>)\s*(.+)$/)
  const iter: number | null = null
  const endValue: number | null = null
  const inline = describeInline(hb.rest, ctx, no)
  clearRuntimeValues(ctx)
  ctx.statements++
  record(ctx, 'flow')
  let detail = `while 先判断再执行：条件为真的每一轮执行循环体，为假时直接跳到循环之后${iter !== null ? `；按当前初值共执行 ${iter} 轮` : ''}。`
  if (inline) detail += `\n循环体：${inline.title}。${inline.detail.split('\n')[0]}`
  const notes = ['循环体里必须有让条件最终变假的语句，否则会死循环']
  if (endValue !== null && vm) notes.push(`循环结束时 ${vm[1]} = ${endValue}`)
  return makeInsight(no, '', 'flow',
    iter !== null ? `当 ${condText(cond)} 时循环，共 ${iter} 轮` : `当 ${condText(cond)} 时重复执行`,
    detail, notes)
}

function describeDo(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  if (!/^do\s*\{?$/.test(stmt)) return null
  clearRuntimeValues(ctx)
  ctx.statements++
  record(ctx, 'flow')
  return makeInsight(no, '', 'flow', 'do-while：先执行一次循环体',
    'do-while 把判断放在循环体末尾，所以循环体至少执行一次，哪怕条件一开始就是假。', [])
}

function describeDoWhileTail(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const m = stmt.match(/^\}\s*while\s*\(([\s\S]*)\)\s*;?$/)
  if (!m) return null
  ctx.blocks.pop()
  ctx.depth = Math.max(0, ctx.depth - 1)
  ctx.statements++
  record(ctx, 'flow')
  return makeInsight(no, '', 'flow', `本轮结束判断 ${condText(m[1])}`,
    `条件成立就回到 do 继续下一轮，不成立则结束循环。注意这一行末尾必须有分号。`, ['do-while 的 while(...) 后面要加分号'])
}

function describeIf(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const isElse = /^else\b/.test(stmt)
  const src = isElse ? stmt.replace(/^else\s+/, '') : stmt
  const hb = headBody(src, 'if')
  if (!hb) return null
  const cond = hb.head.trim()
  const condVal = evalIn(cond, ctx)
  const branch = typeof condVal === 'number' ? (condVal !== 0 ? '当前条件为真，会进入这个分支' : '当前条件为假，会跳过这个分支') : ''
  const inline = describeInline(hb.rest, ctx, no)
  ctx.tracking = false
  ctx.controlSeen = true
  ctx.outputReliable = false
  if (ctx.funcPending) ctx.funcPending.control = true
  ctx.statements++
  record(ctx, 'flow')
  const title = `${isElse ? '否则，如果' : '如果'} ${condText(cond)}${inline ? `，${inline.title}` : '，执行分支'}`
  let detail = `${isElse ? '前面的 if 都不成立时，' : ''}判断 ${condText(cond)}${branch ? `：${branch}` : '，条件成立才进入分支'}。`
  if (inline) detail += `\n分支内：${inline.detail}`
  const notes = ['赋值用 =，比较用 ==，条件里写错会静默改变变量']
  if (inline) notes.push(...inline.notes.slice(0, 2))
  return makeInsight(no, '', 'flow', title, detail, notes)
}

function describeElse(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const m = stmt.match(/^else\b\s*([\s\S]*)$/)
  if (!m) return null
  const inline = describeInline(m[1], ctx, no)
  clearRuntimeValues(ctx)
  ctx.statements++
  record(ctx, 'flow')
  return makeInsight(no, '', 'flow', `否则执行 else 分支${inline ? `：${inline.title}` : ''}`,
    `前面所有 if / else if 都不成立时才走到这里；else 总是和最近的未配对 if 结合。${inline ? `\n${inline.detail}` : ''}`, [])
}

function describeSwitch(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const hb = headBody(stmt, 'switch')
  if (!hb) return null
  clearRuntimeValues(ctx)
  ctx.statements++
  record(ctx, 'flow')
  return makeInsight(no, '', 'flow', `根据 ${condText(hb.head)} 的值选择分支`,
    `switch 只接受整型 / 字符型 / 枚举表达式；程序跳到匹配的 case，之后一直往下执行，直到遇到 break 或 switch 结束。`, ['漏写 break 会发生贯穿（fall through）'])
}

function describeCase(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const m = stmt.match(/^(case\s+([^:]+)|default)\s*:\s*([\s\S]*)$/)
  if (!m) return null
  const label = m[1].replace(/\s+/g, ' ')
  const rest = (m[3] || '').trim()
  const inner = rest ? splitTop(rest, ';').map((s) => analyzeSimpleStatement(s, ctx, no)).filter(Boolean) as LineInsight[] : []
  clearRuntimeValues(ctx)
  ctx.statements++
  record(ctx, 'flow')
  const title = m[2] ? `${label} 匹配时执行${inner.length ? `：${inner[0].title}` : ''}` : '没有 case 匹配时执行 default'
  let detail = `switch 的值等于 ${m[2] ? m[2].trim() : '任意 case 都不匹配'} 时跳到这里${inner.length ? `；本行还执行了 ${inner.length} 条语句` : ''}。case 只是跳转标签，不会自动结束分支。`
  if (inner.length) detail += `\n${inner.map((x, i) => `${i + 1}. ${x.title}：${x.detail.split('\n')[0]}`).join('\n')}`
  return makeInsight(no, '', 'flow', title, detail, inner.flatMap((x) => x.notes).slice(0, 3))
}

function describeBlockOnly(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  if (stmt === '{') {
    ctx.depth++
    return makeInsight(no, '', 'block', '进入新的代码块', '左花括号开启作用域；在这里声明的变量只在这个块内有效。', [])
  }
  if (stmt === '}' || stmt === '};') {
    const block = ctx.blocks.pop()
    if (ctx.depth > 0) ctx.depth--
    if (block?.type === 'func') {
      const isMain = ctx.funcName === 'main'
      const pending = ctx.funcPending
      if (pending && pending.name === ctx.funcName && pending.returns.length === 1 && !pending.control) {
        ctx.funcs.set(pending.name, { params: pending.params, body: pending.returns[0] })
      }
      ctx.funcPending = null
      ctx.funcName = null
      ctx.inMain = false
      ctx.tracking = false
      return makeInsight(no, '', 'block',
        isMain ? 'main 函数结束，进程退出' : '函数结束，控制权交回调用者',
        isMain ? 'main 的返回值作为进程退出码；函数内的局部变量在这里销毁。' : '函数内的局部变量随栈帧销毁，返回值已经复制给调用者。', [])
    }
    if (block?.type === 'struct') {
      ctx.inStruct = null
      return makeInsight(no, '', 'type', '结构体 / 共用体定义结束', '类型定义到此完成，记得分号；之后可以用这个类型声明变量。', [])
    }
    return makeInsight(no, '', 'block', '结束当前代码块',
      '离开作用域时，块内声明的局部变量失效，内存自动回收（堆内存除外）。', [])
  }
  return null
}

function describeFunctionHeader(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const m = stmt.match(/^((?:static|inline)\s+)*((?:unsigned\s+|signed\s+)?(?:long\s+long|long|short|int|char|float|double|void|size_t)|struct\s+\w+)\s+(\*+)?\s*([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(\{)?\s*([\s\S]*)$/)
  if (!m) return null
  const isStatic = !!m[1]
  const ret = `${m[2]}${m[3] ? ' ' + m[3] : ''}`.replace(/\s+/g, ' ').trim()
  const name = m[4]
  const paramsRaw = m[5].trim()
  let body = (m[7] || '').trim()
  if (body.endsWith('}')) body = body.slice(0, -1).trim()
  if (!m[6] && !body.replace(/;\s*$/, '').trim()) {
    // prototype
    if (!ctx.functions.includes(name)) ctx.functions.push(name)
    return makeInsight(no, '', 'declare', `声明函数 ${name} 的原型`,
      `提前告诉编译器 ${name} 的参数列表与返回类型（${ret}），这样后面的 main 可以在定义之前调用它。原型以分号结尾，参数名可以省略。`,
      ['函数原型、定义、调用的参数类型必须一致'])
  }

  const params = paramsRaw === 'void' || !paramsRaw ? [] : splitTop(paramsRaw, ',')
  ctx.vars = new Map(ctx.globals)
  ctx.funcName = name
  ctx.funcReturn = ret
  ctx.inMain = name === 'main'
  ctx.depth = 1
  ctx.tracking = name === 'main'
  ctx.blocks.push({ type: 'func', no })
  if (ctx.inMain) {
    if (!ctx.functions.includes('main')) ctx.functions.push('main')
  } else if (!ctx.functions.includes(name)) ctx.functions.push(name)

  const paramNames: string[] = []
  params.forEach((p) => {
    const pm = p.trim().match(/^(.*?)([A-Za-z_]\w*)$/)
    if (!pm) return
    const t = pm[1].replace(/\*+/, '').trim() + (/\*/.test(pm[1]) ? ' *' : '')
    ctx.vars.set(pm[2], { type: t, value: undefined })
    paramNames.push(pm[2])
  })
  ctx.funcParams = paramNames
  ctx.funcPending = name === 'main' ? null : { name, params: paramNames, returns: [], control: false }

  ctx.statements++
  record(ctx, 'entry')
  const isMain = name === 'main'
  const paramText = params.length ? params.map((p) => p.trim()).join('、') : '无参数'
  let title = isMain ? '主函数 main：程序从这里开始执行' : `定义函数 ${name}（${params.length} 个参数）`
  let detail = isMain
    ? `int 表示返回状态码给操作系统，void 表示不接收命令行参数。左花括号开启函数体，语句从上到下执行，遇到 return 或右花括号结束。`
    : `返回类型 ${ret}，形参 ${paramText}。函数只有被调用时才执行；形参拿到的是一份副本（值传递），要在函数内改到调用者的变量，必须传指针。`
  if (isStatic) detail += ' static 让函数只在当前源文件可见。'
  if (body) {
    const innerItems = splitTop(body, ';').map((x) => analyzeSimpleStatement(x, ctx, no)).filter(Boolean) as LineInsight[]
    if (innerItems.length) {
      title += `：${innerItems[0].title}`
      detail += `\n函数体：${innerItems.map((x, i) => `${i + 1}. ${x.title} — ${x.detail.split('\n')[0]}`).join('\n')}`
    }
    const retOnly = body.match(/^return\s+([\s\S]+?);?$/)
    if (retOnly && !isMain && innerItems.length === 1) {
      ctx.funcs.set(name, { params: paramNames, body: retOnly[1].trim() })
    }
    ctx.funcPending = null
    // 一行写完的函数：分析完就结束作用域
    ctx.blocks.pop()
    ctx.funcName = null
    ctx.inMain = false
    ctx.depth = 0
  }
  return makeInsight(no, '', 'entry', title, detail,
    isMain ? ['C11 标准要求 main 返回 int'] : ['返回类型与 return 表达式必须兼容'])
}

function describeStructLike(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const enumMatch = stmt.match(/^enum\s+([A-Za-z_]\w*)\s*\{([\s\S]*)\}\s*;?$/)
  if (enumMatch) {
    const values = splitTop(enumMatch[2], ',').map((x) => x.trim())
    let next = 0
    const rendered: string[] = []
    for (const item of values) {
      const [n, v] = item.split('=').map((x) => x.trim())
      const val = v !== undefined ? evalIn(v, ctx) : next
      const iv = typeof val === 'number' ? val : next
      if (n) {
        ctx.vars.set(n, { type: 'int', value: iv })
        if (!ctx.funcName) ctx.globals.set(n, { type: 'int', value: iv })
      }
      next = iv + 1
      rendered.push(`${n} = ${iv}`)
    }
    return makeInsight(no, '', 'type', `定义枚举 enum ${enumMatch[1]}`,
      `枚举给一组整数起名字：${rendered.slice(0, 6).join('、')}${rendered.length > 6 ? '…' : ''}。没有显式赋值的枚举项会在前一项基础上加 1。`,
      ['枚举本质上是 int，提高可读性但不会做取值范围检查'])
  }
  const structMatch = stmt.match(/^(struct|union)\s+([A-Za-z_]\w*)\s*\{([\s\S]*)\}\s*;?$/)
  if (structMatch) {
    const kind = structMatch[1]
    const members = splitTop(structMatch[3], ';').filter(Boolean).map((x) => x.trim())
    const names = parseMemberNames(structMatch[3])
    ctx.structs.set(structMatch[2], names)
    return makeInsight(no, '', 'type', `定义${kind === 'struct' ? '结构体' : '共用体'} ${structMatch[2]}`,
      kind === 'struct'
        ? `结构体把 ${members.length} 个成员打包成一个整体，成员按声明顺序排列。这里只定义类型，不分配存储；使用时写 ${structMatch[2]} 变量名。`
        : `共用体的所有成员共享同一块内存，大小等于最大的成员。同一时刻只应使用一个成员，写入一个会覆盖另一个的字节解释。`,
      ['定义末尾的分号不能少', '成员访问用 .，指针访问用 ->'])
  }
  const open = stmt.match(/^(struct|union)\s+([A-Za-z_]\w*)\s*\{$/)
  if (open) {
    ctx.inStruct = open[2]
    ctx.blocks.push({ type: 'struct', no })
    return makeInsight(no, '', 'type', `开始定义${open[1] === 'struct' ? '结构体' : '共用体'} ${open[2]}`,
      '下面几行是成员声明，不分配存储；右花括号后的分号结束定义。', [])
  }
  const typedefStruct = stmt.match(/^typedef\s+(struct|union)\s*\{([\s\S]*)\}\s*([A-Za-z_]\w*)\s*;?$/)
  if (typedefStruct) {
    ctx.typedefs.set(typedefStruct[3], 'struct')
    const names = parseMemberNames(typedefStruct[2])
    ctx.structs.set(typedefStruct[3], names)
    return makeInsight(no, '', 'type', `为匿名结构体定义别名 ${typedefStruct[3]}`,
      `typedef 给类型起别名，不会创建新类型。之后可以直接写 ${typedefStruct[3]} p;，省略 struct 关键字。`,
      ['typedef 只是别名，不分配内存'])
  }
  const typedefSimple = stmt.match(/^typedef\s+([\s\S]+?)\s+([A-Za-z_]\w*)\s*;?$/)
  if (typedefSimple) {
    ctx.typedefs.set(typedefSimple[2], typedefSimple[1])
    return makeInsight(no, '', 'type', `为 ${typedefSimple[1]} 起别名 ${typedefSimple[2]}`,
      `之后写 ${typedefSimple[2]} 就等价于写 ${typedefSimple[1]}；typedef 只影响名字，不影响存储和类型检查。`, [])
  }
  return null
}

function describePreprocessor(line: string, ctx: Ctx, no: number): LineInsight {
  const m = line.match(/^#\s*(\w+)\s*([\s\S]*)$/)
  const directive = m?.[1] || ''
  const rest = (m?.[2] || '').trim()
  record(ctx, 'pre')
  if (directive === 'include') {
    const name = rest.replace(/[<>"]/g, '')
    const info: Record<string, { desc: string; detail: string; notes: string[] }> = {
      'stdio.h': {
        desc: '标准输入输出',
        detail: '让 printf、scanf、fgets、FILE、fopen 等声明可见；预处理阶段会把头文件内容原地展开，不生成运行时代码。',
        notes: ['尖括号表示从系统头文件目录查找', '头文件只提供声明，实现由标准库在链接阶段接入'],
      },
      'stdlib.h': {
        desc: '通用工具与动态内存',
        detail: '提供 malloc、calloc、realloc、free、exit、atoi 等函数声明，是堆内存管理的入口。',
        notes: ['malloc / free 必须成对使用', 'exit 会直接结束进程'],
      },
      'string.h': {
        desc: '字符串处理',
        detail: '提供 strlen、strcpy、strcmp、strcat、memcpy 等字符串 / 内存函数声明。',
        notes: ['strcpy 不检查目标缓冲区大小，优先用 strncpy 或 snprintf'],
      },
      'math.h': {
        desc: '数学函数',
        detail: '提供 sqrt、pow、fabs、sin 等数学函数声明。',
        notes: ['Linux 下用 gcc 链接时需要加 -lm'],
      },
      'limits.h': {
        desc: '整数取值范围',
        detail: '提供 INT_MAX、INT_MIN、UINT_MAX 等宏，用来看当前平台上整型的边界。',
        notes: ['溢出是有符号整数的未定义行为'],
      },
      'assert.h': {
        desc: '断言',
        detail: '提供 assert 宏，条件不成立时打印文件名、行号并中止程序，常用于调试。',
        notes: ['定义 NDEBUG 后 assert 会被编译器移除'],
      },
    }
    const it = info[name] || { desc: name, detail: `引入 ${name} 中的声明。`, notes: [] }
    return makeInsight(no, '', 'pre', `引入头文件 ${name}（${it.desc}）`, it.detail, it.notes)
  }
  if (directive === 'define') {
    const dm = rest.match(/^([A-Za-z_]\w*)(\(([^)]*)\))?\s*([\s\S]*)$/)
    const name = dm?.[1] || rest
    const params = dm?.[3]
    const body = (dm?.[4] || '').trim()
    if (params !== undefined) {
      const parts = splitTop(params, ',')
      ctx.macros.set(name, { params: parts, body })
      return makeInsight(no, '', 'pre', `定义函数式宏 ${name}(${params})`,
        `宏在预处理阶段做文本替换：调用 ${name}(${parts.join(', ')}) 时，直接把参数原样替换进 ${body}。参数和整体都加括号，才能避免优先级错误。`,
        ['宏可能重复求值，不要传入 i++ 这类有副作用的表达式', '宏定义末尾不加分号'])
    }
    ctx.macros.set(name, { params: null, body })
    return makeInsight(no, '', 'pre', `定义符号常量 ${name} = ${body}`,
      `预处理阶段把后续代码里的 ${name} 原样替换成 ${body}；它不占内存、没有类型检查。宏名习惯用全大写。`,
      ['宏替换发生在编译之前，调试器看不到这个变量', '定义末尾不要加分号'])
  }
  return makeInsight(no, '', 'pre', `预处理指令 #${directive}`, '预处理在真正编译之前执行，负责展开头文件、替换宏和处理条件编译。', [])
}

function describeShell(line: string, no: number): LineInsight | null {
  const t = line.trim()
  if (/^(gcc|clang)\s/.test(t)) {
    return makeInsight(no, '', 'shell', '用 gcc 编译源文件',
      `把 hello.c 编译成可执行文件：-std=c11 指定 C11 标准，-Wall 打开常用警告，-o hello 指定输出文件名。编译通过后当前目录会多出 hello（Windows 上是 hello.exe）。`,
      ['警告也要看，很多未定义行为会先以警告出现'])
  }
  if (/^\.\/\S+/.test(t) || /^\$\s+\.\//.test(t)) {
    return makeInsight(no, '', 'shell', '运行编译出的程序',
      `./hello 表示执行当前目录下的 hello 文件；程序从 main 开始，输出会直接打印到终端。`,
      ['Windows 下直接输入 hello.exe 或 hello'])
  }
  return null
}

function describeAssert(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const call = parseCall(stmt)
  if (!call || call.name !== 'assert') return null
  ctx.statements++
  record(ctx, 'flow')
  return makeInsight(no, '', 'flow', `断言：${short(call.args[0] || '', 36)} 必须成立`,
    'assert 在运行时检查条件，为假就打印文件名、行号和表达式并调用 abort 终止程序；它是调试工具，不是用户输入校验。',
    ['发布版本通常定义 NDEBUG 关闭断言'])
}

function describeCall(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const call = parseCall(stmt)
  if (!call) return null
  const { name, args } = call
  ctx.statements++
  record(ctx, 'call')
  if (name === 'free') {
    return makeInsight(no, '', 'memory', `释放 ${args[0] || '指针'} 指向的堆内存`,
      'free 把这块内存还给分配器，之后不能再访问；指针变量本身还保存着旧地址，立即置 NULL 可以避免悬空指针。',
      ['重复 free 或 free 非堆指针都是未定义行为'])
  }
  if (name === 'fclose') {
    return makeInsight(no, '', 'io', '关闭文件',
      'fclose 会把缓冲区里还没写盘的数据刷新出去，并释放文件句柄；返回值 0 表示成功。',
      ['打开的文件都要关闭，否则可能丢数据或耗尽句柄'])
  }
  if (name === 'fopen') {
    return makeInsight(no, '', 'io', '打开文件并返回文件指针',
      '"w" 表示只写：文件不存在就创建，存在就清空；失败返回 NULL。',
      ['打开后必须检查返回值是否为 NULL'])
  }
  if (name === 'fputs') {
    return makeInsight(no, '', 'io', `向文件写入 ${short(args[0] || '', 16)}`,
      'fputs 把字符串写到文件流，不自动追加换行；写入位置由当前文件指针决定。', [])
  }
  if (name === 'fprintf') {
    return makeInsight(no, '', 'io', '按格式向文件写入数据',
      'fprintf 和 printf 用法相同，只是第一个参数指定目标文件流；格式串决定写入内容的形状。', [])
  }
  if (name === 'fgets') {
    return makeInsight(no, '', 'io', `从文件 / 标准输入读取一行到 ${args[0] || '缓冲区'}`,
      `fgets 最多读 size-1 个字符，遇到换行或 EOF 停止，并自动补 '\\0'；比 gets 安全。`,
      ['换行符会保留在缓冲区里，需要时手动去掉'])
  }
  if (name === 'malloc' || name === 'calloc' || name === 'realloc') {
    const title = name === 'malloc' ? '在堆上申请内存'
      : name === 'calloc' ? '在堆上申请并清零内存' : '调整已分配内存的大小'
    const detail = name === 'malloc'
      ? `malloc(${args.join(', ')}) 申请指定字节数的连续内存，返回 void*；内容不初始化。`
      : name === 'calloc'
        ? `calloc(${args.join(', ')}) 申请 count 个元素并把每个字节清零，因此元素初值都是 0。`
        : 'realloc 可能把内存搬到新地址，必须用临时指针接收返回值，避免失败时丢失原指针。'
    return makeInsight(no, '', 'memory', title, detail,
      ['申请失败返回 NULL，使用前必须判断', '堆内存用完后要 free'])
  }
  if (name === 'strlen') {
    return makeInsight(no, '', 'call', `求字符串长度 strlen(${args[0]})`,
      'strlen 从首字符开始数到 \\0 为止，不包含结束符；它要遍历字符串，复杂度 O(n)。',
      ['sizeof 是编译期字节数，strlen 是运行期字符数'])
  }
  if (name === 'strcmp') {
    return makeInsight(no, '', 'call', '按字典序比较两个字符串',
      'strcmp 返回 0 表示相等，负数表示前者小，正数表示前者大；不要用 == 比较字符串内容。', [])
  }
  if (name === 'sqrt' || name === 'pow' || name === 'fabs') {
    return makeInsight(no, '', 'call', `调用数学函数 ${name}()`,
      `${name} 接收 double 参数并返回 double；传入整数会自动转换。`, ['链接时可能需要 -lm'])
  }
  if (name === 'set' || args.some((a) => a.trim().startsWith('&'))) {
    const target = args.find((a) => a.trim().startsWith('&'))
    const tname = target?.trim().replace(/^&\s*/, '')
    if (tname && ctx.vars.has(tname)) {
      ctx.vars.set(tname, { ...(ctx.vars.get(tname) as CVar), value: undefined })
    }
    return makeInsight(no, '', 'call', `把${target ? ` ${target.trim()} 的地址` : '指针'}传给函数`,
      '函数收到地址后可以通过指针修改调用者的变量；这是 C 实现「传引用效果」的方式。',
      ['被调函数不能保存指向局部变量的指针'])
  }
  if (/^(printf|scanf)$/.test(name)) return null
  const known = ctx.functions.includes(name)
  return makeInsight(no, '', 'call',
    known ? `调用函数 ${name}(${args.join(', ')})` : `调用 ${name}()`,
    known
      ? `把实参 ${args.length ? args.join('、') : '（无）'} 传给 ${name}：普通变量传副本，数组名传首元素地址。函数返回后继续执行下一行。`
      : `调用 ${name} 完成一次操作；注意参数个数、类型和返回值是否符合声明。`,
    [])
}

function describeExpression(stmt: string, ctx: Ctx, no: number): LineInsight | null {
  const inc = describeIncrement(stmt, ctx, no)
  if (inc) return inc
  const assign = describeAssignment(stmt, ctx, no)
  if (assign) return assign
  const call = describeCall(stmt, ctx, no)
  if (call) return call
  ctx.statements++
  return makeInsight(no, '', 'block', `执行表达式 ${short(stmt, 32)}`,
    '这是一条表达式语句，计算表达式的值后丢弃结果（除非包含赋值或函数调用等副作用）。', [])
}

function analyzeSimpleStatement(stmtRaw: string, ctx: Ctx, no: number): LineInsight | null {
  const stmt = stmtRaw.trim().replace(/;\s*$/, '').trim()
  if (!stmt) return null
  const ret = describeReturn(stmt, ctx, no); if (ret) return ret
  const bc = describeBreakContinue(stmt, ctx, no); if (bc) return bc
  const sw = describeSwitch(stmt, ctx, no); if (sw) return sw
  const cs = describeCase(stmt, ctx, no); if (cs) return cs
  const iff = describeIf(stmt, ctx, no); if (iff) return iff
  const els = describeElse(stmt, ctx, no); if (els) return els
  const fr = describeFor(stmt, ctx, no); if (fr) return fr
  const wh = describeWhile(stmt, ctx, no); if (wh) return wh
  const dw = describeDoWhileTail(stmt, ctx, no); if (dw) return dw
  const doo = describeDo(stmt, ctx, no); if (doo) return doo
  const pr = describePrintf(stmt, ctx, no); if (pr) return pr
  const sc = describeScanf(stmt, ctx, no); if (sc) return sc
  const as = describeAssert(stmt, ctx, no); if (as) return as
  const decl = analyzeDeclaration(stmt, ctx, no, !!ctx.inStruct); if (decl) return decl
  const expr = describeExpression(stmt, ctx, no); if (expr) return expr
  return null
}

function analyzeLine(raw: string, no: number, ctx: Ctx): LineInsight | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const { code, comment } = stripComment(raw)
  let body = code.trim()
  if (!body) {
    return makeInsight(no, raw, 'comment', `注释：${short(comment, 40)}`, '注释不会被编译，只写给读代码的人看。', [])
  }
  // } else / } else if：先结束上一个代码块，再分析 else 分支
  const bridge = body.match(/^\}\s*(else\b[\s\S]*)$/)
  if (bridge) {
    ctx.blocks.pop()
    ctx.depth = Math.max(0, ctx.depth - 1)
    body = bridge[1].trim()
  }

  if (ctx.inStruct) {
    const member = body.replace(/;$/, '').trim()
    if (member && !/^[{}]/.test(member)) {
      const dm = member.match(new RegExp(`^(${typePattern(ctx)})\\s+(\\*+\\s*)?([A-Za-z_]\\w*)\\s*((?:\\[[^\\]]*\\])*)$`))
      if (dm) {
        return makeInsight(no, raw, 'type', `结构体成员 ${dm[3]}：${dm[1]}${dm[4]}`,
          `成员按声明顺序排列；${dm[1]} 占 ${typeSize(dm[1])} 字节${dm[4] ? '，数组会按长度倍增' : ''}。所有成员加起来（含对齐填充）就是结构体的大小。`, [])
      }
    }
  }

  const block = describeBlockOnly(body, ctx, no)
  if (block) return block

  const shell = describeShell(body, no)
  if (shell) return shell

  if (/^#/.test(body)) return describePreprocessor(body, ctx, no)

  const fn = describeFunctionHeader(body, ctx, no)
  if (fn) return fn

  const st = describeStructLike(body, ctx, no)
  if (st) return st

  // 同一行有多条普通语句时逐条分析（控制语句整行交给对应解析器）
  const isControlLine = /^(if|for|while|do|switch|else|case|default)\b/.test(body)
  const many = splitTop(body, ';')
  if (!isControlLine && many.length > 1) {
    const items = many.map((p) => analyzeSimpleStatement(p, ctx, no)).filter(Boolean) as LineInsight[]
    if (items.length) {
      if (items.length === 1) { markFlow(ctx, no, items[0].title); return items[0] }
      const title = `连续执行 ${items.length} 条语句`
      const detail = items.map((it, i) => `${i + 1}. ${it.title}\n${it.detail}`).join('\n')
      markFlow(ctx, no, items[0].title)
      return makeInsight(no, raw, items[0].tone, title, detail, items.flatMap((x) => x.notes).slice(0, 4))
    }
  }

  // 带花括号的控制语句：先分析头部，再压栈
  const isBlockHeader = /\{\s*$/.test(body)
  const head = isBlockHeader ? body.replace(/\{\s*$/, '').trim() : body
  const headInsight = analyzeSimpleStatement(head, ctx, no)
  if (headInsight) {
    if (isBlockHeader) {
      ctx.blocks.push({ type: /^for|^while|^do/.test(head) ? 'loop' : /^if|^else|^switch/.test(head) ? 'if' : 'block', no })
      ctx.depth++
    }
    markFlow(ctx, no, headInsight.title)
    return headInsight
  }

  const parts = splitTop(body, ';')
  const items = parts.map((p) => analyzeSimpleStatement(p, ctx, no)).filter(Boolean) as LineInsight[]
  if (!items.length) return null
  if (items.length === 1) { markFlow(ctx, no, items[0].title); return items[0] }
  const title = `连续执行 ${items.length} 条语句`
  const detail = items.map((it, i) => `${i + 1}. ${it.title}\n${it.detail}`).join('\n')
  markFlow(ctx, no, items[0].title)
  return makeInsight(no, raw, items[0].tone, title, detail, items.flatMap((x) => x.notes).slice(0, 4))
}

function collectPitfalls(code: string, analysis: CodeAnalysis, ctx: Ctx): string[] {
  const out: string[] = []
  const push = (s: string) => { if (!out.includes(s)) out.push(s) }

  if (/scanf\s*\(/.test(code)) {
    const calls = [...code.matchAll(/scanf\s*\(([^;]*?)\)\s*;/g)]
    for (const c of calls) {
      const args = splitTop(c[1], ',')
      const dests = args.slice(1)
      if (dests.some((d) => !d.trim().startsWith('&') && !/\[/.test(d))) {
        push('scanf 读取普通变量时要传地址（&x），漏写 & 会写入错误地址甚至崩溃')
      }
    }
  }
  if (/\bif\s*\([^)]*[^=!<>]=[^=]/.test(code)) push('条件里的 = 是赋值，比较相等要用 ==')
  if (/malloc|calloc|realloc/.test(code) && !/NULL|nullptr|!\s*\w+/.test(code)) push('malloc / calloc 可能返回 NULL，使用前要判断')
  if (/\bfree\s*\(/.test(code) && !/=\s*NULL/.test(code)) push('free 之后把指针置 NULL，避免悬空指针被再次使用')
  if (/\bchar\s*\*\s*\w+\s*=\s*"/.test(code)) push('char *p = "..." 指向只读字符串，不能通过 p 修改字符')
  if (/\bgets\s*\(/.test(code)) push('gets 不检查缓冲区大小，已被 C11 移除，改用 fgets')
  if (/while\s*\(\s*1\s*\)/.test(code) && !/break/.test(code)) push('while(1) 没有 break 会永远循环')
  if (/\+\+\s*\w+[^;]*,\s*\w+\s*\+\+/.test(code) || /\w+\+\s*[^;]*,\s*\+\+\s*\w+/.test(code)) {
    push('同一个表达式中对同一变量多次自增属于未定义行为，拆成两条语句')
  }
  if (/\bint\b[^;]*\/[^;]*;/.test(code) && /\/\s*\d+/.test(code) && !/\(double\)|\.\d/.test(code)) {
    push('两个整数相除会截断小数，需要小数时先转换成 double')
  }
  if (/#define\s+\w+\([^)]*\)\s*[^(\n]/.test(code)) push('函数式宏的参数和整体都要加括号')
  if (/\bfeof\s*\(/.test(code)) push('feof 要等读取失败后才置位，不要用它作为循环条件')
  if (analysis.output === null && /printf/.test(code) && ctx.controlSeen) {
    push('这段代码含有分支 / 循环 / 输入，实际输出取决于运行时数据')
  }
  return out.slice(0, 5)
}

function prescanFunctions(code: string, ctx: Ctx) {
  for (const line of code.split('\n')) {
    const m = line.trim().match(/^(?:(?:static|inline)\s+)*(?:unsigned\s+|signed\s+)?(?:long\s+long|long|short|int|char|float|double|void)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{\s*return\s+([\s\S]+?)\s*;?\s*\}\s*;?$/)
    if (!m || m[1] === 'main') continue
    const params = m[2].trim() === 'void' || !m[2].trim()
      ? []
      : splitTop(m[2], ',').map((p) => p.trim().split(/\s+/).pop() || '').filter(Boolean)
    ctx.funcs.set(m[1], { params, body: m[3] })
  }
}

export function analyzeCode(codeRaw: string, context?: { name?: string; summary?: string }): CodeAnalysis {
  const code = codeRaw.replace(/\r\n/g, '\n').replace(/\t/g, '  ')
  const rawLines = code.split('\n')
  const ctx: Ctx = {
    vars: new Map(), typedefs: new Map(), funcName: null, funcReturn: '', inMain: false,
    depth: 0, blocks: [], inStruct: null,     tracking: false, outputReliable: true,
    outputs: [], outputTrace: [], flow: [], tags: [], functions: [], statements: 0, controlSeen: false,
    funcs: new Map(), macros: new Map(), funcParams: [], funcPending: null,
    globals: new Map(), structs: new Map(),
  }
  prescanFunctions(code, ctx)
  const lines: LineInsight[] = []
  let inComment = false
  rawLines.forEach((raw, idx) => {
    const no = idx + 1
    let text = raw
    if (inComment) {
      if (text.includes('*/')) { inComment = false; text = text.slice(text.indexOf('*/') + 2) }
      else return
    }
    const open = text.indexOf('/*')
    if (open >= 0 && !text.includes('*/', open)) {
      inComment = true
      text = text.slice(0, open)
    }
    const insight = analyzeLine(text, no, ctx)
    if (insight) {
      insight.code = raw
      lines.push(insight)
    }
  })

  const codeLines = rawLines.filter((l) => l.trim()).length
  const stats = { codeLines, statements: ctx.statements, functions: ctx.functions.length }
  const output = ctx.outputReliable && ctx.outputs.length ? ctx.outputs.join('') : null

  const firstOutputLine = output?.split('\n').find((x) => x.trim()) || ''
  const name = context?.name?.trim() || '这段 C 代码'
  const purpose = output
    ? `用 ${codeLines} 行代码演示「${name}」：运行后在终端输出「${short(firstOutputLine, 30)}」。`
    : ctx.functions.length > 1
      ? `定义 ${ctx.functions.filter((f) => f !== 'main').slice(0, 3).join('、') || '多个函数'} 并在 main 中调用，演示「${name}」的完整执行过程。`
      : `逐行读懂这 ${codeLines} 行代码在做什么、变量如何变化，掌握「${name}」的写法。`

  const entry = ctx.functions.includes('main')
    ? 'main() · 无参数 · 返回 int'
    : /gcc|clang/.test(code) ? '终端命令，无 main 函数' : '由外部调用'

  const constructs = [...new Set(ctx.tags)].slice(0, 5).map((tone) => tagOf(tone as InsightTone))
  const pitfalls = collectPitfalls(code, { lines, purpose, entry, output, outputsPreview: [], flow: ctx.flow, constructs, pitfalls: [], stats }, ctx)
  if (!ctx.flow.length && lines.length) {
    lines.slice(0, 5).forEach((l) => { if (l.tone !== 'pre' && l.tone !== 'block') ctx.flow.push({ no: l.no, text: short(l.title, 34) }) })
  }

  return {
    lines,
    purpose,
    entry,
    output,
    outputsPreview: ctx.outputTrace
      .filter((t) => t.text.length)
      .slice(0, 6)
      .map((t) => `L${t.no} 输出「${short(escapeForDisplay(t.text), 46)}」`),
    flow: ctx.flow.slice(0, 8),
    constructs,
    pitfalls,
    stats,
  }
}
