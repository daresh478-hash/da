import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GitBranch,
  Layers,
  MessageSquareText,
  Play,
  ShieldCheck,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { simulateDelay } from '../engine/scheduler.ts';
import type { Task, TaskDependency } from '../shared/types.ts';

interface LandingPageProps {
  onLaunchWorkspace: (initialPage?: string) => void;
}

const PREVIEW_TASKS: Task[] = [
  {
    id: 'pv_fe',
    projectId: 'pv',
    title: 'Frontend Dashboard',
    description: 'Core workspace UI',
    ownerId: 'u1',
    ownerName: 'Arun',
    startDate: '2026-11-21',
    dueDate: '2026-11-23',
    estimatedDuration: 2,
    priority: 'critical',
    status: 'in_progress',
    createdAt: '2026-11-21T00:00:00Z',
  },
  {
    id: 'pv_api',
    projectId: 'pv',
    title: 'Backend API Integration',
    description: 'Connect endpoints after frontend structure is ready',
    ownerId: 'u2',
    ownerName: 'Sanjeev',
    startDate: '2026-11-23',
    dueDate: '2026-11-25',
    estimatedDuration: 2,
    priority: 'high',
    status: 'todo',
    createdAt: '2026-11-21T00:00:00Z',
  },
  {
    id: 'pv_qa',
    projectId: 'pv',
    title: 'System Testing & QA',
    description: 'Full integration verification',
    ownerId: 'u3',
    ownerName: 'Dharani',
    startDate: '2026-11-25',
    dueDate: '2026-11-27',
    estimatedDuration: 2,
    priority: 'high',
    status: 'todo',
    createdAt: '2026-11-21T00:00:00Z',
  },
  {
    id: 'pv_sub',
    projectId: 'pv',
    title: 'Final Release & Launch',
    description: 'Release readiness & production sign-off',
    ownerId: 'u4',
    ownerName: 'Daresh',
    startDate: '2026-11-27',
    dueDate: '2026-11-28',
    estimatedDuration: 1,
    priority: 'critical',
    status: 'todo',
    createdAt: '2026-11-21T00:00:00Z',
  },
];

const PREVIEW_DEPS: TaskDependency[] = [
  { id: 'pd1', projectId: 'pv', predecessorTaskId: 'pv_fe', successorTaskId: 'pv_api' },
  { id: 'pd2', projectId: 'pv', predecessorTaskId: 'pv_api', successorTaskId: 'pv_qa' },
  { id: 'pd3', projectId: 'pv', predecessorTaskId: 'pv_qa', successorTaskId: 'pv_sub' },
];

export const LandingPage: React.FC<LandingPageProps> = ({ onLaunchWorkspace }) => {
  const [previewDelayDays, setPreviewDelayDays] = useState<number>(2);
  const [previewStage, setPreviewStage] = useState<'commitments' | 'graph' | 'recovery'>('commitments');

  const previewSim = useMemo(() => {
    return simulateDelay(
      PREVIEW_TASKS,
      PREVIEW_DEPS,
      '2026-11-28',
      'pv_fe',
      previewDelayDays,
      'scope_creep',
      '2026-11-21'
    );
  }, [previewDelayDays]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* 1. Premium Navigation Bar (Strict 3-Zone Top Bar Contract) */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/88 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
          <a
            href="#top"
            className="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 28 28"
              className="w-6 h-6 shrink-0"
              fill="none"
            >
              <defs>
                <linearGradient id="oneflowLogoGrad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#0ea5e9" />
                  <stop offset="50%" stopColor="#2563eb" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
              <rect width="28" height="28" rx="7" fill="url(#oneflowLogoGrad)" />
              <path
                d="M8 9.5h5.5a3 3 0 0 1 0 6H10m4.5 0H20m-4.5-6L19 13l-3.5 3.5"
                stroke="#ffffff"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>OneFlow AI</span>
          </a>

          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <a
              href="#problem"
              className="hover:text-blue-600 transition-colors whitespace-nowrap shrink-0"
            >
              Problem
            </a>
            <a
              href="#innovations"
              className="hover:text-blue-600 transition-colors whitespace-nowrap shrink-0"
            >
              Innovations
            </a>
            <a
              href="#simulator-preview"
              className="hover:text-blue-600 transition-colors whitespace-nowrap shrink-0"
            >
              Simulator
            </a>
            <a
              href="#workflow"
              className="hover:text-blue-600 transition-colors whitespace-nowrap shrink-0"
            >
              Workflow
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => onLaunchWorkspace('overview')}
              className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 rounded-lg shadow-md shadow-blue-600/20 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              Launch Workspace
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* 2. Hero Section */}
        <section className="relative overflow-hidden border-b border-slate-200 bg-white bg-grid-pattern">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_15%,rgba(14,165,233,0.16),transparent_45%),radial-gradient(ellipse_at_85%_20%,rgba(124,58,237,0.15),transparent_45%),radial-gradient(ellipse_at_50%_95%,rgba(16,185,129,0.10),transparent_45%)]"
          />
          <div className="relative mx-auto max-w-7xl px-6 py-16 lg:py-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              <div className="lg:col-span-6 space-y-6">
                <p className="text-sm font-semibold bg-gradient-to-r from-sky-600 via-blue-600 to-violet-600 bg-clip-text text-transparent">
                  AI Execution Twin · From Conversation to Completion
                </p>

                <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.35rem] font-bold tracking-tight leading-[1.08] text-slate-900 text-balance">
                  Your Meetings Have Answers.{' '}
                  <span className="bg-gradient-to-r from-sky-600 via-blue-600 to-violet-600 bg-clip-text text-transparent">
                    OneFlow AI Turns Them Into Action.
                  </span>
                </h1>

                <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                  Transform conversations into commitments, visualize task dependencies, predict
                  project delays, and recover intelligently — all from one AI-powered execution
                  workspace.
                </p>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => onLaunchWorkspace('overview')}
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 rounded-lg shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
                  >
                    <span>Launch Workspace</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onLaunchWorkspace('simulator')}
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-slate-800 bg-white hover:bg-sky-50 border border-sky-300 rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    <Play className="w-4 h-4 text-sky-600" />
                    <span>Open What-If Lab</span>
                  </button>
                </div>

                <div className="pt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium">
                  <span className="text-sky-700">Commitment Intelligence</span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="text-violet-700">Dependency DNA Graph</span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="text-cyan-700">Deterministic Delay Simulator</span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="text-emerald-700">Human-Approved Recovery</span>
                </div>
              </div>

              {/* Hero Execution Twin Visualization */}
              <div className="lg:col-span-6">
                <div className="relative rounded-2xl border border-blue-200/90 bg-white p-5 shadow-xl shadow-slate-900/8 overflow-hidden">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-sky-500 via-blue-600 to-violet-600"
                  />
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3.5 mb-4">
                    <div>
                      <p className="text-xs text-sky-600 font-semibold">AI Execution Twin</p>
                      <h2 className="font-display text-base font-bold text-slate-900">
                        OneFlow AI Product Launch
                      </h2>
                    </div>
                    <span className="text-xs font-mono-num text-amber-700 font-semibold">
                      Target · Day 7
                    </span>
                  </div>

                  {/* Interactive Stage Tabs inside Hero Preview */}
                  <div
                    role="tablist"
                    aria-label="Execution Twin Preview Stages"
                    className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200 mb-4"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={previewStage === 'commitments'}
                      onClick={() => setPreviewStage('commitments')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                        previewStage === 'commitments'
                          ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      1. Commitments
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={previewStage === 'graph'}
                      onClick={() => setPreviewStage('graph')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                        previewStage === 'graph'
                          ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      2. Dependency DNA
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={previewStage === 'recovery'}
                      onClick={() => setPreviewStage('recovery')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                        previewStage === 'recovery'
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      3. Recovery Twin
                    </button>
                  </div>

                  {previewStage === 'commitments' && (
                    <div className="space-y-2.5">
                      <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3.5">
                        <p className="text-xs font-semibold text-sky-700 mb-1">Transcript Excerpt</p>
                        <p className="text-sm text-slate-800">
                          “I’ll integrate the backend APIs once the frontend structure is ready.”
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                          <span>Owner: Sanjeev · Due 2026-11-25</span>
                          <span className="text-sky-700 font-semibold">Depends on Frontend Dashboard</span>
                        </div>
                      </div>
                      <div className="rounded-lg border border-violet-200 bg-violet-50/70 p-3.5">
                        <p className="text-xs font-semibold text-violet-700 mb-1">Transcript Excerpt</p>
                        <p className="text-sm text-slate-800">
                          “I’ll begin testing after the frontend and backend integration is
                          complete.”
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                          <span>Owner: Dharani · Due 2026-11-27</span>
                          <span className="text-violet-700 font-semibold">Depends on API Integration</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {previewStage === 'graph' && (
                    <div className="space-y-2.5 py-1">
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-200 bg-gradient-to-r from-sky-50 to-blue-50 px-3.5 py-2.5">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Frontend Dashboard</p>
                          <p className="text-xs text-sky-700">Arun · In Progress</p>
                        </div>
                        <span className="text-xs font-mono-num text-sky-700 font-semibold">0d slack</span>
                      </div>
                      <div className="flex justify-center text-sky-600 text-xs font-semibold">↓ Blocks</div>
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 px-3.5 py-2.5">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Backend API Integration</p>
                          <p className="text-xs text-amber-800">Sanjeev · Waiting on Frontend</p>
                        </div>
                        <span className="text-xs font-mono-num text-amber-700 font-semibold">At Risk</span>
                      </div>
                      <div className="flex justify-center text-violet-600 text-xs font-semibold">↓ Blocks</div>
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 px-3.5 py-2.5">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">System Testing &amp; QA</p>
                          <p className="text-xs text-violet-700">Dharani · Critical Chain</p>
                        </div>
                        <span className="text-xs font-mono-num text-slate-700 font-medium">2026-11-27</span>
                      </div>
                    </div>
                  )}

                  {previewStage === 'recovery' && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-rose-200 bg-gradient-to-r from-rose-50 to-amber-50 p-3.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-rose-700 mb-1">
                          <span>Simulated Impact: +2d Frontend Delay</span>
                          <span className="font-mono-num">Deadline +2d At Risk</span>
                        </div>
                        <p className="text-xs text-slate-700">
                          Impacts Backend Integration (Sanjeev), QA (Dharani), and Submission
                          (Daresh).
                        </p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-3.5">
                        <p className="text-xs font-semibold text-emerald-700 mb-1">
                          Recommended Option A · Parallel Execution
                        </p>
                        <p className="text-xs text-slate-700">
                          Begin API schema contract stubbing while UI polish completes, recovering
                          up to 2 days pending human approval.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                    <span>Algorithmic CPM schedule + human approval gate</span>
                    <button
                      type="button"
                      onClick={() => onLaunchWorkspace('overview')}
                      className="text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                    >
                      Open full dashboard →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Interactive Product Preview & 7. Interactive What-If Simulator Preview */}
        <section id="simulator-preview" className="relative border-b border-slate-200 bg-slate-50">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.08),transparent_45%),radial-gradient(ellipse_at_bottom_right,rgba(14,165,233,0.08),transparent_45%)]"
          />
          <div className="relative mx-auto max-w-7xl px-6 py-16 lg:py-20">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
              <div className="max-w-2xl space-y-2">
                <p className="text-sm font-semibold text-violet-700">
                  Interactive Product Preview · Future Impact Simulator
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 text-balance">
                  Test a delay before it derails your launch
                </h2>
                <p className="text-slate-600 text-sm sm:text-base">
                  Adjust the delay duration on Arun’s Frontend Dashboard task below. Calculations run
                  live on the deterministic dependency scheduler without mutating project state.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onLaunchWorkspace('simulator')}
                className="px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors self-start lg:self-auto cursor-pointer whitespace-nowrap"
              >
                Open Full What-If Lab
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="relative overflow-hidden lg:col-span-4 rounded-xl border border-violet-200 bg-white p-6 space-y-5 shadow-sm">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-violet-500 to-blue-500" />
                <div>
                  <label
                    htmlFor="landing-delay-slider"
                    className="block text-sm font-semibold text-slate-900 mb-2"
                  >
                    Simulate delay on Frontend Dashboard (Arun)
                  </label>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span>0 days (On schedule)</span>
                    <span className="font-mono-num text-sm font-bold text-blue-600">
                      +{previewDelayDays} day{previewDelayDays === 1 ? '' : 's'}
                    </span>
                  </div>
                  <input
                    id="landing-delay-slider"
                    type="range"
                    min={0}
                    max={5}
                    step={1}
                    value={previewDelayDays}
                    onChange={(e) => setPreviewDelayDays(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </div>

                <div className="pt-3 border-t border-slate-200 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Target Deadline</span>
                    <span className="font-mono-num font-medium text-slate-800">2026-11-28</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Simulated Finish</span>
                    <span
                      className={`font-mono-num font-bold ${
                        previewSim.deadlineThreatened ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {previewSim.simulatedProjectEndDate}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Estimated Project Delay</span>
                    <span className="font-mono-num font-semibold text-amber-600">
                      +{previewSim.estimatedProjectDelayDays} day
                      {previewSim.estimatedProjectDelayDays === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Owners to Notify</span>
                    <span className="text-slate-800 font-medium text-right">
                      {previewSim.membersToNotify.length > 0
                        ? previewSim.membersToNotify.join(', ')
                        : 'None'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="relative overflow-hidden lg:col-span-8 rounded-xl border border-sky-200 bg-white p-6 shadow-sm">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-sky-500 to-cyan-500" />
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    Downstream Timeline Comparison
                  </h3>
                  <span className="text-xs font-medium text-sky-700">
                    Deterministic CPM propagation · Live calculation
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-2.5 pr-4 font-medium">Task</th>
                        <th className="py-2.5 pr-4 font-medium">Owner</th>
                        <th className="py-2.5 pr-4 font-medium">Original Due</th>
                        <th className="py-2.5 pr-4 font-medium">Simulated Due</th>
                        <th className="py-2.5 text-right font-medium">Impact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {previewSim.taskComparisons.map((row) => (
                        <tr key={row.taskId} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 pr-4 font-semibold text-slate-900">{row.title}</td>
                          <td className="py-3 pr-4 text-slate-600">{row.ownerName}</td>
                          <td className="py-3 pr-4 font-mono-num text-slate-500">
                            {row.originalDueDate}
                          </td>
                          <td className="py-3 pr-4 font-mono-num font-medium text-slate-900">
                            {row.simulatedDueDate}
                          </td>
                          <td className="py-3 text-right font-mono-num font-semibold">
                            {row.shiftDays > 0 ? (
                              <span
                                className={
                                  row.impactLevel === 'source'
                                    ? 'text-blue-600'
                                    : row.threatensProjectDeadline
                                      ? 'text-rose-600'
                                      : 'text-amber-600'
                                }
                              >
                                +{row.shiftDays}d ({row.impactLevel})
                              </span>
                            ) : (
                              <span className="text-emerald-600">On track</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Problem Explanation */}
        <section id="problem" className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
            <div className="max-w-2xl space-y-3 mb-10">
              <p className="text-sm font-semibold text-blue-600">Why Summaries Are Not Enough</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 text-balance">
                Most meeting tools stop at what was said. Execution fails on what happens next.
              </h2>
              <p className="text-slate-600 text-sm sm:text-base">
                Commitments made on Zoom, Google Meet, or Teams scatter across transcripts and task
                boards. When one promise slips, hidden dependencies turn local delays into missed
                launches.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                {
                  num: '01',
                  title: 'Lost Commitments',
                  body: 'Verbal promises made during standups vanish inside static summaries without explicit owners or due dates.',
                  border: 'border-sky-200',
                  bg: 'from-sky-50/90 to-white',
                  numColor: 'text-sky-600',
                },
                {
                  num: '02',
                  title: 'Disconnected Workflows',
                  body: 'Teams manually copy decisions out of transcripts into separate Kanban tools, introducing drift immediately.',
                  border: 'border-violet-200',
                  bg: 'from-violet-50/90 to-white',
                  numColor: 'text-violet-600',
                },
                {
                  num: '03',
                  title: 'Hidden Dependencies',
                  body: 'Lists of action items hide which task blocks another until an engineer realizes they are waiting.',
                  border: 'border-cyan-200',
                  bg: 'from-cyan-50/90 to-white',
                  numColor: 'text-cyan-700',
                },
                {
                  num: '04',
                  title: 'Reactive Management',
                  body: 'Schedule slips surface only after downstream deadlines have already been missed.',
                  border: 'border-amber-200',
                  bg: 'from-amber-50/90 to-white',
                  numColor: 'text-amber-700',
                },
                {
                  num: '05',
                  title: 'Poor Recovery Planning',
                  body: 'When delays hit, teams lack structured trade-off analysis between parallel work, scope, and dates.',
                  border: 'border-rose-200',
                  bg: 'from-rose-50/90 to-white',
                  numColor: 'text-rose-600',
                },
              ].map((item) => (
                <div
                  key={item.num}
                  className={`rounded-xl border ${item.border} bg-gradient-to-br ${item.bg} p-6 space-y-2 shadow-sm`}
                >
                  <p className={`font-mono-num text-xs font-bold ${item.numColor}`}>
                    {item.num}
                  </p>
                  <h3 className="font-display text-lg font-semibold text-slate-900">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. How OneFlow AI Works & 6. Five Core Innovations */}
        <section id="innovations" className="border-b border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
            <div className="max-w-2xl space-y-3 mb-10">
              <p className="text-sm font-semibold text-cyan-700">Five Core Innovations</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 text-balance">
                AI interprets conversations. Algorithms calculate schedules. Humans approve changes.
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="relative overflow-hidden lg:col-span-6 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white p-6 space-y-3 shadow-sm">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 to-sky-400" />
                <MessageSquareText className="w-5 h-5 text-blue-600" />
                <h3 className="font-display text-xl font-semibold text-slate-900">
                  1. Commitment Intelligence
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Parses transcripts and uploaded TXT/PDF meeting notes into structured JSON
                  commitments with verbatim source quotes, confidence flags, and human review before
                  any task becomes active.
                </p>
              </div>

              <div className="relative overflow-hidden lg:col-span-6 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-white p-6 space-y-3 shadow-sm">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-indigo-500 to-violet-500" />
                <GitBranch className="w-5 h-5 text-violet-600" />
                <h3 className="font-display text-xl font-semibold text-slate-900">
                  2. Dependency DNA
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Constructs a live directed acyclic graph directly from project tasks. Highlights
                  critical paths, blocked nodes, and overdue tasks while rejecting circular
                  dependencies automatically.
                </p>
              </div>

              <div className="relative overflow-hidden lg:col-span-7 rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-sky-50/60 p-6 space-y-3 shadow-sm">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 to-blue-600" />
                <Sliders className="w-5 h-5 text-cyan-600" />
                <h3 className="font-display text-xl font-semibold text-slate-900">
                  3. Future Impact Simulator (Signature Innovation)
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  Deterministic forward/backward-pass scheduling calculates exact downstream shift,
                  available slack consumption, threatened deadlines, and team members to notify
                  without altering live data.
                </p>
              </div>

              <div className="relative overflow-hidden lg:col-span-5 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white p-6 space-y-3 shadow-sm">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-500 to-teal-500" />
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="font-display text-xl font-semibold text-slate-900">
                  4. AI Recovery Planner
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Proposes parallel execution, revised timeline, and scope adjustment options with
                  explicit trade-offs. Nothing mutates until you confirm approval.
                </p>
              </div>

              <div className="relative overflow-hidden lg:col-span-12 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-cyan-50 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-500" />
                <div className="space-y-2 max-w-2xl">
                  <div className="flex items-center gap-2 text-indigo-700">
                    <Layers className="w-5 h-5" />
                    <span className="text-sm font-semibold">5. Execution Twin Dashboard</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    A live digital mirror of your project’s commitments, Kanban execution board,
                    critical dependency chain, Risk Radar, and upcoming deadlines computed directly
                    from real application state.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onLaunchWorkspace('overview')}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-lg shadow-md shadow-blue-600/20 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Inspect Execution Twin
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 8. Product Workflow Explanation & 9. Benefits for Teams */}
        <section id="workflow" className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-7 space-y-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-blue-600">End-to-End Execution Loop</p>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 text-balance">
                    How OneFlow AI takes a team from kickoff transcript to on-time finish
                  </h2>
                </div>

                <ol className="space-y-4">
                  {[
                    {
                      step: '01',
                      title: 'Analyze Meeting & Review Commitments',
                      desc: 'Paste transcripts or upload TXT/PDF notes, edit extracted tasks, confirm uncertain owners, and approve into the Execution Plan.',
                      color: 'text-sky-600',
                      border: 'border-sky-200 bg-sky-50/40',
                    },
                    {
                      step: '02',
                      title: 'Map Dependency DNA & Track Execution',
                      desc: 'Visualize directional blockers, detect critical chains, and update task status on the Execution Board.',
                      color: 'text-violet-600',
                      border: 'border-violet-200 bg-violet-50/40',
                    },
                    {
                      step: '03',
                      title: 'Simulate Delays & Detect Risks Early',
                      desc: 'Run What-If delay scenarios on any node to see exact cascading schedule impacts before deadlines slip.',
                      color: 'text-cyan-700',
                      border: 'border-cyan-200 bg-cyan-50/40',
                    },
                    {
                      step: '04',
                      title: 'Compare & Approve Recovery Strategies',
                      desc: 'Evaluate parallelization, rebaselining, or scope options with full auditability and explicit human confirmation.',
                      color: 'text-emerald-700',
                      border: 'border-emerald-200 bg-emerald-50/40',
                    },
                  ].map((w) => (
                    <li
                      key={w.step}
                      className={`flex gap-4 rounded-xl border ${w.border} p-4 shadow-xs`}
                    >
                      <span className={`font-mono-num text-sm font-bold ${w.color} pt-0.5`}>
                        {w.step}
                      </span>
                      <div>
                        <h3 className="font-display text-base font-semibold text-slate-900">
                          {w.title}
                        </h3>
                        <p className="text-sm text-slate-600 mt-1">{w.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="lg:col-span-5 space-y-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-violet-700">Built for Delivery Teams</p>
                  <h2 className="font-display text-2xl font-bold text-slate-900">
                    Clarity across every role
                  </h2>
                </div>

                <div className="space-y-4">
                  {[
                    {
                      icon: Activity,
                      iconColor: 'text-sky-600',
                      role: 'Engineering & Frontend Leads',
                      benefit:
                        'Spot zero-slack critical chains early and unblock downstream API integration with contract stubs.',
                    },
                    {
                      icon: AlertTriangle,
                      iconColor: 'text-amber-600',
                      role: 'QA & Release Owners',
                      benefit:
                        'See immediately when upstream delays compress testing windows and propose scope buffers ahead of time.',
                    },
                    {
                      icon: CheckCircle2,
                      iconColor: 'text-emerald-600',
                      role: 'Product & Delivery Leads',
                      benefit:
                        'Keep every verbal promise traceable to its original meeting transcript and approve recovery plans cleanly.',
                    },
                    {
                      icon: Sparkles,
                      iconColor: 'text-violet-600',
                      role: 'Live Gemini AI + Deterministic CPM',
                      benefit:
                        'Uses live server-side Gemini AI for commitment extraction and recovery options, paired with deterministic CPM scheduling.',
                    },
                  ].map((b) => {
                    const Icon = b.icon;
                    return (
                      <div
                        key={b.role}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex items-start gap-3.5"
                      >
                        <Icon className={`w-5 h-5 ${b.iconColor} shrink-0 mt-0.5`} />
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">{b.role}</h3>
                          <p className="text-sm text-slate-600 mt-0.5">{b.benefit}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 10. Call to Action */}
        <section className="relative border-b border-slate-200 bg-slate-50 overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.12),transparent_60%)]"
          />
          <div className="relative mx-auto max-w-4xl px-6 py-16 text-center space-y-5">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 text-balance">
              Finish what your team started.
            </h2>
            <p className="text-slate-600 text-base max-w-2xl mx-auto">
              Open the OneFlow AI Execution Twin to analyze live meeting transcripts, run
              deterministic delay simulations, and approve AI recovery plans with full traceability.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <button
                type="button"
                onClick={() => onLaunchWorkspace('overview')}
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 rounded-lg shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
              >
                <span>Launch Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onLaunchWorkspace('meetings')}
                className="px-6 py-3 text-sm font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Analyze a Meeting Transcript
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* 11. Professional Footer */}
      <footer className="bg-white">
        <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="font-display font-semibold text-slate-900">OneFlow AI</span>
            <span aria-hidden="true">·</span>
            <span>The AI Execution Twin · Live Workspace</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="#problem" className="hover:text-slate-900 transition-colors">
              Problem
            </a>
            <a href="#innovations" className="hover:text-slate-900 transition-colors">
              Innovations
            </a>
            <a href="#simulator-preview" className="hover:text-slate-900 transition-colors">
              Simulator
            </a>
            <button
              type="button"
              onClick={() => onLaunchWorkspace('settings')}
              className="hover:text-slate-900 transition-colors cursor-pointer"
            >
              Workspace Settings
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
