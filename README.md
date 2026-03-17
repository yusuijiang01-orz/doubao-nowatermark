<div align="center">

# 豆包无水印下载

**Doubao Image Watermark Remover**

一键下载豆包 AI 生成的无水印图片，支持批量勾选、格式转换、智能命名。

[![Version](https://img.shields.io/badge/version-4.0.3-blue.svg)](https://github.com/yusuijiang01-orz/doubao-nowatermark)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-Extension-yellow.svg)](https://developer.chrome.com/docs/extensions/)
[![Platform](https://img.shields.io/badge/platform-doubao.com-orange.svg)](https://www.doubao.com)

</div>

---

## ✨ 功能特性

### 🖼️ 下载能力
- 🚀 **方案 A（优先）**：拦截豆包 API 响应，提取 `image_ori_raw` 原图 URL，直接无损下载完整原图
- 🔄 **方案 B（备用）**：原图 URL 不可用时自动切换，将豆包提供的两张互补水印图通过 Canvas 拼合，生成完整无水印图片
- 🎯 **精确 ID 匹配**：通过图片唯一 ID 关联 ori / dld / pre 三种 URL，彻底杜绝串图

### 📦 批量下载
- 点击「批量下载」弹出**图片勾选面板**，显示当前页面所有生成图的缩略图
- 支持**逐张勾选**，选中图片高亮显示，底部实时统计已选数量
- 一键「全选 / 全不选」，确认后才开始下载，操作完全可控
- 下载过程中实时显示进度 `[2/5]`，单张失败不影响其余图片

### 🖼️ 格式与质量
- 支持 **PNG（无损）** 和 **JPEG（可调质量）** 两种格式
- JPEG 质量范围 60% ~ 100% 滑动调节
- 格式偏好**持久化保存**，刷新页面不丢失

### 🗂️ 智能文件命名
```
格式：doubao_<对话标题>_<序号>_<图片ID前8位>.<ext>
示例：doubao_画一只猫_01_d4d7b860.png
      doubao_02_a1b2c3d4.jpg   ← 读不到标题时的降级命名
```

---

## 📦 安装方法

### 方式一：开发者模式加载（推荐，免费）

1. 下载本仓库：点击右上角 **`Code`** → **`Download ZIP`**，解压到任意文件夹
2. 打开 Chrome，地址栏输入 `chrome://extensions/`
3. 右上角开启 **「开发者模式」**
4. 点击 **「加载已解压的扩展程序」**，选择解压后的 `doubao-extension` 文件夹
5. 扩展图标出现在工具栏，安装完成 ✅

### 方式二：Chrome 应用商店（即将上架）

> Chrome Web Store 审核中，上架后会在此处更新链接。

---

## 🚀 使用方法

### 单张下载

1. 打开 [doubao.com](https://www.doubao.com) 并**刷新页面**（确保扩展已注入）
2. 让豆包生成图片，图片加载完毕后页面右下角会出现按钮组
3. 点击 **「下载无水印」** → 图片自动保存到浏览器下载目录 🎉

### 批量下载

1. 点击右下角 **「批量下载」** 按钮
2. 弹出勾选面板，显示页面上所有检测到的生成图缩略图
3. 勾选需要下载的图片（默认全选），点击 **「开始下载」**
4. 逐张下载，底部 Toast 实时播报进度

### 格式设置

- 点击右下角 **「⚙」** 按钮打开格式面板
- 在 **PNG 无损** / **JPEG 有损** 之间切换
- 选择 JPEG 时可拖动滑块调节质量（60% ~ 100%）
- 也可在 Popup 面板中同步设置

---

## 🔧 技术原理

```
用户点击「下载无水印」
        │
        ▼
  ★ 方案 A（优先）
  injected.js 拦截 fetch/XHR
  从 API 响应中提取 image_ori_raw URL
        │
     成功 ──────────────────── 5秒超时/未获取
        │                              │
        ▼                              ▼
  [PNG] 直接 chrome.downloads    ★ 方案 B（备用）
  [JPEG] Canvas 转码导出         触发官方下载按钮
        │                        捕获 dld_watermark URL
        ▼                        + pre_watermark URL
  ✅ 完整无损原图                Canvas 上下拼合两张互补图
                                 ✅ 保存无水印图片
```

### 为什么两张图能拼出无水印原图？

豆包的水印策略是将水印分散在两张图的不同区域（互补分布）：
- `pre`（预览图）：上半部分干净，下半部分有水印
- `dld`（下载图）：下半部分干净，上半部分有水印

取 `dld` 的上半 + `pre` 的下半，即可得到完整无水印图片。

---

## 📁 文件结构

```
doubao-extension/
├── manifest.json      # 扩展配置，声明权限和入口文件
├── injected.js        # 注入页面主世界，拦截 fetch/XHR 获取 API 响应
├── content.js         # 内容脚本，控制按钮注入、勾选面板、下载逻辑
├── background.js      # Service Worker，代理图片请求与下载触发
├── popup.html         # 点击扩展图标弹出的设置面板
├── popup.js           # 面板逻辑：格式设置、批量下载、统计数据
└── icons/             # 扩展图标（16 / 48 / 128px）
```

---

## 📋 版本历史

| 版本 | 更新内容 |
|------|---------|
| v4.0.3 | 修复 JPEG 下载报错；批量下载改为勾选面板，用户自主选择图片 |
| v4.0.2 | 修复下载提示成功但实际没有文件的异步 Bug |
| v4.0.1 | 修复格式设置不生效；修复批量下载重复下载同一张 |
| v4.0.0 | 新增批量下载、PNG/JPEG 格式选择、智能文件命名 |
| v3.1.0 | 双策略精确 ID 匹配，杜绝串图 |

---

## ⚠️ 注意事项

- 本扩展**仅支持 Chrome 浏览器**，不支持豆包桌面客户端
- 首次使用请在打开豆包后**刷新一次页面**，确保扩展脚本已注入
- 批量下载建议在图片**全部加载完毕后**再点击，避免漏扫
- 本工具仅用于下载**自己生成的图片**，请勿用于侵犯他人版权
- 若豆包界面更新导致功能异常，请到本仓库提 Issue

---

## 📄 许可证

[MIT License](LICENSE) — 自由使用、修改、分发，保留原作者信息即可。

---

<div align="center">

Made with ❤️ by [@yusuijiang01-orz](https://github.com/yusuijiang01-orz)

如果这个工具对你有帮助，欢迎点个 ⭐ Star！

</div>
