import React, { useMemo, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  ClipboardCheck,
  FolderKanban,
  GitBranch,
  Home,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Trello,
  Users,
  X,
} from 'lucide-react';
import type { PresenceUser, Project, ProjectWorkspaceData } from '../../shared/types.ts';
import { CommitmentsPage } from './CommitmentsPage.tsx';
import { DependencyDnaPage } from './DependencyDnaPage.tsx';
import { ExecutionBoardPage } from './ExecutionBoardPage.tsx';
import { MeetingIntelligencePage } from './MeetingIntelligencePage.tsx';
import { OverviewPage, type WorkspacePageId } from './OverviewPage.tsx';
import { ProjectsPage } from './ProjectsPage.tsx';
import { RecoveryPlannerPage } from './RecoveryPlannerPage.tsx';
import { RiskRadarPage } from './RiskRadarPage.tsx';
import { SettingsPage } from './SettingsPage.tsx';
import { WhatIfLabPage } from './WhatIfLabPage.tsx';

interface WorkspaceShellProps {
  activePage: WorkspacePageId;
  onSelectPage: (page: WorkspacePageId) => void;
  projects: Project[];
  workspaceData: ProjectWorkspaceData | null;
  loading: boolean;
  error: string | null;
  hasGeminiKey: boolean;
  aiModel: string;
  presenceUsers: PresenceUser[];
  onSelectProject: (projectId: string) => void;
  onRefresh: () => Promise<void>;
  onBackToLanding: () => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const NAV_ITEMS: Array<{
  id: WorkspacePageId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, accent: 'text-sky-600' },
  { id: 'projects', label: 'Projects', icon: FolderKanban, accent: 'text-indigo-600' },
  { id: 'meetings', label: 'Meeting Intelligence', icon: MessageSquareText, accent: 'text-blue-600' },
  { id: 'commitments', label: 'Commitments', icon: ClipboardCheck, accent: 'text-cyan-600' },
  { id: 'board', label: 'Execution Board', icon: Trello, accent: 'text-emerald-600' },
  { id: 'dependencies', label: 'Dependency DNA', icon: GitBranch, accent: 'text-violet-600' },
  { id: 'simulator', label: 'What-If Lab', icon: Sliders, accent: 'text-blue-600' },
  { id: 'recovery', label: 'Recovery Planner', icon: ShieldCheck, accent: 'text-emerald-600' },
  { id: 'risks', label: 'Risk Radar', icon: ShieldAlert, accent: 'text-rose-600' },
  { id: 'settings', label: 'Settings', icon: Settings, accent: 'text-slate-700' },
];

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  activePage,
  onSelectPage,
  projects,
  workspaceData,
  loading,
  error,
  hasGeminiKey,
  aiModel,
  presenceUsers,
  onSelectProject,
  onRefresh,
  onBackToLanding,
  onNotify,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [simPreselectedTaskId, setSimPreselectedTaskId] = useState<string | null>(null);
  const [activeRecoverySimId, setActiveRecoverySimId] = useState<string | null>(null);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !workspaceData) return [];

    const results: Array<{
      id: string;
      kind: string;
      title: string;
      page: WorkspacePageId;
    }> = [];

    for (const t of workspaceData.tasks) {
      if (t.title.toLowerCase().includes(q) || t.ownerName.toLowerCase().includes(q)) {
        results.push({ id: t.id, kind: 'Task', title: `${t.title} · ${t.ownerName}`, page: 'board' });
      }
    }
    for (const c of workspaceData.commitments) {
      if (c.title.toLowerCase().includes(q) || c.originalStatement.toLowerCase().includes(q)) {
        results.push({
          id: c.id,
          kind: 'Commitment',
          title: c.title,
          page: 'commitments',
        });
      }
    }
    for (const m of workspaceData.meetings) {
      if (m.title.toLowerCase().includes(q)) {
        results.push({ id: m.id, kind: 'Meeting', title: m.title, page: 'meetings' });
      }
    }
    return results.slice(0, 6);
  }, [searchQuery, workspaceData]);

  const handleNavClick = (page: WorkspacePageId) => {
    onSelectPage(page);
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
  };

  const handleSimulateTask = (taskId: string) => {
    setSimPreselectedTaskId(taskId);
    onSelectPage('simulator');
  };

  const handleOpenRecovery = (simulationId: string) => {
    setActiveRecoverySimId(simulationId);
    onSelectPage('recovery');
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToLanding}
          className="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-slate-900 hover:text-blue-600 transition-colors cursor-pointer text-left"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 28 28"
            className="w-6 h-6 shrink-0"
            fill="none"
          >
            <defs>
              <linearGradient id="sidebarLogoGrad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#0ea5e9" />
                <stop offset="50%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#7c3aed" />
              </linearGradient>
            </defs>
            <rect width="28" height="28" rx="7" fill="url(#sidebarLogoGrad)" />
            <path
              d="M8 9.5h5.5a3 3 0 0 1 0 6H10m4.5 0H20m-4.5-6L19 13l-3.5 3.5"
              stroke="#ffffff"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>OneFlow AI</span>
        </button>
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav aria-label="Workspace Navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-gradient-to-r from-blue-50 via-indigo-50/80 to-sky-50/40 text-blue-700 border border-blue-200 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? item.accent : 'text-slate-400'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-2 text-xs">
        <button
          type="button"
          onClick={onBackToLanding}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:text-slate-900 hover:bg-slate-100 hover:border-blue-300 transition-colors cursor-pointer font-medium"
        >
          <Home className="w-3.5 h-3.5 text-blue-600" />
          <span>Product Home</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 h-full">{renderSidebarContent()}</div>
          <button
            type="button"
            aria-label="Close navigation backdrop"
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 bg-slate-900/35 backdrop-blur-[1px]"
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative flex-1 min-w-0 flex flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 inset-x-0 h-64 bg-[radial-gradient(ellipse_at_25%_0%,rgba(59,130,246,0.08),transparent_55%),radial-gradient(ellipse_at_80%_0%,rgba(124,58,237,0.07),transparent_50%)]"
        />

        {/* Top Utility Header */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/92 backdrop-blur-md px-4 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                aria-label="Open navigation menu"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Project Switcher */}
              <select
                aria-label="Switch active project"
                value={workspaceData?.project.id || projects[0]?.id || ''}
                onChange={(e) => onSelectProject(e.target.value)}
                className="max-w-[210px] sm:max-w-[260px] truncate rounded-lg border border-blue-200 bg-blue-50/40 px-3 py-1.5 text-sm font-semibold text-slate-900 cursor-pointer"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Global Search */}
            <div className="relative hidden md:block flex-1 max-w-md">
              <Search className="w-4 h-4 text-sky-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Search tasks, commitments, or meetings"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks, commitments, owners..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400"
              />
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 mt-1.5 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden z-40">
                  {searchResults.map((res) => (
                    <button
                      key={`${res.kind}-${res.id}`}
                      type="button"
                      onClick={() => {
                        onSelectPage(res.page);
                        setSearchQuery('');
                      }}
                      className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-slate-50 flex items-center justify-between gap-2 border-b border-slate-100 last:border-0 cursor-pointer"
                    >
                      <span className="text-slate-900 font-medium truncate">{res.title}</span>
                      <span className="text-blue-600 font-semibold shrink-0">{res.kind}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Collaborators, Notifications & Profile */}
            <div className="flex items-center gap-3 shrink-0">
              {presenceUsers.length > 0 && (
                <div
                  title={`${presenceUsers.length} active collaborator${presenceUsers.length === 1 ? '' : 's'} in project`}
                  aria-label={`${presenceUsers.length} active collaborators`}
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700"
                >
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  <span className="font-mono-num">{presenceUsers.length}</span>
                </div>
              )}
              <div className="relative">
                <button
                  type="button"
                  aria-label="Open notifications"
                  onClick={() => setNotificationsOpen((v) => !v)}
                  className="relative p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 cursor-pointer"
                >
                  <Bell className="w-4 h-4" />
                  {workspaceData && workspaceData.risks.length > 0 && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] font-mono-num font-bold bg-rose-600 text-white rounded-full leading-none">
                      {workspaceData.risks.length}
                    </span>
                  )}
                </button>

                {notificationsOpen && workspaceData && (
                  <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl p-4 space-y-3 z-40">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="text-xs font-semibold text-slate-900">
                        Active Risks &amp; Alerts ({workspaceData.risks.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setNotificationsOpen(false);
                          onSelectPage('risks');
                        }}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                      >
                        Risk Radar
                      </button>
                    </div>

                    {workspaceData.risks.length === 0 ? (
                      <div className="flex items-center gap-2 text-xs text-emerald-700 py-2">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>No active alerts.</span>
                      </div>
                    ) : (
                      <ul className="space-y-2 max-h-60 overflow-y-auto">
                        {workspaceData.risks.slice(0, 4).map((r) => (
                          <li
                            key={r.id}
                            className="rounded-lg bg-slate-50 p-2.5 text-xs border border-slate-200"
                          >
                            <p className="font-semibold text-slate-900">{r.title}</p>
                            <p className="text-slate-600 mt-0.5 line-clamp-2">{r.description}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center font-display text-xs font-bold text-white shadow-xs">
                  DA
                </div>
                <div className="text-xs leading-tight">
                  <p className="font-semibold text-slate-900">Daresh</p>
                  <p className="text-slate-500">Product Lead</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="relative flex-1 p-4 lg:p-8 max-w-[1440px] w-full mx-auto">
          {error && (
            <div className="mb-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
              {error}
            </div>
          )}

          {loading || !workspaceData ? (
            <div className="space-y-4">
              <div className="h-8 w-64 rounded-lg bg-slate-200/80 animate-pulse" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-24 rounded-xl bg-slate-200/70 animate-pulse" />
                ))}
              </div>
              <div className="h-72 rounded-xl bg-slate-200/60 animate-pulse" />
            </div>
          ) : (
            <>
              {activePage === 'overview' && (
                <OverviewPage
                  data={workspaceData}
                  onNavigate={onSelectPage}
                  onRefresh={onRefresh}
                  onNotify={onNotify}
                />
              )}
              {activePage === 'projects' && (
                <ProjectsPage
                  projects={projects}
                  activeProject={workspaceData.project}
                  members={workspaceData.members}
                  onSelectProject={onSelectProject}
                  onRefresh={onRefresh}
                  onNotify={onNotify}
                />
              )}
              {activePage === 'meetings' && (
                <MeetingIntelligencePage
                  data={workspaceData}
                  onRefresh={onRefresh}
                  onNavigateBoard={() => onSelectPage('board')}
                  onNotify={onNotify}
                />
              )}
              {activePage === 'commitments' && (
                <CommitmentsPage
                  data={workspaceData}
                  onRefresh={onRefresh}
                  onNotify={onNotify}
                />
              )}
              {activePage === 'board' && (
                <ExecutionBoardPage
                  data={workspaceData}
                  onRefresh={onRefresh}
                  onNotify={onNotify}
                />
              )}
              {activePage === 'dependencies' && (
                <DependencyDnaPage
                  data={workspaceData}
                  onRefresh={onRefresh}
                  onSimulateTask={handleSimulateTask}
                  onNotify={onNotify}
                />
              )}
              {activePage === 'simulator' && (
                <WhatIfLabPage
                  data={workspaceData}
                  preselectedTaskId={simPreselectedTaskId}
                  onRefresh={onRefresh}
                  onOpenRecovery={handleOpenRecovery}
                  onNotify={onNotify}
                />
              )}
              {activePage === 'recovery' && (
                <RecoveryPlannerPage
                  data={workspaceData}
                  activeSimulationId={activeRecoverySimId}
                  onRefresh={onRefresh}
                  onGoToSimulator={() => onSelectPage('simulator')}
                  onNotify={onNotify}
                />
              )}
              {activePage === 'risks' && (
                <RiskRadarPage
                  data={workspaceData}
                  onSimulateTask={handleSimulateTask}
                  onNotify={onNotify}
                />
              )}
              {activePage === 'settings' && (
                <SettingsPage
                  data={workspaceData}
                  hasGeminiKey={hasGeminiKey}
                  aiModel={aiModel}
                  onRefresh={onRefresh}
                  onNotify={onNotify}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};
