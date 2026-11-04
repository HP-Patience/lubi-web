<p align="center">
  <img src="assets/readme/hero.svg" width="100%" alt="lubi-web：Lubi 时间记录 Web 版">
</p>

<p align="center">
  <strong>Lubi 时间记录的 Web 版：复用插件的业务引擎与浏览器宿主，把 Markdown 时间轴搬到网页里。</strong><br>
  monorepo 结构，前后端分离；当前状态是待审核，尚未部署。
</p>

<p align="center">
  <a href="https://github.com/HP-Patience/lubi-web"><img src="https://img.shields.io/github/stars/HP-Patience/lubi-web?style=flat-square&color=f2c14e" alt="GitHub stars"></a>
  <a href="https://github.com/HP-Patience/lubi-web"><img src="https://img.shields.io/github/last-commit/HP-Patience/lubi-web?style=flat-square&color=3ec6b0" alt="最近提交"></a>
  <a href="#状态"><img src="https://img.shields.io/badge/status-preview-f2c14e?style=flat-square" alt="状态：待审核"></a>
  <a href="https://github.com/HP-Patience/lubi-web"><img src="https://img.shields.io/badge/stack-monorepo-8b93a1?style=flat-square" alt="结构"></a>
</p>

## 这是什么

Lubi（柳比歇夫时间记录）的 Web 版本。业务逻辑不重写，直接复用 Obsidian 插件 1.8.0 的引擎与 schema v14，只替换宿主环境。

## 结构

```text
apps/          # Web 应用（前端 + 服务端）
packages/      # 共享的业务引擎与类型
data/          # 本地数据目录
docs/          # 设计说明与迁移记录
backups/       # 迁移前的数据备份
```

## 状态

**仅供审核，尚未部署。** 基线是已运行的 `a6c02ea`。

## 运行

```bash
npm install
npm run dev
```

数据格式与插件保持一致，可以直接读插件的 Markdown 文件。
