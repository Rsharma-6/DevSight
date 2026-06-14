import {
  GoogleGenerativeAI,
  SchemaType,
  Content,
  FunctionDeclaration,
} from '@google/generative-ai';
import mongoose from 'mongoose';
import Incident, { IIncident, IAgentToolCall, IInvestigation } from '../models/Incident';
import { findSimilarIncidents } from './retrieval';
import { GEMINI_MODEL } from './analysis';

// The agent is a hand-written function-calling loop on the raw Gemini SDK
// (deliberately no agent framework): the model picks tools, we execute them
// as scoped queries, and it reads only the small results — never all logs.

const MAX_ITERATIONS = 8;
const MAX_MATCHES = 30;
const MAX_LINE_CHARS = 400;

let genAI: GoogleGenerativeAI | null = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'search_logs',
    description:
      "Search this incident's log lines for a case-insensitive regex or substring. Returns matching lines with their line numbers (capped at 30).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        pattern: { type: SchemaType.STRING, description: 'Regex or substring to search for' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'count_logs',
    description:
      "Count how many of this incident's log lines match a case-insensitive regex or substring. Exhaustive — covers every line.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        pattern: { type: SchemaType.STRING, description: 'Regex or substring to count' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'get_log_window',
    description: 'Read log lines around a given line number (for context before/after an error).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        line: { type: SchemaType.NUMBER, description: 'Center line number (1-based)' },
        radius: { type: SchemaType.NUMBER, description: 'Lines of context on each side (default 5, max 15)' },
      },
      required: ['line'],
    },
  },
  {
    name: 'find_similar_incidents',
    description:
      'Vector-search the knowledge base for past incidents similar to this one. Returns id, title, similarity, status and root cause.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'get_incident_resolution',
    description:
      'Fetch how a past incident was resolved: engineer notes, confirmed fix commits and suggested fix. Use an incidentId from find_similar_incidents.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        incidentId: { type: SchemaType.STRING, description: 'e.g. INC-0042' },
      },
      required: ['incidentId'],
    },
  },
];

function safeRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    // fall back to literal substring match when the pattern is not valid regex
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
}

function clip(line: string): string {
  return line.length > MAX_LINE_CHARS ? line.slice(0, MAX_LINE_CHARS) + '…' : line;
}

async function executeTool(
  incident: IIncident,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'search_logs': {
      const re = safeRegex(String(args.pattern ?? ''));
      const matches: Array<{ line: number; text: string }> = [];
      let total = 0;
      incident.logs.forEach((text, i) => {
        if (re.test(text)) {
          total++;
          if (matches.length < MAX_MATCHES) matches.push({ line: i + 1, text: clip(text) });
        }
      });
      return { totalMatches: total, showing: matches.length, matches };
    }

    case 'count_logs': {
      const re = safeRegex(String(args.pattern ?? ''));
      const count = incident.logs.filter((l) => re.test(l)).length;
      return { count, totalLines: incident.logs.length };
    }

    case 'get_log_window': {
      const line = Math.max(1, Number(args.line) || 1);
      const radius = Math.min(15, Math.max(1, Number(args.radius) || 5));
      const start = Math.max(0, line - 1 - radius);
      const end = Math.min(incident.logs.length, line + radius);
      return {
        lines: incident.logs.slice(start, end).map((text, i) => ({ line: start + i + 1, text: clip(text) })),
      };
    }

    case 'find_similar_incidents': {
      if (!incident.embedding.length) return { similar: [], note: 'Incident not embedded yet' };
      const similar = await findSimilarIncidents(
        incident.embedding,
        incident.projectId.toString(),
        incident._id.toString()
      );
      return {
        similar: similar.map((s) => ({
          incidentId: s.incident.incidentId,
          title: s.incident.title,
          similarity: parseFloat(s.similarity.toFixed(3)),
          status: s.incident.status,
          rootCause: s.incident.analysis?.rootCause || 'Unknown',
        })),
      };
    }

    case 'get_incident_resolution': {
      const other = await Incident.findOne({
        incidentId: String(args.incidentId ?? ''),
        projectId: new mongoose.Types.ObjectId(incident.projectId.toString()),
      }).select('-embedding -__v');
      if (!other) return { error: 'Incident not found in this project' };
      return {
        incidentId: other.incidentId,
        title: other.title,
        status: other.status,
        rootCause: other.analysis?.rootCause || 'Unknown',
        suggestedFix: other.analysis?.suggestedFix || 'None recorded',
        resolutionNotes: other.resolution?.notes || 'None recorded',
        fixCommits: (other.resolution?.commits ?? [])
          .filter(
            (c) =>
              !other.resolution?.confirmedShas.length ||
              other.resolution.confirmedShas.includes(c.sha)
          )
          .map((c) => ({
            sha: c.sha,
            message: c.message,
            files: c.files.map((f) => f.filename),
          })),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function summarizeResult(result: unknown): string {
  const text = JSON.stringify(result);
  return text.length > 200 ? text.slice(0, 200) + '…' : text;
}

function buildSystemInstruction(incident: IIncident): string {
  return `You are an expert SRE investigating a software incident. You can NOT see the logs directly — use your tools to search, count and read them. Narrow down with count_logs/search_logs before reading; never try to read everything. Check the knowledge base for similar past incidents and how they were actually fixed. Always cite the specific log lines and past incidents your conclusions are based on. Be concise.

## Incident
ID: ${incident.incidentId}
Title: ${incident.title}
Service: ${incident.service}
Severity: ${incident.severity}
Category: ${incident.category}
Status: ${incident.status}
Log lines: ${incident.logs.length}
${incident.analysis ? `Prior automated analysis — Root Cause: ${incident.analysis.rootCause} | Suggested Fix: ${incident.analysis.suggestedFix}` : 'No prior analysis yet.'}`;
}

export interface AgentResult {
  reply: string;
  trace: IAgentToolCall[];
}

async function runAgentLoop(incident: IIncident, contents: Content[]): Promise<AgentResult> {
  const model = getGenAI().getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: buildSystemInstruction(incident),
    tools: [{ functionDeclarations }],
  });

  const trace: IAgentToolCall[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const isLastIteration = i === MAX_ITERATIONS - 1;
    const result = await model.generateContent({
      contents,
      // on the final pass force a text answer instead of more tool calls
      ...(isLastIteration && { toolConfig: { functionCallingConfig: { mode: 'NONE' as never } } }),
    });

    const calls = result.response.functionCalls();
    if (!calls?.length) {
      return { reply: result.response.text(), trace };
    }

    contents.push(result.response.candidates![0].content);

    const responseParts = [];
    for (const call of calls) {
      const args = (call.args ?? {}) as Record<string, unknown>;
      let toolResult: unknown;
      try {
        toolResult = await executeTool(incident, call.name, args);
      } catch (err) {
        toolResult = { error: (err as Error).message };
      }
      trace.push({ tool: call.name, args: JSON.stringify(args), result: summarizeResult(toolResult) });
      responseParts.push({ functionResponse: { name: call.name, response: { result: toolResult } } });
    }
    contents.push({ role: 'function', parts: responseParts });
  }

  return { reply: 'Investigation hit the iteration limit before reaching a conclusion.', trace };
}

export async function chatWithIncident(
  incident: IIncident,
  history: Array<{ role: 'user' | 'model'; text: string }>,
  message: string
): Promise<AgentResult> {
  const contents: Content[] = [
    ...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: message }] },
  ];
  return runAgentLoop(incident, contents);
}

export async function investigateIncident(incident: IIncident): Promise<IInvestigation> {
  const { reply, trace } = await runAgentLoop(incident, [
    {
      role: 'user',
      parts: [
        {
          text: 'Investigate this incident. Identify the failure point in the logs, check the knowledge base for similar past incidents and how they were fixed, and produce a short findings report: what happened, the most likely cause, and the most promising fix based on history.',
        },
      ],
    },
  ]);

  return { summary: reply, toolCalls: trace, generatedAt: new Date() };
}
