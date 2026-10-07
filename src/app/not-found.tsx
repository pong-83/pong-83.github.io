/**
 * Custom 404 Not Found Page
 * 없는 주소로 들어오면 "파일을 찾을 수 없어요" 경고창을 보여 줌
 */

import { NotFoundAlert } from '@/components/pong/NotFoundAlert'
import { listPublishedPostsMemo } from '@/lib/request-memo'

export const metadata = {
  title: '404 - 파일을 찾을 수 없어요',
  description: '찾는 페이지가 없거나 옮겨졌어요.',
}

export default async function NotFound() {
  let slugs: string[] = []
  try {
    slugs = (await listPublishedPostsMemo()).map((post) => post.slug)
  } catch {
    slugs = []
  }
  return <NotFoundAlert slugs={slugs} />
}
