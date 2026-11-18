import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReact } from '../react/analyzer.mjs';

// R80: a proven page state whose steps advance from inside themselves splits the route into screen variants.
const HEAD =
  "import { Routes, Route, Link } from 'react-router-dom'; import { useState } from 'react';";
const run = (body, routes) =>
  analyzeReact({
    files: [
      {
        file: 'src/App.tsx',
        code: `${HEAD} ${body} function App(){ return <Routes>${routes}</Routes>; }`,
      },
    ],
    markup: true,
  });
const WIZARD = `type Step = 1 | 2 | 3;
function Wizard(){ const [step, setStep] = useState<Step>(1);
  const moveToStep = (nextStep: Step) => { setStep(nextStep); };
  return <div><h1>New</h1>
    {step === 1 && <section><h2>Service</h2><button type="button" onClick={() => moveToStep(2)}>Next</button></section>}
    {step === 2 && <section><h2>Date</h2><button type="button" onClick={() => moveToStep(1)}>Back</button><button type="button" onClick={() => moveToStep(3)}>Next</button></section>}
    {step === 3 && <section><h2>Confirm</h2><button type="button" onClick={() => { fetch('/api/reservations', { method: 'POST' }); }}>Submit</button></section>}
  </div>; }`;

test('R80 each step is a screen variant whose preview shows that step', () => {
  const result = run(WIZARD, '<Route path="/new" element={<Wizard/>}/>');
  const steps = result.screens.filter((s) => s.route === '/new');
  assert.deepEqual(
    steps.map((s) => [s.stateVariant.value, s.stateKey ?? null]),
    [
      [1, null],
      [2, 'step=2'],
      [3, 'step=3'],
    ],
  );
  assert.ok(steps[0].markup.includes('Service') && !steps[0].markup.includes('Date'));
  assert.ok(steps[1].markup.includes('Date') && !steps[1].markup.includes('Confirm'));
  assert.ok(steps[2].markup.includes('Confirm'));
  assert.deepEqual(steps[0].excluded, []);
});

test('R80 setter writes become navigations to the step they set', () => {
  const result = run(WIZARD, '<Route path="/new" element={<Wizard/>}/>');
  const [, two] = result.screens.filter((s) => s.route === '/new');
  const targets = two.components
    .filter((c) => c.label === 'Back' || c.label === 'Next')
    .map((c) => [c.label, c.behaviors.map((e) => e.targetScreens?.[0]?.stateKey ?? null)]);
  assert.deepEqual(targets.sort(), [
    ['Back', [null]],
    ['Next', ['step=3']],
  ]);
});

test('R80 functional updates, always-visible tabs and unproven writes stay one screen', () => {
  const result = run(
    `function Inc(){ const [step, setStep] = useState(1);
       return <div>{step === 1 && <button type="button" onClick={() => setStep((s) => s + 1)}>Next</button>}{step === 2 && <p>Two</p>}</div>; }
     function Tabs(){ const [tab, setTab] = useState('a');
       return <div><button type="button" onClick={() => setTab('a')}>A</button><button type="button" onClick={() => setTab('b')}>B</button>{tab === 'a' ? <p>A</p> : <button type="button">Only B</button>}</div>; }
     function Typed(){ const [step, setStep] = useState(1);
       return <div>{step === 1 && <input onChange={(e) => setStep(e.target.value)}/>}{step === 2 && <p>Two</p>}</div>; }`,
    '<Route path="/inc" element={<Inc/>}/><Route path="/tabs" element={<Tabs/>}/><Route path="/typed" element={<Typed/>}/>',
  );
  for (const route of ['/inc', '/tabs', '/typed']) {
    const screens = result.screens.filter((s) => s.route === route);
    assert.equal(screens.length, 1, route);
    assert.equal(screens[0].stateVariant, undefined, route);
  }
});

test('R80 two qualifying states on one route are reported, not split', () => {
  const result = run(
    `function Two(){ const [a, setA] = useState(1); const [b, setB] = useState('x');
       return <div>{a === 1 && <button type="button" onClick={() => setA(2)}>A next</button>}{a === 2 && <p>A2</p>}
         {b === 'x' && <button type="button" onClick={() => setB('y')}>B next</button>}{b === 'y' && <p>By</p>}</div>; }`,
    '<Route path="/two" element={<Two/>}/>',
  );
  assert.equal(result.screens.filter((s) => s.route === '/two').length, 1);
  assert.ok(result.diagnostics.some((d) => d.code === 'REACT_STATE_VARIANTS_MULTIPLE'));
});

test('R80 links from other screens open the initial step', () => {
  const result = run(
    `${WIZARD} function Home(){ return <Link to="/new">Book</Link>; }`,
    '<Route path="/" element={<Home/>}/><Route path="/new" element={<Wizard/>}/>',
  );
  const home = result.screens.find((s) => s.route === '/');
  const link = home.components.find((c) => c.label === 'Book').behaviors[0];
  assert.deepEqual(link.targetRoutes, ['/new']);
  assert.ok(!(link.targetScreens ?? []).some((t) => t.stateKey));
});
