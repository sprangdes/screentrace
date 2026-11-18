import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
import { node } from './fixture.mjs';

test('R85 query and state variants read in plain words', async () => {
  const m = await ownModule('names');
  assert.equal(m.queryText('lineLogin=failed|success'), '網址帶 lineLogin=failed 或 success');
  assert.equal(m.queryText('a=1&b=x|y'), '網址帶 a=1、b=x 或 y');
  assert.equal(m.stateText('step = 2'), 'step 為 2');
  assert.equal(m.stateText('tab === "list"'), 'tab 為 "list"');
});

test('R85 screens sharing a heading are told apart by their roles before their routes or files', async () => {
  const m = await ownModule('names');
  const merchant = node('merchant', 'SCREEN', 'notifications', {
      view: 'MerchantNotificationsPage',
    }),
    customer = node('customer', 'SCREEN', 'notifications', { view: 'NotificationsPage' }),
    hints = new Map([
      ['merchant', { heading: '通知中心' }],
      ['customer', { heading: '通知中心' }],
    ]),
    routes = new Map([
      ['merchant', ['/notifications']],
      ['customer', ['/notifications']],
    ]);
  assert.deepEqual(
    [
      ...m.screenNames([merchant, customer], hints, routes, {
        roles: new Map([
          ['merchant', ['商家']],
          ['customer', ['顧客']],
        ]),
      }),
    ],
    [
      ['customer', '通知中心（顧客）'],
      ['merchant', '通知中心（商家）'],
    ],
  );
  // Without roles the file name still tells them apart.
  assert.equal(
    m.screenNames([merchant, customer], hints, routes).get('merchant'),
    '通知中心（Merchant Notifications Page）',
  );
});

test('R85 a screen without a title is named by the link specific to it, not a shared logo link', async () => {
  const m = await ownModule('names');
  const dashboard = node('dash', 'SCREEN', 'dashboard', { view: 'CustomerDashboardPage' }),
    home = node('home', 'SCREEN', 'home', { view: 'HomePage' }),
    hints = new Map([['home', { heading: '首頁' }]]),
    routes = new Map([
      ['dash', ['/dashboard']],
      ['home', ['/']],
    ]);
  const linkLabels = new Map([
    [
      'dash',
      [
        { label: 'Reservio', from: 'a' },
        { label: 'Reservio', from: 'b' },
        { label: '概覽', from: 'a' },
        { label: '<Link>', from: 'c' },
      ],
    ],
    ['home', [{ label: 'Reservio', from: 'c' }]],
  ]);
  const names = m.screenNames([dashboard, home], hints, routes, { linkLabels });
  assert.equal(names.get('dash'), '概覽');
  assert.equal(names.get('home'), '首頁');
  assert.equal(
    m.screenNames([dashboard], new Map(), routes).get('dash'),
    'Customer Dashboard Page',
  );
});

test('R102 when no single fact tells same-named screens apart, the first pair that does is used', async () => {
  const m = await ownModule('names');
  const screens = [
    node('settings', 'SCREEN', 'a', { view: 'SettingsPage' }),
    node('customer', 'SCREEN', 'b', { view: 'CustomerPage' }),
    node('merchant', 'SCREEN', 'c', { view: 'ScaffoldPage' }),
  ];
  const hints = new Map(screens.map((s) => [s.id, { heading: '通知設定' }]));
  const routes = new Map([
    ['settings', ['/business/settings/notifications']],
    ['customer', ['/notifications/settings']],
    ['merchant', ['/notifications/settings']],
  ]);
  const roles = new Map([
    ['settings', ['商家']],
    ['customer', ['顧客']],
    ['merchant', ['商家']],
  ]);
  const names = m.screenNames(screens, hints, routes, { roles });
  assert.equal(names.get('customer'), '通知設定（顧客）');
  assert.equal(names.get('merchant'), '通知設定（商家・/notifications/settings）');
  assert.equal(names.get('settings'), '通知設定（/business/settings/notifications）');
});
