/**
 * 포스트 상세 페이지
 * 개별 포스트의 상세 내용을 표시하는 페이지
 */

import { notFound } from 'next/navigation'
import { listPublishedPostsMemo, getPostBySlugMemo, getSiteConfigMemo } from '@/lib/request-memo'
import { PostView } from '@/components/pong/PostView'
import { Comments } from '@/components/Comments'
import { KatexRenderer } from '@/components/KatexRenderer'
import CodeHighlight from '@/components/CodeHighlight'
import { createPostMetadata, createJsonLd, createBreadcrumbJsonLd } from '@/lib/seo'
import { splitPostIntoSections } from '@/lib/sections'
import { FALLBACK_POST_SLUGS } from '@/lib/fallback-data'
import type { Metadata } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://your-username.github.io'

export const revalidate = 600 // ISR 10분
// Static export를 위해 dynamicParams를 false로 설정
// 모든 페이지는 빌드 시점에 generateStaticParams를 통해 생성됨
export const dynamicParams = false

// 페이지 Props 타입 정의
interface PostPageProps {
  params: Promise<{ slug: string }>
}

// 빌드 타임에 모든 포스트 페이지를 미리 생성
export async function generateStaticParams() {
  try {
    const posts = await listPublishedPostsMemo()
    return posts.map((post) => ({
      slug: post.slug,
    }))
  } catch {
    // Notion API 실패 시 fallback 데이터 사용
    return FALLBACK_POST_SLUGS.map((slug) => ({ slug }))
  }
}

// Metadata 생성
export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { slug } = await params

  try {
    const [post, siteConfig] = await Promise.all([
      getPostBySlugMemo(slug),
      getSiteConfigMemo(),
    ])

    if (!post) {
      return { title: '포스트를 찾을 수 없습니다' }
    }

    return createPostMetadata({
      title: post.title,
      description: post.description,
      slug: slug,
      publishedTime: post.date,
      tags: post.tags,
      coverImage: post.coverImageUrl,
      siteConfig,
    })
  } catch {
    return { title: '포스트를 찾을 수 없습니다' }
  }
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params

  try {
    const [post, siteConfig] = await Promise.all([
      getPostBySlugMemo(slug),
      getSiteConfigMemo(),
    ])

    if (!post) {
      notFound()
    }

    // 제목1·제목2 기준으로 본문을 번호 붙은 섹션으로 나눔
    const { introHtml, sections } = splitPostIntoSections(post.content, post.html)

    // 다음에 읽을 글: 이 글보다 먼저 쓴 글부터 3개
    let more: Awaited<ReturnType<typeof listPublishedPostsMemo>> = []
    try {
      const all = await listPublishedPostsMemo()
      const idx = all.findIndex((p) => p.slug === slug)
      more = [...all.slice(idx + 1), ...all.slice(0, Math.max(0, idx))].slice(0, 3)
    } catch {
      more = []
    }
    const textLength = post.html.replace(/<[^>]+>/g, '').length

    // JSON-LD 구조화된 데이터 생성
    const jsonLd = createJsonLd({
      type: 'Article',
      title: post.title,
      description: post.description || post.title,
      url: `${SITE_URL}/posts/${slug}`,
      image: post.coverImageUrl,
      publishedTime: post.date,
      modifiedTime: post.date,
      author: post.author || siteConfig.author || '작성자',
      tags: post.tags,
      siteConfig,
    })

    // BreadcrumbList JSON-LD 생성
    const breadcrumbJsonLd = createBreadcrumbJsonLd({
      items: [
        { name: 'Home', url: SITE_URL },
        { name: 'Articles', url: SITE_URL },
        { name: post.title },
      ],
    })

    // Giscus 설정 (환경 변수에서 가져오기)
    const giscusRepo = (process.env.NEXT_PUBLIC_GISCUS_REPO || '') as `${string}/${string}`
    const giscusRepoId = process.env.NEXT_PUBLIC_GISCUS_REPO_ID || ''
    const giscusCategory = process.env.NEXT_PUBLIC_GISCUS_CATEGORY || ''
    const giscusCategoryId = process.env.NEXT_PUBLIC_GISCUS_CATEGORY_ID || ''
    const enableComments = Boolean(giscusRepo && giscusRepoId && giscusCategory && giscusCategoryId)

    return (
      <>
        {/* Preload cover image */}
        {post.coverImageUrl && (
          <link
            rel="preload"
            as="image"
            href={post.coverImageUrl}
          />
        )}

        {/* JSON-LD 구조화된 데이터 - Article Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* JSON-LD 구조화된 데이터 - BreadcrumbList Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
        <PostView
          slug={slug}
          title={post.title}
          label={post.label}
          date={post.date}
          description={post.description}
          coverImageUrl={post.coverImageUrl}
          tags={post.tags || []}
          introHtml={introHtml}
          sections={sections}
          readMinutes={Math.max(1, Math.ceil(textLength / 500))}
          more={more}
        >
          {/* Giscus 댓글 시스템 */}
          {enableComments && (
            <Comments
              repo={giscusRepo}
              repoId={giscusRepoId}
              category={giscusCategory}
              categoryId={giscusCategoryId}
            />
          )}
        </PostView>

        {/* KaTeX 수식 렌더링 */}
        <KatexRenderer />

        {/* Mermaid 다이어그램은 Kroki API로 이미지로 렌더링됨 (MermaidRenderer 불필요) */}

        {/* Prism.js 코드 구문 강조 */}
        <CodeHighlight />
      </>
    )
  } catch {
    notFound()
  }
}