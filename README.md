# Loom App

A Happy-inspired Expo client for Loom. It is a separate Web/iOS/Android app:
Loom remains the backend and source of truth for projects, tasks, worktrees,
agent sessions, diffs, and notes.

## Architecture

```text
Loom App (Expo)
        |
        | HTTP
        v
Loom App Gateway :8787
        |
        | authenticated proxy
        v
loom web :8765
```

The gateway keeps `LOOM_WEB_AUTH_TOKEN` out of the browser bundle and adds
CORS for Expo Web. It currently proxies Loom's existing `/api/*` surface.

## Run locally

From the cloned repository:

```bash
cd /home/charlie/loom-app
pnpm install

# Terminal 1: existing Loom backend
loom web --project /home/charlie --projects --auth-token "$LOOM_WEB_AUTH_TOKEN"

# Terminal 2: mobile-safe proxy
LOOM_BASE_URL=http://127.0.0.1:8765 \
LOOM_WEB_AUTH_TOKEN="$LOOM_WEB_AUTH_TOKEN" \
pnpm gateway

# Terminal 3: Expo Web
EXPO_PUBLIC_LOOM_GATEWAY_URL=http://127.0.0.1:8787 \
pnpm web
```

For a physical phone, bind the gateway to your private LAN/Tailscale interface
and point Expo at that address:

```bash
LOOM_APP_HOST=0.0.0.0 pnpm gateway
EXPO_PUBLIC_LOOM_GATEWAY_URL=http://YOUR_PRIVATE_IP:8787 pnpm --filter loom-app start
```

Do not expose the gateway directly to the public internet. Put it behind TLS
and authentication, or access it through the existing Loom SSH/Tailscale
tunnel.

## Current MVP

- Browse Loom projects and tasks
- Responsive Happy-style session list
- Inspect task status, notes, terminal activity, and code changes
- Start and stop an agent
- Send a message to the active Cursor/Claude/Codex pane
- Run as Expo Web, iOS, or Android

## Next protocol layer

Loom's current API is terminal-first. A later gateway version should tail the
agent session transcript and expose structured messages over SSE/WebSocket.
That will replace the terminal snapshot with native Happy-style message and
permission cards without changing Loom itself.

## Open-source attribution

This app follows the Expo product patterns and visual direction of
[Happy](https://github.com/slopus/happy). Happy is MIT licensed; this
repository retains its `LICENSE` and copyright notice.
