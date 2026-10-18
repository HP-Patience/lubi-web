// 主视图：顶栏（日期 + 两页切换）+ 内容区

import { ItemView, Menu, WorkspaceLeaf } from "obsidian";
import type LubiPlugin from "../main";
import { shiftDate, shortDate, todayStr, weekdayZh, weekStart } from "../core/time";
import { iconButton, segmented, button, debounce, hideTip, tip } from "./components";
import { renderReview, ReviewState } from "./review";
import { ganttWindow } from "../core/gantt";
import { renderTasks, TasksState } from "./tasks";
import { ShortcutsModal, TaskModal, openUnifiedRecord } from "./modals";
import { AiTaskModal } from "./aiTask";
import { fitGanttLabels, updateGanttNow } from "./ganttLabels";
import { JsonTaskImportModal } from "./taskImport";
import { updateBackgroundClocks } from "./execution";

export const VIEW_TYPE = "lubi-dashboard";
export type Tab = "tasks" | "review";

let tabLabelId = 0;

export class DashboardView extends ItemView {
  date = todayStr();
  tab: Tab = "tasks";
  review: ReviewState = { period: "week", anchor: todayStr(), display: "chart" };
  tasksState: TasksState = { selectedDate: todayStr(), scheduleView: "list", period: "day", ganttCollapsed: new Set() };
  private body!: HTMLElement;
  private dateLabel!: HTMLElement;
  private todayBtn!: HTMLButtonElement;
  private contextLabel!: HTMLElement;
  private ctaLabel?: HTMLElement;
  private keyHandler?: (e: KeyboardEvent) => void;
  private serial = 0;
  private tasksReady = false;
  private lastRenderKey = "";
  private visitedReview = false;
  private readonly scrollCache = new Map<string, { body: number; timeline?: number; week?: number; ganttLeft?: number; ganttTop?: number }>();
  private panelObserver?: ResizeObserver;
  private ganttObserved?: HTMLElement;
  private ganttClock?: number;
  readonly refresh = debounce(() => void this.render(), 150);

  constructor(leaf: WorkspaceLeaf, private plugin: LubiPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE;
  }
  getDisplayText(): string {
    return "Lubi 记录";
  }
  getIcon(): string {
    return "hourglass";
  }

  async onClose(): Promise<void> {
    hideTip();
    this.panelObserver?.disconnect();
    if (this.ganttClock !== undefined) window.clearInterval(this.ganttClock);
    this.ganttClock = undefined;
    if (this.keyHandler) document.removeEventListener("keydown", this.keyHandler);
    this.keyHandler = undefined;
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("lubi-root");
    if (this.ganttClock !== undefined) window.clearInterval(this.ganttClock);
    this.ganttClock = undefined;
    const sizePanel = () => {
      fitGanttLabels(root);
      const height = root.getBoundingClientRect().height;
      if (height >= 200) root.style.setProperty("--lubi-panel-height", `${Math.round(height)}px`);
    };
    sizePanel();
    if (typeof ResizeObserver !== "undefined") {
      this.panelObserver?.disconnect();
      this.panelObserver = new ResizeObserver(sizePanel);
      this.panelObserver.observe(root);
    }
    this.buildHeader(root);
    this.body = root.createDiv({ cls: "lubi-body" });
    await this.loadAndRender();
  }

  private async loadAndRender(): Promise<void> {
    this.body.setAttribute("aria-busy", "true");
    this.body.empty();
    this.body.createDiv({ cls: "lubi-load-state", text: "正在读取任务…", attr: { role: "status" } });
    try { await this.plugin.tasks.load(); this.tasksReady = true; await this.render(); }
    catch (error) {
      this.body.empty();
      const warning = this.body.createDiv({ cls: "lubi-read-warning", attr: { role: "alert" } });
      warning.createEl("strong", { text: "任务暂不可读" });
      warning.createDiv({ text: `未把读取失败当作空任务：${(error as Error).message}` });
      button(warning, "重新读取任务", () => void this.loadAndRender());
    } finally { this.body.setAttribute("aria-busy", "false"); }
  }

  private buildHeader(root: HTMLElement): void {
    // 三段式栅格：左 = 日期 / 周期上下文（永不留空）；中 = 两页切换（位置恒定）；右 = 主操作 + 更多
    const bar = root.createDiv({ cls: "lubi-topbar" });
    const left = bar.createDiv({ cls: "lubi-topbar-left" });
    const nav = left.createDiv({ cls: "lubi-nav lubi-day-nav" });
    iconButton(nav, "chevron-left", "前一天（←）", () => this.setDate(shiftDate(this.date, -1)));
    this.dateLabel = tip(nav.createEl("button", { cls: "lubi-date-label" }), "点击选择日期");
    const picker = nav.createEl("input", { type: "date", cls: "lubi-date-picker", attr: { tabindex: "-1", "aria-hidden": "true" } });
    this.dateLabel.addEventListener("click", () => {
      picker.value = this.date;
      const p = picker as HTMLInputElement & { showPicker?: () => void };
      if (p.showPicker) p.showPicker();
      else picker.click();
    });
    picker.addEventListener("change", () => picker.value && this.setDate(picker.value));
    iconButton(nav, "chevron-right", "后一天（→）", () => this.setDate(shiftDate(this.date, 1)));
    this.todayBtn = tip(nav.createEl("button", { cls: "lubi-btn lubi-btn-sm lubi-today-btn", text: "今天" }), "回到今天（T）");
    this.todayBtn.addEventListener("click", () => this.setDate(todayStr()));
    this.contextLabel = left.createDiv({ cls: "lubi-context", attr: { "aria-live": "polite" } });

    const tabs = segmented<Tab>(bar, [
      { id: "tasks", label: "计划" },
      { id: "review", label: "回顾" },
    ], this.tab, (t) => this.setTab(t));
    tabs.addClass("lubi-topbar-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.querySelectorAll<HTMLElement>(".lubi-seg-item").forEach((b, i) => {
      const label = b.querySelector("span")!;
      label.id = `lubi-tab-label-${++tabLabelId}`;
      b.setAttribute("aria-labelledby", label.id);
      b.setAttribute("aria-keyshortcuts", String(i + 1));
    });

    const right = bar.createDiv({ cls: "lubi-topbar-right" });
    const record = button(right, "记用时", () => openUnifiedRecord(this.plugin, this.activeDate(), {}, () => this.refresh()), { icon: "clock", cls: "lubi-topbar-record" });
    tip(record, "记录真实投入；不会自动完成任务，也可切换记录支出");
    const cta = button(right, this.ctaText(), () => this.openNew(), { primary: true, icon: "plus", cls: "lubi-topbar-cta" });
    this.ctaLabel = cta.querySelector<HTMLElement>("span:not(.lubi-icon)") || undefined;
    tip(cta, "新建任务（N）：先写任务与安排，需要时再展开更多信息");
    cta.createSpan({ cls: "lubi-kbd lubi-kbd-cta", text: "N" });
    iconButton(right, "more-horizontal", "更多", () => undefined, "lubi-more-btn").addEventListener("click", (e) => this.openMore(e));

    // 视图内快捷键（输入框、模态内不触发）
    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => this.onKey(e);
      document.addEventListener("keydown", this.keyHandler);
    }
  }

  /** Ordinary creation is planning-only by default, on every page and schedule view. */
  openNew(): void {
    new TaskModal(this.app, this.plugin, { defaults: { date: this.activeDate() }, recordDate: this.activeDate(), onSaved: () => this.refresh() }).open();
  }

  private openMore(e: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("JSON 任务导入").setIcon("braces").onClick(() => new JsonTaskImportModal(this.app, this.plugin, () => this.refresh()).open()));
    menu.addItem((i) => i.setTitle("AI 创建任务").setIcon("sparkles").onClick(() => new AiTaskModal(this.app, this.plugin, this.activeDate(), () => this.refresh()).open()));
    menu.addItem((i) => i.setTitle("打开日记文件").setIcon("file-text").onClick(() => void this.plugin.openJournal(this.activeDate())));
    menu.addItem((i) => i.setTitle("备份与恢复").setIcon("archive").onClick(() => {
      // Web-owned host destination; the original Obsidian reference is not changed.
      const host = this.app as unknown as { setting: { openTabById: (id: string) => void } };
      host.setting.openTabById("lubi-backups");
    }));
    menu.addItem((i) => i.setTitle("快捷键").setIcon("keyboard").onClick(() => new ShortcutsModal(this.app).open()));
    menu.addItem((i) => i.setTitle("设置").setIcon("settings").onClick(() => this.plugin.openSettings()));
    menu.showAtMouseEvent(e);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.closest("input, textarea, select, [contenteditable='true'], .modal, .modal-container, .menu") || t.isContentEditable)) return;
    if (document.body.querySelector(".modal-container, .lubi-modal")) return;
    // 只响应当前激活的 Lubi 面板：焦点在面板内，或它是工作区的活动视图
    const ws = this.app.workspace as unknown as { getActiveViewOfType?: (c: unknown) => unknown };
    const active = (t && this.contentEl.contains(t)) || ws.getActiveViewOfType?.(DashboardView) === this;
    if (!active) return;
    const key = e.key;
    if (key === "n" || key === "N") { e.preventDefault(); this.openNew(); }
    else if (key === "1" || key === "2") { e.preventDefault(); this.setTab((["tasks", "review"] as Tab[])[Number(key) - 1]); }
    else if ((key === "t" || key === "T") && this.tab !== "review") { e.preventDefault(); this.setDate(todayStr()); }
    else if (key === "?") { e.preventDefault(); new ShortcutsModal(this.app).open(); }
    else if ((key === "ArrowLeft" || key === "ArrowRight") && this.tab !== "review") {
      // 时间轴块内的方向键另有用途；只在非块元素上切换日期
      if (t && t.closest(".lubi-block, .lubi-timeline, .lubi-chart, .lubi-week, .lubi-gantt-scroll")) return;
      e.preventDefault();
      this.setDate(shiftDate(this.date, key === "ArrowLeft" ? -1 : 1));
    }
  }

  private contextText(): string {
    if (this.tab === "review") {
      const a = this.review.anchor;
      if (this.review.period === "week") { const f = weekStart(a); return `${shortDate(f)} – ${shortDate(shiftDate(f, 6))}`; }
      if (this.review.period === "month") return `${a.slice(0, 4)} 年 ${Number(a.slice(5, 7))} 月`;
      return `${a.slice(0, 4)} 年`;
    }
    const days = ganttWindow(this.tasksState.selectedDate, this.tasksState.period);
    return days.length === 1 ? days[0] : `${shortDate(days[0])} – ${shortDate(days[days.length - 1])}`;
  }

  activeDate(): string {
    return this.tab === "tasks" ? this.tasksState.selectedDate : todayStr();
  }

  /** 顶栏与计划内部共用选中日期。 */
  private syncTasksDate(d: string): void {
    this.tasksState.selectedDate = d;
  }

  setDate(d: string): void {
    this.date = d;
    this.syncTasksDate(d);
    void this.render();
  }

  setTab(t: Tab): void {
    if (this.tab === t) return;
    if (t === "review" && !this.visitedReview) {
      this.review.anchor = this.tasksState.selectedDate;
      this.visitedReview = true;
    }
    if (t === "tasks" && this.tasksState.selectedDate !== this.date) this.syncTasksDate(this.date);
    this.tab = t;
    this.syncTabs();
    void this.render();
  }

  /** 主按钮文字跟着页面走：说清楚按下去会得到什么 */
  private ctaText(): string {
    return "新建任务";
  }

  private syncTabs(): void {
    this.contentEl.dataset.tab = this.tab;
    this.ctaLabel?.setText(this.ctaText());
    this.contentEl.querySelectorAll(".lubi-topbar-tabs .lubi-seg-item").forEach((b, i) => b.setAttribute("aria-pressed", String(["tasks", "review"][i] === this.tab)));
  }

  /** 外部跳转：可同时指定页与日期，不重建顶栏 */
  show(tab?: Tab | "today", date?: string): void {
    // 兼容原每日命令及日期跳转；不保留独立页签或渲染路径。
    if (tab === "today") {
      tab = "tasks";
      this.tasksState.scheduleView = "calendar";
      this.tasksState.period = "day";
    }
    if (date) {
      const target = tab || this.tab;
      if (target === "review") { this.review.anchor = date; this.visitedReview = true; }
      else {
        this.date = date;
        this.syncTasksDate(date);
      }
    }
    if (tab) {
      if (tab === "review" && !this.visitedReview) {
        this.review.anchor = this.tasksState.selectedDate;
        this.visitedReview = true;
      }
      if (tab === "tasks" && !date && this.tasksState.selectedDate !== this.date) this.syncTasksDate(this.date);
      this.tab = tab;
    }
    this.syncTabs();
    void this.render();
  }

  async render(): Promise<void> {
    if (!this.tasksReady) return;
    const serial = ++this.serial;
    const sameReview = this.tab === "review" && this.lastRenderKey.startsWith("review:");
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active && this.body.contains(active) ? active.getAttribute("data-lubi-focus") : null;
    hideTip();
    // 任务页内部（周日程翻周、点表头、议程）改了选中日：顶栏日期跟着它
    if (this.tab === "tasks") this.date = this.tasksState.selectedDate;
    const isToday = this.date === todayStr();
    this.dateLabel.empty();
    this.dateLabel.createSpan({ text: `${this.date} 周${weekdayZh(this.date)}` });
    if (isToday) this.dateLabel.createSpan({ cls: "lubi-today-badge", text: "今天" });
    this.dateLabel.toggleClass("is-today", isToday);
    this.todayBtn.disabled = isToday;
    this.todayBtn.toggleClass("is-hidden", isToday);
    this.contentEl.dataset.tab = this.tab;
    this.contextLabel.setText(this.contextText());
    if (this.lastRenderKey) {
      this.scrollCache.set(this.lastRenderKey, {
        body: this.body.scrollTop,
        timeline: this.body.querySelector<HTMLElement>(".lubi-timeline-scroll")?.scrollTop,
        week: this.body.querySelector<HTMLElement>(".lubi-week-body")?.scrollTop,
        ganttLeft: this.body.querySelector<HTMLElement>(".lubi-gantt-scroll")?.scrollLeft,
        ganttTop: this.body.querySelector<HTMLElement>(".lubi-gantt-scroll")?.scrollTop,
      });
      if (this.scrollCache.size > 50) this.scrollCache.delete(this.scrollCache.keys().next().value!);
    }
    const scheduleChanged = this.tab === "tasks" && this.lastRenderKey.startsWith("tasks:") && this.lastRenderKey.split(":")[1] !== this.tasksState.scheduleView;
    const key = this.tab === "review" ? `review:${this.review.period}:${this.review.anchor}`
      : `tasks:${this.tasksState.scheduleView}:${this.tasksState.period}:${this.tasksState.selectedDate}`;
    this.body.setAttribute("aria-busy", "true");
    const loading = window.setTimeout(() => {
      if (serial !== this.serial || !this.body.isConnected) return;
      const old = this.body.querySelector(".lubi-load-state");
      old?.remove();
      const status = this.body.createDiv({ cls: "lubi-load-state", attr: { role: "status" }, text: this.lastRenderKey ? "正在更新…以下保留上次读到的结果，不代表本次读取完成。" : "正在读取…" });
      this.body.prepend(status);
    }, 150);
    const host = createDiv();
    host.addClass("lubi-page");
    const rerender = () => this.refresh();
    try {
      if (this.tab === "review")
        await renderReview(this.plugin, host, this.review, (s) => {
          Object.assign(this.review, s);
          void this.render();
        });
      else await renderTasks(this.plugin, host, this.tasksState.selectedDate, this.tasksState, rerender);
    } catch (e) {
      host.empty();
      const err = host.createDiv({ cls: "lubi-read-warning", attr: { role: "alert" } });
      err.createEl("strong", { text: "数据暂不可读" });
      err.createEl("p", { text: `未按空数据或 0 计算：${(e as Error).message}` });
      button(err, "重新读取", () => void this.render());
    } finally { window.clearTimeout(loading); }
    if (serial !== this.serial) return;
    this.body.setAttribute("aria-busy", "false");
    // Remember intentional disclosure choices on refresh, but never conceal a new read error.
    if (key === this.lastRenderKey) for (const selector of [".lubi-personal-time", ".lubi-background-card"]) {
      const previous = this.body.querySelector<HTMLDetailsElement>(selector);
      const next = host.querySelector<HTMLDetailsElement>(selector);
      if (previous && next && next.dataset.readState !== "error") {
        const becameNonempty = selector === ".lubi-background-card" && !previous.querySelector(".lubi-execution-item") && !!next.querySelector(".lubi-execution-item");
        const firstRecord = selector === ".lubi-personal-time" && !previous.querySelector(".lubi-personal-time-entry") && !!next.querySelector(".lubi-personal-time-entry");
        if (!becameNonempty && !firstRecord) next.open = previous.open;
      }
    }
    const planDetails = host.querySelector<HTMLDetailsElement>(".lubi-plan-task-details");
    if (planDetails) planDetails.open = key === this.lastRenderKey ? this.body.querySelector<HTMLDetailsElement>(".lubi-plan-task-details")?.open ?? true : true;
    const bodyScroll = this.body.scrollTop;
    this.body.empty();
    this.body.appendChild(host);
    if (this.ganttObserved) this.panelObserver?.unobserve(this.ganttObserved);
    this.ganttObserved = host.querySelector<HTMLElement>(".lubi-gantt-table") || undefined;
    if (this.ganttObserved) this.panelObserver?.observe(this.ganttObserved);
    fitGanttLabels(host);
    updateGanttNow(host);
    if (this.ganttClock !== undefined) window.clearInterval(this.ganttClock);
    updateBackgroundClocks(host);
    this.ganttClock = this.ganttObserved || host.querySelector("[data-background-started-at]") ? window.setInterval(() => {
      updateGanttNow(this.contentEl);
      updateBackgroundClocks(this.contentEl);
    }, 30_000) : undefined;
    void document.fonts?.ready.then(() => { if (host.isConnected) fitGanttLabels(host); });

    this.lastRenderKey = key;
    if (focusKey && (document.activeElement === active || document.activeElement === document.body)) {
      const replacements = Array.from(this.body.querySelectorAll<HTMLElement>("[data-lubi-focus]"))
        .filter(element => element.getAttribute("data-lubi-focus") === focusKey);
      const replacement = replacements.find(element => element.getClientRects().length > 0) || replacements[0];
      replacement?.focus({ preventScroll: true });
    }
    if (scheduleChanged) window.requestAnimationFrame(() => {
      if (this.lastRenderKey !== key) return;
      const control = Array.from(this.body.querySelectorAll<HTMLElement>(".lubi-schedule-switch")).find(element => element.getClientRects().length > 0);
      if (!control) return;
      const viewport = this.body.getBoundingClientRect(), rect = control.getBoundingClientRect();
      // Narrow layouts move between the existing agenda and the schedule region: keep the selected view in sight.
      if (rect.top < viewport.top || rect.bottom > viewport.bottom) control.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
    });
    const saved = this.scrollCache.get(key);
    if (sameReview) this.body.scrollTop = bodyScroll;
    if (saved) {
      if (!sameReview) this.body.scrollTop = saved.body;
      window.requestAnimationFrame(() => {
        if (this.lastRenderKey !== key) return;
        const tl = this.body.querySelector<HTMLElement>(".lubi-timeline-scroll");
        const week = this.body.querySelector<HTMLElement>(".lubi-week-body");
      const gantt = this.body.querySelector<HTMLElement>(".lubi-gantt-scroll");
      if (gantt) { if (saved.ganttLeft !== undefined) gantt.scrollLeft = saved.ganttLeft; if (saved.ganttTop !== undefined) gantt.scrollTop = saved.ganttTop; }
        if (tl && saved.timeline !== undefined) { tl.dataset.restored = "1"; tl.scrollTop = saved.timeline; }
        if (week && saved.week !== undefined) { week.dataset.restored = "1"; week.scrollTop = saved.week; }
      });
    }
  }
}
