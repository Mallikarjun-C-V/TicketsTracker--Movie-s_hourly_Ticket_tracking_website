import { Activity, Clock3, Film, LayoutDashboard, Settings2 } from 'lucide-react';

const links = [
  { label: 'Overview', icon: LayoutDashboard, target: 'overview', active: true },
  { label: 'Trackers', icon: Film, target: 'trackers' },
  { label: 'Observations', icon: Activity, target: 'timeline' },
  { label: 'Session history', icon: Clock3, target: 'history' }
];

export default function Sidebar({ provider, connected }) {
  const scrollTo = (target) => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark"><span>t</span><i /></div>
        <div className="brand-copy">
          <strong>Tickets<span>Tracker</span></strong>
          <small>SALES MONITOR</small>
        </div>
      </div>

      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        {links.map(({ label, icon: Icon, target, active }) => (
          <button key={target} className={`nav-link ${active ? 'active' : ''}`} onClick={() => scrollTo(target)}>
            <Icon size={17} strokeWidth={1.9} />
            <span>{label}</span>
            {target === 'timeline' && <span className="nav-dot" />}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-rule" />
        <div className="connection-card">
          <div className="connection-topline">
            <span className={`connection-dot ${connected ? 'online' : ''}`} />
            <span>{connected ? 'Backend connected' : 'Backend offline'}</span>
          </div>
          <div className="connection-sub">Provider: <b>{provider || 'checking…'}</b></div>
        </div>
        <div className="sidebar-foot"><Settings2 size={14} /> <span>Local workspace</span><span className="version-tag">v 1.0.0</span></div>
      </div>
    </aside>
  );
}
