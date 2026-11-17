// R79 (ADR 0157): React elements that print data are display fields; fixed text and markup are not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReact } from '../react/analyzer.mjs';

const ROUTER = "import { Routes, Route } from 'react-router-dom';";
const run = (files) =>
  analyzeReact({ files: Object.entries(files).map(([file, code]) => ({ file, code })) });

test('R79 printed data becomes a display field named by its leading label or property', () => {
  const result = run({
    'src/App.tsx': `${ROUTER} import Owner from './Owner';
      export default function App(){ return <Routes><Route path="/owner" element={<Owner/>}/></Routes>; }`,
    'src/Owner.tsx': `const TITLES = { a: '飼主資料' };
      export default function Owner({ owner, pets }){
        const panel = <aside>側欄</aside>;
        return <main>
          <h1>{TITLES.a}</h1>
          <p>姓名：{owner.lastName}</p>
          <span>{owner?.address?.city}</span>
          <div>{panel}</div>
          <ul>{pets.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
          <button type="button">{owner.label}</button>
        </main>;
      }`,
  });
  const screen = result.screens.find((s) => s.route === '/owner');
  const fields = screen.components
    .filter((c) => c.kind === 'DISPLAY_FIELD')
    .sort((a, b) => a.line - b.line);
  assert.deepEqual(
    fields.map((c) => [c.tag, c.label, c.labelSource, c.attrs.property, c.attrs.expression]),
    [
      ['p', '姓名', 'leadingText', 'owner.lastName', 'owner.lastName'],
      ['span', 'owner.address.city', 'property', 'owner.address.city', 'owner?.address?.city'],
      ['li', 'p.name', 'property', 'p.name', 'p.name'],
    ],
  );
  // Inside a list the field is one component, marked repeated.
  assert.equal(fields[2].repeated, true);
  // A button that prints data stays a button.
  assert.ok(screen.components.some((c) => c.kind === 'BUTTON'));
});
