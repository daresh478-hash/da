import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Play, ShieldAlert, Sparkles } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../api/client.ts';
import { diffDaysUTC } from '../../engine/scheduler.ts';
import type {
  ProjectWorkspaceData,
  SimulationRecord,
  SimulationScenario,
} from '../../shared/types.ts';

interface WhatIfLabPageProps {
  data: ProjectWorkspaceData;
  preselectedTaskId?: string | null;
  onRefresh: () => Promise<void>;
  onOpenRecovery: (simulationId: string) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export const WhatIfLabPage: React.FC<WhatIfLabPageProps> = ({
  data,
  preselectedTaskId,
  onRefresh,
  onOpenRecovery,
  onNotify,
}) => {
  const [selectedTaskId, setSelectedTaskId] = useState<string>(
    preselectedTaskId || data.tasks[0]?.id || ''
  );
  const [delayDays, setDelayDays] = useState<number>(2);
  const [scenario, setScenario] = useState<SimulationScenario>('scope_creep');
  const [running, setRunning] = useState(false);
  const [generatingRecovery, setGeneratingRecovery] = useState(false);
  const [activeSimulation, setActiveSimulation] = useState<SimulationRecord | null>(
    data.simulations[0] || null
  );

  useEffect(() => {
    if (preselectedTaskId && data.tasks.some((t) => t.id === preselectedTaskId)) {
      setSelectedTaskId(preselectedTaskId);
    } else if (!data.tasks.some((t) => t.id === selectedTaskId) && data.tasks[0]) {
      setSelectedTaskId(data.tasks[0].id);
    }
  }, [preselectedTaskId, data.tasks, selectedTaskId]);

  useEffect(() => {
    if (!activeSimulation && data.simulations[0]) {
      setActiveSimulation(data.simulations[0]);
    }
  }, [data.simulations, activeSimulation]);

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskId) return;

    setRunning(true);
    try {
      const res = await api.runSimulation(data.project.id, {
        selectedTaskId,
        delayDays,
        scenario,
      });
      setActiveSimulation(res.simulation);
      await onRefresh();
      onNotify(
        `Simulation complete: +${delayDays}d delay on "${res.simulation.results.selectedTaskTitle}".`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Simulation failed.', 'error');
    } finally {
      setRunning(false);
    }
  };

  const handleGenerateRecovery = async () => {
    if (!activeSimulation) return;
    setGeneratingRecovery(true);
    try {
      await api.generateRecovery(activeSimulation.id);
      await onRefresh();
      onNotify('Generated 3 live Gemini recovery strategies for review.');
      onOpenRecovery(activeSimulation.id);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to generate recovery plan.', 'error');
    } finally {
      setGeneratingRecovery(false);
    }
  };

  const simResult = activeSimulation?.results || null;

  const chartData =
    simResult?.taskComparisons.map((c) => {
      const origDur = Math.max(1, diffDaysUTC(c.originalStartDate, c.originalDueDate));
      const simEndOffset = Math.max(
        origDur,
        diffDaysUTC(c.originalStartDate, c.simulatedDueDate)
      );
      return {
        name: c.title.length > 20 ? `${c.title.slice(0, 18)}…` : c.title,
        OriginalDays: origDur,
        SimulatedDays: simEndOffset,
        ShiftDays: c.shiftDays,
      };
    }) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-cyan-700 mb-1">
            Signature Innovation · Deterministic Scheduling Engine
          </p>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            What-If Lab — Future Impact Simulator
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Preview exact downstream schedule propagation, blocked tasks, and deadline threats
            without modifying your live project plan.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Simulation Input Panel */}
        <form
          onSubmit={handleRunSimulation}
          className="relative overflow-hidden lg:col-span-4 rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50/75 via-white to-white p-5 space-y-5 h-fit shadow-xs"
        >
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" />
          <h2 className="font-display text-base font-semibold text-slate-900">Simulation Input</h2>

          <div>
            <label htmlFor="sim-task" className="block text-xs font-medium text-slate-700 mb-1.5">
              Select Task to Delay
            </label>
            <select
              id="sim-task"
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {data.tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.ownerName})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label htmlFor="sim-delay" className="font-medium text-slate-700">
                Delay Duration (Days)
              </label>
              <span className="font-mono-num text-sm font-semibold text-cyan-700">
                +{delayDays} day{delayDays === 1 ? '' : 's'}
              </span>
            </div>
            <input
              id="sim-delay-range"
              type="range"
              min={0}
              max={10}
              step={1}
              value={delayDays}
              onChange={(e) => setDelayDays(Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer mb-2"
            />
            <input
              id="sim-delay"
              type="number"
              min={0}
              max={30}
              value={delayDays}
              onChange={(e) => setDelayDays(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 font-mono-num"
            />
          </div>

          <div>
            <label
              htmlFor="sim-scenario"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Delay Scenario
            </label>
            <select
              id="sim-scenario"
              value={scenario}
              onChange={(e) => setScenario(e.target.value as SimulationScenario)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="scope_creep">UI / Feature Scope Creep</option>
              <option value="resource_bottleneck">Owner Capacity Bottleneck</option>
              <option value="api_delay">Upstream API / Integration Blocker</option>
              <option value="custom">Custom Delay Scenario</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={running || data.tasks.length === 0}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 rounded-lg shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>{running ? 'Calculating Impact...' : 'Run Simulation'}</span>
          </button>

          {data.simulations.length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <p className="text-xs font-medium text-slate-600">Recent Simulations</p>
              <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                {data.simulations.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setActiveSimulation(s)}
                      className={`w-full text-left rounded-lg px-3 py-2 text-xs border transition-colors cursor-pointer ${
                        activeSimulation?.id === s.id
                          ? 'border-cyan-400 bg-cyan-50 text-slate-900 font-medium'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span className="font-medium">{s.results.selectedTaskTitle}</span> ·{' '}
                      <span className="font-mono-num font-semibold text-amber-700">+{s.delayDays}d</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>

        {/* Simulation Results */}
        <div className="lg:col-span-8 space-y-6">
          {!simResult ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center space-y-3 shadow-xs">
              <p className="font-display text-lg font-semibold text-slate-900">
                No Simulation Run Yet
              </p>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Select “Frontend Dashboard” with a 2-day delay on the left and click “Run
                Simulation” to calculate downstream impact across Sanjeev, Dharani, and Daresh.
              </p>
            </div>
          ) : (
            <>
              {simResult.hasCycle && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 flex items-center gap-3">
                  <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600" />
                  <span>{simResult.cycleMessage}</span>
                </div>
              )}

              {/* Summary Comparison Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="relative overflow-hidden rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50/85 via-white to-white p-4 shadow-xs">
                  <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 to-blue-600" />
                  <p className="text-xs text-slate-600">Original Finish</p>
                  <p className="font-mono-num text-lg font-bold text-cyan-700 mt-1">
                    {simResult.originalProjectEndDate}
                  </p>
                </div>
                <div
                  className={`relative overflow-hidden rounded-xl border p-4 shadow-xs ${
                    simResult.deadlineThreatened
                      ? 'border-rose-200 bg-gradient-to-br from-rose-50/85 via-white to-white'
                      : 'border-emerald-200 bg-gradient-to-br from-emerald-50/85 via-white to-white'
                  }`}
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${
                      simResult.deadlineThreatened
                        ? 'from-rose-500 to-orange-500'
                        : 'from-emerald-500 to-teal-500'
                    }`}
                  />
                  <p className="text-xs text-slate-600">Simulated Finish</p>
                  <p
                    className={`font-mono-num text-lg font-bold mt-1 ${
                      simResult.deadlineThreatened ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {simResult.simulatedProjectEndDate}
                  </p>
                </div>
                <div
                  className={`relative overflow-hidden rounded-xl border p-4 shadow-xs ${
                    simResult.estimatedProjectDelayDays > 0
                      ? 'border-orange-200 bg-gradient-to-br from-orange-50/85 via-white to-white'
                      : 'border-emerald-200 bg-gradient-to-br from-emerald-50/85 via-white to-white'
                  }`}
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${
                      simResult.estimatedProjectDelayDays > 0
                        ? 'from-amber-500 to-rose-500'
                        : 'from-emerald-500 to-cyan-500'
                    }`}
                  />
                  <p className="text-xs text-slate-600">Project Slip</p>
                  <p
                    className={`font-mono-num text-lg font-bold mt-1 ${
                      simResult.estimatedProjectDelayDays > 0 ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    +{simResult.estimatedProjectDelayDays} day(s)
                  </p>
                </div>
                <div className="relative overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/85 via-white to-white p-4 shadow-xs">
                  <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-500 to-orange-500" />
                  <p className="text-xs text-slate-600">Affected Tasks</p>
                  <p className="font-mono-num text-lg font-bold text-amber-700 mt-1">
                    {simResult.directlyAffectedTaskIds.length} direct ·{' '}
                    {simResult.indirectlyAffectedTaskIds.length} indirect
                  </p>
                </div>
              </div>

              {/* Action Callout to Recovery Planner */}
              <div className="relative overflow-hidden rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {simResult.deadlineThreatened ? (
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-cyan-600" />
                    )}
                    <span>
                      {simResult.deadlineThreatened
                        ? `Target deadline (${simResult.projectDeadline}) is threatened by ${simResult.estimatedProjectDelayDays} day(s)`
                        : `Schedule buffer absorbed delay; target deadline (${simResult.projectDeadline}) remains protected`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Notify:{' '}
                    {simResult.membersToNotify.length > 0
                      ? simResult.membersToNotify.join(', ')
                      : 'No downstream owners impacted'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateRecovery}
                  disabled={generatingRecovery}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 rounded-lg shadow-md shadow-violet-600/20 disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  {generatingRecovery ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>
                    {generatingRecovery ? 'Generating...' : 'Generate Recovery Options'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Before vs After Chart */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <h3 className="font-display text-base font-semibold text-slate-900 mb-4">
                  Before vs. After Window Span (Days from Task Baseline Start)
                </h3>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="origSpanGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0ea5e9" stopOpacity={1} />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity={0.9} />
                        </linearGradient>
                        <linearGradient id="simSpanGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
                          <stop offset="100%" stopColor="#e11d48" stopOpacity={0.9} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="name" stroke="#475569" fontSize={11} tickLine={false} />
                      <YAxis stroke="#475569" fontSize={11} allowDecimals={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderColor: '#cbd5e1',
                          borderRadius: 8,
                          color: '#0f172a',
                          fontSize: 12,
                          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.1)',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#334155' }} />
                      <Bar dataKey="OriginalDays" name="Original Span (d)" fill="url(#origSpanGrad)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="SimulatedDays" name="Simulated Span (d)" fill="url(#simSpanGrad)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Row-by-row Before & After Comparison */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <h3 className="font-display text-base font-semibold text-slate-900 mb-4">
                  Task-Level Impact Propagation
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-2.5 pr-4 font-medium">Task</th>
                        <th className="py-2.5 pr-4 font-medium">Owner</th>
                        <th className="py-2.5 pr-4 font-medium">Original Window</th>
                        <th className="py-2.5 pr-4 font-medium">Simulated Window</th>
                        <th className="py-2.5 pr-4 font-medium">Slack</th>
                        <th className="py-2.5 text-right font-medium">Impact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {simResult.taskComparisons.map((c) => (
                        <tr key={c.taskId} className="hover:bg-slate-50">
                          <td className="py-3 pr-4 font-medium text-slate-900">{c.title}</td>
                          <td className="py-3 pr-4 text-slate-700">{c.ownerName}</td>
                          <td className="py-3 pr-4 font-mono-num text-xs text-slate-500">
                            {c.originalStartDate} → {c.originalDueDate}
                          </td>
                          <td className="py-3 pr-4 font-mono-num text-xs font-medium text-cyan-700">
                            {c.simulatedStartDate} → {c.simulatedDueDate}
                          </td>
                          <td className="py-3 pr-4 font-mono-num text-xs text-slate-600">
                            {c.slackAvailable}d → {c.slackRemaining}d
                          </td>
                          <td className="py-3 text-right font-mono-num text-xs font-semibold">
                            {c.shiftDays > 0 ? (
                              <span
                                className={
                                  c.impactLevel === 'source'
                                    ? 'text-cyan-700'
                                    : c.threatensProjectDeadline
                                      ? 'text-rose-600'
                                      : 'text-amber-700'
                                }
                              >
                                +{c.shiftDays}d ({c.impactLevel})
                              </span>
                            ) : (
                              <span className="text-emerald-700">Unaffected</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
