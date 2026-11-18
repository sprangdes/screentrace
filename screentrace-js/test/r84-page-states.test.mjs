// R84 (ADR 0162): loading, error and empty content is marked by the conditions it renders under.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageState } from '../react/page-states.mjs';
import { analyzeReact } from '../react/analyzer.mjs';

test('R84 conditions are classified by parsed shape, and ordinary conditions are not', () => {
  const cases = [
    [['loading'], 'loading'],
    [['state.isLoading'], 'loading'],
    [['!(loaded)'], 'loading'],
    [['!ready'], 'loading'],
    [['loadError'], 'error'],
    [['state.error'], 'error'],
    [['status === "failed"'], 'error'],
    [['items.length === 0'], 'empty'],
    [['!(rows.length)'], 'empty'],
    [['list.length < 1'], 'empty'],
    [['isEmpty'], 'empty'],
    [['!(loading)'], null],
    [['!(loading) && !(error)'], null],
    [['!(loading) && !(error) && items.length === 0'], 'empty'],
    [['role === "ADMIN"'], null],
    [['me'], null],
    [['pendingCount > 0'], null],
    [['(('], null],
    [['me', 'loading'], 'loading'],
    // R99: more names for the same states.
    [['query.isPending'], 'loading'],
    [['isSubmitting'], 'loading'],
    [['status === "busy"'], 'loading'],
    [['state === "rejected"'], 'error'],
    [['noResults'], 'empty'],
    [['hasNoItems'], 'empty'],
    [['pendingReservations.length > 0'], null],
  ];
  for (const [guards, expected] of cases)
    assert.equal(pageState(guards), expected, guards.join(' && '));
});

test('R84 the outermost element of each state is marked in the preview markup', () => {
  const result = analyzeReact({
    markup: true,
    files: [
      {
        file: 'src/App.tsx',
        code: `import { Routes, Route } from 'react-router-dom'; import P from './P';
          export default function App(){ return <Routes><Route path="/" element={<P/>}/></Routes>; }`,
      },
      {
        file: 'src/P.tsx',
        code: `export default function P(){
          const [loading, setLoading] = useState(true); const [error, setError] = useState('');
          const [items, setItems] = useState([]); const { role } = useAuth();
          useEffect(() => { load().then(setItems).catch(() => setError('x')).finally(() => setLoading(false)); }, []);
          return <main>
            {loading && <div className="skeleton"><span>載入中</span></div>}
            {error ? <p>暫時無法載入</p> : null}
            {!loading && !error && items.length === 0 && <p>目前沒有資料</p>}
            {role === 'ADMIN' && <button>管理</button>}
          </main>;
        }`,
      },
    ],
  });
  const markup = result.screens
    .find((s) => s.route === '/')
    .markup.replace(/ data-st-(source-[a-z]+|expansion-anchor)="[^"]*"/g, '');
  assert.equal(
    markup,
    '<main><div class="skeleton" data-st-state="loading"><span>載入中</span></div><p data-st-state="error">暫時無法載入</p><p data-st-state="empty">目前沒有資料</p><button>管理</button></main>',
  );
});
