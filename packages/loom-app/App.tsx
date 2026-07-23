import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
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

type Tab = 'activity' | 'changes' | 'notes';
type IconName = keyof typeof Ionicons.glyphMap;

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
      <View style={[styles.markThread, styles.markThreadOne]} />
      <View style={[styles.markThread, styles.markThreadTwo]} />
      <View style={[styles.markThread, styles.markThreadThree]} />
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
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'primary' | 'danger';
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        tone === 'primary' && styles.actionButtonPrimary,
        tone === 'danger' && styles.actionButtonDanger,
        compact && styles.actionButtonCompact,
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
      <Text
        style={[
          styles.actionButtonText,
          tone === 'primary' && styles.actionButtonTextPrimary,
          tone === 'danger' && styles.actionButtonTextDanger,
        ]}
      >
        {label}
      </Text>
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
}: {
  task: LoomTask;
  selected: boolean;
  onPress: () => void;
}) {
  const hasPane = Boolean(task.tmux_interview_target);
  return (
    <Pressable
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
          <Text numberOfLines={1} style={styles.taskTitle}>
            {task.title || task.slug}
          </Text>
          <Text numberOfLines={2} style={styles.taskGoal}>
            {task.general_goal || 'No task description'}
          </Text>
        </View>
      </View>
      <View style={styles.taskMeta}>
        <View style={styles.taskMetaItem}>
          <View style={[styles.miniDot, hasPane && styles.miniDotLive]} />
          <Text style={styles.taskMetaText}>{task.agent || 'cursor'}</Text>
        </View>
        <Text numberOfLines={1} style={styles.taskMetaText}>
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
}: {
  title: string;
  icon: IconName;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Icon name={icon} size={17} color={colors.primary} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function ActivityView({
  capture,
  running,
  target,
}: {
  capture: TerminalCapture | null;
  running: boolean;
  target: string;
}) {
  if (!target) {
    return (
      <SectionCard title="Agent activity" icon="pulse-outline">
        <EmptyState
          icon="play-outline"
          title="Agent is not started"
          detail="Start the task to create its persistent Loom session."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Agent activity"
      icon="pulse-outline"
      action={<StatusPill running={running} />}
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
      <ScrollView
        nestedScrollEnabled
        style={styles.terminal}
        contentContainerStyle={styles.terminalContent}
      >
        <Text selectable style={styles.terminalText}>
          {capture?.text?.trim() ||
            (running ? 'Waiting for agent output…' : 'No terminal output captured.')}
        </Text>
      </ScrollView>
      <View style={styles.terminalFoot}>
        <Icon name="information-circle-outline" size={15} />
        <Text style={styles.terminalFootText}>
          Live terminal snapshot. Structured chat history will be added by the Loom gateway.
        </Text>
      </View>
    </SectionCard>
  );
}

function ChangesView({ diff }: { diff: TaskDiff | null }) {
  const worktrees = diff?.worktrees || [];
  const files = worktrees.flatMap((worktree) =>
    (worktree.files || []).map((file) => ({ worktree, file })),
  );

  return (
    <SectionCard title="Code changes" icon="git-compare-outline">
      {!files.length ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title="Working tree is clean"
          detail="Changes made by the agent will appear here."
        />
      ) : (
        <View style={styles.diffList}>
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
                <ScrollView horizontal style={styles.patch}>
                  <Text selectable style={styles.patchText}>
                    {(file.patch || file.diff || '').slice(0, 8000)}
                  </Text>
                </ScrollView>
              )}
            </View>
          ))}
        </View>
      )}
    </SectionCard>
  );
}

function NotesView({ detail }: { detail: TaskDetail | null }) {
  const templates = Object.entries(detail?.templates || {}).filter(([, value]) => value);
  const preferred =
    templates.find(([name]) => name.toLowerCase() === 'plan.md') ||
    templates.find(([name]) => name.toLowerCase() === 'wiki.md') ||
    templates[0];

  return (
    <SectionCard title={preferred?.[0] || 'Task notes'} icon="reader-outline">
      {preferred ? (
        <Text selectable style={styles.notesText}>
          {preferred[1]}
        </Text>
      ) : (
        <EmptyState
          icon="reader-outline"
          title="No notes yet"
          detail="PLAN.md and WIKI.md content from Loom will appear here."
        />
      )}
    </SectionCard>
  );
}

export default function App() {
  const { width } = useWindowDimensions();
  const isCompact = width < 820;
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY_URL);
  const [gatewayDraft, setGatewayDraft] = useState(DEFAULT_GATEWAY_URL);
  const client = useMemo(() => new LoomClient(gatewayUrl), [gatewayUrl]);

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [taskError, setTaskError] = useState('');
  const selectedRef = useRef({ projectId: '', slug: '' });

  const selectedTask = tasks.find((task) => task.slug === selectedSlug) || null;
  const running = Boolean(detail?.claude?.agent_running || sessions?.agent_running);
  const target = agentTarget(detail, sessions);

  const loadProjects = useCallback(async () => {
    setConnectionError('');
    try {
      await client.health();
      const nextProjects = await client.projects();
      setProjects(nextProjects);
      setProjectId((current) =>
        current && nextProjects.some((project) => project.id === current)
          ? current
          : nextProjects[0]?.id || '',
      );
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error));
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  const loadTasks = useCallback(
    async (nextProjectId: string) => {
      if (!nextProjectId) {
        setTasks([]);
        return;
      }
      try {
        const nextTasks = await client.tasks(nextProjectId);
        setTasks(nextTasks);
        setSelectedSlug((current) =>
          current && nextTasks.some((task) => task.slug === current)
            ? current
            : isCompact
              ? ''
              : nextTasks[0]?.slug || '',
        );
      } catch (error) {
        setTaskError(error instanceof Error ? error.message : String(error));
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
        if (nextTarget) {
          try {
            setCapture(await client.capture(nextTarget));
          } catch {
            setCapture(null);
          }
        } else {
          setCapture(null);
        }
        setTaskError('');
      } catch (error) {
        setTaskError(error instanceof Error ? error.message : String(error));
      }
    },
    [client],
  );

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    setSelectedSlug('');
    setDetail(null);
    setSessions(null);
    setDiff(null);
    setCapture(null);
    void loadTasks(projectId);
  }, [loadTasks, projectId]);

  useEffect(() => {
    selectedRef.current = { projectId, slug: selectedSlug };
    setDetail(null);
    setSessions(null);
    setDiff(null);
    setCapture(null);
    if (!projectId || !selectedSlug) return;
    void loadSelected(true);
    const timer = setInterval(() => void loadSelected(false), 4000);
    return () => clearInterval(timer);
  }, [loadSelected, projectId, selectedSlug]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadProjects(), loadTasks(projectId), loadSelected(true)]);
    setRefreshing(false);
  }, [loadProjects, loadSelected, loadTasks, projectId]);

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
    return `${task.title} ${task.slug} ${task.general_goal || ''}`.toLowerCase().includes(needle);
  });

  const connectGateway = () => {
    const next = gatewayDraft.trim().replace(/\/+$/, '');
    if (next) {
      setLoading(true);
      setGatewayUrl(next);
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.projectStrip}
        contentContainerStyle={styles.projectStripContent}
      >
        {projects.map((project) => (
          <Pressable
            key={project.id}
            onPress={() => setProjectId(project.id)}
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
      </ScrollView>

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
        <Text style={styles.listHeadingText}>Sessions</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{filteredTasks.length}</Text>
        </View>
      </View>

      <ScrollView style={styles.taskList} contentContainerStyle={styles.taskListContent}>
        {filteredTasks.map((task) => (
          <TaskRow
            key={task.slug}
            task={task}
            selected={selectedSlug === task.slug}
            onPress={() => setSelectedSlug(task.slug)}
          />
        ))}
        {!filteredTasks.length && (
          <EmptyState
            icon="layers-outline"
            title="No tasks found"
            detail={query ? 'Try another search.' : 'Create a task in Loom to see it here.'}
          />
        )}
      </ScrollView>

      <View style={styles.gatewayCard}>
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
        <TextInput
          value={gatewayDraft}
          onChangeText={setGatewayDraft}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.gatewayInput}
          placeholder="http://127.0.0.1:8787"
          placeholderTextColor={colors.textDim}
          onSubmitEditing={connectGateway}
        />
        <Pressable onPress={connectGateway} style={styles.gatewayConnect}>
          <Text style={styles.gatewayConnectText}>Connect</Text>
        </Pressable>
      </View>
    </View>
  );

  const taskPane = selectedTask ? (
    <View style={styles.taskPane}>
      <View style={styles.taskHeader}>
        <View style={styles.taskHeaderLeft}>
          {isCompact && (
            <Pressable style={styles.iconButton} onPress={() => setSelectedSlug('')}>
              <Icon name="chevron-back" color={colors.text} />
            </Pressable>
          )}
          <View style={styles.taskHeroIcon}>
            <Icon
              name={selectedTask.kind === 'kernel' ? 'hardware-chip-outline' : 'sparkles'}
              color={colors.primary}
              size={21}
            />
          </View>
          <View style={styles.taskHeaderCopy}>
            <View style={styles.taskTitleLine}>
              <Text numberOfLines={1} style={styles.taskHeroTitle}>
                {selectedTask.title || selectedTask.slug}
              </Text>
              <StatusPill running={running} />
            </View>
            <Text numberOfLines={1} style={styles.taskHeroGoal}>
              {selectedTask.general_goal || selectedTask.slug}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <ActionButton
            compact
            label="Refresh"
            icon="refresh-outline"
            onPress={() => void loadSelected(true)}
            disabled={actionBusy}
          />
          <ActionButton
            compact
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

      {taskError ? (
        <View style={styles.errorBanner}>
          <Icon name="warning-outline" color={colors.red} />
          <Text style={styles.errorText}>{taskError}</Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.mainContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshAll()}
            tintColor={colors.primary}
          />
        }
      >
        {tab === 'activity' && (
          <ActivityView capture={capture} running={running} target={target} />
        )}
        {tab === 'changes' && <ChangesView diff={diff} />}
        {tab === 'notes' && <NotesView detail={detail} />}
      </ScrollView>

      {tab === 'activity' && (
        <View style={styles.composerShell}>
          <View style={styles.composer}>
            <TextInput
              value={message}
              onChangeText={setMessage}
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
          <Text style={styles.composerHint}>
            Loom sends this directly to the active {selectedTask.agent || 'cursor'} session.
          </Text>
        </View>
      )}
    </View>
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
          <Text style={styles.connectCommand}>
            LOOM_WEB_AUTH_TOKEN=… pnpm gateway
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="light" />
      <View style={[styles.shell, isCompact && styles.shellCompact]}>
        {(!isCompact || !selectedSlug) && sidebar}
        {(!isCompact || selectedSlug) && taskPane}
      </View>
    </SafeAreaView>
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
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: '#635a91',
    justifyContent: 'center',
  },
  markCompact: { width: 52, height: 52, borderRadius: 16 },
  markThread: {
    position: 'absolute',
    height: 5,
    borderRadius: 5,
    backgroundColor: colors.primary,
    transform: [{ rotate: '-10deg' }],
  },
  markThreadOne: { width: 30, left: -2, top: 9 },
  markThreadTwo: { width: 34, right: -6, top: 17 },
  markThreadThree: { width: 27, left: 4, top: 25 },
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
  miniDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textDim },
  miniDotLive: { backgroundColor: colors.green },
  taskMetaText: { color: colors.textDim, fontSize: 10 },
  gatewayCard: {
    margin: 12,
    padding: 11,
    borderRadius: 13,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  gatewayTitle: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  gatewayDot: { width: 7, height: 7, borderRadius: 4 },
  gatewayDotOnline: { backgroundColor: colors.green },
  gatewayDotError: { backgroundColor: colors.red },
  gatewayLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  gatewayInput: {
    color: colors.text,
    fontSize: 11,
    paddingHorizontal: 9,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  gatewayConnect: { alignSelf: 'flex-end', paddingHorizontal: 4, paddingTop: 8 },
  gatewayConnectText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
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
  taskHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minWidth: 0 },
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
  mainScroll: { flex: 1 },
  mainContent: { padding: 20, maxWidth: 1120, width: '100%', alignSelf: 'center' },
  sectionCard: {
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
  },
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
  terminal: { minHeight: 300, maxHeight: 520, backgroundColor: '#111014' },
  terminalContent: { padding: 16 },
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
    gap: 6,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  terminalFootText: { flex: 1, color: colors.textDim, fontSize: 10 },
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
  patch: { maxHeight: 330, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  patchText: {
    padding: 12,
    color: '#d8d2dc',
    fontSize: 10,
    lineHeight: 16,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  notesText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 21,
    padding: 18,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  composerShell: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'web' ? 16 : 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.background,
  },
  composer: {
    width: '100%',
    maxWidth: 900,
    minHeight: 48,
    maxHeight: 150,
    alignSelf: 'center',
    borderRadius: 16,
    paddingLeft: 15,
    paddingRight: 7,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  composerInput: {
    flex: 1,
    minHeight: 34,
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
  connectCommand: {
    color: colors.textDim,
    fontSize: 9,
    fontFamily: 'monospace',
    marginTop: 14,
  },
});
