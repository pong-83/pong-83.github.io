'use client'

import { useEffect, useRef } from 'react'

const CLICKABLE = 'a, button, summary, label, [role="button"]'
const TEXT_FIELD = 'input, textarea, select, [contenteditable="true"]'

// 마우스를 따라다니는 유리 방울 커서. 누를 수 있는 곳에서는 부풀어요.
// 터치 기기와 움직임 줄이기 설정에서는 원래 커서를 그대로 써요.
export function GlassCursor() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!window.matchMedia('(pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const root = document.documentElement
    root.classList.add('pg-cursor-on')

    const move = (e: PointerEvent) => {
      el.style.translate = `${e.clientX}px ${e.clientY}px`
      const target = e.target instanceof Element ? e.target : null
      el.classList.toggle('is-big', !!target?.closest(CLICKABLE))
      el.classList.toggle('is-hidden', !!target?.closest(TEXT_FIELD))
      el.classList.add('is-in')
    }
    const leave = () => el.classList.remove('is-in')
    const down = () => el.classList.add('is-down')
    const up = () => el.classList.remove('is-down')

    window.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerleave', leave)
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    return () => {
      root.classList.remove('pg-cursor-on')
      window.removeEventListener('pointermove', move)
      document.removeEventListener('pointerleave', leave)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  return <div ref={ref} className="pg-glass" aria-hidden="true" />
}
