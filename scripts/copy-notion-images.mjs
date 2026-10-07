#!/usr/bin/env node

/**
 * 빌드 중에 저장한 Notion 이미지(.notion-images/)를 out/notion-images/ 로 복사합니다. (postbuild)
 * 이미지 주소는 빌드할 때 이미 사이트 안 주소로 바뀌어 있습니다. (src/lib/notion-image-store.ts)
 *
 * 폰 사진처럼 큰 이미지는 모바일에서 스크롤을 버벅이게 하므로,
 * 가로 1600px 보다 크면 줄여서 복사합니다. (sharp 가 없으면 그대로 복사)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, '.notion-images');
const outDir = path.join(root, 'out');
const MAX_WIDTH = 1600;
const RESIZABLE = new Set(['.jpg', '.png', '.webp']);

let sharp = null;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.log('⚠️  sharp not available, copying Notion images at full size');
}

async function copyImage(from, to) {
  const ext = path.extname(from).toLowerCase();
  if (sharp && RESIZABLE.has(ext)) {
    try {
      const img = sharp(from, { failOn: 'none' }).rotate();
      const { width } = await img.metadata();
      if (width && width > MAX_WIDTH) {
        const resized = img.resize({ width: MAX_WIDTH, withoutEnlargement: true });
        if (ext === '.jpg') resized.jpeg({ quality: 82, mozjpeg: true });
        else if (ext === '.png') resized.png({ compressionLevel: 9 });
        else resized.webp({ quality: 82 });
        await resized.toFile(to);
        return true;
      }
    } catch (err) {
      console.log(`⚠️  could not resize ${path.basename(from)}: ${err.message}`);
    }
  }
  fs.copyFileSync(from, to);
  return false;
}

if (!fs.existsSync(outDir)) {
  console.log('⚠️  out/ not found, skipping Notion image copy');
} else if (!fs.existsSync(src)) {
  console.log('🖼️  No Notion images to copy');
} else {
  const dest = path.join(outDir, 'notion-images');
  fs.mkdirSync(dest, { recursive: true });
  const files = fs.readdirSync(src).filter((f) => !f.endsWith('.tmp'));
  let resized = 0;
  for (const f of files) if (await copyImage(path.join(src, f), path.join(dest, f))) resized++;
  console.log(`🖼️  Copied ${files.length} Notion image(s) into the site (${resized} resized)`);
}
