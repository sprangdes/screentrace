import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(`${root}${path}`, 'utf8');

test('requirements preserve the instructions sections 1 and 2 verbatim', () => {
  const instructions = read('docs/CODEX_INSTRUCTIONS.md');
  const requirements = instructions.slice(instructions.indexOf('## 1.'), instructions.indexOf('## 3.'));
  assert.equal(read('docs/REQUIREMENTS.md'), requirements);
});

test('architecture documents every actual Maven module and marks absent modules as planned', () => {
  const modules = [...read('pom.xml').matchAll(/<module>([^<]+)<\/module>/g)].map(match => match[1]);
  const architecture = read('docs/ARCHITECTURE.md');
  for (const module of [...modules, 'screentrace-capture']) {
    assert.ok(existsSync(`${root}${module}`));
    assert.ok(architecture.includes(`### ${module}\n`), module);
  }
  for (const absent of ['screentrace-parser', 'screentrace-analyzer', 'screentrace-server', 'screentrace-ui']) {
    assert.ok(architecture.includes(`### ${absent}（規劃中）`), absent);
  }
});

test('roadmap tracks WP0 through WP10 and the four instruction milestones', () => {
  const roadmap = read('docs/ROADMAP.md');
  for (let wp = 0; wp <= 10; wp++) assert.match(roadmap, new RegExp(`\\| WP${wp} \\|`));
  for (let milestone = 1; milestone <= 4; milestone++) assert.match(roadmap, new RegExp(`\\| M${milestone} \\|`));
  assert.ok(!roadmap.includes('Phase 0'));
  assert.ok(!roadmap.includes('Recommended First Codex Task'));
});

test('baseline and open questions are available and linked from the workflow', () => {
  assert.match(read('docs/BASELINE.md'), /mvn test/);
  assert.match(read('docs/BASELINE.md'), /report-design/);
  assert.match(read('docs/OPEN_QUESTIONS.md'), /編號/);
  assert.match(read('AGENTS.md'), /Read `docs\/CODEX_INSTRUCTIONS.md`/);
});
