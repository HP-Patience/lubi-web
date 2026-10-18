/** Web-owned creation layout. Assembled by TaskModal, not a post-render DOM filter.
 * Controls keep their listeners and values. No TaskStore/journal writes occur here.
 */
import type LubiPlugin from '../main';
import type { Task } from '../core/tasks';
interface NewTaskForm {
  host: HTMLElement; task: Task; plugin: LubiPlugin;
  title: HTMLElement; categories: HTMLElement; grid: HTMLElement; start: HTMLElement;
  extras: HTMLElement; actions: HTMLElement; actual: HTMLElement[];
  moreOpen?: boolean; actualOpen?: boolean;
  onCategory: (category: string) => void;
}
export function arrangeNewTaskForm(o: NewTaskForm): void {
  const { host, task } = o;
  const kind = host.querySelector<HTMLElement>('.lubi-kind-seg');
  o.categories.remove();
  host.querySelectorAll('.lubi-task-divider').forEach(el => el.remove());
  const more = host.createEl('details', { cls: 'lubi-new-task-more' });
  more.open = o.moreOpen ?? false;
  const moreSummary = more.createEl('summary');
  const moreBody = more.createDiv({ cls: 'lubi-new-task-more-body' });
  const category = moreBody.createEl('label', { cls: 'lubi-field', text: '分类' });
  const select = category.createEl('select', { attr: { 'aria-label': '分类', 'data-task-category': 'select' } });
  for (const c of o.plugin.settings.categories.filter(c => c.kind === 'time')) select.createEl('option', { value: c.name, text: c.name });
  select.value = task.category;
  select.addEventListener('change', () => o.onCategory(select.value));
  moreBody.append(o.start);
  const actual = host.createEl('details', { cls: 'lubi-new-task-actual' });
  const actualInput = o.actual.flatMap(el => [...el.querySelectorAll<HTMLInputElement>('[data-actual="minutes"]')])[0];
  actual.open = o.actualOpen ?? !!actualInput?.value;
  const actualSummary = actual.createEl('summary');
  const actualBody = actual.createDiv({ cls: 'lubi-new-task-actual-body' });
  actualBody.createEl('p', { cls: 'lubi-form-note', text: '已经投入了时间才填写。预计不会变成实际；是否同时完成，需要明确勾选。' });
  if (kind) { kind.querySelector('[data-lubi-focus="seg:todo"] span')?.setText('用时'); actualBody.append(kind); }
  actualBody.append(...o.actual);
  // All remaining optional planning controls stay in their owner-rendered disclosure.
  for (const node of Array.from(host.children)) {
    if (node !== o.title && node !== o.grid && node !== o.actions && node !== more && node !== actual) moreBody.append(node);
  }
  o.grid.querySelector('.lubi-plan-full-field')?.classList.remove('lubi-plan-full-field');
  if (task.repeat.kind === 'none') o.grid.querySelector('label')?.setText('计划日期');
  const note = host.createEl('p', { cls: 'lubi-form-note', text: '先写要做什么，再安排日期和预计用时。其余信息需要时再填。' });
  host.append(note, o.title, o.grid, more, actual, o.actions);
  const update = () => {
    const filled = [task.project ? '项目' : '', task.notes ? '备注' : '', task.start ? '开始时间' : '', task.repeat.kind !== 'none' ? '重复' : '', task.startDate || task.endDate ? '跨度' : '', task.location ? '地点' : '', task.executor === 'background' ? 'Agent 后台' : '', task.status !== 'todo' ? '状态' : ''].filter(Boolean);
    moreSummary.textContent = '更多安排 · 分类、时间、项目与备注' + (filled.length ? `（已填：${filled.join('、')}）` : '');
    actualSummary.textContent = '同时记一笔实际用时（可选）' + (actualInput?.value.trim() ? ` · 已填 ${actualInput.value.trim()}` : '');
  };
  update();
  for (const container of [more, actual]) for (const event of ['input','change','click']) container.addEventListener(event, () => queueMicrotask(update), true);
}
