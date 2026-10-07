/**
 * 글 본문을 큰 제목(제목1, 제목2) 기준으로 나눠
 * 번호가 붙은 줄(섹션)로 보여 주기 위한 도구
 */

import { NotionRenderer, type NotionBlock } from '@/services/notion/renderer'
import { generateId } from '@/lib/toc'

export type PostSection = {
  id: string
  title: string
  html: string
}

export type SplitPost = {
  introHtml: string
  sections: PostSection[]
}

function isSectionHeading(block: NotionBlock): boolean {
  if (block.type !== 'heading_1' && block.type !== 'heading_2') return false
  return !block[block.type]?.is_toggleable
}

export function splitPostIntoSections(blocks: NotionBlock[], fallbackHtml: string): SplitPost {
  if (!Array.isArray(blocks) || !blocks.some(isSectionHeading)) {
    return { introHtml: fallbackHtml, sections: [] }
  }

  const renderer = NotionRenderer.getInstance()
  const intro: NotionBlock[] = []
  const groups: { title: string; blocks: NotionBlock[] }[] = []

  for (const block of blocks) {
    if (isSectionHeading(block)) {
      const title = (block[block.type]?.rich_text || []).map((t: { plain_text?: string }) => t.plain_text || '').join('')
      groups.push({ title, blocks: [] })
    } else if (groups.length > 0) {
      groups[groups.length - 1].blocks.push(block)
    } else {
      intro.push(block)
    }
  }

  const used = new Set<string>()
  const sections = groups.map((g, i) => {
    let id = generateId(g.title)
    if (!id || id === '-') id = `section-${i + 1}`
    let unique = id
    for (let n = 1; used.has(unique); n++) unique = `${id}-${n}`
    used.add(unique)
    return { id: unique, title: g.title, html: renderer.renderBlocks(g.blocks) }
  })

  return { introHtml: renderer.renderBlocks(intro), sections }
}
