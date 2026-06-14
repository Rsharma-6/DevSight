import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import { useProject } from '@/lib/projectContext'
import { getIncidents } from '@/lib/api'
import { timeAgo, severityColor, statusColor, cn } from '@/lib/utils'

interface Incident {
  _id: string
  incidentId: string
  title: string
  service: string
  severity: string
  status: string
  category: string
  occurrenceCount: number
  createdAt: string
  analysis?: { confidence: number }
}

const SEVERITIES = ['', 'critical', 'high', 'medium', 'low']
const STATUSES = ['', 'open', 'investigating', 'resolved']

export default function Incidents() {
  const { activeProject } = useProject()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ severity: '', status: '', service: '' })
  const limit = 20

  useEffect(() => {
    if (!activeProject) return
    setLoading(true)
    const params: Record<string, string> = { limit: String(limit), page: String(page) }
    if (filters.severity) params.severity = filters.severity
    if (filters.status) params.status = filters.status
    if (filters.service) params.service = filters.service

    getIncidents(activeProject.apiKey, params)
      .then(data => {
        setIncidents(data.incidents)
        setTotal(data.total)
      })
      .finally(() => setLoading(false))
  }, [activeProject, page, filters])

  if (!activeProject) {
    return (
      <div className="p-8 text-slate-400 text-sm">
        Select a project from the <Link to="/projects" className="text-indigo-400 hover:underline">Projects</Link> page first.
      </div>
    )
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Incidents</h1>
          <p className="text-slate-400 text-sm mt-1">{total} total incidents</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2 text-slate-500">
          <Filter size={14} />
          <span className="text-xs">Filter</span>
        </div>
        <select
          value={filters.severity}
          onChange={e => { setFilters({ ...filters, severity: e.target.value }); setPage(1) }}
          className="bg-[#111118] border border-slate-700 text-slate-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
        >
          {SEVERITIES.map(s => <option key={s} value={s}>{s || 'All severities'}</option>)}
        </select>
        <select
          value={filters.status}
          onChange={e => { setFilters({ ...filters, status: e.target.value }); setPage(1) }}
          className="bg-[#111118] border border-slate-700 text-slate-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
        >
          {STATUSES.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
        <input
          value={filters.service}
          onChange={e => { setFilters({ ...filters, service: e.target.value }); setPage(1) }}
          placeholder="Filter by service…"
          className="bg-[#111118] border border-slate-700 text-slate-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 placeholder-slate-600 w-44"
        />
      </div>

      {/* Table */}
      <div className="bg-[#111118] border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm">Loading…</div>
        ) : incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <AlertTriangle size={36} className="text-slate-700 mb-3" />
            <p className="text-slate-400 font-medium">No incidents found</p>
            <p className="text-slate-600 text-sm mt-1">Try adjusting filters or ingest some incidents</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium">Incident</th>
                <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium">Service</th>
                <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium">Category</th>
                <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium">Severity</th>
                <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium">Status</th>
                <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium">Confidence</th>
                <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc, i) => (
                <tr
                  key={inc._id}
                  className={cn('hover:bg-slate-800/30 transition-colors', i < incidents.length - 1 && 'border-b border-slate-800/50')}
                >
                  <td className="px-4 py-3">
                    <Link to={`/incidents/${inc._id}`} className="text-slate-200 hover:text-indigo-400 transition-colors font-medium block">
                      {inc.title}
                    </Link>
                    <div className="text-slate-600 text-xs mt-0.5">{inc.incidentId}{inc.occurrenceCount > 1 && ` · ${inc.occurrenceCount}x`}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{inc.service}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs capitalize">{inc.category}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border', severityColor(inc.severity))}>
                      {inc.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border', statusColor(inc.status))}>
                      {inc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {inc.analysis ? (
                      <span className={cn(
                        'text-xs font-mono',
                        inc.analysis.confidence >= 0.8 ? 'text-green-400' :
                        inc.analysis.confidence >= 0.5 ? 'text-yellow-400' : 'text-red-400'
                      )}>
                        {(inc.analysis.confidence * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-slate-700 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    <div className="flex items-center gap-1">
                      <Clock size={11} />
                      {timeAgo(inc.createdAt)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-slate-500 text-xs">
            Page {page} of {totalPages} · {total} incidents
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
