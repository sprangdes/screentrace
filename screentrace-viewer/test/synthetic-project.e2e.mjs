import {setDecision} from './decision-controls.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import {chromium, firefox, webkit} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {generateMarkdown} from '../dist/review-md.mjs';
import {analysisSummary, assertSummary} from './analysis-summary.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const families = ['struts1', 'struts1-spring', 'spring-mvc-jsp', 'spring-boot-jsp'];
const engines = process.env.ST_BROWSERS?.split(',') || ['chromium'];
const normalize = md => md.replace(/^generated_at: .*$/m, 'generated_at: "TIME"');
async function report(family, run) {
    const file = path.join(root, 'screentrace-cli/target/wp10-fixtures', family, run, 'report/screentrace-report.html');
    const html = await readFile(file, 'utf8');
    const data = JSON.parse(html.match(/<script id="st-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    return {url: pathToFileURL(file).href, html, data};
}

test('real source fixtures produce identical graph, packed HTML and shared-module md on consecutive runs', async () => {
    for (const family of families) {
        const a = await report(family, 'first'), b = await report(family, 'second');
        assert.equal(a.html, b.html, family);
        assert.deepEqual(a.data, b.data, family);
        assert.equal(a.data.graph.schemaVersion, '2.2');
        assert.match(a.data.componentLibrary.sha256, /^[a-f0-9]{64}$/);
        const golden = JSON.parse(await readFile(path.join(root, 'fixtures/wp10/golden', family + '.summary.json'), 'utf8'));
        assertSummary(golden, analysisSummary(a.data), family + '.first');
        assertSummary(golden, analysisSummary(b.data), family + '.second');
        const state = {format: 'screentrace-review', version: 1, schemaVersion: '2.2', application: a.data.graph.application.name, fingerprint: a.data.fingerprint, screenDecisions: {}, componentDecisions: {}};
        const first = await generateMarkdown(a.data, state, {generatedAt: '2026-01-01T00:00:00Z'});
        const second = await generateMarkdown(b.data, state, {generatedAt: '2026-01-02T00:00:00Z'});
        assert.equal(normalize(first), normalize(second), family);
    }
});

for (const engine of engines) for (const family of families) {
    test(`${engine}: ${family} source→CLI→offline report→review/library override→md→clear→restore`, async () => {
        const browser = await ({chromium, firefox, webkit}[engine]).launch();
        try {
            const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
            const {url, data} = await report(family, 'first');
            const button = data.graph.nodes.find(n => n.type === 'COMPONENT' && n.attributes.kind === 'BUTTON' && n.attributes.id === 'review-button');
            assert.ok(button, family);
            const owner = data.graph.relationships.find(e => e.type === 'CONTAINS' && e.to === button.id)?.from;
            assert.ok(owner, family);
            const requests = [];
            page.on('request', r => {if (r.url() !== url && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) requests.push(r.url());});
            await page.goto(url);
            assert.equal(await page.locator('[data-library-summary]').count(), 1);
            await page.getByRole('checkbox', {name: '確認模式', exact: true}).check();
            await setDecision(page.locator(`[data-screen-review="${owner}"]`),'KEEP');
            await page.locator(`.screen-card[data-screen="${owner}"]`).click();
            await setDecision(page.locator(`[data-component-review="${button.id}"]`),'KEEP');
            await page.locator(`[data-library-override="${button.id}"]`).selectOption('sample-button');
            if (engine === 'chromium' && family === 'spring-mvc-jsp') {
                const dir = path.join(root, 'screentrace-cli/target/wp10-screenshots');
                await mkdir(dir, {recursive: true});
                await page.locator('.preview').screenshot({path: path.join(dir, 'preview.png')});
                await page.locator(`[data-library-override="${button.id}"]`).locator('..').screenshot({path: path.join(dir, 'library-override.png')});
            }
            const download = async () => {
                const pending = page.waitForEvent('download');
                await page.getByRole('button', {name: '匯出 md', exact: true}).click();
                return readFile(await (await pending).path(), 'utf8');
            };
            const first = await download();
            assert.match(first, /"format_version":2/);
            assert.match(first, /Sample Controls@1.0-sample/);
            assert.match(first, /sample-button/);
            await page.evaluate(() => localStorage.clear());
            await page.reload();
            await page.getByRole('checkbox', {name: '確認模式', exact: true}).check();
            assert.equal(await page.locator(`[data-screen-review="${owner}"]`).getAttribute('data-decision'), 'UNDECIDED');
            await page.getByLabel('匯入 md', {exact: true}).setInputFiles({name: 'review.md', mimeType: 'text/markdown', buffer: Buffer.from(first)});
            await page.locator('[data-md-status]').filter({hasText: '匯入完成'}).waitFor();
            assert.equal(await page.locator(`[data-screen-review="${owner}"]`).getAttribute('data-decision'), 'KEEP');
            await page.locator(`.screen-card[data-screen="${owner}"]`).click();
            assert.equal(await page.locator(`[data-component-review="${button.id}"]`).getAttribute('data-decision'), 'KEEP');
            assert.equal(await page.locator(`[data-library-override="${button.id}"]`).inputValue(), 'sample-button');
            assert.equal(normalize(await download()), normalize(first));
            assert.equal(await page.evaluate(() => globalThis.wp10Probe), undefined);
            assert.deepEqual(requests, []);
        } finally { await browser.close(); }
    });
}
