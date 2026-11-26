/**
 * C//CAT 品牌组件 —— 像素猫「编译猫」是整个平台的形象主线：
 * 侧栏标识、首页学习搭子、AI 助手头像、空态、登录页都由这里统一输出，
 * 保证同一个形象在不同尺度下（24px 头像 / 44px 标识 / 180px 贴纸）都成立。
 */
import type { CSSProperties, ReactNode } from 'react'

const MARK = '/brand/c-cat-mark.png'
const STICKER = '/brand/c-cat.webp'

export function MascotMark({
  size = 44, className = '', radius, glow = true, alt = 'C//CAT 编译猫标识',
}: {
  size?: number
  className?: string
  radius?: number
  glow?: boolean
  alt?: string
}) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius ?? Math.round(size * 0.3),
  }
  return (
    <span className={`brand-mark ${className}`} style={style}>
      <img
        src={MARK}
        alt={alt}
        draggable={false}
        style={{ width: Math.round(size * 0.84), height: Math.round(size * 0.84) }}
      />
      {glow && <span className="brand-mark-ping" aria-hidden />}
    </span>
  )
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  if (compact) return <MascotMark size={38} />
  return (
    <div className="flex items-center gap-3">
      <MascotMark size={52} />
      <div className="min-w-0">
        <div className="brand-word">
          C<span className="brand-slash">//</span>CAT<span className="brand-caret" aria-hidden />
        </div>
        <div className="brand-sub">C LEARNING OS · C11</div>
      </div>
    </div>
  )
}

/** AI 对话中的圆形像素猫头像 */
export function CatAvatar({ size = 30, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`cat-avatar ${className}`} style={{ width: size, height: size }} aria-hidden>
      <img src={MARK} alt="" draggable={false} style={{ width: size * 0.9, height: size * 0.9 }} />
    </span>
  )
}

/** 大尺寸贴纸（首页搭子、登录页、空态插画） */
export function MascotSticker({
  size = 120, className = '', float = true,
}: { size?: number; className?: string; float?: boolean }) {
  return (
    <img
      src={STICKER}
      alt="C//CAT 学习搭子"
      draggable={false}
      className={`mascot-sticker ${float ? 'mascot-float' : ''} ${className}`}
      style={{ width: size }}
    />
  )
}

/** 猫猫对话气泡：尾巴朝向猫那一侧 */
export function CatSpeech({
  children, tail = 'right', className = '',
}: { children: ReactNode; tail?: 'left' | 'right'; className?: string }) {
  return (
    <div className={`cat-bubble cat-bubble--${tail} ${className}`}>
      <span className="cat-bubble-tail" aria-hidden />
      {children}
    </div>
  )
}

/** 「搭子说」一行提示：小头像 + 文案 */
export function CatNote({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <CatAvatar size={24} className="mt-0.5 shrink-0" />
      <div className="text-xs leading-6 text-steel-400">{children}</div>
    </div>
  )
}
