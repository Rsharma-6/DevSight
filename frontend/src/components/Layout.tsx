import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, AlertTriangle, BookOpen, FolderOpen, Zap } from 'lucide-react'
import { useProject } from '@/lib/projectContext'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/incidents', icon: AlertTriangle, label: 'Incidents' },
  { to: '/knowledge', icon: BookOpen, label: 'Knowledge Base' },
  { to: '/projects', icon: FolderOpen, label: 'Projects' },
]

export default function Layout() {
  const { activeProject } = useProject()

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-slate-200 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-[#0e0e16] border-r border-slate-800 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="font-semibold text-white text-sm tracking-wide">DevSight</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-400 font-medium'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Active project indicator */}
        <div className="px-4 py-4 border-t border-slate-800">
          {activeProject ? (
            <div className="text-xs">
              <div className="text-slate-500 mb-1">Active project</div>
              <div className="text-slate-300 font-medium truncate">{activeProject.name}</div>
              <div className="text-slate-600 font-mono text-[10px] truncate mt-0.5">
                {activeProject.apiKey.slice(0, 16)}…
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-600">No project selected</div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
