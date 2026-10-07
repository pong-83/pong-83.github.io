'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Star } from './Star'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

export function PongFooter({ name }: { name: string }) {
  const pathname = usePathname()
  const isHome = pathname === '/' || pathname === ''
  const year = new Date().getFullYear()

  if (isHome) {
    return (
      <footer className="pg-wrap pg-foot">
        <div className="pg-foot-in">
          <a href="#top" className="pg-word" aria-label="맨 위로">
            {Array.from(name).map((ch, i) => (
              <span key={i}>{ch}</span>
            ))}
            <span style={{ marginLeft: 8, paddingBottom: '0.12em' }}>
              <Star size={28} />
            </span>
          </a>
          <span style={{ display: 'flex', gap: 24 }}>
            <span>© {year}</span>
            <a href={`${BASE}/rss.xml`} className="pg-ul">RSS</a>
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
        <span style={{ display: 'flex', gap: 24 }}>
          <Link href="/" className="pg-ul">HOME</Link>
          <a href={`${BASE}/rss.xml`} className="pg-ul">RSS</a>
        </span>
      </div>
    </footer>
  )
}
