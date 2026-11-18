import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
import { node } from './fixture.mjs';
test('R80 the steps of one page are named with the page state they show', async () => {
  const m = await ownModule('names');
  const steps = [1, 2, 3].map((v) =>
    node(`s${v}`, 'SCREEN', 'reservation/new', {
      view: 'BookingFlowPage',
      route: '/reservation/new',
      stateVariant: `step = ${v}`,
    }),
  );
  const other = node('other', 'SCREEN', 'reservations', {
    view: 'ReservationsPage',
    route: '/reservations',
  });
  const hints = new Map([
    ...steps.map((s) => [s.id, { heading: '建立預約' }]),
    ['other', { heading: '我的預約' }],
  ]);
  const routes = new Map([
    ...steps.map((s) => [s.id, ['/reservation/new']]),
    ['other', ['/reservations']],
  ]);
  const names = m.screenNames([...steps, other], hints, routes);
  assert.equal(names.get('s1'), '建立預約（step = 1）');
  assert.equal(names.get('s2'), '建立預約（step = 2）');
  assert.equal(names.get('s3'), '建立預約（step = 3）');
  assert.equal(names.get('other'), '我的預約');
});
