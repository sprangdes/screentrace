import { icon } from './shell-ui';
import { element } from './text';
import {
  Decision,
  DecisionNote,
  EffectiveDecision,
  ReasonCode,
  reasonCodes,
  reasonLabels,
} from './shared/review';
import { decisionTerm } from './terms';

/** Elements that never show children: void elements, form controls that draw their own
 * content, and embedded media. A badge goes after them instead of inside. */
const NO_VISIBLE_CHILDREN = new Set([
  'input',
  'img',
  'select',
  'textarea',
  'option',
  'optgroup',
  'br',
  'hr',
  'wbr',
  'area',
  'embed',
  'iframe',
  'object',
  'video',
  'audio',
  'canvas',
  'meter',
  'progress',
]);
/** Put a decision badge where it can be seen: inside `node`, or right after it when its
 * children would not render. */
export function placeBadge(node: Element, badge: Element): void {
  if (NO_VISIBLE_CHILDREN.has(node.localName)) node.insertAdjacentElement('afterend', badge);
  else node.append(badge);
}
export function decisionLabel(value: EffectiveDecision): string {
  return decisionTerm(value);
}

const choices = ['KEEP', 'REMOVE', 'UNDECIDED'] as const;

/** Three-state keep／remove／undecided selector implemented as a radiogroup; arrow keys move the choice. */
export function decisionSwitch(
  label: string,
  value: Decision,
  onChange: (value: Decision) => void,
  options: { compact?: boolean; screen?: string; component?: string; keys?: boolean } = {},
): HTMLElement {
  const group = element(
    'div',
    undefined,
    options.compact ? 'decision-switch compact' : 'decision-switch',
  );
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  group.dataset.decision = value;
  if (options.screen) group.dataset.screenId = options.screen;
  if (options.component) group.dataset.componentId = options.component;
  const buttons = choices.map((decision) => {
    const button = element('button', undefined, 'decision-option');
    button.type = 'button';
    button.dataset.decision = decision;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(value === decision));
    button.tabIndex = value === decision ? 0 : -1;
    // In a row, 「未確認」 means following the screen's (or the API's derived) decision: a reset arrow (ADR 0189).
    button.append(
      icon(
        decision === 'KEEP'
          ? 'check'
          : decision === 'REMOVE'
            ? 'close'
            : options.compact
              ? 'reset'
              : 'question',
      ),
    );
    if (options.compact) {
      const name = decision === 'UNDECIDED' ? '跟隨（未確認）' : decisionLabel(decision);
      button.setAttribute('aria-label', `${label}：${name}`);
      button.title = name;
    } else button.append(element('span', decisionLabel(decision)));
    // The shortcut that makes the same choice, shown where the choice is made.
    if (options.keys) {
      const key = element('kbd', { KEEP: 'K', REMOVE: 'X', UNDECIDED: 'U' }[decision]);
      key.setAttribute('aria-hidden', 'true');
      button.append(key);
    }
    button.onclick = () => {
      if (value !== decision) onChange(decision);
    };
    button.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const next =
        choices[
          (choices.indexOf(decision) +
            (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) +
            choices.length) %
            choices.length
        ];
      const selector = `.decision-switch[data-screen-id="${CSS.escape(options.screen || '')}"]${options.component ? `[data-component-id="${CSS.escape(options.component)}"]` : ':not([data-component-id])'} [data-decision="${next}"]`;
      onChange(next);
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(selector)?.focus());
    };
    return button;
  });
  group.append(...buttons);
  return group;
}

/** Notes are capped at this many characters (Unicode code points), as the review state validates. */
export const NOTE_LIMIT = 1000;
export interface NoteEditorOptions {
  /** What the note is about, for screen readers: 「這個畫面」, a button's name, an API. */
  label: string;
  decision: Decision;
  note: DecisionNote;
  open: boolean;
  compact?: boolean;
  /** Always shown with a heading instead of a toggle (the screen's own note, ADR 0189). */
  alwaysOpen?: boolean;
  onToggle: (open: boolean) => void;
  /** Every keystroke: keep the text without rebuilding the panel, so typing is never interrupted. */
  onInput: (note: DecisionNote) => void;
  /** Leaving the field or choosing a reason: the panel may be rebuilt to show the new state. */
  onCommit: () => void;
}
/** A foldable note: an optional reason fitting the current keep／remove decision, and free text.
 * The toggle is a button (not <details>), so the panels' own <summary> sections stay the only ones. */
export function noteEditor(options: NoteEditorOptions): HTMLDivElement {
  const box = element('div', undefined, options.compact ? 'note-editor compact' : 'note-editor'),
    body = element('div', undefined, 'note-body'),
    filled = !!(options.note.note || options.note.reason),
    toggle = element('button', undefined, 'note-toggle');
  toggle.type = 'button';
  toggle.dataset.noteToggle = 'true';
  toggle.append(icon('note'), element('span', filled ? '備註（已填）' : '備註'));
  toggle.setAttribute('aria-label', `${options.label}的備註${filled ? '（已填）' : ''}`);
  toggle.title = filled ? '查看或修改備註' : '寫備註';
  if (filled) box.dataset.noteFilled = 'true';
  const show = (open: boolean) => {
    box.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
  };
  show(options.open);
  toggle.onclick = () => {
    const open = box.dataset.open !== 'true';
    show(open);
    options.onToggle(open);
    if (open) body.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  };
  if (options.alwaysOpen) {
    box.dataset.alwaysOpen = 'true';
    show(true);
    box.append(element('span', '給 AI 的備註', 'note-heading'), body);
  } else box.append(toggle, body);
  let current: DecisionNote = { ...options.note };
  if (options.decision !== 'UNDECIDED') {
    const codes = reasonCodes[options.decision] as readonly ReasonCode[],
      field = element('label', undefined, 'note-reason'),
      select = element('select');
    select.dataset.noteReason = 'true';
    select.append(new Option('不指定原因', ''));
    for (const code of codes) select.append(new Option(reasonLabels[options.decision][code], code));
    select.value = current.reason && codes.includes(current.reason) ? current.reason : '';
    select.onchange = () => {
      current = { ...current, reason: (select.value || undefined) as ReasonCode | undefined };
      if (!current.reason) delete current.reason;
      options.onInput(current);
      options.onCommit();
    };
    field.append(element('span', options.decision === 'KEEP' ? '保留原因' : '移除原因'), select);
    body.append(field);
  }
  const area = element('textarea');
  area.dataset.noteText = 'true';
  area.rows = options.alwaysOpen ? 2 : 3;
  area.maxLength = NOTE_LIMIT;
  area.value = current.note || '';
  area.placeholder = '例如：這個欄位改成必填、這個流程併到另一個畫面、移除的理由';
  area.setAttribute('aria-label', `${options.label}的備註`);
  const count = element('span', undefined, 'note-count');
  const showCount = () => {
    count.textContent = `${Array.from(area.value).length}／${NOTE_LIMIT}`;
  };
  showCount();
  area.oninput = () => {
    showCount();
    current = { ...current, note: area.value };
    if (!area.value) delete current.note;
    options.onInput(current);
  };
  area.onchange = () => options.onCommit();
  const help = element('p', undefined, 'muted note-help');
  help.append(element('span', '備註會寫進 md，交給 AI 作為修改依據。'), count);
  body.append(area, help);
  return box;
}
