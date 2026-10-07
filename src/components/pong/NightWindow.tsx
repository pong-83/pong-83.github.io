'use client'

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useTheme } from '@/components/ThemeProvider'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''
const SET_MAX = 64 // 해나 달을 끌어내릴 수 있는 거리(px)
const SET_TRIGGER = 26 // 이만큼 내린 뒤 놓으면 해가 지고(또는 달이 지고) 테마가 바뀜
const SINK_MS = 380 // 놓은 뒤 창문 아래로 마저 내려가는 시간

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> }
}

function isDark() {
  return document.documentElement.classList.contains('dark')
}

/**
 * 푸터 창문과 퐁. 창문의 해를 아래로 끌어내리면 달이 뜨면서 다크 모드가 되고 퐁이 잠들어요.
 * 달을 내리면 다시 해가 뜨고 퐁이 깨요. 눌러도 돼요.
 */
export function NightWindow() {
  const { setTheme } = useTheme()
  const [dark, setDark] = useState(false)
  const [busy, setBusy] = useState(false)
  const [woke, setWoke] = useState(0)
  const orb = useRef<HTMLButtonElement>(null)
  const drag = useRef({ active: false, startY: 0, y: 0, moved: false })

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
      if (next === 'light') setWoke((n) => n + 1)
    }
    const doc = document as ViewTransitionDoc
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!doc.startViewTransition || reduce) {
      apply()
      return
    }
    // 창문에서부터 화면 전체로 동그랗게 퍼지며 바뀌어요
    const r = orb.current?.parentElement?.getBoundingClientRect()
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

  // 창문 아래로 마저 내려간 다음 테마를 바꾸고, 새 해나 달이 아래에서 떠올라요
  const setOrb = () => {
    const node = orb.current
    if (!node || busy) return
    setBusy(true)
    node.style.transition = `transform ${SINK_MS}ms cubic-bezier(.5,0,.8,.4)`
    node.style.transform = `translateY(${SET_MAX + 40}px)`
    window.setTimeout(() => {
      node.style.transition = 'none'
      switchTheme()
      // 새 해/달은 CSS 애니메이션으로 떠오르게 위치를 비워요
      node.style.transform = ''
      node.classList.remove('rise')
      void node.offsetWidth
      node.classList.add('rise')
      setBusy(false)
    }, SINK_MS)
  }

  const onClick = () => {
    if (drag.current.moved) {
      drag.current.moved = false
      return
    }
    setOrb()
  }
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || busy) return
    drag.current = { active: true, startY: e.clientY, y: 0, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.style.transition = 'none'
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d.active) return
    const dy = Math.max(0, e.clientY - d.startY)
    if (dy > 4) d.moved = true
    d.y = Math.min(SET_MAX, dy)
    e.currentTarget.style.transform = `translateY(${d.y}px)`
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d.active) return
    d.active = false
    if (d.moved && d.y >= SET_TRIGGER) {
      setOrb()
      return
    }
    // 덜 내렸으면 제자리로 돌아가요
    const node = e.currentTarget
    node.style.transition = 'transform .45s cubic-bezier(.3,1.6,.5,1)'
    node.style.transform = ''
  }

  return (
    <div
      className="pg-room"
      style={{ '--awake': `url(${BASE}/images/mini-awake.png)`, '--asleep': `url(${BASE}/images/mini-asleep.png)` } as CSSProperties}
    >
      <div className="pg-window">
        <span className="pg-sky" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <button
          ref={orb}
          type="button"
          className="pg-orb"
          aria-label={dark ? '달을 내려서 불 켜기' : '해를 내려서 불 끄기'}
          aria-pressed={dark}
          onClick={onClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
      <span key={woke} className={`pg-room-pong${woke ? ' hop' : ''}`} aria-hidden="true" />
      <span className="pg-zzz" aria-hidden="true">
        <b>z</b>
        <b>z</b>
        <b>z</b>
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
