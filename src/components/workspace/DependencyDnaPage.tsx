import React, { useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { GitBranch, Link2, Plus, Sliders, Trash2 } from 'lucide-react';
import { api } from '../../api/client.ts';
import { detectCycle } from '../../engine/scheduler.ts';
import type { ProjectWorkspaceData, ScheduleNode, Task } from '../../shared/types.ts';

interface DependencyDnaPageProps {
  data: ProjectWorkspaceData;
  onRefresh: () => Promise<void>;
  onSimulateTask: (taskId: string) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

interface TaskNodeData extends Record<string, unknown> {
  task: Task;
  scheduleNode?: ScheduleNode;
  isSelected: boolean;
}

const STATUS_STYLES: Record<
  ScheduleNode['visualState'],
  { border: string; bg: string; topBar: string; label: string; labelColor: string }
> = {
  green: {
    border: 'border-emerald-300',
    bg: 'bg-gradient-to-br from-emerald-50 via-white to-white',
    topBar: 'from-emerald-500 to-teal-500',
    label: 'Completed',
    labelColor: 'text-emerald-700',
  },
  blue: {
    border: 'border-cyan-300',
    bg: 'bg-gradient-to-br from-cyan-50 via-white to-white',
    topBar: 'from-cyan-500 to-blue-600',
    label: 'In Progress',
    labelColor: 'text-cyan-700',
  },
  amber: {
    border: 'border-amber-300',
    bg: 'bg-gradient-to-br from-amber-50 via-white to-white',
    topBar: 'from-amber-500 to-orange-500',
    label: 'At Risk',
    labelColor: 'text-amber-700',
  },
  red: {
    border: 'border-rose-300',
    bg: 'bg-gradient-to-br from-rose-50 via-white to-white',
    topBar: 'from-rose-500 to-orange-500',
    label: 'Blocked / Overdue',
    labelColor: 'text-rose-700',
  },
  gray: {
    border: 'border-indigo-200',
    bg: 'bg-gradient-to-br from-indigo-50/80 via-white to-white',
    topBar: 'from-indigo-500 to-slate-400',
    label: 'Not Started',
    labelColor: 'text-indigo-700',
  },
};

const ExecutionTaskNode: React.FC<NodeProps<Node<TaskNodeData>>> = ({ data }) => {
  const { task, scheduleNode, isSelected } = data;
  const visual = scheduleNode?.visualState || 'gray';
  const style = STATUS_STYLES[visual];

  return (
    <div
      className={`relative overflow-hidden w-[244px] rounded-xl border px-4 py-3.5 shadow-md transition-all ${style.border} ${style.bg} ${
        isSelected ? 'ring-2 ring-blue-600 shadow-blue-500/15' : ''
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${style.topBar}`} />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-cyan-600 !border-white"
      />
      <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
        <span className={`font-semibold ${style.labelColor}`}>{style.label}</span>
        <span className="font-mono-num text-slate-600">
          {scheduleNode ? `${scheduleNode.slackDays}d slack` : ''}
        </span>
      </div>
      <p className="font-display text-sm font-semibold text-slate-900 leading-snug truncate">
        {task.title}
      </p>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
        <span className="font-medium text-slate-800">{task.ownerName}</span>
        <span className="font-mono-num text-slate-600">{task.dueDate}</span>
      </div>
      {scheduleNode?.isCritical && (
        <p className="mt-1.5 text-[11px] font-semibold text-amber-700">Critical Chain</p>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-violet-600 !border-white"
      />
    </div>
  );
};

const nodeTypes = { executionTask: ExecutionTaskNode };

export const DependencyDnaPage: React.FC<DependencyDnaPageProps> = ({
  data,
  onRefresh,
  onSimulateTask,
  onNotify,
}) => {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    data.tasks[0]?.id || null
  );
  const [predId, setPredId] = useState<string>(data.tasks[0]?.id || '');
  const [succId, setSuccId] = useState<string>(data.tasks[1]?.id || '');
  const [savingEdge, setSavingEdge] = useState(false);

  const { nodes, edges } = useMemo(() => {
    const tasks = data.tasks;
    const deps = data.dependencies;

    // Compute longest path depth for clean left-to-right DAG columns
    const predsMap = new Map<string, string[]>();
    for (const t of tasks) predsMap.set(t.id, []);
    for (const d of deps) {
      if (predsMap.has(d.successorTaskId)) {
        predsMap.get(d.successorTaskId)!.push(d.predecessorTaskId);
      }
    }

    const depthCache = new Map<string, number>();
    const visiting = new Set<string>();
    const getDepth = (id: string): number => {
      if (depthCache.has(id)) return depthCache.get(id)!;
      if (visiting.has(id)) return 0;
      visiting.add(id);
      const pList = predsMap.get(id) || [];
      const depth =
        pList.length === 0 ? 0 : 1 + Math.max(...pList.map((pid) => getDepth(pid)));
      visiting.delete(id);
      depthCache.set(id, depth);
      return depth;
    };

    const colBuckets = new Map<number, Task[]>();
    for (const t of tasks) {
      const col = getDepth(t.id);
      if (!colBuckets.has(col)) colBuckets.set(col, []);
      colBuckets.get(col)!.push(t);
    }

    const flowNodes: Node<TaskNodeData>[] = [];
    for (const [col, bucket] of colBuckets.entries()) {
      bucket.forEach((task, rowIdx) => {
        flowNodes.push({
          id: task.id,
          type: 'executionTask',
          position: { x: col * 310 + 40, y: rowIdx * 155 + 40 },
          data: {
            task,
            scheduleNode: data.schedule[task.id],
            isSelected: task.id === selectedTaskId,
          },
        });
      });
    }

    const flowEdges: Edge[] = deps.map((dep) => {
      const predCrit = data.schedule[dep.predecessorTaskId]?.isCritical;
      const succCrit = data.schedule[dep.successorTaskId]?.isCritical;
      const isCritEdge = Boolean(predCrit && succCrit);
      return {
        id: dep.id,
        source: dep.predecessorTaskId,
        target: dep.successorTaskId,
        animated: isCritEdge,
        style: {
          stroke: isCritEdge ? '#d97706' : '#0284c7',
          strokeWidth: isCritEdge ? 2.5 : 1.75,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isCritEdge ? '#d97706' : '#0284c7',
        },
      };
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [data.tasks, data.dependencies, data.schedule, selectedTaskId]);

  const cyclePreview = useMemo(() => {
    if (!predId || !succId) return { hasCycle: false, cyclePath: [] };
    return detectCycle(data.tasks, data.dependencies, {
      predecessorTaskId: predId,
      successorTaskId: succId,
    });
  }, [data.tasks, data.dependencies, predId, succId]);

  const handleAddDependency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!predId || !succId) return;
    if (cyclePreview.hasCycle) {
      onNotify('Circular dependency detected and blocked.', 'error');
      return;
    }

    setSavingEdge(true);
    try {
      await api.createDependency(data.project.id, {
        predecessorTaskId: predId,
        successorTaskId: succId,
      });
      await onRefresh();
      onNotify('Dependency edge added to Execution Twin.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to create dependency.', 'error');
    } finally {
      setSavingEdge(false);
    }
  };

  const handleRemoveDependency = async (depId: string) => {
    try {
      await api.deleteDependency(depId);
      await onRefresh();
      onNotify('Dependency edge removed.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to remove dependency.', 'error');
    }
  };

  const selectedTask = data.tasks.find((t) => t.id === selectedTaskId) || null;
  const selectedNode = selectedTask ? data.schedule[selectedTask.id] : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600 mb-1">
            Topological Execution Graph · Cycle Protection
          </p>
          <h1 className="font-display text-2xl font-bold text-slate-900">Dependency DNA</h1>
          <p className="text-sm text-slate-600 mt-1">
            Interactive dependency graph generated live from project tasks. Click any node to
            inspect blockers or simulate delays.
          </p>
        </div>

        {/* Status Legend (Color + Text Labels) */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="text-emerald-700 font-semibold">Completed</span>
          <span className="text-cyan-700 font-semibold">In Progress</span>
          <span className="text-amber-700 font-semibold">At Risk / Critical</span>
          <span className="text-rose-700 font-semibold">Blocked / Overdue</span>
          <span className="text-indigo-700 font-semibold">Not Started</span>
        </div>
      </div>

      {/* Graph Canvas + Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div
          data-testid="dependency-dna-canvas"
          className="relative lg:col-span-8 h-[480px] rounded-xl border border-cyan-200 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.10),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(139,92,246,0.10),transparent_42%),#f8fafc] overflow-hidden shadow-sm"
        >
          <div className="absolute inset-x-0 top-0 z-10 h-[3px] bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" />
          {data.tasks.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-slate-500">
              Add tasks or approve meeting commitments to generate Dependency DNA.
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={(_evt, node) => setSelectedTaskId(node.id)}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.4}
              maxZoom={1.6}
            >
              <Background color="#cbd5e1" gap={20} />
              <Controls />
              <MiniMap
                nodeColor={(n) => {
                  const visual = (n.data as TaskNodeData)?.scheduleNode?.visualState;
                  if (visual === 'green') return '#10b981';
                  if (visual === 'blue') return '#0ea5e9';
                  if (visual === 'amber') return '#f59e0b';
                  if (visual === 'red') return '#f43f5e';
                  return '#6366f1';
                }}
              />
            </ReactFlow>
          )}
        </div>

        {/* Node Detail & Dependency Manager */}
        <aside className="lg:col-span-4 space-y-5">
          {selectedTask && (
            <div className="relative overflow-hidden rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50/75 via-white to-white p-5 space-y-4 shadow-xs">
              <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 to-blue-600" />
              <div className="space-y-2.5">
                <div>
                  <p className="text-xs font-semibold text-cyan-700">Selected Task Node</p>
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    {selectedTask.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onSimulateTask(selectedTask.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 rounded-lg shadow-sm cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Simulate Delay on Task</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                  <span className="text-slate-500 block">Owner</span>
                  <span className="text-slate-900 font-medium">{selectedTask.ownerName}</span>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                  <span className="text-slate-500 block">Due Date</span>
                  <span className="font-mono-num text-cyan-700 font-semibold">
                    {selectedTask.dueDate}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                  <span className="text-slate-500 block">Available Slack</span>
                  <span className="font-mono-num text-amber-700 font-semibold">
                    {selectedNode ? `${selectedNode.slackDays} day(s)` : '0d'}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                  <span className="text-slate-500 block">Critical Path</span>
                  <span className={selectedNode?.isCritical ? 'text-rose-600 font-semibold' : 'text-emerald-700 font-semibold'}>
                    {selectedNode?.isCritical ? 'Yes (Zero Slack)' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Add / Validate Dependency Edge */}
          <form
            onSubmit={handleAddDependency}
            className="relative overflow-hidden rounded-xl border border-indigo-200 bg-white p-5 space-y-3 shadow-xs"
          >
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-indigo-500 to-violet-600" />
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-indigo-600" />
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Add Dependency Link
              </h2>
            </div>

            <div>
              <label htmlFor="dep-pred" className="block text-xs font-medium text-slate-600 mb-1">
                Predecessor (Must finish first)
              </label>
              <select
                id="dep-pred"
                value={predId}
                onChange={(e) => setPredId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              >
                {data.tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="dep-succ" className="block text-xs font-medium text-slate-600 mb-1">
                Successor (Blocked until predecessor finishes)
              </label>
              <select
                id="dep-succ"
                value={succId}
                onChange={(e) => setSuccId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              >
                {data.tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            {cyclePreview.hasCycle && (
              <p className="text-xs font-medium text-rose-600">
                Invalid link: creates a circular dependency loop.
              </p>
            )}

            <button
              type="submit"
              disabled={savingEdge || cyclePreview.hasCycle || data.tasks.length < 2}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-lg disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{savingEdge ? 'Validating...' : 'Link Dependency'}</span>
            </button>
          </form>

          {/* Existing Edges */}
          <div className="relative overflow-hidden rounded-xl border border-violet-200 bg-white p-5 space-y-3 shadow-xs">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-violet-600" />
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Active Dependency Links ({data.dependencies.length})
              </h2>
            </div>

            {data.dependencies.length === 0 ? (
              <p className="text-xs text-slate-500">No links defined yet.</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {data.dependencies.map((dep) => {
                  const pred = data.tasks.find((t) => t.id === dep.predecessorTaskId);
                  const succ = data.tasks.find((t) => t.id === dep.successorTaskId);
                  return (
                    <li
                      key={dep.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs border border-slate-200"
                    >
                      <span className="text-slate-800 truncate">
                        {pred?.title || dep.predecessorTaskId} →{' '}
                        {succ?.title || dep.successorTaskId}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove dependency ${pred?.title} to ${succ?.title}`}
                        onClick={() => handleRemoveDependency(dep.id)}
                        className="text-slate-400 hover:text-rose-600 shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
