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

test('R106 Thymeleaf utility objects and negated th:unless are classified', async () => {
  const { thymeleafPageState } = await import('./el-page-states.mjs');
  assert.equal(elPageState(['${#lists.isEmpty(orders)}']), 'empty');
  assert.equal(elPageState(['*{#lists.size(items) == 0}']), 'empty');
  assert.equal(elPageState(["${#fields.hasErrors('*')}"]), 'error');
  assert.equal(elPageState(['${!#lists.isEmpty(orders)}']), null);
  assert.equal(thymeleafPageState('${param.error}'), 'error');
  assert.equal(thymeleafPageState(undefined, '${not #lists.isEmpty(orders)}'), 'empty');
  assert.equal(thymeleafPageState(undefined, '${not empty orders}'), 'empty');
  // th:unless without a negation shows its content when the list has rows: the data state.
  assert.equal(thymeleafPageState(undefined, '${orders.empty}'), null);
  assert.equal(thymeleafPageState('${user.admin}'), null);
});

test('R106 Struts logic tags and Thymeleaf attributes mark their blocks, tags stay as written', () => {
  const out = annotateConditions(
    '<logic:empty name="orders"><p id="none">沒有訂單</p></logic:empty>' +
      '<logic:messagesPresent><ul id="errors"><li id="item">錯誤</li></ul></logic:messagesPresent>' +
      '<logic:messagesPresent message="true"><p id="info">已儲存</p></logic:messagesPresent>' +
      '<logic:equal name="user" property="role" value="ADMIN"><b id="admin">管理</b></logic:equal>' +
      '<table id="list"></table>' +
      '<div id="th-empty" th:if="${#lists.isEmpty(orders)}">沒有資料</div>' +
      '<div id="th-error" th:if="${param.error}">登入失敗</div>' +
      '<div id="th-list" th:unless="${#lists.isEmpty(orders)}">清單</div>' +
      '<p id="spoof" data-st-state="error">一般內容</p>',
  );
  assert.match(out, /<logic:empty name="orders">/);
  assert.match(out, /<p id="none"[^>]*data-st-state="empty"/);
  assert.match(out, /<ul id="errors"[^>]*data-st-state="error"/);
  assert.match(out, /<li id="item"[^>]*data-st-state="error"/);
  assert.doesNotMatch(out, /<p id="info"[^>]*data-st-state/);
  assert.doesNotMatch(out, /<b id="admin"[^>]*data-st-state/);
  assert.doesNotMatch(out, /<table id="list"[^>]*data-st-state/);
  assert.match(out, /<div id="th-empty"[^>]*data-st-state="empty"/);
  assert.match(out, /<div id="th-error"[^>]*data-st-state="error"/);
  assert.doesNotMatch(out, /<div id="th-list"[^>]*data-st-state/);
  // A state written in the source is not trusted.
  assert.doesNotMatch(out, /<p id="spoof"[^>]*data-st-state/);
  // Logic blocks are not turned into shown conditions.
  assert.doesNotMatch(out, /<p id="none"[^>]*data-st-conditional/);
});
