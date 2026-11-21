import React, { useEffect, useState } from 'react';
import { History, Save, Server, Sliders } from 'lucide-react';
import { api } from '../../api/client.ts';
import type { Project, ProjectWorkspaceData } from '../../shared/types.ts';

interface SettingsPageProps {
  data: ProjectWorkspaceData;
  hasGeminiKey: boolean;
  aiModel: string;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  data,
  hasGeminiKey,
  aiModel,
  onRefresh,
  onNotify,
}) => {
  const [name, setName] = useState(data.project.name);
  const [description, setDescription] = useState(data.project.description);
  const [deadline, setDeadline] = useState(data.project.deadline);
  const [status, setStatus] = useState<Project['status']>(data.project.status);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(data.project.name);
    setDescription(data.project.description);
    setDeadline(data.project.deadline);
    setStatus(data.project.status);
  }, [data.project]);

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      onNotify('Project name must be at least 2 characters.', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.updateProject(data.project.id, {
        name: name.trim(),
        description: description.trim(),
        deadline,
        status,
      });
      await onRefresh();
      onNotify(`Saved configuration for "${name.trim()}".`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update project settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Workspace Settings</h1>
        <p className="text-sm text-slate-600 mt-1">
          Manage active project parameters, verify server Gemini AI readiness, and inspect the audit
          trail.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 space-y-6">
          {/* Active Project Settings Form */}
          <form
            onSubmit={handleSaveProject}
            className="relative overflow-hidden rounded-xl border border-blue-200 bg-white p-6 space-y-4 shadow-xs"
          >
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-600 to-indigo-600" />
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-600" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Active Project Configuration
              </h2>
            </div>

            <div>
              <label htmlFor="settings-proj-name" className="block text-xs font-medium text-slate-700 mb-1">
                Project Name
              </label>
              <input
                id="settings-proj-name"
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="settings-proj-deadline"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Target Deadline
                </label>
                <input
                  id="settings-proj-deadline"
                  type="date"
                  required
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 font-mono-num"
                />
              </div>
              <div>
                <label
                  htmlFor="settings-proj-status"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Project Health State
                </label>
                <select
                  id="settings-proj-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Project['status'])}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900"
                >
                  <option value="on_track">On Track</option>
                  <option value="at_risk">At Risk</option>
                  <option value="critical">Critical</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="settings-proj-desc" className="block text-xs font-medium text-slate-700 mb-1">
                Description
              </label>
              <textarea
                id="settings-proj-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save Project Settings'}</span>
              </button>
            </div>
          </form>

          {/* Live AI Architecture Info (No API key input UI) */}
          <section className="relative overflow-hidden rounded-xl border border-indigo-200 bg-white p-6 space-y-3 shadow-xs">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-indigo-500 to-violet-500" />
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-600" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Live Execution &amp; AI Runtime
              </h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Dependency validation, Critical Path scheduling, and What-If delay propagation execute
              deterministically. Meeting commitment extraction, AI recovery planning, and executive
              risk briefings call server-side{' '}
              <span className="font-mono-num font-semibold text-slate-800">{aiModel}</span> via{' '}
              <span className="font-mono-num text-slate-800">GEMINI_API_KEY</span>.
            </p>
            <div
              className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
                hasGeminiKey
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {hasGeminiKey
                ? `Server Gemini API credential is configured (${aiModel} ready).`
                : 'GEMINI_API_KEY is not currently set on the server. Configure GEMINI_API_KEY in Settings > Secrets to enable live AI analysis.'}
            </div>
          </section>
        </div>

        {/* Audit Trail */}
        <section className="relative overflow-hidden lg:col-span-6 rounded-xl border border-cyan-200 bg-white p-6 space-y-4 shadow-xs h-fit">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 to-teal-500" />
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-600" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Workspace Audit Trail
            </h2>
          </div>

          <ul className="space-y-2.5 max-h-[480px] overflow-y-auto">
            {data.activityLogs.map((log) => (
              <li
                key={log.id}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2 text-slate-500 mb-1">
                  <span className="font-semibold text-slate-800">{log.actorName}</span>
                  <span className="font-mono-num">{log.timestamp.slice(0, 16).replace('T', ' ')}</span>
                </div>
                <p className="text-slate-700">{log.action}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};
