import { Index } from './map';
import { element, text } from './text';
import { Feature, OTHER_FEATURE, ruleLabels, usedRules } from './shared/features';
import {
  Decision,
  DecisionNote,
  ReviewState,
  conflicts,
  decisionNoteOf,
  featureDecision,
  reasonLabels,
} from './shared/review';
import { decisionSwitch, decisionLabel, noteEditor } from './review-ui';
import { rolePartition, roleTint } from './personas';

export interface FeatureMapActions {
  open: (screenId: string) => void;
  setFeature: (key: string, value: Decision) => void;
  setNote: (key: string, note: DecisionNote) => void;
  commitNote: () => void;
  /** Feature keys whose note editor is open. */
  notesOpen: Set<string>;
  /** Feature keys folded to their header. */
  collapsed: Set<string>;
  /** A screen's effective decision and whether it comes from its feature. */
  status: (screenId: string) => { decision: Decision; inherited: boolean };
}

const simpleName = (type: string) => type.split(/[.$]/).pop() || type;
const fileName = (path: string) => path.split('/').pop() || path;

/**
 * Features as a list of cards (ADR 0156, 0188): a jump list and legend on the left, one card per
 * feature on the right with its basis, the roles that use it, its decision and its flows of screens
 * in navigation order. A feature can be kept or removed as a whole; screens without their own
 * decision follow it.
 */
export function featureMap(
  index: Index,
  list: Feature[],
  state: ReviewState,
  actions: FeatureMapActions,
): HTMLElement {
  const root = element('section', undefined, 'feature-map feature-overview');
  root.dataset.featureMap = 'true';
  const roles = rolePartition(index),
    personaNames = new Map(
      ((index.graph.application.personas || []) as { id?: string; name?: string }[])
        .filter((p) => p.id && p.name)
        .map((p) => [p.id!, p.name!]),
    ),
    conflicted = new Set(conflicts(index.graph, state).map((c) => c.screenId));
  // The states of one page (ADR 0183, 0186): each state is a screen of its own with the same base.
  const stateCount = new Map<string, number>();
  for (const screen of index.screens)
    if (screen.attributes.stateVariant) {
      const base = screen.attributes.stateVariantOf || screen.id;
      stateCount.set(base, (stateCount.get(base) || 0) + 1);
    }
  const statesOf = (id: string) =>
    stateCount.get(index.nodes.get(id)?.attributes.stateVariantOf || id) || 0;

  const grouped = list.filter((f) => f.key !== OTHER_FEATURE),
    other = list.find((f) => f.key === OTHER_FEATURE),
    cards = new Map<string, HTMLElement>();

  const side = element('aside', undefined, 'fo-side');
  side.setAttribute('aria-label', '功能清單');
  const summary = element('div', undefined, 'fo-summary'),
    rules = usedRules(list);
  summary.append(
    element('h1', `${grouped.length} 個功能 · ${index.screens.length} 個畫面`),
    element(
      'p',
      `功能由原始碼規則整理${
        rules.length ? `：${rules.map((rule) => ruleLabels[rule]).join('、')}` : ''
      }，至少兩個畫面共用才成為一個功能。標記整個功能時，沒有個別標記的畫面會跟著它。`,
    ),
  );
  const jump = element('nav', undefined, 'fo-jump');
  jump.setAttribute('aria-label', '跳到功能');
  const legend = element('ul', undefined, 'fo-legend');
  legend.setAttribute('aria-label', '畫面框線');
  for (const [kind, label] of [
    ['own-keep', '個別標記保留'],
    ['follow-keep', '隨功能保留'],
    ['follow-remove', '隨功能移除'],
  ]) {
    const item = element('li'),
      swatch = element('span', undefined, 'fo-swatch');
    swatch.dataset.kind = kind;
    swatch.setAttribute('aria-hidden', 'true');
    item.append(swatch, element('span', label));
    legend.append(item);
  }
  side.append(summary, jump, legend);

  const body = element('div', undefined, 'fo-cards');
  body.setAttribute('aria-label', '功能');
  for (const feature of grouped) body.append(card(feature));
  if (other) body.append(card(other));
  for (const feature of other ? [...grouped, other] : grouped) jump.append(jumpButton(feature));

  const layout = element('div', undefined, 'fo-layout');
  layout.append(side, body);
  root.append(layout);
  return root;

  function jumpButton(feature: Feature): HTMLButtonElement {
    const button = element('button', undefined, 'fo-jump-item'),
      isOther = feature.key === OTHER_FEATURE;
    button.type = 'button';
    button.dataset.featureJump = feature.key;
    if (isOther) button.dataset.other = 'true';
    button.append(
      element('span', isOther ? '其他（看不出分組）' : feature.label, 'fo-jump-name'),
      element('span', String(feature.screens.length), 'fo-jump-count'),
    );
    const decided = feature.screens.filter(
      (id) => actions.status(id).decision !== 'UNDECIDED',
    ).length;
    button.setAttribute(
      'aria-label',
      `${isOther ? '其他' : feature.label}，${feature.screens.length} 個畫面，已確認 ${decided}`,
    );
    button.title = `${feature.screens.length} 個畫面 · 已確認 ${decided}`;
    button.onclick = () => {
      const target = cards.get(feature.key);
      if (!target) return;
      for (const item of jump.querySelectorAll('[aria-current]'))
        item.removeAttribute('aria-current');
      button.setAttribute('aria-current', 'true');
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      target.focus({ preventScroll: true });
      target.dataset.highlight = 'true';
      window.setTimeout(() => delete target.dataset.highlight, 1600);
    };
    return button;
  }

  /** The rule that grouped the feature, in plain words; code names in a monospace font. */
  function basis(feature: Feature): HTMLElement {
    const line = element('p', undefined, 'fo-basis'),
      code = (value: string, title?: string) => {
        const node = element('code', value);
        if (title) node.title = title;
        return node;
      };
    switch (feature.rule) {
      case 'MODULE':
        line.append('依據：Struts module ', code(feature.value));
        break;
      case 'HANDLER_CLASS':
        line.append('依據：處理程式 ', code(simpleName(feature.value), feature.value));
        break;
      case 'TILES':
        line.append('依據：Tiles 定義名稱開頭 ', code(feature.value));
        break;
      case 'MENU':
        line.append('依據：同一份選單產生的連結 ', code(fileName(feature.value), feature.value));
        break;
      case 'URL':
        line.append('依據：網址開頭 ', code(feature.value));
        break;
      case 'ROLE':
        line.append(
          `依據：只有「${personaNames.get(feature.value) || feature.value}」這個角色會用到`,
        );
        break;
      default:
        line.append('原始碼看不出分組的畫面');
    }
    return line;
  }

  /** Roles whose flow reaches at least one of the feature's screens, in persona order. */
  function rolesOf(feature: Feature): string[] {
    if (!roles) return [];
    return roles.keys.filter((key) => {
      const reached = roles.depth.get(key);
      return !!reached && feature.screens.some((id) => reached.has(id));
    });
  }

  function card(feature: Feature): HTMLElement {
    const isOther = feature.key === OTHER_FEATURE,
      decision = featureDecision(state, feature.key),
      note = decisionNoteOf(state, 'feature', feature.key),
      folded = actions.collapsed.has(feature.key),
      label = isOther ? '其他' : feature.label,
      article = element('article', undefined, 'fo-card'),
      headingId = `fo-${index.screens.length}-${cards.size}`;
    cards.set(feature.key, article);
    article.dataset.feature = feature.key;
    article.dataset.decision = decision;
    if (isOther) article.dataset.other = 'true';
    article.tabIndex = -1;
    article.setAttribute('aria-labelledby', headingId);
    if (feature.sources.length)
      article.title = feature.sources.map((s) => `${s.file}:${s.line}`).join('\n');

    const head = element('div', undefined, 'fo-head'),
      title = element('div', undefined, 'fo-title'),
      mark = element('span', undefined, 'fo-mark'),
      h2 = element('h2', label),
      used = rolesOf(feature);
    h2.id = headingId;
    mark.setAttribute('aria-hidden', 'true');
    mark.dataset.roleTint = used.length === 1 ? roleTint(index.graph, used[0]) : 'none';
    title.append(mark, h2);
    const info = element('div', undefined, 'fo-info');
    info.append(basis(feature));
    if (used.length) {
      const chips = element('ul', undefined, 'fo-roles');
      chips.setAttribute('aria-label', '用到的角色');
      for (const key of used) {
        const chip = element('li', roles!.label(key), 'fo-role');
        chip.dataset.roleTint = roleTint(index.graph, key);
        chips.append(chip);
      }
      info.append(chips);
    }
    const controls = element('div', undefined, 'fo-controls');
    // 其他 is not a feature people decide on as a whole; a decision already made stays changeable.
    if (!isOther || decision !== 'UNDECIDED')
      controls.append(
        decisionSwitch(
          `功能「${label}」`,
          decision,
          (value) => actions.setFeature(feature.key, value),
          {
            screen: `feature:${feature.key}`,
          },
        ),
      );
    // Folding is offered on real features only; 其他 is a plain strip of screens.
    const toggle = element('button', undefined, 'fo-toggle');
    toggle.type = 'button';
    if (!isOther) controls.append(toggle);
    head.append(title, info, controls);

    const flows = element('ol', undefined, 'fo-flows');
    feature.flows.forEach((flow, at) => {
      const row = element('li', undefined, 'fo-flow');
      row.dataset.flowEntry = flow.entry;
      if (feature.flows.length > 1) row.append(element('span', `流程 ${at + 1}`, 'fo-flow-label'));
      // One horizontal row per flow, scrolling sideways inside the card when it is longer than the card.
      const steps = element('ol', undefined, 'fo-steps');
      flow.screens.forEach((id, step) => {
        const item = element('li', undefined, 'fo-step');
        if (step) {
          const arrow = element('span', '→', 'fo-arrow');
          arrow.setAttribute('aria-hidden', 'true');
          item.append(arrow);
        }
        item.append(tile(id));
        steps.append(item);
      });
      row.append(steps);
      flows.append(row);
    });

    const show = (open: boolean) => {
      toggle.textContent = open ? '⌃' : '⌄';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', `${open ? '收合' : '展開'}「${label}」的流程`);
      toggle.title = open ? '收合流程' : '展開流程';
      flows.hidden = !open;
    };
    show(!folded);
    toggle.onclick = () => {
      if (actions.collapsed.has(feature.key)) actions.collapsed.delete(feature.key);
      else actions.collapsed.add(feature.key);
      show(!actions.collapsed.has(feature.key));
    };

    article.append(head, flows);
    if (!isOther || decision !== 'UNDECIDED' || note.note || note.reason)
      article.append(noteArea(feature.key, label, decision, note));
    return article;
  }

  /**
   * The feature's note: shown as the 功能備註 block when there is one, a small 寫備註 button when there is not, and the
   * note editor while it is open.
   */
  function noteArea(key: string, label: string, decision: Decision, initial: DecisionNote) {
    const foot = element('div', undefined, 'fo-note');
    let current = initial;
    const render = () => {
      foot.replaceChildren();
      if (actions.notesOpen.has(key)) {
        foot.append(
          noteEditor({
            label: `功能「${label}」`,
            decision,
            note: current,
            open: true,
            onToggle: (open) => {
              if (open) actions.notesOpen.add(key);
              else {
                actions.notesOpen.delete(key);
                render();
              }
            },
            onInput: (value) => {
              current = value;
              actions.setNote(key, value);
            },
            onCommit: actions.commitNote,
          }),
        );
        return;
      }
      const edit = (text: string, kind: string) => {
        const button = element('button', text, kind);
        button.type = 'button';
        button.setAttribute('aria-label', `${text}：功能「${label}」`);
        button.onclick = () => {
          actions.notesOpen.add(key);
          render();
          foot.querySelector<HTMLTextAreaElement>('textarea')?.focus();
        };
        return button;
      };
      const reason =
        current.reason && decision !== 'UNDECIDED'
          ? reasonLabels[decision][current.reason]
          : undefined;
      const words = [reason, current.note?.trim()].filter(Boolean).join(' · ');
      if (words) {
        const headRow = element('div', undefined, 'fo-note-head');
        headRow.append(element('span', '功能備註', 'fo-note-label'), edit('修改', 'fo-note-edit'));
        foot.append(headRow, element('p', words, 'fo-note-text'));
      } else foot.append(edit('寫備註', 'fo-note-add'));
    };
    render();
    return foot;
  }

  function tile(id: string): HTMLButtonElement {
    const screen = index.nodes.get(id)!,
      { decision, inherited } = actions.status(id),
      button = element('button', undefined, 'fo-tile'),
      route = index.routes.get(id)?.[0] || text.noUrl,
      states = statesOf(id),
      conflict = conflicted.has(id);
    button.type = 'button';
    button.dataset.featureScreen = id;
    button.dataset.decision = decision;
    if (inherited) button.dataset.inherited = 'true';
    if (conflict) button.dataset.conflict = 'true';
    const status = [
      decision === 'UNDECIDED'
        ? '未確認'
        : inherited
          ? `隨功能${decisionLabel(decision)}`
          : decisionLabel(decision),
    ];
    if (conflict) status.push('衝突');
    if (states >= 2) status.push(`${states} 種狀態`);
    button.title = `${screen.name}\n${route}`;
    button.append(
      element('span', screen.name, 'fo-tile-name'),
      element('code', route, 'fo-tile-url'),
      element('span', status.join(' · '), 'fo-tile-status'),
    );
    button.onclick = () => actions.open(id);
    return button;
  }
}
