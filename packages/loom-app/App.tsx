import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import {
  WebView,
  type WebViewMessageEvent,
} from 'react-native-webview';
import Markdown from 'react-native-markdown-display';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  agentTarget,
  DEFAULT_GATEWAY_AUTH_TOKEN,
  DEFAULT_GATEWAY_URL,
  LoomClient,
  projectLabel,
} from './src/loomClient';
import type {
  LoomProject,
  LoomTask,
  SessionList,
  TaskDetail,
  TaskDiff,
  TerminalCapture,
  TerminalKey,
} from './src/types';

const colors = {
  background: '#131216',
  sidebar: '#19181d',
  card: '#201f24',
  cardElevated: '#28262d',
  surface: '#302e36',
  border: '#3b3942',
  borderSoft: '#2c2a31',
  text: '#f2eef4',
  textMuted: '#aaa5b0',
  textDim: '#77727e',
  primary: '#c8bfff',
  primaryStrong: '#a99cff',
  primaryMuted: '#403a62',
  green: '#82d3a2',
  greenMuted: '#213b2b',
  red: '#ffaaa1',
  redMuted: '#482a2b',
  amber: '#e7c27d',
  amberMuted: '#443923',
};

const markdownStyles = StyleSheet.create({
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 23,
  },
  heading1: {
    color: colors.text,
    fontSize: 25,
    lineHeight: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: 8,
    marginBottom: 14,
  },
  heading2: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '800',
    letterSpacing: -0.25,
    marginTop: 18,
    marginBottom: 10,
  },
  heading3: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
    marginTop: 15,
    marginBottom: 8,
  },
  heading4: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 6,
  },
  heading5: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 5,
  },
  heading6: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 9,
    marginBottom: 5,
  },
  paragraph: { marginTop: 0, marginBottom: 12 },
  strong: { color: colors.text, fontWeight: '800' },
  em: { color: '#d7d0dc', fontStyle: 'italic' },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  blockquote: {
    marginVertical: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.primaryStrong,
    borderRadius: 8,
    backgroundColor: colors.primaryMuted,
  },
  bullet_list: { marginBottom: 10 },
  ordered_list: { marginBottom: 10 },
  list_item: { marginBottom: 5 },
  bullet_list_icon: { color: colors.primary, marginRight: 8 },
  ordered_list_icon: { color: colors.primary, marginRight: 8 },
  code_inline: {
    color: '#e0d8ff',
    backgroundColor: colors.surface,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
  },
  code_block: {
    color: '#ded9e2',
    backgroundColor: '#111014',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    padding: 12,
    marginVertical: 10,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 18,
  },
  fence: {
    color: '#ded9e2',
    backgroundColor: '#111014',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    padding: 12,
    marginVertical: 10,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 18,
  },
  hr: { height: 1, backgroundColor: colors.border, marginVertical: 18 },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginVertical: 10,
  },
  thead: { backgroundColor: colors.surface },
  th: {
    color: colors.text,
    fontWeight: '800',
    padding: 8,
    borderColor: colors.border,
  },
  tr: { borderBottomWidth: 1, borderColor: colors.borderSoft },
  td: { color: colors.textMuted, padding: 8, borderColor: colors.borderSoft },
});

type Tab = 'activity' | 'changes' | 'notes';
type IconName = keyof typeof Ionicons.glyphMap;

const DIFF_PREVIEW_LIMIT = 8000;
const MAX_CAPTURE_LINES = 500;
const TERMINAL_FONT_SIZE_KEY = 'loom-app:terminal-font-size';
const SELECTED_PROJECT_KEY = 'loom-app:selected-project';
const SELECTED_TAB_KEY = 'loom-app:selected-tab';
const GATEWAY_URL_KEY = 'loom-app:gateway-url';
const loomIcon = require('./assets/loom-icon.png');

function Icon({
  name,
  size = 18,
  color = colors.textMuted,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

function LoomMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.mark, compact && styles.markCompact]}>
      <Image
        accessibilityLabel="Loom"
        source={loomIcon}
        resizeMode="cover"
        style={styles.markImage}
      />
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  disabled,
  tone = 'neutral',
  compact = false,
  iconOnly = false,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'primary' | 'danger';
  compact?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        tone === 'primary' && styles.actionButtonPrimary,
        tone === 'danger' && styles.actionButtonDanger,
        compact && styles.actionButtonCompact,
        iconOnly && styles.actionButtonIconOnly,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Icon
        name={icon}
        size={compact ? 15 : 17}
        color={
          tone === 'primary'
            ? '#211a4a'
            : tone === 'danger'
              ? colors.red
              : colors.text
        }
      />
      {!iconOnly && (
        <Text
          style={[
            styles.actionButtonText,
            tone === 'primary' && styles.actionButtonTextPrimary,
            tone === 'danger' && styles.actionButtonTextDanger,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function StatusPill({
  running,
  label,
}: {
  running: boolean;
  label?: string;
}) {
  return (
    <View style={[styles.statusPill, running ? styles.statusRunning : styles.statusIdle]}>
      <View style={[styles.statusDot, running ? styles.dotRunning : styles.dotIdle]} />
      <Text style={[styles.statusText, running && styles.statusTextRunning]}>
        {label || (running ? 'Running' : 'Idle')}
      </Text>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  detail,
}: {
  icon: IconName;
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={25} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

function TaskRow({
  task,
  selected,
  onPress,
  compact,
}: {
  task: LoomTask;
  selected: boolean;
  onPress: () => void;
  compact: boolean;
}) {
  const hasPane = Boolean(task.tmux_interview_target);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.title || task.slug}. ${task.general_goal || 'No task description'}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.taskRow,
        selected && styles.taskRowSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.taskRowTop}>
        <View style={[styles.agentGlyph, selected && styles.agentGlyphSelected]}>
          <Icon
            name={task.kind === 'kernel' ? 'hardware-chip-outline' : 'sparkles-outline'}
            size={16}
            color={selected ? colors.primary : colors.textMuted}
          />
        </View>
        <View style={styles.taskRowCopy}>
          <Text numberOfLines={compact ? 2 : 1} style={styles.taskTitle}>
            {task.title || task.slug}
          </Text>
          <Text numberOfLines={compact ? 3 : 2} style={styles.taskGoal}>
            {task.general_goal || 'No task description'}
          </Text>
        </View>
      </View>
      <View style={styles.taskMeta}>
        <View style={styles.taskMetaItem}>
          <View style={[styles.miniDot, hasPane && styles.miniDotLive]} />
          <Text style={styles.taskMetaText}>{task.agent || 'cursor'}</Text>
        </View>
        <Text numberOfLines={1} style={[styles.taskMetaText, styles.taskMetaModel]}>
          {task.interview_model || task.kind || 'agent'}
        </Text>
      </View>
    </Pressable>
  );
}

function SectionCard({
  title,
  icon,
  action,
  children,
  fill = false,
  hideHeader = false,
}: {
  title: string;
  icon: IconName;
  action?: ReactNode;
  children: ReactNode;
  fill?: boolean;
  hideHeader?: boolean;
}) {
  return (
    <View style={[styles.sectionCard, fill && styles.sectionCardFill]}>
      {!hideHeader && (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Icon name={icon} size={17} color={colors.primary} />
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

function ProjectPickerModal({
  visible,
  projects,
  selectedId,
  mutationBusy,
  mutationError,
  onSelect,
  onAdd,
  onRemove,
  onClose,
}: {
  visible: boolean;
  projects: LoomProject[];
  selectedId: string;
  mutationBusy: boolean;
  mutationError: string;
  onSelect: (projectId: string) => void;
  onAdd: (path: string) => Promise<boolean>;
  onRemove: (project: LoomProject) => void;
  onClose: () => void;
}) {
  const [showAddProject, setShowAddProject] = useState(false);
  const [projectPath, setProjectPath] = useState('');

  const submitProject = async () => {
    const added = await onAdd(projectPath);
    if (!added) return;
    setProjectPath('');
    setShowAddProject(false);
  };

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.projectModalOverlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close project picker"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.projectModalSheet}>
          <View style={styles.projectModalHandle} />
          <View style={styles.projectModalHeader}>
            <View>
              <Text style={styles.projectModalTitle}>Projects</Text>
              <Text style={styles.projectModalSubtitle}>
                {projects.length} available workspaces
              </Text>
            </View>
            <View style={styles.projectModalHeaderActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showAddProject ? 'Hide add project form' : 'Add project'}
                disabled={mutationBusy}
                onPress={() => setShowAddProject((current) => !current)}
                style={({ pressed }) => [
                  styles.projectAddButton,
                  pressed && styles.pressed,
                  mutationBusy && styles.disabled,
                ]}
              >
                <Icon name={showAddProject ? 'remove' : 'add'} size={17} color={colors.primary} />
                <Text style={styles.projectAddButtonText}>
                  {showAddProject ? 'Cancel' : 'Add'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                style={styles.iconButton}
              >
                <Icon name="close" color={colors.text} />
              </Pressable>
            </View>
          </View>
          {showAddProject && (
            <View style={styles.projectAddPanel}>
              <Text style={styles.projectAddLabel}>Existing server-side project path</Text>
              <Text style={styles.projectAddHelp}>
                Enter a directory that exists on the machine running Loom.
              </Text>
              <View style={styles.projectAddRow}>
                <TextInput
                  value={projectPath}
                  onChangeText={setProjectPath}
                  editable={!mutationBusy}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  placeholder="/home/user/project"
                  placeholderTextColor={colors.textDim}
                  style={styles.projectAddInput}
                  onSubmitEditing={() => void submitProject()}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!projectPath.trim() || mutationBusy}
                  onPress={() => void submitProject()}
                  style={({ pressed }) => [
                    styles.projectAddSubmit,
                    pressed && styles.pressed,
                    (!projectPath.trim() || mutationBusy) && styles.disabled,
                  ]}
                >
                  {mutationBusy ? (
                    <ActivityIndicator size="small" color="#211a4a" />
                  ) : (
                    <Icon name="arrow-forward" color="#211a4a" />
                  )}
                </Pressable>
              </View>
            </View>
          )}
          {mutationError ? (
            <View style={styles.projectMutationError}>
              <Icon name="warning-outline" color={colors.red} size={16} />
              <Text selectable style={styles.projectMutationErrorText}>
                {mutationError}
              </Text>
            </View>
          ) : null}
          <FlatList
            data={projects}
            keyExtractor={(project) => project.id}
            contentContainerStyle={styles.projectModalList}
            showsVerticalScrollIndicator
            renderItem={({ item }) => {
              const selected = item.id === selectedId;
              return (
                <View
                  style={[
                    styles.projectModalRow,
                    selected && styles.projectModalRowSelected,
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => onSelect(item.id)}
                    style={({ pressed }) => [styles.projectModalSelect, pressed && styles.pressed]}
                  >
                    <View
                      style={[
                        styles.projectModalIcon,
                        selected && styles.projectModalIconSelected,
                      ]}
                    >
                      <Icon
                        name="folder-open-outline"
                        color={selected ? colors.primary : colors.textMuted}
                      />
                    </View>
                    <View style={styles.projectModalCopy}>
                      <Text
                        style={[
                          styles.projectModalName,
                          selected && styles.projectModalNameSelected,
                        ]}
                      >
                        {projectLabel(item)}
                      </Text>
                      <Text numberOfLines={2} style={styles.projectModalPath}>
                        {item.path}
                      </Text>
                    </View>
                    {selected && (
                      <Icon name="checkmark-circle" color={colors.primary} size={21} />
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Close project ${projectLabel(item)} without deleting files`}
                    disabled={mutationBusy}
                    onPress={() => onRemove(item)}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.projectRemoveButton,
                      pressed && styles.pressed,
                      mutationBusy && styles.disabled,
                    ]}
                  >
                    <Icon name="close-circle-outline" color={colors.textDim} size={20} />
                  </Pressable>
                </View>
              );
            }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function DiffPatch({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = content.length > DIFF_PREVIEW_LIMIT;
  const visibleContent = expanded ? content : content.slice(0, DIFF_PREVIEW_LIMIT);

  return (
    <View style={styles.patchShell}>
      <View style={styles.patch}>
        <Text selectable style={styles.patchText}>
          {visibleContent}
        </Text>
      </View>
      {truncated && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((current) => !current)}
          style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}
        >
          <Icon name={expanded ? 'chevron-up' : 'expand-outline'} size={15} color={colors.primary} />
          <Text style={styles.expandButtonText}>
            {expanded ? 'Collapse diff' : `Show complete diff (${content.length.toLocaleString()} characters)`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function TerminalKeyButton({
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

function ExpandedTerminalKeyboard({
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

function TerminalKeyboard({
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
            : 'Keys act immediately in the active terminal. Enter confirms the highlighted choice.'}
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

type TerminalStreamState = 'connecting' | 'live' | 'paused' | 'error';

function LiveTerminalView({
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

function ActivityView({
  capture,
  running,
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
          <StatusPill running={running} />
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

function ChangesView({ diff }: { diff: TaskDiff | null }) {
  const worktrees = diff?.worktrees || [];
  const files = worktrees.flatMap((worktree) =>
    (worktree.files || []).map((file) => ({ worktree, file })),
  );
  const errors = worktrees.filter((worktree) => worktree.error);

  return (
    <SectionCard
      title="Code changes"
      icon="git-compare-outline"
      action={files.length ? <Text style={styles.sectionMeta}>{files.length} files</Text> : undefined}
    >
      {!files.length && !errors.length ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title="Working tree is clean"
          detail="Changes made by the agent will appear here."
        />
      ) : (
        <View style={styles.diffList}>
          {errors.map((worktree, index) => (
            <View key={`${worktree.path || 'worktree'}:error:${index}`} style={styles.inlineError}>
              <Icon name="warning-outline" color={colors.red} />
              <View style={styles.inlineErrorCopy}>
                <Text numberOfLines={2} style={styles.inlineErrorTitle}>
                  {worktree.path || 'Worktree'}
                </Text>
                <Text selectable style={styles.inlineErrorText}>
                  {worktree.error}
                </Text>
              </View>
            </View>
          ))}
          {files.map(({ worktree, file }, index) => (
            <View key={`${worktree.path || 'worktree'}:${file.path}:${index}`} style={styles.diffFile}>
              <View style={styles.diffFileHeader}>
                <View style={styles.diffFileName}>
                  <Icon name="document-text-outline" size={16} color={colors.textMuted} />
                  <Text numberOfLines={1} style={styles.diffPath}>
                    {file.path}
                  </Text>
                </View>
                <View style={styles.diffStats}>
                  {typeof file.additions === 'number' && (
                    <Text style={styles.additions}>+{file.additions}</Text>
                  )}
                  {typeof file.deletions === 'number' && (
                    <Text style={styles.deletions}>−{file.deletions}</Text>
                  )}
                  {file.status && <Text style={styles.diffStatus}>{file.status}</Text>}
                </View>
              </View>
              {(file.patch || file.diff) && (
                <DiffPatch content={file.patch || file.diff || ''} />
              )}
            </View>
          ))}
        </View>
      )}
    </SectionCard>
  );
}

function MarkdownDocument({
  name,
  content,
}: {
  name: string;
  content: string;
}) {
  const [showSource, setShowSource] = useState(false);

  return (
    <SectionCard
      title={name}
      icon="reader-outline"
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showSource ? `Preview ${name}` : `View ${name} source`}
          onPress={() => setShowSource((current) => !current)}
          style={({ pressed }) => [styles.markdownModeButton, pressed && styles.pressed]}
        >
          <Icon
            name={showSource ? 'reader-outline' : 'code-slash-outline'}
            size={14}
            color={colors.primary}
          />
          <Text style={styles.markdownModeButtonText}>
            {showSource ? 'Preview' : 'Source'}
          </Text>
        </Pressable>
      }
    >
      {showSource ? (
        <Text selectable style={styles.notesSourceText}>
          {content}
        </Text>
      ) : (
        <View style={styles.markdownDocument}>
          <Markdown mergeStyle style={markdownStyles}>
            {content}
          </Markdown>
        </View>
      )}
    </SectionCard>
  );
}

function NotesView({ detail }: { detail: TaskDetail | null }) {
  const documents: Array<{ name: string; content: string }> = [];
  const seen = new Set<string>();

  for (const [name, content] of Object.entries(detail?.templates || {})) {
    if (!content) continue;
    documents.push({ name, content });
    seen.add(name.toLowerCase());
  }
  for (const file of detail?.task_markdown_files || []) {
    if (!file.content || seen.has(file.name.toLowerCase())) continue;
    documents.push({ name: file.name, content: file.content });
    seen.add(file.name.toLowerCase());
  }
  documents.sort((left, right) => {
    const rank = (name: string) => {
      const normalized = name.toLowerCase();
      if (normalized === 'plan.md') return 0;
      if (normalized === 'wiki.md') return 1;
      return 2;
    };
    return rank(left.name) - rank(right.name) || left.name.localeCompare(right.name);
  });

  if (!documents.length) {
    return (
      <SectionCard title="Task notes" icon="reader-outline">
        <EmptyState
          icon="reader-outline"
          title="No notes yet"
          detail="PLAN.md, WIKI.md, and other task documents from Loom will appear here."
        />
      </SectionCard>
    );
  }

  return (
    <View style={styles.contentStack}>
      {documents.map((document) => (
        <MarkdownDocument
          key={document.name}
          name={document.name}
          content={document.content}
        />
      ))}
    </View>
  );
}

function LoomApp() {
  const { width } = useWindowDimensions();
  const isCompact = width < 820;
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY_URL);
  const [gatewayDraft, setGatewayDraft] = useState(DEFAULT_GATEWAY_URL);
  const client = useMemo(
    () => new LoomClient(gatewayUrl, DEFAULT_GATEWAY_AUTH_TOKEN),
    [gatewayUrl],
  );

  const [projects, setProjects] = useState<LoomProject[]>([]);
  const [tasks, setTasks] = useState<LoomTask[]>([]);
  const [projectId, setProjectId] = useState('');
  const [selectedSlug, setSelectedSlug] = useState('');
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [sessions, setSessions] = useState<SessionList | null>(null);
  const [diff, setDiff] = useState<TaskDiff | null>(null);
  const [capture, setCapture] = useState<TerminalCapture | null>(null);
  const [tab, setTab] = useState<Tab>('activity');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectMutationBusy, setProjectMutationBusy] = useState(false);
  const [projectMutationError, setProjectMutationError] = useState('');
  const [gatewayExpanded, setGatewayExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [tasksLoading, setTasksLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [taskListError, setTaskListError] = useState('');
  const [taskError, setTaskError] = useState('');
  const [captureLines, setCaptureLines] = useState(180);
  const [terminalFontSize, setTerminalFontSize] = useState(12);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [terminalKeyPending, setTerminalKeyPending] = useState(0);
  const [lastTerminalKey, setLastTerminalKey] = useState<TerminalKey | null>(null);
  const [terminalKeyError, setTerminalKeyError] = useState('');
  const [terminalKeysOpen, setTerminalKeysOpen] = useState(false);
  const [terminalFullscreen, setTerminalFullscreen] = useState(false);
  const [terminalStreamState, setTerminalStreamState] =
    useState<TerminalStreamState>('connecting');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [terminalFocused, setTerminalFocused] = useState(false);
  const [terminalBlurRequest, setTerminalBlurRequest] = useState(0);
  const selectedRef = useRef({ projectId: '', slug: '' });
  const captureLinesRef = useRef(180);
  const tasksRequestRef = useRef(0);
  const terminalTargetRef = useRef('');
  const terminalKeyQueueRef = useRef<Promise<void>>(Promise.resolve());
  const terminalKeyPendingRef = useRef(0);
  const terminalKeyGenerationRef = useRef(0);

  const selectedProject = projects.find((project) => project.id === projectId) || null;
  const selectedTask = tasks.find((task) => task.slug === selectedSlug) || null;
  const running = Boolean(detail?.claude?.agent_running || sessions?.agent_running);
  const target = agentTarget(detail, sessions);
  terminalTargetRef.current = target;
  const keyboardFocusMode = isCompact && keyboardVisible && tab === 'activity';
  const terminalKeyboardFocusMode = keyboardFocusMode && terminalFocused;

  const loadProjects = useCallback(async () => {
    const applyProjects = (nextProjects: LoomProject[], baseUrl: string) => {
      setProjects(nextProjects);
      if (settingsHydrated) {
        void AsyncStorage.setItem(GATEWAY_URL_KEY, baseUrl).catch(() => {});
      }
      setProjectId((current) => {
        const nextProjectId =
          current && nextProjects.some((project) => project.id === current)
            ? current
            : nextProjects[0]?.id || '';
        if (nextProjectId !== current) {
          selectedRef.current = { projectId: nextProjectId, slug: '' };
        }
        return nextProjectId;
      });
    };

    setConnectionError('');
    try {
      await client.health();
      const nextProjects = await client.projects();
      applyProjects(nextProjects, client.baseUrl);
    } catch (error) {
      const defaultClient = new LoomClient(
        DEFAULT_GATEWAY_URL,
        DEFAULT_GATEWAY_AUTH_TOKEN,
      );
      if (client.baseUrl !== defaultClient.baseUrl) {
        try {
          await defaultClient.health();
          const fallbackProjects = await defaultClient.projects();
          setGatewayUrl(defaultClient.baseUrl);
          setGatewayDraft(defaultClient.baseUrl);
          applyProjects(fallbackProjects, defaultClient.baseUrl);
          return;
        } catch {
          // Report the original connection failure below.
        }
      }
      setConnectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [client, settingsHydrated]);

  const loadTasks = useCallback(
    async (nextProjectId: string) => {
      const requestId = ++tasksRequestRef.current;
      if (!nextProjectId) {
        setTasks([]);
        setTasksLoading(false);
        setTaskListError('');
        return;
      }
      setTasksLoading(true);
      setTaskListError('');
      try {
        const nextTasks = await client.tasks(nextProjectId);
        if (tasksRequestRef.current !== requestId) return;
        setTasks(nextTasks);
        setSelectedSlug((current) =>
          current && nextTasks.some((task) => task.slug === current)
            ? current
            : isCompact
              ? ''
              : nextTasks[0]?.slug || '',
        );
      } catch (error) {
        if (tasksRequestRef.current !== requestId) return;
        setTaskListError(error instanceof Error ? error.message : String(error));
      } finally {
        if (tasksRequestRef.current === requestId) {
          setTasksLoading(false);
        }
      }
    },
    [client, isCompact],
  );

  const loadSelected = useCallback(
    async (includeDiff = false) => {
      const current = selectedRef.current;
      if (!current.projectId || !current.slug) return;
      try {
        const [nextDetail, nextSessions, nextDiff] = await Promise.all([
          client.task(current.projectId, current.slug),
          client.sessions(current.projectId, current.slug),
          includeDiff ? client.diff(current.projectId, current.slug) : Promise.resolve(null),
        ]);
        if (
          selectedRef.current.projectId !== current.projectId ||
          selectedRef.current.slug !== current.slug
        ) {
          return;
        }
        setDetail(nextDetail);
        setSessions(nextSessions);
        if (nextDiff) setDiff(nextDiff);
        const nextTarget = agentTarget(nextDetail, nextSessions);
        if (nextTarget && Platform.OS === 'web') {
          try {
            const nextCapture = await client.capture(nextTarget, captureLinesRef.current);
            if (
              selectedRef.current.projectId === current.projectId &&
              selectedRef.current.slug === current.slug
            ) {
              setCapture(nextCapture);
            }
          } catch {
            setCapture(null);
          }
        } else {
          setCapture(null);
        }
        setTaskError('');
      } catch (error) {
        if (
          selectedRef.current.projectId === current.projectId &&
          selectedRef.current.slug === current.slug
        ) {
          setTaskError(error instanceof Error ? error.message : String(error));
        }
      }
    },
    [client],
  );

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.multiGet([
      TERMINAL_FONT_SIZE_KEY,
      SELECTED_PROJECT_KEY,
      SELECTED_TAB_KEY,
      GATEWAY_URL_KEY,
    ])
      .then((entries) => {
        if (cancelled) return;
        const values = Object.fromEntries(entries);
        const parsed = Number(values[TERMINAL_FONT_SIZE_KEY]);
        if (Number.isFinite(parsed)) {
          setTerminalFontSize(Math.max(9, Math.min(18, Math.round(parsed))));
        }
        const savedProject = values[SELECTED_PROJECT_KEY]?.trim();
        if (savedProject) setProjectId(savedProject);
        const savedTab = values[SELECTED_TAB_KEY];
        if (savedTab === 'activity' || savedTab === 'changes' || savedTab === 'notes') {
          setTab(savedTab);
        }
        const savedGateway = values[GATEWAY_URL_KEY]?.trim().replace(/\/+$/, '');
        if (
          savedGateway?.startsWith('https://') ||
          savedGateway?.startsWith('http://')
        ) {
          setGatewayUrl(savedGateway);
          setGatewayDraft(savedGateway);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSettingsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsHydrated) return;
    const entries: Array<[string, string]> = [
      [TERMINAL_FONT_SIZE_KEY, String(terminalFontSize)],
      [SELECTED_TAB_KEY, tab],
    ];
    if (projectId) entries.push([SELECTED_PROJECT_KEY, projectId]);
    void AsyncStorage.multiSet(entries).catch(() => {});
  }, [projectId, settingsHydrated, tab, terminalFontSize]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      setAppActive(active);
      if (active) void loadProjects();
    });
    return () => subscription.remove();
  }, [loadProjects]);

  useEffect(() => {
    if (!appActive) return;
    const timer = setInterval(() => void loadProjects(), 30000);
    return () => clearInterval(timer);
  }, [appActive, loadProjects]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    setSelectedSlug('');
    setTasks([]);
    setDetail(null);
    setSessions(null);
    setDiff(null);
    setCapture(null);
    setTaskListError('');
    setTaskError('');
    void loadTasks(projectId);
  }, [loadTasks, projectId]);

  useEffect(() => {
    selectedRef.current = { projectId, slug: selectedSlug };
    captureLinesRef.current = 180;
    setCaptureLines(180);
    setDetail(null);
    setSessions(null);
    setDiff(null);
    setCapture(null);
    setTerminalKeyError('');
    setLastTerminalKey(null);
    setTerminalKeysOpen(false);
    setTerminalFullscreen(false);
    setTerminalStreamState('connecting');
    setTerminalFocused(false);
    terminalKeyGenerationRef.current += 1;
    terminalKeyQueueRef.current = Promise.resolve();
  }, [projectId, selectedSlug]);

  useEffect(() => {
    if (!projectId || !selectedSlug || !appActive) return;
    void loadSelected(true);
    const timer = setInterval(() => void loadSelected(false), 4000);
    return () => clearInterval(timer);
  }, [appActive, loadSelected, projectId, selectedSlug]);

  useEffect(() => {
    if (!isCompact) setProjectPickerOpen(false);
  }, [isCompact]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadProjects(), loadTasks(projectId), loadSelected(true)]);
  }, [loadProjects, loadSelected, loadTasks, projectId]);

  const loadOlderCapture = useCallback(() => {
    const nextLines = Math.min(captureLinesRef.current * 2, MAX_CAPTURE_LINES);
    if (nextLines === captureLinesRef.current) return;
    captureLinesRef.current = nextLines;
    setCaptureLines(nextLines);
    void loadSelected(false);
  }, [loadSelected]);

  const sendTerminalKey = useCallback(
    (key: TerminalKey) => {
      const currentTarget = terminalTargetRef.current;
      if (!currentTarget) {
        setTerminalKeyError('No active terminal target is available.');
        return;
      }
      if (terminalStreamState !== 'live') {
        setTerminalKeyError('Terminal is not connected yet.');
        return;
      }
      const urgent = key === 'Escape' || key === 'C-c';
      if (urgent) {
        terminalKeyGenerationRef.current += 1;
        terminalKeyQueueRef.current = Promise.resolve();
      } else if (terminalKeyPendingRef.current >= 6) {
        return;
      }
      const generation = terminalKeyGenerationRef.current;

      setLastTerminalKey(key);
      setTerminalKeyError('');
      terminalKeyPendingRef.current += 1;
      setTerminalKeyPending(terminalKeyPendingRef.current);

      const operation = terminalKeyQueueRef.current
        .then(async () => {
          if (generation !== terminalKeyGenerationRef.current) return;
          if (terminalTargetRef.current !== currentTarget) return;
          await client.sendKey(currentTarget, key);
          await new Promise((resolve) => setTimeout(resolve, 120));
          if (terminalTargetRef.current === currentTarget) {
            void loadSelected(false);
          }
        })
        .catch((error) => {
          if (terminalTargetRef.current === currentTarget) {
            setTerminalKeyError(error instanceof Error ? error.message : String(error));
          }
        })
        .finally(() => {
          terminalKeyPendingRef.current = Math.max(0, terminalKeyPendingRef.current - 1);
          setTerminalKeyPending(terminalKeyPendingRef.current);
        });

      terminalKeyQueueRef.current = operation;
    },
    [client, loadSelected, terminalStreamState],
  );

  const selectProject = useCallback(
    (nextProjectId: string) => {
      setProjectPickerOpen(false);
      if (nextProjectId === projectId) return;
      selectedRef.current = { projectId: nextProjectId, slug: '' };
      setQuery('');
      setSelectedSlug('');
      setTasks([]);
      setDetail(null);
      setSessions(null);
      setDiff(null);
      setCapture(null);
      setTaskError('');
      setProjectId(nextProjectId);
    },
    [projectId],
  );

  const selectTask = useCallback(
    (slug: string) => {
      selectedRef.current = { projectId, slug };
      setTaskError('');
      setSelectedSlug(slug);
    },
    [projectId],
  );

  const closeTask = useCallback(() => {
    selectedRef.current = { projectId, slug: '' };
    setTaskError('');
    setSelectedSlug('');
  }, [projectId]);

  const addProject = useCallback(
    async (path: string) => {
      const normalizedPath = path.trim();
      if (!normalizedPath) {
        setProjectMutationError('A server-side project path is required.');
        return false;
      }
      setProjectMutationBusy(true);
      setProjectMutationError('');
      try {
        const result = await client.addProject(normalizedPath);
        const nextProjects = result.projects || (await client.projects());
        setProjects(nextProjects);
        selectProject(result.id);
        return true;
      } catch (error) {
        setProjectMutationError(error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setProjectMutationBusy(false);
      }
    },
    [client, selectProject],
  );

  const removeProject = useCallback(
    (project: LoomProject) => {
      setProjectMutationError('');
      Alert.alert(
        `Close ${projectLabel(project)}?`,
        'This removes the project from the Loom project list. Files, Tasks, and worktrees remain on the server.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Close project',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setProjectMutationBusy(true);
                try {
                  const result = await client.removeProject(project.id);
                  const nextProjects = result.projects || (await client.projects());
                  setProjects(nextProjects);
                  if (project.id === projectId) {
                    selectProject(nextProjects[0]?.id || '');
                  }
                } catch (error) {
                  setProjectMutationError(
                    error instanceof Error ? error.message : String(error),
                  );
                } finally {
                  setProjectMutationBusy(false);
                }
              })();
            },
          },
        ],
      );
    },
    [client, projectId, selectProject],
  );

  const runAgentAction = useCallback(
    async (action: 'start' | 'stop') => {
      if (!projectId || !selectedSlug) return;
      setActionBusy(true);
      setTaskError('');
      try {
        if (action === 'start') {
          await client.startAgent(projectId, selectedSlug);
        } else {
          await client.stopAgent(projectId, selectedSlug);
        }
        await new Promise((resolve) => setTimeout(resolve, 600));
        await loadSelected(true);
        await loadTasks(projectId);
      } catch (error) {
        setTaskError(error instanceof Error ? error.message : String(error));
      } finally {
        setActionBusy(false);
      }
    },
    [client, loadSelected, loadTasks, projectId, selectedSlug],
  );

  const sendMessage = useCallback(async () => {
    const text = message.trim();
    if (!text || !projectId || !selectedSlug) return;
    setActionBusy(true);
    setTaskError('');
    try {
      await client.sendMessage(projectId, selectedSlug, text);
      setMessage('');
      setTimeout(() => void loadSelected(false), 500);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(false);
    }
  }, [client, loadSelected, message, projectId, selectedSlug]);

  const filteredTasks = tasks.filter((task) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${task.title} ${task.slug} ${task.general_goal || ''} ${task.agent || ''} ${task.interview_model || ''}`
      .toLowerCase()
      .includes(needle);
  });

  const connectGateway = () => {
    const next = gatewayDraft.trim().replace(/\/+$/, '');
    if (next) {
      setLoading(true);
      setGatewayUrl(next);
    }
  };

  const resetGateway = () => {
    const defaultUrl = new LoomClient(
      DEFAULT_GATEWAY_URL,
      DEFAULT_GATEWAY_AUTH_TOKEN,
    ).baseUrl;
    void AsyncStorage.removeItem(GATEWAY_URL_KEY);
    setGatewayDraft(defaultUrl);
    setConnectionError('');
    setLoading(true);
    if (gatewayUrl === defaultUrl) {
      void loadProjects();
    } else {
      setGatewayUrl(defaultUrl);
    }
  };

  const sidebar = (
    <View style={[styles.sidebar, isCompact && styles.sidebarCompact]}>
      <View style={styles.brandRow}>
        <View style={styles.brandIdentity}>
          <LoomMark />
          <View>
            <Text style={styles.brandName}>Loom</Text>
            <Text style={styles.brandCaption}>Agent workspace</Text>
          </View>
        </View>
        <Pressable style={styles.iconButton} onPress={() => void refreshAll()}>
          <Icon name="refresh-outline" />
        </Pressable>
      </View>

      {isCompact ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose project"
          onPress={() => {
            setProjectMutationError('');
            setProjectPickerOpen(true);
            void loadProjects();
          }}
          style={({ pressed }) => [styles.mobileProjectPicker, pressed && styles.pressed]}
        >
          <View style={styles.mobileProjectCopy}>
            <Text style={styles.mobileProjectEyebrow}>Current project</Text>
            <Text numberOfLines={2} style={styles.mobileProjectName}>
              {selectedProject ? projectLabel(selectedProject) : 'Choose a project'}
            </Text>
            <Text style={styles.mobileProjectCount}>{projects.length} projects available</Text>
          </View>
          <View style={styles.mobileProjectChevron}>
            <Icon name="chevron-down" color={colors.primary} />
          </View>
        </Pressable>
      ) : (
        <ScrollView
          horizontal
          directionalLockEnabled
          showsHorizontalScrollIndicator
          style={styles.projectStrip}
          contentContainerStyle={styles.projectStripContent}
        >
          {projects.map((project) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: projectId === project.id }}
              key={project.id}
              onPress={() => selectProject(project.id)}
              style={[
                styles.projectChip,
                projectId === project.id && styles.projectChipSelected,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.projectChipText,
                  projectId === project.id && styles.projectChipTextSelected,
                ]}
              >
                {projectLabel(project)}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage projects"
            onPress={() => {
              setProjectMutationError('');
              setProjectPickerOpen(true);
              void loadProjects();
            }}
            style={[styles.projectChip, styles.projectManageChip]}
          >
            <Icon name="settings-outline" size={14} color={colors.primary} />
            <Text style={styles.projectChipText}>Manage</Text>
          </Pressable>
        </ScrollView>
      )}

      <View style={styles.searchBox}>
        <Icon name="search-outline" size={17} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search tasks"
          placeholderTextColor={colors.textDim}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.listHeading}>
        <Text style={styles.listHeadingText}>Tasks</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{filteredTasks.length}</Text>
        </View>
      </View>

      <FlatList
        data={filteredTasks}
        keyExtractor={(task) => task.slug}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        style={styles.taskList}
        contentContainerStyle={[
          styles.taskListContent,
          !filteredTasks.length && styles.taskListContentEmpty,
        ]}
        renderItem={({ item }) => (
          <TaskRow
            task={item}
            selected={selectedSlug === item.slug}
            compact={isCompact}
            onPress={() => selectTask(item.slug)}
          />
        )}
        ListEmptyComponent={
          tasksLoading ? (
            <View style={styles.listLoading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.listLoadingText}>Loading tasks…</Text>
            </View>
          ) : taskListError ? (
            <View style={styles.inlineError}>
              <Icon name="warning-outline" color={colors.red} />
              <View style={styles.inlineErrorCopy}>
                <Text style={styles.inlineErrorTitle}>Could not load tasks</Text>
                <Text selectable style={styles.inlineErrorText}>{taskListError}</Text>
              </View>
            </View>
          ) : (
            <EmptyState
              icon="layers-outline"
              title="No tasks found"
              detail={query ? 'Try another search.' : 'Create a task in Loom to see it here.'}
            />
          )
        }
      />

      <View style={styles.gatewayCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={gatewayExpanded ? 'Collapse gateway settings' : 'Expand gateway settings'}
          onPress={() => setGatewayExpanded((current) => !current)}
          style={styles.gatewaySummary}
        >
          <View style={styles.gatewaySummaryCopy}>
            <View style={styles.gatewayTitle}>
              <View
                style={[
                  styles.gatewayDot,
                  connectionError ? styles.gatewayDotError : styles.gatewayDotOnline,
                ]}
              />
              <Text style={styles.gatewayLabel}>
                {connectionError ? 'Gateway unavailable' : 'Gateway connected'}
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.gatewayUrl}>
              {gatewayUrl}
            </Text>
          </View>
          <Icon name={gatewayExpanded ? 'chevron-down' : 'settings-outline'} size={17} />
        </Pressable>
        {gatewayExpanded && (
          <View style={styles.gatewayEditor}>
            <TextInput
              value={gatewayDraft}
              onChangeText={setGatewayDraft}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.gatewayInput}
              placeholder="http://127.0.0.1:8787"
              placeholderTextColor={colors.textDim}
              onSubmitEditing={connectGateway}
            />
            <View style={styles.gatewayActions}>
              <Pressable onPress={resetGateway} style={styles.gatewayReset}>
                <Text style={styles.gatewayResetText}>Use default</Text>
              </Pressable>
              <Pressable onPress={connectGateway} style={styles.gatewayConnect}>
                <Text style={styles.gatewayConnectText}>Connect</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );

  const taskPane = selectedTask ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'height' : undefined}
      enabled={isCompact}
      style={styles.taskPane}
    >
      {!keyboardFocusMode && !terminalFullscreen && (
      <>
      <View style={[styles.taskHeader, isCompact && styles.taskHeaderCompact]}>
        <View style={[styles.taskHeaderLeft, isCompact && styles.taskHeaderLeftCompact]}>
          {isCompact && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to tasks"
              style={styles.iconButton}
              onPress={closeTask}
            >
              <Icon name="chevron-back" color={colors.text} />
            </Pressable>
          )}
          {!isCompact && (
            <View style={styles.taskHeroIcon}>
              <Icon
                name={selectedTask.kind === 'kernel' ? 'hardware-chip-outline' : 'sparkles'}
                color={colors.primary}
                size={21}
              />
            </View>
          )}
          <View style={styles.taskHeaderCopy}>
            <View style={styles.taskTitleLine}>
              <Text numberOfLines={1} style={styles.taskHeroTitle}>
                {selectedTask.title || selectedTask.slug}
              </Text>
              {!isCompact && <StatusPill running={running} />}
            </View>
            <Text numberOfLines={1} style={styles.taskHeroGoal}>
              {selectedTask.general_goal || selectedTask.slug}
            </Text>
          </View>
        </View>
        <View style={[styles.headerActions, isCompact && styles.headerActionsCompact]}>
          <ActionButton
            compact
            iconOnly={isCompact}
            label="Refresh"
            icon="refresh-outline"
            onPress={() => void loadSelected(true)}
            disabled={actionBusy}
          />
          <ActionButton
            compact
            iconOnly={isCompact}
            label={running ? 'Stop' : 'Start'}
            icon={running ? 'stop-outline' : 'play-outline'}
            tone={running ? 'danger' : 'primary'}
            onPress={() => void runAgentAction(running ? 'stop' : 'start')}
            disabled={actionBusy}
          />
        </View>
      </View>

      <View style={styles.tabs}>
        {(
          [
            ['activity', 'Activity', 'chatbubble-ellipses-outline'],
            ['changes', 'Changes', 'git-compare-outline'],
            ['notes', 'Notes', 'reader-outline'],
          ] as Array<[Tab, string, IconName]>
        ).map(([value, label, icon]) => (
          <Pressable
            key={value}
            onPress={() => setTab(value)}
            style={[styles.tab, tab === value && styles.tabSelected]}
          >
            <Icon
              name={icon}
              size={16}
              color={tab === value ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.tabText, tab === value && styles.tabTextSelected]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      </>
      )}

      {!keyboardFocusMode && !terminalFullscreen && taskError ? (
        <View style={styles.errorBanner}>
          <Icon name="warning-outline" color={colors.red} />
          <Text style={styles.errorText}>{taskError}</Text>
        </View>
      ) : null}

      <View
        style={[
          styles.activityContent,
          isCompact && styles.activityContentCompact,
          keyboardFocusMode && styles.activityContentKeyboard,
          terminalFullscreen && styles.activityContentFullscreen,
          tab !== 'activity' && styles.activityContentHidden,
        ]}
      >
          {keyboardFocusMode && (
            <View style={styles.keyboardFocusOverlay}>
              <Text style={styles.keyboardFocusLabel}>
                {terminalFocused ? 'Terminal input' : 'Message input'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hide software keyboard"
                onPress={() => {
                  setTerminalBlurRequest((current) => current + 1);
                  Keyboard.dismiss();
                }}
                style={({ pressed }) => [
                  styles.keyboardDismissButton,
                  pressed && styles.pressed,
                ]}
              >
                <Icon name="chevron-down" size={15} color={colors.primary} />
                <Text style={styles.keyboardDismissButtonText}>Hide keyboard</Text>
              </Pressable>
            </View>
          )}
          <ActivityView
            capture={capture}
            running={running}
            target={target}
            gatewayUrl={gatewayUrl}
            gatewayAuthToken={DEFAULT_GATEWAY_AUTH_TOKEN}
            fontSize={terminalFontSize}
            captureLines={captureLines}
            terminalKeyPending={terminalKeyPending}
            lastTerminalKey={lastTerminalKey}
            terminalKeyError={terminalKeyError}
            keyboardVisible={keyboardFocusMode}
            fullscreen={terminalFullscreen}
            appActive={appActive && tab === 'activity'}
            terminalBlurRequest={terminalBlurRequest}
            onFontSizeChange={setTerminalFontSize}
            onLoadMore={loadOlderCapture}
            onTerminalKey={sendTerminalKey}
            onTerminalFocusChange={setTerminalFocused}
            onFullscreenChange={setTerminalFullscreen}
            onStreamStateChange={setTerminalStreamState}
          />
      </View>
      {tab !== 'activity' ? (
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          style={styles.mainScroll}
          contentContainerStyle={[styles.mainContent, isCompact && styles.mainContentCompact]}
        >
          {tab === 'changes' && <ChangesView diff={diff} />}
          {tab === 'notes' && <NotesView detail={detail} />}
        </ScrollView>
      ) : null}

      {tab === 'activity' && !terminalKeyboardFocusMode && !terminalFullscreen && (
        <View style={[styles.composerShell, isCompact && styles.composerShellCompact]}>
          {terminalKeysOpen ? (
            <TerminalKeyboard
              disabled={!target || terminalStreamState !== 'live'}
              disabledReason={
                !target
                  ? 'Start agent to enable'
                  : terminalStreamState === 'paused'
                    ? 'Terminal paused'
                    : 'Connecting terminal…'
              }
              pending={terminalKeyPending}
              lastKey={lastTerminalKey}
              error={terminalKeyError}
              onKey={sendTerminalKey}
            />
          ) : null}
          <View style={styles.composer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={terminalKeysOpen ? 'Hide terminal keys' : 'Show terminal keys'}
              onPress={() => setTerminalKeysOpen((current) => !current)}
              style={({ pressed }) => [
                styles.composerKeysButton,
                terminalKeysOpen && styles.composerKeysButtonActive,
                pressed && styles.pressed,
              ]}
            >
              <Icon
                name="keypad-outline"
                size={18}
                color={terminalKeysOpen ? colors.primary : colors.textMuted}
              />
            </Pressable>
            <TextInput
              value={message}
              onChangeText={setMessage}
              onFocus={() => setTerminalFocused(false)}
              multiline
              maxLength={12000}
              editable={running && !actionBusy}
              placeholder={running ? 'Message the agent…' : 'Start the agent to send a message'}
              placeholderTextColor={colors.textDim}
              style={styles.composerInput}
            />
            <Pressable
              disabled={!running || !message.trim() || actionBusy}
              onPress={() => void sendMessage()}
              style={({ pressed }) => [
                styles.sendButton,
                pressed && styles.pressed,
                (!running || !message.trim() || actionBusy) && styles.sendButtonDisabled,
              ]}
            >
              {actionBusy ? (
                <ActivityIndicator size="small" color="#211a4a" />
              ) : (
                <Icon name="arrow-up" color="#211a4a" size={20} />
              )}
            </Pressable>
          </View>
          {!isCompact && (
            <Text style={styles.composerHint}>
              Loom sends this directly to the active {selectedTask.agent || 'cursor'} session.
            </Text>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  ) : (
    <View style={styles.noSelection}>
      <LoomMark compact />
      <Text style={styles.noSelectionTitle}>Choose a Loom task</Text>
      <Text style={styles.noSelectionDetail}>
        Start, steer, and review agents running on your own machine.
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <StatusBar style="light" />
        <LoomMark />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        <Text style={styles.loadingText}>Connecting to Loom…</Text>
      </SafeAreaView>
    );
  }

  if (connectionError && !projects.length) {
    return (
      <SafeAreaView style={styles.connectScreen}>
        <StatusBar style="light" />
        <View style={styles.connectCard}>
          <LoomMark />
          <Text style={styles.connectTitle}>Connect Loom App</Text>
          <Text style={styles.connectDetail}>
            Start the gateway next to your Loom server, then enter its URL.
          </Text>
          <View style={styles.connectError}>
            <Icon name="alert-circle-outline" color={colors.red} />
            <Text style={styles.connectErrorText}>{connectionError}</Text>
          </View>
          <TextInput
            value={gatewayDraft}
            onChangeText={setGatewayDraft}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.connectInput}
            placeholder="http://127.0.0.1:8787"
            placeholderTextColor={colors.textDim}
            onSubmitEditing={connectGateway}
          />
          <ActionButton
            label="Connect"
            icon="arrow-forward"
            tone="primary"
            onPress={connectGateway}
          />
          <Pressable onPress={resetGateway} style={styles.connectReset}>
            <Icon name="refresh-outline" size={14} color={colors.primary} />
            <Text style={styles.connectResetText}>Use default Gateway</Text>
          </Pressable>
          <Text style={styles.connectCommand}>
            LOOM_WEB_AUTH_TOKEN=… pnpm gateway
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={styles.app}>
        <StatusBar style="light" />
        <View style={[styles.shell, isCompact && styles.shellCompact]}>
          {(!isCompact || !selectedSlug) && sidebar}
          {(!isCompact || selectedSlug) && taskPane}
        </View>
      </SafeAreaView>
      <ProjectPickerModal
        visible={projectPickerOpen}
        projects={projects}
        selectedId={projectId}
        mutationBusy={projectMutationBusy}
        mutationError={projectMutationError}
        onSelect={selectProject}
        onAdd={addProject}
        onRemove={removeProject}
        onClose={() => {
          setProjectMutationError('');
          setProjectPickerOpen(false);
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <LoomApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.background },
  shell: { flex: 1, flexDirection: 'row' },
  shellCompact: { flexDirection: 'column' },
  sidebar: {
    width: 330,
    backgroundColor: colors.sidebar,
    borderRightWidth: 1,
    borderRightColor: colors.borderSoft,
  },
  sidebarCompact: { width: '100%', flex: 1, borderRightWidth: 0 },
  brandRow: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 20 : 14,
    paddingBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandIdentity: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  mark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f7f5ef',
    borderWidth: 1,
    borderColor: '#e9e5dc',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 3,
  },
  markCompact: { width: 52, height: 52, borderRadius: 16 },
  markImage: { width: '100%', height: '100%' },
  brandName: { color: colors.text, fontWeight: '800', fontSize: 18, letterSpacing: -0.4 },
  brandCaption: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  iconButton: {
    width: 35,
    height: 35,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  projectModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(7, 6, 9, 0.72)',
  },
  projectModalSheet: {
    maxHeight: '86%',
    minHeight: '55%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    backgroundColor: colors.sidebar,
    overflow: 'hidden',
  },
  projectModalHandle: {
    width: 42,
    height: 5,
    marginTop: 9,
    marginBottom: 4,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
  projectModalHeader: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  projectModalHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  projectModalTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  projectModalSubtitle: { color: colors.textDim, fontSize: 11, marginTop: 3 },
  projectAddButton: {
    minHeight: 35,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  projectAddButtonText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  projectAddPanel: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    backgroundColor: colors.card,
  },
  projectAddLabel: { color: colors.text, fontSize: 12, fontWeight: '800' },
  projectAddHelp: { color: colors.textDim, fontSize: 10, lineHeight: 15, marginTop: 3 },
  projectAddRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  projectAddInput: {
    flex: 1,
    height: 42,
    borderRadius: 11,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  projectAddSubmit: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  projectMutationError: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#6a393b',
    backgroundColor: colors.redMuted,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  projectMutationErrorText: { flex: 1, color: colors.red, fontSize: 10, lineHeight: 15 },
  projectModalList: { padding: 10, paddingBottom: 24 },
  projectModalRow: {
    minHeight: 72,
    marginBottom: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  projectModalRowSelected: {
    backgroundColor: colors.cardElevated,
    borderColor: '#5c5480',
  },
  projectModalSelect: {
    flex: 1,
    minWidth: 0,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  projectRemoveButton: {
    width: 42,
    height: 42,
    marginRight: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectModalIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  projectModalIconSelected: {
    backgroundColor: colors.primaryMuted,
    borderColor: '#655d8c',
  },
  projectModalCopy: { flex: 1, minWidth: 0 },
  projectModalName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  projectModalNameSelected: { color: colors.primary },
  projectModalPath: { color: colors.textDim, fontSize: 10, lineHeight: 14, marginTop: 4 },
  mobileProjectPicker: {
    minHeight: 78,
    marginHorizontal: 14,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#514a6e',
    backgroundColor: colors.primaryMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mobileProjectCopy: { flex: 1, minWidth: 0 },
  mobileProjectEyebrow: {
    color: colors.textDim,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  mobileProjectName: { color: colors.primary, fontSize: 15, fontWeight: '800', marginTop: 2 },
  mobileProjectCount: { color: colors.textMuted, fontSize: 10, marginTop: 3 },
  mobileProjectChevron: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(19, 18, 22, 0.34)',
  },
  projectStrip: { flexGrow: 0, maxHeight: 44 },
  projectStripContent: { paddingHorizontal: 18, paddingVertical: 5, gap: 7 },
  projectChip: {
    height: 31,
    maxWidth: 160,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  projectChipSelected: {
    backgroundColor: colors.primaryMuted,
    borderColor: '#655d8c',
  },
  projectManageChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  projectChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  projectChipTextSelected: { color: colors.primary },
  searchBox: {
    marginHorizontal: 18,
    marginTop: 10,
    marginBottom: 15,
    height: 39,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, marginLeft: 8, outlineStyle: 'none' } as never,
  listHeading: {
    paddingHorizontal: 20,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  listHeadingText: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  countBadge: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: colors.surface,
  },
  countText: { color: colors.textDim, fontWeight: '700', fontSize: 10 },
  taskList: { flex: 1 },
  taskListContent: { paddingHorizontal: 10, paddingBottom: 16 },
  taskListContentEmpty: { flexGrow: 1, justifyContent: 'center' },
  listLoading: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  listLoadingText: { color: colors.textMuted, fontSize: 11 },
  taskRow: {
    marginBottom: 5,
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  taskRowSelected: {
    backgroundColor: colors.cardElevated,
    borderColor: colors.border,
  },
  taskRowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  agentGlyph: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  agentGlyphSelected: { backgroundColor: colors.primaryMuted, borderColor: '#5c5480' },
  taskRowCopy: { flex: 1, minWidth: 0 },
  taskTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 1 },
  taskGoal: { color: colors.textDim, fontSize: 11, lineHeight: 16, marginTop: 3 },
  taskMeta: {
    marginTop: 9,
    paddingLeft: 41,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  taskMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  taskMetaModel: { flex: 1, textAlign: 'right' },
  miniDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textDim },
  miniDotLive: { backgroundColor: colors.green },
  taskMetaText: { color: colors.textDim, fontSize: 10 },
  gatewayCard: {
    margin: 12,
    borderRadius: 13,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
  },
  gatewaySummary: {
    minHeight: 54,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  gatewaySummaryCopy: { flex: 1, minWidth: 0 },
  gatewayTitle: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  gatewayDot: { width: 7, height: 7, borderRadius: 4 },
  gatewayDotOnline: { backgroundColor: colors.green },
  gatewayDotError: { backgroundColor: colors.red },
  gatewayLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  gatewayUrl: { color: colors.textDim, fontSize: 9, marginTop: 4, fontFamily: 'monospace' },
  gatewayEditor: {
    padding: 10,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  gatewayInput: {
    color: colors.text,
    fontSize: 11,
    paddingHorizontal: 9,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    marginTop: 10,
  },
  gatewayActions: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  gatewayConnect: { paddingHorizontal: 4, paddingVertical: 3 },
  gatewayConnectText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  gatewayReset: { paddingHorizontal: 4, paddingVertical: 3 },
  gatewayResetText: { color: colors.textDim, fontSize: 10, fontWeight: '700' },
  taskPane: { flex: 1, backgroundColor: colors.background },
  taskHeader: {
    minHeight: 76,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  taskHeaderCompact: {
    minHeight: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minWidth: 0 },
  taskHeaderLeftCompact: { flex: 1, width: 'auto', gap: 8 },
  taskHeroIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: '#5b537d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskHeaderCopy: { flex: 1, minWidth: 0 },
  taskTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  taskHeroTitle: { color: colors.text, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  taskHeroGoal: { color: colors.textDim, fontSize: 11, marginTop: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerActionsCompact: { flexShrink: 0, justifyContent: 'flex-end', gap: 5 },
  actionButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardElevated,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  actionButtonCompact: { minHeight: 35, paddingHorizontal: 10, borderRadius: 10 },
  actionButtonIconOnly: { width: 35, paddingHorizontal: 0 },
  actionButtonPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionButtonDanger: { backgroundColor: colors.redMuted, borderColor: '#6a393b' },
  actionButtonText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  actionButtonTextPrimary: { color: '#211a4a' },
  actionButtonTextDanger: { color: colors.red },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  statusPill: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
  },
  statusRunning: { backgroundColor: colors.greenMuted, borderColor: '#315a40' },
  statusIdle: { backgroundColor: colors.surface, borderColor: colors.border },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  dotRunning: { backgroundColor: colors.green },
  dotIdle: { backgroundColor: colors.textDim },
  statusText: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  statusTextRunning: { color: colors.green },
  tabs: {
    height: 48,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  tab: {
    height: 42,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabSelected: { borderBottomColor: colors.primary },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  tabTextSelected: { color: colors.primary },
  activityContent: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: 1120,
    padding: 20,
    alignSelf: 'center',
  },
  activityContentCompact: { padding: 8 },
  activityContentKeyboard: { padding: 0 },
  activityContentFullscreen: { maxWidth: '100%', padding: 0 },
  activityContentHidden: { display: 'none' },
  keyboardFocusOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 20,
    minHeight: 34,
    paddingLeft: 9,
    paddingRight: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(25, 24, 29, 0.94)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  keyboardFocusLabel: { color: colors.textDim, fontSize: 9, fontWeight: '700' },
  keyboardDismissButton: {
    minHeight: 26,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: colors.primaryMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  keyboardDismissButtonText: { color: colors.primary, fontSize: 9, fontWeight: '800' },
  mainScroll: { flex: 1 },
  mainContent: {
    padding: 20,
    paddingBottom: 36,
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'center',
  },
  mainContentCompact: { padding: 12, paddingBottom: 28 },
  contentStack: { gap: 12 },
  sectionCard: {
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
  },
  sectionCardFill: { flex: 1, minHeight: 0 },
  sectionHeader: {
    height: 49,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIconButton: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionMeta: { color: colors.textDim, fontSize: 10, fontWeight: '700' },
  captureLineCount: { color: colors.textDim, fontSize: 9, fontFamily: 'monospace' },
  liveStatus: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveStatusError: { borderColor: '#6a393b', backgroundColor: colors.redMuted },
  liveStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber },
  liveStatusDotOnline: { backgroundColor: colors.green },
  liveStatusDotError: { backgroundColor: colors.red },
  liveStatusText: { color: colors.amber, fontSize: 9, fontWeight: '800' },
  liveStatusTextOnline: { color: colors.green },
  liveStatusTextError: { color: colors.red },
  terminalHeader: {
    height: 36,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#17161a',
  },
  terminalLights: { flexDirection: 'row', gap: 5 },
  terminalLight: { width: 8, height: 8, borderRadius: 4 },
  terminalTarget: { flex: 1, color: colors.textDim, fontSize: 10, fontFamily: 'monospace' },
  terminal: { minHeight: 260, width: '100%', backgroundColor: '#111014' },
  terminalContent: { padding: 16, alignItems: 'flex-start' },
  liveTerminalShell: {
    width: '100%',
    backgroundColor: '#111014',
    overflow: 'hidden',
  },
  liveTerminalFill: { flex: 1, minHeight: 240 },
  liveTerminalFullscreen: { flex: 1, minHeight: 0 },
  liveTerminalWebView: { flex: 1, backgroundColor: '#111014' },
  liveTerminalGestureLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    backgroundColor: 'transparent',
  },
  liveTerminalControls: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    zIndex: 3,
    padding: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 93, 112, 0.72)',
    backgroundColor: 'rgba(25, 24, 29, 0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveTerminalControl: {
    minWidth: 42,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4a4751',
    backgroundColor: colors.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTerminalControlActive: {
    borderColor: colors.primaryStrong,
    backgroundColor: colors.primary,
  },
  liveTerminalControlText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  liveTerminalControlTextActive: { color: '#211a4a' },
  liveTerminalError: {
    position: 'absolute',
    left: 9,
    right: 9,
    bottom: 9,
    zIndex: 4,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#6a393b',
    backgroundColor: 'rgba(72, 42, 43, 0.96)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveTerminalErrorText: { flex: 1, color: colors.red, fontSize: 10, lineHeight: 14 },
  liveTerminalRetry: {
    minHeight: 28,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#815052',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTerminalRetryText: { color: colors.red, fontSize: 9, fontWeight: '800' },
  fullscreenTerminalHeader: {
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    backgroundColor: colors.sidebar,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  fullscreenTerminalHeaderCopy: { flex: 1, minWidth: 0 },
  fullscreenTerminalTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  fullscreenTerminalTarget: {
    color: colors.textDim,
    fontSize: 9,
    fontFamily: 'monospace',
    marginTop: 3,
  },
  fullscreenTerminalHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fullscreenTerminalKeyboard: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.background,
  },
  terminalKeysToggle: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardElevated,
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  terminalKeysToggleText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  terminalText: {
    color: '#dcd7e0',
    fontSize: 11,
    lineHeight: 17,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  terminalFoot: {
    minHeight: 36,
    paddingHorizontal: 13,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  terminalFootCopy: { flex: 1, minWidth: 210, flexDirection: 'row', alignItems: 'center', gap: 6 },
  terminalFootText: { flex: 1, color: colors.textDim, fontSize: 10 },
  terminalFootCompactText: { color: colors.textDim, fontSize: 9, fontWeight: '700' },
  terminalFootActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  loadMoreButton: {
    minHeight: 30,
    paddingHorizontal: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  loadMoreButtonText: { color: colors.primary, fontSize: 10, fontWeight: '700' },
  fontSizeControl: {
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  fontSizeButton: {
    width: 34,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardElevated,
  },
  fontSizeButtonText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  fontSizeValue: {
    width: 27,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 9,
    fontFamily: 'monospace',
  },
  emptyState: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 38 },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
    marginBottom: 13,
  },
  emptyTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
  emptyDetail: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
    textAlign: 'center',
    maxWidth: 320,
  },
  diffList: { padding: 10, gap: 8 },
  inlineError: {
    margin: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6a393b',
    backgroundColor: colors.redMuted,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  inlineErrorCopy: { flex: 1, minWidth: 0 },
  inlineErrorTitle: { color: colors.red, fontSize: 11, fontWeight: '800' },
  inlineErrorText: { color: colors.red, fontSize: 10, lineHeight: 15, marginTop: 3 },
  diffFile: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  diffFileHeader: {
    minHeight: 40,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  diffFileName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 },
  diffPath: { color: colors.text, fontSize: 11, fontWeight: '600', flexShrink: 1 },
  diffStats: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  additions: { color: colors.green, fontSize: 10, fontWeight: '700' },
  deletions: { color: colors.red, fontSize: 10, fontWeight: '700' },
  diffStatus: {
    color: colors.amber,
    backgroundColor: colors.amberMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    fontSize: 9,
    fontWeight: '800',
  },
  patchShell: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
  patch: { backgroundColor: '#111014' },
  patchText: {
    padding: 12,
    color: '#d8d2dc',
    fontSize: 10,
    lineHeight: 16,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  expandButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.card,
  },
  expandButtonText: { color: colors.primary, fontSize: 10, fontWeight: '700' },
  markdownDocument: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18 },
  markdownModeButton: {
    minHeight: 30,
    paddingHorizontal: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.cardElevated,
  },
  markdownModeButtonText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  notesSourceText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 19,
    padding: 18,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  terminalKeyboard: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    marginBottom: 9,
    padding: 9,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  terminalKeyboardHeader: {
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  terminalKeyboardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  terminalKeyboardTitle: { color: colors.text, fontSize: 10, fontWeight: '800' },
  terminalKeyboardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  terminalKeyboardStatus: { color: colors.textDim, fontSize: 9, fontFamily: 'monospace' },
  keyboardExpandButton: {
    minHeight: 26,
    paddingHorizontal: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  keyboardExpandButtonText: { color: colors.primary, fontSize: 9, fontWeight: '800' },
  terminalKeyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  terminalKey: {
    flex: 1,
    minWidth: 0,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4a4751',
    borderBottomWidth: 3,
    backgroundColor: colors.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 2,
    elevation: 3,
  },
  terminalKeyWide: { flex: 1.35 },
  terminalKeyPrimary: {
    borderColor: '#8e82d8',
    backgroundColor: colors.primary,
  },
  terminalKeyDanger: {
    borderColor: '#6a393b',
    backgroundColor: colors.redMuted,
  },
  terminalKeyDisabled: { opacity: 0.34 },
  terminalKeyPressed: {
    transform: [{ translateY: 2 }],
    borderBottomWidth: 1,
    opacity: 0.82,
  },
  terminalKeyText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  terminalKeyTextPrimary: { color: '#211a4a' },
  terminalKeyTextDanger: { color: colors.red },
  terminalKeyboardError: {
    marginTop: 7,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.redMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  terminalKeyboardErrorText: { flex: 1, color: colors.red, fontSize: 9 },
  terminalKeyboardHint: { color: colors.textDim, fontSize: 8, lineHeight: 12, marginTop: 6 },
  expandedKeyboardOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(7, 6, 9, 0.76)',
  },
  expandedKeyboardSheet: {
    maxHeight: '84%',
    minHeight: '62%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    backgroundColor: colors.sidebar,
    overflow: 'hidden',
  },
  expandedKeyboardHeader: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  expandedKeyboardTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  expandedKeyboardSubtitle: { color: colors.textDim, fontSize: 10, marginTop: 3 },
  expandedKeyboardContent: { padding: 14, paddingBottom: 30 },
  expandedKeyboardSection: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 7,
  },
  expandedNavigation: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  expandedDpad: { flex: 1.1, gap: 5 },
  expandedUtilityKeys: { flex: 1, gap: 5 },
  expandedKeyRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  expandedKeySpacer: { flex: 1, height: 38 },
  expandedKeyboardWarning: {
    color: colors.amber,
    fontSize: 9,
    lineHeight: 14,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#665528',
    backgroundColor: colors.amberMuted,
  },
  composerShell: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'web' ? 16 : 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.background,
  },
  composerShellCompact: { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 6 },
  composer: {
    width: '100%',
    maxWidth: 900,
    minHeight: 44,
    maxHeight: 150,
    alignSelf: 'center',
    borderRadius: 16,
    paddingLeft: 6,
    paddingRight: 7,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  composerKeysButton: {
    width: 34,
    height: 34,
    marginRight: 5,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerKeysButtonActive: { backgroundColor: colors.primaryMuted },
  composerInput: {
    flex: 1,
    minHeight: 32,
    maxHeight: 130,
    paddingVertical: 7,
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    outlineStyle: 'none',
  } as never,
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendButtonDisabled: { backgroundColor: colors.surface, opacity: 0.55 },
  composerHint: {
    color: colors.textDim,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 6,
  },
  errorBanner: {
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.redMuted,
    borderWidth: 1,
    borderColor: '#6a393b',
  },
  errorText: { color: colors.red, fontSize: 11, flex: 1 },
  noSelection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  noSelectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 18 },
  noSelectionDetail: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
    textAlign: 'center',
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { color: colors.textMuted, marginTop: 11, fontSize: 12 },
  connectScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  connectCard: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    padding: 28,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connectTitle: { color: colors.text, fontSize: 21, fontWeight: '900', marginTop: 17 },
  connectDetail: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 7,
    marginBottom: 17,
  },
  connectError: {
    width: '100%',
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.redMuted,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 11,
  },
  connectErrorText: { color: colors.red, fontSize: 11, flex: 1 },
  connectInput: {
    width: '100%',
    height: 43,
    borderRadius: 11,
    paddingHorizontal: 12,
    color: colors.text,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 11,
  },
  connectReset: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  connectResetText: { color: colors.primary, fontSize: 10, fontWeight: '700' },
  connectCommand: {
    color: colors.textDim,
    fontSize: 9,
    fontFamily: 'monospace',
    marginTop: 14,
  },
});
