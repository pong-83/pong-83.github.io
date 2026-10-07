/**
 * SEO 메타데이터 헬퍼 함수
 * 페이지별 SEO 최적화를 위한 중앙 집중식 관리
 */

import type { Metadata } from 'next'
import type { SiteConfig } from '@/services/notion/client'

/**
 * 사이트 URL - 환경 변수에서 가져오거나 기본값 사용
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://your-username.github.io'

/**
 * 기본 SEO 설정 (Notion SiteConfig가 없을 때 fallback)
 * Notion Site Settings DB에서 설정을 관리하세요
 */
const fallbackSEO = {
  title: '블로그 제목',
  description: 'Notion으로 관리하는 개인 블로그',
  url: SITE_URL,
  siteName: '블로그',
  author: '작성자',
  locale: 'ko_KR',
  type: 'website' as const,
  ogImage: `${SITE_URL}/images/share.png`,
  twitterHandle: '@your_twitter',
}

/**
 * Notion SiteConfig를 기반으로 SEO 설정 생성
 */
function getDefaultSEO(siteConfig?: SiteConfig) {
  if (!siteConfig) return fallbackSEO

  return {
    title: siteConfig.siteTitle || fallbackSEO.title,
    description: siteConfig.siteDescription || fallbackSEO.description,
    url: SITE_URL,
    siteName: siteConfig.siteTitle || fallbackSEO.siteName,
    author: siteConfig.author || fallbackSEO.author,
    locale: 'ko_KR' as const,
    type: 'website' as const,
    // 항상 로컬에 다운로드된 OG 이미지 사용 (Notion S3 URL은 임시 URL이라 만료됨)
    ogImage: `${SITE_URL}/images/share.png`,
    twitterHandle: siteConfig.twitterHandle || fallbackSEO.twitterHandle,
  }
}

/**
 * 기본 메타데이터 생성
 */
export function createMetadata({
  title,
  description,
  path = '',
  image,
  type = 'website',
  publishedTime,
  modifiedTime,
  tags = [],
  siteConfig,
}: {
  title?: string
  description?: string
  path?: string
  image?: string
  type?: 'website' | 'article'
  publishedTime?: string
  modifiedTime?: string
  tags?: string[]
  siteConfig?: SiteConfig
} = {}): Metadata {
  const defaultSEO = getDefaultSEO(siteConfig)

  const fullTitle = title ? `${title} — ${defaultSEO.siteName}` : defaultSEO.title
  const fullDescription = description || defaultSEO.description
  const fullUrl = `${defaultSEO.url}${path}`

  // Notion 커버 이미지가 있으면 우선 사용, 없으면 기본 이미지
  // Notion CDN 이미지는 HTTPS를 사용하므로 안전
  const fullImage = image || defaultSEO.ogImage

  const metadata: Metadata = {
    title: fullTitle,
    description: fullDescription,
    openGraph: {
      title: fullTitle,
      description: fullDescription,
      url: fullUrl,
      siteName: defaultSEO.siteName,
      images: [
        {
          url: fullImage,
          width: 1200,
          height: 630,
          alt: fullTitle,
        },
      ],
      locale: defaultSEO.locale,
      type,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: fullDescription,
      images: [fullImage],
      creator: defaultSEO.twitterHandle,
    },
    alternates: {
      canonical: fullUrl,
    },
  }

  // 아티클 타입인 경우 추가 메타데이터
  if (type === 'article') {
    metadata.openGraph = {
      ...metadata.openGraph,
      type: 'article',
      publishedTime,
      modifiedTime,
      authors: [defaultSEO.author],
      tags,
    }
  }

  return metadata
}

/**
 * 홈페이지 메타데이터 생성
 */
export function createHomeMetadata(siteConfig?: SiteConfig): Metadata {
  const defaultSEO = getDefaultSEO(siteConfig)
  return createMetadata({
    // 홈페이지는 title을 전달하지 않아 사이트 이름만 표시
    description: defaultSEO.description,
    path: '/',
    siteConfig,
  })
}

/**
 * About 페이지 메타데이터 생성
 */
export function createAboutMetadata(siteConfig?: SiteConfig): Metadata {
  return createMetadata({
    title: 'About',
    description: 'Notion About 페이지를 설정하여 자신을 소개하세요',
    path: '/about',
    siteConfig,
  })
}

/**
 * 포스트 메타데이터 생성
 */
export function createPostMetadata({
  title,
  description,
  slug,
  publishedTime,
  modifiedTime,
  tags = [],
  coverImage,
  siteConfig,
}: {
  title: string
  description?: string
  slug: string
  publishedTime?: string
  modifiedTime?: string
  tags?: string[]
  coverImage?: string
  siteConfig?: SiteConfig
}): Metadata {
  return createMetadata({
    title,
    description: description || title,
    path: `/posts/${slug}`,
    image: coverImage,
    type: 'article',
    publishedTime,
    modifiedTime,
    tags,
    siteConfig,
  })
}

/**
 * JSON-LD 구조화된 데이터 생성
 */
export function createJsonLd({
  type,
  title,
  description,
  url,
  image,
  publishedTime,
  modifiedTime,
  author,
  tags,
  siteConfig,
}: {
  type: 'WebSite' | 'Article' | 'Person' | 'Blog'
  title: string
  description: string
  url: string
  image?: string
  publishedTime?: string
  modifiedTime?: string
  author?: string
  tags?: string[]
  siteConfig?: SiteConfig
}) {
  const defaultSEO = getDefaultSEO(siteConfig)
  const baseJsonLd: any = {
    '@context': 'https://schema.org',
    '@type': type,
    name: title,
    description,
    url,
  }

  if (image) {
    baseJsonLd.image = image
  }

  if (type === 'WebSite') {
    return {
      ...baseJsonLd,
      publisher: {
        '@type': 'Organization',
        name: defaultSEO.siteName,
      },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    }
  }

  if (type === 'Blog') {
    return {
      ...baseJsonLd,
      author: {
        '@type': 'Person',
        name: author || defaultSEO.author,
      },
      publisher: {
        '@type': 'Organization',
        name: defaultSEO.siteName,
      },
      inLanguage: 'ko-KR',
    }
  }

  if (type === 'Article') {
    return {
      ...baseJsonLd,
      headline: title,
      datePublished: publishedTime,
      dateModified: modifiedTime || publishedTime,
      author: {
        '@type': 'Person',
        name: author || defaultSEO.author,
      },
      publisher: {
        '@type': 'Organization',
        name: defaultSEO.siteName,
      },
      keywords: tags?.join(', '),
    }
  }

  if (type === 'Person') {
    return {
      ...baseJsonLd,
      jobTitle: 'Developer & Designer',
      worksFor: {
        '@type': 'Organization',
        name: defaultSEO.siteName,
      },
    }
  }

  return baseJsonLd
}

/**
 * BreadcrumbList JSON-LD 생성
 */
export function createBreadcrumbJsonLd({
  items,
}: {
  items: Array<{ name: string; url?: string }>
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  }
}

/**
 * 사이트맵 생성용 URL 목록
 */
export function generateSitemapUrls(posts: Array<{ slug: string; updatedAt: string }>) {
  const staticPages = [
    {
      url: '',
      lastmod: new Date().toISOString(),
      changefreq: 'weekly',
      priority: 1.0,
    },
    {
      url: '/about',
      lastmod: new Date().toISOString(),
      changefreq: 'monthly',
      priority: 0.8,
    },
  ]

  const postPages = posts.map((post) => ({
    url: `/posts/${post.slug}`,
    lastmod: post.updatedAt,
    changefreq: 'monthly',
    priority: 0.6,
  }))

  return [...staticPages, ...postPages]
}

/**
 * RSS 피드 생성용 데이터
 */
export function generateRssData(
  posts: Array<{
    title: string
    description: string
    slug: string
    publishedTime: string
    content: string
  }>,
  siteConfig?: SiteConfig
) {
  const defaultSEO = getDefaultSEO(siteConfig)

  return {
    title: defaultSEO.title,
    description: defaultSEO.description,
    url: SITE_URL,
    language: 'ko',
    lastBuildDate: new Date().toUTCString(),
    items: posts.map((post) => ({
      title: post.title,
      description: post.description,
      url: `${SITE_URL}/posts/${post.slug}`,
      guid: `${SITE_URL}/posts/${post.slug}`,
      pubDate: new Date(post.publishedTime).toUTCString(),
      content: post.content,
    })),
  }
}
