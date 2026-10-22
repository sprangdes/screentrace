import assert from 'node:assert/strict';
import test from 'node:test';
import {annotateConditions,expressionList} from './preview-markup.mjs';
test('nested if and all choose branches retain original guarded conditions',()=>{const html=annotateConditions('<c:if test="${outer}"><c:choose><c:when test="${a}"><span>A</span></c:when><c:when test="${b}"><span>B</span></c:when><c:otherwise><span>C</span></c:otherwise></c:choose></c:if>');assert.equal((html.match(/data-st-conditional/g)||[]).length,3);assert.match(html,/&#36;\{outer}/);assert.match(html,/otherwise/);assert.match(html,/&#36;\{a}/);assert.match(html,/&#36;\{b}/);assert.doesNotMatch(html,/<\/?c:(?:if|choose|when|otherwise)/);});
test('comments script text and quoted angle brackets cannot invent condition tags',()=>{const html=annotateConditions('<!-- <c:if test="${fake}"> --><script>"<c:if test=\'${script}\'>"</script><c:if test="${real}"><div title="a > b">R</div></c:if>');assert.equal((html.match(/data-st-conditional/g)||[]).length,1);assert.match(html,/title="a > b"/);assert.doesNotMatch(html,/data-st-condition="[^\"]*fake/);});
test('target reserved attributes cannot spoof the generated guard',()=>{const html=annotateConditions('<div data-st-conditional="true" data-st-condition="fake">X</div><c:if test="${real}"><span data-st-condition="fake">Y</span></c:if>');assert.equal((html.match(/data-st-conditional/g)||[]).length,1);assert.doesNotMatch(html,/fake/);});
test('unknown conditional expression and scriptlet remain in the dynamic list',()=>{assert.deepEqual(expressionList('<div>${fn:unknown(x)}</div><% out.print(value); %>'),['${fn:unknown(x)}','<% out.print(value); %>']);});
test('dynamic expression evidence keeps balanced map literals, quoted braces and deferred EL verbatim',()=>{assert.deepEqual(expressionList('${{"x": {"y": 1}}} #{bean.title} ${fn:unknown("}")}'),['${{"x": {"y": 1}}}','#{bean.title}','${fn:unknown("}")}']);});

test('Struts controls retain spaced bindings and button/reset semantics',async()=>{
 const {convertControls}=await import('./preview-markup.mjs');
 const html=convertControls('<html:form><html:text property = "code"/><html:button property = "go" value = "clear" onclick="clearForm()"/></html:form>');
 assert.match(html,/name\s*=\s*"code"/);assert.match(html,/type="button"/);assert.match(html,/>clear<\/button>/);assert.match(html,/<form[^>]*method="post"/);
});
test('bean:write keeps its already-encoded attributes; only hosts nesting bean:write are rewritten', async () => {
 // chrisekelley/zeprs: <c:when test="${! empty oxytocin}"> around <bean:write property="oxytocin${pos}"/> came out as
 // data-st-condition="[&amp;quot;…", and the in-page JSON.parse skipped 26 screens.
 const {annotateConditions,convertControls}=await import('./preview-markup.mjs');
 const guarded=annotateConditions('<c:if test="${! empty oxytocin}"><bean:write name="oxytocin" property="oxytocin${pos}"/></c:if>');
 const converted=convertControls(guarded);
 assert.equal(converted,guarded);
 assert.match(converted,/data-st-condition="\[&quot;&#36;\{! empty oxytocin\}&quot;\]"/);
 const host=convertControls('<input title="a &amp; b" value="<bean:write name=\'user\' property=\'name\'/>">');
 assert.equal(host,'<input title="a &amp; b" value="${user.name}">');
});
