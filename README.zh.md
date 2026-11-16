# dsh-agent-team

[English](README.md) | [中文](README.zh.md)

面向 [dsh](https://github.com/deepseek-ai/deepseek-harness) 的多模型 **Agent Team 群组聊天**插件：组建一支由不同 provider 驱动的 agent 团队，@提及 你想呼叫的成员，把任务交给它执行——就像侧边栏里的 Agent Team。

## 功能特性

- **群聊侧边栏面板** —— 全局左侧导航面板，消息时间线落盘持久化。
- **@提及 分派** —— 每条消息里的 `@成员` 各自获得一个一次性 Session，回答以 markdown 气泡流式回填到时间线。
- **按成员路由模型** —— 每个成员都可以通过插件配置路由到不同的 `provider`/`model`；未配置路由的成员使用 Session 默认模型。
- **Host/Client 双端架构** —— Node 半持有状态与执行（Typert Remote Service + storage domain），浏览器半只负责渲染，全部 RPC 走官方 client-host 通道。

## 环境要求

- 带插件管理器（插件页 / Discover）的 dsh 桌面端或 Web 端。
- 从源码构建需要 Node.js 24+ 与 pnpm 11（通过 Corepack）。

## 安装（官方 dsh 桌面端）

1. 克隆并构建：

   ```bash
   corepack enable
   pnpm install
   pnpm build
   ```

2. 打开 dsh 桌面端「插件」页，用以下 spec 安装：

   ```
   link:/你的绝对路径/dsh-agent-team/packages/agent-team
   ```

3. 左侧导航会出现群聊面板。改代码后重新 `pnpm build`，HMR 重组会拾取 link 包的新构建产物；未启用 HMR 的 profile 重启应用即可生效。

## 配置成员

在插件行的 config 里按成员覆盖 `provider`/`model` 路由：

```yaml
- id: agent-team
  name: '@lossercode/dsh-agent-team'
  config:
    members:
      deepseek:
        provider: deepseek
        model: deepseek-chat
      glm:
        provider: zhipu
        model: glm-4.6
```

## 仓库结构

```
packages/agent-team/       插件包（@lossercode/dsh-agent-team）
  src/index.ts             Host 入口：Typert Remote Service（send / messages）
  src/server/              任务分派（每个 @提及 一个 Session）+ storage domain 存储
  src/shared/              成员 roster、@提及 解析（双端共享）
  src/client/              侧边栏面板 UI（slots、React、CSS modules、多语言）
packages/typert-protocol/  vendored Typert 协议（构建期使用，不发布）
packages/brand/            vendored brand 工具（构建期使用，不发布）
build/                     vendored 构建链（client bundle preset、Typert 生成脚本）
```

## 许可证

[MIT](LICENSE)。部分代码派生自 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（MIT，Copyright (c) 2026 DeepSeek）。
