import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client.ts';
import type {
  ProjectWorkspaceData,
  RecoveryOption,
  RecoveryPlanRecord,
} from '../../shared/types.ts';

interface RecoveryPlannerPageProps {
  data: ProjectWorkspaceData;
  activeSimulationId?: string | null;
  onRefresh: () => Promise<void>;
  onGoToSimulator: () => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export const RecoveryPlannerPage: React.FC<RecoveryPlannerPageProps> = ({
  data,
  activeSimulationId,
  onRefresh,
  onGoToSimulator,
  onNotify,
}) => {
  const [confirmingOption, setConfirmingOption] = useState<RecoveryOption | null>(null);
  const [applying, setApplying] = useState(false);
  const [generating, setGenerating] = useState(false);

  const activePlan: RecoveryPlanRecord | null =
    (activeSimulationId
      ? data.recoveryPlans.find((p) => p.simulationId === activeSimulationId)
      : null) ||
    data.recoveryPlans[0] ||
    null;

  const latestSimulation =
    (activePlan
      ? data.simulations.find((s) => s.id === activePlan.simulationId)
      : null) ||
    data.simulations[0] ||
    null;

  const handleGenerateFromLatestSim = async () => {
    if (!latestSimulation) {
      onGoToSimulator();
      return;
    }
    setGenerating(true);
    try {
      await api.generateRecovery(latestSimulation.id);
      await onRefresh();
      onNotify('Generated fresh live Gemini recovery strategies.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to generate recovery plan.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirmApply = async () => {
    if (!activePlan || !confirmingOption) return;
    setApplying(true);
    try {
      await api.applyRecoveryOption(activePlan.id, confirmingOption.id);
      await onRefresh();
      setConfirmingOption(null);
      onNotify(`Applied "${confirmingOption.title}" to Execution Twin.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to apply recovery option.', 'error');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">AI Recovery Planner</h1>
          <p className="text-sm text-slate-600 mt-1">
            Compare recovery strategies, inspect trade-offs, and approve changes before any
            project date or dependency is modified.
          </p>
        </div>

        {latestSimulation && (
          <button
            type="button"
            onClick={handleGenerateFromLatestSim}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 rounded-lg shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer self-start whitespace-nowrap"
          >
            {generating && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{generating ? 'Generating...' : 'Regenerate Recovery Options'}</span>
          </button>
        )}
      </div>

      {!activePlan ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center space-y-4 shadow-xs">
          <p className="font-display text-lg font-semibold text-slate-900">
            No Recovery Plan Generated Yet
          </p>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Run a delay simulation in the What-If Lab first, then generate recovery options to
            compare parallel execution, revised timelines, and scope adjustments.
          </p>
          <button
            type="button"
            onClick={onGoToSimulator}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg cursor-pointer shadow-sm"
          >
            Open What-If Lab
          </button>
        </div>
      ) : (
        <>
          {/* Context & Trust Disclaimer */}
          <div className="relative overflow-hidden rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-white to-cyan-50/75 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 via-violet-500 to-emerald-500" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="text-cyan-700 font-semibold">
                  Live Gemini AI ({activePlan.aiModel || 'gemini-4-hydrogen'})
                </span>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    activePlan.approvalStatus === 'approved'
                      ? 'text-emerald-700 font-semibold'
                      : 'text-amber-700 font-semibold'
                  }
                >
                  Status:{' '}
                  {activePlan.approvalStatus === 'approved'
                    ? 'Approved & Applied'
                    : 'Awaiting Human Approval'}
                </span>
              </div>
              {latestSimulation && (
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Addressing +{latestSimulation.delayDays}d delay on “
                  {latestSimulation.results.selectedTaskTitle}”
                </h2>
              )}
              <p className="text-xs text-slate-600">{activePlan.disclaimer}</p>
            </div>
          </div>

          {/* 3 Strategy Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {activePlan.options.map((opt) => {
              const isChosen =
                activePlan.approvalStatus === 'approved' &&
                activePlan.selectedOptionId === opt.id;

              const theme =
                opt.optionCode === 'A'
                  ? {
                      card: 'border-cyan-200 bg-gradient-to-b from-cyan-50/80 via-white to-white',
                      top: 'from-cyan-500 to-blue-600',
                      code: 'text-cyan-700',
                      btn: 'from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-cyan-500/15',
                    }
                  : opt.optionCode === 'B'
                    ? {
                        card: 'border-violet-200 bg-gradient-to-b from-violet-50/80 via-white to-white',
                        top: 'from-indigo-500 to-violet-600',
                        code: 'text-violet-700',
                        btn: 'from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-violet-500/15',
                      }
                    : {
                        card: 'border-emerald-200 bg-gradient-to-b from-emerald-50/80 via-white to-white',
                        top: 'from-emerald-500 to-teal-600',
                        code: 'text-emerald-700',
                        btn: 'from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/15',
                      };

              return (
                <div
                  key={opt.id}
                  className={`relative overflow-hidden rounded-xl border p-6 flex flex-col justify-between gap-5 shadow-xs ${
                    isChosen
                      ? 'border-emerald-400 bg-gradient-to-b from-emerald-50 via-white to-white ring-1 ring-emerald-300 shadow-md shadow-emerald-500/10'
                      : theme.card
                  }`}
                >
                  <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${theme.top}`} />
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className={`font-mono-num font-semibold ${theme.code}`}>
                        Option {opt.optionCode}
                      </span>
                      <span className="font-mono-num font-semibold text-emerald-700">
                        Recovers ~{opt.estimatedDaysRecovered}d
                      </span>
                    </div>

                    <div>
                      <h3 className="font-display text-lg font-semibold text-slate-900">
                        {opt.title}
                      </h3>
                      <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{opt.summary}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-800 mb-1.5">
                        Affected Tasks
                      </p>
                      <p className="text-xs text-slate-600">
                        {opt.affectedTaskTitles.join(', ')}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-emerald-700 mb-1.5">Benefits</p>
                      <ul className="space-y-1 text-xs text-slate-700 list-disc pl-4">
                        {opt.benefits.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-amber-700 mb-1.5">
                        Trade-offs &amp; Assumptions
                      </p>
                      <ul className="space-y-1 text-xs text-slate-600 list-disc pl-4">
                        {opt.tradeOffs.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                        {opt.assumptions.map((a, i) => (
                          <li key={`a-${i}`} className="italic">
                            Assumption: {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200/80">
                    {isChosen ? (
                      <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Approved &amp; Applied to Execution Plan</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={activePlan.approvalStatus === 'approved'}
                        onClick={() => setConfirmingOption(opt)}
                        className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r ${theme.btn} rounded-lg shadow-md disabled:opacity-40 transition-all cursor-pointer`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Review &amp; Approve Option {opt.optionCode}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Explicit Human Approval Confirmation Modal */}
      {confirmingOption && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-recovery-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 space-y-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h2 id="confirm-recovery-title" className="font-display text-lg font-bold text-slate-900">
                  Confirm Recovery Plan Application
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  You are about to apply <strong>{confirmingOption.title}</strong> to{' '}
                  <strong>{data.project.name}</strong>.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                Proposed Execution Twin Changes ({confirmingOption.proposedChanges.length})
              </p>
              {confirmingOption.proposedChanges.length === 0 ? (
                <p className="text-xs text-slate-600">
                  Records approval of this strategy in the project audit log.
                </p>
              ) : (
                <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                  {confirmingOption.proposedChanges.map((ch, idx) => (
                    <li key={idx}>
                      <span className="font-semibold text-slate-900">{ch.taskTitle}:</span>{' '}
                      {ch.description}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmingOption(null)}
                disabled={applying}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApply}
                disabled={applying}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {applying && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{applying ? 'Applying...' : 'Confirm & Apply Changes'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
