# OneFlow AI — The AI Execution Twin

**From Conversation to Completion.**

## Overview

Most meeting assistants focus on what was said. **OneFlow AI** focuses on what happens next. It transforms meeting transcripts and notes into a continuously updated **AI Execution Twin** containing commitments, tasks, directional dependencies, deterministic delay simulations, and human-approved recovery plans.

## Architecture & Separation of Responsibilities

1. **Live Gemini AI Layer (`server/ai.ts`) — Interprets Conversations & Recommends Strategies**
   - Uses `@google/genai` (`gemini-4-hydrogen`) strictly on the server via `process.env.GEMINI_API_KEY`.
   - Enforces structured JSON output with `responseSchema` (`Type.OBJECT`, `Type.ARRAY`, etc.) for Meeting Commitment Extraction, AI Recovery Strategy generation, and Risk Radar executive briefings.
   - Propagates explicit configuration/upstream errors cleanly with transient retry handling.
2. **Deterministic Execution Engine (`src/engine/scheduler.ts`) — Pure Algorithms**
   - **Never uses an LLM for scheduling math.**
   - Implements DFS cycle detection, Kahn's topological sort, forward/backward Critical Path Method (`ES`, `EF`, `LS`, `LF`, `slackDays`), non-mutating What-If Delay Propagation, and deterministic Risk Radar detection.
3. **Human-in-the-Loop Governance**
   - Extracted meeting commitments are held in an editable review UI before becoming active tasks.
   - AI Recovery Plans require explicit confirmation via a review modal before modifying any task dates or dependencies.
4. **Persistence (`server/db.ts`)**
   - SQLite via Node's built-in `node:sqlite` (`DatabaseSync`) storing projects, members, meetings, commitments, tasks, dependencies, simulations, recovery plans, and audit logs.

## Running Locally

```bash
npm install
npm run test     # Run deterministic scheduler & risk unit tests
npm run lint     # TypeScript verification
npm run dev      # Starts Express + Vite full-stack server on port 3000
```

## Production Deployment

Set `GEMINI_API_KEY` in your deployment environment secrets, then build and start:

```bash
npm run build
NODE_ENV=production npm start
```

Health check endpoint: `GET /api/health`
