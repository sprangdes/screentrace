import { Index } from './map';
import { element, text } from './text';
import { icon } from './shell-ui';
import { Feature, ruleLabels, usedRules } from './shared/features';
import {
  Decision,
  DecisionNote,
  ReviewState,
  decisionNoteOf,
  featureDecision,
} from './shared/review';
import { decisionSwitch, decisionLabel, noteEditor } from './review-ui';

export interface FeatureMapActions {
  open: (screenId: string) => void;
  setFeature: (key: string, value: Decision) => void;
  setNote: (key: string, note: DecisionNote) => void;
  commitNote: () => void;
  /** Feature keys whose note editor is open. */
  notesOpen: Set<string>;
  /** Feature keys folded to their card. */
  collapsed: Set<string>;
  /** A screen's effective decision and whether it comes from its feature. */
  status: (screenId: string) => { decision: Decision; inherited: boolean };
}

/**
 * Features as a mind map (ADR 0156): the application at the root, its features as branches, each
 * feature's flows as chains of screens in navigation order. A feature can be kept or removed as a
 * whole; screens without their own decision follow it.
 */
export function featureMap(
  index: Index,
  list: Feature[],
  state: ReviewState,
  actions: FeatureMapActions,
): HTMLElement {
  const root = element('section', undefined, 'feature-map');
  root.dataset.featureMap = 'true';
  const head = element('header', undefined, 'feature-map-head');
  head.append(
    element('h1', '功能地圖'),
    element(
      'p',
      `依原始碼中的分組依據整理${
        usedRules(list).length
          ? `：${usedRules(list)
              .map((rule) => ruleLabels[rule])
              .join('、')}`
          : ''
      }，至少兩個畫面共用才成為一個功能${
        usedRules(list).includes('MENU') ? '；「選單」是同一份清單產生的連結' : ''
      }。標記整個功能時，沒有個別標記的畫面跟著功能的決定。`,
      'muted',
    ),
  );
  root.append(head);
  const tree = element('div', undefined, 'fm-tree'),
    trunk = element('div', undefined, 'fm-root');
  trunk.append(icon('screen'), element('strong', index.graph.application.name));
  trunk.append(element('span', `${list.length} 個功能 · ${index.screens.length} 個畫面`, 'muted'));
  const branches = element('ul', undefined, 'fm-features');
  for (const feature of list) branches.append(branch(feature));
  tree.append(trunk, branches);
  root.append(tree);
  return root;

  function branch(feature: Feature): HTMLLIElement {
    const item = element('li', undefined, 'fm-feature'),
      card = element('div', undefined, 'fm-card'),
      decision = featureDecision(state, feature.key),
      folded = actions.collapsed.has(feature.key);
    item.dataset.feature = feature.key;
    card.dataset.decision = decision;
    const title = element('div', undefined, 'fm-card-title'),
      toggle = element('button', undefined, 'icon-button fm-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(!folded));
    toggle.setAttribute('aria-label', `${folded ? '展開' : '收合'}「${feature.label}」的流程`);
    toggle.append(icon(folded ? 'chevronRight' : 'chevronLeft'));
    toggle.onclick = () => {
      if (actions.collapsed.has(feature.key)) actions.collapsed.delete(feature.key);
      else actions.collapsed.add(feature.key);
      const open = !actions.collapsed.has(feature.key);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', `${open ? '收合' : '展開'}「${feature.label}」的流程`);
      toggle.replaceChildren(icon(open ? 'chevronLeft' : 'chevronRight'));
      flows.hidden = !open;
    };
    title.append(element('h2', feature.label), toggle);
    const decided = feature.screens.filter(
      (id) => actions.status(id).decision !== 'UNDECIDED',
    ).length;
    card.append(
      title,
      element(
        'p',
        feature.rule === 'OTHER'
          ? '沒有可共用的分組依據'
          : `依${ruleLabels[feature.rule]}：${feature.value}`,
        'fm-basis',
      ),
      element('p', `${feature.screens.length} 個畫面 · 已確認 ${decided}`, 'muted'),
    );
    if (feature.sources.length)
      card.title = feature.sources.map((s) => `${s.file}:${s.line}`).join('\n');
    card.append(
      decisionSwitch(
        `功能「${feature.label}」`,
        decision,
        (value) => actions.setFeature(feature.key, value),
        {
          screen: `feature:${feature.key}`,
        },
      ),
      noteEditor({
        label: `功能「${feature.label}」`,
        decision,
        note: decisionNoteOf(state, 'feature', feature.key),
        open: actions.notesOpen.has(feature.key),
        onToggle: (open) => {
          if (open) actions.notesOpen.add(feature.key);
          else actions.notesOpen.delete(feature.key);
        },
        onInput: (note) => actions.setNote(feature.key, note),
        onCommit: actions.commitNote,
      }),
    );
    const flows = element('ol', undefined, 'fm-flows');
    flows.hidden = folded;
    feature.flows.forEach((flow, at) => {
      const row = element('li', undefined, 'fm-flow');
      row.dataset.flowEntry = flow.entry;
      row.append(element('span', `流程 ${at + 1}`, 'fm-flow-label'));
      const steps = element('ol', undefined, 'fm-steps');
      // Every step is the same size (arrow slot + box) so wrapped steps line up in columns.
      flow.screens.forEach((id, step) => {
        const item = chip(id),
          arrow = element('span', undefined, 'fm-arrow');
        arrow.setAttribute('aria-hidden', 'true');
        if (step) arrow.append(icon('arrow'));
        item.prepend(arrow);
        steps.append(item);
      });
      row.append(steps);
      flows.append(row);
    });
    item.append(card, flows);
    return item;
  }

  function chip(id: string): HTMLLIElement {
    const screen = index.nodes.get(id)!,
      { decision, inherited } = actions.status(id),
      item = element('li', undefined, 'fm-step'),
      button = element('button', undefined, 'fm-screen');
    button.type = 'button';
    button.dataset.featureScreen = id;
    button.dataset.decision = decision;
    if (inherited) button.dataset.inherited = 'true';
    const route = index.routes.get(id)?.[0] || text.noUrl;
    button.title = `${screen.name}\n${route}`;
    button.append(element('strong', screen.name), element('code', route));
    if (decision !== 'UNDECIDED')
      button.append(
        element(
          'span',
          inherited ? `隨功能${decisionLabel(decision)}` : decisionLabel(decision),
          'fm-screen-state',
        ),
      );
    button.onclick = () => actions.open(id);
    item.append(button);
    return item;
  }
}
