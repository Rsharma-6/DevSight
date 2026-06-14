import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { requireApiKey, AuthRequest } from '../middleware/auth';
import { generateEmbedding } from '../services/embedding';
import { findSimilarIncidents } from '../services/retrieval';

const router = Router();

// Semantic search over knowledge base
router.post('/', requireApiKey, async (req: AuthRequest, res: Response) => {
  try {
    const { query } = req.body;
    if (!query) {
      res.status(400).json({ error: 'query is required' });
      return;
    }

    const embedding = await generateEmbedding(query);
    const results = await findSimilarIncidents(embedding, req.projectId!);

    res.json(
      results.map((r) => ({
        ...r.incident,
        similarity: r.similarity,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
