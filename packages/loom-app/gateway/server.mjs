import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';

const host = process.env.LOOM_APP_HOST || '127.0.0.1';
const port = Number(process.env.LOOM_APP_PORT || 8787);
const loomBaseUrl = (process.env.LOOM_BASE_URL || 'http://127.0.0.1:8765').replace(
  /\/+$/,
  '',
);
const loomToken = process.env.LOOM_WEB_AUTH_TOKEN || '';
const gatewayToken = process.env.LOOM_APP_AUTH_TOKEN || '';
const allowedOrigin = process.env.LOOM_APP_ORIGIN || '*';
const xtermEntryUrl = import.meta.resolve('@xterm/xterm');
const xtermJs = await readFile(new URL(xtermEntryUrl));
const xtermCss = await readFile(new URL('../css/xterm.css', xtermEntryUrl));

const terminalHtml = Buffer.from(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
    <link rel="stylesheet" href="/terminal-assets/xterm.css" />
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      html, body, #terminal {
        width: 100%; height: 100%; margin: 0; overflow: hidden;
        background: #111014; touch-action: none;
      }
      body { padding: 10px 8px 8px; }
      .xterm { height: 100%; }
      .xterm-viewport {
        overflow-y: scroll !important;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        touch-action: none;
      }
      #status {
        position: fixed; top: 8px; right: 9px; z-index: 3;
        padding: 4px 7px; border-radius: 9px;
        color: #aaa5b0; background: rgba(32,31,36,.88);
        font: 600 10px -apple-system, BlinkMacSystemFont, sans-serif;
        pointer-events: none; opacity: 0; transition: opacity .18s ease;
      }
      #status.visible { opacity: 1; }
      #status.error { color: #ffaaa1; background: rgba(72,42,43,.96); }
      #terminal-controls {
        position: fixed; right: 10px; bottom: 10px; z-index: 4;
        display: flex; gap: 5px; align-items: center;
        padding: 5px; border-radius: 12px;
        background: rgba(25,24,29,.88); border: 1px solid rgba(99,93,112,.58);
        backdrop-filter: blur(12px);
      }
      #terminal-controls button {
        min-width: 39px; height: 29px; padding: 0 8px;
        border: 1px solid #4a4751; border-radius: 8px;
        color: #aaa5b0; background: #28262d;
        font: 700 10px -apple-system, BlinkMacSystemFont, sans-serif;
      }
      #terminal-controls button:active { transform: translateY(1px); opacity: .8; }
      #terminal-controls #latest.active {
        color: #211a4a; border-color: #a99cff; background: #c8bfff;
      }
    </style>
  </head>
  <body>
    <div id="terminal"></div>
    <div id="status">Connecting…</div>
    <div id="terminal-controls" aria-label="Terminal scroll controls">
      <button type="button" id="page-up" aria-label="Previous terminal page">Pg↑</button>
      <button type="button" id="latest" aria-label="Jump to latest output">Latest</button>
      <button type="button" id="page-down" aria-label="Next terminal page">Pg↓</button>
    </div>
    <script src="/terminal-assets/xterm.js"></script>
    <script>
      (() => {
        const params = new URLSearchParams(location.search);
        const target = params.get('target') || '';
        const cols = Math.max(24, Math.min(220, Number(params.get('cols')) || 60));
        const bottomReserveRows = 4;
        const rows = Math.max(
          10,
          Math.min(100, (Number(params.get('rows')) || 28) - bottomReserveRows)
        );
        const fontSize = Math.max(9, Math.min(22, Number(params.get('fontSize')) || 12));
        const status = document.getElementById('status');
        const notify = (state, detail = '') => {
          status.textContent =
            state === 'live'
              ? 'Live'
              : state === 'paused'
                ? 'Paused'
                : state === 'error'
                  ? detail || 'Disconnected'
                  : 'Connecting…';
          status.className =
            state === 'live' ? '' : 'visible' + (state === 'error' ? ' error' : '');
          window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'terminal-status', state, detail }));
        };

        const term = new Terminal({
          cols,
          rows,
          cursorBlink: true,
          cursorStyle: 'bar',
          cursorWidth: 2,
          fontFamily: 'Menlo, Monaco, ui-monospace, SFMono-Regular, monospace',
          fontSize,
          fontWeight: '400',
          fontWeightBold: '700',
          lineHeight: 1.18,
          letterSpacing: 0,
          scrollback: 5000,
          smoothScrollDuration: 70,
          allowTransparency: true,
          macOptionIsMeta: true,
          theme: {
            background: '#111014',
            foreground: '#ded9e2',
            cursor: '#c8bfff',
            cursorAccent: '#211a4a',
            selectionBackground: 'rgba(169,156,255,.34)',
            black: '#17161a',
            red: '#ffaaa1',
            green: '#82d3a2',
            yellow: '#e7c27d',
            blue: '#a99cff',
            magenta: '#d7a8ff',
            cyan: '#83d6d1',
            white: '#f2eef4',
            brightBlack: '#77727e',
            brightRed: '#ffc0ba',
            brightGreen: '#a8e8bd',
            brightYellow: '#f1d9a3',
            brightBlue: '#c8bfff',
            brightMagenta: '#e6c8ff',
            brightCyan: '#afe9e5',
            brightWhite: '#ffffff'
          }
        });
        term.open(document.getElementById('terminal'));
        const terminalInput = document.querySelector('.xterm-helper-textarea');
        const postTerminalFocus = (focused) => {
          window.ReactNativeWebView?.postMessage(
            JSON.stringify({ type: 'terminal-focus', focused })
          );
        };
        terminalInput?.addEventListener('focus', () => postTerminalFocus(true));
        terminalInput?.addEventListener('blur', () => postTerminalFocus(false));
        window.loomTerminalFocus = () => terminalInput?.focus();
        window.loomTerminalBlur = () => terminalInput?.blur();
        const terminalControls = document.getElementById('terminal-controls');
        if (params.get('nativeControls') === '1') terminalControls.style.display = 'none';
        const latestButton = document.getElementById('latest');
        let lastAtBottom = null;
        let lastScrollReport = 0;
        let userBrowsingHistory = false;
        let writeOperations = 0;
        const updateScrollState = () => {
          const buffer = term.buffer.active;
          const atBottom = buffer.viewportY >= buffer.baseY;
          const linesBehind = Math.max(0, buffer.baseY - buffer.viewportY);
          if (atBottom) userBrowsingHistory = false;
          latestButton.classList.toggle('active', !atBottom);
          const now = Date.now();
          if (atBottom !== lastAtBottom || now - lastScrollReport >= 250) {
            lastAtBottom = atBottom;
            lastScrollReport = now;
            window.ReactNativeWebView?.postMessage(
              JSON.stringify({ type: 'terminal-scroll', atBottom, linesBehind })
            );
          }
        };
        window.loomTerminalControl = (action) => {
          if (action === 'page-up') {
            userBrowsingHistory = true;
            term.scrollPages(-1);
          } else if (action === 'page-down') {
            term.scrollPages(1);
          } else if (action === 'latest') {
            userBrowsingHistory = false;
            term.scrollToBottom();
          }
          updateScrollState();
        };
        window.loomTerminalScrollLines = (value) => {
          const lines = Math.max(-100, Math.min(100, Math.round(Number(value) || 0)));
          if (!lines) return;
          if (lines < 0) userBrowsingHistory = true;
          term.scrollLines(lines);
          updateScrollState();
        };
        document.getElementById('page-up').addEventListener('click', () => window.loomTerminalControl('page-up'));
        document.getElementById('page-down').addEventListener('click', () => window.loomTerminalControl('page-down'));
        latestButton.addEventListener('click', () => window.loomTerminalControl('latest'));
        term.onScroll(() => {
          if (!writeOperations) {
            const buffer = term.buffer.active;
            userBrowsingHistory = buffer.viewportY < buffer.baseY;
          }
          updateScrollState();
        });

        const terminalElement = document.getElementById('terminal');
        const touch = { lastY: 0, remainder: 0, moved: false };
        terminalElement.addEventListener('touchstart', (event) => {
          if (event.touches.length !== 1) return;
          event.preventDefault();
          event.stopPropagation();
          touch.lastY = event.touches[0].clientY;
          touch.remainder = 0;
          touch.moved = false;
        }, { passive: false, capture: true });
        terminalElement.addEventListener('touchmove', (event) => {
          if (event.touches.length !== 1) return;
          event.preventDefault();
          event.stopPropagation();
          const nextY = event.touches[0].clientY;
          const delta = nextY - touch.lastY;
          touch.lastY = nextY;
          touch.remainder += delta;
          if (Math.abs(touch.remainder) >= 5) touch.moved = true;
          const pixelsPerLine = Math.max(5, fontSize * 0.55);
          const lines = Math.trunc(touch.remainder / pixelsPerLine);
          if (lines) {
            if (lines > 0) userBrowsingHistory = true;
            term.scrollLines(-lines);
            touch.remainder -= lines * pixelsPerLine;
            updateScrollState();
          }
        }, { passive: false, capture: true });
        terminalElement.addEventListener('touchend', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!touch.moved) term.focus();
          touch.remainder = 0;
        }, { passive: false, capture: true });
        terminalElement.addEventListener('touchcancel', (event) => {
          event.stopPropagation();
          touch.remainder = 0;
          touch.moved = false;
        }, { passive: true, capture: true });

        let streamId = '';
        let inputQueue = Promise.resolve();
        term.onData((text) => {
          const activeStreamId = streamId;
          if (!activeStreamId) return;
          inputQueue = inputQueue
            .then(() => fetch('/api/tmux/stream-input', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ stream_id: activeStreamId, text })
            }))
            .then((response) => {
              if (!response.ok) throw new Error('Terminal input failed (' + response.status + ')');
            })
            .catch((error) => {
              if (activeStreamId === streamId) notify('error', error.message);
            });
        });

        let controller = null;
        let currentCols = cols;
        let currentRows = rows;
        let resizeTimer = null;
        let reconnectTimer = null;
        let reconnectAttempt = 0;
        let pageClosing = false;
        let paused = false;
        addEventListener('pagehide', () => {
          pageClosing = true;
          paused = true;
          if (resizeTimer) clearTimeout(resizeTimer);
          if (reconnectTimer) clearTimeout(reconnectTimer);
          streamId = '';
          controller?.abort();
        }, { once: true });

        const scheduleReconnect = (detail) => {
          if (pageClosing || paused) return;
          notify('error', detail || 'Terminal disconnected');
          if (reconnectTimer) clearTimeout(reconnectTimer);
          const delay = Math.min(10000, 750 * (2 ** reconnectAttempt));
          reconnectAttempt = Math.min(reconnectAttempt + 1, 4);
          reconnectTimer = setTimeout(() => connect(currentCols, currentRows), delay);
        };

        window.loomTerminalReconnect = () => {
          paused = false;
          reconnectAttempt = 0;
          if (reconnectTimer) clearTimeout(reconnectTimer);
          connect(currentCols, currentRows);
        };

        window.loomTerminalPause = () => {
          if (paused) return;
          paused = true;
          if (reconnectTimer) clearTimeout(reconnectTimer);
          streamId = '';
          controller?.abort();
          notify('paused');
        };

        window.loomTerminalResume = () => {
          if (!paused) return;
          paused = false;
          reconnectAttempt = 0;
          connect(currentCols, currentRows);
        };

        window.loomTerminalResize = (nextCols, nextRows) => {
          const normalizedCols = Math.max(24, Math.min(220, Math.round(Number(nextCols) || currentCols)));
          const normalizedRows = Math.max(
            10,
            Math.min(
              100,
              Math.round(Number(nextRows) || currentRows + bottomReserveRows) - bottomReserveRows
            )
          );
          if (normalizedCols === currentCols && normalizedRows === currentRows) return;
          currentCols = normalizedCols;
          currentRows = normalizedRows;
          term.resize(currentCols, currentRows);
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => connect(currentCols, currentRows), 300);
        };

        async function connect(nextCols = currentCols, nextRows = currentRows) {
          if (paused || pageClosing) return;
          if (!target) {
            notify('error', 'Missing terminal target');
            return;
          }
          const previous = controller;
          streamId = '';
          previous?.abort();
          const activeController = new AbortController();
          controller = activeController;
          if (!previous) notify('connecting');
          try {
            const response = await fetch(
              '/api/tmux/stream?target=' + encodeURIComponent(target) + '&cols=' + nextCols + '&rows=' + nextRows,
              { cache: 'no-store', signal: activeController.signal }
            );
            if (!response.ok || !response.body) {
              throw new Error('Terminal stream failed (' + response.status + ')');
            }
            const nextStreamId = response.headers.get('x-loom-terminal-stream') || '';
            if (!/^[0-9a-f]{32}$/.test(nextStreamId)) {
              throw new Error('Terminal stream input channel is unavailable');
            }
            streamId = nextStreamId;
            reconnectAttempt = 0;
            notify('live');
            const reader = response.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value?.length) {
                const followLatest = !userBrowsingHistory;
                writeOperations += 1;
                term.write(value, () => {
                  if (followLatest && !userBrowsingHistory) term.scrollToBottom();
                  writeOperations = Math.max(0, writeOperations - 1);
                  updateScrollState();
                });
              }
            }
            if (controller === activeController && !activeController.signal.aborted) {
              streamId = '';
              scheduleReconnect('Terminal disconnected');
            }
          } catch (error) {
            if (controller === activeController && !activeController.signal.aborted) {
              streamId = '';
              scheduleReconnect(error?.message || String(error));
            }
          }
        }

        connect();
      })();
    </script>
  </body>
</html>`);

const terminalSnapshotHtml = Buffer.from(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #111014; }
      #terminal-scroll {
        width: 100%; height: 100%; overflow: auto;
        -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
        background: #111014; touch-action: pan-y;
      }
      #terminal-output {
        min-height: 100%; margin: 0; padding: 12px 12px 120px;
        color: #ded9e2; background: #111014;
        white-space: pre-wrap; overflow-wrap: anywhere;
        font-family: Menlo, Monaco, ui-monospace, SFMono-Regular, monospace;
        font-size: var(--terminal-font-size, 12px);
        line-height: 1.34;
        tab-size: 4;
      }
      #terminal-input {
        position: fixed; left: 0; bottom: 0;
        width: 1px; height: 1px; padding: 0; border: 0;
        opacity: .01; color: transparent; background: transparent;
        caret-color: transparent;
      }
      #status {
        position: fixed; top: 8px; right: 9px; z-index: 3;
        padding: 4px 7px; border-radius: 9px;
        color: #aaa5b0; background: rgba(32,31,36,.9);
        font: 600 10px -apple-system, BlinkMacSystemFont, sans-serif;
        pointer-events: none; opacity: 0; transition: opacity .18s ease;
      }
      #status.visible { opacity: 1; }
      #status.error { color: #ffaaa1; background: rgba(72,42,43,.96); }
    </style>
  </head>
  <body>
    <div id="terminal-scroll"><pre id="terminal-output"></pre></div>
    <textarea
      id="terminal-input"
      aria-label="Agent terminal input"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
    ></textarea>
    <div id="status">Connecting…</div>
    <script>
      (() => {
        const params = new URLSearchParams(location.search);
        const target = params.get('target') || '';
        const fontSize = Math.max(9, Math.min(22, Number(params.get('fontSize')) || 12));
        const lines = Math.max(100, Math.min(500, Number(params.get('lines')) || 500));
        const intervalMs = Math.max(250, Math.min(2000, Number(params.get('interval')) || 350));
        document.documentElement.style.setProperty('--terminal-font-size', fontSize + 'px');

        const scroller = document.getElementById('terminal-scroll');
        const output = document.getElementById('terminal-output');
        const input = document.getElementById('terminal-input');
        const status = document.getElementById('status');
        const lineHeight = Math.max(12, fontSize * 1.34);
        let runGeneration = 0;
        let activeController = null;
        let paused = false;
        let pageClosing = false;
        let userBrowsingHistory = false;
        let lastText = '';
        let lastAtBottom = null;
        let lastScrollReport = 0;
        let inputQueue = Promise.resolve();

        const notify = (state, detail = '') => {
          status.textContent =
            state === 'live'
              ? 'Live'
              : state === 'paused'
                ? 'Paused'
                : state === 'error'
                  ? detail || 'Disconnected'
                  : 'Connecting…';
          status.className =
            state === 'live' ? '' : 'visible' + (state === 'error' ? ' error' : '');
          window.ReactNativeWebView?.postMessage(
            JSON.stringify({ type: 'terminal-status', state, detail })
          );
        };

        const scrollMetrics = () => {
          const distance = Math.max(
            0,
            scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
          );
          return { atBottom: distance <= Math.max(12, lineHeight), distance };
        };

        const reportScroll = (force = false) => {
          const { atBottom, distance } = scrollMetrics();
          if (atBottom) userBrowsingHistory = false;
          const now = Date.now();
          if (force || atBottom !== lastAtBottom || now - lastScrollReport >= 250) {
            lastAtBottom = atBottom;
            lastScrollReport = now;
            window.ReactNativeWebView?.postMessage(
              JSON.stringify({
                type: 'terminal-scroll',
                atBottom,
                linesBehind: Math.max(0, Math.round(distance / lineHeight))
              })
            );
          }
        };

        const scrollToBottom = () => {
          userBrowsingHistory = false;
          requestAnimationFrame(() => {
            scroller.scrollTop = scroller.scrollHeight;
            reportScroll(true);
          });
        };

        const renderSnapshot = (text) => {
          if (text === lastText) return;
          const { atBottom, distance } = scrollMetrics();
          const followLatest = !userBrowsingHistory || atBottom;
          lastText = text;
          output.textContent = text;
          requestAnimationFrame(() => {
            if (followLatest) {
              scroller.scrollTop = scroller.scrollHeight;
            } else {
              scroller.scrollTop = Math.max(
                0,
                scroller.scrollHeight - scroller.clientHeight - distance
              );
            }
            reportScroll(true);
          });
        };

        scroller.addEventListener('scroll', () => {
          const { atBottom } = scrollMetrics();
          userBrowsingHistory = !atBottom;
          reportScroll();
        }, { passive: true });

        window.loomTerminalScrollLines = (value) => {
          const requested = Math.max(-100, Math.min(100, Math.round(Number(value) || 0)));
          if (!requested) return;
          if (requested < 0) userBrowsingHistory = true;
          scroller.scrollTop += requested * lineHeight;
          reportScroll(true);
        };
        window.loomTerminalControl = (action) => {
          if (action === 'page-up') {
            userBrowsingHistory = true;
            scroller.scrollTop -= scroller.clientHeight * 0.82;
          } else if (action === 'page-down') {
            scroller.scrollTop += scroller.clientHeight * 0.82;
          } else if (action === 'latest') {
            scrollToBottom();
            return;
          }
          reportScroll(true);
        };
        window.loomTerminalResize = () => reportScroll(true);

        const request = (path, body) =>
          fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          }).then((response) => {
            if (!response.ok) throw new Error('Terminal input failed (' + response.status + ')');
          });

        const sendLiteral = (text) => {
          if (!text) return;
          inputQueue = inputQueue
            .then(() => request('/api/tmux/send-literal', { target, text }))
            .catch((error) => notify('error', error.message));
        };
        const sendKey = (key) => {
          inputQueue = inputQueue
            .then(() => request('/api/tmux/send-key', { target, key }))
            .catch((error) => notify('error', error.message));
        };

        const keyMap = {
          Enter: 'Enter',
          Backspace: 'Backspace',
          Tab: 'Tab',
          Escape: 'Escape',
          ArrowUp: 'Up',
          ArrowDown: 'Down',
          ArrowLeft: 'Left',
          ArrowRight: 'Right',
          Home: 'Home',
          End: 'End',
          PageUp: 'PageUp',
          PageDown: 'PageDown'
        };
        input.addEventListener('keydown', (event) => {
          const key = keyMap[event.key];
          if (!key) return;
          event.preventDefault();
          input.value = '';
          sendKey(key);
        });
        input.addEventListener('input', () => {
          const text = input.value;
          input.value = '';
          if (text) sendLiteral(text);
        });
        input.addEventListener('focus', () => {
          window.ReactNativeWebView?.postMessage(
            JSON.stringify({ type: 'terminal-focus', focused: true })
          );
        });
        input.addEventListener('blur', () => {
          window.ReactNativeWebView?.postMessage(
            JSON.stringify({ type: 'terminal-focus', focused: false })
          );
        });
        window.loomTerminalFocus = () => input.focus();
        window.loomTerminalBlur = () => input.blur();

        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        async function run() {
          const generation = ++runGeneration;
          let failureCount = 0;
          while (!paused && !pageClosing && generation === runGeneration) {
            const controller = new AbortController();
            activeController = controller;
            try {
              const response = await fetch(
                '/api/tmux/capture?target=' + encodeURIComponent(target) + '&lines=' + lines,
                { cache: 'no-store', signal: controller.signal }
              );
              const payload = await response.json();
              if (!response.ok || !payload.ok) {
                throw new Error(payload.error || 'Terminal snapshot failed (' + response.status + ')');
              }
              renderSnapshot(String(payload.text || ''));
              failureCount = 0;
              notify('live');
              await wait(intervalMs);
            } catch (error) {
              if (controller.signal.aborted || paused || pageClosing) break;
              failureCount = Math.min(failureCount + 1, 5);
              notify('error', error?.message || String(error));
              await wait(Math.min(10000, 500 * (2 ** failureCount)));
            }
          }
        }

        window.loomTerminalPause = () => {
          paused = true;
          runGeneration += 1;
          activeController?.abort();
          notify('paused');
        };
        window.loomTerminalResume = () => {
          if (!paused) return;
          paused = false;
          notify('connecting');
          run();
        };
        window.loomTerminalReconnect = () => {
          paused = false;
          runGeneration += 1;
          activeController?.abort();
          notify('connecting');
          run();
        };
        addEventListener('pagehide', () => {
          pageClosing = true;
          paused = true;
          runGeneration += 1;
          activeController?.abort();
        }, { once: true });

        if (!target) {
          notify('error', 'Missing terminal target');
        } else {
          notify('connecting');
          run();
        }
      })();
    </script>
  </body>
</html>`);

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Loom-Project',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    Vary: 'Origin',
  };
}

function secureTokenEqual(candidate, expected) {
  const left = Buffer.from(candidate || '');
  const right = Buffer.from(expected || '');
  return left.length === right.length && timingSafeEqual(left, right);
}

function clientToken(request) {
  const authorization = String(request.headers.authorization || '').trim();
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  const cookie = String(request.headers.cookie || '');
  const match = cookie.match(/(?:^|;\s*)loom_gateway_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function clientAuthorized(request) {
  return !gatewayToken || secureTokenEqual(clientToken(request), gatewayToken);
}

function gatewaySessionCookie(request) {
  const forwardedProto = String(request.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const secure = forwardedProto === 'https' || request.socket.encrypted;
  return [
    `loom_gateway_session=${encodeURIComponent(gatewayToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

function sendUnauthorized(response) {
  const body = Buffer.from(JSON.stringify({ error: 'Gateway authentication required' }));
  response.writeHead(401, {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'WWW-Authenticate': 'Bearer realm="Loom App Gateway"',
  });
  response.end(body);
}

function sendBuffer(response, status, contentType, body, cacheControl = 'no-store', extra = {}) {
  response.writeHead(status, {
    ...corsHeaders(),
    'Content-Type': contentType,
    'Content-Length': body.length,
    'Cache-Control': cacheControl,
    ...extra,
  });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) {
      throw new Error('Request body exceeds 20 MB');
    }
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function upstreamHeaders(request) {
  const headers = new Headers();
  const contentType = request.headers['content-type'];
  const accept = request.headers.accept;
  const project = request.headers['x-loom-project'];
  if (contentType) headers.set('content-type', contentType);
  if (accept) headers.set('accept', accept);
  if (project) headers.set('x-loom-project', project);
  if (loomToken) headers.set('authorization', `Bearer ${loomToken}`);
  return headers;
}

function responseHeaders(upstream) {
  const headers = { ...corsHeaders() };
  for (const [key, value] of upstream.headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower === 'connection' ||
      lower === 'content-encoding' ||
      lower === 'content-length' ||
      lower === 'transfer-encoding'
    ) {
      continue;
    }
    headers[key] = value;
  }
  return headers;
}

async function proxy(request, response) {
  const incomingUrl = new URL(request.url || '/', `http://${request.headers.host}`);
  if (!incomingUrl.pathname.startsWith('/api/')) {
    sendJson(response, 404, { error: 'Unknown gateway route' });
    return;
  }

  const controller = new AbortController();
  response.on('close', () => controller.abort());

  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await readBody(request);
  const upstream = await fetch(`${loomBaseUrl}${incomingUrl.pathname}${incomingUrl.search}`, {
    method: request.method,
    headers: upstreamHeaders(request),
    body,
    redirect: 'manual',
    signal: controller.signal,
  });

  response.writeHead(upstream.status, responseHeaders(upstream));
  if (!upstream.body) {
    response.end();
    return;
  }
  const stream = Readable.fromWeb(upstream.body);
  stream.on('error', (error) => {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      if (!response.destroyed && !response.writableEnded) response.end();
      return;
    }
    response.destroy(error instanceof Error ? error : undefined);
  });
  stream.pipe(response);
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  const incomingUrl = new URL(request.url || '/', `http://${request.headers.host}`);
  if (request.method === 'GET' && incomingUrl.pathname === '/terminal-assets/xterm.js') {
    sendBuffer(response, 200, 'text/javascript; charset=utf-8', xtermJs, 'public, max-age=31536000, immutable');
    return;
  }
  if (request.method === 'GET' && incomingUrl.pathname === '/terminal-assets/xterm.css') {
    sendBuffer(response, 200, 'text/css; charset=utf-8', xtermCss, 'public, max-age=31536000, immutable');
    return;
  }

  if (!clientAuthorized(request)) {
    sendUnauthorized(response);
    return;
  }

  if (request.method === 'GET' && incomingUrl.pathname === '/terminal') {
    sendBuffer(
      response,
      200,
      'text/html; charset=utf-8',
      terminalSnapshotHtml,
      'no-store',
      {
        'Content-Security-Policy':
          "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'none'; font-src 'none'; frame-ancestors 'none'",
        ...(gatewayToken ? { 'Set-Cookie': gatewaySessionCookie(request) } : {}),
      },
    );
    return;
  }

  if (incomingUrl.pathname === '/health') {
    try {
      const upstream = await fetch(`${loomBaseUrl}/api/projects`, {
        headers: upstreamHeaders(request),
        signal: AbortSignal.timeout(3000),
      });
      sendJson(response, upstream.ok ? 200 : 502, {
        ok: upstream.ok,
        gateway: { host, port },
        loom: { ok: upstream.ok, status: upstream.status, url: loomBaseUrl },
      });
    } catch (error) {
      sendJson(response, 502, {
        ok: false,
        gateway: { host, port },
        loom: { ok: false, url: loomBaseUrl },
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  try {
    await proxy(request, response);
  } catch (error) {
    if (!response.headersSent) {
      sendJson(response, 502, {
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      response.destroy(error instanceof Error ? error : undefined);
    }
  }
});

server.listen(port, host, () => {
  console.log(`Loom App gateway: http://${host}:${port}`);
  console.log(`Loom backend: ${loomBaseUrl}`);
  console.log(`Gateway auth: ${gatewayToken ? 'enabled' : 'disabled'}`);
  if (host !== '127.0.0.1' && host !== '::1') {
    console.warn('Gateway is listening beyond localhost; place it behind TLS and authentication.');
  }
  if ((host !== '127.0.0.1' && host !== '::1') && !gatewayToken) {
    console.warn('Gateway client authentication is disabled.');
  }
});
