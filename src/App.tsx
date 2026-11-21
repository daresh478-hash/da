import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api/client.ts';
import { LandingPage } from './components/LandingPage.tsx';
import type { WorkspacePageId } from './components/workspace/OverviewPage.tsx';
import { WorkspaceShell } from './components/workspace/WorkspaceShell.tsx';
import { useRealtimeSync } from './hooks/useRealtimeSync.ts';
import type { Project, ProjectWorkspaceData } from './shared/types.ts';

interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error';
}

export function App() {
  const initialAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [view, setView] = useState<'landing' | 'workspace'>(
    initialAutostart ? 'workspace' : 'landing'
  );
  const [activePage, setActivePage] = useState<WorkspacePageId>('overview');

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [workspaceData, setWorkspaceData] = useState<ProjectWorkspaceData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(false);
  const [aiModel, setAiModel] = useState<string>('gemini-4-hydrogen');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-1), { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const loadWorkspace = useCallback(
    async (targetProjectId?: string, opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const [statusRes, projRes] = await Promise.all([api.getStatus(), api.listProjects()]);
        setHasGeminiKey(statusRes.hasGeminiKey);
        setAiModel(statusRes.model);

        const list = projRes.projects;
        setProjects(list);

        const resolvedId =
          targetProjectId && list.some((p) => p.id === targetProjectId)
            ? targetProjectId
            : activeProjectId && list.some((p) => p.id === activeProjectId)
              ? activeProjectId
              : list[0]?.id;

        if (resolvedId) {
          setActiveProjectId(resolvedId);
          const dash = await api.getDashboard(resolvedId);
          setWorkspaceData(dash);
        } else {
          setWorkspaceData(null);
        }
      } catch (err) {
        if (!opts?.silent) {
          setError(err instanceof Error ? err.message : 'Failed to load workspace.');
        }
      } finally {
        if (!opts?.silent) {
          setLoading(false);
        }
      }
    },
    [activeProjectId]
  );

  useEffect(() => {
    loadWorkspace();
  }, []); // Initial load once on mount

  const { presenceUsers } = useRealtimeSync({
    enabled: view === 'workspace' && Boolean(activeProjectId),
    projectId: activeProjectId,
    activePage,
    userName: 'Daresh',
    onWorkspaceUpdate: useCallback(() => {
      void loadWorkspace(activeProjectId, { silent: true });
    }, [activeProjectId, loadWorkspace]),
    onProjectsUpdate: useCallback(() => {
      void loadWorkspace(activeProjectId, { silent: true });
    }, [activeProjectId, loadWorkspace]),
    onReconnectSync: useCallback(() => {
      void loadWorkspace(activeProjectId, { silent: true });
    }, [activeProjectId, loadWorkspace]),
  });

  const handleSelectProject = async (projectId: string) => {
    setActiveProjectId(projectId);
    await loadWorkspace(projectId);
  };

  const handleLaunchWorkspace = (initialPage?: string) => {
    if (initialPage) {
      setActivePage(initialPage as WorkspacePageId);
    }
    setView('workspace');
  };

  return (
    <>
      {view === 'landing' ? (
        <LandingPage onLaunchWorkspace={handleLaunchWorkspace} />
      ) : (
        <WorkspaceShell
          activePage={activePage}
          onSelectPage={setActivePage}
          projects={projects}
          workspaceData={workspaceData}
          loading={loading}
          error={error}
          hasGeminiKey={hasGeminiKey}
          aiModel={aiModel}
          presenceUsers={presenceUsers}
          onSelectProject={handleSelectProject}
          onRefresh={() => loadWorkspace(activeProjectId, { silent: true })}
          onBackToLanding={() => setView('landing')}
          onNotify={notify}
        />
      )}

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
                t.type === 'error'
                  ? 'border-rose-300 bg-rose-50 text-rose-800'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-900'
              }`}
            >
              {t.text}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default App;
