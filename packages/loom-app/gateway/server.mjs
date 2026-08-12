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
const xtermFitJs = await readFile(new URL(import.meta.resolve('@xterm/addon-fit')));

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
        background: #211d1a; touch-action: manipulation;
      }
      body { padding: 0; }
      #terminal {
        transition: box-shadow .15s ease;
      }
      #terminal:focus-within {
        box-shadow: inset 0 0 0 2px rgba(245, 158, 11, 0.5);
      }
      .xterm { height: 100%; }
      /* Let WebKit own the scroll so scrollback flicks with real momentum. */
      .xterm-viewport {
        overflow-y: scroll !important;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
        background-color: transparent !important;
      }
      .xterm-viewport::-webkit-scrollbar { width: 0; height: 0; }
      .composition-view {
        background: #fffaf0; color: #4a4036;
        border: 1px solid #d9a441; border-radius: 4px; padding: 0 3px; z-index: 10;
      }
      #status {
        position: fixed; top: 8px; right: 9px; z-index: 3;
        padding: 4px 7px; border-radius: 9px;
        color: #b45309; background: rgba(245,158,11,.14);
        border: 1px solid rgba(245,158,11,.34);
        font: 700 10px -apple-system, BlinkMacSystemFont, sans-serif;
        pointer-events: none; opacity: 0; transition: opacity .18s ease;
      }
      #status.visible { opacity: 1; }
      #status.error { color: #e06c5a; background: rgba(224,108,90,.16); border-color: rgba(224,108,90,.4); }
      #terminal-controls {
        position: fixed; right: 10px; bottom: 10px; z-index: 4;
        display: flex; gap: 5px; align-items: center;
        padding: 5px; border-radius: 12px;
        background: rgba(253,249,241,.94); border: 1px solid #ece0cd;
        backdrop-filter: blur(12px);
      }
      #terminal-controls button {
        min-width: 39px; height: 29px; padding: 0 8px;
        border: 1px solid #e7d6b3; border-radius: 8px;
        color: #6b5b43; background: #fffdf8;
        font: 700 10px -apple-system, BlinkMacSystemFont, sans-serif;
      }
      #terminal-controls button:active { transform: translateY(1px); opacity: .8; }
      #terminal-controls #latest.active {
        color: #fff; border-color: #d97706; background: #f59e0b;
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
    <script src="/terminal-assets/addon-fit.js"></script>
    <script>
      (() => {
        const params = new URLSearchParams(location.search);
        const target = params.get('target') || '';
        const cols = Math.max(24, Math.min(220, Number(params.get('cols')) || 60));
        const nativeControls = params.get('nativeControls') === '1';
        const bottomReserveRows = nativeControls ? 0 : 2;
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
          cursorInactiveStyle: 'outline',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
          fontSize,
          lineHeight: 1.15,
          scrollback: 8000,
          smoothScrollDuration: 40,
          macOptionIsMeta: true,
          theme: {
            // Match Loom web_static warm-dark terminal.
            background: '#211d1a',
            foreground: '#e7ddcf',
            cursor: '#f59e0b',
            cursorAccent: '#211d1a',
            selectionBackground: 'rgba(245,158,11,0.30)',
            black: '#2b2620',
            red: '#e06c5a',
            green: '#9ec46a',
            yellow: '#e0af68',
            blue: '#7aa2f7',
            magenta: '#c79bf0',
            cyan: '#79c7c7',
            white: '#d8cfc2',
            brightBlack: '#7a6f60',
            brightRed: '#f08a7a',
            brightGreen: '#b6d98a',
            brightYellow: '#f0c987',
            brightBlue: '#9bb8fa',
            brightMagenta: '#d4b3f5',
            brightCyan: '#9bd9d9',
            brightWhite: '#fdf6ea'
          }
        });
        term.open(document.getElementById('terminal'));
        // Measure the real cell size instead of guessing it, so the PTY grid
        // always matches the pane and long lines never wrap mid-render.
        let fit = null;
        try {
          fit = new FitAddon.FitAddon();
          term.loadAddon(fit);
        } catch (error) {
          console.debug('fit addon unavailable', error);
        }
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

        // Scrolling is left to WebKit's own viewport so it matches the browser
        // (momentum, rubber-band, handoff to the page). Touch handling here only
        // decides whether the gesture was a tap, which focuses the PTY.
        const terminalElement = document.getElementById('terminal');
        const viewport = () => terminalElement.querySelector('.xterm-viewport');
        const touch = { startX: 0, startY: 0, moved: false };
        terminalElement.addEventListener('touchstart', (event) => {
          if (event.touches.length !== 1) return;
          touch.startX = event.touches[0].clientX;
          touch.startY = event.touches[0].clientY;
          touch.moved = false;
        }, { passive: true });
        terminalElement.addEventListener('touchmove', (event) => {
          if (event.touches.length !== 1) return;
          const dx = Math.abs(event.touches[0].clientX - touch.startX);
          const dy = Math.abs(event.touches[0].clientY - touch.startY);
          if (dx > 8 || dy > 8) touch.moved = true;
        }, { passive: true });
        terminalElement.addEventListener('touchend', () => {
          if (!touch.moved) term.focus();
          touch.moved = false;
        }, { passive: true });

        const reportViewportScroll = () => {
          const buffer = term.buffer.active;
          userBrowsingHistory = buffer.viewportY < buffer.baseY;
          updateScrollState();
        };
        const attachViewportListener = () => {
          const element = viewport();
          if (!element || element.dataset.loomScrollBound === '1') return;
          element.dataset.loomScrollBound = '1';
          element.addEventListener('scroll', reportViewportScroll, { passive: true });
        };
        attachViewportListener();
        setTimeout(attachViewportListener, 400);

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

        const postGrid = () => {
          window.ReactNativeWebView?.postMessage(
            JSON.stringify({ type: 'terminal-grid', cols: currentCols, rows: currentRows })
          );
        };
        const applyFit = (reconnect) => {
          let proposed = null;
          try {
            proposed = fit ? fit.proposeDimensions() : null;
          } catch (error) {
            proposed = null;
          }
          if (!proposed || !proposed.cols || !proposed.rows) return false;
          const nextCols = Math.max(24, Math.min(220, proposed.cols));
          const nextRows = Math.max(10, Math.min(100, proposed.rows - bottomReserveRows));
          if (nextCols === currentCols && nextRows === currentRows) {
            postGrid();
            return false;
          }
          currentCols = nextCols;
          currentRows = nextRows;
          term.resize(currentCols, currentRows);
          postGrid();
          if (!reconnect) return true;
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => connect(currentCols, currentRows), 300);
          return true;
        };
        window.loomTerminalResize = () => applyFit(true);
        addEventListener('resize', () => applyFit(true));

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

        applyFit(false);
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
          // tmux key name is BSpace; "Backspace" is typed as literal text
          Backspace: 'BSpace',
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

const TMUX_KEY_ALIASES = {
  Backspace: 'BSpace',
};

function rewriteTmuxSendKeyBody(pathname, rawBody) {
  if (pathname !== '/api/tmux/send-key' || !rawBody) return rawBody;
  try {
    const payload = JSON.parse(rawBody.toString('utf8'));
    const alias = TMUX_KEY_ALIASES[payload?.key];
    if (!alias) return rawBody;
    return Buffer.from(JSON.stringify({ ...payload, key: alias }), 'utf8');
  } catch {
    return rawBody;
  }
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
      : rewriteTmuxSendKeyBody(incomingUrl.pathname, await readBody(request));
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
  if (request.method === 'GET' && incomingUrl.pathname === '/terminal-assets/addon-fit.js') {
    sendBuffer(response, 200, 'text/javascript; charset=utf-8', xtermFitJs, 'public, max-age=31536000, immutable');
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
      // xterm + live PTY stream, matching the Loom web console. The snapshot
      // template stays as a fallback for clients that cannot stream.
      incomingUrl.searchParams.get('snapshot') === '1'
        ? terminalSnapshotHtml
        : terminalHtml,
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
