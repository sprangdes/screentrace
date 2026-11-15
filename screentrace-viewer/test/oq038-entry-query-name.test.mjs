import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
import { node } from './fixture.mjs';
test('OQ-038 a query-entry variant is named apart by its entry query while the plain entry keeps its name', async () => {
  const m = await ownModule('names');
  const plain = node('plain', 'SCREEN', 'signin', { view: 'SignIn', route: '/signin' }),
    query = node('query', 'SCREEN', 'signin', {
      view: 'SignIn',
      route: '/signin',
      entryQuery: 'sso=err|ok',
    });
  const hints = new Map([
      ['plain', { heading: 'Sign in' }],
      ['query', { heading: 'Sign in' }],
    ]),
    routes = new Map([
      ['plain', ['/signin']],
      ['query', ['/signin']],
    ]);
  const names = m.screenNames([plain, query], hints, routes);
  assert.equal(names.get('plain'), 'Sign in');
  assert.equal(names.get('query'), 'Sign in（?sso=err|ok）');
});

test('RV-607 plain screens sharing a name with a query-entry variant are still named apart', async () => {
  const m = await ownModule('names');
  const login = node('login', 'SCREEN', 'login', { view: 'auth/login.jsp', route: '/login' }),
    admin = node('admin', 'SCREEN', 'login', { view: 'admin/login.jsp', route: '/admin/login' }),
    query = node('query', 'SCREEN', 'login', {
      view: 'auth/login.jsp',
      route: '/login',
      entryQuery: 'error=1',
    });
  const hints = new Map([
      ['login', { heading: 'Sign in' }],
      ['admin', { heading: 'Sign in' }],
      ['query', { heading: 'Sign in' }],
    ]),
    routes = new Map([
      ['login', ['/login']],
      ['admin', ['/admin/login']],
      ['query', ['/login']],
    ]);
  const names = m.screenNames([login, admin, query], hints, routes);
  assert.equal(names.get('query'), 'Sign in（?error=1）');
  assert.notEqual(names.get('login'), names.get('admin'));
  assert.equal(new Set(names.values()).size, 3);
});
