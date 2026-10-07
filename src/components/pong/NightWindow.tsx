'use client'

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useTheme } from '@/components/ThemeProvider'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// 창문 안에서 해와 달이 지나가는 호: 창틀 아래 가운데를 중심으로 한 반원
const ARC_CX = 60
const ARC_CY = 104
const ARC_R = 72
const NOON = 0.5 // 호의 꼭대기 (0은 왼쪽 끝, 1은 오른쪽 끝)
const SET_AT = 0.72 // 여기보다 더 끌고 놓으면 해(달)가 져요
const DRAG_SPAN = 130 // 이만큼 옆으로 끌면 호의 끝까지 가요(px)
const BUBBLE_MS = 2200

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> }
}

function isDark() {
  return document.documentElement.classList.contains('dark')
}

function arc(p: number) {
  const t = Math.PI * (1 - p)
  return [ARC_CX + ARC_R * Math.cos(t), ARC_CY - ARC_R * Math.sin(t)]
}

const easeIn = (t: number) => t * t
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t)

/**
 * 푸터 창문과 퐁. 창문의 해를 옆으로 끌어서 지게 하면 달이 뜨면서 다크 모드가 되고 퐁이 잠들어요.
 * 달을 지게 하면 다시 해가 뜨고 퐁이 깨요. 창문이나 퐁을 눌러도 돼요.
 */
export function NightWindow() {
  const { setTheme } = useTheme()
  const [dark, setDark] = useState(false)
  const [bubble, setBubble] = useState<{ text: string; id: number } | null>(null)
  const win = useRef<HTMLDivElement>(null)
  const orb = useRef<HTMLButtonElement>(null)
  const pong = useRef<HTMLSpanElement>(null)
  const pos = useRef(NOON)
  const busy = useRef(false)
  const raf = useRef(0)
  const bubbleTimer = useRef(0)
  const drag = useRef({ active: false, startX: 0, startP: NOON, moved: false })

  useEffect(() => {
    // 부트 스크립트가 붙인 클래스를 따라가고, 기기 설정이 바뀔 때도 맞춰요
    const sync = () => setDark(isDark())
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      mo.disconnect()
      cancelAnimationFrame(raf.current)
      window.clearTimeout(bubbleTimer.current)
    }
  }, [])

  // 리액트 상태 대신 스타일만 바꿔서, 끄는 동안 화면을 다시 그리지 않아요
  const place = (p: number) => {
    pos.current = p
    const [x, y] = arc(p)
    orb.current?.style.setProperty('--ox', `${x}px`)
    orb.current?.style.setProperty('--oy', `${y}px`)
    // 해가 기울수록 퐁도 꾸벅꾸벅 기울어요 (밤엔 달이 기울면 뒤척여요)
    const lean = Math.min(1, Math.max(0, p - NOON) / (1 - NOON))
    if (pong.current) pong.current.style.transform = lean ? `rotate(${(isDark() ? 6 : -9) * lean}deg) translateY(${lean * 3}px)` : ''
  }

  const run = (from: number, to: number, ms: number, ease: (t: number) => number, done?: () => void) => {
    cancelAnimationFrame(raf.current)
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      place(from + (to - from) * ease(t))
      if (t < 1) raf.current = requestAnimationFrame(step)
      else done?.()
    }
    raf.current = requestAnimationFrame(step)
  }

  const say = (text: string) => {
    window.clearTimeout(bubbleTimer.current)
    setBubble({ text, id: Date.now() })
    bubbleTimer.current = window.setTimeout(() => setBubble(null), BUBBLE_MS)
  }

  const replay = (cls: 'hop' | 'stir') => {
    const node = pong.current
    if (!node) return
    node.style.transform = ''
    node.classList.remove('hop', 'stir')
    void node.offsetWidth
    node.classList.add(cls)
  }

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
    if (!doc.startViewTransition || reduce) {
      apply()
      return
    }
    // 창문에서부터 화면 전체로 동그랗게 퍼지며 바뀌어요
    const r = win.current?.getBoundingClientRect()
    const x = r ? r.left + r.width / 2 : window.innerWidth / 2
    const y = r ? r.top + r.height / 2 : window.innerHeight
    const end = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    const root = document.documentElement
    root.classList.add('pg-vt')
    try {
      const t = doc.startViewTransition(apply)
      t.ready
        .then(() => {
          root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
            { duration: 700, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' }
          ).finished.finally(() => root.classList.remove('pg-vt'))
        })
        .catch(() => root.classList.remove('pg-vt'))
    } catch {
      root.classList.remove('pg-vt')
      apply()
    }
  }

  // 해(달)가 오른쪽으로 넘어가 지고, 테마가 바뀐 뒤 새 달(해)이 왼쪽에서 떠올라요
  const setOrb = () => {
    if (busy.current) return
    busy.current = true
    const from = pos.current
    run(from, 1.15, 260 + (1.15 - from) * 400, easeIn, () => {
      const willSleep = !isDark()
      switchTheme()
      if (willSleep) say('zzZ')
      else {
        say('!')
        replay('hop')
      }
      run(-0.15, NOON, 950, easeOut, () => {
        busy.current = false
      })
    })
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || busy.current) return
    cancelAnimationFrame(raf.current)
    drag.current = { active: true, startX: e.clientX, startP: pos.current, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.classList.add('is-dragging')
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d.active) return
    const dx = e.clientX - d.startX
    if (Math.abs(dx) > 4) d.moved = true
    // 오른쪽으로만 지고, 왼쪽으로는 살짝만 밀려요
    place(Math.min(0.97, Math.max(NOON - 0.08, d.startP + dx / DRAG_SPAN)))
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d.active) return
    d.active = false
    e.currentTarget.classList.remove('is-dragging')
    if (!d.moved || pos.current >= SET_AT) {
      setOrb()
      return
    }
    // 덜 끌었으면 제자리로 돌아가요
    run(pos.current, NOON, 420, easeOut)
  }

  const onPong = () => {
    if (isDark()) {
      replay('stir')
      say('5분만…')
    } else {
      replay('hop')
      say('hi!')
    }
  }

  return (
    <div
      className="pg-room"
      style={{ '--awake': `url(${BASE}/images/mini-awake.png)`, '--asleep': `url(${BASE}/images/mini-asleep.png)` } as CSSProperties}
    >
      <div
        ref={win}
        className="pg-window"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="pg-sky" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <button
          ref={orb}
          type="button"
          className="pg-orb"
          aria-label={dark ? '달을 지게 해서 불 켜기' : '해를 지게 해서 불 끄기'}
          aria-pressed={dark}
          // 마우스와 손가락은 창문이 처리하고, 키보드(Enter, Space)만 여기서 받아요
          onClick={(e) => {
            if (e.detail === 0) setOrb()
          }}
        />
      </div>
      <span ref={pong} className="pg-room-pong" aria-hidden="true" onClick={onPong} />
      {bubble && (
        <span key={bubble.id} className="pg-bubble" aria-hidden="true">
          {bubble.text}
        </span>
      )}
      <span className="pg-zzz" aria-hidden="true">
        <b>z</b>
        <b>z</b>
        <b>Z</b>
      </span>
      {dark && <Torch />}
    </div>
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
