'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ABOUT_EVENT, PALETTES, PALETTE_STORAGE_KEY as STORAGE_KEY, type PaletteId } from '@/config/pong'
import { Star } from './Star'

const TAPS_FOR_EGG = 5 // 별 로고를 2초 안에 5번 연타하면 이스터에그
const TAP_WINDOW_MS = 2000
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''
const CONFETTI = Array.from({ length: 18 }, (_, i) => i)

function readPalette(): number {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    const i = PALETTES.findIndex((p) => p.id === saved)
    return i < 0 ? 0 : i
  } catch {
    return 0
  }
}

interface SiteHeaderProps {
  name: string
  slugs: string[]
}

export function SiteHeader({ name, slugs }: SiteHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const isHome = pathname === '/' || pathname === ''
  const [spins, setSpins] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)
  const [egg, setEgg] = useState(false)
  const taps = useRef<number[]>([])

  useEffect(() => {
    setSpins(readPalette())
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      if (y > 160 && y > lastY.current + 4) setHidden(true)
      else if (y < lastY.current - 4 || y <= 160) setHidden(false)
      setScrolled(y > 8)
      lastY.current = y
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const nextPalette = () => {
    const next = spins + 1
    const id: PaletteId = PALETTES[next % PALETTES.length].id
    document.documentElement.dataset.palette = id
    try {
      window.localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // 저장이 막힌 브라우저에서는 이번 방문 동안만 유지
    }
    setSpins(next)
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < TAP_WINDOW_MS), now]
    if (taps.current.length >= TAPS_FOR_EGG && !egg) {
      taps.current = []
      setEgg(true)
      window.setTimeout(() => setEgg(false), 3600)
    }
  }

  const openRandom = () => {
    if (slugs.length === 0) return
    const slug = slugs[Math.floor(Math.random() * slugs.length)]
    router.push(`/posts/${slug}/`)
  }

  const label = `You are viewing ${name}'s page.`

  return (
    <>
    <header className={`pg-wrap pg-hdr${scrolled ? ' is-scrolled' : ''}${hidden ? ' is-hidden' : ''}`}>
      <nav className="pg-nav" aria-label="메인 메뉴">
        <button type="button" className="pg-logo" aria-label="별을 눌러 컬러 바꾸기" onClick={nextPalette}>
          <Star size={20} style={{ transform: `rotate(${spins * 60}deg)` }} />
        </button>
        <Link href="/#posts" className="pg-ul">POSTS</Link>
        <Link href="/#calendar" className="pg-ul">CALENDAR</Link>
        <Link
          href="/#about"
          className="pg-ul"
          onClick={(e) => {
            if (!isHome) return
            e.preventDefault()
            window.history.pushState(null, '', '#about')
            window.dispatchEvent(new Event(ABOUT_EVENT))
          }}
        >
          ABOUT
        </Link>
      </nav>
      {isHome ? (
        <button type="button" className="pg-view" onClick={openRandom}>
          <span className="va">{label}</span>
          <span className="vb">Feeling lucky? Open a random post.</span>
          <span className="vm">{name}&apos;s page</span>
        </button>
      ) : (
        <Link href="/" className="pg-view">
          <span className="va">{label}</span>
          <span className="vb">Would you like to return to the home page?</span>
          <span className="vm">{name}&apos;s page</span>
        </Link>
      )}
    </header>
      {egg && (
        <div className="pg-egg" aria-live="polite">
          {CONFETTI.map((i) => (
            <Star key={i} size={10 + (i % 4) * 4} className="pg-egg-star" fill="#111111" style={{ '--x': `${(i * 53) % 100}vw`, '--delay': `${(i % 6) * 0.12}s` } as CSSProperties} />
          ))}
          <span className="pg-egg-run" style={{ '--sprite': `url(${BASE}/images/pong-run.png)` } as CSSProperties} />
          <p className="pg-egg-msg">별 다섯 개 적립! 오늘은 좋은 일이 생길 거예요 ✶</p>
        </div>
      )}
    </>
  )
}

