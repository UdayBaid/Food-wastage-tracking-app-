import { Bell, Download, Menu, RefreshCw } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import api from '../services/api'

const titles = {
  '/': 'Dashboard',
  '/log-entry': 'Log a food record',
  '/reports': 'Reports & analytics',
  '/recommendations': 'AI recommendations',
  '/alerts': 'Waste alerts',
  '/sustainability': 'Sustainability',
  '/about': 'About FoodWise',
}

export default function Navbar({ onMenu }) {
  const { pathname } = useLocation()
  const [online, setOnline] = useState(navigator.onLine)
  const [backend, setBackend] = useState('checking')
  const [installPrompt, setInstallPrompt] = useState(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [serviceNotice, setServiceNotice] = useState('')

  useEffect(() => { document.title = `${titles[pathname] || 'FoodWise'} | FoodWise` }, [pathname])

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    const handleInstallAvailable = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }
    const handleUpdateReady = () => setUpdateReady(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('beforeinstallprompt', handleInstallAvailable)
    window.addEventListener('foodwise:update-ready', handleUpdateReady)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeinstallprompt', handleInstallAvailable)
      window.removeEventListener('foodwise:update-ready', handleUpdateReady)
    }
  }, [])

  useEffect(() => {
    let active = true
    const checkBackend = async () => {
      try {
        const { data } = await api.get('/health/local')
        if (!active) return
        setServiceNotice('')
        if (data.database_available === false) setBackend('database-unavailable')
        else if (data.prediction_model_loaded === false || data.optimization_model_available === false) setBackend('model-unavailable')
        else setBackend('ready')
      } catch {
        if (active) {
          setBackend('unavailable')
          setServiceNotice('Local FoodWise backend is unavailable. Cached pages remain accessible; start the local API to use records, reports and AI.')
        }
      }
    }
    checkBackend()
    const interval = window.setInterval(checkBackend, 20000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  const installApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    setInstallPrompt(null)
  }

  const applyUpdate = () => window.dispatchEvent(new Event('foodwise:apply-update'))
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-button menu-button" onClick={onMenu} aria-label="Open navigation"><Menu size={21} /></button>
        <div className="breadcrumbs"><span>FoodWise</span><i>/</i><strong>{titles[pathname] || 'FoodWise'}</strong></div>
      </div>
      <div className="topbar-right">
        <span className={`service-status ${online ? '' : 'service-offline'}`} title="Browser network status; this is separate from the local FoodWise backend"><span />{online ? 'Network online' : 'Network offline'}</span>
        <span className={`service-status ${backend === 'ready' ? '' : 'service-offline'}`} title="Local FastAPI, SQLite and prediction model status"><span />{backend === 'ready' ? 'Local AI ready' : backend === 'database-unavailable' ? 'Database unavailable' : backend === 'model-unavailable' ? 'Model unavailable' : backend === 'unavailable' ? 'Local backend unavailable' : 'Checking local service'}</span>
        {installPrompt && <button className="icon-button pwa-action" onClick={installApp} aria-label="Install FoodWise" title="Install FoodWise"><Download size={17} /></button>}
        {updateReady && <button className="icon-button pwa-action" onClick={applyUpdate} aria-label="Apply FoodWise update" title="Apply FoodWise update"><RefreshCw size={17} /></button>}
        <Link className="icon-button topbar-bell" to="/alerts" aria-label="View alerts"><Bell size={19} /></Link>
        <div className="user-chip"><span className="avatar">FW</span><span>Kitchen team</span></div>
      </div>
      {serviceNotice && <div className="service-notice" role="status">{serviceNotice}<button type="button" onClick={() => api.get('/health/local').then(({ data }) => { setBackend(data.status === 'ok' ? 'ready' : 'database-unavailable'); setServiceNotice('') }).catch(() => setServiceNotice('The local API is still unavailable. Start FastAPI and retry.'))}>Retry</button></div>}
    </header>
  )
}