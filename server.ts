import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { z } from 'zod';
import {
  analyzeProjectRisks,
  calculateScheduleAndCriticalPath,
  computeDashboardMetrics,
  detectCycle,
  simulateDelay,
} from './src/engine/scheduler.ts';
import type { RecoveryOption, User } from './src/shared/types.ts';
import {
  appendActivityLog,
  db,
  getProject,
  getProjectActivityLogs,
  getProjectCommitments,
  getProjectDependencies,
  getProjectMeetings,
  getProjectMembers,
  getProjectRecoveryPlans,
  getProjectSimulations,
  getProjectTasks,
  initDatabase,
  isProjectMember,
  listProjects,
  listUserProjects,
  uid,
} from './server/db.ts';
import {
  authenticateUserAccount,
  extractBearerToken,
  registerUserAccount,
  revokeSessionToken,
  verifySessionToken,
} from './server/auth.ts';
import {
  AiServiceError,
  GEMINI_MODEL,
  analyzeMeetingWithAI,
  generateRecoveryStrategies,
  generateRiskInsights,
  isGeminiConfigured,
} from './server/ai.ts';
import { parseUploadedMeetingFile, sanitizeTranscriptText } from './server/fileParser.ts';
import {
  broadcastProjectUpdate,
  broadcastProjectsChanged,
  getActiveConnectionCount,
  initRealtimeServer,
} from './server/realtime.ts';

const PORT = Number(process.env.PORT) || 3000;

initDatabase();

const app = express();
app.use(express.json({ limit: '4mb' }));

// Health check endpoint for Cloud Run / production deployments
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    status: 'healthy',
    database: 'connected',
    aiConfigured: isGeminiConfigured(),
    model: GEMINI_MODEL,
    activeClients: getActiveConnectionCount(),
    timestamp: new Date().toISOString(),
  });
});

// Status endpoint
app.get('/api/status', (_req, res) => {
  res.json({
    hasGeminiKey: isGeminiConfigured(),
    model: GEMINI_MODEL,
    workspaceType: 'Live Execution Twin Workspace',
  });
});

// Auth Helpers & Middleware
const requireAuth: express.RequestHandler = (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);
  const user = verifySessionToken(token);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in or register.' });
    return;
  }
  res.locals.user = user;
  res.locals.token = token;
  next();
};

function getAuthUser(res: express.Response): User {
  return res.locals.user as User;
}

function requireMembership(projectId: string, userId: string, res: express.Response): boolean {
  if (!isProjectMember(projectId, userId)) {
    res.status(403).json({ error: 'You do not have access to this project.' });
    return false;
  }
  return true;
}

// Auth Endpoints
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(80),
  email: z.string().trim().email('Please enter a valid email address.').max(120),
  role: z.string().trim().min(1).max(80).default('Product Lead'),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
});

app.post('/api/auth/register', (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration details.' });
    return;
  }

  const result = registerUserAccount(parsed.data);
  if ('error' in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(201).json({ token: result.token, user: result.user });
});

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

app.post('/api/auth/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid login credentials.' });
    return;
  }

  const result = authenticateUserAccount(parsed.data);
  if (!result) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  res.json({ token: result.token, user: result.user });
});

app.post('/api/auth/logout', (req, res) => {
  const token = extractBearerToken(req.headers.authorization);
  revokeSessionToken(token);
  res.json({ loggedOut: true });
});

app.get('/api/auth/me', requireAuth, (_req, res) => {
  res.json({ user: getAuthUser(res) });
});

// List Projects
app.get('/api/projects', requireAuth, (_req, res) => {
  const user = getAuthUser(res);
  const projects = listUserProjects(user.id);
  res.json({ projects });
});

// Create Project
const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).default(''),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  teamMembers: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        role: z.string().trim().min(1).max(80).default('Contributor'),
        email: z.string().trim().email().optional().or(z.literal('')),
      })
    )
    .min(1),
});

app.post('/api/projects', requireAuth, (req, res) => {
  const user = getAuthUser(res);
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid project data.' });
    return;
  }

  const { name, description, deadline, teamMembers } = parsed.data;
  const projectId = uid('proj');
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO projects (id, name, description, deadline, status, created_at)
     VALUES (?, ?, ?, ?, 'on_track', ?)`
  ).run(projectId, name, description, deadline, now);

  const insertUser = db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, role, avatar_initials, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const findUserByEmail = db.prepare(`SELECT id FROM users WHERE email = ?`);
  const insertMember = db.prepare(
    `INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`
  );

  const addedUserIds = new Set<string>();
  for (const m of teamMembers) {
    const email =
      m.email && m.email.length > 0
        ? m.email.toLowerCase()
        : `${m.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.${projectId.slice(-4)}@oneflow.local`;
    const existing = findUserByEmail.get(email) as { id: string } | undefined;
    const userId = existing ? existing.id : uid('usr');
    if (!existing) {
      const initials =
        m.name
          .split(/\s+/)
          .map((p) => p[0] || '')
          .join('')
          .toUpperCase()
          .slice(0, 2) || 'TM';
      insertUser.run(userId, m.name, email, m.role, initials, now);
    }
    if (!addedUserIds.has(userId)) {
      insertMember.run(uid('pm'), projectId, userId, m.role);
      addedUserIds.add(userId);
    }
  }

  if (!addedUserIds.has(user.id)) {
    insertMember.run(uid('pm'), projectId, user.id, user.role);
  }

  appendActivityLog(projectId, user.name, `Created project "${name}"`, 'project');
  broadcastProjectsChanged(`Created project "${name}"`);
  res.status(201).json({ project: getProject(projectId) });
});

// Update Project
app.patch('/api/projects/:id', requireAuth, (req, res) => {
  const user = getAuthUser(res);
  const project = getProject(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  if (!requireMembership(project.id, user.id, res)) return;

  const schema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.enum(['on_track', 'at_risk', 'critical', 'completed']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid project update fields.' });
    return;
  }

  const next = {
    name: parsed.data.name ?? project.name,
    description: parsed.data.description ?? project.description,
    deadline: parsed.data.deadline ?? project.deadline,
    status: parsed.data.status ?? project.status,
  };
  db.prepare(`UPDATE projects SET name = ?, description = ?, deadline = ?, status = ? WHERE id = ?`).run(
    next.name,
    next.description,
    next.deadline,
    next.status,
    project.id
  );
  appendActivityLog(project.id, user.name, `Updated project settings for "${next.name}"`, 'project');
  broadcastProjectsChanged(`Updated project "${next.name}"`);
  broadcastProjectUpdate(project.id, 'project', user.name, `Updated settings for "${next.name}"`);
  res.json({ project: getProject(project.id) });
});

// Delete Project
app.delete('/api/projects/:id', requireAuth, (req, res) => {
  const user = getAuthUser(res);
  const project = getProject(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  if (!requireMembership(project.id, user.id, res)) return;

  const userProjects = listUserProjects(user.id);
  const all = listProjects();
  if (all.length <= 1 || userProjects.length <= 1) {
    res.status(400).json({ error: 'At least one project must remain in your workspace.' });
    return;
  }
  db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
  broadcastProjectsChanged(`Deleted project "${project.name}"`);
  res.json({ deleted: true });
});

// Full Project Dashboard & Execution Twin State
app.get('/api/projects/:id/dashboard', requireAuth, (req, res) => {
  const user = getAuthUser(res);
  const project = getProject(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  if (!requireMembership(project.id, user.id, res)) return;

  const allProjects = listUserProjects(user.id);
  const members = getProjectMembers(project.id);
  const tasks = getProjectTasks(project.id);
  const dependencies = getProjectDependencies(project.id);
  const meetings = getProjectMeetings(project.id);
  const commitments = getProjectCommitments(project.id);
  const simulations = getProjectSimulations(project.id);
  const recoveryPlans = getProjectRecoveryPlans(project.id);
  const activityLogs = getProjectActivityLogs(project.id);

  const { schedule } = calculateScheduleAndCriticalPath(tasks, dependencies, project.deadline);
  const risks = analyzeProjectRisks(tasks, dependencies, commitments, project.deadline, members);
  const metrics = computeDashboardMetrics(allProjects, tasks, commitments, schedule, risks);

  res.json({
    project,
    members,
    tasks,
    dependencies,
    meetings,
    commitments,
    simulations,
    recoveryPlans,
    activityLogs,
    schedule,
    risks,
    metrics,
  });
});

// File upload for TXT/MD/PDF meeting notes
app.post('/api/meetings/upload', requireAuth, (req, res) => {
  const schema = z.object({
    fileName: z.string().min(1).max(200),
    mimeType: z.string().max(100).default('text/plain'),
    base64Content: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid file upload payload.' });
    return;
  }
  try {
    const result = parseUploadedMeetingFile(parsed.data);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse meeting file.';
    res.status(400).json({ error: message });
  }
});

// Analyze Meeting Transcript (Live Gemini AI)
app.post('/api/projects/:id/meetings/analyze', requireAuth, async (req, res) => {
  const user = getAuthUser(res);
  const project = getProject(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  if (!requireMembership(project.id, user.id, res)) return;

  const schema = z.object({
    title: z.string().trim().max(150).optional(),
    transcript: z.string().max(30000).default(''),
    pdfBase64: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid transcript payload.' });
    return;
  }

  const cleanTranscript = sanitizeTranscriptText(parsed.data.transcript);
  if (!cleanTranscript && !parsed.data.pdfBase64) {
    res.status(400).json({ error: 'Please paste a meeting transcript or upload a valid file.' });
    return;
  }

  try {
    const members = getProjectMembers(project.id);
    const analysis = await analyzeMeetingWithAI({
      transcript: cleanTranscript,
      pdfBase64: parsed.data.pdfBase64,
      project,
      members,
    });

    if (parsed.data.title) {
      analysis.meetingTitle = parsed.data.title;
    }

    const meetingId = uid('mtg');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO meetings (id, project_id, title, transcript, summary, decisions_json, unresolved_questions_json, ai_model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      meetingId,
      project.id,
      analysis.meetingTitle,
      cleanTranscript || '[PDF Meeting Notes Uploaded]',
      analysis.summary,
      JSON.stringify(analysis.decisions),
      JSON.stringify(analysis.unresolvedQuestions),
      analysis.aiModel,
      now
    );

    appendActivityLog(
      project.id,
      'Gemini AI',
      `Analyzed meeting "${analysis.meetingTitle}" (${analysis.extractedTasks.length} draft commitments)`,
      'meeting'
    );
    broadcastProjectUpdate(
      project.id,
      'meeting',
      'Gemini AI',
      `Analyzed "${analysis.meetingTitle}" (${analysis.extractedTasks.length} drafts)`
    );

    res.json({ meetingId, analysis });
  } catch (err) {
    const status = err instanceof AiServiceError ? err.statusCode : 502;
    const message = err instanceof Error ? err.message : 'Meeting analysis failed.';
    res.status(status).json({ error: message });
  }
});

// Human Review & Approval -> Generate Execution Plan (Tasks + Commitments + Dependencies)
app.post('/api/meetings/:id/approve', requireAuth, (req, res) => {
  const user = getAuthUser(res);
  const mtgRow = db
    .prepare('SELECT id, project_id, title FROM meetings WHERE id = ?')
    .get(req.params.id) as { id: string; project_id: string; title: string } | undefined;

  if (!mtgRow) {
    res.status(404).json({ error: 'Meeting not found.' });
    return;
  }
  if (!requireMembership(mtgRow.project_id, user.id, res)) return;

  const draftSchema = z.object({
    tempId: z.string(),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).default(''),
    ownerName: z.string().trim().min(1).max(80),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    estimatedDuration: z.number().int().min(1).max(60).default(2),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    originalStatement: z.string().default(''),
    confidence: z.enum(['high', 'medium', 'needs_confirmation']).default('high'),
    confidenceScore: z.number().int().min(0).max(100).default(85),
    dependencyTempIds: z.array(z.string()).default([]),
    needsConfirmationReason: z.string().optional(),
    selected: z.boolean().default(true),
  });

  const parsed = z.object({ drafts: z.array(draftSchema).min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid approved task drafts.' });
    return;
  }

  const projectId = mtgRow.project_id;
  const members = getProjectMembers(projectId);
  const memberByName = new Map(members.map((m) => [m.name.toLowerCase(), m]));
  const now = new Date().toISOString();
  const approvedDrafts = parsed.data.drafts.filter((d) => d.selected);

  if (approvedDrafts.length === 0) {
    res.status(400).json({ error: 'Select at least one commitment to approve into the Execution Plan.' });
    return;
  }

  const tempToTaskId = new Map<string, string>();
  const createdTaskIds: string[] = [];

  const insertTask = db.prepare(
    `INSERT INTO tasks (id, project_id, title, description, owner_id, owner_name, start_date, due_date, estimated_duration, priority, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertCommitment = db.prepare(
    `INSERT INTO commitments (
      id, meeting_id, project_id, task_id, owner_id, owner_name, title, description, due_date,
      priority, original_statement, confidence, confidence_score, approval_status,
      dependency_hints_json, needs_confirmation_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)`
  );

  for (const draft of approvedDrafts) {
    const taskId = uid('task');
    tempToTaskId.set(draft.tempId, taskId);
    createdTaskIds.push(taskId);

    const matchedMember = memberByName.get(draft.ownerName.toLowerCase());
    const ownerId = matchedMember ? matchedMember.userId : null;
    const ownerName = matchedMember ? matchedMember.name : draft.ownerName;

    const dueMs = Date.parse(`${draft.dueDate}T00:00:00Z`);
    const startMs = dueMs - Math.max(1, draft.estimatedDuration) * 86400000;
    const startDate = new Date(startMs).toISOString().slice(0, 10);

    insertTask.run(
      taskId,
      projectId,
      draft.title,
      draft.description,
      ownerId,
      ownerName,
      startDate,
      draft.dueDate,
      draft.estimatedDuration,
      draft.priority,
      'todo',
      now
    );

    insertCommitment.run(
      uid('cmt'),
      mtgRow.id,
      projectId,
      taskId,
      ownerId,
      ownerName,
      draft.title,
      draft.description,
      draft.dueDate,
      draft.priority,
      draft.originalStatement,
      draft.confidence,
      draft.confidenceScore,
      JSON.stringify(draft.dependencyTempIds),
      draft.needsConfirmationReason ?? null
    );
  }

  for (const draft of parsed.data.drafts.filter((d) => !d.selected)) {
    const matchedMember = memberByName.get(draft.ownerName.toLowerCase());
    db.prepare(
      `INSERT INTO commitments (
        id, meeting_id, project_id, task_id, owner_id, owner_name, title, description, due_date,
        priority, original_statement, confidence, confidence_score, approval_status,
        dependency_hints_json, needs_confirmation_reason
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rejected', ?, ?)`
    ).run(
      uid('cmt'),
      mtgRow.id,
      projectId,
      matchedMember ? matchedMember.userId : null,
      draft.ownerName,
      draft.title,
      draft.description,
      draft.dueDate,
      draft.priority,
      draft.originalStatement,
      draft.confidence,
      draft.confidenceScore,
      JSON.stringify(draft.dependencyTempIds),
      draft.needsConfirmationReason ?? null
    );
  }

  const currentTasks = getProjectTasks(projectId);
  const currentDeps = getProjectDependencies(projectId);
  const insertDep = db.prepare(
    `INSERT OR IGNORE INTO task_dependencies (id, project_id, predecessor_task_id, successor_task_id)
     VALUES (?, ?, ?, ?)`
  );

  for (const draft of approvedDrafts) {
    const succId = tempToTaskId.get(draft.tempId);
    if (!succId) continue;
    for (const predTemp of draft.dependencyTempIds) {
      const predId = tempToTaskId.get(predTemp);
      if (!predId || predId === succId) continue;
      const cycle = detectCycle(currentTasks, currentDeps, {
        predecessorTaskId: predId,
        successorTaskId: succId,
      });
      if (!cycle.hasCycle) {
        const depId = uid('dep');
        insertDep.run(depId, projectId, predId, succId);
        currentDeps.push({
          id: depId,
          projectId,
          predecessorTaskId: predId,
          successorTaskId: succId,
        });
      }
    }
  }

  appendActivityLog(
    projectId,
    'Human Reviewer',
    `Approved ${createdTaskIds.length} commitment(s) from "${mtgRow.title}" into Execution Plan`,
    'meeting'
  );
  broadcastProjectUpdate(
    projectId,
    'commitment',
    'Human Reviewer',
    `Approved ${createdTaskIds.length} commitment(s) into Execution Plan`
  );

  res.status(201).json({ createdTaskIds });
});

// Approve or Reject an existing pending Commitment
app.patch('/api/commitments/:id', requireAuth, (req, res) => {
  const user = getAuthUser(res);
  const row = db
    .prepare('SELECT * FROM commitments WHERE id = ?')
    .get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Commitment not found.' });
    return;
  }
  if (!requireMembership(String(row.project_id), user.id, res)) return;

  const schema = z.object({
    approvalStatus: z.enum(['pending_review', 'approved', 'rejected']).optional(),
    title: z.string().trim().min(1).max(160).optional(),
    ownerName: z.string().trim().min(1).max(80).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid commitment update.' });
    return;
  }

  const projectId = String(row.project_id);
  const nextTitle = parsed.data.title ?? String(row.title);
  const nextOwner = parsed.data.ownerName ?? String(row.owner_name);
  const nextDue = parsed.data.dueDate ?? String(row.due_date);
  const nextStatus = parsed.data.approvalStatus ?? String(row.approval_status);

  let taskId = row.task_id ? String(row.task_id) : null;

  if (nextStatus === 'approved' && !taskId) {
    taskId = uid('task');
    const members = getProjectMembers(projectId);
    const matched = members.find((m) => m.name.toLowerCase() === nextOwner.toLowerCase());
    const dueMs = Date.parse(`${nextDue}T00:00:00Z`);
    const startDate = new Date(dueMs - 86400000).toISOString().slice(0, 10);

    db.prepare(
      `INSERT INTO tasks (id, project_id, title, description, owner_id, owner_name, start_date, due_date, estimated_duration, priority, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'todo', ?)`
    ).run(
      taskId,
      projectId,
      nextTitle,
      String(row.description),
      matched ? matched.userId : null,
      matched ? matched.name : nextOwner,
      startDate,
      nextDue,
      String(row.priority || 'medium'),
      new Date().toISOString()
    );
  }

  db.prepare(
    `UPDATE commitments SET title = ?, owner_name = ?, due_date = ?, approval_status = ?, task_id = ? WHERE id = ?`
  ).run(nextTitle, nextOwner, nextDue, nextStatus, taskId, req.params.id);

  appendActivityLog(
    projectId,
    'Human Reviewer',
    `Marked commitment "${nextTitle}" as ${nextStatus.replace('_', ' ')}`,
    'task'
  );
  broadcastProjectUpdate(
    projectId,
    'commitment',
    'Human Reviewer',
    `Marked "${nextTitle}" as ${nextStatus.replace('_', ' ')}`
  );

  res.json({ updated: true, taskId });
});

// Tasks CRUD
app.post('/api/projects/:id/tasks', requireAuth, (req, res) => {
  const user = getAuthUser(res);
  const project = getProject(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  if (!requireMembership(project.id, user.id, res)) return;

  const schema = z.object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).default(''),
    ownerName: z.string().trim().min(1).max(80).default('Unassigned'),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    estimatedDuration: z.number().int().min(1).max(60).default(2),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    status: z.enum(['todo', 'in_progress', 'blocked', 'completed']).default('todo'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid task payload.' });
    return;
  }

  const members = getProjectMembers(project.id);
  const matched = members.find(
    (m) => m.name.toLowerCase() === parsed.data.ownerName.toLowerCase()
  );

  const taskId = uid('task');
  db.prepare(
    `INSERT INTO tasks (id, project_id, title, description, owner_id, owner_name, start_date, due_date, estimated_duration, priority, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    taskId,
    project.id,
    parsed.data.title,
    parsed.data.description,
    matched ? matched.userId : null,
    matched ? matched.name : parsed.data.ownerName,
    parsed.data.startDate,
    parsed.data.dueDate,
    parsed.data.estimatedDuration,
    parsed.data.priority,
    parsed.data.status,
    new Date().toISOString()
  );

  appendActivityLog(project.id, parsed.data.ownerName, `Created task "${parsed.data.title}"`, 'task');
  broadcastProjectUpdate(
    project.id,
    'task',
    parsed.data.ownerName,
    `Created task "${parsed.data.title}"`
  );
  res.status(201).json({ taskId });
});

app.patch('/api/tasks/:id', requireAuth, (req, res) => {
  const user = getAuthUser(res);
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }
  if (!requireMembership(String(existing.project_id), user.id, res)) return;

  const schema = z.object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(1000).optional(),
    ownerName: z.string().trim().min(1).max(80).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    estimatedDuration: z.number().int().min(1).max(60).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    status: z.enum(['todo', 'in_progress', 'blocked', 'completed']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid task update.' });
    return;
  }

  const projectId = String(existing.project_id);
  const members = getProjectMembers(projectId);
  const nextOwnerName = parsed.data.ownerName ?? String(existing.owner_name);
  const matched = members.find((m) => m.name.toLowerCase() === nextOwnerName.toLowerCase());

  const next = {
    title: parsed.data.title ?? String(existing.title),
    description: parsed.data.description ?? String(existing.description),
    ownerId: matched
      ? matched.userId
      : nextOwnerName === 'Unassigned'
        ? null
        : (existing.owner_id as string | null),
    ownerName: matched ? matched.name : nextOwnerName,
    startDate: parsed.data.startDate ?? String(existing.start_date),
    dueDate: parsed.data.dueDate ?? String(existing.due_date),
    estimatedDuration: parsed.data.estimatedDuration ?? Number(existing.estimated_duration),
    priority: parsed.data.priority ?? String(existing.priority),
    status: parsed.data.status ?? String(existing.status),
  };

  db.prepare(
    `UPDATE tasks SET title = ?, description = ?, owner_id = ?, owner_name = ?, start_date = ?, due_date = ?, estimated_duration = ?, priority = ?, status = ? WHERE id = ?`
  ).run(
    next.title,
    next.description,
    next.ownerId,
    next.ownerName,
    next.startDate,
    next.dueDate,
    next.estimatedDuration,
    next.priority,
    next.status,
    req.params.id
  );

  appendActivityLog(
    projectId,
    next.ownerName,
    `Updated task "${next.title}" (${next.status.replace('_', ' ')})`,
    'task'
  );
  broadcastProjectUpdate(
    projectId,
    'task',
    next.ownerName,
    `Updated "${next.title}" -> ${next.status.replace('_', ' ')}`
  );
  res.json({ updated: true });
});

app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  const user = getAuthUser(res);
  const existing = db.prepare('SELECT id, project_id, title FROM tasks WHERE id = ?').get(req.params.id) as
    | { id: string; project_id: string; title: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }
  if (!requireMembership(existing.project_id, user.id, res)) return;

  db.prepare('DELETE FROM task_dependencies WHERE predecessor_task_id = ? OR successor_task_id = ?').run(
    existing.id,
    existing.id
  );
  db.prepare('DELETE FROM tasks WHERE id = ?').run(existing.id);
  appendActivityLog(existing.project_id, user.name, `Removed task "${existing.title}"`, 'task');
  broadcastProjectUpdate(existing.project_id, 'task', user.name, `Removed "${existing.title}"`);
  res.json({ deleted: true });
});

// Dependencies CRUD + Cycle Validation
app.post('/api/projects/:id/dependencies', requireAuth, (req, res) => {
  const user = getAuthUser(res);
  const project = getProject(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  if (!requireMembership(project.id, user.id, res)) return;
  const schema = z.object({
    predecessorTaskId: z.string().min(1),
    successorTaskId: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid dependency endpoints.' });
    return;
  }

  const { predecessorTaskId, successorTaskId } = parsed.data;
  const tasks = getProjectTasks(project.id);
  const deps = getProjectDependencies(project.id);

  if (
    deps.some(
      (d) => d.predecessorTaskId === predecessorTaskId && d.successorTaskId === successorTaskId
    )
  ) {
    res.status(400).json({ error: 'This dependency already exists.' });
    return;
  }

  const cycleCheck = detectCycle(tasks, deps, { predecessorTaskId, successorTaskId });
  if (cycleCheck.hasCycle) {
    res.status(400).json({
      error: 'Circular dependency rejected: adding this link creates a cycle.',
      cyclePath: cycleCheck.cyclePath,
    });
    return;
  }

  const depId = uid('dep');
  db.prepare(
    `INSERT INTO task_dependencies (id, project_id, predecessor_task_id, successor_task_id) VALUES (?, ?, ?, ?)`
  ).run(depId, project.id, predecessorTaskId, successorTaskId);

  const predTitle = tasks.find((t) => t.id === predecessorTaskId)?.title || predecessorTaskId;
  const succTitle = tasks.find((t) => t.id === successorTaskId)?.title || successorTaskId;
  appendActivityLog(
    project.id,
    'Dependency DNA',
    `Linked "${predTitle}" -> "${succTitle}"`,
    'dependency'
  );
  broadcastProjectUpdate(
    project.id,
    'dependency',
    'Dependency DNA',
    `Linked "${predTitle}" -> "${succTitle}"`
  );

  res.status(201).json({ id: depId });
});

app.delete('/api/dependencies/:id', requireAuth, (req, res) => {
  const user = getAuthUser(res);
  const existing = db
    .prepare('SELECT id, project_id FROM task_dependencies WHERE id = ?')
    .get(req.params.id) as { id: string; project_id: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Dependency not found.' });
    return;
  }
  if (!requireMembership(existing.project_id, user.id, res)) return;

  db.prepare('DELETE FROM task_dependencies WHERE id = ?').run(existing.id);
  appendActivityLog(existing.project_id, user.name, 'Removed dependency edge', 'dependency');
  broadcastProjectUpdate(
    existing.project_id,
    'dependency',
    user.name,
    'Removed dependency link'
  );
  res.json({ deleted: true });
});

// What-If Simulation Engine (Deterministic, non-mutating)
app.post('/api/projects/:id/simulations', requireAuth, (req, res) => {
  const user = getAuthUser(res);
  const project = getProject(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  if (!requireMembership(project.id, user.id, res)) return;

  const schema = z.object({
    selectedTaskId: z.string().min(1),
    delayDays: z.number().int().min(0).max(30),
    scenario: z
      .enum(['resource_bottleneck', 'scope_creep', 'api_delay', 'custom'])
      .default('custom'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid simulation parameters.' });
    return;
  }

  const tasks = getProjectTasks(project.id);
  const deps = getProjectDependencies(project.id);

  try {
    const result = simulateDelay(
      tasks,
      deps,
      project.deadline,
      parsed.data.selectedTaskId,
      parsed.data.delayDays,
      parsed.data.scenario
    );

    const simId = uid('sim');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO simulations (id, project_id, selected_task_id, delay_days, scenario, simulation_results_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      simId,
      project.id,
      parsed.data.selectedTaskId,
      parsed.data.delayDays,
      parsed.data.scenario,
      JSON.stringify(result),
      now
    );

    appendActivityLog(
      project.id,
      'What-If Simulator',
      `Simulated +${parsed.data.delayDays}d delay on "${result.selectedTaskTitle}" (${result.directlyAffectedTaskIds.length + result.indirectlyAffectedTaskIds.length} impacted downstream)`,
      'simulation'
    );
    broadcastProjectUpdate(
      project.id,
      'simulation',
      'What-If Simulator',
      `Simulated +${parsed.data.delayDays}d delay on "${result.selectedTaskTitle}"`
    );

    res.status(201).json({
      simulation: {
        id: simId,
        projectId: project.id,
        selectedTaskId: parsed.data.selectedTaskId,
        delayDays: parsed.data.delayDays,
        scenario: parsed.data.scenario,
        results: result,
        createdAt: now,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Simulation failed.';
    res.status(400).json({ error: message });
  }
});

// Generate Live Gemini AI Recovery Options from a Simulation
app.post('/api/simulations/:id/recovery', requireAuth, async (req, res) => {
  const user = getAuthUser(res);
  const simRow = db
    .prepare('SELECT * FROM simulations WHERE id = ?')
    .get(req.params.id) as Record<string, unknown> | undefined;
  if (!simRow) {
    res.status(404).json({ error: 'Simulation not found.' });
    return;
  }

  const project = getProject(String(simRow.project_id));
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  if (!requireMembership(project.id, user.id, res)) return;

  const tasks = getProjectTasks(project.id);
  const simResult = JSON.parse(String(simRow.simulation_results_json));

  try {
    const generated = await generateRecoveryStrategies({
      project,
      tasks,
      simulation: simResult,
    });

    const planId = uid('rec');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO recovery_plans (id, simulation_id, project_id, selected_option_id, recommendations_json, ai_model, approval_status, disclaimer, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, 'proposed', ?, ?)`
    ).run(
      planId,
      String(simRow.id),
      project.id,
      JSON.stringify(generated.options),
      generated.aiModel,
      generated.disclaimer,
      now
    );

    appendActivityLog(
      project.id,
      'Gemini Recovery AI',
      `Generated 3 recovery strategies for "${simResult.selectedTaskTitle}" delay`,
      'recovery'
    );
    broadcastProjectUpdate(
      project.id,
      'recovery',
      'Gemini Recovery AI',
      `Generated recovery strategies for "${simResult.selectedTaskTitle}"`
    );

    res.status(201).json({
      recoveryPlan: {
        id: planId,
        simulationId: String(simRow.id),
        projectId: project.id,
        selectedOptionId: null,
        options: generated.options,
        aiModel: generated.aiModel,
        approvalStatus: 'proposed',
        disclaimer: generated.disclaimer,
        createdAt: now,
      },
    });
  } catch (err) {
    const status = err instanceof AiServiceError ? err.statusCode : 502;
    const message = err instanceof Error ? err.message : 'Recovery planning failed.';
    res.status(status).json({ error: message });
  }
});

// Human Approval & Application of a Recovery Option
app.post('/api/recovery/:id/apply', requireAuth, (req, res) => {
  const user = getAuthUser(res);
  const planRow = db
    .prepare('SELECT * FROM recovery_plans WHERE id = ?')
    .get(req.params.id) as Record<string, unknown> | undefined;
  if (!planRow) {
    res.status(404).json({ error: 'Recovery plan not found.' });
    return;
  }
  if (!requireMembership(String(planRow.project_id), user.id, res)) return;

  const optionId = String(req.body?.optionId || '');
  const options = JSON.parse(String(planRow.recommendations_json)) as RecoveryOption[];
  const chosen = options.find((o) => o.id === optionId);
  if (!chosen) {
    res.status(400).json({ error: 'Selected recovery option not found.' });
    return;
  }

  const projectId = String(planRow.project_id);

  for (const ch of chosen.proposedChanges) {
    const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(ch.taskId) as
      | Record<string, unknown>
      | undefined;
    if (!taskRow) continue;

    if (ch.changeType === 'parallelize_dependency') {
      db.prepare(
        `DELETE FROM task_dependencies WHERE project_id = ? AND successor_task_id = ?`
      ).run(projectId, ch.taskId);
    }

    const nextStart = ch.newStartDate ?? String(taskRow.start_date);
    const nextDue = ch.newDueDate ?? String(taskRow.due_date);
    const nextDur = ch.newEstimatedDuration ?? Number(taskRow.estimated_duration);
    const nextDesc =
      ch.changeType === 'trim_scope'
        ? `${String(taskRow.description)} [Scope Adjusted via Recovery Plan]`
        : String(taskRow.description);

    db.prepare(
      `UPDATE tasks SET start_date = ?, due_date = ?, estimated_duration = ?, description = ? WHERE id = ?`
    ).run(nextStart, nextDue, nextDur, nextDesc, ch.taskId);
  }

  db.prepare(
    `UPDATE recovery_plans SET selected_option_id = ?, approval_status = 'approved' WHERE id = ?`
  ).run(chosen.id, String(planRow.id));

  appendActivityLog(
    projectId,
    'Human Reviewer',
    `Approved & applied "${chosen.title}" (${chosen.proposedChanges.length} task update${chosen.proposedChanges.length === 1 ? '' : 's'})`,
    'recovery'
  );
  broadcastProjectUpdate(
    projectId,
    'recovery',
    'Human Reviewer',
    `Applied "${chosen.title}" to Execution Twin`
  );

  res.json({ applied: true, chosenOption: chosen });
});

// Live Gemini AI Risk Explanation endpoint
app.post('/api/projects/:id/risks/explain', requireAuth, async (req, res) => {
  const user = getAuthUser(res);
  const project = getProject(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  if (!requireMembership(project.id, user.id, res)) return;
  const members = getProjectMembers(project.id);
  const tasks = getProjectTasks(project.id);
  const deps = getProjectDependencies(project.id);
  const commitments = getProjectCommitments(project.id);
  const risks = analyzeProjectRisks(tasks, deps, commitments, project.deadline, members);

  try {
    const result = await generateRiskInsights({ project, risks });
    res.json(result);
  } catch (err) {
    const status = err instanceof AiServiceError ? err.statusCode : 502;
    const message = err instanceof Error ? err.message : 'Failed to generate risk insights.';
    res.status(status).json({ error: message });
  }
});

// Ensure unmatched API routes return JSON 404 rather than HTML
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

async function startServer() {
  const httpServer = http.createServer(app);
  initRealtimeServer(httpServer);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`OneFlow AI Execution Twin running at http://localhost:${PORT} (HTTP + WS)`);
  });
}

startServer();
