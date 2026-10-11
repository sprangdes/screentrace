import test from 'node:test';import assert from 'node:assert/strict';import {renderUnsupportedJsfTags} from './unsupported-components.mjs';

test('unparsed JSF controls are shown as fixed placeholders without raw JSF tags or content',()=>{const output=renderUnsupportedJsfTags('<h:form><h:commandButton value="Save"/><h:outputText value="${customer.name}"/></h:form><f:metadata><f:viewParam name="id"/></f:metadata>');assert.doesNotMatch(output,/<\/?(?:h|f):/i);assert.doesNotMatch(output,/Save|customer\.name|viewParam/);assert.equal((output.match(/（JSF 元件，未分析）/g)||[]).length,3);});
