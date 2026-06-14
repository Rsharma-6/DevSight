import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Project from '../models/Project';

export interface AuthRequest extends Request {
  projectId?: string;
  projectName?: string;
  projectGithubRepo?: string;
}

export async function requireApiKey(req: AuthRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'Missing x-api-key header' });
    return;
  }

  const project = await Project.findOne({ apiKey });
  if (!project) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  req.projectId = (project._id as mongoose.Types.ObjectId).toString();
  req.projectName = project.name;
  req.projectGithubRepo = project.githubRepo;
  next();
}
