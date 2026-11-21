import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeProjectRisks,
  calculateScheduleAndCriticalPath,
  computeDashboardMetrics,
  detectCycle,
  simulateDelay,
  topologicalSort,
} from './scheduler.ts';
import type { Commitment, Project, ProjectMember, Task, TaskDependency } from '../shared/types.ts';

function makeTask(partial: Partial<Task> & { id: string; title: string }): Task {
  return {
    projectId: 'p1',
    description: '',
    ownerId: 'u1',
    ownerName: 'Arun',
    startDate: '2026-11-21',
    dueDate: '2026-11-23',
    estimatedDuration: 2,
    priority: 'high',
    status: 'in_progress',
    createdAt: '2026-11-21T00:00:00Z',
    ...partial,
  };
}

test('detectCycle identifies self-loops and multi-node cycles', () => {
  const tasks = [
    makeTask({ id: 't1', title: 'Frontend' }),
    makeTask({ id: 't2', title: 'API' }),
    makeTask({ id: 't3', title: 'Testing' }),
  ];
  const deps: TaskDependency[] = [
    { id: 'd1', projectId: 'p1', predecessorTaskId: 't1', successorTaskId: 't2' },
    { id: 'd2', projectId: 'p1', predecessorTaskId: 't2', successorTaskId: 't3' },
  ];

  assert.equal(detectCycle(tasks, deps).hasCycle, false);
  assert.equal(
    detectCycle(tasks, deps, { predecessorTaskId: 't3', successorTaskId: 't1' }).hasCycle,
    true
  );
  assert.equal(
    detectCycle(tasks, deps, { predecessorTaskId: 't1', successorTaskId: 't1' }).hasCycle,
    true
  );
});

test('topologicalSort orders predecessors before successors', () => {
  const tasks = [
    makeTask({ id: 't3', title: 'Testing' }),
    makeTask({ id: 't1', title: 'Frontend' }),
    makeTask({ id: 't2', title: 'API' }),
  ];
  const deps: TaskDependency[] = [
    { id: 'd1', projectId: 'p1', predecessorTaskId: 't1', successorTaskId: 't2' },
    { id: 'd2', projectId: 'p1', predecessorTaskId: 't2', successorTaskId: 't3' },
  ];

  const order = topologicalSort(tasks, deps);
  assert.deepEqual(order, ['t1', 't2', 't3']);
});

test('simulateDelay propagates downstream through chain and detects project deadline breach', () => {
  const tasks = [
    makeTask({
      id: 't1',
      title: 'Frontend Dashboard',
      ownerName: 'Arun',
      startDate: '2026-11-21',
      dueDate: '2026-11-23',
      estimatedDuration: 2,
      status: 'in_progress',
    }),
    makeTask({
      id: 't2',
      title: 'Backend API Integration',
      ownerName: 'Sanjeev',
      startDate: '2026-11-23',
      dueDate: '2026-11-25',
      estimatedDuration: 2,
      status: 'todo',
    }),
    makeTask({
      id: 't3',
      title: 'System Testing & QA',
      ownerName: 'Dharani',
      startDate: '2026-11-25',
      dueDate: '2026-11-27',
      estimatedDuration: 2,
      status: 'todo',
    }),
    makeTask({
      id: 't4',
      title: 'Final Pitch & Submission',
      ownerName: 'Daresh',
      startDate: '2026-11-27',
      dueDate: '2026-11-28',
      estimatedDuration: 1,
      status: 'todo',
    }),
  ];

  const deps: TaskDependency[] = [
    { id: 'd1', projectId: 'p1', predecessorTaskId: 't1', successorTaskId: 't2' },
    { id: 'd2', projectId: 'p1', predecessorTaskId: 't2', successorTaskId: 't3' },
    { id: 'd3', projectId: 'p1', predecessorTaskId: 't3', successorTaskId: 't4' },
  ];

  const sim = simulateDelay(tasks, deps, '2026-11-28', 't1', 2, 'scope_creep', '2026-11-21');

  assert.equal(sim.hasCycle, false);
  assert.deepEqual(sim.directlyAffectedTaskIds, ['t2']);
  assert.deepEqual(sim.indirectlyAffectedTaskIds, ['t3', 't4']);
  assert.equal(sim.estimatedProjectDelayDays, 2);
  assert.equal(sim.deadlineThreatened, true);
  assert.equal(sim.simulatedProjectEndDate, '2026-11-30');
  assert.deepEqual(sim.membersToNotify.sort(), ['Arun', 'Daresh', 'Dharani', 'Sanjeev']);
});

test('simulateDelay respects parallel task slack without threatening deadline when slack absorbs delay', () => {
  const tasks = [
    makeTask({
      id: 't1',
      title: 'Core Build',
      ownerName: 'Arun',
      startDate: '2026-11-21',
      dueDate: '2026-11-26',
      estimatedDuration: 5,
    }),
    makeTask({
      id: 't2',
      title: 'Docs Prep (Parallel)',
      ownerName: 'Daresh',
      startDate: '2026-11-21',
      dueDate: '2026-11-23',
      estimatedDuration: 2,
    }),
    makeTask({
      id: 't3',
      title: 'Submission',
      ownerName: 'Daresh',
      startDate: '2026-11-26',
      dueDate: '2026-11-27',
      estimatedDuration: 1,
    }),
  ];

  const deps: TaskDependency[] = [
    { id: 'd1', projectId: 'p1', predecessorTaskId: 't1', successorTaskId: 't3' },
    { id: 'd2', projectId: 'p1', predecessorTaskId: 't2', successorTaskId: 't3' },
  ];

  // Docs Prep has 3 days of slack before Submission starts at day 5
  const sim = simulateDelay(tasks, deps, '2026-11-27', 't2', 2, 'custom', '2026-11-21');
  assert.equal(sim.estimatedProjectDelayDays, 0);
  assert.equal(sim.deadlineThreatened, false);
  assert.deepEqual(sim.directlyAffectedTaskIds, []);
});

test('analyzeProjectRisks and computeDashboardMetrics compute accurate real metrics', () => {
  const projects: Project[] = [
    {
      id: 'p1',
      name: 'AI Hackathon Product Launch',
      description: 'Test',
      deadline: '2026-11-28',
      status: 'at_risk',
      createdAt: '2026-11-21T00:00:00Z',
    },
  ];
  const tasks = [
    makeTask({
      id: 't1',
      title: 'Completed Task',
      status: 'completed',
      startDate: '2026-11-18',
      dueDate: '2026-11-20',
    }),
    makeTask({
      id: 't2',
      title: 'Blocked Task',
      status: 'blocked',
      ownerId: null,
      ownerName: 'Unassigned',
      startDate: '2026-11-19',
      dueDate: '2026-11-20',
    }),
  ];
  const deps: TaskDependency[] = [
    { id: 'd1', projectId: 'p1', predecessorTaskId: 't1', successorTaskId: 't2' },
  ];
  const commitments: Commitment[] = [];
  const members: ProjectMember[] = [];

  const { schedule } = calculateScheduleAndCriticalPath(tasks, deps, '2026-11-28', '2026-11-21');
  const risks = analyzeProjectRisks(tasks, deps, commitments, '2026-11-28', members, '2026-11-21');
  const metrics = computeDashboardMetrics(projects, tasks, commitments, schedule, risks, '2026-11-21');

  assert.equal(metrics.totalProjects, 1);
  assert.equal(metrics.completedTasks, 1);
  assert.equal(metrics.activeTasks, 1);
  assert.equal(metrics.blockedTasks, 1);
  assert.equal(metrics.overdueTasks, 1);
  assert.equal(metrics.healthStatus, 'Critical');
  assert.ok(risks.some((r) => r.category === 'missing_owner'));
  assert.ok(risks.some((r) => r.category === 'overdue'));
});
