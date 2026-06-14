import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import mongoose from 'mongoose';
import { ingestIncident } from '../services/ingestion';
import Project from '../models/Project';

const router = Router();

function verifySignature(payload: Buffer, signature: string, secret: string): boolean {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function fetchWorkflowLogs(owner: string, repo: string, runId: string): Promise<string[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return ['GitHub token not configured — logs unavailable'];

  try {
    // Get jobs for the run
    const jobsRes = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
    );

    const failedJobs = jobsRes.data.jobs.filter((j: { conclusion: string }) => j.conclusion === 'failure');
    const logLines: string[] = [];

    for (const job of failedJobs.slice(0, 3)) {
      const failedSteps = job.steps
        ?.filter((s: { conclusion: string; name: string }) => s.conclusion === 'failure')
        .map((s: { name: string }) => `Step failed: ${s.name}`);
      if (failedSteps?.length) logLines.push(...failedSteps);

      try {
        const logsRes = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}/actions/jobs/${job.id}/logs`,
          {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
            maxRedirects: 5,
          }
        );
        const lines = logsRes.data.split('\n').filter((l: string) => l.trim());
        logLines.push(...lines.slice(-50)); // last 50 lines of each job
      } catch {
        logLines.push(`Could not fetch logs for job: ${job.name}`);
      }
    }

    return logLines.length ? logLines : ['No failure details found in logs'];
  } catch (err) {
    return [`Failed to fetch GitHub logs: ${(err as Error).message}`];
  }
}

// GitHub Actions webhook — project identified by query param or header
router.post('/github', async (req: Request, res: Response) => {
  const rawBody = req.body as Buffer;
  const signature = req.headers['x-hub-signature-256'] as string;
  const event = req.headers['x-github-event'] as string;

  // Look up project by apiKey passed as query param for webhook identification
  const apiKey = req.query.apiKey as string;
  if (!apiKey) {
    res.status(400).json({ error: 'apiKey query param required for webhook' });
    return;
  }

  const project = await Project.findOne({ apiKey });
  if (!project) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  // Verify webhook signature — when a secret is configured, an absent or
  // invalid signature must be rejected, otherwise anyone can inject incidents
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    if (!signature || !verifySignature(rawBody, signature, secret)) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
  }

  if (event !== 'workflow_run') {
    res.status(200).json({ message: 'Event ignored' });
    return;
  }

  const payload = JSON.parse(rawBody.toString());

  // Only process failed runs
  if (payload.action !== 'completed' || payload.workflow_run?.conclusion !== 'failure') {
    res.status(200).json({ message: 'Not a failed run' });
    return;
  }

  const run = payload.workflow_run;
  const repoFullName: string = payload.repository?.full_name || '';
  const [owner, repo] = repoFullName.split('/');

  const logs = await fetchWorkflowLogs(owner, repo, run.id.toString());

  const projectId = (project._id as mongoose.Types.ObjectId).toString();

  ingestIncident({
    projectId,
    title: `CI Failure: ${run.name} on ${run.head_branch}`,
    service: 'github-actions',
    severity: 'high',
    logs,
    source: 'github-actions',
  }).catch((err) => console.error('Webhook ingestion failed:', err));

  res.status(200).json({ message: 'Webhook received' });
});

export default router;
