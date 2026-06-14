import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle, Clock, Activity, TrendingDown, Zap } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useProject } from '@/lib/projectContext'
import { getStats, getIncidents } from '@/lib/api'
import { timeAgo, severityColor, statusColor, cn } from '@/lib/utils'

interface Stats {
  total: number
  open: number
  resolved: number
  investigating: number
  mttr: number
  bySeverity: Record<string, number>
  byCategory: Record<string, number>
}

interface Incident {
  _id: string
  incidentId: string
  title: string
  service: string
  severity: string
  status: string
  category: string
  createdAt: string
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
}

const CATEGORY_COLORS: Record<string, string> = {
  database: '#6366f1',
  'ci-cd': '#8b5cf6',
  queue: '#06b6d4',
  docker: '#3b82f6',
  realtime: '#10b981',
  api: '#f59e0b',
  unknown: '#6b7280',
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-[#111118] border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-400 text-sm">{label}</span>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color)}>
          <Icon size={15} />
        </div>
      </div>
      <div className="text-2xl font-semibold text-white">{value}</div>
    </div>
  )
}

export default function Dashboard() {
  const { activeProject } = useProject()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<Incident[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!activeProject) return
    setLoading(true)
    Promise.all([
      getStats(activeProject.apiKey),
      getIncidents(activeProject.apiKey, { limit: '8' }),
    ]).then(([s, i]) => {
      setStats(s)
      setRecent(i.incidents)
    }).finally(() => setLoading(false))
  }, [activeProject])

  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4">
          <Zap size={28} className="text-indigo-400" />
        </div>
        <h2 className="text-white text-xl font-semibold mb-2">Welcome to DevSight</h2>
        <p className="text-slate-400 text-sm max-w-sm mb-6">
          AI-powered incident intelligence. Select a project to view your dashboard, or create one to get started.
        </p>
        <Link
          to="/projects"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
        >
          Go to Projects
        </Link>
      </div>
    )
  }

  if (loading || !stats) {
    return (
      <div className="p-8">
        <div className="text-slate-500 text-sm">Loading dashboard…</div>
      </div>
    )
  }

  const severityData = Object.entries(stats.bySeverity).map(([name, count]) => ({ name, count }))
  const categoryData = Object.entries(stats.byCategory).map(([name, count]) => ({ name, count }))

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">{activeProject.name}</h1>
        <p className="text-slate-400 text-sm mt-1">Incident intelligence dashboard</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Incidents" value={stats.total} icon={Activity} color="bg-indigo-500/15 text-indigo-400" />
        <StatCard label="Open" value={stats.open} icon={AlertTriangle} color="bg-red-500/15 text-red-400" />
        <StatCard label="Resolved" value={stats.resolved} icon={CheckCircle} color="bg-green-500/15 text-green-400" />
        <StatCard
          label="Avg MTTR"
          value={stats.mttr ? `${stats.mttr}m` : '—'}
          icon={TrendingDown}
          color="bg-yellow-500/15 text-yellow-400"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Severity */}
        <div className="bg-[#111118] border border-slate-800 rounded-xl p-5">
          <h3 className="text-slate-300 text-sm font-medium mb-4">Incidents by Severity</h3>
          {severityData.length === 0 ? (
            <div className="text-slate-600 text-sm py-8 text-center">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={severityData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {severityData.map((entry) => (
                    <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By Category */}
        <div className="bg-[#111118] border border-slate-800 rounded-xl p-5">
          <h3 className="text-slate-300 text-sm font-medium mb-4">Incidents by Category</h3>
          {categoryData.length === 0 ? (
            <div className="text-slate-600 text-sm py-8 text-center">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={categoryData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {categoryData.map((entry) => (
                    <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent incidents */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-300 text-sm font-medium">Recent Incidents</h3>
          <Link to="/incidents" className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors">
            View all →
          </Link>
        </div>
        <div className="bg-[#111118] border border-slate-800 rounded-xl overflow-hidden">
          {recent.length === 0 ? (
            <div className="py-12 text-center text-slate-600 text-sm">No incidents yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium">Incident</th>
                  <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium">Service</th>
                  <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium">Severity</th>
                  <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-slate-500 text-xs font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((inc, i) => (
                  <tr key={inc._id} className={cn('hover:bg-slate-800/30 transition-colors', i < recent.length - 1 && 'border-b border-slate-800/50')}>
                    <td className="px-4 py-3">
                      <Link to={`/incidents/${inc._id}`} className="text-slate-200 hover:text-indigo-400 transition-colors font-medium">
                        {inc.title}
                      </Link>
                      <div className="text-slate-600 text-xs mt-0.5">{inc.incidentId}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{inc.service}</td>
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
      </div>
    </div>
  )
}
