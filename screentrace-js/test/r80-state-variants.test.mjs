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

test('R80 a write whose branches are all literals is proven, as in a step correction effect', () => {
  const result = run(
    `type Step = 1 | 2 | 3;
     function Fix(){ const [step, setStep] = useState<Step>(1); const [ok, setOk] = useState(false);
       useEffect(() => { if (step === 3 && !ok) setStep(window.flag ? 2 : 1); }, [step, ok]);
       const moveToStep = (n: Step) => { setStep(n); };
       return <div>{step === 1 && <button type="button" onClick={() => moveToStep(2)}>To 2</button>}
         {step === 2 && <button type="button" onClick={() => moveToStep(3)}>To 3</button>}{step === 3 && <p>Three</p>}</div>; }`,
    '<Route path="/fix" element={<Fix/>}/>',
  );
  assert.deepEqual(
    result.screens.filter((s) => s.route === '/fix').map((s) => s.stateVariant?.value),
    [1, 2, 3],
  );
});

test('R80 an otherwise splittable state with an unproven write is reported at that write', () => {
  const result = run(
    `function Odd(){ const [step, setStep] = useState(1);
       return <div>{step === 1 && <button type="button" onClick={() => setStep(2)}>To 2</button>}
         {step === 2 && <input onChange={(e) => setStep(e.target.value)}/>}</div>; }`,
    '<Route path="/odd" element={<Odd/>}/>',
  );
  assert.equal(result.screens.filter((s) => s.route === '/odd').length, 1);
  const found = result.diagnostics.find((d) => d.code === 'REACT_STATE_VARIANT_UNPROVEN');
  assert.ok(found, JSON.stringify(result.diagnostics));
  assert.equal(found.source.line, 3);
});

test('R80 loading states, message states and a wizard inside a closed dialog stay one screen', () => {
  const result = run(
    `function Load(){ const [phase, setPhase] = useState('loading');
       const load = async () => { setPhase('loading'); try { await fetch('/api/x'); setPhase('ready'); } catch { setPhase('error'); } };
       useEffect(() => { void load(); }, []);
       return <div>{phase === 'loading' && <p>Loading</p>}{phase === 'ready' && <button type="button">Item</button>}
         {phase === 'error' && <button type="button" onClick={() => void load()}>Retry</button>}</div>; }
     function Message(){ const [error, setError] = useState('');
       return <div><button type="button" onClick={() => setError('Bad input')}>Check</button>
         {error ? <div role="alert">{error}<button type="button" onClick={() => setError('Still bad')}>Again</button></div> : null}</div>; }
     function Flow(){ const [step, setStep] = useState('request');
       return <div role="dialog" aria-modal="true">{step === 'request' && <button type="button" onClick={() => setStep('otp')}>Send</button>}
         {step === 'otp' && <button type="button" onClick={() => setStep('done')}>Verify</button>}{step === 'done' && <p>Done</p>}</div>; }
     function Settings(){ const [open, setOpen] = useState(false);
       return <section><button type="button" onClick={() => setOpen(true)}>Verify email</button>{open ? <Flow/> : null}</section>; }`,
    '<Route path="/load" element={<Load/>}/><Route path="/message" element={<Message/>}/><Route path="/settings" element={<Settings/>}/>',
  );
  for (const route of ['/load', '/message', '/settings']) {
    const screens = result.screens.filter((s) => s.route === route);
    assert.equal(screens.length, 1, route);
    assert.equal(screens[0].stateVariant, undefined, route);
  }
});
