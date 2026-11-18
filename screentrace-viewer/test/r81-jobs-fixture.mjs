import { node } from './fixture.mjs';
/** R81: a schedule with a backend call, an event listener with a publisher, and startup code. */
export function addJobs(data) {
  data.graph.nodes.push(
    node('job-sweep', 'HANDLER', 'Jobs.sweep()', {
      class: 'demo.Jobs',
      method: 'sweep',
      trigger: 'SCHEDULE',
      triggerText: '每 5 分鐘',
      triggerExpression: '@Scheduled(cron = "0 */5 * * * *")',
      backendCalls: JSON.stringify([
        {
          depth: 1,
          from: 'Jobs#sweep',
          to: 'Orders#complete',
          layer: 'SERVICE',
          resolution: 'CONFIRMED',
          source: { file: 'src/Jobs.java', line: 7 },
        },
      ]),
    }),
    node('job-created', 'HANDLER', 'Listeners.created()', {
      class: 'demo.Listeners',
      method: 'created',
      trigger: 'EVENT',
      triggerText: '當 OrderCreated 事件發生時',
      triggerExpression: '@EventListener',
      eventType: 'OrderCreated',
      eventPublishers: JSON.stringify([
        { from: 'Orders#place', source: { file: 'src/Orders.java', line: 4 } },
      ]),
    }),
    node('job-warm', 'HANDLER', 'Seed.run()', {
      class: 'demo.Seed',
      method: 'run',
      trigger: 'STARTUP',
      triggerText: '應用程式啟動完成後執行一次',
      triggerExpression: 'Seed implements ApplicationRunner／CommandLineRunner',
      triggerNote: '取自程式碼中 app.x 的預設值；執行時可能被設定檔或環境變數覆寫',
    }),
  );
  return data;
}
