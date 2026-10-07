'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTheme } from '@/components/ThemeProvider'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// 창문 안에서 해와 달이 지나가는 호: 창틀 아래 가운데를 중심으로 한 반원
const ARC_CX = 33
const ARC_CY = 58
const ARC_R = 36
const NOON = 0.5 // 호의 꼭대기 (0은 왼쪽 끝, 1은 오른쪽 끝)
const BUBBLE_MS = 1800

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> }
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
 * 푸터의 창문과 퐁. 누르면 퐁이 하품하고 해가 옆으로 져요. 달이 뜨면서 다크 모드가 되고 퐁은 잠들어요.
 * 다시 누르면 달이 지고 해가 떠오르면서 퐁이 깜짝 놀라 깨요.
 */
export function NightWindow() {
  const { setTheme } = useTheme()
  const [dark, setDark] = useState(false)
  const [bubble, setBubble] = useState<{ text: string; id: number } | null>(null)
  const win = useRef<HTMLSpanElement>(null)
  const orb = useRef<HTMLSpanElement>(null)
  const pong = useRef<HTMLSpanElement>(null)
  const busy = useRef(false)
  const raf = useRef(0)
  const timers = useRef<number[]>([])

  useEffect(() => {
    // 부트 스크립트가 붙인 클래스를 따라가고, 기기 설정이 바뀔 때도 맞춰요
    const sync = () => setDark(isDark())
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    const pending = timers.current
    return () => {
      mo.disconnect()
      cancelAnimationFrame(raf.current)
      pending.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  // 리액트 상태 대신 스타일만 바꿔서, 움직이는 동안 화면을 다시 그리지 않아요
  const place = (p: number) => {
    const [x, y] = arc(p)
    orb.current?.style.setProperty('--ox', `${x}px`)
    orb.current?.style.setProperty('--oy', `${y}px`)
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

  const say = (text: string, ms = BUBBLE_MS) => {
    const id = Date.now()
    setBubble({ text, id })
    later(() => setBubble((b) => (b?.id === id ? null : b)), ms)
  }

  const act = (cls: 'yawn' | 'startle' | 'stir' | 'hop') => {
    const node = pong.current
    if (!node) return
    node.classList.remove('yawn', 'startle', 'stir', 'hop')
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
      let reveal: Animation | undefined
      t.ready
        .then(() => {
          reveal = root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
            { duration: 700, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards', pseudoElement: '::view-transition-new(root)' }
          )
        })
        .catch(() => {})
      // 전환이 완전히 끝난 뒤에 클래스를 떼요. 원이 다 퍼진 순간 떼면 브라우저 기본 페이드가 잠깐 돌아서 화면이 회색으로 깜빡여요
      t.finished.finally(() => {
        root.classList.remove('pg-vt')
        reveal?.cancel()
      })
    } catch {
      root.classList.remove('pg-vt')
      apply()
    }
  }

  // 누르면: (낮) 하품 → 해가 옆으로 짐 → 불이 꺼지고 달이 떠오름 → 쿨쿨
  //        (밤) 뒤척임 → 달이 짐 → 불이 켜지고 해가 떠오름 → 깜짝 놀라 깸
  const toggle = () => {
    if (busy.current) return
    busy.current = true
    const toNight = !isDark()
    act(toNight ? 'yawn' : 'stir')
    say(toNight ? '하암…' : '음…?', 900)
    later(() => {
      run(NOON, 1.18, 620, easeIn, () => {
        switchTheme()
        run(-0.18, NOON, 900, easeOut, () => {
          busy.current = false
        })
        later(() => {
          if (toNight) say('zzZ')
          else {
            act('startle')
            say('앗, 아침!')
          }
        }, 380)
      })
    }, 420)
  }

  return (
    <button
      type="button"
      className="pg-room"
      onClick={toggle}
      aria-label={dark ? '눌러서 불 켜기 (퐁 깨우기)' : '눌러서 불 끄기 (퐁 재우기)'}
      aria-pressed={dark}
      style={{ '--awake': `url(${BASE}/images/mini-awake.png)`, '--asleep': `url(${BASE}/images/mini-asleep.png)` } as CSSProperties}
    >
      <span ref={win} className="pg-window" aria-hidden="true">
        <span className="pg-sky">
          <i />
          <i />
          <i />
        </span>
        <span ref={orb} className="pg-orb" />
      </span>
      <span ref={pong} className="pg-room-pong" aria-hidden="true" />
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
    </button>
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
