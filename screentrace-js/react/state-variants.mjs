import { diagnostic } from './modules.mjs';

/** A page state with more values than this is not split into screen variants. */
const MAX_STATE_VALUES = 8;

const sameVariant = (a, b) =>
  a.file === b.file &&
  a.route === b.route &&
  a.variantKey === b.variantKey &&
  a.entryQuery === b.entryQuery;

/** Initial value first; numbers in ascending order, otherwise the order the values were written. */
function orderedValues(candidate) {
  const values = [];
  for (const item of candidate.values) if (!values.includes(item.v)) values.push(item.v);
  const [initial, ...rest] = values;
  if (rest.every((v) => typeof v === 'number')) rest.sort((a, b) => a - b);
  return [initial, ...rest];
}

/**
 * Chooses the page state whose values split a route into screen variants, such as the steps of a
 * wizard. A state qualifies only when every value is proven (ADR 0105: a literal initial value and
 * literal writes), the screen shows different components for different values, and at least one
 * component that only some values show moves the state to another value. Tabs whose buttons are
 * always visible do not qualify; neither do values that show the same components (messages), a
 * state the mount-time load path writes (loading / ready / error), nor a state whose first step the
 * preview does not show (inside a dialog that starts closed). More than one qualifying state is
 * reported, not guessed.
 */
export function chooseStateVariants(base, route, renderPinned, renderPreview, diagnostics) {
  const seen = new Map();
  for (const candidate of base.stateCandidates ?? [])
    if (!seen.has(candidate.key)) seen.set(candidate.key, candidate);
  const qualified = [],
    unproven = [];
  let preview;
  for (const candidate of seen.values()) {
    const values = orderedValues(candidate);
    if (
      values.length < 2 ||
      values.length > MAX_STATE_VALUES ||
      !values.every((v) => typeof v === 'number' || typeof v === 'string')
    )
      continue;
    const renders = values.map((value) => ({
      value,
      screen: renderPinned(new Map([[candidate.key, { t: 'lit', v: value }]])),
    }));
    const keySets = renders.map((r) => new Set(r.screen.components.map((c) => c.key)));
    const differs = keySets.some(
      (keys) => keys.size !== keySets[0].size || [...keys].some((key) => !keySets[0].has(key)),
    );
    if (!differs) continue;
    const advances = renders.some(({ screen }) =>
      screen.components.some(
        (component) =>
          keySets.some((keys) => !keys.has(component.key)) &&
          component.behaviors.some((effect) => effect.stateTransition?.key === candidate.key),
      ),
    );
    if (!advances) continue;
    // Values that show the same components (messages, for example) are not separate screens.
    if (new Set(keySets.map((keys) => [...keys].sort().join('\n'))).size !== keySets.length)
      continue;
    // A state the mount-time load path writes is data loading (loading / ready / error), which the
    // preview already resolves; it is not a page step.
    preview ??= renderPreview();
    if ((preview.loadWrittenStates ?? []).includes(candidate.key)) continue;
    // The first step has to be visible in the preview; one inside a dialog that starts closed is not.
    const visible = new Set(preview.visibleAnchors ?? []);
    if (
      !renders[0].screen.components.some(
        (component) =>
          keySets.some((keys) => !keys.has(component.key)) && visible.has(component.anchor),
      )
    )
      continue;
    // A state that would split but has a write whose value cannot be proven is reported, not guessed.
    if (candidate.unproven) unproven.push(candidate);
    else qualified.push({ ...candidate, values });
  }
  for (const candidate of unproven)
    diagnostics.push(
      diagnostic(
        candidate.unproven.file,
        candidate.unproven.line,
        'REACT_STATE_VARIANT_UNPROVEN',
        `路由 ${route.path} 的頁面狀態 ${candidate.name} 在此寫入無法證明的值，未拆成畫面變體`,
      ),
    );
  if (qualified.length > 1) {
    diagnostics.push(
      diagnostic(
        route.file,
        route.line,
        'REACT_STATE_VARIANTS_MULTIPLE',
        `路由 ${route.path} 有多個頁面狀態可拆成畫面變體（${qualified
          .map((item) => `${item.name}（${item.source.file}:${item.source.line}）`)
          .sort()
          .join('、')}），未拆分`,
      ),
    );
    return null;
  }
  return qualified[0] ?? null;
}

/** Points each state transition at the variant of the same screen that shows the new value. */
export function resolveStateTransitions(screens) {
  for (const screen of screens) {
    if (!screen.stateVariant) continue;
    for (const component of screen.components)
      for (const effect of component.behaviors) {
        if (!effect.stateTransition) continue;
        const target = screens.find(
          (other) =>
            other.stateVariant &&
            sameVariant(other, screen) &&
            other.stateVariant.value === effect.stateTransition.value,
        );
        effect.urls = [screen.route];
        effect.targetRoutes = [screen.route];
        if (!target) {
          effect.targetScreens = [];
          effect.status = 'UNRESOLVED';
          continue;
        }
        effect.targetScreens = [
          {
            file: target.file,
            route: target.route,
            ...(target.variantKey ? { variantKey: target.variantKey } : {}),
            ...(target.entryQuery ? { entryQuery: target.entryQuery } : {}),
            ...(target.stateKey ? { stateKey: target.stateKey } : {}),
          },
        ];
      }
  }
}
