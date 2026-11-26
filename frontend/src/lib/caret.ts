// 计算 textarea 中指定光标位置的像素坐标，用于在光标后渲染内联补全提示（幽灵文字）。
// 原理：创建一个与 textarea 完全同款样式的隐藏镜像节点，把光标前的文本写进去，
// 再追加一个零宽标记，读取标记的 offset 即得到光标位置。

const MIRROR_KEYS = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch',
  'letterSpacing', 'lineHeight', 'textIndent', 'textTransform', 'wordSpacing',
  'tabSize', 'whiteSpace', 'wordBreak', 'overflowWrap', 'direction',
] as const

export interface CaretMetrics {
  /** 相对 textarea 边框盒左侧的 x 坐标（已包含左内边距） */
  left: number
  /** 相对 textarea 边框盒顶部的 y 坐标（已包含上内边距） */
  top: number
  /** 该行文字内容区高度，用于让幽灵文字与正文基线对齐 */
  lineHeight: number
}

export function caretCoordinates(ta: HTMLTextAreaElement, position: number): CaretMetrics {
  const cs = window.getComputedStyle(ta)
  const mirror = document.createElement('div')
  mirror.setAttribute('aria-hidden', 'true')
  const style = mirror.style

  style.position = 'absolute'
  style.visibility = 'hidden'
  style.top = '0'
  style.left = '-9999px'
  style.height = 'auto'
  style.overflow = 'hidden'
  style.whiteSpace = 'pre-wrap'
  style.wordBreak = 'break-word'
  style.overflowWrap = 'break-word'

  const from = cs as unknown as Record<string, string>
  const to = style as unknown as Record<string, string>
  for (const key of MIRROR_KEYS) {
    const value = from[key]
    if (value) to[key] = value
  }
  style.width = cs.width

  const before = ta.value.slice(0, position)
  mirror.textContent = before
  const marker = document.createElement('span')
  // 行尾换行时用空格占位，避免标记落到上一行
  marker.textContent = before.endsWith('\n') ? ' ' : '\u200b'
  mirror.appendChild(marker)

  document.body.appendChild(mirror)
  const metrics: CaretMetrics = {
    left: marker.offsetLeft,
    top: marker.offsetTop,
    lineHeight: marker.offsetHeight || Math.round(parseFloat(cs.lineHeight) || 20),
  }
  document.body.removeChild(mirror)

  return metrics
}
