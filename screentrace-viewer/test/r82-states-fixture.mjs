import { node } from './fixture.mjs';
const change = (value, extra = {}) => ({
  depth: 1,
  in: 'Orders#cancel',
  enum: 'Status',
  field: 'status',
  ...(value ? { value } : {}),
  values: ['PENDING', 'CONFIRMED', 'CANCELLED'],
  labels: { CONFIRMED: '已確認', CANCELLED: '已取消' },
  resolution: value ? 'CONFIRMED' : 'UNRESOLVED',
  source: { file: 'src/Orders.java', line: 9 },
  ...extra,
});
/** R82: an API that cancels, a job that confirms, and a write whose value is a variable. */
export function addStates(data) {
  data.graph.nodes.push(
    node('cancel-handler', 'HANDLER', 'Api.cancel()', {
      class: 'demo.Api',
      method: 'cancel',
      stateChanges: JSON.stringify([
        change('CANCELLED', { label: '已取消' }),
        change(undefined, {
          reason: '值由變數 next 決定',
          source: { file: 'src/Orders.java', line: 12 },
        }),
      ]),
    }),
    node('confirm-job', 'HANDLER', 'Jobs.confirm()', {
      class: 'demo.Jobs',
      method: 'confirm',
      trigger: 'SCHEDULE',
      triggerText: '每 5 分鐘',
      triggerExpression: '@Scheduled(cron = "0 */5 * * * *")',
      stateChanges: JSON.stringify([change('CONFIRMED', { in: 'Jobs#confirm', label: '已確認' })]),
    }),
  );
  data.graph.relationships.push({
    id: 'r82-handled',
    type: 'HANDLED_BY',
    from: 'ep',
    to: 'cancel-handler',
    confidence: 'CONFIRMED',
    source: { file: 'src/Api.java', line: 3 },
    evidence: [
      {
        source: { file: 'src/Api.java', line: 3 },
        parser: 'Fixture',
        resolution: 'CONFIRMED',
        detail: 'fixture',
      },
    ],
  });
  return data;
}
