import React, { useState } from 'react';
import { FolderPlus, Plus, Trash2, Users } from 'lucide-react';
import { api } from '../../api/client.ts';
import type { Project, ProjectMember } from '../../shared/types.ts';

interface ProjectsPageProps {
  projects: Project[];
  activeProject: Project;
  members: ProjectMember[];
  onSelectProject: (projectId: string) => void;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  projects,
  activeProject,
  members,
  onSelectProject,
  onRefresh,
  onNotify,
}) => {
  const defaultDeadline = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [teamDraft, setTeamDraft] = useState<Array<{ name: string; role: string }>>([
    { name: 'Arun', role: 'Frontend Developer' },
    { name: 'Sanjeev', role: 'Backend Developer' },
  ]);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAddDraftMember = () => {
    if (!newMemberName.trim()) return;
    setTeamDraft((prev) => [
      ...prev,
      { name: newMemberName.trim(), role: newMemberRole.trim() || 'Contributor' },
    ]);
    setNewMemberName('');
    setNewMemberRole('');
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      onNotify('Project name is required.', 'error');
      return;
    }
    if (teamDraft.length === 0) {
      onNotify('Add at least one team member.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.createProject({
        name: name.trim(),
        description: description.trim(),
        deadline,
        teamMembers: teamDraft,
      });
      await onRefresh();
      onSelectProject(res.project.id);
      setShowCreateForm(false);
      setName('');
      setDescription('');
      onNotify(`Project "${res.project.name}" created.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to create project.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (projects.length <= 1) {
      onNotify('At least one project must remain in the workspace.', 'error');
      return;
    }
    try {
      await api.deleteProject(project.id);
      await onRefresh();
      onNotify(`Deleted project "${project.name}".`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to delete project.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Projects &amp; Teams</h1>
          <p className="text-sm text-slate-600 mt-1">
            Create execution workspaces, assign team roles, and switch active Execution Twins.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg shadow-sm transition-colors cursor-pointer whitespace-nowrap self-start"
        >
          <FolderPlus className="w-4 h-4" />
          <span>{showCreateForm ? 'Close Form' : 'New Project'}</span>
        </button>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleCreateProject}
          className="relative overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/70 via-white to-white p-6 space-y-5 shadow-sm"
        >
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-600 to-violet-600" />
          <h2 className="font-display text-lg font-semibold text-slate-900">Create New Project</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="proj-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                Project Name *
              </label>
              <input
                id="proj-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Q4 Enterprise Onboarding Portal"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div>
              <label
                htmlFor="proj-deadline"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Target Deadline *
              </label>
              <input
                id="proj-deadline"
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 font-mono-num"
              />
            </div>
          </div>

          <div>
            <label htmlFor="proj-desc" className="block text-xs font-medium text-slate-700 mb-1.5">
              Project Description
            </label>
            <textarea
              id="proj-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Outline key objectives, scope, and delivery expectations..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400"
            />
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-700">Team Members</p>
            <div className="flex flex-wrap gap-2">
              {teamDraft.map((m, i) => (
                <div
                  key={`${m.name}-${i}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800"
                >
                  <span>
                    {m.name} · <span className="text-slate-500">{m.role}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${m.name}`}
                    onClick={() => setTeamDraft((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                aria-label="New member name"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder="Member name (e.g., Priya)"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              />
              <input
                type="text"
                aria-label="New member role"
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value)}
                placeholder="Role (e.g., QA Engineer)"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={handleAddDraftMember}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Member</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {submitting ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      )}

      {/* Project List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-4">
          {projects.map((p) => {
            const isActive = p.id === activeProject.id;
            return (
              <div
                key={p.id}
                className={`relative overflow-hidden rounded-xl border p-5 transition-colors shadow-xs ${
                  isActive
                    ? 'border-blue-300 bg-gradient-to-r from-blue-50/70 via-white to-white'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {isActive && (
                  <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-600 to-cyan-500" />
                )}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 text-xs text-slate-500">
                      <span className="font-mono-num">Deadline {p.deadline}</span>
                      {isActive && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-blue-700 font-semibold">Active Workspace</span>
                        </>
                      )}
                    </div>
                    <h2 className="font-display text-lg font-semibold text-slate-900">{p.name}</h2>
                    <p className="text-sm text-slate-600">{p.description}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => onSelectProject(p.id)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg cursor-pointer shadow-xs"
                      >
                        Switch
                      </button>
                    )}
                    {projects.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Delete project ${p.name}`}
                        onClick={() => handleDeleteProject(p)}
                        className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Active Project Team Roster */}
        <aside className="relative overflow-hidden lg:col-span-5 rounded-xl border border-indigo-200 bg-white p-5 space-y-4 h-fit shadow-xs">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 to-indigo-600" />
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-600" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Active Team · {activeProject.name}
            </h2>
          </div>

          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-indigo-200 flex items-center justify-center font-display text-xs font-bold text-indigo-700">
                    {m.avatarInitials}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{m.name}</p>
                    <p className="text-xs text-slate-500">{m.role}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500">{m.email}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
};
