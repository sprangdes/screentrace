// Builds ScreenTrace.app for this Mac (ADR 0190). The app keeps no copy of the analyzer: it runs
// the launcher of the checkout it was built from, recorded in install.json.
import { packager } from '@electron/packager';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');

if (process.platform !== 'darwin') {
  console.error('目前只支援在 macOS 建立 ScreenTrace.app。');
  process.exit(2);
}

writeFileSync(
  path.join(here, 'install.json'),
  JSON.stringify({ launcher: path.join(repo, 'bin', 'screentrace') }, null, 2) + '\n',
);

const [output] = await packager({
  dir: here,
  out: path.join(here, 'dist'),
  name: 'ScreenTrace',
  appBundleId: 'io.screentrace.desktop',
  appVersion: '0.1.0',
  icon: path.join(here, 'build', 'icon.icns'),
  platform: 'darwin',
  arch: process.arch,
  asar: true,
  overwrite: true,
  prune: true,
  ignore: [/^\/dist($|\/)/, /^\/build($|\/)/, /\.test\.mjs$/, /^\/package-app\.mjs$/],
});
// The launcher reads the last line.
console.log(path.join(output, 'ScreenTrace.app'));
