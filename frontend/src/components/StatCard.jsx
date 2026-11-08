export default function StatCard({ label, value, caption, icon: Icon, tone = 'orange' }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={18} strokeWidth={1.9} /></div>
      <div className="stat-content">
        <span className="stat-label">{label}</span>
        <div className="stat-value">{value}</div>
        <span className="stat-caption">{caption}</span>
      </div>
    </article>
  );
}
