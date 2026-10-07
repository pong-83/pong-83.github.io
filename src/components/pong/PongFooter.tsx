'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Star } from './Star'
import { NightWindow } from './NightWindow'

const SPARKS = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324]

export function PongFooter({ name }: { name: string }) {
  const pathname = usePathname()
  const isHome = pathname === '/' || pathname === ''
  const year = new Date().getFullYear()
  const [pops, setPops] = useState(0)
  const [popping, setPopping] = useState(false)

  useEffect(() => {
    if (!popping) return
    const t = window.setTimeout(() => setPopping(false), 1300)
    return () => window.clearTimeout(t)
  }, [popping, pops])

  if (isHome) {
    return (
      <footer className="pg-wrap pg-foot">
        <div className="pg-foot-in">
          <button
            type="button"
            className={`pg-word${popping ? ' pop' : ''}`}
            key={pops}
            onClick={() => {
              setPops((n) => n + 1)
              setPopping(true)
            }}
          >
            {Array.from(name).map((ch, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.07}s` }}>{ch}</span>
            ))}
            <span className="pg-word-star" style={{ marginLeft: 8, paddingBottom: '0.12em' }}>
              <Star size={28} />
              {popping &&
                SPARKS.map((deg, i) => (
                  <i key={i} className="pg-spark-dot" style={{ '--a': `${deg}deg`, '--d': `${70 + (i % 3) * 22}px` } as React.CSSProperties} />
                ))}
            </span>
          </button>
          <NightWindow />
          <span style={{ display: 'flex', gap: 24 }}>
            <span>© {year}</span>
            <a href="#top" className="pg-ul">TOP ↑</a>
          </span>
        </div>
      </footer>
    )
  }

  return (
    <footer className="pg-wrap pg-foot">
      <div className="pg-foot-in" style={{ paddingTop: 20, alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {name}
          <Star size={10} /> © {year}
        </span>
        <NightWindow />
        <span style={{ display: 'flex', gap: 24 }}>
          <Link href="/" className="pg-ul">HOME</Link>
        </span>
      </div>
    </footer>
  )
}
