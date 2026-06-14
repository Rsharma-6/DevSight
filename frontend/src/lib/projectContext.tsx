import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface Project {
  _id: string
  name: string
  description?: string
  apiKey: string
  githubRepo?: string
  createdAt: string
}

interface ProjectContextType {
  projects: Project[]
  activeProject: Project | null
  setActiveProject: (p: Project | null) => void
  setProjects: (p: Project[]) => void
}

const ProjectContext = createContext<ProjectContextType | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProject, setActiveProjectState] = useState<Project | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('devsight_active_project')
    if (saved) {
      try { setActiveProjectState(JSON.parse(saved)) } catch { /* ignore */ }
    }
  }, [])

  function setActiveProject(p: Project | null) {
    setActiveProjectState(p)
    if (p) localStorage.setItem('devsight_active_project', JSON.stringify(p))
    else localStorage.removeItem('devsight_active_project')
  }

  return (
    <ProjectContext.Provider value={{ projects, activeProject, setActiveProject, setProjects }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used within ProjectProvider')
  return ctx
}

export type { Project }
