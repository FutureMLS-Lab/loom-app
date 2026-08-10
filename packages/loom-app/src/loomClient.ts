import type {
  ActivitySnapshot,
  AgentStartResult,
  ConversationFeed,
  LoomProject,
  LoomTask,
  SessionList,
  TaskDetail,
  TaskDiff,
  TerminalCapture,
  TerminalKey,
} from './types';

export const DEFAULT_GATEWAY_URL =
  process.env.EXPO_PUBLIC_LOOM_GATEWAY_URL?.trim() || 'http://127.0.0.1:8787';
export const DEFAULT_GATEWAY_AUTH_TOKEN =
  process.env.EXPO_PUBLIC_LOOM_GATEWAY_AUTH_TOKEN?.trim() || '';

export class LoomApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'LoomApiError';
  }
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

const LOCAL_HOST_RE =
  /^https?:\/\/(localhost|127(\.\d+){3}|10(\.\d+){3}|192\.168(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2})(:\d+)?(\/|$)/i;

export function isLocalGatewayUrl(value: string): boolean {
  return LOCAL_HOST_RE.test(value.trim());
}

function scoped(path: string, projectId: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}project=${encodeURIComponent(projectId)}`;
}

export class LoomClient {
  readonly baseUrl: string;
  readonly authToken: string;

  constructor(
    baseUrl: string = DEFAULT_GATEWAY_URL,
    authToken: string = DEFAULT_GATEWAY_AUTH_TOKEN,
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.authToken = authToken.trim();
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message =
        typeof payload === 'object' && payload && 'error' in payload
          ? String(payload.error)
          : typeof payload === 'string' && payload
            ? payload
            : `Loom request failed (${response.status})`;
      throw new LoomApiError(message, response.status);
    }
    return payload as T;
  }

  async health(): Promise<{ ok: boolean; loom?: { ok?: boolean }; error?: string }> {
    return this.request('/health');
  }

  async projects(): Promise<LoomProject[]> {
    const result = await this.request<{ projects?: LoomProject[] }>('/api/projects');
    return result.projects || [];
  }

  /** Host-wide, so a finish in a project you are not viewing still surfaces. */
  async activity(): Promise<ActivitySnapshot> {
    return this.request<ActivitySnapshot>('/api/activity');
  }

  /** Clears a task's unseen-finish flag once its conversation has been opened. */
  async ackActivity(projectId: string, slug: string): Promise<{ ok?: boolean }> {
    return this.request<{ ok?: boolean }>(scoped('/api/activity/ack', projectId), {
      method: 'POST',
      body: JSON.stringify({ slug }),
    });
  }

  async addProject(path: string): Promise<{ id: string; projects?: LoomProject[] }> {
    return this.request<{ id: string; projects?: LoomProject[] }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        path: path.trim(),
        mode: 'existing',
        code_root_pattern: '.',
      }),
    });
  }

  async removeProject(projectId: string): Promise<{ ok?: boolean; projects?: LoomProject[] }> {
    return this.request<{ ok?: boolean; projects?: LoomProject[] }>(
      `/api/projects/${encodeURIComponent(projectId)}`,
      { method: 'DELETE' },
    );
  }

  async tasks(projectId: string): Promise<LoomTask[]> {
    const result = await this.request<{ tasks?: LoomTask[] }>(
      scoped('/api/tasks', projectId),
    );
    return result.tasks || [];
  }

  async task(projectId: string, slug: string): Promise<TaskDetail> {
    return this.request<TaskDetail>(
      scoped(`/api/tasks/${encodeURIComponent(slug)}`, projectId),
    );
  }

  async sessions(projectId: string, slug: string): Promise<SessionList> {
    return this.request<SessionList>(
      scoped(`/api/tasks/${encodeURIComponent(slug)}/claude-sessions`, projectId),
    );
  }

  async conversation(
    projectId: string,
    slug: string,
    limit = 160,
  ): Promise<ConversationFeed> {
    return this.request<ConversationFeed>(
      scoped(
        `/api/tasks/${encodeURIComponent(slug)}/conversation?limit=${Math.max(20, Math.min(500, limit))}`,
        projectId,
      ),
    );
  }

  async diff(projectId: string, slug: string): Promise<TaskDiff> {
    return this.request<TaskDiff>(
      scoped(`/api/tasks/${encodeURIComponent(slug)}/diff`, projectId),
    );
  }

  async startAgent(projectId: string, slug: string): Promise<AgentStartResult> {
    return this.request<AgentStartResult>(
      scoped(`/api/tasks/${encodeURIComponent(slug)}/interview/start`, projectId),
      { method: 'POST', body: '{}' },
    );
  }

  async stopAgent(projectId: string, slug: string): Promise<{ ok?: boolean }> {
    return this.request<{ ok?: boolean }>(
      scoped(`/api/tasks/${encodeURIComponent(slug)}/interview/stop`, projectId),
      { method: 'POST', body: '{}' },
    );
  }

  async sendMessage(
    projectId: string,
    slug: string,
    text: string,
  ): Promise<{ ok?: boolean }> {
    return this.request<{ ok?: boolean }>(
      scoped(`/api/tasks/${encodeURIComponent(slug)}/claude/send`, projectId),
      {
        method: 'POST',
        body: JSON.stringify({ text, submit: true }),
      },
    );
  }

  async forceSendMessage(
    projectId: string,
    slug: string,
  ): Promise<{ ok?: boolean; working?: boolean }> {
    return this.request<{ ok?: boolean; working?: boolean }>(
      scoped(
        `/api/tasks/${encodeURIComponent(slug)}/claude/force-send`,
        projectId,
      ),
      { method: 'POST', body: '{}' },
    );
  }

  async answerConversationQuestion(
    projectId: string,
    slug: string,
    questionId: string,
    selectedIds: string[],
    customText = '',
  ): Promise<{ ok?: boolean; pending?: boolean }> {
    return this.request<{ ok?: boolean; pending?: boolean }>(
      scoped(
        `/api/tasks/${encodeURIComponent(slug)}/conversation/answer`,
        projectId,
      ),
      {
        method: 'POST',
        body: JSON.stringify({
          question_id: questionId,
          selected_ids: selectedIds,
          custom_text: customText,
        }),
      },
    );
  }

  async sendKey(target: string, key: TerminalKey): Promise<{ ok?: boolean }> {
    return this.request<{ ok?: boolean }>('/api/tmux/send-key', {
      method: 'POST',
      body: JSON.stringify({ target, key }),
    });
  }

  async capture(target: string, lines = 180): Promise<TerminalCapture> {
    return this.request<TerminalCapture>(
      `/api/tmux/capture?target=${encodeURIComponent(target)}&lines=${lines}`,
    );
  }
}

export function projectLabel(project: LoomProject): string {
  if (project.title || project.name) return project.title || project.name || 'Project';
  const parts = project.path.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || project.id;
}

export function agentTarget(
  detail: TaskDetail | null,
  sessions: SessionList | null,
): string {
  return (
    sessions?.tmux_target ||
    detail?.claude?.tmux_target ||
    detail?.claude?.target ||
    detail?.meta.tmux_interview_target ||
    ''
  );
}
