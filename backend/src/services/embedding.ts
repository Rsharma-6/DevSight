import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-004';
const MAX_TOKENS = 2048; // truncate logs to stay within embedding limits

let embedder: GoogleGenerativeAIEmbeddings | null = null;

export function getEmbedder(): GoogleGenerativeAIEmbeddings {
  if (!embedder) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    embedder = new GoogleGenerativeAIEmbeddings({ apiKey, model: EMBEDDING_MODEL });
  }
  return embedder;
}

export function truncateText(text: string, maxChars = MAX_TOKENS * 4): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '...[truncated]';
}

export async function generateEmbedding(text: string): Promise<number[]> {
  return getEmbedder().embedQuery(truncateText(text));
}

export async function generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
  return getEmbedder().embedDocuments(texts.map((t) => truncateText(t)));
}
