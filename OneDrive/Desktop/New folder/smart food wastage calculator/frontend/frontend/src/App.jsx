import { lazy, Suspense, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'
import { Loading } from './components/States'

const About = lazy(() => import('./pages/About'))
const Alerts = lazy(() => import('./pages/Alerts'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const LogEntry = lazy(() => import('./pages/LogEntry'))
const Recommendations = lazy(() => import('./pages/Recommendations'))
const Reports = lazy(() => import('./pages/Reports'))
const Sustainability = lazy(() => import('./pages/Sustainability'))

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-main">
        <Navbar onMenu={() => setSidebarOpen(true)} />
        <main className="main-content">
          <Suspense fallback={<Loading label="Opening FoodWise" />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/log-entry" element={<LogEntry />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/recommendations" element={<Recommendations />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/sustainability" element={<Sustainability />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
