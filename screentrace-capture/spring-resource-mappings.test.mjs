import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { discoverSpringResourceMappings } from './spring-resource-mappings.mjs';

async function fixture(xml) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'screentrace-resources-'));
  const config = path.join(root, 'src/main/webapp/WEB-INF/dispatcher-servlet.xml');
  await mkdir(path.dirname(config), { recursive: true });
  await writeFile(config, xml);
  return { root, webRoot: path.join(root, 'src/main/webapp') };
}

test('discovers a servlet-webapp mvc:resources mapping', async () => {
  const { root, webRoot } = await fixture('<mvc:resources mapping="/resources/**" location="/WEB-INF/resources/"/>');
  const mappings = await discoverSpringResourceMappings(root, webRoot, readFile);
  assert.deepEqual(mappings, [{ urlPrefix: '/resources/', assetKey: 'resources', sourceDir: path.join(webRoot, 'WEB-INF/resources') }]);
});

test('supports reversed attributes and multiple mappings', async () => {
  const { root, webRoot } = await fixture('<mvc:resources location="/WEB-INF/assets/" mapping="/assets/**"/>');
  const mappings = await discoverSpringResourceMappings(root, webRoot, readFile);
  assert.deepEqual(mappings, [{ urlPrefix: '/assets/', assetKey: 'assets', sourceDir: path.join(webRoot, 'WEB-INF/assets') }]);
});

test('keeps supported servlet and classpath locations from a comma-separated mapping', async () => {
  const { root, webRoot } = await fixture('<mvc:resources mapping="/static/**" location="/WEB-INF/static/, classpath:/static/"/>');
  const mappings = await discoverSpringResourceMappings(root, webRoot, readFile);
  assert.deepEqual(mappings, [
    { urlPrefix: '/static/', assetKey: 'static', sourceDir: path.join(webRoot, 'WEB-INF/static') },
    { urlPrefix: '/static/', assetKey: 'static', sourceDir: path.join(root, 'src/main/resources/static') }
  ]);
});

test('rejects locations that escape the analyzed project', async () => {
  const { root, webRoot } = await fixture('<mvc:resources mapping="/assets/**" location="/WEB-INF/../../../../../../tmp"/>');
  assert.deepEqual(await discoverSpringResourceMappings(root, webRoot, readFile), []);
});
