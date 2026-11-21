import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, Sliders } from 'lucide-react';
import { api } from '../../api/client.ts';
import type { ProjectWorkspaceData } from '../../shared/types.ts';

interface RiskRadarPageProps {
  data: ProjectWorkspaceData;
  onSimulateTask: (taskId: string) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export const RiskRadarPage: React.FC<RiskRadarPageProps> = ({
  data,
  onSimulateTask,
  onNotify,
}) => {
  const [insight, setInsight] = useState<string | null>(null);
  const [insightModel, setInsightModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleExplainRisks = async () => {
    setLoading(true);
    try {
      const res = await api.explainRisks(data.project.id);
      setInsight(res.insight);
      setInsightModel(res.aiModel);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to explain risks.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Risk Radar</h1>
          <p className="text-sm text-slate-600 mt-1">
            Deterministic execution risks identified from overdue tasks, blockers, missing owners,
            and zero-slack chains.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExplainRisks}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-rose-600 via-orange-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 rounded-lg shadow-md shadow-rose-500/20 disabled:opacity-50 cursor-pointer self-start whitespace-nowrap"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Analyzing Risks...' : 'Generate AI Risk Briefing'}</span>
        </button>
      </div>

      {insight && (
        <section className="relative overflow-hidden rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-5 space-y-2 shadow-xs">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-violet-500 to-cyan-500" />
          <div className="flex items-center justify-between text-xs font-semibold text-violet-700">
            <span>Execution Risk Explanation</span>
            <span>Live Gemini AI ({insightModel || 'gemini-4-hydrogen'})</span>
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">{insight}</p>
        </section>
      )}

      {data.risks.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 flex items-center gap-3 text-emerald-800">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <span className="text-sm">
            No execution risks detected across tasks, dependencies, or commitments.
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {data.risks.map((risk) => {
            const sevTheme =
              risk.severity === 'critical'
                ? 'border-rose-200 bg-gradient-to-r from-rose-50/85 via-white to-white'
                : risk.severity === 'high'
                  ? 'border-amber-200 bg-gradient-to-r from-amber-50/85 via-white to-white'
                  : 'border-cyan-200 bg-gradient-to-r from-cyan-50/85 via-white to-white';

            const topBar =
              risk.severity === 'critical'
                ? 'from-rose-500 to-orange-500'
                : risk.severity === 'high'
                  ? 'from-amber-500 to-orange-500'
                  : 'from-cyan-500 to-blue-600';

            return (
              <div
                key={risk.id}
                className={`relative overflow-hidden rounded-xl border p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs ${sevTheme}`}
              >
                <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${topBar}`} />
                <div className="space-y-1.5 max-w-3xl">
                  <div className="flex items-center gap-2 text-xs">
                    {risk.severity === 'critical' ? (
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                    ) : (
                      <AlertTriangle
                        className={`w-4 h-4 ${
                          risk.severity === 'high' ? 'text-amber-600' : 'text-cyan-600'
                        }`}
                      />
                    )}
                    <span
                      className={`font-semibold uppercase tracking-wide ${
                        risk.severity === 'critical'
                          ? 'text-rose-700'
                          : risk.severity === 'high'
                            ? 'text-amber-700'
                            : 'text-cyan-700'
                      }`}
                    >
                      {risk.severity}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">
                      ·
                    </span>
                    <span className="text-slate-600 capitalize">
                      {risk.category.replace('_', ' ')}
                    </span>
                    {risk.ownerName && (
                      <>
                        <span aria-hidden="true" className="text-slate-400">
                          ·
                        </span>
                        <span className="text-slate-900 font-medium">{risk.ownerName}</span>
                      </>
                    )}
                  </div>

                  <h2 className="font-display text-base font-semibold text-slate-900">{risk.title}</h2>
                  <p className="text-sm text-slate-700">{risk.description}</p>
                  <p className="text-xs font-medium text-cyan-700">Recommended: {risk.recommendedAction}</p>
                </div>

                {risk.taskId && (
                  <button
                    type="button"
                    onClick={() => onSimulateTask(risk.taskId!)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg shadow-sm cursor-pointer shrink-0 self-start lg:self-center"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Simulate Delay</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
