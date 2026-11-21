import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FolderKanban,
  GitBranch,
  Layers,
  Lock,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../api/client.ts';
import type { ProjectWorkspaceData, TaskStatus } from '../../shared/types.ts';

export type WorkspacePageId =
  | 'overview'
  | 'projects'
  | 'meetings'
  | 'commitments'
  | 'board'
  | 'dependencies'
  | 'simulator'
  | 'recovery'
  | 'risks'
  | 'settings';

interface OverviewPageProps {
  data: ProjectWorkspaceData;
  onNavigate: (page: WorkspacePageId) => void;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  data,
  onNavigate,
  onRefresh,
  onNotify,
}) => {
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [insightModel, setInsightModel] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const { project, tasks, commitments, dependencies, risks, metrics, schedule } = data;

  const statusChartData = [
    { name: 'To Do', count: tasks.filter((t) => t.status === 'todo').length, fill: 'url(#barTodo)' },
    {
      name: 'In Progress',
      count: tasks.filter((t) => t.status === 'in_progress').length,
      fill: 'url(#barProgress)',
    },
    {
      name: 'Blocked',
      count: tasks.filter(
        (t) => t.status === 'blocked' || Boolean(schedule[t.id]?.isBlockedByDependency)
      ).length,
      fill: 'url(#barBlocked)',
    },
    {
      name: 'Completed',
      count: tasks.filter((t) => t.status === 'completed').length,
      fill: 'url(#barDone)',
    },
  ];

  const handleGenerateInsight = async () => {
    setLoadingInsight(true);
    try {
      const res = await api.explainRisks(project.id);
      setAiInsight(res.insight);
      setInsightModel(res.aiModel);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to generate AI insight.', 'error');
    } finally {
      setLoadingInsight(false);
    }
  };

  const handleQuickTaskStatus = async (taskId: string, status: TaskStatus) => {
    try {
      await api.updateTask(taskId, { status });
      await onRefresh();
      onNotify('Task status updated on Execution Twin.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update task.', 'error');
    }
  };

  const upcomingTasks = [...tasks]
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 6);

  const kpiCards = [
    {
      label: 'Total Projects',
      value: metrics.totalProjects,
      tone: 'text-indigo-700',
      border: 'border-indigo-200',
      topLine: 'from-indigo-500 to-blue-500',
      bg: 'from-indigo-50/85 via-white to-white',
      icon: FolderKanban,
    },
    {
      label: 'Active Tasks',
      value: metrics.activeTasks,
      tone: 'text-sky-700',
      border: 'border-sky-200',
      topLine: 'from-sky-500 to-blue-600',
      bg: 'from-sky-50/85 via-white to-white',
      icon: Activity,
    },
    {
      label: 'Completed',
      value: metrics.completedTasks,
      tone: 'text-emerald-700',
      border: 'border-emerald-200',
      topLine: 'from-emerald-500 to-teal-500',
      bg: 'from-emerald-50/85 via-white to-white',
      icon: CheckCircle2,
    },
    {
      label: 'Pending Commitments',
      value: metrics.pendingCommitments,
      tone: metrics.pendingCommitments > 0 ? 'text-amber-700' : 'text-slate-800',
      border: 'border-amber-200',
      topLine: 'from-amber-500 to-orange-500',
      bg: 'from-amber-50/85 via-white to-white',
      icon: ClipboardCheck,
    },
    {
      label: 'Blocked Tasks',
      value: metrics.blockedTasks,
      tone: metrics.blockedTasks > 0 ? 'text-orange-700' : 'text-slate-800',
      border: 'border-orange-200',
      topLine: 'from-orange-500 to-rose-500',
      bg: 'from-orange-50/85 via-white to-white',
      icon: Lock,
    },
    {
      label: 'Overdue Tasks',
      value: metrics.overdueTasks,
      tone: metrics.overdueTasks > 0 ? 'text-rose-700' : 'text-emerald-700',
      border: metrics.overdueTasks > 0 ? 'border-rose-200' : 'border-emerald-200',
      topLine: metrics.overdueTasks > 0 ? 'from-rose-500 to-red-600' : 'from-emerald-500 to-cyan-500',
      bg: metrics.overdueTasks > 0 ? 'from-rose-50/90 via-white to-white' : 'from-emerald-50/75 via-white to-white',
      icon: AlertTriangle,
    },
    {
      label: 'Upcoming (5d)',
      value: metrics.upcomingDeadlines,
      tone: 'text-cyan-700',
      border: 'border-cyan-200',
      topLine: 'from-cyan-500 to-sky-500',
      bg: 'from-cyan-50/85 via-white to-white',
      icon: CalendarClock,
    },
    {
      label: 'At-Risk Tasks',
      value: metrics.atRiskTasks,
      tone: metrics.atRiskTasks > 0 ? 'text-rose-700' : 'text-emerald-700',
      border: 'border-violet-200',
      topLine: 'from-violet-500 to-rose-500',
      bg: 'from-violet-50/85 via-white to-white',
      icon: ShieldAlert,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Contextual Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mb-1">
            <span className="text-blue-600 font-semibold">Execution Twin Dashboard</span>
            <span aria-hidden="true">·</span>
            <span>Target Deadline {project.deadline}</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900">{project.name}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('meetings')}
            className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            Analyze Meeting
          </button>
          <button
            type="button"
            onClick={() => onNavigate('simulator')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 rounded-lg shadow-md shadow-blue-600/20 transition-all cursor-pointer whitespace-nowrap"
          >
            <span>Run What-If Delay</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Overview Metrics Strip (Color-Coded 4x2 Grid) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className={`relative overflow-hidden rounded-xl border ${kpi.border} bg-gradient-to-br ${kpi.bg} px-4 py-3.5 shadow-xs`}
            >
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r ${kpi.topLine}`}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-600 truncate">{kpi.label}</p>
                <Icon className={`w-3.5 h-3.5 shrink-0 ${kpi.tone}`} />
              </div>
              <p className={`font-mono-num text-2xl font-bold mt-1.5 ${kpi.tone}`}>{kpi.value}</p>
            </div>
          );
        })}
      </div>

      {/* Row 1: A. Project Health + F. Recent AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-xl border border-blue-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Project Health &amp; Execution Distribution
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Computed from {tasks.length} tasks and {dependencies.length} dependency links ·{' '}
                <span
                  className={
                    metrics.healthStatus === 'Critical'
                      ? 'text-rose-600 font-semibold'
                      : metrics.healthStatus === 'At Risk'
                        ? 'text-amber-600 font-semibold'
                        : 'text-emerald-600 font-semibold'
                  }
                >
                  Status: {metrics.healthStatus}
                </span>
              </p>
            </div>
            <span className="font-mono-num text-lg font-bold bg-gradient-to-r from-blue-600 to-emerald-600 bg-clip-text text-transparent">
              {metrics.completionRate}% done
            </span>
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusChartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="barTodo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#94a3b8" />
                    <stop offset="100%" stopColor="#64748b" />
                  </linearGradient>
                  <linearGradient id="barProgress" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" />
                    <stop offset="100%" stopColor="#2563eb" />
                  </linearGradient>
                  <linearGradient id="barBlocked" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb7185" />
                    <stop offset="100%" stopColor="#e11d48" />
                  </linearGradient>
                  <linearGradient id="barDone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" stroke="#475569" fontSize={12} tickLine={false} />
                <YAxis stroke="#475569" fontSize={12} allowDecimals={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    color: '#0f172a',
                    fontSize: 12,
                    boxShadow: '0 10px 25px rgba(15,23,42,0.08)',
                  }}
                />
                <Bar dataKey="count" radius={[7, 7, 0, 0]} maxBarSize={52}>
                  {statusChartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* F. Recent AI Insights */}
        <section className="relative overflow-hidden lg:col-span-5 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/85 via-white to-sky-50/70 p-5 flex flex-col justify-between shadow-xs">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-violet-500 to-blue-500" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" />
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Execution Twin Insights
                </h2>
              </div>
              <button
                type="button"
                onClick={handleGenerateInsight}
                disabled={loadingInsight}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingInsight ? 'animate-spin' : ''}`} />
                <span>{loadingInsight ? 'Analyzing...' : 'Refresh Insight'}</span>
              </button>
            </div>

            <div className="rounded-lg border border-violet-200/80 bg-white/90 p-4 text-sm text-slate-700 leading-relaxed">
              {aiInsight ? (
                <div className="space-y-2">
                  <p>{aiInsight}</p>
                  <p className="text-xs font-medium text-violet-700">
                    Source: Live Gemini AI ({insightModel || 'gemini-4-hydrogen'})
                  </p>
                </div>
              ) : (
                <p>
                  {risks.length > 0
                    ? `${risks.length} active execution signal(s) detected. Top priority: ${risks[0].title}. Click "Refresh Insight" for a live Gemini briefing.`
                    : 'All tasks and commitments are currently nominal with zero active blockers.'}
                </p>
              )}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>
              Engine: <span className="font-medium text-slate-800">Live Gemini AI</span>
            </span>
            <button
              type="button"
              onClick={() => onNavigate('recovery')}
              className="text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer"
            >
              Open Recovery Planner →
            </button>
          </div>
        </section>
      </div>

      {/* Row 2: B. Commitment Tracker + D. Dependency Intelligence + E. Risk Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* B. Commitment Tracker */}
        <section className="relative overflow-hidden lg:col-span-4 rounded-xl border border-sky-200 bg-white p-5 space-y-4 shadow-xs">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-sky-500 to-blue-600" />
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Commitment Tracker
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('commitments')}
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 cursor-pointer"
            >
              View all ({commitments.length})
            </button>
          </div>

          {commitments.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              No commitments tracked yet. Analyze a meeting transcript to extract promises.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {commitments.slice(0, 4).map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/75 px-3.5 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">{c.title}</span>
                    <span
                      className={`text-xs font-semibold shrink-0 ${
                        c.approvalStatus === 'approved'
                          ? 'text-emerald-600'
                          : c.approvalStatus === 'pending_review'
                            ? 'text-amber-600'
                            : 'text-slate-500'
                      }`}
                    >
                      {c.approvalStatus === 'pending_review'
                        ? 'Needs Review'
                        : c.approvalStatus === 'approved'
                          ? 'Approved'
                          : 'Rejected'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {c.ownerName} · Due <span className="font-mono-num">{c.dueDate}</span> ·{' '}
                    <span className="font-mono-num font-medium text-sky-700">{c.confidenceScore}%</span> confidence
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* D. Dependency Intelligence Preview */}
        <section className="relative overflow-hidden lg:col-span-4 rounded-xl border border-cyan-200 bg-white p-5 space-y-4 shadow-xs">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 to-indigo-500" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-cyan-600" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Dependency Intelligence
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('dependencies')}
              className="text-xs font-semibold text-cyan-700 hover:text-cyan-800 cursor-pointer"
            >
              Open Graph →
            </button>
          </div>

          {dependencies.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              No dependency links yet. Connect tasks in Dependency DNA.
            </p>
          ) : (
            <ul className="space-y-2">
              {dependencies.slice(0, 4).map((dep) => {
                const pred = tasks.find((t) => t.id === dep.predecessorTaskId);
                const succ = tasks.find((t) => t.id === dep.successorTaskId);
                if (!pred || !succ) return null;
                const isCritical =
                  schedule[pred.id]?.isCritical && schedule[succ.id]?.isCritical;
                return (
                  <li
                    key={dep.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/75 px-3 py-2 text-xs flex items-center justify-between gap-2"
                  >
                    <span className="text-slate-800 font-medium truncate">
                      {pred.title} <span className="text-cyan-600">→</span> {succ.title}
                    </span>
                    <span
                      className={`shrink-0 font-mono-num font-semibold ${
                        isCritical ? 'text-amber-600' : 'text-blue-600'
                      }`}
                    >
                      {isCritical ? 'Critical' : 'Linked'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* E. Risk Radar */}
        <section className="relative overflow-hidden lg:col-span-4 rounded-xl border border-rose-200 bg-white p-5 space-y-4 shadow-xs">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-rose-500 to-amber-500" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <h2 className="font-display text-base font-semibold text-slate-900">Risk Radar</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('risks')}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
            >
              View all ({risks.length})
            </button>
          </div>

          {risks.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700 py-4">
              <CheckCircle2 className="w-4 h-4" />
              <span>Zero active execution risks detected.</span>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {risks.slice(0, 3).map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/75 px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle
                      className={`w-3.5 h-3.5 shrink-0 ${
                        r.severity === 'critical'
                          ? 'text-rose-600'
                          : r.severity === 'high'
                            ? 'text-amber-600'
                            : 'text-sky-600'
                      }`}
                    />
                    <span className="text-xs font-semibold text-slate-900 truncate">{r.title}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">{r.description}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Row 3: C. Task Execution Snapshot & G. Upcoming Deadlines */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-blue-600" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Upcoming Deadlines &amp; Quick Execution Controls
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('board')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Open Execution Board</span>
          </button>
        </div>

        {upcomingTasks.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">
            All tasks are completed! Create a task or analyze a new meeting to continue.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">Task</th>
                  <th className="py-2.5 pr-4 font-medium">Owner</th>
                  <th className="py-2.5 pr-4 font-medium">Due Date</th>
                  <th className="py-2.5 pr-4 font-medium">Slack</th>
                  <th className="py-2.5 pr-4 font-medium">Status</th>
                  <th className="py-2.5 text-right font-medium">Update Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {upcomingTasks.map((task) => {
                  const node = schedule[task.id];
                  return (
                    <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-4 font-semibold text-slate-900">{task.title}</td>
                      <td className="py-3 pr-4 text-slate-600">{task.ownerName}</td>
                      <td className="py-3 pr-4 font-mono-num text-slate-600">{task.dueDate}</td>
                      <td className="py-3 pr-4 font-mono-num">
                        <span
                          className={
                            node?.slackDays === 0 ? 'text-amber-600 font-semibold' : 'text-sky-700 font-medium'
                          }
                        >
                          {node ? `${node.slackDays}d` : '—'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-xs font-semibold">
                        <span
                          className={
                            task.status === 'blocked' || node?.isBlockedByDependency
                              ? 'text-rose-600'
                              : task.status === 'in_progress'
                                ? 'text-blue-600'
                                : 'text-slate-600'
                          }
                        >
                          {node?.isBlockedByDependency && task.status !== 'blocked'
                            ? 'Waiting on Predecessor'
                            : task.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <select
                          aria-label={`Change status for ${task.title}`}
                          value={task.status}
                          onChange={(e) =>
                            handleQuickTaskStatus(task.id, e.target.value as TaskStatus)
                          }
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 cursor-pointer"
                        >
                          <option value="todo">To Do</option>
                          <option value="in_progress">In Progress</option>
                          <option value="blocked">Blocked</option>
                          <option value="completed">Completed</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
