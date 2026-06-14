import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { IIncident, IAnalysis, ICommitFix } from '../models/Incident';
import { findSimilarIncidents, RetrievedIncident } from './retrieval';
import { truncateText } from './embedding';

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

let model: ChatGoogleGenerativeAI | null = null;

function getModel(): ChatGoogleGenerativeAI {
  if (!model) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    model = new ChatGoogleGenerativeAI({ apiKey, model: GEMINI_MODEL, temperature: 0 });
  }
  return model;
}

const analysisSchema = z.object({
  rootCause: z
    .string()
    .describe('Concise, specific root cause (1-2 sentences). The technical reason, not symptoms.'),
  suggestedFix: z
    .string()
    .describe(
      'Clear, actionable remediation steps (2-4 bullet points). Reference engineer resolution notes or fix commits from past incidents when available.'
    ),
});

// Logs and historical context are injected as variables, never inlined into the
// template — log lines routinely contain braces that would break template parsing
const analysisPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    'You are an expert SRE (Site Reliability Engineer) analyzing a software incident. ' +
      'Base your analysis on the current logs and on how engineers resolved similar past incidents.',
  ],
  [
    'human',
    [
      '## Current Incident',
      'Title: {title}',
      'Service: {service}',
      'Severity: {severity}',
      'Category: {category}',
      '',
      '## Current Logs',
      '{logs}',
      '',
      '## Similar Past Incidents (including how engineers actually fixed them)',
      '{historicalContext}',
    ].join('\n'),
  ],
]);

function formatCommits(commits: ICommitFix[], confirmedShas: string[]): string {
  const relevant = confirmedShas.length
    ? commits.filter((c) => confirmedShas.includes(c.sha))
    : commits;

  if (!relevant.length) return 'None recorded';

  return relevant
    .map((c) => {
      const files = c.files.map((f) => f.filename).join(', ');
      return `  • ${c.sha} "${c.message}" by ${c.author} — changed: ${files}`;
    })
    .join('\n');
}

export function buildHistoricalContext(similar: RetrievedIncident[]): string {
  if (!similar.length) return 'No similar past incidents found.';

  return similar
    .map((s, i) => {
      const commits = s.incident.resolution?.commits ?? [];
      const confirmed = s.incident.resolution?.confirmedShas ?? [];
      const fixCommits = formatCommits(commits, confirmed);
      const notes = s.incident.resolution?.notes || 'None recorded';

      return `
--- Past Incident ${i + 1} (similarity: ${(s.similarity * 100).toFixed(1)}%) ---
Title: ${s.incident.title}
Service: ${s.incident.service}
Root Cause: ${s.incident.analysis?.rootCause || 'Unknown'}
AI Suggested Fix: ${s.incident.analysis?.suggestedFix || 'None recorded'}
Engineer Resolution Notes: ${notes}
Fix Commits: ${fixCommits}
Logs: ${truncateText(s.incident.logs.slice(0, 5).join('\n'), 500)}
`.trim();
    })
    .join('\n\n');
}

export async function runAnalysis(incident: IIncident, projectId: string): Promise<IAnalysis> {
  const similar = incident.embedding.length
    ? await findSimilarIncidents(incident.embedding, projectId, incident._id.toString())
    : [];

  // Confidence comes from retrieval similarity, never from the LLM
  const confidence = similar.length
    ? parseFloat((similar.reduce((sum, s) => sum + s.similarity, 0) / similar.length).toFixed(3))
    : 0;

  if (similar.length) {
    incident.similarIncidents = similar.map((s) => ({
      incidentId: s.incident.incidentId,
      title: s.incident.title,
      similarity: parseFloat(s.similarity.toFixed(3)),
    }));
  }

  try {
    const chain = analysisPrompt.pipe(getModel().withStructuredOutput(analysisSchema));

    const parsed = await chain.invoke({
      title: incident.title,
      service: incident.service,
      severity: incident.severity,
      category: incident.category,
      logs: truncateText(incident.logs.join('\n'), 3000),
      historicalContext: buildHistoricalContext(similar),
    });

    return {
      rootCause: parsed.rootCause || 'Unable to determine root cause',
      suggestedFix: parsed.suggestedFix || 'No fix suggested',
      confidence,
      generatedAt: new Date(),
    };
  } catch (err) {
    console.error('Gemini analysis failed:', err);
    return {
      rootCause: 'Analysis failed — check logs manually',
      suggestedFix: 'Review the incident logs and compare with similar past incidents',
      confidence,
      generatedAt: new Date(),
    };
  }
}
