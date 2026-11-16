# dsh-agent-team

[English](README.md) | [中文](README.zh.md)

A multi-model **Agent Team group chat** plugin for [dsh](https://github.com/deepseek-ai/deepseek-harness): create a team of agents backed by different providers, @mention the member you want, and let them work on the task — like an Agent Team in your sidebar.

## Features

- **Group chat sidebar panel** — a global left-nav panel with a persistent, on-disk message timeline.
- **@mention dispatch** — each `@member` in your message gets its own one-shot Session; results stream back into the timeline as markdown bubbles.
- **Per-member model routing** — every member can be routed to a different `provider`/`model` via plugin config; members without routing run on the Session default model.
- **Host/Client split** — the Node half owns state and execution (Typert Remote Service + storage domain), the browser half only renders. All RPC goes over the official client-host channel.

## Requirements

- dsh desktop app (or web app) with the plugin manager / Discover page.
- Node.js 24+ and pnpm 11 (via Corepack) to build from source.

## Install (into the official dsh desktop app)

1. Clone and build:

   ```bash
   corepack enable
   pnpm install
   pnpm build
   ```

2. Open the dsh desktop app → **Plugins** page → install with the spec:

   ```
   link:/absolute/path/to/dsh-agent-team/packages/agent-team
   ```

3. The group chat panel appears in the left nav. After code changes, rebuild with `pnpm build` — the HMR recomposition picks up the linked package's new build output; restart the app if your profile has HMR disabled.

## Configure members

Overlay `provider`/`model` routing per member through the plugin row's config:

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

## Repository layout

```
packages/agent-team/       the plugin package (@lossercode/dsh-agent-team)
  src/index.ts             host entry: Typert Remote Service (send / messages)
  src/server/              task dispatch (one Session per @mention) + storage domain store
  src/shared/              roster, @mention parsing (shared by both halves)
  src/client/              sidebar panel UI (slots, React, CSS modules, locales)
packages/typert-protocol/  vendored Typert protocol (build-time, not published)
packages/brand/            vendored brand helpers (build-time, not published)
build/                     vendored build chain (client bundle preset, Typert generation)
```

## License

[MIT](LICENSE). Derived in part from [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (MIT, Copyright (c) 2026 DeepSeek).
