import test from 'node:test';
import assert from 'node:assert/strict';
import { ownModule } from './module.mjs';
import { fixture, node } from './fixture.mjs';
import { addJobs } from './r81-jobs-fixture.mjs';
import { mdFixture } from './md-fixture.mjs';

test('R81 background jobs are read from handlers in trigger order and never become APIs', async () => {
  const jobs = await ownModule('shared/jobs'),
    review = await ownModule('shared/review'),
    data = addJobs(fixture());
  data.graph.nodes.push(node('plain', 'HANDLER', 'Api.get()', { class: 'demo.Api' }));
  data.graph.nodes.push(
    node('broken', 'HANDLER', 'Bad.x()', {
      trigger: 'SCHEDULE',
      triggerText: '每天',
      eventPublishers: '{',
    }),
  );
  const list = jobs.backgroundJobs(data.graph);
  assert.deepEqual(
    list.map((j) => j.node.id),
    ['broken', 'job-sweep', 'job-created', 'job-warm'],
  );
  assert.deepEqual(
    list[2].publishers.map((p) => p.from),
    ['Orders#place'],
  );
  assert.deepEqual(list[0].publishers, []);
  const usage = review.deriveApiUsage(data.graph, review.emptyReview(data.graph, data.fingerprint));
  assert.equal(usage.has('job-sweep'), false);
});

test('R81 md §12 lists every job with its timing, or says none was found', async () => {
  const m = await ownModule('shared/review-md'),
    r = await ownModule('shared/review'),
    opts = { generatedAt: '2026-11-18T00:00:00.000Z', toolVersion: 'test' };
  const empty = mdFixture();
  const none = await m.generateMarkdown(empty, r.emptyReview(empty.graph, empty.fingerprint), opts);
  assert.match(
    none,
    /## 12\. 系統自動作業\(排程、事件、啟動時\)\n\n[^\n]+\n\n未偵測到排程、事件監聽或啟動時執行的程式。\n\n## 附錄 A/,
  );
  const data = addJobs(mdFixture());
  const out = await m.generateMarkdown(data, r.emptyReview(data.graph, data.fingerprint), opts);
  const section = out.split('## 12. ')[1].split('## 附錄 A')[0];
  assert.match(section, /\| ` Jobs\.sweep\(\) ` \| ` 排程 ` \| ` 每 5 分鐘 ` \|/);
  assert.match(section, /` 事件 ` \| ` 當 OrderCreated 事件發生時 `/);
  assert.match(section, /發布來源:Orders#place/);
  assert.match(section, /` 啟動時 `/);
  // The job's backend calls are part of §9 like any handler's.
  assert.match(out.split('## 9. ')[1].split('## 10. ')[0], /Orders#complete/);
  const restored = await m.importMarkdown(out, data);
  assert.equal(await m.generateMarkdown(data, restored.state, opts), out);
});
