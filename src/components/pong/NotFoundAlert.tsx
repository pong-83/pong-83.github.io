'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NotFoundAlert({ slugs }: { slugs: string[] }) {
  const pathname = usePathname()
  const [shake, setShake] = useState(false)
  const [tried, setTried] = useState(false)
  const [random, setRandom] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (slugs.length > 0) setRandom(slugs[Math.floor(Math.random() * slugs.length)])
    return () => clearTimeout(timer.current)
  }, [slugs])

  // 빨간 닫기 버튼: 닫을 곳이 없으니 창이 흔들림
  const onClose = () => {
    setTried(true)
    setShake(false)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setShake(true), 20)
  }

  const path = pathname && pathname !== '/' ? pathname.replace(/\/$/, '') : '/????.md'

  return (
    <main className="pg-wrap pg-nf">
      <span className="big" aria-hidden="true">404</span>
      <div className={`pg-alert${shake ? ' shake' : ''}`} role="alertdialog" aria-labelledby="nf-title">
        <div className="pg-dlg-bar" style={{ padding: '10px 12px' }}>
          <button type="button" className="pg-light" aria-label="닫기" onClick={onClose} />
          <span className="pg-light" />
          <span className="pg-light" />
          <span style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 12, fontWeight: 500, color: 'var(--pg-muted)', marginRight: 42, fontFamily: 'var(--pg-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {path}
          </span>
        </div>
        <div style={{ padding: '28px 28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
          <span style={{ position: 'relative', display: 'inline-block', width: 44, height: 54, marginBottom: 6 }}>
            <svg width="44" height="54" viewBox="0 0 18 22" aria-hidden="true">
              <path d="M1 1 H12 L17 6 V21 H1 Z" fill="#ffffff" stroke="#111111" strokeWidth=".7" />
              <path d="M12 1 V6 H17" fill="none" stroke="#111111" strokeWidth=".7" />
            </svg>
            <span className="pg-q" aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 16, fontFamily: 'var(--pg-serif)', fontStyle: 'italic', fontSize: 26, lineHeight: 1, color: 'var(--pg-accent)' }}>?</span>
          </span>
          <h1 id="nf-title" style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.4 }}>이 파일을 찾을 수 없어요</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--pg-sub)', lineHeight: 1.6 }}>주소가 바뀌었거나, 글이 숨김 상태로 바뀌었을 수 있어요.</p>
          {tried && (
            <span style={{ fontSize: 12, color: 'var(--pg-muted)', background: 'var(--pg-point)', padding: '2px 8px', borderRadius: 4 }}>닫을 곳이 없어요. 아래에서 골라 주세요.</span>
          )}
          <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 12 }}>
            {random && (
              <Link href={`/posts/${random}/`} className="pg-btn" style={{ flex: 1, minHeight: 44, borderColor: 'var(--pg-line2)', borderRadius: 8 }}>
                아무 글이나 열기
              </Link>
            )}
            <Link href="/" className="pg-btn" style={{ flex: 1, minHeight: 44, border: 0, borderRadius: 8, background: 'var(--pg-accent)', color: 'var(--pg-on-accent)' }}>
              홈으로 가기
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
