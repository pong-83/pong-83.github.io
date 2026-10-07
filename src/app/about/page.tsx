/**
 * About 페이지
 * Notion API로부터 About 페이지 내용을 가져와 표시합니다.
 */

import { getAboutPageMemo, getSiteConfigMemo } from '@/lib/request-memo'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Icon } from '@/lib/icons'
import { createAboutMetadata, createJsonLd } from '@/lib/seo'
import { addIdsToHeadings } from '@/lib/toc'
import { ImageZoomModal } from '@/components/ImageZoomModal'
import { KatexRenderer } from '@/components/KatexRenderer'
import CodeHighlight from '@/components/CodeHighlight'
import type { Metadata } from 'next'

export const revalidate = 600 // ISR 10분

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://your-username.github.io'

// Metadata 생성
export async function generateMetadata(): Promise<Metadata> {
  try {
    const siteConfig = await getSiteConfigMemo()
    return createAboutMetadata(siteConfig)
  } catch {
    return createAboutMetadata()
  }
}

export default async function AboutPage() {
  try {
    const [aboutPage, siteConfig] = await Promise.all([
      getAboutPageMemo(),
      getSiteConfigMemo(),
    ])

    // About 페이지가 설정되지 않은 경우 기본 메시지 표시
    if (!aboutPage) {
      return (
        <div className="py-16 lg:py-20">
          <h1 className="text-4xl font-bold mb-8">About</h1>
          <Alert>
            <Icon name="info" size={16} />
            <AlertTitle>설정이 필요합니다</AlertTitle>
            <AlertDescription>
              About 페이지를 표시하려면 .env.local 파일에 NOTION_ABOUT_PAGE_ID를 추가해주세요.
            </AlertDescription>
          </Alert>
        </div>
      )
    }

    // HTML에 제목 ID 추가 (목차 기능 지원)
    const contentWithIds = addIdsToHeadings(aboutPage.html)

    // Person Schema JSON-LD 생성
    const personJsonLd = createJsonLd({
      type: 'Person',
      title: aboutPage.title || '소개',
      description: 'Notion About 페이지를 설정하여 자신을 소개하세요',
      url: `${SITE_URL}/about`,
      siteConfig,
    })

    return (
      <>
        {/* JSON-LD 구조화된 데이터 - Person Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        />

        <article className="pg-wrap pg-post-head" style={{ paddingBottom: 96 }}>
          <h1>{aboutPage.title}</h1>
          {/* Notion 콘텐츠 렌더링 */}
          <div
            className="pg-body pg-article"
            style={{ borderTop: 0, marginTop: 24 }}
            dangerouslySetInnerHTML={{ __html: contentWithIds }}
          />
        </article>

        {/* 이미지 확대 모달 */}
        <ImageZoomModal />

        {/* KaTeX 수식 렌더링 */}
        <KatexRenderer />

        {/* Prism.js 코드 구문 강조 */}
        <CodeHighlight />
      </>
    )
  } catch {
    return (
      <div className="py-16 lg:py-20">
        <h1 className="text-4xl font-bold mb-8">About</h1>
        <Alert variant="destructive">
          <Icon name="error" size={16} />
          <AlertTitle>오류 발생</AlertTitle>
          <AlertDescription>
            About 페이지를 불러오는데 실패했습니다. 잠시 후 다시 시도해주세요.
          </AlertDescription>
        </Alert>
      </div>
    )
  }
}
