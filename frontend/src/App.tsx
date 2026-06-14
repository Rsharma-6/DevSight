import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProjectProvider } from '@/lib/projectContext'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Projects from '@/pages/Projects'
import Incidents from '@/pages/Incidents'
import IncidentDetail from '@/pages/IncidentDetail'
import KnowledgeBase from '@/pages/KnowledgeBase'

export default function App() {
  return (
    <ProjectProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/incidents/:id" element={<IncidentDetail />} />
            <Route path="/knowledge" element={<KnowledgeBase />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ProjectProvider>
  )
}
