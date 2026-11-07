const navItems = [...document.querySelectorAll('[data-view]')];
const panels = [...document.querySelectorAll('[data-panel]')];
const setView = (view) => {
  navItems.forEach((item) => item.classList.toggle('is-active', item.dataset.view === view));
  panels.forEach((panel) => panel.classList.toggle('is-visible', panel.dataset.panel === view));
  history.replaceState(null, '', `#${view}`);
};
navItems.forEach((item) => item.addEventListener('click', () => setView(item.dataset.view)));
const initial = location.hash.slice(1);
if (['today', 'plan', 'review', 'settings'].includes(initial)) setView(initial);

document.querySelectorAll('.task-row').forEach((row) => {
  row.addEventListener('click', () => {
    const check = row.querySelector('.check');
    if (!check) return;
    const done = check.classList.toggle('is-checked');
    check.textContent = done ? '✓' : '';
    row.classList.toggle('is-done', done);
  });
});

document.querySelector('.timer-actions .button-quiet')?.addEventListener('click', (event) => {
  const button = event.currentTarget;
  button.textContent = button.textContent.includes('暂停') ? '▶ 继续' : 'Ⅱ 暂停';
  document.querySelector('.live-dot')?.classList.toggle('is-paused');
});

document.querySelector('.segmented')?.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  document.querySelectorAll('.segmented button').forEach((button) => button.classList.toggle('is-active', button === target));
});
