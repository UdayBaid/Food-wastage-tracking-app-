import { NavLink } from 'react-router-dom'
import {
  Bell, BookOpen, ChartNoAxesCombined, House, Leaf, NotebookPen, Sparkles, Sprout, X,
} from 'lucide-react'

const links = [
  { to: '/', label: 'Dashboard', icon: House, end: true },
  { to: '/log-entry', label: 'Log entry', icon: NotebookPen },
  { to: '/reports', label: 'Reports', icon: ChartNoAxesCombined },
  { to: '/recommendations', label: 'Recommendations', icon: Sparkles },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/sustainability', label: 'Sustainability', icon: Leaf },
  { to: '/about', label: 'About FoodWise', icon: BookOpen },
]

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Sprout size={24} strokeWidth={2.1} /></div>
          <div><strong>FoodWise</strong><span>WASTE TRACKER</span></div>
          <button className="icon-button sidebar-close" onClick={onClose} aria-label="Close navigation"><X size={19} /></button>
        </div>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={onClose} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {label === 'Alerts' && <span className="nav-dot" aria-label="Rule-based alerts available" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note-icon"><Leaf size={17} /></div>
          <p>Small changes in the kitchen make a lasting difference.</p>
          <span>TRACK · LEARN · IMPROVE</span>
        </div>
      </aside>
    </>
  )
}