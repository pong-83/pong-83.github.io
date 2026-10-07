'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTheme } from '@/components/ThemeProvider'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''
const PULL_MS = 520

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> }
}

function isDark() {
  return document.documentElement.classList.contains('dark')
}

/** 헤더에 매달린 줄. 당기면 불이 꺼지고(다크 모드), 다시 당기면 켜져요 */
export function ThemeCord() {
  const { setTheme } = useTheme()
  const [pulling, setPulling] = useState(false)
  const [dark, setDark] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // 부트 스크립트가 붙인 클래스를 따라가고, 기기 설정이 바뀔 때도 맞춰요
    const sync = () => setDark(isDark())
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])

  const pull = () => {
    if (pulling) return
    setPulling(true)
    window.setTimeout(() => setPulling(false), PULL_MS)
    // 줄이 끝까지 내려갔을 때 불이 바뀌어요
    window.setTimeout(() => {
      const next = isDark() ? 'light' : 'dark'
      const apply = () => {
        const root = document.documentElement
        root.classList.remove('light', 'dark')
        root.classList.add(next)
        setTheme(next)
      }
      const doc = document as ViewTransitionDoc
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!doc.startViewTransition || reduce) {
        apply()
        return
      }
      const r = btn.current?.getBoundingClientRect()
      const x = r ? r.left + r.width / 2 : window.innerWidth
      const y = r ? r.bottom : 0
      const end = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
      document.documentElement.classList.add('pg-vt')
      try {
        const t = doc.startViewTransition(apply)
        t.ready
          .then(() => {
            document.documentElement.animate(
              { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
              { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' }
            ).finished.finally(() => document.documentElement.classList.remove('pg-vt'))
          })
          .catch(() => document.documentElement.classList.remove('pg-vt'))
      } catch {
        document.documentElement.classList.remove('pg-vt')
        apply()
      }
    }, PULL_MS * 0.4)
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`pg-cord${pulling ? ' is-pulling' : ''}`}
        aria-label={dark ? '줄을 당겨 불 켜기' : '줄을 당겨 불 끄기'}
        aria-pressed={dark}
        onClick={pull}
        style={{ '--awake': `url(${BASE}/images/mini-awake.png)`, '--asleep': `url(${BASE}/images/mini-asleep.png)` } as CSSProperties}
      >
        <i className="pg-cord-pong" />
        <span className="pg-zzz" aria-hidden="true">
          <b>z</b>
          <b>z</b>
          <b>z</b>
        </span>
      </button>
      {dark && <Torch />}
    </>
  )
}

/** 다크 모드에서 마우스 주변만 밝게 비추는 손전등. 마우스가 있는 기기에서만 켜져요 */
function Torch() {
  const el = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const node = el.current
    if (!node) return
    let raf = 0
    let x = 0
    let y = 0
    // 리액트 상태를 쓰지 않고 스타일만 바꿔서, 마우스를 움직여도 화면을 다시 그리지 않아요
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      x = e.clientX
      y = e.clientY
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0
        node.style.setProperty('--x', `${x}px`)
        node.style.setProperty('--y', `${y}px`)
        node.classList.add('on')
      })
    }
    const onLeave = () => node.classList.remove('on')
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(raf)
    }
  }, [])

  return <div ref={el} className="pg-torch" aria-hidden="true" />
}
