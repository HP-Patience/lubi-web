import { api } from './vault';
import { Modal } from './modal';
import { renderBackups } from './backups';
import type { App } from './app';

export function openSettings(app: App, initial = 'lubi') {
  const tab = app.plugin?.settingTabs[0];
  if (!tab) return;
  const modal = new Modal(app);
  modal.setTitle(initial === 'lubi-backups' ? '备份与恢复' : 'Lubi 设置');
  modal.modalEl.addClass('web-settings-modal');
  const nav = modal.contentEl.createDiv({ cls: 'web-settings-nav', attr: { role: 'tablist', 'aria-label': '设置与数据' } });
  const general = modal.contentEl.createDiv({ cls: 'web-settings-general', attr: { role: 'tabpanel', 'aria-label': '设置' } });
  const backups = modal.contentEl.createDiv({ cls: 'web-settings-backups', attr: { role: 'tabpanel', 'aria-label': '备份与恢复' } });
  let initialized = false;
  const buildSettings = () => {
    if (initialized) return; initialized = true;
    general.createEl('p', { cls: 'web-host-note', text: '独立 Web 数据库，不连接原 Vault。临时 AI Key 仅在当前会话；命名密钥由服务端本地加密保存，与 Obsidian 钥匙串独立。桌面插件安装由 Obsidian 管理。' });
    const actions = general.createDiv({ cls: 'web-settings-actions' });
    actions.createEl('button', { text: '切换明 / 暗主题', type: 'button' }).onclick = () => {
      const dark = document.body.classList.toggle('theme-dark');document.body.classList.toggle('theme-light', !dark);localStorage.setItem('lubi-theme', dark ? 'dark' : 'light');
    };
    actions.createEl('button', { text: '命令面板（Ctrl / ⌘ + P）', type: 'button' }).onclick = () => app.showCommands();
    actions.createEl('button', { text: '查看 Web 文件', type: 'button' }).onclick = () => app.showFiles();
    actions.createEl('button', { text: '退出登录', type: 'button' }).onclick = async () => {
      await api('/auth/logout', { method: 'POST' });app.secretStorage.clear();location.reload();
    };
    tab.display();general.append(tab.containerEl);
  };
  renderBackups(app, backups);
  const controls = ['设置', '备份与恢复'].map(text => nav.createEl('button', { text, type: 'button', attr: { role: 'tab' } }));
  const activate = (index: number) => {
    if (!index) buildSettings();
    // Keep settings DOM alive across tabs: switching never erases partially filled fields.
    general.hidden = !!index;backups.hidden = !index;
    controls.forEach((control, i) => { control.setAttribute('aria-selected', String(i === index));control.tabIndex = i === index ? 0 : -1; });
    modal.setTitle(index ? '备份与恢复' : 'Lubi 设置');
  };
  controls.forEach((control, index) => {
    control.onclick = () => activate(index);
    control.onkeydown = event => {
      if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        event.preventDefault();const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1-index;activate(next);controls[next].focus();
      }
    };
  });
  activate(initial === 'lubi-backups' ? 1 : 0);
  modal.onClose = () => { if (initialized) tab.hide(); };
  modal.open();
}
