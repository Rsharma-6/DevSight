import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, BookOpen, Loader, Clock, Cpu } from 'lucide-react'
import { useProject } from '@/lib/projectContext'
import { semanticSearch, getIncidents } from '@/lib/api'
import { timeAgo, severityColor, statusColor, cn } from '@/lib/utils'

interface Incident {
  _id: string
  incidentId: string
  title: string
  service: string
  severity: string
  status: string
  category: string
  logs: string[]
  analysis?: { rootCause: string; suggestedFix: string; confidence: number }
  createdAt: string
  similarity?: number
}

export default function KnowledgeBase() {
  const { activeProject } = useProject()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [results, setResults] = useState<Incident[]>([])
  const [resolved, setResolved] = useState<Incident[]>([])
  const [searching, setSearching] = useState(false)
  const [loadingResolved, setLoadingResolved] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (!activeProject) return
    // Load resolved incidents as knowledge base entries
    setLoadingResolved(true)
    getIncidents(activeProject.apiKey, { status: 'resolved', limit: '50' })
      .then(data => setResolved(data.incidents))
      .finally(() => setLoadingResolved(false))
  }, [activeProject])

  useEffect(() => {
    const q = searchParams.get('q')
    if (q && activeProject) {
      setQuery(q)
      runSearch(q)
    }
  }, [activeProject])

  async function runSearch(q: string) {
    if (!activeProject || !q.trim()) return
    setSearching(true)
    setSearched(true)
    try {
      const data = await semanticSearch(activeProject.apiKey, q.trim())
      setResults(data)
      setSearchParams({ q: q.trim() })
    } finally {
      setSearching(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    runSearch(query)
  }

  if (!activeProject) {
    return (
      <div className="p-8 text-slate-400 text-sm">
        Select a project first. <Link to="/projects" className="text-indigo-400 hover:underline">Go to Projects</Link>
      </div>
    )
  }

  const displayList = searched ? results : resolved

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Knowledge Base</h1>
        <p className="text-slate-400 text-sm mt-1">
          Search past incidents using plain English — powered by semantic similarity
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. Redis connection refused, docker container crash, JWT auth failing…"
              className="w-full bg-[#111118] border border-slate-700 focus:border-indigo-500 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-xl transition-colors flex items-center gap-2"
          >
            {searching ? <Loader size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </button>
        </div>
        {searched && !searching && (
          <button
            type="button"
            onClick={() => { setSearched(false); setResults([]); setQuery(''); setSearchParams({}) }}
            className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Back to all resolved incidents
          </button>
        )}
      </form>

      {/* Results header */}
      <div className="flex items-center gap-2 mb-4">
        <BookOpen size={15} className="text-slate-500" />
        <span className="text-slate-400 text-sm">
          {searched
            ? searching
              ? 'Searching…'
              : `${results.length} result${results.length !== 1 ? 's' : ''} for "${searchParams.get('q')}"`
            : loadingResolved
            ? 'Loading…'
            : `${resolved.length} resolved incidents in knowledge base`
          }
        </span>
      </div>

      {/* List */}
      {(searching || loadingResolved) ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-8">
          <Loader size={14} className="animate-spin" />
          {searching ? 'Running semantic search…' : 'Loading knowledge base…'}
        </div>
      ) : displayList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen size={36} className="text-slate-700 mb-3" />
          <p className="text-slate-400 font-medium">
            {searched ? 'No similar incidents found' : 'No resolved incidents yet'}
          </p>
          <p className="text-slate-600 text-sm mt-1">
            {searched
              ? 'Try different search terms or seed the knowledge base'
              : 'Resolved incidents will appear here as your knowledge base grows'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayList.map((inc) => (
            <Link
              key={inc._id}
              to={`/incidents/${inc._id}`}
              className="block bg-[#111118] border border-slate-800 hover:border-slate-600 rounded-xl p-5 transition-colors group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-white font-medium group-hover:text-indigo-300 transition-colors">
                      {inc.title}
                    </span>
                    <span className="text-slate-600 font-mono text-xs">{inc.incidentId}</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border', severityColor(inc.severity))}>
                      {inc.severity}
                    </span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border', statusColor(inc.status))}>
                      {inc.status}
                    </span>
                  </div>

                  {inc.analysis?.rootCause && (
                    <p className="text-slate-400 text-sm mt-1 line-clamp-2">{inc.analysis.rootCause}</p>
                  )}

                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Cpu size={11} />{inc.service}</span>
                    <span className="capitalize">{inc.category}</span>
                    <span className="flex items-center gap-1"><Clock size={11} />{timeAgo(inc.createdAt)}</span>
                  </div>
                </div>

                {inc.similarity !== undefined && (
                  <div className="flex-shrink-0 text-right">
                    <div className="text-xs text-slate-500 mb-0.5">Similarity</div>
                    <div className={cn(
                      'text-sm font-semibold font-mono',
                      inc.similarity >= 0.8 ? 'text-green-400' :
                      inc.similarity >= 0.5 ? 'text-yellow-400' : 'text-slate-500'
                    )}>
                      {(inc.similarity * 100).toFixed(1)}%
                    </div>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
