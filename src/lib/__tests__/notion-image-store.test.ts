import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createImageStore, localFileName } from '../notion-image-store'

const signed = 'https://prod-files-secure.s3.us-west-2.amazonaws.com/ws/abc/pong.png?X-Amz-Signature=1&X-Amz-Date=2'
const wrapped = `https://www.notion.so/image/${encodeURIComponent(signed)}?table=block&id=1&width=400`

describe('notion image store', () => {
  it('replaces Notion image addresses everywhere in the data before rendering', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-'))
    const downloaded: string[] = []
    const store = createImageStore({
      rootDir: dir,
      publicPrefix: 'https://pong.test',
      download: async (url, f) => { downloaded.push(url); fs.writeFileSync(f, 'x') },
    })
    const data = {
      profileImage: wrapped,
      html: `<p>hi</p><img src="${signed.replace(/&/g, '&amp;')}"><img src="${signed.replace(/&/g, '&amp;')}">`,
      posts: [{ coverImageUrl: wrapped, date: new Date(0) }],
      count: 2,
    }
    const out = await store.localize(data)
    const local = `https://pong.test/notion-images/${localFileName(signed)}`
    expect(out.profileImage).toBe(local)
    expect(out.posts[0].coverImageUrl).toBe(local)
    expect(out.html).toBe(`<p>hi</p><img src="${local}"><img src="${local}">`)
    expect(out.posts[0].date).toBeInstanceOf(Date)
    expect(out.count).toBe(2)
    expect(downloaded).toHaveLength(1)
    expect(fs.existsSync(path.join(dir, '.notion-images', localFileName(signed)))).toBe(true)
  })

  it('keeps the Notion address when the download fails', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-'))
    const store = createImageStore({ rootDir: dir, download: async () => { throw new Error('403') } })
    expect(await store.localize({ a: signed })).toEqual({ a: signed })
  })
})
