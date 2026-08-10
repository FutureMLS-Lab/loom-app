import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
  projectLabel,
} from './src/loomClient';
import type {
  ConversationFeed,
  ConversationMessage,
  ConversationQuestion,
  LoomProject,
  LoomTask,
  Tab,
  OptimisticActivity,
  SessionList,
  TaskDetail,
  TaskDiff,
  TerminalCapture,
  TerminalKey,
} from './src/types';

import {
  styles,
} from './src/styles';
import { colors } from './src/theme';
import {
  GATEWAY_URL_KEY,
  useGatewayConnection,
} from './src/useGatewayConnection';
import { useActivityPulse } from './src/useActivityPulse';
import { useConversationFeed } from './src/useConversationFeed';
import {
  MAX_CAPTURE_LINES,
  type TerminalStreamState,
  useTerminalSession,
} from './src/useTerminalSession';

import { ConversationView } from './src/components/ConversationView';
import {
  ActionButton,
  ActivityRing,
  EmptyState,
  Icon,
  type IconName,
  LoomMark,
  loomIcon,
  SectionCard,
  StatusPill,
  TaskRow,
} from './src/components/primitives';
import { ActivityView, TerminalKeyboard } from './src/components/terminal';
import {
  ChangesView,
  NotesView,
  ProjectPickerModal,
} from './src/components/views';

const AGENT_WORKING_PATTERN =
  /(?:esc\s+to\s+interrupt|ctrl\s*\+\s*c\s+to\s+stop)/i;
const TERMINAL_FONT_SIZE_KEY = 'loom-app:terminal-font-size';
const SELECTED_PROJECT_KEY = 'loom-app:selected-project';
const SELECTED_TAB_KEY = 'loom-app:selected-tab';

function LoomApp() {
  const { width } = useWindowDimensions();
  const isCompact = width < 820;
  const [projects, setProjects] = useState<LoomProject[]>([]);
  const [tasks, setTasks] = useState<LoomTask[]>([]);
  const [projectId, setProjectId] = useState('');
  const [selectedSlug, setSelectedSlug] = useState('');
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [sessions, setSessions] = useState<SessionList | null>(null);
  const [diff, setDiff] = useState<TaskDiff | null>(null);
  const [capture, setCapture] = useState<TerminalCapture | null>(null);
  const [conversationAnswerFeedback, setConversationAnswerFeedback] = useState('');
  const [pendingConversationMessages, setPendingConversationMessages] = useState<
    ConversationMessage[]
  >([]);
  const [optimisticActivity, setOptimisticActivity] =
    useState<OptimisticActivity>(null);
  const [liveWorking, setLiveWorking] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('conversation');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectMutationBusy, setProjectMutationBusy] = useState(false);
  const [projectMutationError, setProjectMutationError] = useState('');
  const [loading, setLoading] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [tasksLoading, setTasksLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [forceSendReady, setForceSendReady] = useState(false);
  const [forceSendFeedback, setForceSendFeedback] = useState('');
  const [taskListError, setTaskListError] = useState('');
  const [taskError, setTaskError] = useState('');
  const [terminalFontSize, setTerminalFontSize] = useState(12);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const selectedRef = useRef({ projectId: '', slug: '' });
  const tasksRequestRef = useRef(0);
  const forceSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The loaders are defined below but the hooks need them, so go through refs.
  const loadProjectsRef = useRef<() => void>(() => {});
  const loadSelectedRef = useRef<() => void>(() => {});

  const gateway = useGatewayConnection({
    hydrated: settingsHydrated,
    onSwitchStart: () => setLoading(true),
    onReload: () => loadProjectsRef.current(),
  });
  const {
    applyBaseUrl: applyGatewayBaseUrl,
    client,
    defaultClient,
    persist: persistGatewayUrl,
    setError: setConnectionError,
  } = gateway;
  const terminal = useTerminalSession({
    client,
    onRefresh: () => loadSelectedRef.current(),
  });
  const {
    pulseFor: taskPulse,
    projectPulse,
    acknowledge: acknowledgeActivity,
  } = useActivityPulse({ client, active: appActive });
  const {
    captureLinesRef,
    growCapture,
    resetForSelection: resetTerminalForSelection,
    sendKey: sendTerminalKey,
    setTaskKey: setTerminalTaskKey,
  } = terminal;

  // Optimistic composer state lives here, so the feed reports back instead of
  // owning it; both callbacks stay stable for the hook's dependency arrays.
  const handleConversationCleared = useCallback(() => {
    setConversationAnswerFeedback('');
    setPendingConversationMessages([]);
    setOptimisticActivity(null);
  }, []);

  const handleConversationLoaded = useCallback((feed: ConversationFeed) => {
    const recentUserMessages = feed.messages
      .slice(-80)
      .filter((item) => item.kind === 'user' && item.text);
    setPendingConversationMessages((current) =>
      current.filter(
        (pending) =>
          !recentUserMessages.some(
            (serverMessage) =>
              serverMessage.text?.trim() === pending.text?.trim(),
          ),
      ),
    );
    if (feed.working) {
      setOptimisticActivity(null);
      if (activityTimerRef.current) {
        clearTimeout(activityTimerRef.current);
        activityTimerRef.current = null;
      }
    }
  }, []);

  const conversationFeed = useConversationFeed({
    client,
    selectedRef,
    onCleared: handleConversationCleared,
    onFeedLoaded: handleConversationLoaded,
  });
  const {
    conversation,
    error: conversationError,
    loading: conversationLoading,
    load: loadConversation,
    loadOlder: loadOlderConversation,
    refreshBurst: refreshConversationBurst,
    clear: clearConversation,
    resetForSelection: resetConversationForSelection,
  } = conversationFeed;

  const selectedProject = projects.find((project) => project.id === projectId) || null;
  // Activity in projects the user is not looking at is the whole point of the
  // host-wide snapshot, so summarise it on the picker they can reach from here.
  const elsewhere = projects.reduce(
    (acc, project) => {
      if (project.id === projectId) return acc;
      const pulse = projectPulse(project.id);
      if (pulse === 'finished') acc.finished += 1;
      else if (pulse === 'working') acc.working += 1;
      return acc;
    },
    { finished: 0, working: 0 },
  );
  const selectedTask = tasks.find((task) => task.slug === selectedSlug) || null;
  const running = Boolean(detail?.claude?.agent_running || sessions?.agent_running);
  const working = liveWorking ?? Boolean(conversation?.working);
  const displayedConversation = useMemo<ConversationFeed | null>(() => {
    if (!pendingConversationMessages.length) return conversation;
    const base: ConversationFeed = conversation || {
      ok: true,
      available: true,
      online: running,
      working: false,
      session_id: `local:${projectId}:${selectedSlug}`,
      messages: [],
      total: 0,
      has_more: false,
    };
    return {
      ...base,
      available: true,
      messages: [...base.messages, ...pendingConversationMessages],
      total: base.total + pendingConversationMessages.length,
      updated_at:
        pendingConversationMessages[pendingConversationMessages.length - 1]
          ?.created_at || base.updated_at,
    };
  }, [
    conversation,
    pendingConversationMessages,
    projectId,
    running,
    selectedSlug,
  ]);
  const target = agentTarget(detail, sessions);
  terminal.targetRef.current = target;
  const selectionKey = projectId && selectedSlug ? `${projectId}:${selectedSlug}` : '';
  const terminalMounted = Boolean(selectionKey) && terminal.taskKey === selectionKey;
  const keyboardFocusMode = isCompact && keyboardVisible && tab === 'activity';
  const terminalKeyboardFocusMode = keyboardFocusMode && terminal.focused;

  const loadProjects = useCallback(async () => {
    const applyProjects = (nextProjects: LoomProject[], baseUrl: string) => {
      setProjects(nextProjects);
      persistGatewayUrl(baseUrl);
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
      await client.health().catch(() => undefined);
      const nextProjects = await client.projects();
      applyProjects(nextProjects, client.baseUrl);
    } catch (error) {
      if (client.baseUrl !== defaultClient.baseUrl) {
        try {
          await defaultClient.health().catch(() => undefined);
          const fallbackProjects = await defaultClient.projects();
          applyGatewayBaseUrl(defaultClient.baseUrl);
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
  }, [
    applyGatewayBaseUrl,
    client,
    defaultClient,
    persistGatewayUrl,
    setConnectionError,
  ]);

  loadProjectsRef.current = () => void loadProjects();

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
    async () => {
      const current = selectedRef.current;
      if (!current.projectId || !current.slug) return;
      try {
        const [nextDetail, nextSessions] = await Promise.all([
          client.task(current.projectId, current.slug),
          client.sessions(current.projectId, current.slug),
        ]);
        if (
          selectedRef.current.projectId !== current.projectId ||
          selectedRef.current.slug !== current.slug
        ) {
          return;
        }
        setDetail(nextDetail);
        setSessions(nextSessions);
        const nextTarget = agentTarget(nextDetail, nextSessions);
        if (nextTarget && Platform.OS === 'web') {
          try {
            const nextCapture = await client.capture(
              nextTarget,
              terminal.captureLinesRef.current,
            );
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

  const loadDiff = useCallback(async () => {
    const current = selectedRef.current;
    if (!current.projectId || !current.slug) return;
    try {
      const nextDiff = await client.diff(current.projectId, current.slug);
      if (
        selectedRef.current.projectId === current.projectId &&
        selectedRef.current.slug === current.slug
      ) {
        setDiff(nextDiff);
      }
    } catch (error) {
      if (
        selectedRef.current.projectId === current.projectId &&
        selectedRef.current.slug === current.slug
      ) {
        setTaskError(error instanceof Error ? error.message : String(error));
      }
    }
  }, [client]);

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
        if (savedTab === 'conversation' || savedTab === 'changes' || savedTab === 'notes') {
          setTab(savedTab);
        } else if (savedTab === 'activity') {
          // Existing installs used Activity for the raw terminal. Migrate them
          // to the new conversation-first home while keeping Terminal available.
          setTab('conversation');
        }
        gateway.adoptStored(values[GATEWAY_URL_KEY]);
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
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardVisible(true);
      setKeyboardHeight(
        Platform.OS === 'ios' ? Math.max(0, event.endCoordinates.height) : 0,
      );
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(
    () => () => {
      if (forceSendTimerRef.current) clearTimeout(forceSendTimerRef.current);
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    setSelectedSlug('');
    setTasks([]);
    setDetail(null);
    setSessions(null);
    setDiff(null);
    setCapture(null);
    clearConversation();
    handleConversationCleared();
    setTaskListError('');
    setTaskError('');
    void loadTasks(projectId);
  }, [clearConversation, handleConversationCleared, loadTasks, projectId]);

  useEffect(() => {
    selectedRef.current = { projectId, slug: selectedSlug };
    resetTerminalForSelection();
    resetConversationForSelection(Boolean(projectId && selectedSlug));
    handleConversationCleared();
    setDetail(null);
    setSessions(null);
    setDiff(null);
    setCapture(null);
    setLiveWorking(null);
    setForceSendReady(false);
    setForceSendFeedback('');
    if (forceSendTimerRef.current) {
      clearTimeout(forceSendTimerRef.current);
      forceSendTimerRef.current = null;
    }
    if (activityTimerRef.current) {
      clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;
    }
  }, [projectId, resetTerminalForSelection, selectedSlug]);

  useEffect(() => {
    if (!projectId || !selectedSlug || !appActive) return;
    void loadSelected();
    const timer = setInterval(() => void loadSelected(), 4000);
    return () => clearInterval(timer);
  }, [appActive, loadSelected, projectId, selectedSlug]);

  useEffect(() => {
    if (tab !== 'changes' || !projectId || !selectedSlug || !appActive) return;
    void loadDiff();
  }, [appActive, loadDiff, projectId, selectedSlug, tab]);

  // Building the terminal WebView costs a visible frame drop, so keep it out
  // of the tree until Terminal is opened for the selected task.
  useEffect(() => {
    if (tab === 'activity' && selectionKey) setTerminalTaskKey(selectionKey);
  }, [selectionKey, setTerminalTaskKey, tab]);

  useEffect(() => {
    if (!projectId || !selectedSlug || !appActive) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async (initial: boolean) => {
      await loadConversation(initial, !initial);
      if (!cancelled) {
        timer = setTimeout(() => void poll(false), 600);
      }
    };
    void poll(true);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [appActive, loadConversation, projectId, selectedSlug]);

  useEffect(() => {
    if (!appActive || !running || !target) {
      setLiveWorking(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const snapshot = await client.capture(target, 35);
        if (!cancelled) {
          setLiveWorking(AGENT_WORKING_PATTERN.test(snapshot.text || ''));
        }
      } catch {
        // Keep the last known state through a transient network failure.
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 400);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [appActive, client, running, target]);

  useEffect(() => {
    if (!isCompact) setProjectPickerOpen(false);
  }, [isCompact]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadProjects(),
      loadTasks(projectId),
      loadSelected(),
      loadConversation(true),
      tab === 'changes' ? loadDiff() : Promise.resolve(),
    ]);
  }, [
    loadConversation,
    loadDiff,
    loadProjects,
    loadSelected,
    loadTasks,
    projectId,
    tab,
  ]);

  const loadOlderCapture = useCallback(() => {
    if (growCapture()) void loadSelected();
  }, [growCapture, loadSelected]);

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
      clearConversation();
      handleConversationCleared();
      setTaskError('');
      setProjectId(nextProjectId);
    },
    [clearConversation, handleConversationCleared, projectId],
  );

  const selectTask = useCallback(
    (slug: string) => {
      selectedRef.current = { projectId, slug };
      setTaskError('');
      setSelectedSlug(slug);
      // Opening the task is what counts as having seen its finish.
      acknowledgeActivity(projectId, slug);
    },
    [acknowledgeActivity, projectId],
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
        await Promise.all([loadSelected(), loadConversation(true)]);
        await loadTasks(projectId);
      } catch (error) {
        setTaskError(error instanceof Error ? error.message : String(error));
      } finally {
        setActionBusy(false);
      }
    },
    [client, loadConversation, loadSelected, loadTasks, projectId, selectedSlug],
  );

  const armOptimisticActivity = useCallback(
    (activity: Exclude<OptimisticActivity, null>) => {
      setOptimisticActivity(activity);
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      activityTimerRef.current = setTimeout(() => {
        setOptimisticActivity(null);
        activityTimerRef.current = null;
      }, 10000);
    },
    [],
  );

  const armForceSend = useCallback(() => {
    setForceSendReady(true);
    if (forceSendTimerRef.current) clearTimeout(forceSendTimerRef.current);
    forceSendTimerRef.current = setTimeout(() => {
      setForceSendReady(false);
      forceSendTimerRef.current = null;
    }, 12000);
  }, []);

  const sendMessage = useCallback(async () => {
    const text = message.trim();
    if (!text || !projectId || !selectedSlug) return;
    const queuedBehindActiveTurn =
      selectedTask?.agent === 'cursor' && working;
    setForceSendFeedback('');
    const localId = `local:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMessage: ConversationMessage = {
      id: localId,
      kind: 'user',
      text,
      created_at: Date.now(),
      delivery: 'sending',
    };
    setPendingConversationMessages((current) => [...current, optimisticMessage]);
    setMessage('');
    armOptimisticActivity('sending');
    setActionBusy(true);
    setTaskError('');
    try {
      await client.sendMessage(projectId, selectedSlug, text);
      setPendingConversationMessages((current) =>
        current.map((item) =>
          item.id === localId
            ? {
                ...item,
                delivery: queuedBehindActiveTurn ? 'queued' : 'sending',
              }
            : item,
        ),
      );
      armOptimisticActivity(
        queuedBehindActiveTurn ? 'queued' : 'sending',
      );
      if (queuedBehindActiveTurn && terminal.targetRef.current) {
        armForceSend();
      }
      refreshConversationBurst();
      setTimeout(() => void loadSelected(), 500);
    } catch (error) {
      setPendingConversationMessages((current) =>
        current.filter((item) => item.id !== localId),
      );
      setMessage((current) => current || text);
      setOptimisticActivity(null);
      if (activityTimerRef.current) {
        clearTimeout(activityTimerRef.current);
        activityTimerRef.current = null;
      }
      setTaskError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(false);
    }
  }, [
    armForceSend,
    armOptimisticActivity,
    client,
    loadSelected,
    message,
    projectId,
    refreshConversationBurst,
    selectedSlug,
    selectedTask?.agent,
    working,
  ]);

  const forceQueuedMessage = useCallback(async () => {
    if (
      !forceSendReady ||
      !projectId ||
      !selectedSlug ||
      selectedTask?.agent !== 'cursor' ||
      actionBusy
    ) {
      return;
    }
    setActionBusy(true);
    setTaskError('');
    setForceSendFeedback('Sending queued message now…');
    armOptimisticActivity('forcing');
    setForceSendReady(false);
    if (forceSendTimerRef.current) {
      clearTimeout(forceSendTimerRef.current);
      forceSendTimerRef.current = null;
    }
    try {
      const result = await client.forceSendMessage(projectId, selectedSlug);
      setForceSendFeedback(
        result.working
          ? 'Queued message sent now.'
          : 'Force command delivered to Cursor.',
      );
      refreshConversationBurst();
      setTimeout(() => void loadSelected(), 350);
    } catch (error) {
      setOptimisticActivity(null);
      if (activityTimerRef.current) {
        clearTimeout(activityTimerRef.current);
        activityTimerRef.current = null;
      }
      const message = error instanceof Error ? error.message : String(error);
      setForceSendFeedback(message);
      setTaskError(message);
    } finally {
      setActionBusy(false);
    }
  }, [
    actionBusy,
    armOptimisticActivity,
    client,
    forceSendReady,
    loadSelected,
    projectId,
    refreshConversationBurst,
    selectedSlug,
    selectedTask?.agent,
  ]);

  const sendConversationAnswer = useCallback(
    async (
      question: ConversationQuestion,
      selected: Record<string, string[]>,
      customAnswer: string,
    ) => {
      if (!projectId || !selectedSlug || actionBusy) return;
      const answers = question.questions.map((item) => ({
        prompt: item.prompt,
        values: (selected[item.id] || []).map((value) => {
          const option = item.options.find((candidate) => candidate.value === value);
          return option && /^other\b/i.test(option.label.trim()) && customAnswer
            ? customAnswer
            : value;
        }),
      }));
      const text =
        answers.length === 1
          ? answers[0].values.join(', ')
          : answers
              .map((item) => `${item.prompt}\n${item.values.join(', ')}`)
              .join('\n\n');
      if (!text) return;
      setActionBusy(true);
      setTaskError('');
      setConversationAnswerFeedback('');
      armOptimisticActivity('sending');
      try {
        if (question.source === 'terminal' && question.id) {
          const selectedIds = question.questions.flatMap((item) => {
            const values = new Set(selected[item.id] || []);
            return item.options
              .filter((option) => values.has(option.value))
              .map((option) => option.id);
          });
          const result = await client.answerConversationQuestion(
            projectId,
            selectedSlug,
            question.id,
            selectedIds,
            customAnswer,
          );
          setConversationAnswerFeedback(
            result.pending
              ? 'Selection reached tmux, but the menu is still open. Review it and send again.'
              : 'Answer submitted.',
          );
          if (result.pending) armOptimisticActivity('queued');
        } else {
          await client.sendMessage(projectId, selectedSlug, text);
          setConversationAnswerFeedback('Answer submitted.');
        }
        refreshConversationBurst();
        setTimeout(() => void loadSelected(), 350);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setOptimisticActivity(null);
        if (activityTimerRef.current) {
          clearTimeout(activityTimerRef.current);
          activityTimerRef.current = null;
        }
        setTaskError(message);
        setConversationAnswerFeedback(message);
      } finally {
        setActionBusy(false);
      }
    },
    [
      actionBusy,
      armOptimisticActivity,
      client,
      loadSelected,
      projectId,
      refreshConversationBurst,
      selectedSlug,
    ],
  );

  const filteredTasks = tasks.filter((task) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${task.title} ${task.slug} ${task.general_goal || ''} ${task.agent || ''} ${task.interview_model || ''}`
      .toLowerCase()
      .includes(needle);
  });

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
            <View style={styles.mobileProjectCountRow}>
              <Text style={styles.mobileProjectCount}>
                {projects.length} projects available
              </Text>
              {elsewhere.finished || elsewhere.working ? (
                <Text style={styles.mobileProjectElsewhere}>
                  {elsewhere.finished
                    ? `· ${elsewhere.finished} done elsewhere`
                    : `· ${elsewhere.working} running elsewhere`}
                </Text>
              ) : null}
            </View>
          </View>
          <ActivityRing
            pulse={elsewhere.finished ? 'finished' : elsewhere.working ? 'working' : 'idle'}
            size={30}
          >
            <View style={styles.mobileProjectChevron}>
              <Icon name="chevron-down" color={colors.primary} />
            </View>
          </ActivityRing>
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
            pulse={taskPulse(projectId, item.slug)}
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
          accessibilityLabel={gateway.expanded ? 'Collapse gateway settings' : 'Expand gateway settings'}
          onPress={() => gateway.setExpanded((current) => !current)}
          style={styles.gatewaySummary}
        >
          <View style={styles.gatewaySummaryCopy}>
            <View style={styles.gatewayTitle}>
              <View
                style={[
                  styles.gatewayDot,
                  gateway.error ? styles.gatewayDotError : styles.gatewayDotOnline,
                ]}
              />
              <Text style={styles.gatewayLabel}>
                {gateway.error ? 'Gateway unavailable' : 'Gateway connected'}
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.gatewayUrl}>
              {gateway.baseUrl}
            </Text>
          </View>
          <Icon name={gateway.expanded ? 'chevron-down' : 'settings-outline'} size={17} />
        </Pressable>
        {gateway.expanded && (
          <View style={styles.gatewayEditor}>
            <TextInput
              value={gateway.draft}
              onChangeText={gateway.setDraft}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.gatewayInput}
              placeholder="http://127.0.0.1:8787"
              placeholderTextColor={colors.textDim}
              onSubmitEditing={gateway.connect}
            />
            <View style={styles.gatewayActions}>
              <Pressable onPress={gateway.reset} style={styles.gatewayReset}>
                <Text style={styles.gatewayResetText}>Use default</Text>
              </Pressable>
              <Pressable onPress={gateway.connect} style={styles.gatewayConnect}>
                <Text style={styles.gatewayConnectText}>Connect</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );

  const taskPane = selectedTask ? (
    <View
      style={[
        styles.taskPane,
        isCompact &&
          keyboardHeight > 0 && {
            paddingBottom: keyboardHeight,
          },
      ]}
    >
      {!keyboardFocusMode && !terminal.fullscreen && (
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
              {!isCompact && (
                <StatusPill
                  running={working}
                  label={working ? 'Working' : running ? 'Ready' : 'Stopped'}
                />
              )}
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
            onPress={() => {
              void loadSelected();
              void loadConversation(true);
              if (tab === 'changes') void loadDiff();
            }}
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
            ['conversation', 'Chat', 'chatbubble-ellipses-outline'],
            ['activity', 'Terminal', 'terminal-outline'],
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

      {!keyboardFocusMode && !terminal.fullscreen && taskError ? (
        <View style={styles.errorBanner}>
          <Icon name="warning-outline" color={colors.red} />
          <Text style={styles.errorText}>{taskError}</Text>
        </View>
      ) : null}

      {tab === 'conversation' ? (
        <View style={styles.conversationContent}>
          <ConversationView
            feed={displayedConversation}
            loading={conversationLoading}
            error={conversationError}
            online={running}
            working={working}
            optimisticActivity={optimisticActivity}
            answering={actionBusy}
            answerFeedback={conversationAnswerFeedback}
            keyboardVisible={keyboardVisible}
            onLoadMore={loadOlderConversation}
            onAnswer={sendConversationAnswer}
          />
        </View>
      ) : null}

      {terminalMounted ? (
      <View
        style={[
          styles.activityContent,
          isCompact && styles.activityContentCompact,
          keyboardFocusMode && styles.activityContentKeyboard,
          terminal.fullscreen && styles.activityContentFullscreen,
          tab !== 'activity' && styles.activityContentHidden,
        ]}
      >
          {keyboardFocusMode && (
            <View style={styles.keyboardFocusOverlay}>
              <Text style={styles.keyboardFocusLabel}>
                {terminal.focused ? 'Terminal input' : 'Message input'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hide software keyboard"
                onPress={() => {
                  terminal.requestBlur();
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
            working={working}
            target={target}
            gatewayUrl={gateway.baseUrl}
            gatewayAuthToken={DEFAULT_GATEWAY_AUTH_TOKEN}
            fontSize={terminalFontSize}
            captureLines={terminal.captureLines}
            terminalKeyPending={terminal.keyPending}
            lastTerminalKey={terminal.lastKey}
            terminalKeyError={terminal.keyError}
            keyboardVisible={keyboardFocusMode}
            fullscreen={terminal.fullscreen}
            appActive={appActive && tab === 'activity'}
            terminalBlurRequest={terminal.blurRequest}
            onFontSizeChange={setTerminalFontSize}
            onLoadMore={loadOlderCapture}
            onTerminalKey={sendTerminalKey}
            onTerminalFocusChange={terminal.setFocused}
            onFullscreenChange={terminal.setFullscreen}
            onStreamStateChange={terminal.setStreamState}
          />
      </View>
      ) : null}
      {tab === 'changes' || tab === 'notes' ? (
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

      {(tab === 'conversation' || tab === 'activity') &&
        !terminalKeyboardFocusMode &&
        !terminal.fullscreen && (
        <View style={[styles.composerShell, isCompact && styles.composerShellCompact]}>
          {tab === 'activity' && terminal.keysOpen ? (
            <TerminalKeyboard
              disabled={!target || terminal.streamState !== 'live'}
              disabledReason={
                !target
                  ? 'Start agent to enable'
                  : terminal.streamState === 'paused'
                    ? 'Terminal paused'
                    : 'Connecting terminal…'
              }
              pending={terminal.keyPending}
              lastKey={terminal.lastKey}
              error={terminal.keyError}
              onKey={sendTerminalKey}
            />
          ) : null}
          {/* The banner above is hidden while the keyboard is up, which is
              exactly when sending fails, so surface it next to the composer. */}
          {keyboardFocusMode && taskError ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Dismiss error: ${taskError}`}
              onPress={() => setTaskError('')}
              style={({ pressed }) => [
                styles.composerError,
                pressed && styles.pressed,
              ]}
            >
              <Icon name="warning-outline" size={13} color={colors.red} />
              <Text numberOfLines={2} style={styles.composerErrorText}>
                {taskError}
              </Text>
              <Icon name="close" size={13} color={colors.red} />
            </Pressable>
          ) : null}
          <View style={[styles.composer, !running && styles.composerOffline]}>
            {tab === 'activity' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={terminal.keysOpen ? 'Hide terminal keys' : 'Show terminal keys'}
                onPress={() => terminal.setKeysOpen((current) => !current)}
                style={({ pressed }) => [
                  styles.composerKeysButton,
                  terminal.keysOpen && styles.composerKeysButtonActive,
                  pressed && styles.pressed,
                ]}
              >
                <Icon
                  name="keypad-outline"
                  size={18}
                  color={terminal.keysOpen ? colors.primary : colors.textMuted}
                />
              </Pressable>
            ) : (
              <View style={styles.composerAgentMark}>
                <Image source={loomIcon} resizeMode="cover" style={styles.composerAgentMarkImage} />
              </View>
            )}
            <TextInput
              value={message}
              onChangeText={setMessage}
              onFocus={() => terminal.setFocused(false)}
              multiline
              maxLength={12000}
              editable={running && !actionBusy}
              placeholder={
                running
                  ? working
                    ? 'Steer the running agent…'
                    : 'Send a follow-up…'
                  : 'Agent session offline'
              }
              placeholderTextColor={colors.textDim}
              style={styles.composerInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                forceSendReady && !message.trim()
                  ? 'Force send queued Cursor follow-up'
                  : 'Send message to agent'
              }
              disabled={
                !running ||
                actionBusy ||
                (!message.trim() && !forceSendReady)
              }
              onPress={() => {
                if (message.trim()) {
                  void sendMessage();
                } else {
                  void forceQueuedMessage();
                }
              }}
              style={({ pressed }) => [
                styles.sendButton,
                forceSendReady && !message.trim() && styles.sendButtonForce,
                pressed && styles.pressed,
                (
                  !running ||
                  actionBusy ||
                  (!message.trim() && !forceSendReady)
                ) && styles.sendButtonDisabled,
              ]}
            >
              {actionBusy ? (
                <ActivityIndicator size="small" color="#211a4a" />
              ) : (
                <Icon
                  name={forceSendReady && !message.trim() ? 'flash' : 'arrow-up'}
                  color="#211a4a"
                  size={20}
                />
              )}
            </Pressable>
          </View>
          {forceSendFeedback ? (
            <Text style={styles.forceSendFeedback}>{forceSendFeedback}</Text>
          ) : forceSendReady && !message.trim() ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send queued Cursor message now"
              onPress={() => void forceQueuedMessage()}
              style={({ pressed }) => [
                styles.forceSendAction,
                pressed && styles.pressed,
              ]}
            >
              <Icon name="flash" size={13} color={colors.amber} />
              <Text style={styles.forceSendHint}>Send queued message now</Text>
            </Pressable>
          ) : !running ? (
            <View style={styles.composerOfflineHint}>
              <Icon name="play-circle-outline" size={13} color={colors.textDim} />
              <Text style={styles.composerOfflineHintText}>
                Start this session with the play button above.
              </Text>
            </View>
          ) : !isCompact ? (
            <Text style={styles.composerHint}>
              Loom sends this directly to the active {selectedTask.agent || 'cursor'} session.
            </Text>
          ) : null}
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

  if (gateway.error && !projects.length) {
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
            <Text style={styles.connectErrorText}>{gateway.error}</Text>
          </View>
          <TextInput
            value={gateway.draft}
            onChangeText={gateway.setDraft}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.connectInput}
            placeholder="http://127.0.0.1:8787"
            placeholderTextColor={colors.textDim}
            onSubmitEditing={gateway.connect}
          />
          <ActionButton
            label="Connect"
            icon="arrow-forward"
            tone="primary"
            onPress={gateway.connect}
          />
          <Pressable onPress={gateway.reset} style={styles.connectReset}>
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

