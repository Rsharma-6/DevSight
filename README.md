# DevSight

**AI-powered incident intelligence for software systems — turn raw failure logs into root-cause analysis and fixes using RAG.**

DevSight ingests CI/CD and application failures, groups them into searchable incidents, retrieves similar past failures using Retrieval-Augmented Generation, and uses an LLM to generate root-cause analysis with remediation suggestions. It's designed to reduce Mean Time To Resolution (MTTR) by turning a one-time fix into reusable institutional knowledge.

It currently monitors **CodeRome 2.0**, a distributed AI-powered collaborative coding and online judge platform.

<!-- TODO: Replace with a real screenshot or GIF of the dashboard. This is the single most important thing on this page. -->
![DevSight Dashboard](docs/demo.gif)>

---

## Why DevSight

Engineering teams lose hours to the same failures over and over: searching logs, hunting for the root cause, and rediscovering a fix someone already found months ago. DevSight builds an incident knowledge base so that every failure makes the *next* one faster to resolve.

**The metric that matters:** DevSight targets the time from *failure logs* to *root-cause suggestion*. Manual debugging of a recurring failure typically takes 30–60 minutes of log-reading and investigation; DevSight aims to surface a grounded suggestion in 2–5 minutes by matching against historical incidents.

The hard part of any such tool is the cold start — a brand-new platform has no history to learn from. DevSight solves this with a three-tier bootstrap strategy (curated incidents → generated incidents from a real system → live production incidents), described in [Seeding the Knowledge Base](#seeding-the-knowledge-base).

---

## Tech Stack

**Frontend:** React · TypeScript · Tailwind CSS · shadcn/ui
**Backend:** Node.js · TypeScript · Express
**Database:** MongoDB Atlas
**Vector search:** MongoDB Atlas Vector Search
**AI:** Google Gemini (analysis) · Google text embeddings (vectorization)

---

## Ingestion Sources

DevSight pulls failures from multiple sources into one pipeline:

- **GitHub Actions webhook** ✅ — automatic ingestion of CI/CD workflow failures from CodeRome 2.0. A workflow failure fires a webhook; DevSight pulls the run's logs via the GitHub API and creates an incident.
- **CodeRome log forwarder** ✅ — CodeRome 2.0 forwards application, Docker, queue, and service logs to DevSight's ingestion endpoint.
- **Manual / API ingestion** ✅ — incidents posted directly to the API, also used by seed scripts.

---

## How It Works

Raw logs are not incidents. DevSight groups incoming logs into a single incident using **service + time-window clustering** — logs from the same service within a 5–10 minute window are aggregated into one incident, so 50 lines from one Redis outage become one entry, not 50. Each incident is then embedded immediately, its vector stored, and similarity search runs at that moment — so the analysis is ready before anyone opens it.

```
Failure occurs
      ↓
Ingestion  (GitHub Actions webhook / CodeRome log forwarder / API)
      ↓
Log grouping  (service + 5–10 min time-window clustering)
      ↓
Incident created  ──►  Embedding generated  ──►  Vector stored
      ↓
Similarity search  (top-k similar past incidents)
      ↓
Gemini analysis  (current incident + retrieved history as context)
      ↓
Root cause + suggested fix + confidence  →  Dashboard
```

**On confidence scores:** the confidence value is derived from the cosine similarity of the retrieved incidents, not a number the LLM invents — so it reflects how much real historical evidence supports the diagnosis.

---

## Quick Start

### Prerequisites
- Node.js 20+
- A MongoDB Atlas cluster with Vector Search enabled
- A Google Gemini API key
- A GitHub repo with Actions (for webhook ingestion) — e.g. CodeRome 2.0

### Setup

```bash
# 1. Clone
git clone https://github.com/<your-username>/devsight.git
cd devsight

# 2. Install dependencies (backend + frontend)
npm install
cd client && npm install && cd ..

# 3. Configure environment (see below)
cp .env.example .env

# 4. Seed the knowledge base with starter incidents
npm run seed

# 5. Run
npm run dev                 # backend
cd client && npm run dev    # frontend
```

### Environment Variables

```env
MONGODB_URI=your_mongodb_atlas_connection_string
GEMINI_API_KEY=your_gemini_api_key
EMBEDDING_MODEL=text-embedding-004
VECTOR_INDEX_NAME=incident_vector_index
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_TOKEN=your_github_token_for_fetching_run_logs
PORT=4000
```

---

## Connecting GitHub Actions

Point a webhook at DevSight so CI/CD failures ingest automatically:

1. In your repo settings → **Webhooks**, add `https://<your-devsight-host>/api/webhooks/github`.
2. Set the content type to `application/json` and the secret to your `GITHUB_WEBHOOK_SECRET`.
3. Subscribe to **Workflow runs** events.

On a failed run, DevSight verifies the signature, fetches the run's logs via the GitHub API, groups them into an incident, and runs the analysis pipeline.

---

## Manual Ingestion

Incidents can also be posted directly — this backs both manual entry and the seed scripts:

```bash
curl -X POST http://localhost:4000/api/incidents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Redis Connection Failure",
    "service": "submission-service",
    "severity": "high",
    "logs": ["ECONNREFUSED redis:6379"]
  }'
```

DevSight handles grouping, embedding, storage, retrieval, and AI analysis automatically on ingestion.

---

## Seeding the Knowledge Base

A new platform has no incident history, so retrieval has nothing to match against. DevSight bootstraps in three tiers:

1. **Curated incidents (~50)** — hand-written failures covering Redis, MongoDB, Docker, BullMQ, Socket.IO, and GitHub Actions.
2. **Generated incidents (20–50)** — real failures triggered deliberately in CodeRome 2.0: Redis shutdown, MongoDB shutdown, invalid env vars, worker crashes, API failures.
3. **Live production incidents** — collected automatically from CodeRome deployments over time via the webhook and log forwarder.

Run `npm run seed` to load tiers 1 and 2.

---

## Incident Schema

```json
{
  "incidentId": "INC-001",
  "title": "Redis Connection Failure",
  "service": "submission-service",
  "severity": "high",
  "status": "open",
  "occurrenceCount": 1,
  "timestamp": "2026-06-04T10:00:00Z",
  "source": "github-actions",
  "logs": ["ECONNREFUSED redis:6379"],
  "rootCause": "Redis service unavailable",
  "resolution": "Restart Redis container",
  "similarIncidents": ["INC-014", "INC-031"],
  "embeddingModel": "text-embedding-004",
  "embedding": []
}
```

---

## Incident Categories

DevSight categorizes failures by the part of the system they come from: **CI/CD** (build failures, dependency issues, test failures), **Database** (connection timeouts, auth failures), **Queue** (BullMQ worker crashes, backlog), **Docker** (container startup, execution timeout), **Realtime** (socket disconnects, room sync failures), and **API** (500 errors, service unavailable).

---

## Dashboard

- **Overview** — total / open / resolved incidents, MTTR, and trends
- **Incidents** — full list with filters for severity, service, and date
- **Incident Details** — logs, similar past incidents, AI analysis, and resolution history
- **Knowledge Base** — searchable incident history with plain-English semantic search

---

## Features

### Core (MVP)
- ✅ GitHub Actions webhook ingestion
- ✅ CodeRome log forwarder + manual/API ingestion
- ✅ Log grouping via service + time-window clustering
- ✅ Embedding + vector storage at ingestion
- ✅ RAG similarity retrieval (top-k)
- ✅ Gemini root-cause analysis with similarity-derived confidence
- ✅ Dashboard (overview, incident list, incident detail)
- ✅ Three-tier knowledge base seeding

### Planned Enhancements
- 🔜 **Feedback loop** — mark a suggested fix "worked / didn't work" and feed the outcome back into the incident record
- 🔜 **Incident deduplication** — collapse repeat failures into one incident with an occurrence count
- 🔜 **MTTR tracking** — measure time-to-resolution and show whether DevSight reduces it
- 🔜 **Semantic search bar** — plain-English problem search over the knowledge base
- 🔜 **Severity auto-classification** — AI infers severity from logs at ingestion
- 🔜 **Slack / Discord notifications**

---

## Roadmap (Out of Scope for Now)

Deliberately deferred to keep the MVP focused:

- AI-generated postmortems and automatic GitHub issue creation
- Multi-project and multi-tenant monitoring
- Auth / RBAC
- Kubernetes monitoring and distributed tracing
- Agentic remediation workflows

---