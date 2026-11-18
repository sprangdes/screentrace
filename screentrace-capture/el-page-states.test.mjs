import test from 'node:test';
import assert from 'node:assert/strict';
import { elPageState } from './el-page-states.mjs';
import { annotateConditions } from './preview-markup.mjs';

test('R99 JSP conditions are classified by EL shape, ordinary ones are not', () => {
  const cases = [
    [['${empty owners}'], 'empty'],
    [['${fn:length(pets) == 0}'], 'empty'],
    [['${list.size() eq 0}'], 'empty'],
    [['${not empty errors}'], 'error'],
    [['${!empty errorMessage}'], 'error'],
    [['${loadError != null}'], 'error'],
    [['${empty errors}'], null],
    [['${not empty owners}'], null],
    [['${user.admin}'], null],
    [["${role == 'ADMIN'}"], null],
    [['${not empty owners and empty pets}'], 'empty'],
    [['otherwise（前述條件皆不成立：${empty owners}）'], null],
  ];
  for (const [conditions, expected] of cases)
    assert.equal(elPageState(conditions), expected, conditions.join(' '));
});

test('R99 the elements of an empty or error block carry the state', () => {
  const out = annotateConditions(
    '<c:if test="${empty owners}"><p id="none">沒有資料</p></c:if><c:if test="${user.admin}"><b id="admin">管理</b></c:if><table id="list"></table>',
  );
  assert.match(out, /<p id="none"[^>]*data-st-state="empty"/);
  assert.doesNotMatch(out, /<b id="admin"[^>]*data-st-state/);
  assert.doesNotMatch(out, /<table id="list"[^>]*data-st-state/);
});
