'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { PostListItem, SiteSettings } from '@/services/notion/types'
import { ABOUT_EVENT, NOW_PHRASES, TITLE_SUFFIX } from '@/config/pong'
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

/** 사진 없는 글의 미리보기: 퐁 원본 그림 배경색과 같은 색을 깔아서 이어져 보이게 해요 */
const PONG_COVERS = ['/images/pong-wave.png', '/images/pong-stand.png']
const PONG_COVER_BG = '#E8E6E5'

const FIND_IDLE_MS = 2000 // 이만큼 안 치면 'go to' 쪽지가 사라져요

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

/** 검색어를 띄어쓰기로 나눠서, 모든 낱말이 제목·설명·태그·폴더 어딘가에 있으면 찾은 글로 쳐요 */
function searchWords(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean)
}

function matches(p: PostListItem, words: string[]): boolean {
  if (words.length === 0) return true
  const hay = [p.title, p.description, p.label, ...(p.tags || [])].filter(Boolean).join(' ').toLowerCase()
  return words.every((w) => hay.includes(w))
}

/** 제목에서 찾은 낱말에 형광펜을 칠해요 */
function highlight(text: string, words: string[]): ReactNode {
  if (words.length === 0) return text
  const lower = text.toLowerCase()
  const marks = new Array(text.length).fill(false)
  words.forEach((w) => {
    for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + 1)) marks.fill(true, i, i + w.length)
  })
  const out: ReactNode[] = []
  let i = 0
  while (i < text.length) {
    let j = i
    while (j < text.length && marks[j] === marks[i]) j++
    out.push(marks[i] ? <mark key={i}>{text.slice(i, j)}</mark> : text.slice(i, j))
    i = j
  }
  return out
}

interface HomeViewProps {
  posts: PostListItem[]
  settings: SiteSettings
}

// 사진에 마우스를 올릴 때마다 차례로 바뀌는 스티커 문구 ({name}은 이름으로 바뀜)
const STICKERS = [
  'Hi, I’m {name}',
  'Hi, I’m {name}',
  'Hi, I’m {name}',
  'Hi!',
  'hello!',
  'HELLO\nmy name is {name}',
  '{name} was here',
  '★ +1 HP',
]
const STICKER_COUNT = STICKERS.length
const STICKER_FADE_MS = 350 // .pg-hi 가 사라지는 시간(.3s)보다 조금 길게
// 이메일을 누를 때마다 돌아가며 뜨는 말
const COPIED_LINES = ['주머니에 쏙 넣었어요 ✉', '붙여넣기만 하면 돼요 ⌘V', '편지 기다릴게요 ☺']

export function HomeView({ posts, settings }: HomeViewProps) {
  const name = settings.name || 'pong'
  // 홈 큰 제목: 노션 HomeTitle이 있으면 그걸 쓰고 마지막 낱말을 기울여요 (pong page → pong *page*)
  const heading = (() => {
    const t = settings.homeTitle?.trim()
    if (!t) return [name, TITLE_SUFFIX]
    const i = t.lastIndexOf(' ')
    return i > 0 ? [t.slice(0, i), t.slice(i + 1)] : [t, '']
  })()
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
  // 그냥 타이핑해서 찾기 (Finder처럼). 글을 숨기지 않고 맞는 글로 커서만 옮겨요
  const [query, setQuery] = useState('')
  const [armed, setArmed] = useState(false)
  const findRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<HTMLDivElement>(null)
  const idleTimer = useRef(0)
  const composing = useRef(false)
  const byTap = useRef(false)
  const router = useRouter()
  const words = searchWords(query)
  const finding = words.length > 0
  const visible = posts.filter((p) => filter === 'all' || p.label === filter)
  const firstHit = finding ? visible.find((p) => matches(p, words)) : undefined

  const clearFind = () => {
    window.clearTimeout(idleTimer.current)
    setQuery('')
    byTap.current = false
  }
  const restartIdle = () => {
    window.clearTimeout(idleTimer.current)
    if (byTap.current) return
    idleTimer.current = window.setTimeout(() => {
      if (composing.current) return restartIdle()
      clearFind()
    }, FIND_IDLE_MS)
  }
  useEffect(() => () => window.clearTimeout(idleTimer.current), [])
  // 한글은 첫 자모부터 입력칸 안에서 조합돼야 순서가 안 꼬여요. 그래서 키를 누르기 전에(목록에 마우스가 올라오면) 미리 포커스해 둬요
  const focusFind = () => {
    const active = document.activeElement as HTMLElement | null
    if (active && active !== document.body && active !== findRef.current && !filesRef.current?.contains(active)) return
    findRef.current?.focus({ preventScroll: true })
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t === findRef.current) return
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') {
        e.preventDefault()
        byTap.current = true
        setArmed(true)
        findRef.current?.focus({ preventScroll: true })
        return
      }
      // 포커스가 잠깐 다른 데 가 있어도 목록 위에서는 받아요
      if (armed && e.key !== ' ' && (e.key.length === 1 || e.key === 'Process')) findRef.current?.focus({ preventScroll: true })
    }
    const onDown = (e: PointerEvent) => {
      if (filesRef.current?.contains(e.target as Node)) return
      if (query) clearFind()
      if (e.pointerType !== 'mouse') setArmed(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  })
  const onFindKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape') {
      clearFind()
      e.currentTarget.blur()
    } else if (e.key === 'Enter' && firstHit) {
      e.preventDefault()
      router.push(`/posts/${firstHit.slug}/`)
    } else if (!query && (e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp')) {
      // 검색어가 없을 때는 원래처럼 페이지가 스크롤돼요
      e.preventDefault()
      const page = window.innerHeight * 0.85
      const dy = { ' ': e.shiftKey ? -page : page, ArrowDown: 40, ArrowUp: -40, PageDown: page, PageUp: -page }[e.key] ?? 0
      window.scrollBy({ top: dy })
    }
  }
  const cur = firstHit ?? ((hover >= 0 && visible.includes(posts[hover]) ? posts[hover] : visible[0]) || null)
  const curNo = cur ? visible.indexOf(cur) + 1 : 0
  const curTilt = cur ? TILT[posts.indexOf(cur) % TILT.length] : -2

  // 달력: 가장 최근 글이 있는 달에서 시작
  const latest = parseDate(posts[0]?.date) || new Date()
  const [monthOff, setMonthOff] = useState(0)
  const md = new Date(latest.getFullYear(), latest.getMonth() + monthOff, 1)
  const yy = md.getFullYear()
  const mm = md.getMonth()
  // 달 고르기: 제목(2026.10)을 누르면 열두 달이 펼쳐지고, 글이 있는 달에는 글 수가 붙어요
  const [picking, setPicking] = useState(false)
  const [pickYear, setPickYear] = useState(yy)
  const pickRef = useRef<HTMLDivElement>(null)
  const monthCount = useMemo(() => {
    const c = new Map<string, number>()
    posts.forEach((p) => {
      const d = parseDate(p.date)
      if (d) c.set(`${d.getFullYear()}-${d.getMonth()}`, (c.get(`${d.getFullYear()}-${d.getMonth()}`) || 0) + 1)
    })
    return c
  }, [posts])
  const goMonth = (y: number, m: number) => {
    setMonthOff((y - latest.getFullYear()) * 12 + (m - latest.getMonth()))
    setPicking(false)
  }
  useEffect(() => {
    if (!picking) return
    const onDown = (e: PointerEvent) => {
      if (!pickRef.current?.contains(e.target as Node)) setPicking(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [picking])
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
  // 사진에 마우스를 올릴 때마다 스티커 모양이 바뀜
  const [sticker, setSticker] = useState(0)
  const [tapped, setTapped] = useState(false)
  const nextSticker = () => setSticker((n) => (n + 1) % STICKER_COUNT)
  const stickerTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(stickerTimer.current), [])
  const hasPhoto = Boolean(settings.profileImage) && !photoFailed

  // ABOUT: 넓은 화면(사진과 정보가 나란히)에서는 프로필 맨 위, 좁은 화면에서는 이름에 맞춰요
  useEffect(() => {
    const goAbout = () => {
      if (window.location.hash !== '#about') return
      const left = document.querySelector<HTMLElement>('.pg-hero-l')
      const info = document.querySelector<HTMLElement>('.pg-info')
      const sideBySide = left && info && Math.abs(left.offsetTop - info.offsetTop) < 40
      const target = sideBySide ? document.querySelector<HTMLElement>('.pg-hero') : document.getElementById('about')
      target?.scrollIntoView({ block: 'start' })
    }
    const raf = window.requestAnimationFrame(goAbout)
    window.addEventListener('hashchange', goAbout)
    window.addEventListener(ABOUT_EVENT, goAbout)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('hashchange', goAbout)
      window.removeEventListener(ABOUT_EVENT, goAbout)
    }
  }, [])

  const socials = SOCIAL_LABELS.filter(([k]) => k !== 'email' && settings.socialLinks?.[k])
  const email = settings.socialLinks?.email
  const emailText = email?.replace(/^mailto:/, '') ?? ''
  const [copied, setCopied] = useState(false)
  const [copyCount, setCopyCount] = useState(0)
  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(emailText)
    } catch {
      window.location.href = `mailto:${emailText}`
      return
    }
    setCopyCount((n) => n + 1)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <>
      <section className="pg-wrap pg-hero">
        <div className="pg-hero-l">
          <div
            className={`pg-photo-btn${tapped ? ' on' : ''}`}
            // 마우스를 뗀 뒤 스티커가 다 사라지고 나서 다음 스티커로 바꿔 둬요.
            // 올리는 순간에 바꾸면 이전 스티커가 한 프레임 비쳤다가 바뀌어 보여요
            onPointerLeave={(e) => {
              if (e.pointerType !== 'mouse') return
              window.clearTimeout(stickerTimer.current)
              stickerTimer.current = window.setTimeout(() => {
                stickerTimer.current = 0
                nextSticker()
              }, STICKER_FADE_MS)
            }}
            // 다 사라지기 전에 다시 올리면 기다리던 교체를 바로 해요. 그냥 취소하면 같은 스티커가 또 떠요
            onPointerEnter={(e) => {
              if (e.pointerType !== 'mouse' || !stickerTimer.current) return
              window.clearTimeout(stickerTimer.current)
              stickerTimer.current = 0
              nextSticker()
            }}
            onPointerDown={(e) => {
              if (e.pointerType === 'mouse') return
              setTapped(true)
              nextSticker()
            }}
          >
            <div className={`pg-photo-frame${hasPhoto ? ' has-photo' : ''}`}>
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
            </div>
            <span className={`pg-hi s${sticker}`} aria-hidden="true">
              {STICKERS[sticker]
                .replace('{name}', name)
                .split('\n')
                .map((line, i) => (i === 0 ? <b key={i}>{line}</b> : <span key={i}>{line}</span>))}
            </span>
          </div>
          <div id="about" style={{ scrollMarginTop: 32, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
            <h1 className="pg-name">
              {heading[0]}
              {heading[1] && <> <em>{heading[1]}</em></>}
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
              <span style={{ maxWidth: 460 }}>
                <span style={{ whiteSpace: 'pre-line' }}>{settings.bio}</span>{' '}
                <Link href="/about" className="pg-more">
                  <span className="t">
                    <span className="a">펼쳐 보기</span>
                    <span className="b">접힌 페이지가 있어요</span>
                  </span>
                  <i>→</i>
                </Link>
              </span>
            </div>
          )}
          {email && (
            <div>
              <span className="pg-label">CONTACT</span>
              <span>
                <button type="button" className={`pg-copy${copied ? ' done' : ''}`} onClick={copyEmail} title="눌러서 복사">
                  <span className="pg-ul">{emailText}</span>
                  <span className="pg-copied" role="status">{copied ? COPIED_LINES[(copyCount - 1) % COPIED_LINES.length] : ''}</span>
                </button>
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
          {/* 폴더 줄 위 오른쪽 빈자리에 붙어 있어서, 폴더가 많아져도 겹치지 않아요 */}
          <div className="pg-note" aria-hidden="true">
            <svg width="64" height="46" viewBox="0 0 64 46" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M60 10 C 40 6, 18 14, 10 38" />
              <path d="M4 30 L 10 39 L 18 32" />
            </svg>
            <span>open a folder</span>
          </div>
        </div>

        <div
          className={`pg-files${armed ? ' is-armed' : ''}`}
          ref={filesRef}
          onPointerEnter={(e) => {
            if (e.pointerType !== 'mouse') return
            setArmed(true)
            focusFind()
          }}
          onPointerLeave={(e) => {
            if (e.pointerType !== 'mouse' || byTap.current || query) return
            setArmed(false)
            if (document.activeElement === findRef.current) findRef.current?.blur()
          }}
        >
          <div className="pg-list">
            <div className="pg-list-head">
              <span className="pg-find-col">
                NAME
                <button
                  type="button"
                  className="pg-typehint"
                  onClick={() => {
                    byTap.current = true
                    setArmed(true)
                    findRef.current?.focus({ preventScroll: true })
                  }}
                >
                  type to find
                </button>
                <input
                  ref={findRef}
                  className="pg-find-ghost"
                  value={query}
                  tabIndex={-1}
                  aria-label="글 찾기"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setHover(-1)
                    restartIdle()
                  }}
                  onCompositionStart={() => (composing.current = true)}
                  onCompositionEnd={() => {
                    composing.current = false
                    restartIdle()
                  }}
                  onKeyDown={onFindKey}
                  onBlur={() => {
                    if (byTap.current) clearFind()
                  }}
                />
                {query && (
                  <span className={`pg-slip${finding && !firstHit ? ' miss' : ''}`} aria-live="polite">
                    {query}
                  </span>
                )}
              </span>
              <span className="pg-kind" style={{ color: 'inherit' }}>KIND</span>
              <span className="pg-date" style={{ color: 'inherit' }}>DATE</span>
            </div>
            {visible.map((p) => {
              const i = posts.indexOf(p)
              return (
                <Link
                  key={p.slug}
                  href={`/posts/${p.slug}/`}
                  className={`pg-row${p === cur ? ' is-cur' : ''}${finding && !matches(p, words) ? ' is-dim' : ''}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                >
                  <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true" style={{ flex: 'none' }}>
                      <path d="M1 1 H12 L17 6 V21 H1 Z" fill="#ffffff" stroke="#111111" strokeWidth="1" />
                      <path d="M12 1 V6 H17" fill="none" stroke="#111111" strokeWidth="1" />
                    </svg>
                    <span className="ttl">{highlight(p.title, words)}</span>
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
                <span style={{ fontSize: 13, color: 'var(--pg-sub)' }}>0 items · 0 KB</span>
                {filter !== 'all' && (
                  <button type="button" className="pg-btn" onClick={() => setFilter('all')}>
                    All 폴더 열기
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="pg-preview" aria-hidden="true">
            <div className="pg-paper-shadow">
              <div className="pg-paper" style={{ transform: `rotate(${curTilt}deg)` }}>
                <span className="corner" />
                <div
                  className="cover"
                  style={{ background: cur?.coverImageUrl ? colorOf(cur.label) : PONG_COVER_BG, color: cur?.label && colorOf(cur.label) === '#2B2B2B' ? '#fff' : '#111' }}
                >
                  {cur?.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cur.coverImageUrl} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    // 사진이 없는 글은 퐁이 대신 나와요. 글마다 손 흔들기/서 있기를 번갈아 써요
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={cur?.slug} className="pg-cover-pong" src={PONG_COVERS[(cur ? posts.indexOf(cur) : 0) % PONG_COVERS.length]} alt="" />
                  )}
                  {cur && <span className="pg-no">{curNo}</span>}
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{cur ? cur.title : '새 글을 기다리는 중'}</span>
                <span style={{ fontSize: 12, color: 'var(--pg-muted)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>
                  {cur?.description}
                </span>
              </div>
            </div>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{cur ? `${cur.slug}.md` : 'untitled.md'}</span>
          </div>
        </div>
      </section>

      <section id="calendar" className="pg-wrap pg-cal">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div ref={pickRef} style={{ position: 'relative' }}>
            <h2 className="pg-cal-h">
              <button
                type="button"
                className="pg-cal-pick"
                aria-expanded={picking}
                aria-label={`${yy}년 ${mm + 1}월, 다른 달 고르기`}
                onClick={() => {
                  setPickYear(yy)
                  setPicking((v) => !v)
                }}
              >
                {yy}
                <em>.{pad(mm + 1)}</em>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            </h2>
            {picking && (
              <div className="pg-months" role="dialog" aria-label="달 고르기">
                <div className="pg-months-y">
                  <button type="button" className="pg-arrow" aria-label="이전 해" onClick={() => setPickYear((y) => y - 1)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" /></svg>
                  </button>
                  <span>{pickYear}</span>
                  <button type="button" className="pg-arrow" aria-label="다음 해" onClick={() => setPickYear((y) => y + 1)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
                  </button>
                </div>
                <div className="pg-months-grid">
                  {Array.from({ length: 12 }, (_, m) => {
                    const n = monthCount.get(`${pickYear}-${m}`) || 0
                    const on = pickYear === yy && m === mm
                    return (
                      <button
                        key={m}
                        type="button"
                        className={`pg-month${on ? ' on' : ''}${n ? ' has' : ''}`}
                        aria-current={on ? 'date' : undefined}
                        aria-label={`${pickYear}년 ${m + 1}월${n ? `, 글 ${n}개` : ''}`}
                        onClick={() => goMonth(pickYear, m)}
                      >
                        {pad(m + 1)}
                        {n > 0 && <i>{n}</i>}
                      </button>
                    )
                  })}
                </div>
                <button type="button" className="pg-months-latest" onClick={() => goMonth(latest.getFullYear(), latest.getMonth())}>
                  최근 글이 있는 달 →
                </button>
              </div>
            )}
          </div>
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
              <span style={{ fontSize: 13, color: 'var(--pg-sub)' }}>이 달에 올린 글이 없어요.</span>
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
