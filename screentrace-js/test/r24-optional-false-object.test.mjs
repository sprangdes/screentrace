import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atoms, contradicts, implied } from '../react/audience.mjs';
import { verdict } from '../react/personas.mjs';
const a = (expression) => atoms(expression, { file: 'a.tsx', line: 2 });

test('R24 optional access on a false object is undefined, so it cannot be true', () => {
  assert.ok(contradicts([...a('!me'), ...a('me?.mustChangePassword')]));
  assert.ok(contradicts([...a('!me'), ...a('me?.profile.done')]), 'the whole chain short-circuits');
  assert.ok(!contradicts([...a('!me'), ...a('!me?.mustChangePassword')]));
  assert.equal(implied(a('!me'), '!(me?.mustChangePassword)'), true);
  assert.equal(implied(a('!me'), 'me?.mustChangePassword'), false);
});

test('R24 the rule stays narrow: inherited names, computed keys, deeper optional hops and a true object are untouched', () => {
  assert.ok(!contradicts([...a('!me'), ...a('me?.toString')]), 'false?.toString is a function');
  assert.ok(!contradicts([...a('!me'), ...a('me?.length')]));
  assert.ok(!contradicts([...a('!me'), ...a('me?.[key]')]));
  assert.ok(!contradicts([...a('!me'), ...a('other?.flag')]));
  assert.ok(!contradicts([...a('me'), ...a('me?.flag')]));
  assert.ok(
    !contradicts([...a('!me.account'), ...a('me.account?.flag')]),
    'only an identifier known to be false',
  );
  assert.equal(implied(a('me'), '!(me?.mustChangePassword)'), null);
});

test('R24 a signed-out persona now proves app-wide guards written with optional access', () => {
  const guest = [...a('!loading'), ...a('!me')];
  const audience = [
    {
      text: '(!(me?.mustChangePassword) || location.pathname === "/force-change-password")',
      truth: true,
      source: { file: 'App.tsx', line: 57 },
    },
    {
      text: '(((loading || !(me?.role === "ROLE_BUSINESS")) || me.business) || allowPaths.includes(location.pathname))',
      truth: true,
      source: { file: 'App.tsx', line: 69 },
    },
    ...a('!loading'),
    ...a('!me'),
  ];
  assert.equal(verdict(guest, audience, []), 'APPLIES');
  assert.equal(
    verdict([...a('!loading'), ...a('me')], audience.slice(0, 2), []),
    'UNKNOWN',
    'a signed-in persona without the role facts stays unknown',
  );
});
