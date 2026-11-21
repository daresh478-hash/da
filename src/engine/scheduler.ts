import type {
  Commitment,
  DashboardMetrics,
  Project,
  ProjectMember,
  RiskItem,
  ScheduleNode,
  SimulationResult,
  SimulationScenario,
  Task,
  TaskDependency,
  TaskSimulationComparison,
} from '../shared/types.ts';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseDateUTC(dateStr: string): Date {
  const clean = (dateStr || '').slice(0, 10);
  const parts = clean.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return new Date(Date.UTC(2026, 10, 21));
  }
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

export function formatDateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function diffDaysUTC(fromStr: string, toStr: string): number {
  const from = parseDateUTC(fromStr).getTime();
  const to = parseDateUTC(toStr).getTime();
  return Math.round((to - from) / MS_PER_DAY);
}

export function addDaysUTC(dateStr: string, days: number): string {
  const d = parseDateUTC(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateUTC(d);
}

/**
 * Checks if the dependency graph (optionally including a candidate edge) contains a cycle.
 * Returns { hasCycle, cyclePath }.
 */
export function detectCycle(
  tasks: Pick<Task, 'id'>[],
  dependencies: Pick<TaskDependency, 'predecessorTaskId' | 'successorTaskId'>[],
  candidateEdge?: { predecessorTaskId: string; successorTaskId: string }
): { hasCycle: boolean; cyclePath: string[] } {
  const taskIds = new Set(tasks.map((t) => t.id));
  const adj = new Map<string, string[]>();
  for (const id of taskIds) adj.set(id, []);

  const allEdges = candidateEdge ? [...dependencies, candidateEdge] : dependencies;
  for (const edge of allEdges) {
    if (!taskIds.has(edge.predecessorTaskId) || !taskIds.has(edge.successorTaskId)) {
      continue;
    }
    if (edge.predecessorTaskId === edge.successorTaskId) {
      return {
        hasCycle: true,
        cyclePath: [edge.predecessorTaskId, edge.successorTaskId],
      };
    }
    adj.get(edge.predecessorTaskId)!.push(edge.successorTaskId);
  }

  // 0 = unvisited, 1 = visiting, 2 = visited
  const state = new Map<string, number>();
  const parent = new Map<string, string | null>();
  for (const id of taskIds) state.set(id, 0);

  for (const id of taskIds) {
    if (state.get(id) === 0) {
      const cycle = dfsCycle(id, adj, state, parent);
      if (cycle.length > 0) {
        return { hasCycle: true, cyclePath: cycle };
      }
    }
  }

  return { hasCycle: false, cyclePath: [] };
}

function dfsCycle(
  node: string,
  adj: Map<string, string[]>,
  state: Map<string, number>,
  parent: Map<string, string | null>
): string[] {
  state.set(node, 1);
  for (const next of adj.get(node) ?? []) {
    const nextState = state.get(next) ?? 0;
    if (nextState === 1) {
      const path = [next, node];
      let curr = parent.get(node) ?? null;
      while (curr && curr !== next) {
        path.push(curr);
        curr = parent.get(curr) ?? null;
      }
      path.push(next);
      return path.reverse();
    }
    if (nextState === 0) {
      parent.set(next, node);
      const found = dfsCycle(next, adj, state, parent);
      if (found.length > 0) return found;
    }
  }
  state.set(node, 2);
  return [];
}

/**
 * Kahn's algorithm topological sort. Returns null if graph has a cycle.
 */
export function topologicalSort(
  tasks: Pick<Task, 'id'>[],
  dependencies: Pick<TaskDependency, 'predecessorTaskId' | 'successorTaskId'>[]
): string[] | null {
  const taskIds = tasks.map((t) => t.id);
  const idSet = new Set(taskIds);
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of taskIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const dep of dependencies) {
    if (!idSet.has(dep.predecessorTaskId) || !idSet.has(dep.successorTaskId)) continue;
    adj.get(dep.predecessorTaskId)!.push(dep.successorTaskId);
    inDegree.set(dep.successorTaskId, (inDegree.get(dep.successorTaskId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const id of taskIds) {
    if ((inDegree.get(id) ?? 0) === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    order.push(curr);
    for (const next of adj.get(curr) ?? []) {
      const nextDeg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDeg);
      if (nextDeg === 0) queue.push(next);
    }
  }

  return order.length === taskIds.length ? order : null;
}

/**
 * Deterministic forward & backward pass scheduling (CPM) on the task DAG.
 * Computes ES, EF, LS, LF, slackDays, critical path, and visual states.
 */
export function calculateScheduleAndCriticalPath(
  tasks: Task[],
  dependencies: TaskDependency[],
  projectDeadline: string,
  referenceDate = formatDateUTC(new Date())
): {
  schedule: Record<string, ScheduleNode>;
  projectOriginDate: string;
  baselineEndDate: string;
  criticalChain: string[];
  hasCycle: boolean;
} {
  const schedule: Record<string, ScheduleNode> = {};
  if (tasks.length === 0) {
    return {
      schedule,
      projectOriginDate: referenceDate,
      baselineEndDate: referenceDate,
      criticalChain: [],
      hasCycle: false,
    };
  }

  const taskMap = new Map<string, Task>(tasks.map((t) => [t.id, t]));
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const t of tasks) {
    preds.set(t.id, []);
    succs.set(t.id, []);
  }
  for (const d of dependencies) {
    if (taskMap.has(d.predecessorTaskId) && taskMap.has(d.successorTaskId)) {
      preds.get(d.successorTaskId)!.push(d.predecessorTaskId);
      succs.get(d.predecessorTaskId)!.push(d.successorTaskId);
    }
  }

  // Earliest project origin date across tasks
  let projectOriginDate = tasks[0].startDate;
  for (const t of tasks) {
    if (diffDaysUTC(projectOriginDate, t.startDate) < 0) {
      projectOriginDate = t.startDate;
    }
  }

  const order = topologicalSort(tasks, dependencies);
  if (!order) {
    // Fallback if invalid cycle exists
    for (const t of tasks) {
      const dur = Math.max(1, t.estimatedDuration || 1);
      const esDay = Math.max(0, diffDaysUTC(projectOriginDate, t.startDate));
      const efDay = esDay + dur;
      const isOverdue = t.status !== 'completed' && diffDaysUTC(referenceDate, t.dueDate) < 0;
      const isBlockedByDependency =
        t.status === 'blocked' ||
        (preds.get(t.id) ?? []).some((pid) => taskMap.get(pid)?.status !== 'completed');
      schedule[t.id] = {
        taskId: t.id,
        esDay,
        efDay,
        lsDay: esDay,
        lfDay: efDay,
        slackDays: 0,
        isCritical: false,
        isBlockedByDependency,
        isOverdue,
        isAtRisk: isOverdue || isBlockedByDependency,
        predecessorIds: preds.get(t.id) ?? [],
        successorIds: succs.get(t.id) ?? [],
        visualState: computeVisualState(t, isBlockedByDependency, isOverdue, false),
      };
    }
    return {
      schedule,
      projectOriginDate,
      baselineEndDate: projectDeadline,
      criticalChain: [],
      hasCycle: true,
    };
  }

  const es = new Map<string, number>();
  const ef = new Map<string, number>();

  for (const id of order) {
    const task = taskMap.get(id)!;
    const dur = Math.max(1, task.estimatedDuration || 1);
    const ownStartDay = Math.max(0, diffDaysUTC(projectOriginDate, task.startDate));
    const predIds = preds.get(id) ?? [];
    const maxPredEf =
      predIds.length > 0 ? Math.max(...predIds.map((pid) => ef.get(pid) ?? 0)) : 0;
    const taskEs = Math.max(ownStartDay, maxPredEf);
    es.set(id, taskEs);
    ef.set(id, taskEs + dur);
  }

  const maxEf = Math.max(...Array.from(ef.values()), 0);
  const projectDeadlineDay = Math.max(maxEf, diffDaysUTC(projectOriginDate, projectDeadline));
  const baselineEndDate = addDaysUTC(projectOriginDate, maxEf);

  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  const reverseOrder = [...order].reverse();

  for (const id of reverseOrder) {
    const task = taskMap.get(id)!;
    const dur = Math.max(1, task.estimatedDuration || 1);
    const succIds = succs.get(id) ?? [];
    const taskLf =
      succIds.length > 0
        ? Math.min(...succIds.map((sid) => ls.get(sid) ?? projectDeadlineDay))
        : projectDeadlineDay;
    lf.set(id, taskLf);
    ls.set(id, taskLf - dur);
  }

  const criticalChain: string[] = [];

  for (const id of order) {
    const task = taskMap.get(id)!;
    const taskEs = es.get(id) ?? 0;
    const taskEf = ef.get(id) ?? 0;
    const taskLs = ls.get(id) ?? 0;
    const taskLf = lf.get(id) ?? 0;
    const slackDays = Math.max(0, taskLs - taskEs);
    const isCritical = slackDays === 0;
    if (isCritical && task.status !== 'completed') {
      criticalChain.push(id);
    }

    const predIds = preds.get(id) ?? [];
    const hasIncompletePredecessor = predIds.some((pid) => {
      const pTask = taskMap.get(pid);
      return pTask && pTask.status !== 'completed';
    });
    const isBlockedByDependency =
      task.status === 'blocked' || (task.status !== 'completed' && hasIncompletePredecessor);
    const isOverdue =
      task.status !== 'completed' && diffDaysUTC(referenceDate, task.dueDate) < 0;
    const daysUntilDue = diffDaysUTC(referenceDate, task.dueDate);
    const isDueSoon = task.status !== 'completed' && daysUntilDue >= 0 && daysUntilDue <= 2;
    const isAtRisk =
      task.status !== 'completed' &&
      (isOverdue ||
        isBlockedByDependency ||
        (isCritical && isDueSoon) ||
        diffDaysUTC(task.dueDate, projectDeadline) < 0);

    schedule[id] = {
      taskId: id,
      esDay: taskEs,
      efDay: taskEf,
      lsDay: taskLs,
      lfDay: taskLf,
      slackDays,
      isCritical,
      isBlockedByDependency,
      isOverdue,
      isAtRisk,
      predecessorIds: predIds,
      successorIds: succs.get(id) ?? [],
      visualState: computeVisualState(task, isBlockedByDependency, isOverdue, isAtRisk),
    };
  }

  return {
    schedule,
    projectOriginDate,
    baselineEndDate,
    criticalChain,
    hasCycle: false,
  };
}

function computeVisualState(
  task: Task,
  isBlockedByDependency: boolean,
  isOverdue: boolean,
  isAtRisk: boolean
): 'green' | 'blue' | 'amber' | 'red' | 'gray' {
  if (task.status === 'completed') return 'green';
  if (task.status === 'blocked' || isOverdue) return 'red';
  if (isBlockedByDependency || isAtRisk) return 'amber';
  if (task.status === 'in_progress') return 'blue';
  return 'gray';
}

/**
 * Deterministic What-If Delay Simulator.
 * Does NOT mutate project tasks. Propagates delay strictly through the DAG,
 * respecting parallel tasks, multi-dependency joins, task durations, and slack.
 */
export function simulateDelay(
  tasks: Task[],
  dependencies: TaskDependency[],
  projectDeadline: string,
  selectedTaskId: string,
  delayDays: number,
  scenario: SimulationScenario = 'custom',
  referenceDate = formatDateUTC(new Date())
): SimulationResult {
  const safeDelay = Math.max(0, Math.round(delayDays));
  const taskMap = new Map<string, Task>(tasks.map((t) => [t.id, t]));
  const selectedTask = taskMap.get(selectedTaskId);

  if (!selectedTask) {
    throw new Error(`Selected task "${selectedTaskId}" was not found.`);
  }

  const cycleCheck = detectCycle(tasks, dependencies);
  if (cycleCheck.hasCycle) {
    return {
      selectedTaskId,
      selectedTaskTitle: selectedTask.title,
      delayDays: safeDelay,
      scenario,
      originalProjectEndDate: projectDeadline,
      simulatedProjectEndDate: projectDeadline,
      projectDeadline,
      estimatedProjectDelayDays: 0,
      deadlineThreatened: false,
      directlyAffectedTaskIds: [],
      indirectlyAffectedTaskIds: [],
      newlyBlockedTaskIds: [],
      membersToNotify: [],
      taskComparisons: [],
      criticalChain: [],
      hasCycle: true,
      cycleMessage: `Circular dependency detected (${cycleCheck.cyclePath.join(' -> ')}). Resolve cycle before simulating.`,
    };
  }

  const baseline = calculateScheduleAndCriticalPath(
    tasks,
    dependencies,
    projectDeadline,
    referenceDate
  );

  const order = topologicalSort(tasks, dependencies)!;
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const t of tasks) {
    preds.set(t.id, []);
    succs.set(t.id, []);
  }
  for (const d of dependencies) {
    if (taskMap.has(d.predecessorTaskId) && taskMap.has(d.successorTaskId)) {
      preds.get(d.successorTaskId)!.push(d.predecessorTaskId);
      succs.get(d.predecessorTaskId)!.push(d.successorTaskId);
    }
  }

  // Forward pass with delay applied to selectedTaskId
  const simEs = new Map<string, number>();
  const simEf = new Map<string, number>();

  for (const id of order) {
    const task = taskMap.get(id)!;
    const dur = Math.max(1, task.estimatedDuration || 1);
    const baseNode = baseline.schedule[id];
    const predIds = preds.get(id) ?? [];

    const maxPredSimEf =
      predIds.length > 0 ? Math.max(...predIds.map((pid) => simEf.get(pid) ?? 0)) : 0;

    // A task's simulated start is at least its baseline ES and at least max(simEF of predecessors)
    const startDay = Math.max(baseNode.esDay, maxPredSimEf);
    const addedDelay = id === selectedTaskId ? safeDelay : 0;
    const endDay = startDay + dur + addedDelay;

    simEs.set(id, startDay);
    simEf.set(id, endDay);
  }

  const directSet = new Set<string>(succs.get(selectedTaskId) ?? []);
  const indirectSet = new Set<string>();
  const bfsQueue = [...directSet];
  const visited = new Set<string>([selectedTaskId, ...directSet]);
  while (bfsQueue.length > 0) {
    const curr = bfsQueue.shift()!;
    for (const nxt of succs.get(curr) ?? []) {
      if (!visited.has(nxt)) {
        visited.add(nxt);
        indirectSet.add(nxt);
        bfsQueue.push(nxt);
      }
    }
  }

  const directlyAffectedTaskIds: string[] = [];
  const indirectlyAffectedTaskIds: string[] = [];
  const newlyBlockedTaskIds: string[] = [];
  const notifyMembers = new Set<string>();

  const maxSimEf = Math.max(...Array.from(simEf.values()), 0);
  const simulatedProjectEndDate = addDaysUTC(baseline.projectOriginDate, maxSimEf);
  const deadlineDay = diffDaysUTC(baseline.projectOriginDate, projectDeadline);
  const estimatedProjectDelayDays = Math.max(0, maxSimEf - deadlineDay);
  const deadlineThreatened = maxSimEf > deadlineDay;

  const taskComparisons: TaskSimulationComparison[] = order.map((id) => {
    const task = taskMap.get(id)!;
    const baseNode = baseline.schedule[id];
    const sEs = simEs.get(id) ?? baseNode.esDay;
    const sEf = simEf.get(id) ?? baseNode.efDay;
    const shiftDays = sEf - baseNode.efDay;

    const origStart = addDaysUTC(baseline.projectOriginDate, baseNode.esDay);
    const origDue = addDaysUTC(baseline.projectOriginDate, baseNode.efDay);
    const simStart = addDaysUTC(baseline.projectOriginDate, sEs);
    const simDue = addDaysUTC(baseline.projectOriginDate, sEf);

    let impactLevel: TaskSimulationComparison['impactLevel'] = 'unaffected';
    if (id === selectedTaskId) {
      impactLevel = 'source';
      if (safeDelay > 0 && task.ownerName && task.ownerName !== 'Unassigned') {
        notifyMembers.add(task.ownerName);
      }
    } else if (shiftDays > 0 && directSet.has(id)) {
      impactLevel = 'direct';
      directlyAffectedTaskIds.push(id);
      if (task.ownerName && task.ownerName !== 'Unassigned') {
        notifyMembers.add(task.ownerName);
      }
    } else if (shiftDays > 0 && indirectSet.has(id)) {
      impactLevel = 'indirect';
      indirectlyAffectedTaskIds.push(id);
      if (task.ownerName && task.ownerName !== 'Unassigned') {
        notifyMembers.add(task.ownerName);
      }
    }

    const newlyBlocked =
      id !== selectedTaskId &&
      shiftDays > 0 &&
      (preds.get(id) ?? []).some((pid) => pid === selectedTaskId || (simEf.get(pid) ?? 0) > baseNode.esDay);

    if (newlyBlocked) {
      newlyBlockedTaskIds.push(id);
    }

    const threatensProjectDeadline = sEf > deadlineDay;
    const slackRemaining = Math.max(0, baseNode.slackDays - shiftDays);

    return {
      taskId: id,
      title: task.title,
      ownerName: task.ownerName,
      originalStartDate: origStart,
      originalDueDate: origDue,
      simulatedStartDate: simStart,
      simulatedDueDate: simDue,
      shiftDays,
      slackAvailable: baseNode.slackDays,
      slackRemaining,
      impactLevel,
      isCritical: baseNode.isCritical,
      threatensProjectDeadline,
      newlyBlocked,
    };
  });

  return {
    selectedTaskId,
    selectedTaskTitle: selectedTask.title,
    delayDays: safeDelay,
    scenario,
    originalProjectEndDate: baseline.baselineEndDate,
    simulatedProjectEndDate,
    projectDeadline,
    estimatedProjectDelayDays,
    deadlineThreatened,
    directlyAffectedTaskIds,
    indirectlyAffectedTaskIds,
    newlyBlockedTaskIds,
    membersToNotify: Array.from(notifyMembers),
    taskComparisons,
    criticalChain: baseline.criticalChain,
    hasCycle: false,
  };
}

/**
 * Deterministic risk analyzer evaluating real project tasks, dependencies, commitments, and deadlines.
 */
export function analyzeProjectRisks(
  tasks: Task[],
  dependencies: TaskDependency[],
  commitments: Commitment[],
  projectDeadline: string,
  _members: ProjectMember[],
  referenceDate = formatDateUTC(new Date())
): RiskItem[] {
  const risks: RiskItem[] = [];
  const taskMap = new Map<string, Task>(tasks.map((t) => [t.id, t]));
  const { schedule, hasCycle } = calculateScheduleAndCriticalPath(
    tasks,
    dependencies,
    projectDeadline,
    referenceDate
  );

  if (hasCycle) {
    risks.push({
      id: 'risk-cycle',
      severity: 'critical',
      category: 'cycle',
      title: 'Circular dependency detected in task graph',
      description: 'One or more task dependencies form a closed loop, preventing deterministic scheduling.',
      recommendedAction: 'Remove the conflicting dependency edge in Dependency DNA.',
    });
  }

  for (const task of tasks) {
    const node = schedule[task.id];
    if (!node) continue;

    if (node.isOverdue) {
      const daysLate = Math.abs(diffDaysUTC(referenceDate, task.dueDate));
      risks.push({
        id: `risk-overdue-${task.id}`,
        severity: 'critical',
        category: 'overdue',
        title: `${task.title} is overdue by ${daysLate} day${daysLate === 1 ? '' : 's'}`,
        description: `Assigned to ${task.ownerName}. Original due date ${task.dueDate} has passed while task remains ${task.status.replace('_', ' ')}.`,
        taskId: task.id,
        taskTitle: task.title,
        ownerName: task.ownerName,
        recommendedAction: 'Run a delay simulation in What-If Lab to evaluate downstream impact and generate a recovery plan.',
      });
    }

    if (task.status === 'blocked' || (node.isBlockedByDependency && task.status !== 'completed')) {
      const blockingNames = node.predecessorIds
        .map((pid) => taskMap.get(pid))
        .filter((p): p is Task => Boolean(p && p.status !== 'completed'))
        .map((p) => p.title);

      risks.push({
        id: `risk-blocked-${task.id}`,
        severity: task.status === 'blocked' ? 'high' : 'medium',
        category: 'blocked',
        title: `${task.title} depends on incomplete predecessor${blockingNames.length > 1 ? 's' : ''}`,
        description:
          blockingNames.length > 0
            ? `Waiting on: ${blockingNames.join(', ')}. ${node.successorIds.length} downstream task(s) depend on this node.`
            : `Task is currently marked as Blocked.`,
        taskId: task.id,
        taskTitle: task.title,
        ownerName: task.ownerName,
        recommendedAction: 'Monitor predecessor progress or prepare parallel contract work to avoid cascading delays.',
      });
    }

    if (!task.ownerId || task.ownerName === 'Unassigned' || task.ownerName.trim() === '') {
      risks.push({
        id: `risk-owner-${task.id}`,
        severity: 'high',
        category: 'missing_owner',
        title: `${task.title} has no assigned owner`,
        description: 'Unowned commitments frequently slip after meetings because accountability is unclear.',
        taskId: task.id,
        taskTitle: task.title,
        ownerName: 'Unassigned',
        recommendedAction: 'Assign a responsible team member on the Execution Board.',
      });
    }

    if (task.status !== 'completed' && diffDaysUTC(task.dueDate, projectDeadline) < 0) {
      risks.push({
        id: `risk-deadline-${task.id}`,
        severity: 'critical',
        category: 'deadline_conflict',
        title: `${task.title} due date exceeds project deadline`,
        description: `Task due ${task.dueDate} falls after project target deadline ${projectDeadline}.`,
        taskId: task.id,
        taskTitle: task.title,
        ownerName: task.ownerName,
        recommendedAction: 'Use Recovery Planner to compress schedule or adjust scope.',
      });
    } else if (
      task.status !== 'completed' &&
      node.isCritical &&
      node.slackDays === 0 &&
      node.successorIds.length > 0
    ) {
      risks.push({
        id: `risk-slack-${task.id}`,
        severity: 'medium',
        category: 'zero_slack_chain',
        title: `${task.title} sits on zero-slack critical path`,
        description: `Any delay to ${task.title} (${task.ownerName}) propagates directly to ${node.successorIds.length} downstream task(s) and threatens ${projectDeadline}.`,
        taskId: task.id,
        taskTitle: task.title,
        ownerName: task.ownerName,
        recommendedAction: 'Test a 1-2 day buffer scenario in What-If Lab.',
      });
    }
  }

  const pendingCommitments = commitments.filter((c) => c.approvalStatus === 'pending_review');
  if (pendingCommitments.length > 0) {
    risks.push({
      id: 'risk-pending-commitments',
      severity: 'medium',
      category: 'unconfirmed_commitment',
      title: `${pendingCommitments.length} extracted commitment${pendingCommitments.length === 1 ? '' : 's'} awaiting human review`,
      description: 'Commitments extracted from meetings remain inactive until reviewed and approved.',
      recommendedAction: 'Review and approve commitments in Meeting Intelligence or Commitments.',
    });
  }

  const severityOrder: Record<RiskItem['severity'], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return risks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * Computes real dashboard metrics directly from project records and deterministic schedule/risks.
 */
export function computeDashboardMetrics(
  projects: Project[],
  tasks: Task[],
  commitments: Commitment[],
  schedule: Record<string, ScheduleNode>,
  risks: RiskItem[],
  referenceDate = formatDateUTC(new Date())
): DashboardMetrics {
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const activeTasks = tasks.filter((t) => t.status !== 'completed').length;
  const blockedTasks = tasks.filter(
    (t) => t.status === 'blocked' || Boolean(schedule[t.id]?.isBlockedByDependency)
  ).length;
  const overdueTasks = tasks.filter((t) => Boolean(schedule[t.id]?.isOverdue)).length;
  const atRiskTasks = tasks.filter((t) => Boolean(schedule[t.id]?.isAtRisk)).length;
  const pendingCommitments = commitments.filter((c) => c.approvalStatus === 'pending_review').length;
  const upcomingDeadlines = tasks.filter((t) => {
    if (t.status === 'completed') return false;
    const days = diffDaysUTC(referenceDate, t.dueDate);
    return days >= 0 && days <= 5;
  }).length;

  const hasCritical = risks.some((r) => r.severity === 'critical') || overdueTasks > 0;
  const hasAtRisk = risks.some((r) => r.severity === 'high') || blockedTasks > 0 || atRiskTasks > 0;

  const healthStatus: DashboardMetrics['healthStatus'] = hasCritical
    ? 'Critical'
    : hasAtRisk
      ? 'At Risk'
      : 'Healthy';

  const completionRate =
    tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

  return {
    totalProjects: projects.length,
    activeTasks,
    completedTasks,
    pendingCommitments,
    blockedTasks,
    overdueTasks,
    upcomingDeadlines,
    atRiskTasks,
    healthStatus,
    completionRate,
  };
}
