import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSummary} from './analysis-summary.mjs';

test('every golden summary leaf, new grouping key and missing field fail with a field path', () => {
    const expected = {screens: 1, components_by_kind: {BUTTON: 1}, behaviors_by_type: {CALL_API: 1},
        apis: {total: 1, by_status: {IN_USE: 1, REMOVABLE: 0, UNREFERENCED: 0}},
        validation_rules_by_layer: {SERVER: 1}, diagnostics_by_code: {UNKNOWN_CALL: 1}};
    const paths = [];
    const collect = (node, keys = []) => {for (const [key, value] of Object.entries(node))
        if (value && typeof value === 'object') collect(value, [...keys, key]); else paths.push([...keys, key]);};
    collect(expected);
    for (const keys of paths) {
        const changed = structuredClone(expected);
        let owner = changed;
        for (const key of keys.slice(0, -1)) owner = owner[key];
        owner[keys.at(-1)]++;
        assert.throws(() => assertSummary(expected, changed), error => error.message.includes(`summary.${keys.join('.')}`));
    }
    const added = structuredClone(expected); added.diagnostics_by_code.NEW_CODE = 1;
    assert.throws(() => assertSummary(expected, added), /summary.diagnostics_by_code fields/);
    const removed = structuredClone(expected); delete removed.components_by_kind.BUTTON;
    assert.throws(() => assertSummary(expected, removed), /summary.components_by_kind fields/);
    assert.throws(() => assertSummary(expected, {...expected, screens: '1'}), /summary.screens/);
});
