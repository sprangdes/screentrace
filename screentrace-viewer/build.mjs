import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
// Latin and digits in Inter and JetBrains Mono, embedded so the offline report needs no network (ADR 0189);
// Chinese text keeps the system fonts. Only the Latin subsets of the weights the viewer uses are included.
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
async function fontFaces() {
  const faces = [
    ['inter', 'Inter', [400, 600, 700]],
    ['jetbrains-mono', 'JetBrains Mono', [400]],
  ];
  let css = '';
  for (const [pkg, family, weights] of faces) {
    const license = (
      await readFile(new URL(`./node_modules/@fontsource/${pkg}/LICENSE`, import.meta.url), 'utf8')
    ).trim();
    css += `/*\n${family} (SIL Open Font License 1.1)\n${license.replaceAll('*/', '* /')}\n*/\n`;
    for (const weight of weights) {
      const file = await readFile(
        new URL(
          `./node_modules/@fontsource/${pkg}/files/${pkg}-latin-${weight}-normal.woff2`,
          import.meta.url,
        ),
      );
      css += `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${file.toString('base64')}) format('woff2');unicode-range:${LATIN}}\n`;
    }
  }
  return css;
}
const result = await build({
  entryPoints: [fileURLToPath(new URL('./src/main.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox120', 'safari17'],
  minify: true,
  charset: 'ascii',
  legalComments: 'none',
});
const license = (
  await readFile(new URL('./node_modules/acorn/LICENSE', import.meta.url), 'utf8')
).trim();
const notice = '\n/*\n' + license.replaceAll('*/', '* /') + '\n*/\n';
const script = result.outputFiles[0].text + notice;
const pom = await readFile(new URL('../pom.xml', import.meta.url), 'utf8');
const version = pom.match(/<version>([^<]+)<\/version>/)?.[1];
if (!version) throw Error('Missing tool version');
if (/<\/script/i.test(script)) throw Error('Bundle contains an unsafe script terminator');
for (const [name, content] of [
  ['viewer.version', version],
  ['viewer.js', script],
  ['viewer.sha256', createHash('sha256').update(script).digest('base64')],
  ['template.html', await readFile(new URL('./src/template.html', import.meta.url), 'utf8')],
  [
    'viewer.css',
    (await fontFaces()) + (await readFile(new URL('./src/viewer.css', import.meta.url), 'utf8')),
  ],
])
  await writeFile(new URL('./dist/' + name, import.meta.url), content);
const md = await build({
  entryPoints: [fileURLToPath(new URL('./src/shared/review-md.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  charset: 'ascii',
  legalComments: 'none',
});
await writeFile(new URL('./dist/review-md.mjs', import.meta.url), md.outputFiles[0].text + notice);
