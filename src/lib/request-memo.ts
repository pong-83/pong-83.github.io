/**
 * Request Memoization을 위한 캐싱 레이어
 *
 * React의 cache() API를 사용하여 동일 요청 내에서
 * 중복 데이터 fetch를 방지합니다.
 *
 * ## 사용 사례
 * - generateMetadata와 페이지 컴포넌트에서 동일 데이터 사용
 * - 빌드 시 중복 API 호출 제거 (50% 감소)
 *
 * @see https://nextjs.org/docs/app/building-your-application/caching#request-memoization
 */

import { cache } from 'react'
import { createNotionClient } from '@/services/notion/client'
import { localizeNotionImages } from '@/lib/notion-image-store'
import type { PostDetail, PostListItem, AboutPage, SiteConfig, SiteSettings } from '@/services/notion/client'

/**
 * 포스트 목록 조회 (메모이제이션)
 *
 * 동일 요청 내에서 여러 번 호출되어도 실제 API 호출은 1회만 발생
 */
export const listPublishedPostsMemo = cache(async (): Promise<PostListItem[]> => {
  const notionClient = createNotionClient()
  return localizeNotionImages(await notionClient.listPublishedPosts())
})

/**
 * 포스트 상세 조회 (메모이제이션)
 *
 * generateMetadata와 페이지 컴포넌트에서 동일 slug로 호출 시
 * 실제 API 호출은 1회만 발생
 *
 * @param slug 포스트 slug
 */
export const getPostBySlugMemo = cache(async (slug: string): Promise<PostDetail | null> => {
  const notionClient = createNotionClient()
  return localizeNotionImages(await notionClient.getPostBySlug(slug))
})

/**
 * About 페이지 조회 (메모이제이션)
 */
export const getAboutPageMemo = cache(async (): Promise<AboutPage | null> => {
  const notionClient = createNotionClient()
  return localizeNotionImages(await notionClient.getAboutPage())
})

/**
 * 사이트 설정 조회 (메모이제이션)
 */
export const getSiteConfigMemo = cache(async (): Promise<SiteConfig> => {
  const notionClient = createNotionClient()
  return localizeNotionImages(await notionClient.getSiteConfig())
})

/**
 * 사이트 설정 조회 - getSiteSettings (메모이제이션)
 */
export const getSiteSettingsMemo = cache(async (): Promise<SiteSettings> => {
  const notionClient = createNotionClient()
  return localizeNotionImages(await notionClient.getSiteSettings())
})
