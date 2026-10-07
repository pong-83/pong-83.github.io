/**
 * sitemap.xml 동적 생성
 * 검색 엔진이 사이트의 모든 페이지를 찾을 수 있도록 도움
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */

import { MetadataRoute } from 'next'
import { listPublishedPostsMemo } from '@/lib/request-memo'
import { FALLBACK_POST_SLUGS } from '@/lib/fallback-data'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://your-username.github.io'

export const dynamic = 'force-static'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/about/`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]

  // 포스트 페이지 동적 생성
  try {
    const posts = await listPublishedPostsMemo()

    const postPages: MetadataRoute.Sitemap = posts.map((post) => ({
      url: `${baseUrl}/posts/${post.slug}/`,
      lastModified: post.date ? new Date(post.date) : new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    }))

    return [...staticPages, ...postPages]
  } catch {
    // Fallback: 더미 데이터로 sitemap 생성
    const fallbackPages: MetadataRoute.Sitemap = FALLBACK_POST_SLUGS.map((slug) => ({
      url: `${baseUrl}/posts/${slug}/`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    }))

    return [...staticPages, ...fallbackPages]
  }
}
