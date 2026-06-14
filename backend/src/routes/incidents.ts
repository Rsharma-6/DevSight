import { Router, Response } from 'express';
import mongoose from 'mongoose';
import Incident from '../models/Incident';
import { requireApiKey, AuthRequest } from '../middleware/auth';
import { ingestIncident } from '../services/ingestion';
import { fetchCommitsBetween } from '../services/commits';
import { chatWithIncident } from '../services/agent';

const router = Router();

// Ingest a new incident (requires API key)
router.post('/', requireApiKey, async (req: AuthRequest, res: Response) => {
  try {
    const { title, service, severity, logs } = req.body;

    if (!title || !service || !logs?.length) {
      res.status(400).json({ error: 'title, service, and logs are required' });
      return;
    }

    const incident = await ingestIncident({
      projectId: req.projectId!,
      title,
      service,
      severity,
      logs,
      source: 'manual',
    });

    res.status(201).json(incident);
  } catch (err) {
    res.status(500).json({ error: 'Ingestion failed' });
  }
});

// List incidents for a project (requires API key)
router.get('/', requireApiKey, async (req: AuthRequest, res: Response) => {
  try {
    const { severity, service, status, limit = '50', page = '1' } = req.query;
    const filter: Record<string, unknown> = {
      projectId: new mongoose.Types.ObjectId(req.projectId),
    };

    if (severity) filter.severity = severity;
    if (service) filter.service = service;
    if (status) filter.status = status;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const [incidents, total] = await Promise.all([
      Incident.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit as string))
        .select('-embedding -__v'),
      Incident.countDocuments(filter),
    ]);

    res.json({ incidents, total, page: parseInt(page as string), limit: parseInt(limit as string) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

// Dashboard stats for a project — must be before /:id to avoid route conflict
router.get('/stats/overview', requireApiKey, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = new mongoose.Types.ObjectId(req.projectId);

    const [total, open, resolved, bySeverity, byCategory, recentResolved] = await Promise.all([
      Incident.countDocuments({ projectId }),
      Incident.countDocuments({ projectId, status: 'open' }),
      Incident.countDocuments({ projectId, status: 'resolved' }),
      Incident.aggregate([
        { $match: { projectId } },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ]),
      Incident.aggregate([
        { $match: { projectId } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      Incident.find({ projectId, status: 'resolved', resolvedAt: { $exists: true } })
        .select('createdAt resolvedAt')
        .limit(50),
    ]);

    let mttr = 0;
    if (recentResolved.length > 0) {
      const totalMs = recentResolved.reduce((sum, inc) => {
        return sum + (inc.resolvedAt!.getTime() - inc.createdAt.getTime());
      }, 0);
      mttr = Math.round(totalMs / recentResolved.length / 60000);
    }

    res.json({
      total,
      open,
      resolved,
      investigating: total - open - resolved,
      mttr,
      bySeverity: Object.fromEntries(bySeverity.map((b) => [b._id, b.count])),
      byCategory: Object.fromEntries(byCategory.map((b) => [b._id, b.count])),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get single incident
router.get('/:id', requireApiKey, async (req: AuthRequest, res: Response) => {
  try {
    const incident = await Incident.findOne({
      _id: req.params.id,
      projectId: new mongoose.Types.ObjectId(req.projectId),
    }).select('-embedding -__v');

    if (!incident) {
      res.status(404).json({ error: 'Incident not found' });
      return;
    }
    res.json(incident);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch incident' });
  }
});

// Update incident status — fetches commits automatically when resolving
router.patch('/:id/status', requireApiKey, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!['open', 'investigating', 'resolved'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const incident = await Incident.findOne({
      _id: req.params.id,
      projectId: new mongoose.Types.ObjectId(req.projectId),
    });

    if (!incident) {
      res.status(404).json({ error: 'Incident not found' });
      return;
    }

    incident.status = status;

    if (status === 'resolved') {
      incident.resolvedAt = new Date();

      // Auto-fetch commits between incident creation and now
      if (req.projectGithubRepo) {
        const commits = await fetchCommitsBetween(
          req.projectGithubRepo,
          incident.createdAt,
          new Date()
        );
        incident.resolution = {
          commits,
          confirmedShas: [],
          notes: incident.resolution?.notes,
        };
      } else if (!incident.resolution) {
        incident.resolution = { commits: [], confirmedShas: [] };
      }
    }

    await incident.save();
    const result = await Incident.findById(incident._id).select('-embedding -__v');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Save resolution notes and confirmed fix commits
router.patch('/:id/resolution', requireApiKey, async (req: AuthRequest, res: Response) => {
  try {
    const { notes, confirmedShas } = req.body as { notes?: string; confirmedShas?: string[] };

    const incident = await Incident.findOne({
      _id: req.params.id,
      projectId: new mongoose.Types.ObjectId(req.projectId),
    });

    if (!incident) {
      res.status(404).json({ error: 'Incident not found' });
      return;
    }

    incident.resolution = {
      commits: incident.resolution?.commits ?? [],
      notes: notes ?? incident.resolution?.notes,
      confirmedShas: confirmedShas ?? incident.resolution?.confirmedShas ?? [],
    };

    await incident.save();
    const result = await Incident.findById(incident._id).select('-embedding -__v');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save resolution' });
  }
});

// Chat with incident logs
router.post('/:id/chat', requireApiKey, async (req: AuthRequest, res: Response) => {
  try {
    const { message, history = [] } = req.body as {
      message: string;
      history: Array<{ role: 'user' | 'model'; text: string }>;
    };

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const incident = await Incident.findOne({
      _id: req.params.id,
      projectId: new mongoose.Types.ObjectId(req.projectId),
    });

    if (!incident) {
      res.status(404).json({ error: 'Incident not found' });
      return;
    }

    const { reply, trace } = await chatWithIncident(incident, history, message);
    res.json({ reply, trace });
  } catch (err) {
    console.error('Chat failed:', err);
    res.status(500).json({ error: 'Chat failed' });
  }
});

export default router;
