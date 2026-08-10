export type LoomProject = {
  id: string;
  path: string;
  name?: string;
  title?: string;
  code_root_pattern?: string;
  code_root_path?: string;
};

export type LoomTask = {
  slug: string;
  title: string;
  general_goal?: string;
  kind?: string;
  agent?: 'cursor' | 'claude' | 'codex' | string;
  interview_model?: string;
  tmux_interview_target?: string;
  updated_at?: string;
};

export type AgentStatus = {
  session?: string;
  target?: string;
  tmux_target?: string;
  tmux_alive?: boolean;
  agent_running?: boolean;
  pane_dead?: boolean;
  pane_command?: string;
  agent?: string;
};

export type TaskDetail = {
  meta: LoomTask;
  claude?: AgentStatus | null;
  templates?: Record<string, string>;
  task_markdown_files?: Array<{ name: string; path?: string; content?: string }>;
  worktree_statuses?: Array<{
    path?: string;
    branch?: string;
    clean?: boolean;
    ahead?: number;
    behind?: number;
  }>;
};

export type SessionInfo = {
  id: string;
  path?: string;
  mtime?: number;
  size?: number;
};

export type SessionList = {
  tracked?: string[];
  sessions?: SessionInfo[];
  tmux_alive?: boolean;
  agent_running?: boolean;
  tmux_target?: string;
};

export type DiffFile = {
  path: string;
  status?: string;
  patch?: string;
  diff?: string;
  additions?: number;
  deletions?: number;
};

export type WorktreeDiff = {
  path?: string;
  branch?: string;
  base?: string;
  files?: DiffFile[];
  error?: string;
};

export type TaskDiff = {
  slug?: string;
  worktrees?: WorktreeDiff[];
};

export type TerminalCapture = {
  ok: boolean;
  text: string;
  error?: string;
};

export type ConversationTool = {
  name: string;
  summary: string;
  status: 'running' | 'completed' | 'error' | 'canceled';
  input?: string;
  output?: string;
};

export type ConversationOption = {
  id: string;
  label: string;
  description?: string;
  value: string;
  terminal_index?: number;
  selected?: boolean;
};

export type ConversationPrompt = {
  id: string;
  header?: string;
  prompt: string;
  allow_multiple: boolean;
  options: ConversationOption[];
};

export type ConversationQuestion = {
  id?: string;
  title: string;
  source?: 'transcript' | 'numbered' | 'terminal';
  status: 'pending' | 'answered' | 'error' | 'canceled';
  answer?: string;
  questions: ConversationPrompt[];
};

export type ConversationMessage = {
  id: string;
  kind: 'user' | 'assistant' | 'tool' | 'question' | 'event';
  text?: string;
  created_at?: number | null;
  delivery?: 'sending' | 'queued';
  tool?: ConversationTool;
  question?: ConversationQuestion;
};

export type ConversationFeed = {
  ok: boolean;
  available: boolean;
  agent?: string;
  online?: boolean;
  working?: boolean;
  session_id?: string | null;
  updated_at?: number | null;
  messages: ConversationMessage[];
  total: number;
  has_more: boolean;
};

export type TerminalKey =
  | 'Escape'
  | 'C-c'
  | 'C-a'
  | 'C-d'
  | 'C-e'
  | 'C-l'
  | 'C-z'
  | 'M-b'
  | 'M-f'
  | 'Up'
  | 'Down'
  | 'Left'
  | 'Right'
  | 'Tab'
  | 'BTab'
  | 'Enter'
  | 'Backspace'
  | 'Space'
  | 'Home'
  | 'End'
  | 'DC'
  | 'IC'
  | 'PageUp'
  | 'PageDown'
  | 'F1'
  | 'F2'
  | 'F3'
  | 'F4'
  | 'F5'
  | 'F6'
  | 'F7'
  | 'F8'
  | 'F9'
  | 'F10'
  | 'F11'
  | 'F12';

export type AgentStartResult = {
  ok?: boolean;
  target?: string;
  session?: string;
  already_running?: boolean;
  agent?: string;
  error?: string;
};

export type OptimisticActivity = 'sending' | 'queued' | 'forcing' | null;

export type ActivityTask = {
  project: string;
  slug: string;
  working: boolean;
  /** Epoch seconds of an unacknowledged finish; 0 once seen. */
  finished_at: number;
};

export type ActivitySnapshot = {
  ok?: boolean;
  tasks?: Record<string, ActivityTask>;
  projects?: Record<string, { working: number; finished: number }>;
};

/** Nothing to show, the agent is running, or it finished unseen. */
export type ActivityPulse = 'idle' | 'working' | 'finished';

export type Tab = 'conversation' | 'activity' | 'changes' | 'notes';
