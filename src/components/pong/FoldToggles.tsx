'use client'

import { useEffect } from 'react'

const SHUT_MS = 260
const SHUT_GAP = 45
const OPEN_MS = 620
const OPEN_GAP = 140

/**
 * 접힌 종이(노션 토글 제목)를 열고 닫을 때 한 줄씩 펴지고 접히게 해요.
 * 펼칠 때도 여기서 한 줄씩 틀어요. CSS만 두면 처음 열 때 한 번에 펴지는 브라우저가 있어요.
 * 닫힐 때는 브라우저가 바로 숨겨 버려서 여기서 잠깐 붙잡아 둬요.
 */
export function FoldToggles() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const rowsOf = (details: HTMLDetailsElement) => {
      const content = details.querySelector(':scope > .toggle-content')
      if (!content) return null
      return [...content.children].flatMap((el) => (el.matches('ul, ol') ? [...el.children] : [el])) as HTMLElement[]
    }
    const unfold = (details: HTMLDetailsElement) => {
      const rows = rowsOf(details)
      details.open = true
      if (!rows) return
      // 처음 열 때 브라우저가 CSS 애니메이션을 건너뛰는 경우가 있어서, 열 때마다 여기서 한 줄씩 직접 틀어요
      rows.forEach((row) => (row.style.animation = 'none'))
      void details.offsetHeight
      rows.forEach((row, i) => {
        row.style.animation = `${i % 2 ? 'pg-fold-b' : 'pg-fold-a'} ${OPEN_MS}ms cubic-bezier(.2,.9,.3,1.15) ${i * OPEN_GAP}ms backwards`
      })
      window.clearTimeout(Number(details.dataset.pgFold))
      details.dataset.pgFold = String(
        window.setTimeout(() => rows.forEach((row) => row.style.removeProperty('animation')), OPEN_MS + rows.length * OPEN_GAP + 20),
      )
    }
    const onClick = (e: MouseEvent) => {
      const summary = (e.target as HTMLElement | null)?.closest('summary')
      const details = summary?.parentElement
      if (!summary || !(details instanceof HTMLDetailsElement)) return
      if (!details.matches('.pg-article details.toggle-heading-block')) return
      e.preventDefault()
      if (details.classList.contains('pg-shutting')) return
      if (!details.open) {
        unfold(details)
        return
      }
      const rows = rowsOf(details)
      if (!rows) {
        details.open = false
        return
      }
      window.clearTimeout(Number(details.dataset.pgFold))
      details.classList.add('pg-shutting')
      // 아래 줄부터 차례로 접어 올려요
      rows.forEach((row, i) => {
        const k = rows.length - 1 - i
        row.style.animation = `${i % 2 ? 'pg-shut-b' : 'pg-shut-a'} ${SHUT_MS}ms cubic-bezier(.4,0,.8,.4) ${k * SHUT_GAP}ms both`
      })
      window.setTimeout(() => {
        details.open = false
        details.classList.remove('pg-shutting')
        rows.forEach((row) => row.style.removeProperty('animation'))
      }, SHUT_MS + (rows.length - 1) * SHUT_GAP + 20)
    }
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('click', onClick)
    }
  }, [])
  return null
}
