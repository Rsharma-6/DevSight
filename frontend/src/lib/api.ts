import axios from 'axios'

const BASE = '/api'

function client(apiKey: string) {
  return axios.create({
    baseURL: BASE,
    headers: { 'x-api-key': apiKey },
  })
}

const plain = axios.create({ baseURL: BASE })

// ── Projects ──────────────────────────────────────────────
export async function getProjects() {
  const res = await plain.get('/projects')
  return res.data
}

export async function createProject(data: { name: string; description?: string; githubRepo?: string }) {
  const res = await plain.post('/projects', data)
  return res.data
}

export async function regenerateKey(projectId: string) {
  const res = await plain.post(`/projects/${projectId}/regenerate-key`)
  return res.data
}

export async function deleteProject(projectId: string) {
  const res = await plain.delete(`/projects/${projectId}`)
  return res.data
}

// ── Incidents ─────────────────────────────────────────────
export async function getIncidents(apiKey: string, params?: Record<string, string>) {
  const res = await client(apiKey).get('/incidents', { params })
  return res.data
}

export async function getIncident(apiKey: string, id: string) {
  const res = await client(apiKey).get(`/incidents/${id}`)
  return res.data
}

export async function updateIncidentStatus(apiKey: string, id: string, status: string) {
  const res = await client(apiKey).patch(`/incidents/${id}/status`, { status })
  return res.data
}

export async function updateResolution(
  apiKey: string,
  id: string,
  data: { notes?: string; confirmedShas?: string[] }
) {
  const res = await client(apiKey).patch(`/incidents/${id}/resolution`, data)
  return res.data
}

export async function getStats(apiKey: string) {
  const res = await client(apiKey).get('/incidents/stats/overview')
  return res.data
}

export async function ingestIncident(apiKey: string, data: {
  title: string; service: string; severity?: string; logs: string[]
}) {
  const res = await client(apiKey).post('/incidents', data)
  return res.data
}

// ── Chat ──────────────────────────────────────────────────
export interface AgentToolCall {
  tool: string
  args: string
  result: string
}

export async function chatWithIncident(
  apiKey: string,
  id: string,
  message: string,
  history: Array<{ role: 'user' | 'model'; text: string }>
) {
  const res = await client(apiKey).post(`/incidents/${id}/chat`, { message, history })
  return res.data as { reply: string; trace: AgentToolCall[] }
}

// ── Search ────────────────────────────────────────────────
export async function semanticSearch(apiKey: string, query: string) {
  const res = await client(apiKey).post('/search', { query })
  return res.data
}
