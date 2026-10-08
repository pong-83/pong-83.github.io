'use client'

import { useEffect } from 'react'

const SHUT_MS = 260
const SHUT_GAP = 45

/**
 * 접힌 종이(노션 토글 제목)를 닫을 때도 한 줄씩 거꾸로 접히게 해요.
 * 펼칠 때는 CSS만으로 한 줄씩 펴지고, 닫힐 때는 브라우저가 바로 숨겨 버려서 여기서 잠깐 붙잡아 둬요.
 */
export function FoldToggles() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const onClick = (e: MouseEvent) => {
      const summary = (e.target as HTMLElement | null)?.closest('summary')
      const details = summary?.parentElement
      if (!summary || !(details instanceof HTMLDetailsElement)) return
      if (!details.matches('.pg-article details.toggle-heading-block') || !details.open) return
      e.preventDefault()
      if (details.classList.contains('pg-shutting')) return
      const content = details.querySelector(':scope > .toggle-content')
      if (!content) {
        details.open = false
        return
      }
      const rows = [...content.children].flatMap((el) => (el.matches('ul, ol') ? [...el.children] : [el])) as HTMLElement[]
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
    // 열 때마다 펼침 애니메이션을 처음부터 다시 틀어요. 브라우저가 닫힌 내용의 애니메이션을 미리 끝내 두는 경우가 있어요
    const onToggle = (e: Event) => {
      const details = e.target
      if (!(details instanceof HTMLDetailsElement) || !details.open) return
      if (!details.matches('.pg-article details.toggle-heading-block')) return
      details.querySelectorAll<HTMLElement>(':scope > .toggle-content > *, :scope > .toggle-content > :is(ul, ol) > li').forEach((row) => {
        row.getAnimations().forEach((a) => {
          a.cancel()
          a.play()
        })
      })
    }
    document.addEventListener('click', onClick)
    document.addEventListener('toggle', onToggle, true)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('toggle', onToggle, true)
    }
  }, [])
  return null
}
