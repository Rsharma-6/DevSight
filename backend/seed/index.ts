import 'dotenv/config';
import mongoose from 'mongoose';
import { curatedIncidents } from './incidents';
import { connectDB } from '../src/config/db';
import { generateEmbedding } from '../src/services/embedding';
import { runAnalysis } from '../src/services/analysis';
import Incident from '../src/models/Incident';
import Project from '../src/models/Project';
import { customAlphabet } from 'nanoid';

const generateKey = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 32);

async function seed() {
  await connectDB();
  console.log('Starting seed...\n');

  // Create or reuse seed project
  let project = await Project.findOne({ name: 'DevSight Seed Project' });
  if (!project) {
    project = await Project.create({
      name: 'DevSight Seed Project',
      description: 'Pre-seeded knowledge base with curated incidents',
      apiKey: `ds_seed_${generateKey()}`,
    });
    console.log(`Created seed project: ${project.name}`);
    console.log(`API Key: ${project.apiKey}\n`);
  } else {
    console.log(`Using existing seed project: ${project.name} (${project.apiKey})\n`);
  }

  const projectId = (project._id as mongoose.Types.ObjectId).toString();

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < curatedIncidents.length; i++) {
    const inc = curatedIncidents[i];
    const incidentId = `INC-${String(i + 1).padStart(4, '0')}`;

    const exists = await Incident.findOne({ incidentId, projectId: new mongoose.Types.ObjectId(projectId) });
    if (exists) {
      skipped++;
      continue;
    }

    process.stdout.write(`[${i + 1}/${curatedIncidents.length}] Embedding: ${inc.title}...`);

    const textToEmbed = [
      `Title: ${inc.title}`,
      `Service: ${inc.service}`,
      `Logs: ${inc.logs.join(' ')}`,
    ].join('\n');

    const embedding = await generateEmbedding(textToEmbed);

    const incident = await Incident.create({
      incidentId,
      projectId: new mongoose.Types.ObjectId(projectId),
      title: inc.title,
      service: inc.service,
      severity: inc.severity,
      category: inc.category,
      source: 'seed',
      logs: inc.logs,
      status: 'resolved',
      occurrenceCount: 1,
      embedding,
      embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-004',
      analysis: inc.rootCause
        ? {
            rootCause: inc.rootCause,
            suggestedFix: inc.suggestedFix || '',
            confidence: 0.95,
            generatedAt: new Date(),
          }
        : undefined,
      resolvedAt: new Date(),
    });

    console.log(` ✓`);
    created++;

    // Small delay to avoid rate limiting on embedding API
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nSeed complete: ${created} created, ${skipped} skipped`);
  console.log(`\nAdd this to your .env to use the seed project:\nPROJECT_API_KEY=${project.apiKey}`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
