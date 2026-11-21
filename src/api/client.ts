import type {
  AuthSessionResponse,
  ExtractedMeetingAnalysis,
  ExtractedTaskDraft,
  Project,
  ProjectWorkspaceData,
  RecoveryPlanRecord,
  SimulationRecord,
  SimulationScenario,
  Task,
  User,
} from '../shared/types.ts';

let inMemoryAuthToken: string | null = null;

export function setAuthToken(token: string | null): void {
  inMemoryAuthToken = token;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) || {}),
  };
  if (inMemoryAuthToken) {
    headers.Authorization = `Bearer ${inMemoryAuthToken}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed with status ${res.status}`, res.status);
  }
  return data as T;
}

export const api = {
  getStatus: () =>
    request<{ hasGeminiKey: boolean; model: string; workspaceType: string }>('/api/status'),

  getHealth: () =>
    request<{
      ok: boolean;
      status: string;
      database: string;
      aiConfigured: boolean;
      model: string;
      timestamp: string;
    }>('/api/health'),

  register: (payload: { name: string; email: string; role: string; password: string }) =>
    request<AuthSessionResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    request<AuthSessionResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () =>
    request<{ loggedOut: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),

  getMe: () => request<{ user: User }>('/api/auth/me'),

  listProjects: () => request<{ projects: Project[] }>('/api/projects'),

  createProject: (payload: {
    name: string;
    description: string;
    deadline: string;
    teamMembers: Array<{ name: string; role: string; email?: string }>;
  }) =>
    request<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProject: (
    projectId: string,
    payload: Partial<Pick<Project, 'name' | 'description' | 'deadline' | 'status'>>
  ) =>
    request<{ project: Project }>(`/api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteProject: (projectId: string) =>
    request<{ deleted: boolean }>(`/api/projects/${projectId}`, {
      method: 'DELETE',
    }),

  getDashboard: (projectId: string) =>
    request<ProjectWorkspaceData>(`/api/projects/${projectId}/dashboard`),

  uploadMeetingFile: (payload: {
    fileName: string;
    mimeType: string;
    base64Content: string;
  }) =>
    request<{
      fileName: string;
      fileType: 'txt' | 'pdf';
      extractedText: string;
      pdfBase64?: string;
      requiresMultimodalPdf: boolean;
    }>('/api/meetings/upload', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  analyzeMeeting: (
    projectId: string,
    payload: { title?: string; transcript: string; pdfBase64?: string }
  ) =>
    request<{ meetingId: string; analysis: ExtractedMeetingAnalysis }>(
      `/api/projects/${projectId}/meetings/analyze`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  approveMeetingDrafts: (meetingId: string, drafts: ExtractedTaskDraft[]) =>
    request<{ createdTaskIds: string[] }>(`/api/meetings/${meetingId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ drafts }),
    }),

  updateCommitment: (
    commitmentId: string,
    payload: {
      approvalStatus?: 'pending_review' | 'approved' | 'rejected';
      title?: string;
      ownerName?: string;
      dueDate?: string;
    }
  ) =>
    request<{ updated: boolean; taskId: string | null }>(`/api/commitments/${commitmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  createTask: (
    projectId: string,
    payload: Omit<Task, 'id' | 'projectId' | 'ownerId' | 'createdAt'>
  ) =>
    request<{ taskId: string }>(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateTask: (
    taskId: string,
    payload: Partial<Omit<Task, 'id' | 'projectId' | 'ownerId' | 'createdAt'>>
  ) =>
    request<{ updated: boolean }>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteTask: (taskId: string) =>
    request<{ deleted: boolean }>(`/api/tasks/${taskId}`, {
      method: 'DELETE',
    }),

  createDependency: (
    projectId: string,
    payload: { predecessorTaskId: string; successorTaskId: string }
  ) =>
    request<{ id: string }>(`/api/projects/${projectId}/dependencies`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteDependency: (dependencyId: string) =>
    request<{ deleted: boolean }>(`/api/dependencies/${dependencyId}`, {
      method: 'DELETE',
    }),

  runSimulation: (
    projectId: string,
    payload: { selectedTaskId: string; delayDays: number; scenario: SimulationScenario }
  ) =>
    request<{ simulation: SimulationRecord }>(`/api/projects/${projectId}/simulations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  generateRecovery: (simulationId: string) =>
    request<{ recoveryPlan: RecoveryPlanRecord }>(`/api/simulations/${simulationId}/recovery`, {
      method: 'POST',
    }),

  applyRecoveryOption: (planId: string, optionId: string) =>
    request<{ applied: boolean }>(`/api/recovery/${planId}/apply`, {
      method: 'POST',
      body: JSON.stringify({ optionId }),
    }),

  explainRisks: (projectId: string) =>
    request<{ insight: string; aiModel: string }>(`/api/projects/${projectId}/risks/explain`, {
      method: 'POST',
    }),
};
