'use client'

import { memo, useEffect, useState } from 'react'
import Link from 'next/link'
import type { PostSection } from '@/lib/sections'
import type { PostListItem } from '@/services/notion/types'

/**
 * 본문 HTML 을 한 번만 그려요.
 * 스크롤할 때마다 읽은 % 가 바뀌어 화면이 다시 그려지는데, 그때마다 본문을 통째로 새로 넣으면
 * 이미지가 사라졌다 다시 불러와지면서 글이 튀어요. 내용이 같으면 다시 그리지 않게 막아요.
 */
const HtmlBody = memo(function HtmlBody({ className, html }: { className: string; html: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
})

interface PostViewProps {
  slug: string
  title: string
  label?: string
  date?: string
  description?: string
  coverImageUrl?: string
  tags: string[]
  introHtml: string
  sections: PostSection[]
  readMinutes: number
  more: PostListItem[]
  children?: React.ReactNode
}


function formatDate(value?: string): string {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}.${m[2]}.${m[3]}` : ''
}

function Wavy({ text }: { text: string }) {
  return (
    <h2 className="pg-wavy" aria-label={text}>
      {Array.from(text).map((c, i) => (
        <span key={i} aria-hidden="true" style={{ animationDelay: `${(i * 0.07).toFixed(2)}s` }}>
          {c}
        </span>
      ))}
    </h2>
  )
}

export function PostView({
  slug,
  title,
  label,
  date,
  description,
  coverImageUrl,
  tags,
  introHtml,
  sections,
  readMinutes,
  more,
  children,
}: PostViewProps) {
  const [pct, setPct] = useState(0)
  const [closed, setClosed] = useState(false)
  const [zoom, setZoom] = useState<string | null>(null)
  const [active, setActive] = useState('')

  // 읽은 만큼 채우기 + 지금 읽는 섹션 표시
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement
      const max = el.scrollHeight - window.innerHeight
      setPct(max > 0 ? Math.round(Math.min(1, Math.max(0, window.scrollY / max)) * 100) : 0)
      let cur = ''
      for (const s of sections) {
        const node = document.getElementById(s.id)
        if (node && node.getBoundingClientRect().top < window.innerHeight * 0.4) cur = s.id
      }
      setActive(cur)
    }
    // 스크롤 한 번에 여러 번 불리지 않게 화면을 그릴 때 한 번만 계산해요
    let raf = 0
    const onScrollFrame = () => {
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0
        onScroll()
      })
    }
    onScroll()
    window.addEventListener('scroll', onScrollFrame, { passive: true })
    window.addEventListener('resize', onScrollFrame)
    return () => {
      window.removeEventListener('scroll', onScrollFrame)
      window.removeEventListener('resize', onScrollFrame)
      cancelAnimationFrame(raf)
    }
  }, [sections])

  // 본문 이미지를 누르면 크게 보기
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName !== 'IMG' || !t.closest('.pg-article')) return
      const img = t as HTMLImageElement
      if (img.width < 100 || t.closest('a')) return
      setZoom(img.getAttribute('data-zoom-src') || img.src)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoom(null)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const done = pct >= 98
  const filled = Math.round(pct / 5)
  const remain = Math.max(1, Math.ceil(((100 - pct) / 100) * readMinutes))
  const next = more[0]

  const toc = sections.map((s, i) => (
    <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'on' : undefined}>
      <span>({i + 1})</span>
      {s.title}
    </a>
  ))

  return (
    <>
      <section className="pg-wrap pg-post-head">
        <h1>{title}</h1>
        <div className="pg-meta">
          {label && (
            <span className="cat">
              <i />
              {label}
            </span>
          )}
          {date && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDate(date)}</span>}
        </div>
        {description && <p className="pg-lede">{description}</p>}
      </section>

      {coverImageUrl && (
        <section className="pg-wrap">
          <button type="button" className="pg-cover" aria-label="커버 이미지 크게 보기" onClick={() => setZoom(coverImageUrl)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverImageUrl} alt="" referrerPolicy="no-referrer" />
            <span className="pg-no">1</span>
            <span className="pg-lens">크게 보기 ↗</span>
          </button>
        </section>
      )}

      <section className="pg-wrap pg-main">
        {sections.length > 0 && (
          <aside className="pg-toc">
            <span className="pg-label">CONTENTS</span>
            <nav aria-label="목차">{toc}</nav>
          </aside>
        )}

        <article className="pg-article">
          {sections.length > 0 && (
            <details className="pg-toc-m">
              <summary>
                <span className="pg-label" style={{ color: 'var(--pg-muted)' }}>CONTENTS ({sections.length})</span>
                <span className="chev" aria-hidden="true">+</span>
              </summary>
              <nav aria-label="목차">{toc}</nav>
            </details>
          )}

          {introHtml && <HtmlBody className="pg-intro pg-body" html={introHtml} />}

          {sections.map((s, i) => (
            <div key={s.id} id={s.id} className="pg-sec">
              <span className="num">({i + 1})</span>
              <Wavy text={s.title} />
              <HtmlBody className="pg-body" html={s.html} />
            </div>
          ))}

          {tags.length > 0 && (
            <div className="pg-tags">
              {tags.map((t) => (
                <span key={t}><b>#</b>{t}</span>
              ))}
            </div>
          )}
        </article>
      </section>

      {(more.length > 0 || children) && (
        <section className="pg-wrap" style={{ paddingBottom: 96 }}>
          {more.length > 0 && (
            <>
              <h2 className="pg-label" style={{ margin: '0 0 20px', color: 'var(--pg-ink)' }}>KEEP READING</h2>
              <div className="pg-cards">
                {more.map((p) => (
                  <Link key={p.slug} href={`/posts/${p.slug}/`} className="pg-card">
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span className="t">{p.title}</span>
                      <span className="go" aria-hidden="true">→</span>
                    </span>
                    <span className="m">
                      {[p.label?.toUpperCase(), formatDate(p.date)].filter(Boolean).join(' · ')}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
          {children && <div style={{ marginTop: 48 }}>{children}</div>}
        </section>
      )}

      {zoom && (
        <button type="button" className="pg-zoom" aria-label="닫기" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" referrerPolicy="no-referrer" />
        </button>
      )}

      {closed && (
        <button type="button" className="pg-pill" aria-label="읽기 진행 창 다시 열기" onClick={() => setClosed(false)}>
          <svg width="14" height="17" viewBox="0 0 18 22" aria-hidden="true">
            <path d="M1 1 H12 L17 6 V21 H1 Z" fill="#ffffff" stroke="#111111" strokeWidth="1.2" />
            <path d="M12 1 V6 H17" fill="none" stroke="#111111" strokeWidth="1.2" />
          </svg>
          {pct}%
        </button>
      )}

      <div className={`pg-dlg${closed ? ' is-hidden' : ''}`} role="status" aria-live="polite">
        <div className="pg-dlg-bar">
          <button type="button" className="pg-light" aria-label="읽기 진행 창 닫기" onClick={() => setClosed(true)} />
          <span className="pg-light" />
          <span className="pg-light" />
          <span style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 500, color: 'var(--pg-muted)', marginRight: 42 }}>Reading…</span>
        </div>
        <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true" style={{ flex: 'none' }}>
              <path d="M1 1 H12 L17 6 V21 H1 Z" fill="#ffffff" stroke="#111111" strokeWidth="1" />
              <path d="M12 1 V6 H17" fill="none" stroke="#111111" strokeWidth="1" />
            </svg>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slug}.md</span>
            <span style={{ fontSize: 12, color: 'var(--pg-muted)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
          </div>
          <div className="pg-cells">
            {Array.from({ length: 20 }, (_, i) => (
              <span key={i} className={i < filled ? 'on' : undefined} />
            ))}
          </div>
          {done ? (
            next ? (
              <Link href={`/posts/${next.slug}/`} className="pg-ul" style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 600 }}>
                다 읽었어요. 다음 글 열기 →
              </Link>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 600 }}>다 읽었어요.</span>
            )
          ) : (
            <span className="rm" style={{ fontSize: 12, color: '#5C5C5C' }}>
              {pct === 0 ? '스크롤하면 읽은 만큼 채워져요' : `남은 시간 약 ${remain}분`}
            </span>
          )}
        </div>
      </div>
    </>
  )
}
