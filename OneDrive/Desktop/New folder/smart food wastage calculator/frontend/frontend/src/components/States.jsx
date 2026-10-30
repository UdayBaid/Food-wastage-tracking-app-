import { AlertCircle, LoaderCircle, Sprout } from 'lucide-react'

export function Loading({ label = 'Loading data' }) {
  return <div className="state-box"><LoaderCircle className="spin" size={24} /><span>{label}</span></div>
}

export function ErrorState({ message, onRetry }) {
  return <div className="state-box state-error"><AlertCircle size={21} /><span>{message}</span>{onRetry && <button className="text-button" onClick={onRetry}>Retry</button>}</div>
}

export function EmptyState({ title = 'Nothing here yet', message = 'Records will appear once data is available.' }) {
  return <div className="empty-state"><span><Sprout size={22} /></span><strong>{title}</strong><p>{message}</p></div>
}