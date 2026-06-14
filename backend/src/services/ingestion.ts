import mongoose from 'mongoose';
import Incident, { IIncident, IncidentSource, Severity, IncidentCategory } from '../models/Incident';
import { generateEmbedding } from './embedding';
import { runAnalysis } from './analysis';
import { investigateIncident } from './agent';
import { sendIncidentAlert } from './email';

const CLUSTER_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export interface IngestPayload {
  projectId: string;
  title: string;
  service: string;
  severity?: Severity;
  logs: string[];
  source?: IncidentSource;
}

async function getNextIncidentId(projectId: string): Promise<string> {
  const count = await Incident.countDocuments({ projectId });
  return `INC-${String(count + 1).padStart(4, '0')}`;
}

function inferCategory(service: string, logs: string[]): IncidentCategory {
  const text = `${service} ${logs.join(' ')}`.toLowerCase();
  if (text.includes('redis') || text.includes('mongo') || text.includes('database') || text.includes('econnrefused')) return 'database';
  if (text.includes('bullmq') || text.includes('queue') || text.includes('worker') || text.includes('job')) return 'queue';
  if (text.includes('docker') || text.includes('container') || text.includes('image')) return 'docker';
  if (text.includes('socket') || text.includes('websocket') || text.includes('realtime')) return 'realtime';
  if (text.includes('github') || text.includes('workflow') || text.includes('ci') || text.includes('build')) return 'ci-cd';
  if (text.includes('api') || text.includes('500') || text.includes('503') || text.includes('http')) return 'api';
  return 'unknown';
}

export async function ingestIncident(payload: IngestPayload): Promise<IIncident> {
  const { projectId, title, service, severity = 'medium', logs, source = 'manual' } = payload;

  // Time-window clustering: find open incident for same service in last 10 min
  const windowStart = new Date(Date.now() - CLUSTER_WINDOW_MS);
  const existing = await Incident.findOne({
    projectId: new mongoose.Types.ObjectId(projectId),
    service,
    status: { $ne: 'resolved' },
    createdAt: { $gte: windowStart },
  }).sort({ createdAt: -1 });

  if (existing) {
    existing.logs.push(...logs);
    existing.occurrenceCount += 1;
    if (severity === 'critical' || (severity === 'high' && existing.severity === 'medium')) {
      existing.severity = severity;
    }
    await existing.save();
    return existing;
  }

  const incidentId = await getNextIncidentId(projectId);
  const category = inferCategory(service, logs);

  const incident = await Incident.create({
    incidentId,
    projectId: new mongoose.Types.ObjectId(projectId),
    title,
    service,
    severity,
    category,
    source,
    logs,
    status: 'open',
    occurrenceCount: 1,
    embedding: [],
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-004',
  });

  embedAndAnalyze(incident._id.toString(), projectId).catch((err) =>
    console.error(`Background processing failed for ${incidentId}:`, err)
  );

  return incident;
}

async function embedAndAnalyze(incidentDbId: string, projectId: string) {
  const incident = await Incident.findById(incidentDbId);
  if (!incident) return;

  const textToEmbed = [
    `Title: ${incident.title}`,
    `Service: ${incident.service}`,
    `Logs: ${incident.logs.slice(0, 50).join(' ')}`,
  ].join('\n');

  const embedding = await generateEmbedding(textToEmbed);
  incident.embedding = embedding;
  await incident.save();

  const analysis = await runAnalysis(incident, projectId);
  incident.analysis = analysis;
  await incident.save();

  sendIncidentAlert(incident, analysis).catch((err) =>
    console.error('Email alert failed:', err)
  );

  // Autonomous agent pass: investigates with tools and attaches a findings
  // report, so the incident arrives pre-investigated. Failure is non-fatal.
  try {
    incident.investigation = await investigateIncident(incident);
    await incident.save();
  } catch (err) {
    console.error(`Agent investigation failed for ${incident.incidentId}:`, err);
  }
}
