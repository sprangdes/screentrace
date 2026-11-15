import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { propertyMap, loadStrutsMessageCatalog, renderStrutsMessages } from './struts-messages.mjs';
import { markupTokens } from './preview-markup.mjs';
import { expandGraphFragments } from './template-fragments.mjs';

test('properties continuation lines and escapes are read (RV-502)', () => {
  const map = propertyMap('title=Account \\\n    Home\nzh=\\u7e41\\u9ad4\nlines=a\\tb\n');
  assert.equal(map.get('title'), 'Account Home');
  assert.equal(map.get('zh'), '繁體');
  assert.equal(map.get('lines'), 'a\tb');
});

test('a comma-separated config init-param reads every struts-config (RV-503)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'r69-messages-'));
  try {
    const web = path.join(root, 'web');
    await mkdir(path.join(web, 'WEB-INF/classes'), { recursive: true });
    await writeFile(
      path.join(web, 'WEB-INF/web.xml'),
      '<web-app><servlet><init-param><param-name>config</param-name>' +
        '<param-value>/WEB-INF/a.xml, /WEB-INF/b.xml</param-value></init-param></servlet></web-app>',
    );
    await writeFile(path.join(web, 'WEB-INF/a.xml'), '<struts-config/>');
    await writeFile(
      path.join(web, 'WEB-INF/b.xml'),
      '<struts-config><message-resources parameter="B"/></struts-config>',
    );
    await writeFile(path.join(web, 'WEB-INF/classes/B.properties'), 'k=From B\n');
    const catalog = await loadStrutsMessageCatalog(root, web);
    assert.equal(renderStrutsMessages('<bean:message key="k"/>', catalog), 'From B');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an unclosed comment hides the rest of the file (RV-520)', () => {
  const tokens = markupTokens('<!-- <a href="/x">x</a>');
  assert.ok(!tokens.some((t) => t.name === 'a'), JSON.stringify(tokens));
});

test('a fragment line past the end of the file does not throw (RV-515)', async () => {
  const fragment = '<div>only</div>';
  const screen = {
    attributes: {
      templateFragments: JSON.stringify([
        {
          ownerFile: 'p.html',
          line: 1,
          file: 'f.html',
          fragment: 'x',
          start: 0,
          end: fragment.length,
          startLine: 0,
        },
      ]),
    },
  };
  const result = await expandGraphFragments(
    '<div th:replace="f :: x"></div>',
    'p.html',
    screen,
    { nodes: [] },
    async () => fragment,
  );
  assert.equal(typeof result, 'string');
});
