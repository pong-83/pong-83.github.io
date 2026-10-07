'use client'

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import { Star } from './Star'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''
const PULL_MS = 520
const PULL_MAX = 72 // 끌어내릴 수 있는 최대 거리(px)
const PULL_TRIGGER = 26 // 이만큼 당긴 뒤 놓으면 불이 바뀜
const NAP_MS = 3400 // 퐁이 나타났다 사라지는 시간

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> }
}

function isDark() {
  return document.documentElement.classList.contains('dark')
}

/** 헤더에 매달린 줄. 당기면 불이 꺼지고(다크 모드) 퐁이 올라와 잠들어요. 다시 당기면 퐁이 깨요 */
export function ThemeCord() {
  const { setTheme } = useTheme()
  const [pulling, setPulling] = useState(false)
  const [dark, setDark] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const drag = useRef({ active: false, startY: 0, pulled: 0, moved: false })
  const [nap, setNap] = useState<{ kind: 'sleep' | 'wake'; id: number } | null>(null)
  const napTimer = useRef(0)

  useEffect(() => () => window.clearTimeout(napTimer.current), [])

  useEffect(() => {
    // 부트 스크립트가 붙인 클래스를 따라가고, 기기 설정이 바뀔 때도 맞춰요
    const sync = () => setDark(isDark())
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])

  const switchTheme = () => {
    const next = isDark() ? 'light' : 'dark'
    const apply = () => {
      const root = document.documentElement
      root.classList.remove('light', 'dark')
      root.classList.add(next)
      setTheme(next)
    }
    const doc = document as ViewTransitionDoc
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduce) {
      window.clearTimeout(napTimer.current)
      setNap({ kind: next === 'dark' ? 'sleep' : 'wake', id: Date.now() })
      napTimer.current = window.setTimeout(() => setNap(null), NAP_MS)
    }
    if (!doc.startViewTransition || reduce) {
      apply()
      return
    }
    const r = btn.current?.getBoundingClientRect()
    const x = r ? r.left + r.width / 2 : window.innerWidth
    const y = r ? r.bottom : 0
    const end = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    const root = document.documentElement
    root.classList.add('pg-vt')
    try {
      const t = doc.startViewTransition(apply)
      t.ready
        .then(() => {
          root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
            { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' }
          ).finished.finally(() => root.classList.remove('pg-vt'))
        })
        .catch(() => root.classList.remove('pg-vt'))
    } catch {
      root.classList.remove('pg-vt')
      apply()
    }
  }

  // 누르기만 하면(탭, 키보드) 줄이 저절로 한 번 당겨졌다 올라가요
  const pull = () => {
    if (drag.current.moved) {
      drag.current.moved = false
      return
    }
    if (pulling) return
    setPulling(true)
    window.setTimeout(() => setPulling(false), PULL_MS)
    window.setTimeout(switchTheme, PULL_MS * 0.4)
  }

  // 잡고 아래로 끌면 줄이 따라 내려오고, 충분히 당긴 뒤 놓으면 불이 바뀌어요
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    drag.current = { active: true, startY: e.clientY, pulled: 0, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.style.transition = 'none'
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d.active) return
    const dy = Math.max(0, e.clientY - d.startY)
    if (dy > 4) d.moved = true
    // 당길수록 뻑뻑해지는 고무줄 느낌
    d.pulled = PULL_MAX * (1 - Math.exp(-dy / PULL_MAX))
    e.currentTarget.style.transform = `translateY(${d.pulled}px)`
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d.active) return
    d.active = false
    const node = e.currentTarget
    node.style.transition = ''
    node.style.transform = ''
    if (d.moved && d.pulled >= PULL_TRIGGER) switchTheme()
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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <Star size={20} className="pg-cord-star" />
      </button>
      {nap && (
        <div
          key={nap.id}
          className={`pg-nap is-${nap.kind}`}
          aria-hidden="true"
          style={{ '--awake': `url(${BASE}/images/mini-awake.png)`, '--asleep': `url(${BASE}/images/mini-asleep.png)` } as CSSProperties}
        >
          <span className="pg-nap-pong">
            <i className="a" />
            <i className="s" />
          </span>
          <span className="pg-zzz">
            <b>z</b>
            <b>z</b>
            <b>z</b>
          </span>
        </div>
      )}
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
