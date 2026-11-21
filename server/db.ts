import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import crypto from 'node:crypto';
import { addDaysUTC, formatDateUTC } from '../src/engine/scheduler.ts';
import type {
  ActivityLog,
  Commitment,
  Meeting,
  Project,
  ProjectMember,
  RecoveryPlanRecord,
  SimulationRecord,
  Task,
  TaskDependency,
  User,
} from '../src/shared/types.ts';

const DB_PATH = path.resolve(process.cwd(), 'oneflow.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function hasColumn(tableName: string, columnName: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === columnName);
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      avatar_initials TEXT NOT NULL,
      password_hash TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      deadline TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'on_track',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_members (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      transcript TEXT NOT NULL,
      summary TEXT NOT NULL,
      decisions_json TEXT NOT NULL DEFAULT '[]',
      unresolved_questions_json TEXT NOT NULL DEFAULT '[]',
      ai_model TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      owner_id TEXT,
      owner_name TEXT NOT NULL DEFAULT 'Unassigned',
      start_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      estimated_duration INTEGER NOT NULL DEFAULT 1,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'todo',
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commitments (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      task_id TEXT,
      owner_id TEXT,
      owner_name TEXT NOT NULL DEFAULT 'Unassigned',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      due_date TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      original_statement TEXT NOT NULL,
      confidence TEXT NOT NULL DEFAULT 'high',
      confidence_score INTEGER NOT NULL DEFAULT 90,
      approval_status TEXT NOT NULL DEFAULT 'pending_review',
      dependency_hints_json TEXT NOT NULL DEFAULT '[]',
      needs_confirmation_reason TEXT,
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      predecessor_task_id TEXT NOT NULL,
      successor_task_id TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (predecessor_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (successor_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      UNIQUE(predecessor_task_id, successor_task_id)
    );

    CREATE TABLE IF NOT EXISTS simulations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      selected_task_id TEXT NOT NULL,
      delay_days INTEGER NOT NULL,
      scenario TEXT NOT NULL DEFAULT 'custom',
      simulation_results_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recovery_plans (
      id TEXT PRIMARY KEY,
      simulation_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      selected_option_id TEXT,
      recommendations_json TEXT NOT NULL,
      ai_model TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
      approval_status TEXT NOT NULL DEFAULT 'proposed',
      disclaimer TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'task',
      timestamp TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  // Safe schema upgrades for any pre-existing SQLite file
  if (!hasColumn('users', 'password_hash')) {
    db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT`);
  }
  if (!hasColumn('meetings', 'ai_model')) {
    db.exec(`ALTER TABLE meetings ADD COLUMN ai_model TEXT NOT NULL DEFAULT 'gemini-4-hydrogen'`);
  }
  if (!hasColumn('recovery_plans', 'ai_model')) {
    db.exec(`ALTER TABLE recovery_plans ADD COLUMN ai_model TEXT NOT NULL DEFAULT 'gemini-4-hydrogen'`);
  }

  // Clean up any legacy hackathon demo seed row if upgrading an older database
  db.prepare(`DELETE FROM projects WHERE id = 'proj_hackathon_demo'`).run();

  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM projects').get() as { cnt: number };
  if (countRow.cnt === 0) {
    seedInitialProject();
  }
}

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function seedInitialProject(): string {
  const now = new Date().toISOString();
  const today = formatDateUTC(new Date());
  const dPlus2 = addDaysUTC(today, 2);
  const dPlus4 = addDaysUTC(today, 4);
  const dPlus6 = addDaysUTC(today, 6);
  const dPlus7 = addDaysUTC(today, 7);
  const projectId = 'proj_oneflow_launch';

  const users: User[] = [
    {
      id: 'usr_arun',
      name: 'Arun',
      email: 'arun@oneflow.ai',
      role: 'Frontend Lead',
      avatarInitials: 'AR',
      createdAt: now,
    },
    {
      id: 'usr_sanjeev',
      name: 'Sanjeev',
      email: 'sanjeev@oneflow.ai',
      role: 'Backend Lead',
      avatarInitials: 'SA',
      createdAt: now,
    },
    {
      id: 'usr_dharani',
      name: 'Dharani',
      email: 'dharani@oneflow.ai',
      role: 'QA & Release Engineering',
      avatarInitials: 'DH',
      createdAt: now,
    },
    {
      id: 'usr_daresh',
      name: 'Daresh',
      email: 'daresh@oneflow.ai',
      role: 'Product Lead',
      avatarInitials: 'DA',
      createdAt: now,
    },
  ];

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, role, avatar_initials, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const u of users) {
    insertUser.run(u.id, u.name, u.email, u.role, u.avatarInitials, u.createdAt);
  }

  db.prepare(`
    INSERT OR REPLACE INTO projects (id, name, description, deadline, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    'OneFlow AI Product Launch',
    'Production release execution workspace coordinating frontend delivery, backend APIs, end-to-end QA, and stakeholder launch readiness.',
    dPlus7,
    'at_risk',
    now
  );

  db.prepare('DELETE FROM project_members WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM task_dependencies WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM commitments WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM recovery_plans WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM simulations WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM tasks WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM meetings WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM activity_logs WHERE project_id = ?').run(projectId);

  const insertMember = db.prepare(`
    INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)
  `);
  for (const u of users) {
    insertMember.run(`pm_${u.id}`, projectId, u.id, u.role);
  }

  const kickoffTranscript = `Daresh: "We need to complete our OneFlow AI release deliverables before the launch window."
Arun: "I'll complete the frontend dashboard by day 2."
Sanjeev: "I'll integrate the backend APIs once the frontend structure is ready."
Dharani: "I'll begin testing after the frontend and backend integration is complete."
Daresh: "I'll prepare the release briefing and coordinate final deployment."`;

  db.prepare(`
    INSERT INTO meetings (id, project_id, title, transcript, summary, decisions_json, unresolved_questions_json, ai_model, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'mtg_launch_kickoff',
    projectId,
    'Sprint Kickoff & Commitment Alignment',
    kickoffTranscript,
    'Team aligned on the critical build sequence for the product release: frontend dashboard first, followed by backend API integration, end-to-end QA verification, and final deployment coordination.',
    JSON.stringify([
      `Complete core release deliverables prior to the ${dPlus7} target deadline.`,
      'Backend API integration waits for frontend dashboard structure readiness.',
      'QA testing begins immediately after frontend and backend integration completes.',
    ]),
    JSON.stringify([
      'Should API payload schemas be frozen in an OpenAPI spec early so backend integration can overlap with UI polish?',
    ]),
    'gemini-4-hydrogen',
    now
  );

  const tasks: Task[] = [
    {
      id: 'task_fe_dashboard',
      projectId,
      title: 'Frontend Dashboard',
      description: 'Build the Execution Twin dashboard, Kanban board, and responsive workspace shell.',
      ownerId: 'usr_arun',
      ownerName: 'Arun',
      startDate: today,
      dueDate: dPlus2,
      estimatedDuration: 2,
      priority: 'critical',
      status: 'in_progress',
      createdAt: now,
    },
    {
      id: 'task_api_integration',
      projectId,
      title: 'Backend API Integration',
      description: 'Connect REST endpoints for transcripts, dependency graph, and simulation engine once frontend structure is ready.',
      ownerId: 'usr_sanjeev',
      ownerName: 'Sanjeev',
      startDate: dPlus2,
      dueDate: dPlus4,
      estimatedDuration: 2,
      priority: 'high',
      status: 'todo',
      createdAt: now,
    },
    {
      id: 'task_system_qa',
      projectId,
      title: 'System Testing & QA',
      description: 'Execute end-to-end regression, dependency validation, and responsive checks after integration.',
      ownerId: 'usr_dharani',
      ownerName: 'Dharani',
      startDate: dPlus4,
      dueDate: dPlus6,
      estimatedDuration: 2,
      priority: 'high',
      status: 'todo',
      createdAt: now,
    },
    {
      id: 'task_release_brief',
      projectId,
      title: 'Release Briefing & Architecture Deck',
      description: 'Prepare launch narrative, stakeholder walkthrough guide, and architecture documentation in parallel.',
      ownerId: 'usr_daresh',
      ownerName: 'Daresh',
      startDate: today,
      dueDate: dPlus2,
      estimatedDuration: 2,
      priority: 'medium',
      status: 'in_progress',
      createdAt: now,
    },
    {
      id: 'task_final_launch',
      projectId,
      title: 'Final Production Launch & Sign-off',
      description: 'Verify production health checks, confirm release readiness, and complete final launch.',
      ownerId: 'usr_daresh',
      ownerName: 'Daresh',
      startDate: dPlus6,
      dueDate: dPlus7,
      estimatedDuration: 1,
      priority: 'critical',
      status: 'todo',
      createdAt: now,
    },
  ];

  const insertTask = db.prepare(`
    INSERT INTO tasks (id, project_id, title, description, owner_id, owner_name, start_date, due_date, estimated_duration, priority, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of tasks) {
    insertTask.run(
      t.id,
      t.projectId,
      t.title,
      t.description,
      t.ownerId,
      t.ownerName,
      t.startDate,
      t.dueDate,
      t.estimatedDuration,
      t.priority,
      t.status,
      t.createdAt
    );
  }

  const deps: TaskDependency[] = [
    {
      id: 'dep_fe_api',
      projectId,
      predecessorTaskId: 'task_fe_dashboard',
      successorTaskId: 'task_api_integration',
    },
    {
      id: 'dep_api_qa',
      projectId,
      predecessorTaskId: 'task_api_integration',
      successorTaskId: 'task_system_qa',
    },
    {
      id: 'dep_qa_sub',
      projectId,
      predecessorTaskId: 'task_system_qa',
      successorTaskId: 'task_final_launch',
    },
    {
      id: 'dep_deck_sub',
      projectId,
      predecessorTaskId: 'task_release_brief',
      successorTaskId: 'task_final_launch',
    },
  ];

  const insertDep = db.prepare(`
    INSERT INTO task_dependencies (id, project_id, predecessor_task_id, successor_task_id)
    VALUES (?, ?, ?, ?)
  `);
  for (const d of deps) {
    insertDep.run(d.id, d.projectId, d.predecessorTaskId, d.successorTaskId);
  }

  const commitments: Commitment[] = [
    {
      id: 'cmt_arun_fe',
      meetingId: 'mtg_launch_kickoff',
      projectId,
      taskId: 'task_fe_dashboard',
      ownerId: 'usr_arun',
      ownerName: 'Arun',
      title: 'Complete Frontend Dashboard',
      description: 'Deliver the core Execution Twin dashboard interface by deadline.',
      dueDate: dPlus2,
      priority: 'critical',
      originalStatement: 'Arun: "I\'ll complete the frontend dashboard by day 2."',
      confidence: 'high',
      confidenceScore: 96,
      approvalStatus: 'approved',
      dependencyHints: [],
    },
    {
      id: 'cmt_sanjeev_api',
      meetingId: 'mtg_launch_kickoff',
      projectId,
      taskId: 'task_api_integration',
      ownerId: 'usr_sanjeev',
      ownerName: 'Sanjeev',
      title: 'Integrate Backend APIs',
      description: 'Connect backend routes once frontend structure is ready.',
      dueDate: dPlus4,
      priority: 'high',
      originalStatement: 'Sanjeev: "I\'ll integrate the backend APIs once the frontend structure is ready."',
      confidence: 'high',
      confidenceScore: 94,
      approvalStatus: 'approved',
      dependencyHints: ['Complete Frontend Dashboard'],
    },
    {
      id: 'cmt_dharani_qa',
      meetingId: 'mtg_launch_kickoff',
      projectId,
      taskId: 'task_system_qa',
      ownerId: 'usr_dharani',
      ownerName: 'Dharani',
      title: 'Run End-to-End System Testing',
      description: 'Begin full QA verification after frontend and backend integration.',
      dueDate: dPlus6,
      priority: 'high',
      originalStatement: 'Dharani: "I\'ll begin testing after the frontend and backend integration is complete."',
      confidence: 'high',
      confidenceScore: 95,
      approvalStatus: 'approved',
      dependencyHints: ['Integrate Backend APIs'],
    },
    {
      id: 'cmt_daresh_launch',
      meetingId: 'mtg_launch_kickoff',
      projectId,
      taskId: 'task_final_launch',
      ownerId: 'usr_daresh',
      ownerName: 'Daresh',
      title: 'Prepare Release Briefing & Coordinate Launch',
      description: 'Deliver final release briefing and coordinate production deployment.',
      dueDate: dPlus7,
      priority: 'critical',
      originalStatement: 'Daresh: "I\'ll prepare the release briefing and coordinate final deployment."',
      confidence: 'high',
      confidenceScore: 93,
      approvalStatus: 'approved',
      dependencyHints: ['Run End-to-End System Testing'],
    },
    {
      id: 'cmt_pending_schema',
      meetingId: 'mtg_launch_kickoff',
      projectId,
      taskId: null,
      ownerId: 'usr_sanjeev',
      ownerName: 'Sanjeev',
      title: 'Freeze Shared JSON Schema Contract',
      description: 'Early API contract freeze to decouple frontend and backend integration.',
      dueDate: addDaysUTC(today, 1),
      priority: 'medium',
      originalStatement: 'Derived follow-up: Lock API response schema early so integration can start in parallel.',
      confidence: 'needs_confirmation',
      confidenceScore: 68,
      approvalStatus: 'pending_review',
      dependencyHints: [],
      needsConfirmationReason: 'Implied during discussion; owner and due date require confirmation.',
    },
  ];

  const insertCmt = db.prepare(`
    INSERT INTO commitments (
      id, meeting_id, project_id, task_id, owner_id, owner_name, title, description,
      due_date, priority, original_statement, confidence, confidence_score,
      approval_status, dependency_hints_json, needs_confirmation_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of commitments) {
    insertCmt.run(
      c.id,
      c.meetingId,
      c.projectId,
      c.taskId,
      c.ownerId,
      c.ownerName,
      c.title,
      c.description,
      c.dueDate,
      c.priority,
      c.originalStatement,
      c.confidence,
      c.confidenceScore,
      c.approvalStatus,
      JSON.stringify(c.dependencyHints),
      c.needsConfirmationReason ?? null
    );
  }

  const insertLog = db.prepare(`
    INSERT INTO activity_logs (id, project_id, actor_name, action, category, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertLog.run(
    'log_seed_1',
    projectId,
    'Daresh',
    'Created project "OneFlow AI Product Launch"',
    'project',
    now
  );
  insertLog.run(
    'log_seed_2',
    projectId,
    'OneFlow Engine',
    'Mapped 4 dependency links from "Sprint Kickoff & Commitment Alignment"',
    'meeting',
    now
  );
  insertLog.run(
    'log_seed_3',
    projectId,
    'Arun',
    'Started task "Frontend Dashboard"',
    'task',
    now
  );

  return projectId;
}

// Query Helpers
export function listProjects(): Project[] {
  const rows = db
    .prepare('SELECT id, name, description, deadline, status, created_at FROM projects ORDER BY created_at DESC')
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapProject);
}

export function listUserProjects(userId: string): Project[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT p.id, p.name, p.description, p.deadline, p.status, p.created_at
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = ?
       ORDER BY p.created_at DESC`
    )
    .all(userId) as Array<Record<string, unknown>>;
  return rows.map(mapProject);
}

export function isProjectMember(projectId: string, userId: string): boolean {
  const row = db
    .prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1')
    .get(projectId, userId) as { id: string } | undefined;
  return Boolean(row);
}

export function getProject(projectId: string): Project | null {
  const row = db
    .prepare('SELECT id, name, description, deadline, status, created_at FROM projects WHERE id = ?')
    .get(projectId) as Record<string, unknown> | undefined;
  return row ? mapProject(row) : null;
}

export function getProjectMembers(projectId: string): ProjectMember[] {
  const rows = db
    .prepare(
      `SELECT pm.id, pm.project_id, pm.user_id, pm.role, u.name, u.email, u.avatar_initials
       FROM project_members pm
       JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = ?
       ORDER BY u.name ASC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    userId: String(r.user_id),
    name: String(r.name),
    email: String(r.email),
    role: String(r.role),
    avatarInitials: String(r.avatar_initials),
  }));
}

export function getProjectTasks(projectId: string): Task[] {
  const rows = db
    .prepare(
      `SELECT id, project_id, title, description, owner_id, owner_name, start_date, due_date, estimated_duration, priority, status, created_at
       FROM tasks WHERE project_id = ? ORDER BY start_date ASC, created_at ASC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map(mapTask);
}

export function getProjectDependencies(projectId: string): TaskDependency[] {
  const rows = db
    .prepare(
      `SELECT id, project_id, predecessor_task_id, successor_task_id
       FROM task_dependencies WHERE project_id = ?`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    predecessorTaskId: String(r.predecessor_task_id),
    successorTaskId: String(r.successor_task_id),
  }));
}

export function getProjectMeetings(projectId: string): Meeting[] {
  const rows = db
    .prepare(
      `SELECT id, project_id, title, transcript, summary, decisions_json, unresolved_questions_json, ai_model, created_at
       FROM meetings WHERE project_id = ? ORDER BY created_at DESC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    title: String(r.title),
    transcript: String(r.transcript),
    summary: String(r.summary),
    decisions: safeJsonArray(String(r.decisions_json)),
    unresolvedQuestions: safeJsonArray(String(r.unresolved_questions_json)),
    aiModel: String(r.ai_model || 'gemini-4-hydrogen'),
    createdAt: String(r.created_at),
  }));
}

export function getProjectCommitments(projectId: string): Commitment[] {
  const rows = db
    .prepare(
      `SELECT id, meeting_id, project_id, task_id, owner_id, owner_name, title, description, due_date, priority,
              original_statement, confidence, confidence_score, approval_status, dependency_hints_json, needs_confirmation_reason
       FROM commitments WHERE project_id = ? ORDER BY rowid DESC`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    meetingId: String(r.meeting_id),
    projectId: String(r.project_id),
    taskId: r.task_id ? String(r.task_id) : null,
    ownerId: r.owner_id ? String(r.owner_id) : null,
    ownerName: String(r.owner_name),
    title: String(r.title),
    description: String(r.description),
    dueDate: String(r.due_date),
    priority: (r.priority as Commitment['priority']) || 'medium',
    originalStatement: String(r.original_statement),
    confidence: (r.confidence as Commitment['confidence']) || 'high',
    confidenceScore: Number(r.confidence_score ?? 85),
    approvalStatus: (r.approval_status as Commitment['approvalStatus']) || 'pending_review',
    dependencyHints: safeJsonArray(String(r.dependency_hints_json)),
    needsConfirmationReason: r.needs_confirmation_reason
      ? String(r.needs_confirmation_reason)
      : undefined,
  }));
}

export function getProjectSimulations(projectId: string): SimulationRecord[] {
  const rows = db
    .prepare(
      `SELECT id, project_id, selected_task_id, delay_days, scenario, simulation_results_json, created_at
       FROM simulations WHERE project_id = ? ORDER BY created_at DESC LIMIT 20`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    selectedTaskId: String(r.selected_task_id),
    delayDays: Number(r.delay_days),
    scenario: (r.scenario as SimulationRecord['scenario']) || 'custom',
    results: JSON.parse(String(r.simulation_results_json)),
    createdAt: String(r.created_at),
  }));
}

export function getProjectRecoveryPlans(projectId: string): RecoveryPlanRecord[] {
  const rows = db
    .prepare(
      `SELECT id, simulation_id, project_id, selected_option_id, recommendations_json, ai_model, approval_status, disclaimer, created_at
       FROM recovery_plans WHERE project_id = ? ORDER BY created_at DESC LIMIT 20`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    simulationId: String(r.simulation_id),
    projectId: String(r.project_id),
    selectedOptionId: r.selected_option_id ? String(r.selected_option_id) : null,
    options: JSON.parse(String(r.recommendations_json)),
    aiModel: String(r.ai_model || 'gemini-4-hydrogen'),
    approvalStatus: (r.approval_status as RecoveryPlanRecord['approvalStatus']) || 'proposed',
    disclaimer: String(r.disclaimer),
    createdAt: String(r.created_at),
  }));
}

export function getProjectActivityLogs(projectId: string): ActivityLog[] {
  const rows = db
    .prepare(
      `SELECT id, project_id, actor_name, action, category, timestamp
       FROM activity_logs WHERE project_id = ? ORDER BY timestamp DESC LIMIT 50`
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    actorName: String(r.actor_name),
    action: String(r.action),
    category: (r.category as ActivityLog['category']) || 'task',
    timestamp: String(r.timestamp),
  }));
}

export function appendActivityLog(
  projectId: string,
  actorName: string,
  action: string,
  category: ActivityLog['category'] = 'task'
): void {
  db.prepare(
    `INSERT INTO activity_logs (id, project_id, actor_name, action, category, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(uid('log'), projectId, actorName, action, category, new Date().toISOString());
}

function mapProject(r: Record<string, unknown>): Project {
  return {
    id: String(r.id),
    name: String(r.name),
    description: String(r.description),
    deadline: String(r.deadline),
    status: (r.status as Project['status']) || 'on_track',
    createdAt: String(r.created_at),
  };
}

function mapTask(r: Record<string, unknown>): Task {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    title: String(r.title),
    description: String(r.description),
    ownerId: r.owner_id ? String(r.owner_id) : null,
    ownerName: String(r.owner_name),
    startDate: String(r.start_date),
    dueDate: String(r.due_date),
    estimatedDuration: Number(r.estimated_duration ?? 1),
    priority: (r.priority as Task['priority']) || 'medium',
    status: (r.status as Task['status']) || 'todo',
    createdAt: String(r.created_at),
  };
}

function safeJsonArray(val: string): string[] {
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
