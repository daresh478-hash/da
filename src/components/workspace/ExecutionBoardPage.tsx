import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client.ts';
import type {
  ProjectWorkspaceData,
  Task,
  TaskPriority,
  TaskStatus,
} from '../../shared/types.ts';

interface ExecutionBoardPageProps {
  data: ProjectWorkspaceData;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const COLUMNS: Array<{
  id: TaskStatus;
  label: string;
  tone: string;
  accentBar: string;
  colBg: string;
  countClass: string;
}> = [
  {
    id: 'todo',
    label: 'To Do',
    tone: 'text-indigo-700',
    accentBar: 'from-slate-400 via-indigo-500 to-blue-500',
    colBg: 'border-indigo-200 bg-gradient-to-b from-indigo-50/75 via-white to-white shadow-xs',
    countClass: 'text-indigo-700',
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    tone: 'text-cyan-700',
    accentBar: 'from-blue-500 via-cyan-500 to-sky-500',
    colBg: 'border-cyan-200 bg-gradient-to-b from-cyan-50/75 via-white to-white shadow-xs',
    countClass: 'text-cyan-700',
  },
  {
    id: 'blocked',
    label: 'Blocked',
    tone: 'text-rose-700',
    accentBar: 'from-rose-500 via-orange-500 to-amber-500',
    colBg: 'border-rose-200 bg-gradient-to-b from-rose-50/75 via-white to-white shadow-xs',
    countClass: 'text-rose-700',
  },
  {
    id: 'completed',
    label: 'Completed',
    tone: 'text-emerald-700',
    accentBar: 'from-emerald-500 via-teal-500 to-cyan-500',
    colBg: 'border-emerald-200 bg-gradient-to-b from-emerald-50/75 via-white to-white shadow-xs',
    countClass: 'text-emerald-700',
  },
];

const PRIORITY_TEXT_TONE: Record<TaskPriority, string> = {
  critical: 'text-rose-600 font-semibold',
  high: 'text-amber-700 font-medium',
  medium: 'text-cyan-700',
  low: 'text-slate-500',
};

export const ExecutionBoardPage: React.FC<ExecutionBoardPageProps> = ({
  data,
  onRefresh,
  onNotify,
}) => {
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [showNewModal, setShowNewModal] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const todayStr = new Date().toISOString().slice(0, 10);
  const defaultDueStr = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const [ownerName, setOwnerName] = useState(data.members[0]?.name || 'Unassigned');
  const [startDate, setStartDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState(defaultDueStr);
  const [duration, setDuration] = useState(2);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [submitting, setSubmitting] = useState(false);

  const filteredTasks = data.tasks.filter((t) =>
    ownerFilter === 'all' ? true : t.ownerName === ownerFilter
  );

  const handleStatusChange = async (task: Task, newStatus: TaskStatus) => {
    try {
      await api.updateTask(task.id, { status: newStatus });
      await onRefresh();
      onNotify(`Moved "${task.title}" to ${newStatus.replace('_', ' ')}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update task.', 'error');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await api.createTask(data.project.id, {
        title: title.trim(),
        description: description.trim(),
        ownerName,
        startDate,
        dueDate,
        estimatedDuration: Math.max(1, duration),
        priority,
        status: 'todo',
      });
      await onRefresh();
      setShowNewModal(false);
      setTitle('');
      setDescription('');
      onNotify('Task added to Execution Board.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to create task.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTask = async (task: Task) => {
    try {
      await api.deleteTask(task.id);
      await onRefresh();
      onNotify(`Deleted task "${task.title}".`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to delete task.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-cyan-700 mb-1">
            Live Delivery Flow · Ownership &amp; Dependency Readiness
          </p>
          <h1 className="font-display text-2xl font-bold text-slate-900">Execution Board</h1>
          <p className="text-sm text-slate-600 mt-1">
            Track task status, ownership, and dependency readiness across the Execution Twin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter tasks by owner"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs"
          >
            <option value="all">All Owners</option>
            {data.members.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowNewModal((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 rounded-lg shadow-md shadow-blue-600/20 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Task</span>
          </button>
        </div>
      </div>

      {showNewModal && (
        <form
          onSubmit={handleCreateTask}
          className="relative overflow-hidden rounded-xl border border-cyan-200 bg-gradient-to-br from-sky-50/80 via-white to-violet-50/70 p-5 space-y-4 shadow-sm"
        >
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" />
          <h2 className="font-display text-base font-semibold text-slate-900">Create Task</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="new-task-title" className="block text-xs font-medium text-slate-700 mb-1">
                Task Title *
              </label>
              <input
                id="new-task-title"
                required
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Security Audit & Rate Limiting"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
            <div>
              <label htmlFor="new-task-owner" className="block text-xs font-medium text-slate-700 mb-1">
                Owner
              </label>
              <select
                id="new-task-owner"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {data.members.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
                <option value="Unassigned">Unassigned</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label htmlFor="new-task-start" className="block text-xs font-medium text-slate-700 mb-1">
                Start Date
              </label>
              <input
                id="new-task-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 font-mono-num"
              />
            </div>
            <div>
              <label htmlFor="new-task-due" className="block text-xs font-medium text-slate-700 mb-1">
                Due Date
              </label>
              <input
                id="new-task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 font-mono-num"
              />
            </div>
            <div>
              <label htmlFor="new-task-dur" className="block text-xs font-medium text-slate-700 mb-1">
                Duration (Days)
              </label>
              <input
                id="new-task-dur"
                type="number"
                min={1}
                max={30}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 1)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 font-mono-num"
              />
            </div>
            <div>
              <label htmlFor="new-task-prio" className="block text-xs font-medium text-slate-700 mb-1">
                Priority
              </label>
              <select
                id="new-task-prio"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowNewModal(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg cursor-pointer shadow-sm"
            >
              {submitting ? 'Saving...' : 'Create Task'}
            </button>
          </div>
        </form>
      )}

      {/* Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map((col) => {
          const colTasks = filteredTasks.filter((t) => t.status === col.id);
          return (
            <div
              key={col.id}
              className={`relative overflow-hidden rounded-xl border p-4 flex flex-col gap-3 min-h-[280px] ${col.colBg}`}
            >
              <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${col.accentBar}`} />
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                <h2 className={`font-display text-sm font-semibold ${col.tone}`}>{col.label}</h2>
                <span className={`font-mono-num text-xs font-semibold ${col.countClass}`}>
                  {colTasks.length}
                </span>
              </div>

              {colTasks.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No tasks in {col.label}</p>
              ) : (
                <div className="space-y-3">
                  {colTasks.map((task) => {
                    const node = data.schedule[task.id];
                    const blockers = (node?.predecessorIds || [])
                      .map((pid) => data.tasks.find((pt) => pt.id === pid))
                      .filter((pt): pt is Task => Boolean(pt && pt.status !== 'completed'));

                    return (
                      <div
                        key={task.id}
                        className="rounded-lg border border-slate-200 hover:border-slate-300 bg-white p-3.5 space-y-2.5 shadow-2xs transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                            {task.title}
                          </h3>
                          <button
                            type="button"
                            aria-label={`Delete task ${task.title}`}
                            onClick={() => handleDeleteTask(task)}
                            className="text-slate-400 hover:text-rose-600 shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {task.description && (
                          <p className="text-xs text-slate-600 line-clamp-2">{task.description}</p>
                        )}

                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span className="text-slate-800 font-medium">{task.ownerName}</span>
                          <span className="font-mono-num text-cyan-700 font-medium">{task.dueDate}</span>
                        </div>

                        {blockers.length > 0 && task.status !== 'completed' && (
                          <p className="text-xs font-medium text-amber-700">
                            Waiting on: {blockers.map((b) => b.title).join(', ')}
                          </p>
                        )}

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                          <span className="text-xs capitalize">
                            <span className={PRIORITY_TEXT_TONE[task.priority]}>{task.priority}</span>
                            <span className="text-slate-500"> · {task.estimatedDuration}d</span>
                          </span>
                          <select
                            aria-label={`Move ${task.title} status`}
                            value={task.status}
                            onChange={(e) =>
                              handleStatusChange(task, e.target.value as TaskStatus)
                            }
                            className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-800 cursor-pointer"
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="blocked">Blocked</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
