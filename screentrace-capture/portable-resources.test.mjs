import assert from 'node:assert/strict';
import test from 'node:test';
import { portableResourceUrls } from './element-styles.mjs';

const output = 'file:///work/out%20(1)';

test('HC-009 URLs under the analysis output lose the local prefix', () => {
  assert.deepEqual(
    portableResourceUrls(
      {
        'background-image':
          'url("file:///work/out%20(1)/static-preview/assets/a.svg"), url("file:///work/out%20(1)/static-preview/assets/b.png?v=1#x")',
        cursor: "url('file:///work/out%20(1)/static-preview/assets/c.cur'), auto",
        'list-style-image': 'url(file:///work/out%20(1)/static-preview/assets/d.png)',
      },
      output,
    ),
    {
      'background-image':
        'url("st-preview-file:static-preview/assets/a.svg"), url("st-preview-file:static-preview/assets/b.png?v=1#x")',
      cursor: "url('st-preview-file:static-preview/assets/c.cur'), auto",
      'list-style-image': 'url(st-preview-file:static-preview/assets/d.png)',
    },
  );
});

test('HC-009 other URLs stay as captured for the report to check or reject', () => {
  const values = {
    sibling: 'url("file:///work/out%20(1)-neighbor/secret.svg")',
    outside: 'url("file:///Users/private/image.svg")',
    embedded: 'url("https://example.invalid/?u=file:///work/out%20(1)/x.svg")',
    data: 'url("data:image/png;base64,AAA=")',
    plain: 'none',
  };
  assert.deepEqual(portableResourceUrls(values, output), values);
  assert.deepEqual(portableResourceUrls(values, output + '/'), values);
  assert.equal(portableResourceUrls(values, undefined), values);
});
