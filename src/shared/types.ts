export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type ApprovalStatus = 'pending_review' | 'approved' | 'rejected';
export type ConfidenceLevel = 'high' | 'medium' | 'needs_confirmation';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarInitials: string;
  createdAt: string;
}

export interface AuthSessionResponse {
  token: string;
  user: User;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  avatarInitials: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  deadline: string; // YYYY-MM-DD
  status: 'on_track' | 'at_risk' | 'critical' | 'completed';
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  ownerId: string | null;
  ownerName: string;
  startDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  estimatedDuration: number; // in days >= 1
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: string;
}

export interface TaskDependency {
  id: string;
  projectId: string;
  predecessorTaskId: string;
  successorTaskId: string;
}

export interface Meeting {
  id: string;
  projectId: string;
  title: string;
  transcript: string;
  summary: string;
  decisions: string[];
  unresolvedQuestions: string[];
  aiModel: string;
  createdAt: string;
}

export interface Commitment {
  id: string;
  meetingId: string;
  projectId: string;
  taskId: string | null;
  ownerId: string | null;
  ownerName: string;
  title: string;
  description: string;
  dueDate: string;
  priority: TaskPriority;
  originalStatement: string;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  approvalStatus: ApprovalStatus;
  dependencyHints: string[];
  needsConfirmationReason?: string;
}

export interface ScheduleNode {
  taskId: string;
  esDay: number;
  efDay: number;
  lsDay: number;
  lfDay: number;
  slackDays: number;
  isCritical: boolean;
  isBlockedByDependency: boolean;
  isOverdue: boolean;
  isAtRisk: boolean;
  predecessorIds: string[];
  successorIds: string[];
  visualState: 'green' | 'blue' | 'amber' | 'red' | 'gray';
}

export type SimulationScenario =
  | 'resource_bottleneck'
  | 'scope_creep'
  | 'api_delay'
  | 'custom';

export interface TaskSimulationComparison {
  taskId: string;
  title: string;
  ownerName: string;
  originalStartDate: string;
  originalDueDate: string;
  simulatedStartDate: string;
  simulatedDueDate: string;
  shiftDays: number;
  slackAvailable: number;
  slackRemaining: number;
  impactLevel: 'source' | 'direct' | 'indirect' | 'unaffected';
  isCritical: boolean;
  threatensProjectDeadline: boolean;
  newlyBlocked: boolean;
}

export interface SimulationResult {
  selectedTaskId: string;
  selectedTaskTitle: string;
  delayDays: number;
  scenario: SimulationScenario;
  originalProjectEndDate: string;
  simulatedProjectEndDate: string;
  projectDeadline: string;
  estimatedProjectDelayDays: number;
  deadlineThreatened: boolean;
  directlyAffectedTaskIds: string[];
  indirectlyAffectedTaskIds: string[];
  newlyBlockedTaskIds: string[];
  membersToNotify: string[];
  taskComparisons: TaskSimulationComparison[];
  criticalChain: string[];
  hasCycle: boolean;
  cycleMessage?: string;
}

export interface SimulationRecord {
  id: string;
  projectId: string;
  selectedTaskId: string;
  delayDays: number;
  scenario: SimulationScenario;
  results: SimulationResult;
  createdAt: string;
}

export interface ProposedTaskChange {
  taskId: string;
  taskTitle: string;
  changeType: 'reschedule' | 'parallelize_dependency' | 'trim_scope' | 'reassign_note';
  description: string;
  newStartDate?: string;
  newDueDate?: string;
  newEstimatedDuration?: number;
  removeDependencyId?: string;
}

export interface RecoveryOption {
  id: string;
  optionCode: 'A' | 'B' | 'C';
  title: string;
  strategyType: 'parallel_execution' | 'revised_timeline' | 'scope_adjustment';
  summary: string;
  affectedTaskIds: string[];
  affectedTaskTitles: string[];
  benefits: string[];
  tradeOffs: string[];
  assumptions: string[];
  estimatedDaysRecovered: number;
  proposedChanges: ProposedTaskChange[];
}

export interface RecoveryPlanRecord {
  id: string;
  simulationId: string;
  projectId: string;
  selectedOptionId: string | null;
  options: RecoveryOption[];
  aiModel: string;
  approvalStatus: 'proposed' | 'approved' | 'dismissed';
  disclaimer: string;
  createdAt: string;
}

export interface RiskItem {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category:
    | 'overdue'
    | 'blocked'
    | 'missing_owner'
    | 'unconfirmed_commitment'
    | 'deadline_conflict'
    | 'zero_slack_chain'
    | 'cycle';
  title: string;
  description: string;
  taskId?: string;
  taskTitle?: string;
  ownerName?: string;
  recommendedAction: string;
}

export interface ActivityLog {
  id: string;
  projectId: string;
  actorName: string;
  action: string;
  category: 'project' | 'meeting' | 'task' | 'dependency' | 'simulation' | 'recovery';
  timestamp: string;
}

export interface DashboardMetrics {
  totalProjects: number;
  activeTasks: number;
  completedTasks: number;
  pendingCommitments: number;
  blockedTasks: number;
  overdueTasks: number;
  upcomingDeadlines: number;
  atRiskTasks: number;
  healthStatus: 'Healthy' | 'At Risk' | 'Critical';
  completionRate: number;
}

export interface ProjectWorkspaceData {
  project: Project;
  members: ProjectMember[];
  tasks: Task[];
  dependencies: TaskDependency[];
  meetings: Meeting[];
  commitments: Commitment[];
  simulations: SimulationRecord[];
  recoveryPlans: RecoveryPlanRecord[];
  activityLogs: ActivityLog[];
  schedule: Record<string, ScheduleNode>;
  risks: RiskItem[];
  metrics: DashboardMetrics;
}

export interface ExtractedTaskDraft {
  tempId: string;
  title: string;
  description: string;
  ownerName: string;
  dueDate: string;
  estimatedDuration: number;
  priority: TaskPriority;
  originalStatement: string;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  dependencyTempIds: string[];
  needsConfirmationReason?: string;
  selected: boolean;
}

export interface ExtractedMeetingAnalysis {
  meetingTitle: string;
  summary: string;
  decisions: string[];
  unresolvedQuestions: string[];
  extractedTasks: ExtractedTaskDraft[];
  aiModel: string;
}

export interface PresenceUser {
  clientId: string;
  userName: string;
  activePage: string;
  joinedAt: string;
}

export type WorkspaceRealtimeEvent =
  | {
      type: 'workspace:updated';
      projectId: string;
      eventType:
        | 'task'
        | 'dependency'
        | 'meeting'
        | 'commitment'
        | 'simulation'
        | 'recovery'
        | 'project';
      actorName: string;
      summary: string;
      timestamp: string;
    }
  | {
      type: 'projects:updated';
      summary: string;
      timestamp: string;
    }
  | {
      type: 'presence:updated';
      projectId: string;
      users: PresenceUser[];
    };

