const validViews = new Set(['today', 'plan', 'review', 'settings']);
const navItems = [...document.querySelectorAll('[data-view]')];
const panels = [...document.querySelectorAll('[data-panel]')];

function renderView(view) {
  const nextView = validViews.has(view) ? view : 'today';
  navItems.forEach((item) => {
    const active = item.dataset.view === nextView;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-current', active ? 'page' : 'false');
  });
  panels.forEach((panel) => panel.classList.toggle('is-visible', panel.dataset.panel === nextView));
}
function setView(view) {
  const nextView = validViews.has(view) ? view : 'today';
  history.replaceState(null, '', `#${nextView}`);
  renderView(nextView);
}
function showPreviewToast(message) {
  document.querySelector('.preview-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'preview-toast';
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2200);
}

navItems.forEach((item) => item.addEventListener('click', () => setView(item.dataset.view)));
window.addEventListener('hashchange', () => renderView(location.hash.slice(1)));
renderView(location.hash.slice(1));

document.querySelectorAll('.task-row').forEach((row) => {
  row.addEventListener('click', () => {
    const check = row.querySelector('.check');
    if (!check) return;
    const done = check.classList.toggle('is-checked');
    check.textContent = done ? '✓' : '';
    row.classList.toggle('is-done', done);
    const completed = document.querySelectorAll('.task-row.is-done').length;
    const progress = document.querySelector('.progress-copy');
    if (progress) progress.textContent = `${completed} / 6 已完成`;
    showPreviewToast(done ? '已标记完成（静态预览）' : '已恢复为未完成（静态预览）');
  });
});

document.querySelector('.timer-actions .button-quiet')?.addEventListener('click', (event) => {
  const button = event.currentTarget;
  const paused = button.textContent.includes('暂停');
  button.textContent = paused ? '继续' : '暂停';
  document.querySelector('.live-dot')?.classList.toggle('is-paused', paused);
  showPreviewToast(paused ? '计时已暂停（静态预览）' : '计时已继续（静态预览）');
});

document.querySelector('.segmented')?.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  document.querySelectorAll('.segmented button').forEach((button) => button.classList.toggle('is-active', button === target));
  showPreviewToast(`${target.textContent}视图（静态预览）`);
});

document.querySelectorAll('.button-dark, .button-quiet, .add-task, .add-record, .pending-action, .setting-action, .today-button, .icon-button').forEach((button) => {
  if (button.closest('.timer-actions') || button.closest('.segmented')) return;
  button.addEventListener('click', () => showPreviewToast('这是静态设计预览，尚未接入真实数据'));
});
