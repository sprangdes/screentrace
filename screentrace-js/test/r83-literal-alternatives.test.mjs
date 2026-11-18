// R83 (ADR 0161): text read from object literals and items of literal arrays with spreads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReact } from '../react/analyzer.mjs';

const ROUTER = "import { Routes, Route, Link } from 'react-router-dom';";
const run = (files) =>
  analyzeReact({
    files: Object.entries(files).map(([file, code]) => ({ file, code })),
    markup: true,
  });
const app = `${ROUTER} import Hero from './Hero'; import { useAuth } from './auth';
  function Home(){ const { me } = useAuth(); const isCustomer = me?.role === 'USER'; return <Hero isCustomer={isCustomer}/>; }
  export default function App(){ return <Routes><Route path="/" element={<Home/>}/></Routes>; }`;
const auth = 'export function useAuth(){ return useContext(Ctx); }';

test('R83 a property of one of two object literals reads as both texts, never the sample value', () => {
  const result = run({
    'src/App.tsx': app,
    'src/auth.ts': auth,
    'src/Hero.tsx': `${ROUTER}
      export default function Hero({ isCustomer }){
        const primary = isCustomer ? { label: '前往預約', to: '/a' } : { label: '開始預約', to: '/b' };
        const odd = isCustomer ? { label: '甲' } : { text: '乙' };
        return <main><Link to={primary.to}>{primary.label}</Link><p>{odd.label}</p></main>;
      }`,
  });
  const screen = result.screens.find((s) => s.route === '/');
  const link = screen.components.find((c) => c.kind === 'LINK');
  assert.equal(link.label, '前往預約 / 開始預約');
  assert.match(screen.markup, />前往預約 \/ 開始預約</);
  // A branch without the property proves nothing: the shared sample value stays.
  assert.match(screen.markup, /<p[^>]*>示例值<\/p>/);
});

test('R83 a literal array with an optional spread renders its literal items one by one', () => {
  const result = run({
    'src/App.tsx': app,
    'src/auth.ts': auth,
    'src/Hero.tsx': `
      export default function Hero({ isCustomer, extra }){
        const sizes = [15, 30, ...(isCustomer ? [extra] : []), ...[45]];
        return <div role="radiogroup">{sizes.map((n) => <label key={n}><input type="radio"/><span>{n} 分鐘</span></label>)}</div>;
      }`,
  });
  const screen = result.screens.find((s) => s.route === '/');
  const radios = screen.components.filter((c) => c.kind === 'RADIO');
  assert.equal(radios.length, 3);
  assert.ok(radios.every((c) => !c.repeated));
  // A field inside <label> is named by the label's text.
  assert.deepEqual(
    radios.map((c) => [c.label, c.labelSource]),
    [
      ['15 分鐘', 'label'],
      ['30 分鐘', 'label'],
      ['45 分鐘', 'label'],
    ],
  );
  assert.deepEqual(
    [...screen.markup.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]),
    ['15 分鐘', '30 分鐘', '45 分鐘'],
  );
});
