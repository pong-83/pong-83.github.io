/**
 * Giscus 기반 댓글 컴포넌트
 * GitHub Discussions를 사용한 댓글 시스템
 *
 * 성능 최적화:
 * - Giscus 라이브러리 (~20KB)는 댓글 섹션이 뷰포트에 진입할 때만 로드
 * - React.lazy()와 Suspense를 사용한 코드 스플리팅
 * - 초기 페이지 로드 성능 향상
 */

'use client'

import { lazy, Suspense } from 'react'
import { useTheme } from './ThemeProvider'

// Giscus 컴포넌트를 lazy loading
const Giscus = lazy(() => import('@giscus/react'))

interface CommentsProps {
  repo: `${string}/${string}` // 형식: "username/repo-name"
  repoId: string
  category: string
  categoryId: string
  mapping?: 'pathname' | 'url' | 'title' | 'og:title' | 'specific' | 'number'
  reactionsEnabled?: boolean
  emitMetadata?: boolean
  inputPosition?: 'top' | 'bottom'
  lang?: string
  loading?: 'lazy' | 'eager'
}

export function Comments({
  repo,
  repoId,
  category,
  categoryId,
  mapping = 'pathname',
  reactionsEnabled = true,
  emitMetadata = false,
  inputPosition = 'bottom',
  lang = 'ko',
  loading = 'lazy',
}: CommentsProps) {
  const { resolvedTheme, theme } = useTheme()

  // 환경 변수에서 테마 설정 가져오기 (없으면 기본값 사용)
  const lightTheme = process.env.NEXT_PUBLIC_GISCUS_THEME_LIGHT || 'light'
  const darkTheme = process.env.NEXT_PUBLIC_GISCUS_THEME_DARK || 'dark'

  // 테마에 따라 Giscus 테마 결정
  // resolvedTheme이 undefined일 수 있으므로 theme도 체크
  const currentTheme = resolvedTheme || theme
  const giscusTheme = currentTheme === 'dark' ? darkTheme : lightTheme

  return (
    <div className="pg-comments">
      <h2 className="pg-comments-h">COMMENTS</h2>
      <Suspense fallback={
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>Loading comments...</span>
          </div>
        </div>
      }>
        <Giscus
          id="comments"
          repo={repo}
          repoId={repoId}
          category={category}
          categoryId={categoryId}
          mapping={mapping}
          strict="0"
          reactionsEnabled={reactionsEnabled ? '1' : '0'}
          emitMetadata={emitMetadata ? '1' : '0'}
          inputPosition={inputPosition}
          theme={giscusTheme}
          lang={lang}
          loading={loading}
        />
      </Suspense>
    </div>
  )
}
