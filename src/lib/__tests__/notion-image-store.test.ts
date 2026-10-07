import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createImageStore, localFileName, readImageSize } from '../notion-image-store'

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

  it('writes the image size on img tags so the page does not jump while scrolling', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-'))
    // 가로 1200, 세로 800 짜리 PNG 머리말
    const png = Buffer.alloc(33)
    png.writeUInt32BE(0x89504e47, 0)
    png.writeUInt32BE(1200, 16)
    png.writeUInt32BE(800, 20)
    const store = createImageStore({ rootDir: dir, publicPrefix: '', download: async (_u, f) => fs.writeFileSync(f, png) })
    const out = await store.localize({ html: `<figure><img\n  src="${signed.replace(/&/g, '&amp;')}"\n  loading="lazy"></figure>`, cover: signed })
    const local = `/notion-images/${localFileName(signed)}`
    expect(out.html).toBe(`<figure><img width="1200" height="800"\n  src="${local}"\n  loading="lazy"></figure>`)
    expect(out.cover).toBe(local)
  })

  it('reads sizes from PNG, GIF and JPEG headers', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-'))
    const gif = Buffer.from('GIF89a\x40\x01\xf0\x00', 'binary')
    fs.writeFileSync(path.join(dir, 'a.gif'), gif)
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0, 0, 0])
    fs.writeFileSync(path.join(dir, 'a.jpg'), jpg)
    fs.writeFileSync(path.join(dir, 'x.img'), 'x')
    expect(readImageSize(path.join(dir, 'a.gif'))).toEqual({ width: 320, height: 240 })
    expect(readImageSize(path.join(dir, 'a.jpg'))).toEqual({ width: 640, height: 480 })
    expect(readImageSize(path.join(dir, 'x.img'))).toBeNull()
  })
})
