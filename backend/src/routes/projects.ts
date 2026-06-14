import { Router, Request, Response } from 'express';
import { customAlphabet } from 'nanoid';
import Project from '../models/Project';

const router = Router();
const generateKey = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 32);

// Create project
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, githubRepo } = req.body;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const apiKey = `ds_${generateKey()}`;
    const project = await Project.create({ name, description, githubRepo, apiKey });

    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// List all projects
router.get('/', async (_req: Request, res: Response) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 }).select('-__v');
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get single project
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const project = await Project.findById(req.params.id).select('-__v');
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Regenerate API key
router.post('/:id/regenerate-key', async (req: Request, res: Response) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    project.apiKey = `ds_${generateKey()}`;
    await project.save();

    res.json({ apiKey: project.apiKey });
  } catch (err) {
    res.status(500).json({ error: 'Failed to regenerate API key' });
  }
});

// Delete project
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
