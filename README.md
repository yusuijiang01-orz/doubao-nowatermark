<div align="center">

# 豆包无水印下载

**Doubao Image Watermark Remover**

一键下载豆包 AI 生成的无水印原图，支持双策略自动降级，精确 ID 匹配杜绝串图。

[![Version](https://img.shields.io/badge/version-3.1.0-blue.svg)](https://github.com/yusuijiang01-orz/doubao-nowatermark)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-Extension-yellow.svg)](https://developer.chrome.com/docs/extensions/)
[![Platform](https://img.shields.io/badge/platform-doubao.com-orange.svg)](https://www.doubao.com)

</div>

---

## ✨ 功能特性

- 🚀 **方案 A（优先）**：直接拦截豆包 API 响应，提取 `image_ori_raw` 原图 URL，无损下载完整原图
- 🔄 **方案 B（备用）**：当原图 URL 无法获取时，自动切换为 Canvas 合并模式——将豆包提供的两张互补水印图拼合，生成无水印完整图片
- 🎯 **精确 ID 匹配**：通过图片唯一 ID 精确关联 ori / dld / pre 三种 URL，彻底杜绝「串图」和「下载到头像」的问题
- ⚡ **自动降级**：两套方案无缝衔接，5 秒内未捕获到原图 URL 自动切换备用方案
- 📊 **实时统计**：Popup 面板实时显示本次会话捕获到的原图数量

---

## 🖥️ 效果预览

> 打开豆包页面，在 AI 生成的图片上会出现「**下载无水印**」按钮，点击即可保存原图。

---

## 📦 安装方法

### 方式一：开发者模式加载（推荐，免费）

1. 下载本仓库：点击页面右上角 **`Code`** → **`Download ZIP`**，解压到任意文件夹
2. 打开 Chrome，地址栏输入 `chrome://extensions/`
3. 右上角开启 **「开发者模式」**
4. 点击 **「加载已解压的扩展程序」**，选择解压后的 `doubao-extension` 文件夹
5. 扩展图标出现在工具栏，安装完成 ✅

### 方式二：Chrome 应用商店（即将上架）

> Chrome Web Store 审核中，上架后会在此处更新链接。

---

## 🚀 使用方法

1. 打开 [豆包](https://www.doubao.com) 并**刷新页面**（让扩展生效）
2. 让豆包生成一张图片
3. 将鼠标悬停在图片上，点击出现的 **「下载无水印」** 按钮
4. 图片自动保存到浏览器下载目录 🎉

---

## 🔧 技术原理

```
用户点击「下载无水印」
        │
        ▼
  ★ 方案 A（优先）
  拦截豆包 API 响应 JSON
  提取 image_ori_raw 原图 URL
        │ 成功                  │ 5秒超时/未获取
        ▼                       ▼
  chrome.downloads         ★ 方案 B（备用）
  直接下载原图              触发官方下载按钮
  ✅ 完整无损原图           捕获 dld + pre URL
                           Canvas 拼合两张互补水印图
                           ✅ 保存无水印 PNG
```

### 为什么两张图能拼出无水印原图？

豆包的水印策略是将水印分散在两张图的不同位置（互补分布）：
- `pre`（预览图）：水印在某些区域
- `dld`（下载图）：水印在另一些区域

两张图在同一位置**必有一张是干净的**，通过 Canvas 逐像素选取较亮/合适的像素，即可还原出完整无水印图片。

---

## 📁 文件结构

```
doubao-extension/
├── manifest.json      # 扩展配置，声明权限和入口
├── injected.js        # 注入页面主世界，拦截 fetch/XHR 获取 API 响应
├── content.js         # 内容脚本，控制按钮注入和下载逻辑
├── background.js      # Service Worker，处理原图直接下载
├── popup.html         # 点击扩展图标弹出的面板
├── popup.js           # 面板逻辑，显示版本和捕获统计
└── icons/             # 扩展图标（16 / 48 / 128px）
```

---

## ⚠️ 注意事项

- 本扩展**仅支持谷歌 Chrome 浏览器**，不支持豆包桌面客户端（桌面版无法加载 Chrome 扩展）
- 请在**打开豆包页面后刷新一次**，确保扩展脚本已注入
- 本工具仅用于下载**自己生成的图片**，请勿用于侵犯他人版权
- 豆包界面如有更新，可能需要同步更新本扩展

---

## 📄 许可证

[MIT License](LICENSE) — 自由使用、修改、分发，保留原作者信息即可。

---

<div align="center">

Made with ❤️ by [@yusuijiang01-orz](https://github.com/yusuijiang01-orz)

如果这个工具对你有帮助，欢迎点个 ⭐ Star！

</div>
