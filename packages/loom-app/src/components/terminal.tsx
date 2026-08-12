import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { styles } from '../styles';
import { colors, terminalWeb } from '../theme';
import type { TaskDetail, TerminalCapture, TerminalKey } from '../types';
import { MAX_CAPTURE_LINES, type TerminalStreamState } from '../useTerminalSession';
import { EmptyState, Icon, SectionCard, StatusPill } from './primitives';
import { PlanPeek } from './views';

const WEB_COMPACT_KEYS: { value: TerminalKey; label: string; tone?: 'neutral' | 'primary' | 'danger' }[] = [
  { value: 'Escape', label: 'Esc' },
  { value: 'C-c', label: '⌃C', tone: 'danger' },
  { value: 'Up', label: '↑' },
  { value: 'Down', label: '↓' },
  { value: 'Left', label: '←' },
  { value: 'Right', label: '→' },
  { value: 'Tab', label: 'Tab' },
  { value: 'Enter', label: '⏎', tone: 'primary' },
];

export function TerminalKeyButton({
  value,
  label,
  tone = 'neutral',
  wide = false,
  active = false,
  disabled = false,
  repeat = false,
  onPress,
}: {
  value: TerminalKey;
  label: string;
  tone?: 'neutral' | 'primary' | 'danger';
  wide?: boolean;
  active?: boolean;
  disabled?: boolean;
  repeat?: boolean;
  onPress: (key: TerminalKey) => void;
}) {
  const repeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRepeating = useCallback(() => {
    if (repeatTimerRef.current) {
      clearInterval(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
  }, []);

  useEffect(() => stopRepeating, [stopRepeating]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Send ${label} to the agent terminal`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        try {
          if (Platform.OS === 'android') Vibration.vibrate(8);
        } catch {
          // Ignore haptic failures — never block the key.
        }
        onPress(value);
      }}
      delayLongPress={360}
      onLongPress={
        repeat
          ? () => {
              try {
                if (Platform.OS === 'android') Vibration.vibrate(8);
              } catch {
                // Ignore haptic failures — never block the key.
              }
              onPress(value);
              stopRepeating();
              repeatTimerRef.current = setInterval(() => onPress(value), 140);
            }
          : undefined
      }
      onPressOut={stopRepeating}
      style={({ pressed }) => [
        styles.terminalKey,
        wide && styles.terminalKeyWide,
        tone === 'primary' && styles.terminalKeyPrimary,
        tone === 'danger' && styles.terminalKeyDanger,
        disabled && styles.terminalKeyDisabled,
        (pressed || active) && styles.terminalKeyPressed,
        active && styles.terminalKeyActive,
      ]}
    >
      <Text
        style={[
          styles.terminalKeyText,
          tone === 'primary' && styles.terminalKeyTextPrimary,
          tone === 'danger' && styles.terminalKeyTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ExpandedTerminalKeyboard({
  visible,
  disabled,
  pending,
  lastKey,
  error,
  onKey,
  onClose,
}: {
  visible: boolean;
  disabled: boolean;
  pending: number;
  lastKey: TerminalKey | null;
  error: string;
  onKey: (key: TerminalKey) => void;
  onClose: () => void;
}) {
  const active = (key: TerminalKey) => pending > 0 && lastKey === key;
  const common = (key: TerminalKey) => ({
    value: key,
    disabled,
    active: active(key),
    onPress: onKey,
  });

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={styles.expandedKeyboardOverlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close expanded terminal keyboard"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.expandedKeyboardSheet}>
          <View style={styles.expandedKeyboardHandle} />
          <View style={styles.expandedKeyboardHeader}>
            <View>
              <Text style={styles.expandedKeyboardTitle}>Expanded terminal keyboard</Text>
              <Text style={styles.expandedKeyboardSubtitle}>
                {disabled ? 'Start the agent to enable direct input' : pending ? `${pending} keys queued` : 'Direct tmux input'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close expanded keyboard"
              onPress={onClose}
              style={styles.expandedKeyboardClose}
            >
              <Icon name="close" color={terminalWeb.title} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.expandedKeyboardContent}
            showsVerticalScrollIndicator
          >
            <Text style={styles.expandedKeyboardSection}>Navigation</Text>
            <View style={styles.expandedNavigation}>
              <View style={styles.expandedDpad}>
                <View style={styles.expandedKeyRow}>
                  <View style={styles.expandedKeySpacer} />
                  <TerminalKeyButton {...common('Up')} label="↑" repeat />
                  <View style={styles.expandedKeySpacer} />
                </View>
                <View style={styles.expandedKeyRow}>
                  <TerminalKeyButton {...common('Left')} label="←" repeat />
                  <TerminalKeyButton {...common('Down')} label="↓" repeat />
                  <TerminalKeyButton {...common('Right')} label="→" repeat />
                </View>
              </View>
              <View style={styles.expandedUtilityKeys}>
                <View style={styles.expandedKeyRow}>
                  <TerminalKeyButton {...common('Escape')} label="Esc" />
                  <TerminalKeyButton {...common('Enter')} label="Enter" tone="primary" />
                </View>
                <View style={styles.expandedKeyRow}>
                  <TerminalKeyButton {...common('Tab')} label="Tab" />
                  <TerminalKeyButton {...common('BTab')} label="⇧Tab" />
                </View>
              </View>
            </View>

            <Text style={styles.expandedKeyboardSection}>Cursor & editing</Text>
            <View style={styles.expandedKeyRow}>
              <TerminalKeyButton {...common('Home')} label="Home" />
              <TerminalKeyButton {...common('End')} label="End" />
              <TerminalKeyButton {...common('PageUp')} label="Pg↑" />
              <TerminalKeyButton {...common('PageDown')} label="Pg↓" />
            </View>
            <View style={styles.expandedKeyRow}>
              <TerminalKeyButton {...common('BSpace')} label="⌫" repeat />
              <TerminalKeyButton {...common('DC')} label="Del" />
              <TerminalKeyButton {...common('IC')} label="Ins" />
              <TerminalKeyButton {...common('Space')} label="Space" wide />
            </View>

            <Text style={styles.expandedKeyboardSection}>Control & word movement</Text>
            <View style={styles.expandedKeyRow}>
              <TerminalKeyButton {...common('C-a')} label="⌃A" />
              <TerminalKeyButton {...common('C-e')} label="⌃E" />
              <TerminalKeyButton {...common('M-b')} label="⌥←" />
              <TerminalKeyButton {...common('M-f')} label="⌥→" />
            </View>
            <View style={styles.expandedKeyRow}>
              <TerminalKeyButton {...common('C-c')} label="⌃C" tone="danger" />
              <TerminalKeyButton {...common('C-d')} label="⌃D" tone="danger" />
              <TerminalKeyButton {...common('C-l')} label="⌃L" />
              <TerminalKeyButton {...common('C-z')} label="⌃Z" tone="danger" />
            </View>

            <Text style={styles.expandedKeyboardSection}>Function keys</Text>
            {(
              [
                ['F1', 'F2', 'F3', 'F4'],
                ['F5', 'F6', 'F7', 'F8'],
                ['F9', 'F10', 'F11', 'F12'],
              ] as TerminalKey[][]
            ).map((row) => (
              <View key={row.join('-')} style={styles.expandedKeyRow}>
                {row.map((key) => (
                  <TerminalKeyButton key={key} {...common(key)} label={key} />
                ))}
              </View>
            ))}

            {error ? (
              <View style={styles.terminalKeyboardError}>
                <Icon name="warning-outline" size={14} color={colors.red} />
                <Text style={styles.terminalKeyboardErrorText}>{error}</Text>
              </View>
            ) : null}
            <Text style={styles.expandedKeyboardWarning}>
              Shift+Tab sends tmux BTab. Control keys and Enter act immediately and may interrupt,
              suspend, exit, or confirm the active terminal program.
            </Text>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export function TerminalKeyboard({
  disabled,
  disabledReason = 'Start agent to enable',
  pending,
  lastKey,
  error,
  onKey,
  variant = 'full',
}: {
  disabled: boolean;
  disabledReason?: string;
  pending: number;
  lastKey: TerminalKey | null;
  error: string;
  onKey: (key: TerminalKey) => void;
  /** `dock` stays above the OS keyboard while typing in the PTY. */
  variant?: 'full' | 'dock';
}) {
  const [expanded, setExpanded] = useState(false);
  const docked = variant === 'dock';
  const keyActive = (key: TerminalKey) => pending > 0 && lastKey === key;
  const common = (key: TerminalKey) => ({
    value: key,
    disabled,
    active: keyActive(key),
    onPress: onKey,
  });

  return (
    <>
      <View style={[styles.terminalKeyboard, docked && styles.terminalKeyboardDock]}>
        <View style={styles.terminalKeyRow}>
          {WEB_COMPACT_KEYS.map((key) => (
            <TerminalKeyButton
              key={key.value}
              {...common(key.value)}
              label={key.label}
              tone={key.tone}
              repeat={
                key.value === 'Up' ||
                key.value === 'Down' ||
                key.value === 'Left' ||
                key.value === 'Right'
              }
            />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open expanded terminal keyboard"
            onPress={() => setExpanded(true)}
            style={({ pressed }) => [
              styles.terminalKey,
              styles.terminalKeyMore,
              pressed && styles.terminalKeyPressed,
            ]}
          >
            <Icon name="ellipsis-horizontal" size={16} color={terminalWeb.keyText} />
          </Pressable>
        </View>
        {(error || pending > 0 || disabled) && (
          <Text style={styles.terminalKeyboardStatus} numberOfLines={1}>
            {disabled ? disabledReason : error ? error : `${pending} queued`}
          </Text>
        )}
      </View>
      <ExpandedTerminalKeyboard
        visible={expanded}
        disabled={disabled}
        pending={pending}
        lastKey={lastKey}
        error={error}
        onKey={onKey}
        onClose={() => setExpanded(false)}
      />
    </>
  );
}

export function LiveTerminalView({
  gatewayUrl,
  gatewayAuthToken,
  target,
  fontSize,
  fullscreen = false,
  active = true,
  blurRequest = 0,
  onStateChange,
  onFocusChange,
  onGridChange,
}: {
  gatewayUrl: string;
  gatewayAuthToken: string;
  target: string;
  fontSize: number;
  fullscreen?: boolean;
  active?: boolean;
  blurRequest?: number;
  onStateChange: (state: TerminalStreamState) => void;
  onFocusChange?: (focused: boolean) => void;
  onGridChange?: (grid: { cols: number; rows: number }) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const screenHeight = Dimensions.get('screen').height;
  const [reloadToken, setReloadToken] = useState(0);
  const [streamError, setStreamError] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const [linesBehind, setLinesBehind] = useState(0);
  const [focused, setFocused] = useState(false);
  const [layoutSize, setLayoutSize] = useState({
    width: Math.max(280, windowWidth - (fullscreen ? 16 : 40)),
    height: fullscreen
      ? Math.max(420, screenHeight - 120)
      : Math.max(300, Math.min(620, Math.round(screenHeight * 0.5))),
  });
  const webViewRef = useRef<WebView>(null);
  const stableWidth = layoutSize.width;
  const stableHeight = layoutSize.height;
  const columns = Math.max(
    32,
    Math.min(140, Math.floor((stableWidth - 6) / (fontSize * 0.62))),
  );
  const rows = Math.max(
    14,
    Math.min(80, Math.floor((stableHeight - 6) / (fontSize * 1.18))),
  );
  const initialGeometryRef = useRef({ columns, rows });
  const latestLayoutRef = useRef({ width: stableWidth, height: stableHeight });
  const webReadyRef = useRef(false);
  const source = useMemo(
    () => ({
      uri:
        `${gatewayUrl}/terminal?target=${encodeURIComponent(target)}` +
        `&cols=${initialGeometryRef.current.columns}&rows=${initialGeometryRef.current.rows}` +
        `&fontSize=${fontSize}&nativeControls=1&reload=${reloadToken}`,
      ...(gatewayAuthToken
        ? { headers: { Authorization: `Bearer ${gatewayAuthToken}` } }
        : {}),
    }),
    [fontSize, gatewayAuthToken, gatewayUrl, reloadToken, target],
  );

  const setState = useCallback(
    (state: TerminalStreamState, error = '') => {
      setStreamError(error);
      onStateChange(state);
    },
    [onStateChange],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const message = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          state?: TerminalStreamState;
          detail?: string;
          atBottom?: boolean;
          linesBehind?: number;
          focused?: boolean;
          cols?: number;
          rows?: number;
        };
        if (
          message.type === 'terminal-grid' &&
          typeof message.cols === 'number' &&
          typeof message.rows === 'number'
        ) {
          onGridChange?.({ cols: message.cols, rows: message.rows });
        } else if (message.type === 'terminal-status' && message.state) {
          setState(message.state, message.detail || '');
        } else if (
          message.type === 'terminal-scroll' &&
          typeof message.atBottom === 'boolean'
        ) {
          setAtBottom(message.atBottom);
          if (typeof message.linesBehind === 'number') {
            setLinesBehind(Math.max(0, Math.round(message.linesBehind)));
          }
        } else if (
          message.type === 'terminal-focus' &&
          typeof message.focused === 'boolean'
        ) {
          setFocused(message.focused);
          onFocusChange?.(message.focused);
        }
      } catch {
        // Ignore non-terminal WebView messages.
      }
    },
    [onFocusChange, onGridChange, setState],
  );

  useEffect(
    () => () => {
      setFocused(false);
      onFocusChange?.(false);
    },
    [onFocusChange],
  );

  useEffect(() => {
    setAtBottom(true);
    setLinesBehind(0);
    setFocused(false);
  }, [target]);

  // The hint is for discovery only; leaving it up permanently just covers output.
  const [hintVisible, setHintVisible] = useState(true);
  useEffect(() => {
    setHintVisible(true);
    const timer = setTimeout(() => setHintVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [target]);
  useEffect(() => {
    if (focused) setHintVisible(false);
  }, [focused]);

  const focusTerminal = useCallback(() => {
    webViewRef.current?.injectJavaScript('window.loomTerminalFocus?.(); true;');
  }, []);


  const sendScrollCommand = useCallback((command: 'page-up' | 'latest' | 'page-down') => {
    webViewRef.current?.injectJavaScript(
      `window.loomTerminalControl?.(${JSON.stringify(command)}); true;`,
    );
  }, []);

  // The page measures its own cell size, so a layout change only needs a nudge.
  const resizeTerminal = useCallback((width: number, height: number) => {
    latestLayoutRef.current = { width, height };
    if (!webReadyRef.current || width < 120 || height < 120) return;
    webViewRef.current?.injectJavaScript('window.loomTerminalResize?.(); true;');
  }, []);

  useEffect(() => {
    if (!webReadyRef.current) return;
    webViewRef.current?.injectJavaScript(
      `window.${active ? 'loomTerminalResume' : 'loomTerminalPause'}?.(); true;`,
    );
  }, [active]);

  useEffect(() => {
    if (!blurRequest || !webReadyRef.current) return;
    webViewRef.current?.injectJavaScript(
      'window.loomTerminalBlur?.(); true;',
    );
  }, [blurRequest]);

  return (
    <View
      style={[
        styles.liveTerminalShell,
        fullscreen ? styles.liveTerminalFullscreen : styles.liveTerminalFill,
        focused && styles.liveTerminalShellFocused,
      ]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
          setLayoutSize((current) =>
            current.width === width && current.height === height
              ? current
              : { width, height },
          );
        }
        resizeTerminal(width, height);
      }}
    >
      <WebView
        ref={webViewRef}
        key={`${target}:${reloadToken}`}
        source={source}
        originWhitelist={['http://*', 'https://*']}
        javaScriptEnabled
        domStorageEnabled={false}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        bounces={false}
        overScrollMode="never"
        scrollEnabled={false}
        nestedScrollEnabled
        keyboardDisplayRequiresUserAction={false}
        setSupportMultipleWindows={false}
        style={styles.liveTerminalWebView}
        onLoadStart={() => {
          webReadyRef.current = false;
          setState('connecting');
        }}
        onLoadEnd={() => {
          webReadyRef.current = true;
          const { width, height } = latestLayoutRef.current;
          resizeTerminal(width, height);
          if (!active) {
            webViewRef.current?.injectJavaScript(
              'window.loomTerminalPause?.(); true;',
            );
          }
        }}
        onMessage={handleMessage}
        onError={(event) => setState('error', event.nativeEvent.description)}
        onHttpError={(event) =>
          setState('error', `Terminal page failed (${event.nativeEvent.statusCode})`)
        }
      />
      {hintVisible && !focused && atBottom && !streamError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tap to type in the terminal"
          onPress={focusTerminal}
          style={({ pressed }) => [
            styles.liveTerminalFocusHint,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.liveTerminalFocusHintText}>Tap to type</Text>
        </Pressable>
      ) : null}
      {!atBottom ? (
        <View style={styles.liveTerminalControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Page up in terminal"
            onPress={() => sendScrollCommand('page-up')}
            style={({ pressed }) => [styles.liveTerminalControl, pressed && styles.pressed]}
          >
            <Text style={styles.liveTerminalControlText}>Pg↑</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Jump to latest terminal output, ${linesBehind} lines behind`}
            onPress={() => sendScrollCommand('latest')}
            style={({ pressed }) => [
              styles.liveTerminalControl,
              styles.liveTerminalControlActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.liveTerminalControlText,
                styles.liveTerminalControlTextActive,
              ]}
            >
              Latest · {linesBehind}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Page down in terminal"
            onPress={() => sendScrollCommand('page-down')}
            style={({ pressed }) => [styles.liveTerminalControl, pressed && styles.pressed]}
          >
            <Text style={styles.liveTerminalControlText}>Pg↓</Text>
          </Pressable>
        </View>
      ) : null}
      {streamError ? (
        <View style={styles.liveTerminalError}>
          <Icon name="cloud-offline-outline" size={16} color={colors.red} />
          <Text numberOfLines={2} style={styles.liveTerminalErrorText}>
            {streamError}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reconnect live terminal"
            onPress={() => {
              setState('connecting');
              setReloadToken((current) => current + 1);
            }}
            style={styles.liveTerminalRetry}
          >
            <Text style={styles.liveTerminalRetryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function ActivityView({
  capture,
  running,
  working,
  target,
  gatewayUrl,
  gatewayAuthToken,
  fontSize,
  captureLines,
  terminalKeyPending,
  lastTerminalKey,
  terminalKeyError,
  keyboardVisible,
  fullscreen,
  appActive,
  terminalBlurRequest,
  onFontSizeChange,
  onLoadMore,
  onTerminalKey,
  onTerminalFocusChange,
  onFullscreenChange,
  onStreamStateChange,
  onComposeSend,
  detail,
}: {
  capture: TerminalCapture | null;
  running: boolean;
  working: boolean;
  target: string;
  gatewayUrl: string;
  gatewayAuthToken: string;
  fontSize: number;
  captureLines: number;
  terminalKeyPending: number;
  lastTerminalKey: TerminalKey | null;
  terminalKeyError: string;
  keyboardVisible: boolean;
  fullscreen: boolean;
  appActive: boolean;
  terminalBlurRequest: number;
  detail: TaskDetail | null;
  onFontSizeChange: (fontSize: number) => void;
  onLoadMore: () => void;
  onTerminalKey: (key: TerminalKey) => void;
  onTerminalFocusChange: (focused: boolean) => void;
  onFullscreenChange: (fullscreen: boolean) => void;
  onStreamStateChange: (state: TerminalStreamState) => void;
  onComposeSend: (text: string) => Promise<void> | void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const [streamState, setStreamState] = useState<TerminalStreamState>('connecting');
  const [fullscreenKeysOpen, setFullscreenKeysOpen] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [composeBusy, setComposeBusy] = useState(false);
  // A finger inside the pane belongs to the terminal's own scrollback, not the
  // page underneath it.
  const [terminalTouch, setTerminalTouch] = useState(false);
  const [planOpen, setPlanOpen] = useState(true);
  const [grid, setGrid] = useState<{ cols: number; rows: number } | null>(null);
  const liveTerminal = Platform.OS !== 'web';
  // Collapsing the plan is the cheap way to hand the terminal the whole page.
  const paneRatio = composeOpen ? 0.42 : planOpen ? 0.5 : 0.66;
  const terminalPaneHeight = Math.max(
    260,
    Math.min(640, Math.round(windowHeight * paneRatio)),
  );

  const submitCompose = useCallback(async () => {
    const text = composeText.trim();
    if (!text || composeBusy) return;
    setComposeBusy(true);
    try {
      await onComposeSend(text);
      setComposeText('');
    } finally {
      setComposeBusy(false);
    }
  }, [composeBusy, composeText, onComposeSend]);

  const reportStreamState = useCallback(
    (state: TerminalStreamState) => {
      setStreamState(state);
      onStreamStateChange(state);
    },
    [onStreamStateChange],
  );

  useEffect(() => {
    reportStreamState('connecting');
    setFullscreenKeysOpen(true);
  }, [reportStreamState, target]);

  if (!target) {
    return (
      <SectionCard fill title="Agent activity" icon="pulse-outline">
        <EmptyState
          icon="play-outline"
          title="Agent is not started"
          detail="Start the task to create its persistent Loom session."
        />
      </SectionCard>
    );
  }

  if (!liveTerminal) {
    return (
      <SectionCard
        fill
        title="Agent activity"
        icon="pulse-outline"
        action={
          <View style={styles.sectionActions}>
            <Text style={styles.captureLineCount}>{captureLines} lines</Text>
            <StatusPill
              running={working}
              label={working ? 'Working' : running ? 'Ready' : 'Stopped'}
            />
          </View>
        }
      >
        <View style={styles.terminalHeader}>
          <View style={styles.terminalLights}>
            <View style={[styles.terminalLight, { backgroundColor: '#ff756c' }]} />
            <View style={[styles.terminalLight, { backgroundColor: '#e7c267' }]} />
            <View style={[styles.terminalLight, { backgroundColor: '#72cc8b' }]} />
          </View>
          <Text numberOfLines={1} style={styles.terminalTarget}>
            {target}
          </Text>
        </View>
        <View style={[styles.terminal, styles.terminalContent]}>
          <Text selectable style={[styles.terminalText, { fontSize, lineHeight: fontSize * 1.5 }]}>
            {capture?.text?.trim() ||
              (running ? 'Waiting for agent output…' : 'No terminal output captured.')}
          </Text>
        </View>
        <View style={styles.terminalFoot}>
          <View style={styles.terminalFootCopy}>
            <Icon name="information-circle-outline" size={15} />
            <Text style={styles.terminalFootText}>
              Terminal snapshot. Drag vertically anywhere to continue through the page.
            </Text>
          </View>
          <View style={styles.terminalFootActions}>
            {captureLines < MAX_CAPTURE_LINES && (
              <Pressable
                accessibilityRole="button"
                onPress={onLoadMore}
                style={({ pressed }) => [styles.loadMoreButton, pressed && styles.pressed]}
              >
                <Icon name="chevron-up-outline" size={14} color={colors.primary} />
                <Text style={styles.loadMoreButtonText}>Older output</Text>
              </Pressable>
            )}
            <View style={styles.fontSizeControl}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decrease terminal font size"
                disabled={fontSize <= 9}
                onPress={() => onFontSizeChange(Math.max(9, fontSize - 1))}
                style={({ pressed }) => [
                  styles.fontSizeButton,
                  pressed && styles.pressed,
                  fontSize <= 9 && styles.disabled,
                ]}
              >
                <Text style={styles.fontSizeButtonText}>A−</Text>
              </Pressable>
              <Text style={styles.fontSizeValue}>{fontSize}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Increase terminal font size"
                disabled={fontSize >= 18}
                onPress={() => onFontSizeChange(Math.min(18, fontSize + 1))}
                style={({ pressed }) => [
                  styles.fontSizeButton,
                  pressed && styles.pressed,
                  fontSize >= 18 && styles.disabled,
                ]}
              >
                <Text style={styles.fontSizeButtonText}>A+</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </SectionCard>
    );
  }

  const liveLabel =
    streamState === 'live'
      ? '● live'
      : streamState === 'paused'
        ? 'paused'
        : streamState === 'error'
          ? 'offline'
          : 'connecting';

  const terminalCard = (
    <View
      style={[
        styles.terminalWebCard,
        // Height stays a ratio of the window even with the keyboard up: growing
        // the pane would resize the PTY and make the agent's TUI reflow.
        fullscreen ? styles.terminalWebCardFullscreen : { height: terminalPaneHeight },
        keyboardVisible && styles.terminalWebCardKeyboard,
      ]}
    >
      {!keyboardVisible ? (
        <View style={styles.terminalWebBar}>
          {fullscreen ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close full screen terminal"
              onPress={() => onFullscreenChange(false)}
              style={({ pressed }) => [
                styles.terminalWebBarButton,
                pressed && styles.pressed,
              ]}
            >
              <Icon name="chevron-down" size={16} color={terminalWeb.title} />
            </Pressable>
          ) : (
            <View style={styles.terminalWebGlyph} />
          )}
            {/* Short label: the grid readout needs the room more than the word. */}
            <Text numberOfLines={1} style={styles.terminalWebTitle}>
              Terminal
            </Text>
          <View style={styles.terminalWebBarSpacer} />
          <View style={styles.terminalWebBarRight}>
            <Text
              style={[
                styles.terminalWebLive,
                streamState !== 'live' && styles.terminalWebLiveIdle,
              ]}
            >
              {liveLabel}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                composeOpen ? 'Hide Chinese input' : 'Show Chinese input'
              }
              onPress={() => setComposeOpen((current) => !current)}
              style={({ pressed }) => [
                styles.terminalWebComposeToggle,
                composeOpen && styles.terminalWebComposeToggleActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.terminalWebComposeGlyph}>中</Text>
            </Pressable>
            <View style={styles.fontSizeControlWeb}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decrease terminal font size"
                disabled={fontSize <= 9}
                onPress={() => onFontSizeChange(Math.max(9, fontSize - 1))}
                style={[styles.fontSizeButtonWeb, fontSize <= 9 && styles.disabled]}
              >
                <Text style={styles.fontSizeButtonTextWeb}>A−</Text>
              </Pressable>
              {/* The grid is what actually decides whether a TUI fits. */}
              <Text style={styles.fontSizeValueWeb}>
                {grid ? `${grid.cols}×${grid.rows}` : fontSize}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Increase terminal font size"
                disabled={fontSize >= 18}
                onPress={() => onFontSizeChange(Math.min(18, fontSize + 1))}
                style={[styles.fontSizeButtonWeb, fontSize >= 18 && styles.disabled]}
              >
                <Text style={styles.fontSizeButtonTextWeb}>A+</Text>
              </Pressable>
            </View>
            {fullscreen ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  fullscreenKeysOpen ? 'Hide terminal keys' : 'Show terminal keys'
                }
                onPress={() => setFullscreenKeysOpen((current) => !current)}
                style={({ pressed }) => [
                  styles.terminalWebBarButton,
                  fullscreenKeysOpen && styles.terminalWebBarButtonActive,
                  pressed && styles.pressed,
                ]}
              >
                <Icon
                  name="keypad-outline"
                  size={15}
                  color={fullscreenKeysOpen ? terminalWeb.accent : terminalWeb.muted}
                />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open full screen terminal"
                onPress={() => onFullscreenChange(true)}
                style={({ pressed }) => [
                  styles.terminalWebBarButton,
                  pressed && styles.pressed,
                ]}
              >
                <Icon name="expand-outline" size={15} color={terminalWeb.muted} />
              </Pressable>
            )}
          </View>
        </View>
      ) : null}

      <LiveTerminalView
        fullscreen={fullscreen}
        active={appActive}
        blurRequest={terminalBlurRequest}
        gatewayUrl={gatewayUrl}
        gatewayAuthToken={gatewayAuthToken}
        target={target}
        fontSize={fontSize}
        onStateChange={reportStreamState}
        onFocusChange={onTerminalFocusChange}
        onGridChange={setGrid}
      />

      {composeOpen ? (
        <View style={styles.terminalWebCompose}>
          <TextInput
            value={composeText}
            onChangeText={setComposeText}
            onFocus={() => onTerminalFocusChange(false)}
            multiline
            editable={!composeBusy && streamState === 'live'}
            placeholder="Type a message — Enter to send"
            placeholderTextColor="#b8a88c"
            style={styles.terminalWebComposeInput}
            blurOnSubmit={false}
            onSubmitEditing={() => {
              void submitCompose();
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send text to terminal"
            disabled={!composeText.trim() || composeBusy || streamState !== 'live'}
            onPress={() => void submitCompose()}
            style={({ pressed }) => [
              styles.terminalWebComposeSend,
              pressed && styles.pressed,
              (!composeText.trim() || composeBusy || streamState !== 'live') &&
                styles.disabled,
            ]}
          >
            <Icon name="arrow-up" size={15} color="#fff" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  if (fullscreen) {
    return (
      <View style={styles.activityTerminalRoot}>
        {terminalCard}
        {!keyboardVisible && fullscreenKeysOpen ? (
          <View style={styles.fullscreenTerminalKeyboard}>
            <TerminalKeyboard
              disabled={!target || streamState !== 'live'}
              disabledReason={
                !target
                  ? 'Start agent to enable'
                  : streamState === 'paused'
                    ? 'Terminal paused'
                    : 'Connecting terminal…'
              }
              pending={terminalKeyPending}
              lastKey={lastTerminalKey}
              error={terminalKeyError}
              onKey={onTerminalKey}
            />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.activityTerminalRoot}
      contentContainerStyle={styles.activityTerminalScrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      scrollEnabled={!terminalTouch}
      nestedScrollEnabled
      showsVerticalScrollIndicator
    >
      <View
        onTouchStart={() => setTerminalTouch(true)}
        onTouchEnd={() => setTerminalTouch(false)}
        onTouchCancel={() => setTerminalTouch(false)}
      >
        {terminalCard}
      </View>
      {!keyboardVisible ? (
        <PlanPeek
          detail={detail}
          open={planOpen}
          onToggle={() => setPlanOpen((current) => !current)}
        />
      ) : null}
    </ScrollView>
  );
}

