import fs from 'fs';
import os from 'os';
import path from 'path';
import { localizeNotionImages, padToLength } from '../localize-notion-images.mjs';

describe('localizeNotionImages', () => {
  it('keeps the original length so long RSC text rows still parse', async () => {
    const url = `https://www.notion.so/image/${encodeURIComponent('https://prod-files-secure.s3.us-west-2.amazonaws.com/a/b/pong.png')}?table=block&id=1&width=400&sig=${'s'.repeat(1100)}`;
    const escaped = url.replace(/&/g, '\\u0026');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-'));
    const row = `5:T${url.length.toString(16)},${url}`;
    fs.writeFileSync(path.join(dir, 'index.txt'), row);
    fs.writeFileSync(path.join(dir, 'index.html'), `<img src="${url.replace(/&/g, '&amp;')}"><script>push("${escaped}")</script>`);

    await localizeNotionImages(dir, { publicPrefix: 'https://pong.test', download: async (_u, f) => fs.writeFileSync(f, 'x'), log: () => {} });

    const txt = fs.readFileSync(path.join(dir, 'index.txt'), 'utf8');
    const [, len, body] = txt.match(/^5:T([0-9a-f]+),(.*)$/)!;
    expect(body.length).toBe(parseInt(len, 16));
    expect(body.startsWith('https://pong.test/notion-images/')).toBe(true);
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    const pushed = html.match(/push\("([^"]*)"\)/)![1];
    expect(pushed.length).toBe(url.length);
    expect(html).not.toContain('notion.so');
  });

  it('pads with an unused query and refuses to grow', () => {
    expect(padToLength('/a.png', 6)).toBe('/a.png');
    expect(padToLength('/a.png', 10)).toBe('/a.png?xxx');
    expect(padToLength('/a.png', 3)).toBeNull();
  });
});
