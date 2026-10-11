import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';

const review = await ownModule('shared/review');
function histogram(values, zeros = []) {
    const counts = Object.fromEntries(zeros.map(key => [key, 0]));
    for (const value of values) {
        assert.equal(typeof value, 'string', 'summary grouping key');
        counts[value] = (counts[value] || 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
/** Initial, unreviewed state; use the actual viewer/md shared API derivation. */
export function analysisSummary(payload) {
    const graph = payload.graph;
    const usage = review.deriveApiUsage(graph, review.emptyReview(graph, payload.fingerprint));
    return {
        screens: graph.nodes.filter(n => n.type === 'SCREEN').length,
        components_by_kind: histogram(graph.nodes.filter(n => n.type === 'COMPONENT').map(n => n.attributes.kind),
            'BUTTON LINK SUBMIT TEXT_INPUT TEXTAREA SELECT CHECKBOX RADIO DATE_PICKER FILE_INPUT MULTI_SELECT FORM MODAL TABLE OTHER'.split(' ')),
        behaviors_by_type: histogram(graph.behaviors.map(b => b.type),
            'NAVIGATE SUBMIT_FORM CALL_API OPEN_DIALOG VALIDATE UI_STATE_CHANGE SELECT_CHANGE UNKNOWN'.split(' ')),
        apis: {total: usage.size, by_status: histogram([...usage.values()].map(u => u.status), ['IN_USE', 'REMOVABLE', 'UNREFERENCED'])},
        validation_rules_by_layer: histogram(graph.validationRules.map(r => r.layer), ['MARKUP', 'CLIENT', 'SERVER']),
        diagnostics_by_code: histogram(graph.diagnostics.map(d => d.code))
    };
}
export function assertSummary(expected, actual, path = 'summary') {
    assert.equal(typeof actual, typeof expected, path);
    if (expected && typeof expected === 'object') {
        assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${path} fields`);
        for (const key of Object.keys(expected).sort()) assertSummary(expected[key], actual[key], `${path}.${key}`);
    } else assert.equal(actual, expected, path);
}
