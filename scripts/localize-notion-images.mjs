#!/usr/bin/env node

/**
 * Notion 이미지 로컬 저장 스크립트 (postbuild)
 *
 * Notion이 주는 이미지 주소는 서명된 임시 URL이라 약 1시간 뒤 만료됩니다.
 * 빌드가 끝난 out/ 폴더에서 Notion 이미지 주소를 찾아 내려받고,
 * out/notion-images/ 에 저장한 뒤 주소를 사이트 안의 파일로 바꿉니다.
 * 내려받기에 실패한 이미지는 원래 주소를 그대로 둡니다.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

const NOTION_IMAGE_URL =
  /https:\/\/(?:prod-files-secure\.s3\.us-west-2\.amazonaws\.com|s3\.us-west-2\.amazonaws\.com\/secure\.notion-static\.com|file\.notion\.so|www\.notion\.so\/image|img\.notionusercontent\.com)(?:[^"'\s<>()\\]|\\u0026|\\u003d)+/g;

const TEXT_EXTENSIONS = new Set(['.html', '.txt', '.xml', '.json', '.rsc']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg']);
const OUTPUT_DIR_NAME = 'notion-images';

/** HTML/JSON 안에 이스케이프된 주소를 실제 주소로 되돌립니다. */
export function decodeUrl(raw) {
  return raw.replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\u003d/g, '=');
}

/** 서명 값이 바뀌어도 같은 이미지는 같은 파일 이름이 되도록 쿼리를 뺀 주소로 이름을 만듭니다. */
export function localFileName(url) {
  const parsed = new URL(url);
  let key = parsed.origin + parsed.pathname;
  let ext = path.extname(parsed.pathname).toLowerCase();
  // www.notion.so/image/<인코딩된 원본 주소> 형태
  if (parsed.pathname.startsWith('/image/')) {
    const inner = decodeURIComponent(parsed.pathname.slice('/image/'.length));
    try {
      const innerUrl = new URL(inner);
      key = innerUrl.origin + innerUrl.pathname;
      ext = path.extname(innerUrl.pathname).toLowerCase();
    } catch {
      // 원본 주소가 아니면 그대로 사용
    }
  }
  if (!IMAGE_EXTENSIONS.has(ext)) ext = '.img';
  if (ext === '.jpeg') ext = '.jpg';
  const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
  return `${hash}${ext}`;
}

/**
 * 바꾼 주소를 원래 주소와 같은 길이로 맞춥니다.
 * React가 1024자 넘는 문자열을 길이 정보와 함께 저장하기 때문에(RSC 'T' 행),
 * 길이가 달라지면 페이지가 열리지 않습니다. 뒤에 쓰지 않는 쿼리를 붙여 길이를 채웁니다.
 * 원래보다 길어지면 null을 돌려주고, 그때는 원래 주소를 그대로 둡니다.
 */
export function padToLength(local, length) {
  if (local.length === length) return local;
  if (local.length > length) return null;
  return `${local}?${'x'.repeat(length - local.length - 1)}`;
}

function listTextFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === OUTPUT_DIR_NAME || entry.name === '_next') continue;
      files.push(...listTextFiles(full));
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

async function defaultDownload(url, filepath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filepath, buffer);
}

/**
 * @param {string} outDir 빌드 결과 폴더
 * @param {{ publicPrefix?: string, download?: (url: string, filepath: string) => Promise<void>, log?: (...a: unknown[]) => void }} options
 */
export async function localizeNotionImages(outDir, options = {}) {
  const { publicPrefix = '', download = defaultDownload, log = console.log } = options;
  const files = listTextFiles(outDir);
  const contents = new Map();
  const rawUrls = new Set();

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const matches = text.match(NOTION_IMAGE_URL);
    if (!matches) continue;
    contents.set(file, text);
    for (const m of matches) rawUrls.add(m);
  }

  if (rawUrls.size === 0) {
    log('🖼️  No Notion images to save');
    return { saved: 0, failed: 0 };
  }

  const imageDir = path.join(outDir, OUTPUT_DIR_NAME);
  fs.mkdirSync(imageDir, { recursive: true });

  const byUrl = new Map(); // 실제 주소 → 사이트 안 주소 (실패 시 null)
  let saved = 0;
  let failed = 0;
  for (const raw of rawUrls) {
    const url = decodeUrl(raw);
    if (byUrl.has(url)) continue;
    let name;
    try {
      name = localFileName(url);
    } catch {
      byUrl.set(url, null);
      continue;
    }
    const filepath = path.join(imageDir, name);
    try {
      if (!fs.existsSync(filepath)) {
        await download(url, filepath);
        saved++;
      }
      byUrl.set(url, `${publicPrefix}/${OUTPUT_DIR_NAME}/${name}`);
    } catch (error) {
      failed++;
      byUrl.set(url, null);
      log(`⚠️  Could not save image, keeping the Notion address: ${error.message}`);
    }
  }

  for (const [file, text] of contents) {
    const next = text.replace(NOTION_IMAGE_URL, (raw) => {
      const url = decodeUrl(raw);
      const local = byUrl.get(url);
      return local ? padToLength(local, url.length) ?? raw : raw;
    });
    if (next !== text) fs.writeFileSync(file, next);
  }

  log(`🖼️  Saved ${saved} Notion image(s) into the site${failed ? `, ${failed} failed` : ''}`);
  return { saved, failed };
}

if (process.argv[1] === __filename) {
  const outDir = path.join(path.dirname(__filename), '..', 'out');
  if (!fs.existsSync(outDir)) {
    console.log('⚠️  out/ not found, skipping Notion image saving');
  } else {
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    await localizeNotionImages(outDir, { publicPrefix: `${siteUrl}${basePath}` });
  }
}
