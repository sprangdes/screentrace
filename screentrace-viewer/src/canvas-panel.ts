import { element } from './text';
import { icon, iconButton } from './shell-ui';

export type Decision = 'KEEP' | 'REMOVE' | 'UNDECIDED';

/** What the panel says about the one pinned screen. */
export interface PinnedSummary {
  id: string;
  name: string;
  route: string;
  /** Its role (or area), with the step the role first reaches it at when known. */
  chip?: { label: string; tint?: string };
  incoming: number;
  outgoing: number;
  conflict?: string;
}
export interface PanelActions {
  close(): void;
  open(id: string): void;
  /** Missing when the caller cannot record decisions here; the bulk buttons are then disabled. */
  decide?: (ids: string[], decision: Decision) => void;
}

const HELP = [
  '點一下：標出關聯線　點兩下：開啟審查',
  '拖曳空白處：移動　⌘＋滾輪：縮放',
  '拖曳卡片：自由排版',
  'Shift＋拖曳：框選多個畫面一起標記',
];

const header = (count: number, actions: PanelActions) => {
  const head = element('div', undefined, 'canvas-panel-head');
  const close = iconButton('關閉選取', 'close');
  close.type = 'button';
  close.onclick = () => actions.close();
  head.append(element('span', `已選取 ${count} 個畫面`, 'canvas-panel-count'), close);
  return head;
};

const help = () => {
  const box = element('div', undefined, 'canvas-panel-help');
  box.append(element('strong', '操作'));
  const list = element('ul');
  for (const line of HELP) list.append(element('li', line));
  box.append(list);
  return box;
};

/** The right-hand summary of one pinned screen: where it sits, how many screens lead in and out, and a way in. */
export function pinnedPanel(panel: HTMLElement, info: PinnedSummary, actions: PanelActions): void {
  const title = element('div', undefined, 'canvas-panel-title');
  title.append(element('h2', info.name), element('code', info.route, 'canvas-panel-route'));
  if (info.chip) {
    const chip = element('span', info.chip.label, 'canvas-panel-chip');
    if (info.chip.tint) chip.dataset.roleTint = info.chip.tint;
    title.append(chip);
  }
  const counts = element('div', undefined, 'canvas-panel-counts');
  for (const [side, label, count] of [
    ['in', '進來', info.incoming],
    ['out', '出去', info.outgoing],
  ] as const) {
    const box = element('div', undefined, `canvas-panel-number is-${side}`);
    box.append(element('strong', String(count)), element('span', label));
    counts.append(box);
  }
  const open = element('button', undefined, 'canvas-panel-open');
  open.type = 'button';
  open.append(element('span', '開啟審查'), element('span', '→'));
  (open.lastChild as HTMLElement).setAttribute('aria-hidden', 'true');
  open.onclick = () => actions.open(info.id);
  panel.replaceChildren(header(1, actions), title, counts);
  if (info.conflict) {
    const note = element('div', undefined, 'canvas-panel-conflict');
    note.setAttribute('role', 'note');
    note.append(icon('warning'), element('span', info.conflict));
    panel.append(note);
  }
  panel.append(open, help());
}

/** The right-hand list of several selected screens, with one decision for all of them. */
export function selectionPanel(
  panel: HTMLElement,
  items: { id: string; name: string; status: string }[],
  actions: PanelActions,
): void {
  const list = element('ul', undefined, 'canvas-panel-list');
  list.setAttribute('aria-label', '選取的畫面');
  for (const item of items) {
    const row = element('li', undefined, 'canvas-panel-item');
    const mark = element('span', undefined, 'canvas-panel-status');
    mark.dataset.status = item.status;
    mark.setAttribute('aria-hidden', 'true');
    row.append(mark, element('span', item.name));
    if (item.status === 'KEEP' || item.status === 'REMOVE')
      row.title = item.status === 'KEEP' ? '已標記保留' : '已標記移除';
    list.append(row);
  }
  const buttons = element('div', undefined, 'canvas-panel-actions');
  for (const [decision, label, kind] of [
    ['KEEP', '全部保留', 'is-keep'],
    ['REMOVE', '全部移除', 'is-remove'],
    ['UNDECIDED', '全部設為未確認', 'is-undecided'],
  ] as const) {
    const button = element('button', label, `canvas-panel-decide ${kind}`);
    button.type = 'button';
    if (actions.decide) {
      const decide = actions.decide;
      button.onclick = () =>
        decide(
          items.map((item) => item.id),
          decision,
        );
    } else {
      button.disabled = true;
      button.title = '這裡無法標記';
    }
    buttons.append(button);
  }
  const cancel = element('button', '取消選取', 'canvas-panel-cancel');
  cancel.type = 'button';
  cancel.onclick = () => actions.close();
  buttons.append(cancel);
  panel.replaceChildren(header(items.length, actions), list, buttons, help());
}
