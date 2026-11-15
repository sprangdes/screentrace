import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../analyzer.mjs';
import { parseSource } from '../parser.mjs';

const dom = [
  { id: 'b', componentId: 'b', tag: 'button', attrs: { id: 'go' } },
  { id: 'e', componentId: 'e', tag: 'input', attrs: { id: 'email', name: 'email' } },
];
const run = (code, sources) =>
  analyze({ sources: sources ?? [{ file: 'page.js', code, screenId: 's' }], dom });
const behaviors = (code) => run(code).behaviors;

test('only axios request calls are API calls (RV-505)', () => {
  const found = behaviors(
    "var c = axios.create({baseURL:'/api'}); axios.interceptors.request.use(function(x){return x;});" +
      "document.getElementById('go').addEventListener('click', function(){ axios.post('/save', {}); axios.request({url:'/r', method:'put'}); });",
  ).filter((b) => b.type === 'CALL_API');
  assert.deepEqual(found.map((b) => [b.method, b.url]).sort(), [
    ['POST', '/save'],
    ['PUT', '/r'],
  ]);
});

test('the same effect in two inline scripts of one page keeps both (RV-506)', () => {
  const code =
    "document.getElementById('go').addEventListener('click', function(){ alert('x'); });";
  const ids = run(null, [
    { file: 'page.jsp', code, screenId: 's', line: 1 },
    { file: 'page.jsp', code, screenId: 's', line: 9 },
  ]).behaviors.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, ids.join());
});

test('$(window).load(fn) runs its handler on load (RV-507)', () => {
  const found = behaviors("$(window).load(function(){ location.href = '/next'; });");
  assert.ok(found.some((b) => b.type === 'NAVIGATE' && b.url === '/next' && b.event === 'load'));
  assert.ok(!found.some((b) => b.type === 'UNKNOWN'), JSON.stringify(found));
});

test('a validator assigned to a variable yields rules (RV-508)', () => {
  const rules = run(
    "var validateEmail = function(){ if ($('#email').val() === '') { alert('必填'); return false; } }; $('#go').click(function(){ validateEmail(); });",
  ).rules;
  assert.ok(
    rules.some((r) => r.kind === 'custom' && r.fields.includes('e')),
    JSON.stringify(rules),
  );
});

test('a destructured parameter shadows an outer variable (RV-514)', () => {
  const found = behaviors(
    "var url = '/home'; function go({url}){ location.href = url; } document.getElementById('go').addEventListener('click', function(){ go({url: '/admin'}); });",
  );
  assert.ok(
    !found.some((b) => b.type === 'NAVIGATE' && b.url === '/home' && b.status === 'CONFIRMED'),
  );
});

test('numeric addition stays numeric across a chain (RV-517)', () => {
  const found = behaviors(
    "document.getElementById('go').addEventListener('click', function(){ location.href = '/page/' + (1 + 2 + 3); });",
  );
  assert.ok(
    found.some((b) => b.url === '/page/6'),
    JSON.stringify(found.map((b) => b.url)),
  );
});

test('option and computed properties are not event bindings (RV-518)', () => {
  const found = behaviors(
    "var opts = {}; opts.onSuccess = function(){ location.href = '/x'; }; var user = {}; user.online = true;",
  );
  assert.ok(!found.some((b) => ['Success', 'line'].includes(b.event)), JSON.stringify(found));
});

test('a quote inside a regex literal does not hide a later JSP expression (RV-519)', () => {
  const parsed = parseSource({
    file: 'page.jsp',
    code: "var s = t.replace(/'/g, 'x'); var n = ${count} + 1;",
  });
  assert.equal(parsed.status, 'CONFIRMED');
});

test('a script file shared by two screens keeps the same IDs on both (RV-506)', () => {
  const code =
    "document.getElementById('go').addEventListener('click', function(){ alert('x'); });";
  const ids = run(null, [
    { file: 'shared.js', code, screenId: 's1' },
    { file: 'shared.js', code, screenId: 's2' },
  ]).behaviors.map((b) => b.id);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length / 2, ids.join());
});
