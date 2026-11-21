import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import type {
  ExtractedMeetingAnalysis,
  ExtractedTaskDraft,
  ProjectWorkspaceData,
  TaskPriority,
} from '../../shared/types.ts';

interface MeetingIntelligencePageProps {
  data: ProjectWorkspaceData;
  onRefresh: () => Promise<void>;
  onNavigateBoard: () => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const EXAMPLE_TRANSCRIPT = `Daresh: "We need to complete the release analytics and scorecard sprint before launch."
Arun: "I'll build the interactive Scorecard UI by Friday."
Sanjeev: "I'll wire the analytics persistence endpoint once Arun finishes the scorecard UI."
Dharani: "I'll run accessibility and end-to-end verification after Sanjeev completes the API wiring."
Daresh: "I'll finalize the release walkthrough script before Monday."`;

export const MeetingIntelligencePage: React.FC<MeetingIntelligencePageProps> = ({
  data,
  onRefresh,
  onNavigateBoard,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [uploadedPdfBase64, setUploadedPdfBase64] = useState<string | undefined>(undefined);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ExtractedMeetingAnalysis | null>(null);
  const [drafts, setDrafts] = useState<ExtractedTaskDraft[]>([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64Content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsDataURL(file);
      });

      const parsed = await api.uploadMeetingFile({
        fileName: file.name,
        mimeType: file.type || 'text/plain',
        base64Content,
      });

      setUploadedFileName(parsed.fileName);
      if (parsed.extractedText) {
        setTranscript(parsed.extractedText);
      }
      setUploadedPdfBase64(parsed.requiresMultimodalPdf ? parsed.pdfBase64 : undefined);
      onNotify(`Loaded "${parsed.fileName}" successfully.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'File upload failed.', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAnalyze = async () => {
    if (!transcript.trim() && !uploadedPdfBase64) {
      onNotify('Paste a meeting transcript or upload a TXT/PDF file first.', 'error');
      return;
    }

    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await api.analyzeMeeting(data.project.id, {
        title: meetingTitle.trim() || undefined,
        transcript,
        pdfBase64: uploadedPdfBase64,
      });
      setCurrentMeetingId(res.meetingId);
      setAnalysis(res.analysis);
      setDrafts(res.analysis.extractedTasks);
      onNotify(
        `Extracted ${res.analysis.extractedTasks.length} draft commitment(s) for human review.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Meeting analysis failed.';
      setAnalyzeError(msg);
      onNotify(msg, 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const updateDraft = (tempId: string, patch: Partial<ExtractedTaskDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.tempId === tempId ? { ...d, ...patch } : d)));
  };

  const removeDraft = (tempId: string) => {
    setDrafts((prev) =>
      prev
        .filter((d) => d.tempId !== tempId)
        .map((d) => ({
          ...d,
          dependencyTempIds: d.dependencyTempIds.filter((id) => id !== tempId),
        }))
    );
  };

  const handleApproveAndGenerate = async () => {
    if (!currentMeetingId) return;
    const selectedCount = drafts.filter((d) => d.selected).length;
    if (selectedCount === 0) {
      onNotify('Select at least one task to approve into the Execution Plan.', 'error');
      return;
    }

    setApproving(true);
    try {
      const res = await api.approveMeetingDrafts(currentMeetingId, drafts);
      await onRefresh();
      onNotify(
        `Added ${res.createdTaskIds.length} approved task(s) and dependencies to Execution Twin.`
      );
      setAnalysis(null);
      setDrafts([]);
      setCurrentMeetingId(null);
      setTranscript('');
      setMeetingTitle('');
      setUploadedFileName(null);
      setUploadedPdfBase64(undefined);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to approve commitments.', 'error');
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Meeting Intelligence</h1>
          <p className="text-sm text-slate-600 mt-1">
            Convert meeting transcripts or uploaded TXT/PDF notes into editable commitments before
            activating them.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setMeetingTitle('Mid-Sprint Alignment & Feature Review');
            setTranscript(EXAMPLE_TRANSCRIPT);
            setUploadedFileName(null);
            setUploadedPdfBase64(undefined);
            setAnalyzeError(null);
          }}
          className="px-3.5 py-2 text-xs font-semibold text-cyan-700 bg-white hover:bg-cyan-50 border border-cyan-200 rounded-lg shadow-2xs transition-colors cursor-pointer self-start whitespace-nowrap"
        >
          Insert Example Transcript
        </button>
      </div>

      {/* Transcript Input & Upload Card */}
      <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-600 via-cyan-500 to-violet-500" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="mtg-title" className="block text-xs font-medium text-slate-700 mb-1.5">
              Meeting Title (Optional)
            </label>
            <input
              id="mtg-title"
              type="text"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="e.g., Sprint Kickoff & Commitment Alignment"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400"
            />
          </div>

          <div>
            <label htmlFor="mtg-file" className="block text-xs font-medium text-slate-700 mb-1.5">
              Upload Meeting Notes (.txt, .md, .pdf — max 2MB)
            </label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                id="mtg-file"
                type="file"
                accept=".txt,.md,.pdf,text/plain,application/pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer"
              >
                <Upload className="w-4 h-4 text-blue-600" />
                <span>Upload TXT / PDF</span>
              </button>
              {uploadedFileName && (
                <span className="text-xs font-medium text-emerald-700 truncate">{uploadedFileName}</span>
              )}
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="mtg-transcript"
            className="block text-xs font-medium text-slate-700 mb-1.5"
          >
            Meeting Transcript
          </label>
          <textarea
            id="mtg-transcript"
            rows={6}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={`Paste speaker dialogue, e.g.:\nArun: "I'll complete the frontend by Friday."\nSanjeev: "I'll integrate the API once Arun finishes."`}
            className="w-full rounded-lg border border-slate-300 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 leading-relaxed"
          />
        </div>

        {analyzeError && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{analyzeError}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <p className="text-xs text-slate-600">
            Powered by{' '}
            <span className="text-slate-900 font-semibold">Live Gemini AI</span>. Extracted
            commitments always require human confirmation before entering your Execution Plan.
          </p>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            {analyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{analyzing ? 'Analyzing Transcript...' : 'Analyze Meeting'}</span>
          </button>
        </div>
      </section>

      {/* Human Review Interface */}
      {analysis && (
        <section className="relative overflow-hidden rounded-xl border border-blue-200 bg-white p-6 space-y-6 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 via-blue-600 to-emerald-500" />
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <p className="text-xs font-semibold text-cyan-700 mb-1">
                Human Review Required · Live Gemini AI ({analysis.aiModel})
              </p>
              <h2 className="font-display text-xl font-bold text-slate-900">
                {analysis.meetingTitle}
              </h2>
              <p className="text-sm text-slate-600 mt-1">{analysis.summary}</p>
            </div>

            <button
              type="button"
              onClick={handleApproveAndGenerate}
              disabled={approving}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Check className="w-4 h-4" />
              <span>
                {approving
                  ? 'Generating Plan...'
                  : `Approve (${drafts.filter((d) => d.selected).length}) & Generate Execution Plan`}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-xs font-semibold text-slate-800 mb-2">Key Decisions</h3>
              {analysis.decisions.length === 0 ? (
                <p className="text-sm text-slate-500">No formal decisions recorded.</p>
              ) : (
                <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-4">
                  {analysis.decisions.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
              <h3 className="text-xs font-semibold text-amber-800 mb-2">Unresolved Questions</h3>
              {analysis.unresolvedQuestions.length === 0 ? (
                <p className="text-sm text-amber-900/70">None identified in this transcript.</p>
              ) : (
                <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-4">
                  {analysis.unresolvedQuestions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Editable Commitments &amp; Task Drafts
            </h3>

            {drafts.map((draft) => (
              <div
                key={draft.tempId}
                className={`rounded-xl border p-4 space-y-3 ${
                  draft.selected
                    ? 'border-slate-200 bg-slate-50/80'
                    : 'border-slate-200 bg-slate-100/60 opacity-65'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2.5 text-sm font-medium text-slate-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.selected}
                      onChange={(e) => updateDraft(draft.tempId, { selected: e.target.checked })}
                      className="rounded border-slate-300 accent-blue-600 w-4 h-4"
                    />
                    <span>Include in Execution Plan</span>
                  </label>

                  <div className="flex items-center gap-3 text-xs">
                    <span
                      className={`font-mono-num font-semibold ${
                        draft.confidence === 'needs_confirmation'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {draft.confidence === 'needs_confirmation'
                        ? `Needs Confirmation (${draft.confidenceScore}%)`
                        : `Confidence ${draft.confidenceScore}%`}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove draft ${draft.title}`}
                      onClick={() => removeDraft(draft.tempId)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {draft.needsConfirmationReason && (
                  <div className="flex items-center gap-2 text-xs font-medium text-amber-700">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{draft.needsConfirmationReason}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Task Title</label>
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(e) => updateDraft(draft.tempId, { title: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Owner</label>
                    <input
                      type="text"
                      value={draft.ownerName}
                      onChange={(e) => updateDraft(draft.tempId, { ownerName: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={draft.dueDate}
                      onChange={(e) => updateDraft(draft.tempId, { dueDate: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 font-mono-num"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
                    <select
                      value={draft.priority}
                      onChange={(e) =>
                        updateDraft(draft.tempId, { priority: e.target.value as TaskPriority })
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Duration (Days)</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={draft.estimatedDuration}
                      onChange={(e) =>
                        updateDraft(draft.tempId, {
                          estimatedDuration: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Depends On (Within Meeting)
                    </label>
                    <select
                      value={draft.dependencyTempIds[0] || ''}
                      onChange={(e) =>
                        updateDraft(draft.tempId, {
                          dependencyTempIds: e.target.value ? [e.target.value] : [],
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
                    >
                      <option value="">No dependency</option>
                      {drafts
                        .filter((other) => other.tempId !== draft.tempId)
                        .map((other) => (
                          <option key={other.tempId} value={other.tempId}>
                            After: {other.title}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <p className="text-xs text-slate-500 italic">
                  Source: “{draft.originalStatement}”
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Meeting History */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Meeting History ({data.meetings.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={onNavigateBoard}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            View Execution Board →
          </button>
        </div>

        <div className="space-y-3">
          {data.meetings.map((m) => (
            <details
              key={m.id}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <summary className="cursor-pointer flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-slate-900">
                <span>{m.title}</span>
                <span className="text-xs text-slate-500 font-mono-num">
                  {m.aiModel || 'gemini-4-hydrogen'} · {m.createdAt.slice(0, 10)}
                </span>
              </summary>
              <div className="mt-3 pt-3 border-t border-slate-200 space-y-2 text-xs text-slate-700">
                <p>{m.summary}</p>
                <pre className="whitespace-pre-wrap rounded-md bg-white border border-slate-200 p-3 text-slate-600 font-sans">
                  {m.transcript}
                </pre>
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
};
