import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { addDaysUTC } from '../src/engine/scheduler.ts';
import type {
  ConfidenceLevel,
  ExtractedMeetingAnalysis,
  ExtractedTaskDraft,
  Project,
  ProjectMember,
  ProposedTaskChange,
  RecoveryOption,
  RiskItem,
  SimulationResult,
  Task,
  TaskPriority,
} from '../src/shared/types.ts';

export const GEMINI_MODEL = 'gemini-4-hydrogen';
export const GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

export class AiServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'AiServiceError';
    this.statusCode = statusCode;
  }
}

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY');
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new AiServiceError(
      'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to run live AI analysis.',
      503
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
      timeout: 18000,
    },
  });
}

function parseEmbeddedGeminiError(rawMessage: string): { code?: number; message?: string; status?: string } | null {
  const trimmed = rawMessage.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { code?: number; message?: string; status?: string };
      code?: number;
      message?: string;
      status?: string;
    };
    const inner = parsed.error || parsed;
    if (inner && (typeof inner.message === 'string' || typeof inner.code === 'number')) {
      return {
        code: typeof inner.code === 'number' ? inner.code : undefined,
        message: typeof inner.message === 'string' ? inner.message : undefined,
        status: typeof inner.status === 'string' ? inner.status : undefined,
      };
    }
  } catch {
    // Ignore non-JSON message
  }
  return null;
}

function extractHttpStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const rec = err as Record<string, unknown>;
    if (typeof rec.status === 'number') return rec.status;
    if (typeof rec.statusCode === 'number') return rec.statusCode;
  }
  if (err instanceof Error) {
    const embedded = parseEmbeddedGeminiError(err.message);
    if (embedded?.code) return embedded.code;
  }
  return undefined;
}

function isTransientError(err: unknown): boolean {
  const status = extractHttpStatus(err);
  if (status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset')
  );
}

function mapGeminiError(err: unknown): AiServiceError {
  if (err instanceof AiServiceError) return err;
  const status = extractHttpStatus(err);
  const rawMessage = err instanceof Error ? err.message : 'Gemini AI request failed.';
  const embedded = parseEmbeddedGeminiError(rawMessage);
  const cleanMessage = embedded?.message || rawMessage;

  if (status === 401 || status === 403) {
    return new AiServiceError(
      'Server GEMINI_API_KEY was rejected by Gemini API. Verify your key in Settings > Secrets.',
      502
    );
  }
  if (status === 429) {
    return new AiServiceError(
      'Gemini API rate limit reached. Please wait a moment and try again.',
      429
    );
  }
  if (status === 503 || cleanMessage.toLowerCase().includes('high demand')) {
    return new AiServiceError(
      'Gemini AI is temporarily experiencing high demand. Please retry in a few seconds.',
      503
    );
  }
  return new AiServiceError(
    cleanMessage,
    status && status >= 400 && status < 600 ? status : 502
  );
}

/**
 * Calls primary live Gemini model (`gemini-4-hydrogen`), and fails over immediately
 * to live free-tier `gemini-3.1-flash-lite` (with retry) if primary returns 503/timeout.
 */
async function callGeminiWithResilience<T>(
  runner: (modelName: string) => Promise<T>
): Promise<{ data: T; modelUsed: string }> {
  const models = [
    { name: GEMINI_MODEL, attempts: 1 },
    { name: GEMINI_FALLBACK_MODEL, attempts: 2 },
  ];
  let lastErr: unknown;

  for (const entry of models) {
    for (let attempt = 0; attempt < entry.attempts; attempt++) {
      try {
        const data = await runner(entry.name);
        return { data, modelUsed: entry.name };
      } catch (err) {
        lastErr = err;
        if (!isTransientError(err)) {
          throw mapGeminiError(err);
        }
        if (attempt < entry.attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      }
    }
  }

  throw mapGeminiError(lastErr);
}

export async function analyzeMeetingWithAI(params: {
  transcript: string;
  pdfBase64?: string;
  project: Project;
  members: ProjectMember[];
  referenceDate?: string;
}): Promise<ExtractedMeetingAnalysis> {
  const referenceDate = params.referenceDate || new Date().toISOString().slice(0, 10);
  const ai = createGeminiClient();
  const memberNames = params.members.map((m) => `${m.name} (${m.role})`).join(', ');

  const systemInstruction = `You are Commitment Intelligence inside OneFlow AI (an AI Execution Twin).
Analyze the meeting transcript or PDF document and extract ONLY verifiable decisions, explicit commitments, tasks, owners, deadlines, and dependencies supported by the text.
CRITICAL RULES:
1. Do NOT invent dependencies merely because tasks appear in sequence in the transcript. Only add a dependencyTempId when the text explicitly states or clearly implies a blocker/prerequisite ("once X finishes", "after X", "waiting on X").
2. If an owner or deadline is missing or ambiguous, set ownerName to "Unassigned" or provide a best guess with confidence="needs_confirmation" and explain why in needsConfirmationReason.
3. Reference date for relative dates (like "Friday", "Monday", "tomorrow", "in 2 days") is ${referenceDate}. Project target deadline is ${params.project.deadline}.
4. Team members in this project: ${memberNames || 'None listed'}.
5. Each extracted task must include a verbatim originalStatement excerpt from the meeting.`;

  const promptText = `Project: ${params.project.name}
Project Description: ${params.project.description}
Analyze the following meeting content and return structured JSON matching the schema:

${params.transcript || '[See attached PDF document]'}`;

  const contents = params.pdfBase64
    ? {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: params.pdfBase64,
            },
          },
          { text: promptText },
        ],
      }
    : promptText;

  const { data: response, modelUsed } = await callGeminiWithResilience((modelName) =>
    ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction,
        ...(modelName === GEMINI_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            meetingTitle: { type: Type.STRING },
            summary: { type: Type.STRING },
            decisions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            unresolvedQuestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            extractedTasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  tempId: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  ownerName: { type: Type.STRING },
                  dueDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
                  estimatedDuration: { type: Type.INTEGER },
                  priority: { type: Type.STRING, description: 'low | medium | high | critical' },
                  originalStatement: { type: Type.STRING },
                  confidence: {
                    type: Type.STRING,
                    description: 'high | medium | needs_confirmation',
                  },
                  confidenceScore: { type: Type.INTEGER },
                  dependencyTempIds: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  needsConfirmationReason: { type: Type.STRING },
                },
                required: [
                  'tempId',
                  'title',
                  'description',
                  'ownerName',
                  'dueDate',
                  'estimatedDuration',
                  'priority',
                  'originalStatement',
                  'confidence',
                  'confidenceScore',
                  'dependencyTempIds',
                ],
              },
            },
          },
          required: [
            'meetingTitle',
            'summary',
            'decisions',
            'unresolvedQuestions',
            'extractedTasks',
          ],
        },
      },
    })
  );

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as Omit<ExtractedMeetingAnalysis, 'aiModel'>;

  const normalizedTasks: ExtractedTaskDraft[] = (parsed.extractedTasks || []).map((t, idx) => ({
    tempId: t.tempId || `draft_${idx + 1}`,
    title: String(t.title || 'Untitled Commitment').trim(),
    description: String(t.description || '').trim(),
    ownerName: String(t.ownerName || 'Unassigned').trim(),
    dueDate: normalizeIsoDate(t.dueDate, addDaysUTC(referenceDate, 2 + idx)),
    estimatedDuration: Math.max(1, Math.min(30, Number(t.estimatedDuration) || 2)),
    priority: normalizePriority(t.priority),
    originalStatement: String(t.originalStatement || '').trim(),
    confidence: normalizeConfidence(t.confidence),
    confidenceScore: Math.max(10, Math.min(100, Number(t.confidenceScore) || 80)),
    dependencyTempIds: Array.isArray(t.dependencyTempIds) ? t.dependencyTempIds.map(String) : [],
    needsConfirmationReason: t.needsConfirmationReason || undefined,
    selected: true,
  }));

  return {
    meetingTitle: parsed.meetingTitle || 'Meeting Commitment Analysis',
    summary: parsed.summary || 'Structured commitments extracted from meeting.',
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    unresolvedQuestions: Array.isArray(parsed.unresolvedQuestions) ? parsed.unresolvedQuestions : [],
    extractedTasks: normalizedTasks,
    aiModel: modelUsed,
  };
}

/**
 * Generates 3 live Gemini recovery strategies grounded strictly in the deterministic SimulationResult.
 */
export async function generateRecoveryStrategies(params: {
  project: Project;
  tasks: Task[];
  simulation: SimulationResult;
}): Promise<{ options: RecoveryOption[]; aiModel: string; disclaimer: string }> {
  const disclaimer =
    'Recovery strategies are advisory recommendations. No project dates, owners, or dependencies are modified until you explicitly approve and apply a plan. Applying a recovery plan does not guarantee project completion.';

  const ai = createGeminiClient();
  const taskContext = params.simulation.taskComparisons
    .map(
      (c) =>
        `- ${c.taskId}: "${c.title}" (Owner: ${c.ownerName}, Orig: ${c.originalStartDate}..${c.originalDueDate}, Sim: ${c.simulatedStartDate}..${c.simulatedDueDate}, Shift: +${c.shiftDays}d, Impact: ${c.impactLevel})`
    )
    .join('\n');

  const systemInstruction = `You are the AI Recovery Planner inside OneFlow AI.
Given a deterministic What-If Delay Simulation result, propose exactly 3 distinct recovery options in order (optionCode: "A", "B", "C"):
1. Option A (strategyType: "parallel_execution"): Decouple or overlap downstream workstreams (e.g., API contract stubbing or parallel QA prep) using changeType="parallelize_dependency" or "reschedule".
2. Option B (strategyType: "revised_timeline"): Rebaseline affected task schedules transparently to their simulated dates using changeType="reschedule".
3. Option C (strategyType: "scope_adjustment"): Trim non-critical scope on the delayed task or downstream work using changeType="trim_scope" to protect the target deadline.
CRITICAL RULES:
- Use ONLY valid taskIds from the provided list.
- All dates must be YYYY-MM-DD.
- Do NOT claim guaranteed project completion.`;

  const prompt = `Project: ${params.project.name} (Target Deadline: ${params.project.deadline})
Delayed Task: "${params.simulation.selectedTaskTitle}" (${params.simulation.selectedTaskId}) delayed by ${params.simulation.delayDays} day(s).
Estimated Project Delay: ${params.simulation.estimatedProjectDelayDays} day(s).
Simulated End Date: ${params.simulation.simulatedProjectEndDate}.
Members to Notify: ${params.simulation.membersToNotify.join(', ') || 'Team'}.

Deterministic Simulation Impact Breakdown:
${taskContext}`;

  const { data: response, modelUsed } = await callGeminiWithResilience((modelName) =>
    ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction,
        ...(modelName === GEMINI_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              optionCode: { type: Type.STRING, description: 'A | B | C' },
              title: { type: Type.STRING },
              strategyType: {
                type: Type.STRING,
                description: 'parallel_execution | revised_timeline | scope_adjustment',
              },
              summary: { type: Type.STRING },
              affectedTaskIds: { type: Type.ARRAY, items: { type: Type.STRING } },
              benefits: { type: Type.ARRAY, items: { type: Type.STRING } },
              tradeOffs: { type: Type.ARRAY, items: { type: Type.STRING } },
              assumptions: { type: Type.ARRAY, items: { type: Type.STRING } },
              estimatedDaysRecovered: { type: Type.INTEGER },
              proposedChanges: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    taskId: { type: Type.STRING },
                    changeType: {
                      type: Type.STRING,
                      description: 'reschedule | parallelize_dependency | trim_scope | reassign_note',
                    },
                    description: { type: Type.STRING },
                    newStartDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    newDueDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    newEstimatedDuration: { type: Type.INTEGER },
                  },
                  required: ['taskId', 'changeType', 'description'],
                },
              },
            },
            required: [
              'optionCode',
              'title',
              'strategyType',
              'summary',
              'affectedTaskIds',
              'benefits',
              'tradeOffs',
              'assumptions',
              'estimatedDaysRecovered',
              'proposedChanges',
            ],
          },
        },
      },
    })
  );

  const validTaskIds = new Set(params.tasks.map((t) => t.id));
  const taskMap = new Map(params.tasks.map((t) => [t.id, t]));
  const rawOptions = JSON.parse((response.text ?? '[]').trim()) as Array<Record<string, unknown>>;

  const strategyMeta: Array<{
    code: 'A' | 'B' | 'C';
    strategyType: RecoveryOption['strategyType'];
    defaultTitle: string;
  }> = [
    { code: 'A', strategyType: 'parallel_execution', defaultTitle: 'Option A — Parallel Execution' },
    { code: 'B', strategyType: 'revised_timeline', defaultTitle: 'Option B — Revised Timeline' },
    { code: 'C', strategyType: 'scope_adjustment', defaultTitle: 'Option C — Scope Adjustment' },
  ];

  const options: RecoveryOption[] = strategyMeta.map((meta, idx) => {
    const aiOpt =
      rawOptions.find((o) => String(o.optionCode).toUpperCase() === meta.code) ||
      rawOptions[idx] ||
      {};

    const filteredIds = Array.isArray(aiOpt.affectedTaskIds)
      ? aiOpt.affectedTaskIds.map(String).filter((id) => validTaskIds.has(id))
      : [];
    const finalIds =
      filteredIds.length > 0 ? filteredIds : [params.simulation.selectedTaskId];

    const rawChanges = Array.isArray(aiOpt.proposedChanges)
      ? (aiOpt.proposedChanges as Array<Record<string, unknown>>)
      : [];

    const proposedChanges: ProposedTaskChange[] = rawChanges
      .map((ch): ProposedTaskChange | null => {
        const taskId = String(ch.taskId || '');
        const taskObj = taskMap.get(taskId);
        if (!taskObj) return null;
        return {
          taskId,
          taskTitle: taskObj.title,
          changeType: normalizeChangeType(ch.changeType),
          description: String(ch.description || `Adjust "${taskObj.title}"`),
          newStartDate: isIsoDate(ch.newStartDate) ? String(ch.newStartDate) : undefined,
          newDueDate: isIsoDate(ch.newDueDate) ? String(ch.newDueDate) : undefined,
          newEstimatedDuration:
            typeof ch.newEstimatedDuration === 'number' && ch.newEstimatedDuration >= 1
              ? Math.min(30, Math.round(ch.newEstimatedDuration))
              : undefined,
        };
      })
      .filter((item): item is ProposedTaskChange => item !== null);

    return {
      id: `opt_${meta.code.toLowerCase()}`,
      optionCode: meta.code,
      title: String(aiOpt.title || meta.defaultTitle),
      strategyType: meta.strategyType,
      summary: String(aiOpt.summary || 'AI-generated recovery option.'),
      affectedTaskIds: finalIds,
      affectedTaskTitles: finalIds.map((id) => taskMap.get(id)?.title || id),
      benefits: Array.isArray(aiOpt.benefits) ? aiOpt.benefits.map(String) : [],
      tradeOffs: Array.isArray(aiOpt.tradeOffs) ? aiOpt.tradeOffs.map(String) : [],
      assumptions: Array.isArray(aiOpt.assumptions) ? aiOpt.assumptions.map(String) : [],
      estimatedDaysRecovered: Math.max(
        0,
        Math.min(params.simulation.delayDays + 2, Number(aiOpt.estimatedDaysRecovered ?? 0))
      ),
      proposedChanges,
    };
  });

  return {
    options,
    aiModel: modelUsed,
    disclaimer,
  };
}

export async function generateRiskInsights(params: {
  project: Project;
  risks: RiskItem[];
}): Promise<{ insight: string; aiModel: string }> {
  const ai = createGeminiClient();

  if (params.risks.length === 0) {
    const { data: response, modelUsed } = await callGeminiWithResilience((modelName) =>
      ai.models.generateContent({
        model: modelName,
        contents: `Project: ${params.project.name} (Deadline ${params.project.deadline}). Zero active execution risks, blockers, or overdue tasks were detected. Provide a crisp 2-sentence status briefing confirming schedule readiness and recommending one proactive safeguard.`,
        config:
          modelName === GEMINI_MODEL
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : undefined,
      })
    );
    return {
      insight:
        (response.text ?? '').trim() ||
        'Execution Twin status is nominal with zero active blockers.',
      aiModel: modelUsed,
    };
  }

  const riskLines = params.risks
    .slice(0, 6)
    .map((r) => `- [${r.severity.toUpperCase()}] ${r.title}: ${r.description}`)
    .join('\n');

  const { data: response, modelUsed } = await callGeminiWithResilience((modelName) =>
    ai.models.generateContent({
      model: modelName,
      contents: `Project: ${params.project.name} (Deadline ${params.project.deadline})
Deterministic risks detected:
${riskLines}

Summarize the top execution bottleneck and the single highest-leverage next step for the team in 2 crisp sentences.`,
      config:
        modelName === GEMINI_MODEL
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : undefined,
    })
  );

  return {
    insight: (response.text ?? '').trim() || `Top risk: ${params.risks[0].title}`,
    aiModel: modelUsed,
  };
}

function isIsoDate(raw: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(raw || '').trim());
}

function normalizeIsoDate(raw: unknown, fallback: string): string {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return fallback;
}

function normalizePriority(raw: unknown): TaskPriority {
  const v = String(raw || '').toLowerCase();
  if (v === 'critical' || v === 'high' || v === 'medium' || v === 'low') return v;
  return 'medium';
}

function normalizeConfidence(raw: unknown): ConfidenceLevel {
  const v = String(raw || '').toLowerCase();
  if (v === 'high' || v === 'medium' || v === 'needs_confirmation') return v;
  return 'medium';
}

function normalizeChangeType(raw: unknown): ProposedTaskChange['changeType'] {
  const v = String(raw || '').toLowerCase();
  if (
    v === 'reschedule' ||
    v === 'parallelize_dependency' ||
    v === 'trim_scope' ||
    v === 'reassign_note'
  ) {
    return v;
  }
  return 'reschedule';
}
