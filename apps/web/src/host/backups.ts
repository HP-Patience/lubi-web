import { api } from './vault';
import { Notice } from './ui';
import { downloadText } from './browser';
import type { App } from './app';

/** Presentation only: each format retains its original exporter/parser and isolated restore. */
export function renderBackups(app: App, host: HTMLElement): void {
  host.createEl('p', { cls: 'web-host-note', text: '先按用途选择格式。三种备份不能互换；网页恢复只新建隔离副本，不覆盖当前任务、日记或在线数据库。这里的数据独立于原 Obsidian Vault。' });
  const card = (name: string, tag: string, contents: string, omissions: string, restore: string) => {
    const section = host.createEl('section', { cls: 'web-backup-card', attr: { 'aria-label': name } });
    const head = section.createDiv({ cls: 'web-backup-heading' });
    head.createEl('h3', { text: name });head.createSpan({ text: tag, cls: 'web-backup-format' });
    section.createEl('p', { text: contents });
    section.createEl('p', { cls: 'web-backup-caution', text: omissions });
    section.createEl('p', { text: restore });
    return section;
  };
  const business = card('业务数据 JSON', 'lubi-data · v1',
    '用于交换或核对业务内容：任务、项目、时间记录与支出。',
    '不含日记其他章节、插件设置、命名密钥或数据库历史；JSON 任务导入模板也不等于这个完整导出。',
    '恢复入口：恢复业务数据。校验完整业务导出后，生成新的任务、日记和恢复说明，不自动替换当前数据。');
  const businessActions = business.createDiv({ cls: 'web-backup-actions' });
  const exportBusiness = businessActions.createEl('button', { text: '导出数据 JSON', type: 'button' });
  exportBusiness.onclick = async () => { exportBusiness.disabled = true;try { await app.plugin.exportJson(); } finally { exportBusiness.disabled = false; } };
  businessActions.createEl('button', { text: '恢复业务数据', type: 'button' }).onclick = () => app.plugin.openProduct('restore');

  const files = card('Web 文件备份', 'lubi-web-vault',
    '用于保留 Web 工作区文件：任务 JSON、完整 Markdown 日记、其他 Web 文件与文件夹，附带修订信息。',
    '不包含插件设置、计时会话、AI 密钥、旧版业务表或完整数据库历史。恢复只导入文件，不应用设置或密钥。',
    '恢复入口：恢复 Web 文件备份。先校验预览，再把文件写入新的隔离目录；当前工作文件保持原样。');
  const fileActions = files.createDiv({ cls: 'web-backup-actions' });
  const download = fileActions.createEl('button', { text: '下载 Web 文件备份', type: 'button' });
  const status = files.createEl('p', { cls: 'web-backup-status', attr: { role: 'status' } });
  download.onclick = async () => {
    download.disabled = true;status.setText('正在读取并导出…');
    try { const value = await api('/vault/export');downloadText('lubi-web-vault.json', JSON.stringify(value, null, 2));status.setText('已生成下载。文件可能包含私人内容，请妥善保存。'); }
    catch (error) { status.setText('导出失败：'+(error as Error).message);new Notice((error as Error).message); }
    finally { download.disabled = false; }
  };
  fileActions.createEl('button', { text: '恢复 Web 文件备份', type: 'button' }).onclick = () => app.restoreFiles();
  fileActions.createEl('button', { text: '查看 Web 文件', type: 'button' }).onclick = () => app.showFiles();

  const database = card('SQLite 整库与密钥备份', '服务器 / 本机维护',
    '用于完整恢复运行环境的数据部分：SQLite 数据库、历史、设置、加密命名密钥；存在本地加密 key 文件时一并备份。',
    '访问密码、.env.local 和外部 LUBI_SECRET_KEY 不包含在普通备份目录中，须另行安全保管。含密钥的备份不可公开或提交到仓库。',
    '只在运行 Lubi 的电脑或服务器执行。恢复命令校验后创建全新目录；检查通过后再由维护者切换配置并重启，不从网页覆盖在线库。');
  const instructions = database.createEl('details', { cls: 'web-backup-commands' });
  instructions.createEl('summary', { text: '查看本机 / 服务器命令' });
  instructions.createEl('p', { text: '在项目根目录执行，示例目标目录必须尚不存在。先阅读 README 的备份说明。' });
  instructions.createEl('pre', { text: 'npm run backup -- backups/manual-review\nnpm run restore:db -- backups/manual-review data/restored-review' });
}
