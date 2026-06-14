import { useEffect, useState } from 'react'
import { Plus, Copy, RefreshCw, Trash2, Check, FolderOpen, Globe } from 'lucide-react'
import { getProjects, createProject, regenerateKey, deleteProject } from '@/lib/api'
import { useProject, type Project } from '@/lib/projectContext'
import { cn, timeAgo } from '@/lib/utils'

export default function Projects() {
  const { projects, setProjects, activeProject, setActiveProject } = useProject()
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', githubRepo: '' })
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    fetchProjects()
  }, [])

  async function fetchProjects() {
    setLoading(true)
    try {
      const data = await getProjects()
      setProjects(data)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setCreating(true)
    try {
      const project = await createProject(form)
      setProjects([project, ...projects])
      setShowCreate(false)
      setForm({ name: '', description: '', githubRepo: '' })
    } finally {
      setCreating(false)
    }
  }

  async function handleRegenerateKey(projectId: string) {
    if (!confirm('Regenerate API key? The old key will stop working immediately.')) return
    const { apiKey } = await regenerateKey(projectId)
    const updated = projects.map(p => p._id === projectId ? { ...p, apiKey } : p)
    setProjects(updated)
    if (activeProject?._id === projectId) setActiveProject({ ...activeProject, apiKey })
  }

  async function handleDelete(projectId: string) {
    if (!confirm('Delete this project and all its incidents?')) return
    await deleteProject(projectId)
    setProjects(projects.filter(p => p._id !== projectId))
    if (activeProject?._id === projectId) setActiveProject(null)
  }

  function copyKey(apiKey: string) {
    navigator.clipboard.writeText(apiKey)
    setCopied(apiKey)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Projects</h1>
          <p className="text-slate-400 text-sm mt-1">Each project has its own API key and isolated knowledge base</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={15} />
          New Project
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 bg-[#111118] border border-slate-800 rounded-xl p-6">
          <h2 className="text-white font-medium mb-4">Create Project</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Project name *</label>
              <input
                autoFocus
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. CodeRome 2.0"
                className="w-full bg-[#1a1a24] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Description</label>
              <input
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="What does this project do?"
                className="w-full bg-[#1a1a24] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">GitHub Repo (optional)</label>
              <input
                value={form.githubRepo}
                onChange={e => setForm({ ...form, githubRepo: e.target.value })}
                placeholder="owner/repo"
                className="w-full bg-[#1a1a24] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={creating || !form.name.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
              >
                {creating ? 'Creating…' : 'Create Project'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Project list */}
      {loading ? (
        <div className="text-slate-500 text-sm">Loading projects…</div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen size={40} className="text-slate-700 mb-4" />
          <p className="text-slate-400 font-medium">No projects yet</p>
          <p className="text-slate-600 text-sm mt-1">Create a project to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project: Project) => (
            <div
              key={project._id}
              className={cn(
                'bg-[#111118] border rounded-xl p-5 transition-colors',
                activeProject?._id === project._id
                  ? 'border-indigo-500/50'
                  : 'border-slate-800 hover:border-slate-700'
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-white font-medium">{project.name}</h3>
                    {activeProject?._id === project._id && (
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  {project.description && (
                    <p className="text-slate-400 text-sm mt-1">{project.description}</p>
                  )}
                  {project.githubRepo && (
                    <div className="flex items-center gap-1.5 mt-2 text-slate-500 text-xs">
                      <Globe size={12} />
                      {project.githubRepo}
                    </div>
                  )}
                  <div className="text-slate-600 text-xs mt-2">Created {timeAgo(project.createdAt)}</div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setActiveProject(activeProject?._id === project._id ? null : project)}
                    className={cn(
                      'px-3 py-1.5 text-xs rounded-lg transition-colors',
                      activeProject?._id === project._id
                        ? 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    )}
                  >
                    {activeProject?._id === project._id ? 'Deselect' : 'Select'}
                  </button>
                  <button
                    onClick={() => handleRegenerateKey(project._id)}
                    title="Regenerate API key"
                    className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(project._id)}
                    title="Delete project"
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* API Key */}
              <div className="mt-4 flex items-center gap-2 bg-[#0e0e16] border border-slate-800 rounded-lg px-3 py-2">
                <code className="text-xs text-slate-400 font-mono flex-1 truncate">{project.apiKey}</code>
                <button
                  onClick={() => copyKey(project.apiKey)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
                >
                  {copied === project.apiKey ? (
                    <><Check size={12} className="text-green-400" /><span className="text-green-400">Copied</span></>
                  ) : (
                    <><Copy size={12} /><span>Copy</span></>
                  )}
                </button>
              </div>

              {/* Webhook instructions */}
              <div className="mt-3 text-xs text-slate-600">
                Webhook URL:{' '}
                <code className="text-slate-500 font-mono">
                  {window.location.origin}/api/webhooks/github?apiKey={project.apiKey.slice(0, 8)}…
                </code>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
