/**
 * Notion 이미지를 빌드할 때 내려받아 사이트 안 주소로 바꿉니다.
 *
 * Notion이 주는 이미지 주소는 약 1시간 뒤 만료되는 서명된 임시 URL이라,
 * 페이지를 만들기 전에 데이터 안의 Notion 이미지 주소를 찾아
 * .notion-images/ 에 저장하고 주소를 /notion-images/<파일> 로 바꿉니다.
 * 빌드가 끝나면 scripts/copy-notion-images.mjs 가 이 폴더를 out/ 로 복사합니다.
 *
 * 페이지를 만든 뒤 결과 파일의 주소를 바꾸면 React 데이터의 글자 수 정보가
 * 어긋나 페이지가 깨지므로, 반드시 렌더링 전에 바꿉니다.
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export const NOTION_IMAGE_DIR = '.notion-images'
const PUBLIC_DIR_NAME = 'notion-images'

const NOTION_IMAGE_URL =
  /https:\/\/(?:prod-files-secure\.s3\.us-west-2\.amazonaws\.com|s3\.us-west-2\.amazonaws\.com\/secure\.notion-static\.com|file\.notion\.so|www\.notion\.so\/image|img\.notionusercontent\.com)[^"'\s<>()\\]+/g

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'])

type Download = (url: string, filepath: string) => Promise<void>

/** HTML 안에서 &amp; 로 적힌 주소를 실제 주소로 되돌립니다. */
export function decodeUrl(raw: string): string {
  return raw.replace(/&amp;/g, '&')
}

/** 서명 값이 바뀌어도 같은 이미지는 같은 파일 이름이 되도록 쿼리를 뺀 주소로 이름을 만듭니다. */
export function localFileName(url: string): string {
  const parsed = new URL(url)
  let key = parsed.origin + parsed.pathname
  let ext = path.extname(parsed.pathname).toLowerCase()
  // www.notion.so/image/<인코딩된 원본 주소> 형태
  if (parsed.pathname.startsWith('/image/')) {
    try {
      const inner = new URL(decodeURIComponent(parsed.pathname.slice('/image/'.length)))
      key = inner.origin + inner.pathname
      ext = path.extname(inner.pathname).toLowerCase()
    } catch {
      // 원본 주소가 아니면 그대로 사용
    }
  }
  if (!IMAGE_EXTENSIONS.has(ext)) ext = '.img'
  if (ext === '.jpeg') ext = '.jpg'
  const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)
  return `${hash}${ext}`
}

async function defaultDownload(url: string, filepath: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  // 여러 빌드 작업이 동시에 같은 파일을 쓰지 않도록 임시 파일에 쓴 뒤 옮깁니다.
  const tmp = `${filepath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, buffer)
  fs.renameSync(tmp, filepath)
}

export function isImageStoreEnabled(): boolean {
  if (process.env.NOTION_IMAGE_STORE === 'off') return false
  return process.env.NODE_ENV === 'production'
}

export function createImageStore(options: { rootDir?: string; publicPrefix?: string; download?: Download } = {}) {
  const rootDir = options.rootDir ?? process.cwd()
  const publicPrefix =
    options.publicPrefix ??
    `${(process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')}${process.env.NEXT_PUBLIC_BASE_PATH || ''}`
  const download = options.download ?? defaultDownload
  const dir = path.join(rootDir, NOTION_IMAGE_DIR)
  const pending = new Map<string, Promise<string | null>>()

  function save(url: string): Promise<string | null> {
    let name: string
    try {
      name = localFileName(url)
    } catch {
      return Promise.resolve(null)
    }
    const existing = pending.get(name)
    if (existing) return existing
    const job = (async () => {
      const filepath = path.join(dir, name)
      try {
        if (!fs.existsSync(filepath)) {
          fs.mkdirSync(dir, { recursive: true })
          await download(url, filepath)
        }
        return `${publicPrefix}/${PUBLIC_DIR_NAME}/${name}`
      } catch (error) {
        console.warn(`⚠️  Could not save Notion image, keeping its address: ${(error as Error).message}`)
        return null
      }
    })()
    pending.set(name, job)
    return job
  }

  async function localizeString(text: string): Promise<string> {
    const matches = text.match(NOTION_IMAGE_URL)
    if (!matches) return text
    const local = new Map<string, string | null>()
    for (const raw of new Set(matches)) local.set(raw, await save(decodeUrl(raw)))
    return text.replace(NOTION_IMAGE_URL, (raw) => local.get(raw) ?? raw)
  }

  /** 데이터 안의 모든 문자열에서 Notion 이미지 주소를 사이트 안 주소로 바꾼 사본을 돌려줍니다. */
  async function localize<T>(value: T): Promise<T> {
    if (typeof value === 'string') return (await localizeString(value)) as T
    if (Array.isArray(value)) return (await Promise.all(value.map((v) => localize(v)))) as T
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      const entries = await Promise.all(
        Object.entries(value as Record<string, unknown>).map(async ([k, v]) => [k, await localize(v)] as const)
      )
      return Object.fromEntries(entries) as T
    }
    return value
  }

  return { localize }
}

let sharedStore: ReturnType<typeof createImageStore> | null = null

/** 빌드할 때만 Notion 이미지를 저장하고, 개발 중에는 데이터를 그대로 돌려줍니다. */
export async function localizeNotionImages<T>(value: T): Promise<T> {
  if (!isImageStoreEnabled()) return value
  sharedStore ??= createImageStore()
  return sharedStore.localize(value)
}
