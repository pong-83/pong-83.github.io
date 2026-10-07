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

/**
 * 이미지 파일 앞부분만 읽어 가로·세로 크기를 알아냅니다. (PNG, JPEG, GIF, WebP)
 * 모르는 형식이면 null 을 돌려줍니다.
 */
export function readImageSize(filepath: string): { width: number; height: number } | null {
  let buf: Buffer
  try {
    buf = fs.readFileSync(filepath)
  } catch {
    return null
  }
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  if (buf.length >= 10 && buf.toString('ascii', 0, 3) === 'GIF') {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  }
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16)
    if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21)
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }
    }
    if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
    return null
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null
      const marker = buf[i + 1]
      const len = buf.readUInt16BE(i + 2)
      // SOF0~SOF15 (DHT·JPG·DAC 제외) 에 크기가 들어 있어요
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        const size = { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) }
        // 사진을 돌려 찍은 경우(EXIF 회전)는 빌드 때 바로 세워 저장하므로 가로세로를 맞춰 줘요
        return jpegIsRotated(buf) ? { width: size.height, height: size.width } : size
      }
      i += 2 + len
    }
  }
  return null
}

/** JPEG EXIF 방향 값이 5~8(90도 돌아감)인지 봅니다. */
function jpegIsRotated(buf: Buffer): boolean {
  const app1 = buf.indexOf(Buffer.from('Exif\0\0', 'binary'))
  if (app1 < 0 || app1 > 64 * 1024) return false
  const tiff = app1 + 6
  if (tiff + 8 > buf.length) return false
  const le = buf.toString('ascii', tiff, tiff + 2) === 'II'
  const u16 = (o: number) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o))
  const u32 = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o))
  const ifd = tiff + u32(tiff + 4)
  if (ifd + 2 > buf.length) return false
  const count = u16(ifd)
  for (let n = 0; n < count; n++) {
    const e = ifd + 2 + n * 12
    if (e + 10 > buf.length) return false
    if (u16(e) === 0x0112) return u16(e + 8) >= 5
  }
  return false
}

const sizeCache = new Map<string, { width: number; height: number } | null>()

/**
 * 사이트 안 이미지(/notion-images/...) 태그에 원래 크기(width·height)를 적어 둡니다.
 * 이미지가 늦게 불러와져도 자리가 먼저 잡혀서, 스크롤하다 글이 갑자기 밀리지 않아요.
 * 글을 섹션으로 나눠 다시 그린 HTML 에도 쓸 수 있도록 파일에서 바로 크기를 읽어요.
 */
export function addLocalImageSizes(html: string, rootDir: string = process.cwd()): string {
  if (!html || !html.includes('<img')) return html
  return html.replace(/<img\b[^>]*>/g, (tag) => {
    if (/\swidth=/.test(tag)) return tag
    const name = tag.match(new RegExp(`\\ssrc="[^"]*/${PUBLIC_DIR_NAME}/([0-9a-f]{16}\\.[a-z]+)"`))?.[1]
    if (!name) return tag
    const filepath = path.join(rootDir, NOTION_IMAGE_DIR, name)
    if (!sizeCache.has(filepath)) sizeCache.set(filepath, readImageSize(filepath))
    const size = sizeCache.get(filepath)
    if (!size || size.width <= 0 || size.height <= 0) return tag
    return tag.replace(/<img\b/, `<img width="${size.width}" height="${size.height}"`)
  })
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
    return addLocalImageSizes(text.replace(NOTION_IMAGE_URL, (raw) => local.get(raw) ?? raw), rootDir)
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
