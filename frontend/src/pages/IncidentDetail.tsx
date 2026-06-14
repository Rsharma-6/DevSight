import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Clock, Cpu, GitBranch,
  Lightbulb, CheckCircle, Loader, ExternalLink, GitCommit,
  FileCode, ChevronDown, ChevronUp, Save, X, MessageSquare, Send, Bot, User,
  Wrench, Sparkles
} from 'lucide-react'
import { useProject } from '@/lib/projectContext'
import { getIncident, updateIncidentStatus, updateResolution, chatWithIncident, type AgentToolCall } from '@/lib/api'
import { formatDate, timeAgo, severityColor, statusColor, confidenceColor, cn } from '@/lib/utils'

interface Analysis {
  rootCause: string
  suggestedFix: string
  confidence: number
  generatedAt: string
}

interface SimilarIncident {
  incidentId: string
  title: string
  similarity: number
}

interface CommitFile {
  filename: string
  patch?: string
}

interface CommitFix {
  sha: string
  message: string
  author: string
  url: string
  files: CommitFile[]
}

interface Resolution {
  notes?: string
  commits: CommitFix[]
  confirmedShas: string[]
}

interface Investigation {
  summary: string
  toolCalls: AgentToolCall[]
  generatedAt: string
}

interface Incident {
  _id: string
  incidentId: string
  title: string
  service: string
  severity: string
  status: string
  category: string
  source: string
  logs: string[]
  occurrenceCount: number
  analysis?: Analysis
  investigation?: Investigation
  similarIncidents: SimilarIncident[]
  resolution?: Resolution
  embeddingModel: string
  createdAt: string
  updatedAt: string
  resolvedAt?: string
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['investigating', 'resolved'],
  investigating: ['resolved', 'open'],
  resolved: ['open'],
}

// ── Resolve Modal ────────────────────────────────────────────────────────────

interface ResolveModalProps {
  onConfirm: (status: string) => void
  onCancel: () => void
  updating: boolean
}

function ResolveModal({ onConfirm, onCancel, updating }: ResolveModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#111118] border border-slate-800 rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-200 font-semibold">Mark as Resolved</h3>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        </div>
        <p className="text-slate-400 text-sm mb-5 leading-relaxed">
          DevSight will automatically detect commits pushed during this incident.
          You can review and confirm them after resolving.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm('resolved')}
            disabled={updating}
            className="flex-1 px-4 py-2 text-sm rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {updating ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />}
            Resolve
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Commit diff viewer ───────────────────────────────────────────────────────

function CommitCard({
  commit,
  checked,
  onChange,
  readonly,
}: {
  commit: CommitFix
  checked: boolean
  onChange?: (checked: boolean) => void
  readonly?: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn(
      'border rounded-lg overflow-hidden transition-colors',
      checked ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-slate-800 bg-[#0d0d14]'
    )}>
      <div className="flex items-start gap-3 px-4 py-3">
        {!readonly && (
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange?.(e.target.checked)}
            className="mt-0.5 accent-indigo-500 cursor-pointer flex-shrink-0"
          />
        )}
        {readonly && (
          <div className={cn('mt-0.5 w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center',
            checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'
          )}>
            {checked && <CheckCircle size={10} className="text-white" />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-indigo-400">{commit.sha}</span>
            <span className="text-slate-300 text-sm truncate">{commit.message}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
            <span>{commit.author}</span>
            <span>{commit.files.length} file{commit.files.length !== 1 ? 's' : ''} changed</span>
            <a
              href={commit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              View <ExternalLink size={10} />
            </a>
          </div>
        </div>
        {commit.files.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {expanded && commit.files.length > 0 && (
        <div className="border-t border-slate-800 divide-y divide-slate-800/50">
          {commit.files.map((f) => (
            <div key={f.filename} className="px-4 py-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileCode size={12} className="text-slate-500" />
                <span className="font-mono text-xs text-slate-400">{f.filename}</span>
              </div>
              {f.patch && (
                <pre className="text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
                  {f.patch.split('\n').map((line, i) => (
                    <span
                      key={i}
                      className={cn(
                        'block',
                        line.startsWith('+') ? 'text-green-400 bg-green-500/5' :
                        line.startsWith('-') ? 'text-red-400 bg-red-500/5' :
                        'text-slate-500'
                      )}
                    >
                      {line}
                    </span>
                  ))}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Resolution Panel ─────────────────────────────────────────────────────────

function ResolutionPanel({
  incident,
  apiKey,
  onUpdate,
}: {
  incident: Incident
  apiKey: string
  onUpdate: (updated: Incident) => void
}) {
  const resolution = incident.resolution
  const [notes, setNotes] = useState(resolution?.notes ?? '')
  const [confirmedShas, setConfirmedShas] = useState<string[]>(resolution?.confirmedShas ?? [])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const commits = resolution?.commits ?? []
  const hasCommits = commits.length > 0

  function toggleSha(sha: string, checked: boolean) {
    setConfirmedShas((prev) =>
      checked ? [...prev, sha] : prev.filter((s) => s !== sha)
    )
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await updateResolution(apiKey, incident._id, { notes, confirmedShas })
      onUpdate(updated)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-[#111118] border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
        <CheckCircle size={15} className="text-green-400" />
        <span className="text-slate-300 text-sm font-medium">Resolution</span>
      </div>

      <div className="p-5 space-y-5">
        {/* Notes */}
        <div>
          <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">
            What fixed it?
          </label>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setSaved(false) }}
            rows={3}
            placeholder="e.g. Increased DB_POOL_MAX from 10 to 50 in .env and restarted the pod"
            className="w-full bg-[#0d0d14] border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 resize-none transition-colors"
          />
        </div>

        {/* Detected commits */}
        {hasCommits && (
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">
              Commits during this incident — check the ones that fixed it
            </label>
            <div className="space-y-2">
              {commits.map((c) => (
                <CommitCard
                  key={c.sha}
                  commit={c}
                  checked={confirmedShas.includes(c.sha)}
                  onChange={(checked) => toggleSha(c.sha, checked)}
                />
              ))}
            </div>
          </div>
        )}

        {!hasCommits && (
          <p className="text-slate-600 text-xs">
            No commits detected — add your GitHub repo to the project to enable auto-detection.
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 border border-indigo-500/20 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
          {saved ? 'Saved' : 'Save Resolution'}
        </button>
      </div>
    </div>
  )
}

// ── Agent tool trace ─────────────────────────────────────────────────────────

function formatToolArgs(args: string): string {
  try {
    const parsed = JSON.parse(args)
    return Object.entries(parsed).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')
  } catch {
    return args
  }
}

function AgentTrace({ trace }: { trace: AgentToolCall[] }) {
  if (!trace.length) return null
  return (
    <div className="space-y-1">
      {trace.map((t, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs text-slate-500 font-mono min-w-0">
          <Wrench size={10} className="text-indigo-400 flex-shrink-0" />
          <span className="truncate">{t.tool}({formatToolArgs(t.args)})</span>
        </div>
      ))}
    </div>
  )
}

// ── Agent Investigation card ─────────────────────────────────────────────────

function InvestigationCard({ investigation }: { investigation: Investigation }) {
  const [showTrace, setShowTrace] = useState(false)
  const calls = investigation.toolCalls ?? []

  return (
    <div className="bg-[#111118] border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
        <Sparkles size={15} className="text-indigo-400" />
        <span className="text-slate-300 text-sm font-medium">Agent Investigation</span>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-line">
          {investigation.summary}
        </p>
        {calls.length > 0 && (
          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={() => setShowTrace(!showTrace)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              {showTrace ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {calls.length} tool call{calls.length !== 1 ? 's' : ''} during investigation
            </button>
            {showTrace && <div className="mt-2"><AgentTrace trace={calls} /></div>}
          </div>
        )}
        <div className="text-xs text-slate-600">Investigated {timeAgo(investigation.generatedAt)}</div>
      </div>
    </div>
  )
}

// ── Log Chat ─────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'model'
  text: string
  trace?: AgentToolCall[]
}

function LogChat({ incidentId, apiKey }: { incidentId: string; apiKey: string }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  async function send() {
    const text = input.trim()
    if (!text || thinking) return
    setInput('')
    const next: ChatMessage[] = [...messages, { role: 'user', text }]
    setMessages(next)
    setThinking(true)
    try {
      const history = next.slice(0, -1).map(({ role, text }) => ({ role, text }))
      const { reply, trace } = await chatWithIncident(apiKey, incidentId, text, history)
      setMessages([...next, { role: 'model', text: reply, trace }])
    } catch {
      setMessages([...next, { role: 'model', text: 'Sorry, something went wrong. Please try again.' }])
    } finally {
      setThinking(false)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="bg-[#111118] border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-slate-300 text-sm font-medium">
          <MessageSquare size={15} className="text-indigo-400" />
          Ask about this incident
        </div>
        <ChevronDown size={14} className={cn('text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-slate-800 flex flex-col" style={{ height: '420px' }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-slate-600 text-xs text-center pt-8">
                Ask anything about the logs — root cause, error patterns, affected services…
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn('flex gap-2.5', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                {m.role === 'model' && (
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot size={12} className="text-indigo-400" />
                  </div>
                )}
                <div className={cn(
                  'max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'bg-indigo-500/15 text-indigo-100 border border-indigo-500/20 rounded-tr-sm'
                    : 'bg-slate-800/60 text-slate-200 border border-slate-700/50 rounded-tl-sm'
                )}>
                  {m.trace && m.trace.length > 0 && (
                    <div className="mb-2 pb-2 border-b border-slate-700/50">
                      <AgentTrace trace={m.trace} />
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{m.text}</p>
                </div>
                {m.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User size={12} className="text-slate-400" />
                  </div>
                )}
              </div>
            ))}
            {thinking && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot size={12} className="text-indigo-400" />
                </div>
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-800 px-3 py-3 flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              placeholder="Ask a question… (Enter to send)"
              className="flex-1 bg-[#0d0d14] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 resize-none transition-colors"
              style={{ maxHeight: '96px', overflowY: 'auto' }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || thinking}
              className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/20 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>()
  const { activeProject } = useProject()
  const navigate = useNavigate()
  const [incident, setIncident] = useState<Incident | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [showResolveModal, setShowResolveModal] = useState(false)

  useEffect(() => {
    if (!activeProject || !id) return
    setLoading(true)
    getIncident(activeProject.apiKey, id)
      .then(setIncident)
      .catch(() => navigate('/incidents'))
      .finally(() => setLoading(false))
  }, [activeProject, id])

  async function handleStatusChange(newStatus: string) {
    if (!activeProject || !incident) return
    setUpdating(true)
    try {
      const updated = await updateIncidentStatus(activeProject.apiKey, incident._id, newStatus)
      setIncident(updated)
    } finally {
      setUpdating(false)
      setShowResolveModal(false)
    }
  }

  if (!activeProject) {
    return (
      <div className="p-8 text-slate-400 text-sm">
        Select a project first. <Link to="/projects" className="text-indigo-400 hover:underline">Go to Projects</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-slate-500 text-sm">
        <Loader size={14} className="animate-spin" />
        Loading incident…
      </div>
    )
  }

  if (!incident) return null

  const transitions = STATUS_TRANSITIONS[incident.status] || []

  return (
    <div className="p-8 max-w-5xl">
      {showResolveModal && (
        <ResolveModal
          onConfirm={handleStatusChange}
          onCancel={() => setShowResolveModal(false)}
          updating={updating}
        />
      )}

      {/* Back */}
      <Link to="/incidents" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm mb-6 transition-colors w-fit">
        <ArrowLeft size={14} />
        Back to Incidents
      </Link>

      {/* Title row */}
      <div className="flex items-start justify-between gap-6 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-slate-500 text-sm font-mono">{incident.incidentId}</span>
            <span className={cn('text-xs px-2 py-0.5 rounded-full border', severityColor(incident.severity))}>
              {incident.severity}
            </span>
            <span className={cn('text-xs px-2 py-0.5 rounded-full border', statusColor(incident.status))}>
              {incident.status}
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white leading-tight">{incident.title}</h1>
          <div className="flex items-center gap-4 mt-2 text-slate-400 text-sm">
            <span className="flex items-center gap-1.5"><Cpu size={13} />{incident.service}</span>
            <span className="flex items-center gap-1.5 capitalize"><GitBranch size={13} />{incident.category}</span>
            <span className="flex items-center gap-1.5"><Clock size={13} />{formatDate(incident.createdAt)}</span>
            {incident.occurrenceCount > 1 && (
              <span className="text-yellow-400">{incident.occurrenceCount}× occurrences</span>
            )}
          </div>
        </div>

        {/* Status actions */}
        {transitions.length > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {transitions.map(s => (
              <button
                key={s}
                onClick={() => s === 'resolved' ? setShowResolveModal(true) : handleStatusChange(s)}
                disabled={updating}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-50 capitalize',
                  s === 'resolved'
                    ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-500/20'
                    : s === 'investigating'
                    ? 'bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 border border-yellow-500/20'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600'
                )}
              >
                Mark {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: AI Analysis + Resolution + Logs */}
        <div className="lg:col-span-2 space-y-6">

          {/* AI Analysis */}
          <div className="bg-[#111118] border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-300 text-sm font-medium">
                <Lightbulb size={15} className="text-indigo-400" />
                AI Analysis
              </div>
              {incident.analysis && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 text-xs">Confidence</span>
                  <span className={cn('text-sm font-semibold font-mono', confidenceColor(incident.analysis.confidence))}>
                    {(incident.analysis.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>

            {!incident.analysis ? (
              <div className="p-5 flex items-center gap-2 text-slate-500 text-sm">
                <Loader size={14} className="animate-spin" />
                Analysis in progress…
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Root Cause</div>
                  <p className="text-slate-200 text-sm leading-relaxed">{incident.analysis.rootCause}</p>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Suggested Fix</div>
                  <div className="text-slate-200 text-sm leading-relaxed whitespace-pre-line">
                    {incident.analysis.suggestedFix}
                  </div>
                </div>
                <div className="text-xs text-slate-600 pt-2 border-t border-slate-800">
                  Generated {timeAgo(incident.analysis.generatedAt)} · {incident.embeddingModel}
                </div>
              </div>
            )}
          </div>

          {/* Agent investigation findings */}
          {incident.investigation && (
            <InvestigationCard investigation={incident.investigation} />
          )}

          {/* Log chat */}
          {activeProject && (
            <LogChat incidentId={incident._id} apiKey={activeProject.apiKey} />
          )}

          {/* Resolution panel — shown when resolved */}
          {incident.status === 'resolved' && activeProject && (
            <ResolutionPanel
              incident={incident}
              apiKey={activeProject.apiKey}
              onUpdate={setIncident}
            />
          )}

          {/* Logs */}
          <div className="bg-[#111118] border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="text-slate-300 text-sm font-medium">
                Logs <span className="text-slate-600 font-normal ml-1">({incident.logs.length} lines)</span>
              </div>
            </div>
            <div className="p-4 overflow-x-auto">
              <pre className="text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap break-words">
                {incident.logs.join('\n')}
              </pre>
            </div>
          </div>
        </div>

        {/* Right: Similar incidents + meta */}
        <div className="space-y-6">

          {/* Similar incidents */}
          <div className="bg-[#111118] border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 text-slate-300 text-sm font-medium">
              Similar Past Incidents
            </div>
            {incident.similarIncidents.length === 0 ? (
              <div className="px-4 py-6 text-slate-600 text-xs text-center">
                No similar incidents found
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {incident.similarIncidents.map(sim => (
                  <div key={sim.incidentId} className="px-4 py-3 hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-slate-300 text-xs font-medium truncate">{sim.title}</div>
                        <div className="text-slate-600 text-xs mt-0.5 font-mono">{sim.incidentId}</div>
                      </div>
                      <span className={cn(
                        'text-xs font-mono flex-shrink-0 font-semibold',
                        sim.similarity >= 0.8 ? 'text-green-400' :
                        sim.similarity >= 0.5 ? 'text-yellow-400' : 'text-slate-500'
                      )}>
                        {(sim.similarity * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Confirmed fix commits summary (read-only, visible on resolved incidents) */}
          {incident.status === 'resolved' &&
            incident.resolution?.confirmedShas &&
            incident.resolution.confirmedShas.length > 0 && (
            <div className="bg-[#111118] border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2 text-slate-300 text-sm font-medium">
                <GitCommit size={13} className="text-green-400" />
                Fix Commits
              </div>
              <div className="p-3 space-y-2">
                {incident.resolution.commits
                  .filter((c) => incident.resolution!.confirmedShas.includes(c.sha))
                  .map((c) => (
                    <CommitCard key={c.sha} commit={c} checked readonly />
                  ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="bg-[#111118] border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-slate-300 text-sm font-medium mb-1">Details</div>
            {[
              { label: 'Source', value: incident.source },
              { label: 'Category', value: incident.category },
              { label: 'Occurrences', value: incident.occurrenceCount },
              { label: 'Created', value: formatDate(incident.createdAt) },
              { label: 'Updated', value: timeAgo(incident.updatedAt) },
              ...(incident.resolvedAt ? [{ label: 'Resolved', value: formatDate(incident.resolvedAt) }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-4 text-xs">
                <span className="text-slate-500">{label}</span>
                <span className="text-slate-300 capitalize text-right">{String(value)}</span>
              </div>
            ))}
          </div>

          {/* Knowledge base link */}
          <Link
            to={`/knowledge?q=${encodeURIComponent(incident.title)}`}
            className="flex items-center justify-between w-full bg-[#111118] border border-slate-800 hover:border-indigo-500/40 rounded-xl p-4 transition-colors group"
          >
            <span className="text-slate-400 text-sm group-hover:text-slate-200 transition-colors">
              Search Knowledge Base
            </span>
            <ExternalLink size={14} className="text-slate-600 group-hover:text-indigo-400 transition-colors" />
          </Link>
        </div>
      </div>
    </div>
  )
}
