#!/usr/bin/env node

/**
 * 빌드 중에 저장한 Notion 이미지(.notion-images/)를 out/notion-images/ 로 복사합니다. (postbuild)
 * 이미지 주소는 빌드할 때 이미 사이트 안 주소로 바뀌어 있습니다. (src/lib/notion-image-store.ts)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, '.notion-images');
const outDir = path.join(root, 'out');

if (!fs.existsSync(outDir)) {
  console.log('⚠️  out/ not found, skipping Notion image copy');
} else if (!fs.existsSync(src)) {
  console.log('🖼️  No Notion images to copy');
} else {
  const dest = path.join(outDir, 'notion-images');
  fs.mkdirSync(dest, { recursive: true });
  const files = fs.readdirSync(src).filter((f) => !f.endsWith('.tmp'));
  for (const f of files) fs.copyFileSync(path.join(src, f), path.join(dest, f));
  console.log(`🖼️  Copied ${files.length} Notion image(s) into the site`);
}
