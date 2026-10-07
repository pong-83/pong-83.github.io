'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { PostListItem, SiteSettings } from '@/services/notion/types'
import { NOW_PHRASES, TITLE_SUFFIX } from '@/config/pong'
import { Star } from './Star'

const SOCIAL_LABELS: [keyof SiteSettings['socialLinks'], string][] = [
  ['instagram', 'Instagram'],
  ['github', 'GitHub'],
  ['twitter', 'X'],
  ['threads', 'Threads'],
  ['youtube', 'YouTube'],
  ['linkedin', 'LinkedIn'],
  ['blog', 'Blog'],
  ['notion', 'Notion'],
  ['facebook', 'Facebook'],
  ['tiktok', 'TikTok'],
  ['kakao', 'Kakao'],
  ['kakaoChannel', 'Kakao Channel'],
  ['telegram', 'Telegram'],
  ['line', 'LINE'],
]

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const TILT = [-4, 3, -2, 4, -3, 2]

/** 폴더 색: 0번은 All, 나머지는 라벨 순서대로 돌아가며 씀 */
const FOLDER_COLORS = [
  { front: '#DADAD6', back: '#B3B3AF' },
  { front: 'var(--pg-accent)', back: 'color-mix(in srgb, var(--pg-accent) 82%, #000000)' },
  { front: '#8A8A86', back: '#71716E' },
  { front: 'var(--pg-point)', back: 'color-mix(in srgb, var(--pg-point) 82%, #000000)' },
  { front: '#C4C4BF', back: '#A1A19D' },
  { front: '#2B2B2B', back: '#111111' },
]

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)

/** 노션 날짜의 앞 10자리(YYYY-MM-DD)만 써서 시간대에 따라 날짜가 바뀌지 않게 함 */
function parseDate(value?: string): Date | null {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

function formatDate(value?: string): string {
  const d = parseDate(value)
  return d ? `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}` : ''
}

/** 한 글자씩 썼다 지우는 타자 효과 */
function useTypewriter(phrases: string[]): string {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep((s) => s + 1), 90)
    return () => clearInterval(t)
  }, [])
  if (phrases.length === 0) return ''
  const cycles = phrases.map((p) => p.length * 2 + 26)
  const total = cycles.reduce((a, b) => a + b, 0)
  let s = step % total
  let i = 0
  while (s >= cycles[i]) {
    s -= cycles[i]
    i++
  }
  const L = phrases[i].length
  const shown = s < L ? s + 1 : s < L + 22 ? L : s < L * 2 + 22 ? L * 2 + 22 - s - 1 : 0
  return phrases[i].slice(0, Math.max(0, shown))
}

interface HomeViewProps {
  posts: PostListItem[]
  settings: SiteSettings
}

export function HomeView({ posts, settings }: HomeViewProps) {
  const name = settings.name || 'pong'
  const typed = useTypewriter(NOW_PHRASES)

  // 노션 Label 값으로 폴더를 만듦 (글이 많은 라벨이 앞)
  const folders = useMemo(() => {
    const counts = new Map<string, number>()
    posts.forEach((p) => {
      if (p.label) counts.set(p.label, (counts.get(p.label) || 0) + 1)
    })
    const labels = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l)
    return [
      { id: 'all', label: 'All', color: FOLDER_COLORS[0] },
      ...labels.map((l, i) => ({ id: l, label: l, color: FOLDER_COLORS[1 + (i % (FOLDER_COLORS.length - 1))] })),
    ]
  }, [posts])
  const colorOf = (label?: string) => folders.find((f) => f.id === label)?.color.front || '#DADAD6'

  const [filter, setFilter] = useState('all')
  const [hover, setHover] = useState(-1)
  const visible = posts.filter((p) => filter === 'all' || p.label === filter)
  const cur = (hover >= 0 && visible.includes(posts[hover]) ? posts[hover] : visible[0]) || null
  const curNo = cur ? visible.indexOf(cur) + 1 : 0
  const curTilt = cur ? TILT[posts.indexOf(cur) % TILT.length] : -2

  // 달력: 가장 최근 글이 있는 달에서 시작
  const latest = parseDate(posts[0]?.date) || new Date()
  const [monthOff, setMonthOff] = useState(0)
  const md = new Date(latest.getFullYear(), latest.getMonth() + monthOff, 1)
  const yy = md.getFullYear()
  const mm = md.getMonth()
  const first = md.getDay()
  const dim = new Date(yy, mm + 1, 0).getDate()
  const prevDim = new Date(yy, mm, 0).getDate()
  const monthPosts = posts
    .map((p) => ({ p, d: parseDate(p.date) }))
    .filter((x) => x.d && x.d.getFullYear() === yy && x.d.getMonth() === mm)
    .sort((a, b) => a.d!.getDate() - b.d!.getDate())
  const weeks: { num: number; out: boolean; posts: PostListItem[] }[][] = []
  for (let w = 0; w < Math.ceil((first + dim) / 7); w++) {
    const days = []
    for (let i = 0; i < 7; i++) {
      const n = w * 7 + i - first + 1
      const inMonth = n >= 1 && n <= dim
      days.push({
        num: inMonth ? n : n < 1 ? prevDim + n : n - dim,
        out: !inMonth,
        posts: inMonth ? monthPosts.filter((x) => x.d!.getDate() === n).map((x) => x.p) : [],
      })
    }
    weeks.push(days)
  }
  const evCls = (p: PostListItem) => `pg-ev${filter === 'all' || p.label === filter ? '' : ' dim'}`

  const [photoFailed, setPhotoFailed] = useState(false)
  const hasPhoto = Boolean(settings.profileImage) && !photoFailed

  const socials = SOCIAL_LABELS.filter(([k]) => k !== 'email' && settings.socialLinks?.[k])
  const email = settings.socialLinks?.email

  return (
    <>
      <section className="pg-wrap pg-hero">
        <div className="pg-hero-l">
          <div className="pg-photo-btn">
            <div className="pg-photo-frame">
              {hasPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.profileImage} alt="" referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)} />
              ) : (
                <>
                  <div className="pg-tint" aria-hidden="true" />
                  <div className="pg-dots" aria-hidden="true" />
                  <div
                    style={{ position: 'absolute', inset: 14, border: '1px dashed #B5B5B0', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <span style={{ fontFamily: 'var(--pg-serif)', fontStyle: 'italic', fontSize: 'min(168px, 40vw)', lineHeight: 0.8, letterSpacing: '-0.04em' }}>
                      {name.charAt(0)}
                      <span style={{ color: 'var(--pg-accent)' }}>.</span>
                    </span>
                  </div>
                  <span className="pg-chip" style={{ left: 24, top: 22 }}>No image yet</span>
                  <span className="pg-chip" style={{ left: 24, bottom: 24 }}>profile.jpg</span>
                  <span className="pg-chip" style={{ right: 24, bottom: 24 }}>0 KB</span>
                </>
              )}
              {hasPhoto && <div className="pg-dots" aria-hidden="true" />}
            </div>
            {hasPhoto && <span className="pg-no" style={{ borderTopRightRadius: 4 }}>1</span>}
            <span className="pg-hi" aria-hidden="true">Hi, I&apos;m {name}</span>
          </div>
          <div id="about" style={{ scrollMarginTop: 32, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
            <h1 className="pg-name">
              {name}
              {TITLE_SUFFIX && <> <em>{TITLE_SUFFIX}</em></>}
            </h1>
            {settings.jobTitle && (
              <span className="pg-rename">
                <span>{settings.jobTitle}</span>
                <span className="pg-caret" />
              </span>
            )}
          </div>
        </div>

        <div className="pg-info">
          {settings.bio && (
            <div>
              <span className="pg-label">ABOUT</span>
              <span style={{ maxWidth: 460, whiteSpace: 'pre-line' }}>{settings.bio}</span>
            </div>
          )}
          {email && (
            <div>
              <span className="pg-label">CONTACT</span>
              <span>
                <a href={email.startsWith('mailto:') ? email : `mailto:${email}`} className="pg-ul">
                  {email.replace(/^mailto:/, '')}
                </a>
              </span>
            </div>
          )}
          {socials.length > 0 && (
            <div>
              <span className="pg-label">ELSEWHERE</span>
              <span style={{ display: 'flex', gap: '4px 20px', flexWrap: 'wrap' }}>
                {socials.map(([k, label]) => (
                  <a key={k} href={settings.socialLinks[k]} target="_blank" rel="noopener noreferrer" className="pg-ul">
                    {label}
                  </a>
                ))}
              </span>
            </div>
          )}
          {NOW_PHRASES.length > 0 && (
            <div>
              <span className="pg-label">NOW</span>
              <span aria-live="off" style={{ minHeight: '1.6em' }}>
                <span className="pg-dot" />
                {typed}
                <span className="pg-caret" />
              </span>
            </div>
          )}
        </div>
      </section>

      <section id="posts" className="pg-wrap" style={{ scrollMarginTop: 0 }}>
        <div className="pg-folds" role="group" aria-label="카테고리 폴더">
          {folders.map((f) => {
            const on = filter === f.id
            return (
              <button
                key={f.id}
                type="button"
                className="pg-fold"
                aria-pressed={on}
                onClick={() => {
                  setFilter(f.id)
                  setHover(-1)
                }}
              >
                <span className="pg-fbox">
                  <span className="tab" style={{ background: f.color.back }} />
                  <span className="back" style={{ background: f.color.back }} />
                  <span className="sheet" />
                  <span className="front" style={{ background: f.color.front }} />
                  {on && (
                    <svg className="pg-cursor" viewBox="0 0 30 36" aria-hidden="true">
                      <path d="M6 6 L6 28 L11.5 22.5 L15 31 L18.5 29.5 L15 21 L22.5 21 Z" fill="#ffffff" stroke="#111111" strokeWidth="1.6" strokeLinejoin="round" />
                      <g className="pg-spark" stroke="#111111" strokeWidth="1.6" strokeLinecap="round">
                        <path d="M2 2 L0 0" />
                        <path d="M7 1 L7 -2" />
                        <path d="M1 7 L-2 7" />
                      </g>
                    </svg>
                  )}
                </span>
                {on ? (
                  <span className="pg-flab on">
                    <span>{f.label}</span>
                    <span className="pg-caret" />
                  </span>
                ) : (
                  <span className="pg-flab">{f.label}</span>
                )}
              </button>
            )
          })}
          <div className="pg-note" aria-hidden="true">
            <span>open a folder</span>
            <svg width="90" height="54" viewBox="0 0 90 54" fill="none" stroke="#111111" strokeWidth="1.4" strokeLinecap="round">
              <path d="M70 4 C 78 24, 58 40, 14 44" />
              <path d="M24 36 L 13 44 L 24 51" />
            </svg>
          </div>
        </div>

        <div className="pg-files">
          <div className="pg-list">
            <div className="pg-list-head">
              <span style={{ flex: '1 1 auto' }}>NAME</span>
              <span className="pg-kind" style={{ color: 'inherit' }}>KIND</span>
              <span className="pg-date" style={{ color: 'inherit' }}>DATE</span>
            </div>
            {visible.map((p) => {
              const i = posts.indexOf(p)
              return (
                <Link
                  key={p.slug}
                  href={`/posts/${p.slug}/`}
                  className={`pg-row${p === cur ? ' is-cur' : ''}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                >
                  <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true" style={{ flex: 'none' }}>
                      <path d="M1 1 H12 L17 6 V21 H1 Z" fill="#ffffff" stroke="#111111" strokeWidth="1" />
                      <path d="M12 1 V6 H17" fill="none" stroke="#111111" strokeWidth="1" />
                    </svg>
                    <span className="ttl">{p.title}</span>
                    <span className="arrow" aria-hidden="true">→</span>
                  </span>
                  <span className="pg-kind">
                    {p.label && (
                      <>
                        <i style={{ background: colorOf(p.label) }} />
                        {p.label.toUpperCase()}
                      </>
                    )}
                  </span>
                  <span className="pg-date">{formatDate(p.date)}</span>
                </Link>
              )
            })}
            {visible.length === 0 && (
              <div className="pg-empty">
                <svg className="pg-bob" width="64" height="52" viewBox="0 0 64 52" aria-hidden="true">
                  <path d="M2 8 a4 4 0 0 1 4 -4 h16 l6 6 h30 a4 4 0 0 1 4 4 v32 a4 4 0 0 1 -4 4 h-52 a4 4 0 0 1 -4 -4 z" fill="#ffffff" stroke="#111111" strokeWidth="1.4" strokeLinejoin="round" />
                  <path d="M24 30 q4 -4 8 0 q4 4 8 0" fill="none" stroke="#111111" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="25" cy="23" r="1.6" fill="#111111" />
                  <circle cx="39" cy="23" r="1.6" fill="#111111" />
                </svg>
                <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>
                  {filter === 'all' ? '아직 올린 글이 없어요' : `${filter} 폴더는 아직 비어 있어요`}
                </span>
                <span style={{ fontSize: 13, color: '#5C5C5C' }}>0 items · 0 KB</span>
                {filter !== 'all' && (
                  <button type="button" className="pg-btn" onClick={() => setFilter('all')}>
                    All 폴더 열기
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="pg-preview" aria-hidden="true">
            <div className="pg-paper" style={{ transform: `rotate(${curTilt}deg)` }}>
              <span className="corner" />
              <div
                className="cover"
                style={{ background: cur ? colorOf(cur.label) : '#E9E9E6', color: cur?.label && colorOf(cur.label) === '#2B2B2B' ? '#fff' : '#111' }}
              >
                {cur?.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cur.coverImageUrl} alt="" referrerPolicy="no-referrer" />
                ) : null}
                {cur && <span className="pg-no">{curNo}</span>}
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{cur ? cur.title : '새 글을 기다리는 중'}</span>
              <span style={{ fontSize: 12, color: 'var(--pg-muted)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>
                {cur?.description}
              </span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{cur ? `${cur.slug}.md` : 'untitled.md'}</span>
          </div>
        </div>
      </section>

      <section id="calendar" className="pg-wrap pg-cal">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <h2 className="pg-cal-h">
            {yy}
            <em>.{pad(mm + 1)}</em>
          </h2>
          <button type="button" className="pg-arrow" aria-label="이전 달" onClick={() => setMonthOff((m) => m - 1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button type="button" className="pg-arrow" aria-label="다음 달" onClick={() => setMonthOff((m) => m + 1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
        <div style={{ position: 'relative' }}>
          <div className="pg-cal-grid">
            <div style={{ minWidth: 760 }}>
              <div className="pg-week head">
                {DOW.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              {weeks.map((days, w) => (
                <div key={w} className="pg-week">
                  {days.map((d, i) => (
                    <div key={i} className="pg-day">
                      <span className={`n${d.out ? ' out' : ''}`}>{d.num}</span>
                      {d.posts.map((p) => (
                        <Link key={p.slug} href={`/posts/${p.slug}/`} className={evCls(p)}>
                          <Star size={10} fill={colorOf(p.label)} stroke />
                          {p.title}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="pg-cal-list">
            {monthPosts.map(({ p, d }) => (
              <div key={p.slug}>
                <span style={{ width: 44, flex: 'none', display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                  <span style={{ fontSize: 22, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{pad(d!.getDate())}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', color: 'var(--pg-faint)' }}>{DOW[d!.getDay()]}</span>
                </span>
                <Link href={`/posts/${p.slug}/`} className={evCls(p)} style={{ fontSize: 15, gap: 8 }}>
                  <Star size={10} fill={colorOf(p.label)} stroke />
                  {p.title}
                </Link>
              </div>
            ))}
          </div>
          {monthPosts.length === 0 && (
            <div className="pg-cal-empty">
              <Star size={28} className="pg-bob" />
              <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>{mm + 1}월은 쉬어 갔어요</span>
              <span style={{ fontSize: 13, color: '#5C5C5C' }}>이 달에 올린 글이 없어요.</span>
              {posts.length > 0 && (
                <button type="button" className="pg-btn" style={{ marginTop: 4 }} onClick={() => setMonthOff(0)}>
                  글 있는 달로 가기 →
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
