export default function StatCard({ label, value, unit, icon: Icon, tone = 'terracotta', note }) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={18} strokeWidth={1.8} /></span></div>
      <div className="stat-value">{value}<small>{unit}</small></div>
      <div className="stat-note">{note}</div>
    </article>
  )
}