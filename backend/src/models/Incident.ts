import mongoose, { Document, Schema } from 'mongoose';

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Status = 'open' | 'investigating' | 'resolved';
export type IncidentSource = 'github-actions' | 'log-forwarder' | 'manual' | 'seed';
export type IncidentCategory = 'ci-cd' | 'database' | 'queue' | 'docker' | 'realtime' | 'api' | 'unknown';

export interface ISimilarIncident {
  incidentId: string;
  title: string;
  similarity: number;
}

export interface IAnalysis {
  rootCause: string;
  suggestedFix: string;
  confidence: number;
  generatedAt: Date;
}

export interface ICommitFile {
  filename: string;
  patch?: string;
}

export interface ICommitFix {
  sha: string;
  message: string;
  author: string;
  url: string;
  files: ICommitFile[];
}

export interface IResolution {
  notes?: string;
  commits: ICommitFix[];
  confirmedShas: string[];
}

export interface IAgentToolCall {
  tool: string;
  args: string;
  result: string;
}

export interface IInvestigation {
  summary: string;
  toolCalls: IAgentToolCall[];
  generatedAt: Date;
}

export interface IIncident extends Document {
  incidentId: string;
  projectId: mongoose.Types.ObjectId;
  title: string;
  service: string;
  severity: Severity;
  status: Status;
  category: IncidentCategory;
  source: IncidentSource;
  logs: string[];
  occurrenceCount: number;
  analysis?: IAnalysis;
  investigation?: IInvestigation;
  similarIncidents: ISimilarIncident[];
  resolution?: IResolution;
  embedding: number[];
  embeddingModel: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SimilarIncidentSchema = new Schema<ISimilarIncident>(
  { incidentId: String, title: String, similarity: Number },
  { _id: false }
);

const AnalysisSchema = new Schema<IAnalysis>(
  { rootCause: String, suggestedFix: String, confidence: Number, generatedAt: Date },
  { _id: false }
);

const CommitFileSchema = new Schema<ICommitFile>(
  { filename: String, patch: String },
  { _id: false }
);

const CommitFixSchema = new Schema<ICommitFix>(
  { sha: String, message: String, author: String, url: String, files: [CommitFileSchema] },
  { _id: false }
);

const ResolutionSchema = new Schema<IResolution>(
  { notes: String, commits: [CommitFixSchema], confirmedShas: [String] },
  { _id: false }
);

const AgentToolCallSchema = new Schema<IAgentToolCall>(
  { tool: String, args: String, result: String },
  { _id: false }
);

const InvestigationSchema = new Schema<IInvestigation>(
  { summary: String, toolCalls: [AgentToolCallSchema], generatedAt: Date },
  { _id: false }
);

const IncidentSchema = new Schema<IIncident>(
  {
    incidentId: { type: String, required: true, unique: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    title: { type: String, required: true },
    service: { type: String, required: true, index: true },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    status: { type: String, enum: ['open', 'investigating', 'resolved'], default: 'open' },
    category: {
      type: String,
      enum: ['ci-cd', 'database', 'queue', 'docker', 'realtime', 'api', 'unknown'],
      default: 'unknown',
    },
    source: {
      type: String,
      enum: ['github-actions', 'log-forwarder', 'manual', 'seed'],
      default: 'manual',
    },
    logs: [{ type: String }],
    occurrenceCount: { type: Number, default: 1 },
    analysis: AnalysisSchema,
    investigation: InvestigationSchema,
    similarIncidents: [SimilarIncidentSchema],
    resolution: ResolutionSchema,
    embedding: { type: [Number], default: [] },
    embeddingModel: { type: String, default: 'text-embedding-004' },
    resolvedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model<IIncident>('Incident', IncidentSchema);
