import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { api } from '../../api/client.ts';
import type { ApprovalStatus, ProjectWorkspaceData } from '../../shared/types.ts';

interface CommitmentsPageProps {
  data: ProjectWorkspaceData;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export const CommitmentsPage: React.FC<CommitmentsPageProps> = ({
  data,
  onRefresh,
  onNotify,
}) => {
  const [filter, setFilter] = useState<'all' | ApprovalStatus>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = data.commitments.filter((c) =>
    filter === 'all' ? true : c.approvalStatus === filter
  );

  const handleDecision = async (id: string, status: ApprovalStatus) => {
    setBusyId(id);
    try {
      await api.updateCommitment(id, { approvalStatus: status });
      await onRefresh();
      onNotify(
        status === 'approved'
          ? 'Commitment approved and synced to Execution Board.'
          : 'Commitment marked as rejected.'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update commitment.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Commitment Tracker</h1>
          <p className="text-sm text-slate-600 mt-1">
            Every task traced back to its original spoken promise, confidence level, and review
            status.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200 self-start">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'pending_review', label: 'Pending Review' },
              { id: 'approved', label: 'Approved' },
              { id: 'rejected', label: 'Rejected' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-xs">
          No commitments match this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const linkedTask = data.tasks.find((t) => t.id === c.taskId);
            return (
              <div
                key={c.id}
                className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs"
              >
                <div
                  className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${
                    c.approvalStatus === 'approved'
                      ? 'from-emerald-500 to-teal-500'
                      : c.approvalStatus === 'pending_review'
                        ? 'from-amber-500 to-orange-500'
                        : 'from-slate-300 to-slate-400'
                  }`}
                />
                <div className="space-y-1.5 max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="text-slate-900 font-semibold">{c.ownerName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num">Due {c.dueDate}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-mono-num font-semibold ${
                        c.confidence === 'needs_confirmation'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {c.confidenceScore}% confidence
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-semibold capitalize ${
                        c.approvalStatus === 'approved'
                          ? 'text-emerald-700'
                          : c.approvalStatus === 'pending_review'
                            ? 'text-amber-700'
                            : 'text-slate-500'
                      }`}
                    >
                      {c.approvalStatus.replace('_', ' ')}
                    </span>
                  </div>

                  <h2 className="font-display text-base font-semibold text-slate-900">{c.title}</h2>
                  <p className="text-sm text-slate-600 italic">“{c.originalStatement}”</p>
                  {c.needsConfirmationReason && (
                    <p className="text-xs font-medium text-amber-700">{c.needsConfirmationReason}</p>
                  )}
                  {linkedTask && (
                    <p className="text-xs font-medium text-cyan-700">
                      Linked Execution Task: {linkedTask.title} ({linkedTask.status.replace('_', ' ')})
                    </p>
                  )}
                </div>

                {c.approvalStatus === 'pending_review' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => handleDecision(c.id, 'approved')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => handleDecision(c.id, 'rejected')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
