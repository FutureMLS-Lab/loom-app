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

export type AgentStartResult = {
  ok?: boolean;
  target?: string;
  session?: string;
  already_running?: boolean;
  agent?: string;
  error?: string;
};
