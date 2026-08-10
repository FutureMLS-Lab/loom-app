import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { styles } from '../styles';
import { colors } from '../theme';
import type { TerminalCapture, TerminalKey } from '../types';
import { MAX_CAPTURE_LINES, type TerminalStreamState } from '../useTerminalSession';
import { EmptyState, Icon, SectionCard, StatusPill } from './primitives';

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
      onPress={() => onPress(value)}
      delayLongPress={360}
      onLongPress={
        repeat
          ? () => {
              onPress(value);
              stopRepeating();
              repeatTimerRef.current = setInterval(() => onPress(value), 180);
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
        pressed && styles.terminalKeyPressed,
      ]}
    >
      {active ? (
        <ActivityIndicator
          size="small"
          color={tone === 'primary' ? '#211a4a' : colors.primary}
        />
      ) : (
        <Text
          style={[
            styles.terminalKeyText,
            tone === 'primary' && styles.terminalKeyTextPrimary,
            tone === 'danger' && styles.terminalKeyTextDanger,
          ]}
        >
          {label}
        </Text>
      )}
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
          <View style={styles.projectModalHandle} />
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
              style={styles.iconButton}
            >
              <Icon name="close" color={colors.text} />
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
              <TerminalKeyButton {...common('Backspace')} label="⌫" repeat />
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
}: {
  disabled: boolean;
  disabledReason?: string;
  pending: number;
  lastKey: TerminalKey | null;
  error: string;
  onKey: (key: TerminalKey) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const keyActive = (key: TerminalKey) => pending > 0 && lastKey === key;

  return (
    <>
      <View style={styles.terminalKeyboard}>
        <View style={styles.terminalKeyboardHeader}>
          <View style={styles.terminalKeyboardTitleRow}>
            <Icon name="keypad-outline" size={15} color={colors.primary} />
            <Text style={styles.terminalKeyboardTitle}>Terminal keys</Text>
          </View>
          <View style={styles.terminalKeyboardHeaderRight}>
            <Text style={styles.terminalKeyboardStatus}>
          {disabled ? disabledReason : pending ? `${pending} queued` : 'Direct tmux input'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open expanded terminal keyboard"
              onPress={() => setExpanded(true)}
              style={({ pressed }) => [styles.keyboardExpandButton, pressed && styles.pressed]}
            >
              <Icon name="expand-outline" size={13} color={colors.primary} />
              <Text style={styles.keyboardExpandButtonText}>More</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.terminalKeyRow}>
          <TerminalKeyButton
            value="Escape"
            label="Esc"
            disabled={disabled}
            active={keyActive('Escape')}
            onPress={onKey}
          />
          <TerminalKeyButton
            value="C-c"
            label="⌃C"
            tone="danger"
            disabled={disabled}
            active={keyActive('C-c')}
            onPress={onKey}
          />
          <TerminalKeyButton value="Up" label="↑" repeat disabled={disabled} active={keyActive('Up')} onPress={onKey} />
          <TerminalKeyButton value="Down" label="↓" repeat disabled={disabled} active={keyActive('Down')} onPress={onKey} />
          <TerminalKeyButton value="Left" label="←" repeat disabled={disabled} active={keyActive('Left')} onPress={onKey} />
          <TerminalKeyButton value="Right" label="→" repeat disabled={disabled} active={keyActive('Right')} onPress={onKey} />
          <TerminalKeyButton value="Tab" label="Tab" disabled={disabled} active={keyActive('Tab')} onPress={onKey} />
          <TerminalKeyButton
            value="Enter"
            label="Enter"
            tone="primary"
            wide
            disabled={disabled}
            active={keyActive('Enter')}
            onPress={onKey}
          />
        </View>
        {error ? (
          <View style={styles.terminalKeyboardError}>
            <Icon name="warning-outline" size={14} color={colors.red} />
            <Text style={styles.terminalKeyboardErrorText}>{error}</Text>
          </View>
        ) : null}
        <Text style={styles.terminalKeyboardHint}>
          {disabled
            ? disabledReason
            : 'Keys act immediately. Double-tap Enter to force a queued Cursor follow-up.'}
        </Text>
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
}) {
  const { width: windowWidth } = useWindowDimensions();
  const screenHeight = Dimensions.get('screen').height;
  const [reloadToken, setReloadToken] = useState(0);
  const [streamError, setStreamError] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const [linesBehind, setLinesBehind] = useState(0);
  const webViewRef = useRef<WebView>(null);
  const stableWidth = Math.max(280, windowWidth - (fullscreen ? 16 : 40));
  const stableHeight = fullscreen
    ? Math.max(420, screenHeight - 190)
    : Math.max(300, Math.min(620, Math.round(screenHeight * 0.5)));
  const columns = Math.max(
    32,
    Math.min(140, Math.floor((stableWidth - 18) / (fontSize * 0.62))),
  );
  const rows = Math.max(
    14,
    Math.min(80, Math.floor((stableHeight - 18) / (fontSize * 1.18))),
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
        };
        if (message.type === 'terminal-status' && message.state) {
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
          onFocusChange?.(message.focused);
        }
      } catch {
        // Ignore non-terminal WebView messages.
      }
    },
    [onFocusChange, setState],
  );

  useEffect(
    () => () => {
      onFocusChange?.(false);
    },
    [onFocusChange],
  );

  useEffect(() => {
    setAtBottom(true);
    setLinesBehind(0);
  }, [target]);

  const sendScrollCommand = useCallback((command: 'page-up' | 'latest' | 'page-down') => {
    webViewRef.current?.injectJavaScript(
      `window.loomTerminalControl?.(${JSON.stringify(command)}); true;`,
    );
  }, []);

  const sendScrollLines = useCallback((lines: number) => {
    webViewRef.current?.injectJavaScript(
      `window.loomTerminalScrollLines?.(${Math.round(lines)}); true;`,
    );
  }, []);

  const focusTerminal = useCallback(() => {
    webViewRef.current?.injectJavaScript(
      'window.loomTerminalFocus?.(); true;',
    );
  }, []);

  const panLastDyRef = useRef(0);
  const panRemainderRef = useRef(0);
  const terminalPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          panLastDyRef.current = 0;
          panRemainderRef.current = 0;
        },
        onPanResponderMove: (_event, gesture) => {
          const delta = gesture.dy - panLastDyRef.current;
          panLastDyRef.current = gesture.dy;
          panRemainderRef.current += delta;
          const pixelsPerLine = Math.max(5, fontSize * 0.55);
          const lines = Math.trunc(panRemainderRef.current / pixelsPerLine);
          if (!lines) return;
          sendScrollLines(-lines);
          panRemainderRef.current -= lines * pixelsPerLine;
        },
        onPanResponderRelease: (_event, gesture) => {
          if (Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6) {
            focusTerminal();
          } else if (Math.abs(gesture.vy) > 0.3) {
            const momentumLines = Math.max(
              -24,
              Math.min(24, Math.round(-gesture.vy * 18)),
            );
            if (momentumLines) sendScrollLines(momentumLines);
          }
          panLastDyRef.current = 0;
          panRemainderRef.current = 0;
        },
        onPanResponderTerminate: () => {
          panLastDyRef.current = 0;
          panRemainderRef.current = 0;
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [focusTerminal, fontSize, sendScrollLines],
  );

  const resizeTerminal = useCallback(
    (width: number, height: number) => {
      latestLayoutRef.current = { width, height };
      if (!webReadyRef.current || width < 120 || height < 120) return;
      const nextColumns = Math.max(
        24,
        Math.min(220, Math.floor((width - 18) / (fontSize * 0.62))),
      );
      const nextRows = Math.max(
        10,
        Math.min(100, Math.floor((height - 18) / (fontSize * 1.18))),
      );
      webViewRef.current?.injectJavaScript(
        `window.loomTerminalResize?.(${nextColumns}, ${nextRows}); true;`,
      );
    },
    [fontSize],
  );

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
      ]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
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
        keyboardDisplayRequiresUserAction
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
      <View
        style={styles.liveTerminalGestureLayer}
        {...terminalPanResponder.panHandlers}
      />
      {!atBottom ? (
        <View style={styles.liveTerminalControls}>
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
  onFontSizeChange: (fontSize: number) => void;
  onLoadMore: () => void;
  onTerminalKey: (key: TerminalKey) => void;
  onTerminalFocusChange: (focused: boolean) => void;
  onFullscreenChange: (fullscreen: boolean) => void;
  onStreamStateChange: (state: TerminalStreamState) => void;
}) {
  const [streamState, setStreamState] = useState<TerminalStreamState>('connecting');
  const [fullscreenKeysOpen, setFullscreenKeysOpen] = useState(false);
  const liveTerminal = Platform.OS !== 'web';

  const reportStreamState = useCallback(
    (state: TerminalStreamState) => {
      setStreamState(state);
      onStreamStateChange(state);
    },
    [onStreamStateChange],
  );

  useEffect(() => {
    reportStreamState('connecting');
    setFullscreenKeysOpen(false);
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

  return (
    <>
    {fullscreen && !keyboardVisible ? (
      <View style={styles.fullscreenTerminalHeader}>
        <View style={styles.fullscreenTerminalHeaderCopy}>
          <Text style={styles.fullscreenTerminalTitle}>Live terminal</Text>
          <Text numberOfLines={1} style={styles.fullscreenTerminalTarget}>
            {target}
          </Text>
        </View>
        <View style={styles.fullscreenTerminalHeaderActions}>
          <View style={styles.fontSizeControl}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease terminal font size"
              disabled={fontSize <= 9}
              onPress={() => onFontSizeChange(Math.max(9, fontSize - 1))}
              style={[styles.fontSizeButton, fontSize <= 9 && styles.disabled]}
            >
              <Text style={styles.fontSizeButtonText}>A−</Text>
            </Pressable>
            <Text style={styles.fontSizeValue}>{fontSize}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase terminal font size"
              disabled={fontSize >= 18}
              onPress={() => onFontSizeChange(Math.min(18, fontSize + 1))}
              style={[styles.fontSizeButton, fontSize >= 18 && styles.disabled]}
            >
              <Text style={styles.fontSizeButtonText}>A+</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close full screen terminal"
            onPress={() => onFullscreenChange(false)}
            style={styles.iconButton}
          >
            <Icon name="close" color={colors.text} />
          </Pressable>
        </View>
      </View>
    ) : null}
    <SectionCard
      fill
      hideHeader={keyboardVisible || fullscreen}
      title="Agent activity"
      icon="pulse-outline"
      action={
        <View style={styles.sectionActions}>
          {liveTerminal ? (
            <View
              style={[
                styles.liveStatus,
                streamState === 'error' && styles.liveStatusError,
              ]}
            >
              <View
                style={[
                  styles.liveStatusDot,
                  streamState === 'live' && styles.liveStatusDotOnline,
                  streamState === 'error' && styles.liveStatusDotError,
                ]}
              />
              <Text
                style={[
                  styles.liveStatusText,
                  streamState === 'live' && styles.liveStatusTextOnline,
                  streamState === 'error' && styles.liveStatusTextError,
                ]}
              >
                {streamState === 'live'
                  ? 'Live'
                  : streamState === 'paused'
                    ? 'Paused'
                  : streamState === 'error'
                    ? 'Offline'
                    : 'Connecting'}
              </Text>
            </View>
          ) : (
            <Text style={styles.captureLineCount}>{captureLines} lines</Text>
          )}
          <StatusPill
            running={working}
            label={working ? 'Working' : running ? 'Ready' : 'Stopped'}
          />
          {liveTerminal && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open full screen terminal"
              onPress={() => onFullscreenChange(true)}
              style={({ pressed }) => [
                styles.sectionIconButton,
                pressed && styles.pressed,
              ]}
            >
              <Icon name="expand-outline" size={15} color={colors.primary} />
            </Pressable>
          )}
        </View>
      }
    >
      {!keyboardVisible && !liveTerminal && (
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
      )}
      {liveTerminal ? (
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
        />
      ) : (
        <View style={[styles.terminal, styles.terminalContent]}>
          <Text selectable style={[styles.terminalText, { fontSize, lineHeight: fontSize * 1.5 }]}>
            {capture?.text?.trim() ||
              (running ? 'Waiting for agent output…' : 'No terminal output captured.')}
          </Text>
        </View>
      )}
      {!keyboardVisible && !fullscreen && (
      <View style={styles.terminalFoot}>
        {liveTerminal ? (
          <Text style={styles.terminalFootCompactText}>Live PTY</Text>
        ) : (
          <View style={styles.terminalFootCopy}>
            <Icon name="information-circle-outline" size={15} />
            <Text style={styles.terminalFootText}>
              Terminal snapshot. Drag vertically anywhere to continue through the page.
            </Text>
          </View>
        )}
        <View style={styles.terminalFootActions}>
          {!liveTerminal && captureLines < MAX_CAPTURE_LINES && (
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
      )}
    </SectionCard>
    {fullscreen && !keyboardVisible ? (
      <View style={styles.fullscreenTerminalKeyboard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fullscreenKeysOpen ? 'Hide terminal keys' : 'Show terminal keys'}
          onPress={() => setFullscreenKeysOpen((current) => !current)}
          style={({ pressed }) => [
            styles.terminalKeysToggle,
            pressed && styles.pressed,
          ]}
        >
          <Icon name="keypad-outline" size={15} color={colors.primary} />
          <Text style={styles.terminalKeysToggleText}>
            {fullscreenKeysOpen ? 'Hide keys' : 'Keys'}
          </Text>
          <Icon
            name={fullscreenKeysOpen ? 'chevron-down' : 'chevron-up'}
            size={13}
            color={colors.textDim}
          />
        </Pressable>
        {fullscreenKeysOpen ? (
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
        ) : null}
      </View>
    ) : null}
    </>
  );
}

