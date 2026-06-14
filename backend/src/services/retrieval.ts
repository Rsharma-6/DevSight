import mongoose from 'mongoose';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import type { Collection, Document as MongoDocument } from 'mongodb';
import Incident, { IIncident } from '../models/Incident';
import { getEmbedder } from './embedding';

const VECTOR_INDEX = process.env.VECTOR_INDEX_NAME || 'incident_vector_index';
const TOP_K = 5;

export interface RetrievedIncident {
  incident: IIncident;
  similarity: number;
}

let vectorStore: MongoDBAtlasVectorSearch | null = null;

function getVectorStore(): MongoDBAtlasVectorSearch {
  if (!vectorStore) {
    const collection = mongoose.connection.collection('incidents') as unknown as Collection<MongoDocument>;
    vectorStore = new MongoDBAtlasVectorSearch(getEmbedder(), {
      collection,
      indexName: VECTOR_INDEX,
      textKey: 'title',
      embeddingKey: 'embedding',
    });
  }
  return vectorStore;
}

export async function findSimilarIncidents(
  embedding: number[],
  projectId: string,
  excludeId?: string
): Promise<RetrievedIncident[]> {
  const results = await getVectorStore().similaritySearchVectorWithScore(embedding, TOP_K + 1, {
    preFilter: { projectId: { $eq: new mongoose.Types.ObjectId(projectId) } },
  });

  const scored = results
    .map(([doc, score]) => ({ id: String(doc.metadata._id), similarity: score }))
    .filter((r) => !excludeId || r.id !== excludeId)
    .slice(0, TOP_K);

  if (!scored.length) return [];

  // Hydrate full typed documents; vector store results only carry raw metadata
  const incidents = await Incident.find({ _id: { $in: scored.map((r) => r.id) } }).select('-embedding -__v');
  const byId = new Map(incidents.map((inc) => [inc._id.toString(), inc]));

  return scored
    .filter((r) => byId.has(r.id))
    .map((r) => ({ incident: byId.get(r.id)!, similarity: r.similarity }));
}
