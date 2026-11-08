import { ArrowUpRight, CalendarDays, CircleCheck, Clock3, Film } from 'lucide-react';

function formatDate(value, timezone) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: timezone || 'Asia/Kolkata', dateStyle: 'medium' }).format(new Date(value));
}

export default function History({ trackers, selectedId, onSelect }) {
  return (
    <section className="panel history-panel" id="history">
      <div className="panel-heading history-heading">
        <div><div className="eyebrow">YOUR WORKSPACE <span className="eyebrow-line" /></div><h2>Session history</h2><p>Reopen any previous tracking timeline.</p></div>
        <span className="history-total">{trackers.length} sessions</span>
      </div>
      {trackers.length ? (
        <div className="history-list">
          {trackers.map((tracker) => (
            <button className={`history-item ${selectedId === tracker._id ? 'selected' : ''}`} key={tracker._id} onClick={() => onSelect(tracker._id)}>
              <div className="history-movie-icon"><Film size={17} /></div>
              <div className="history-main"><strong>{tracker.movieLabel || 'Untitled movie tracker'}</strong><span><CalendarDays size={12} /> {formatDate(tracker.startedAt, tracker.timezone)} <i /> <Clock3 size={12} /> {tracker.pollingIntervalMinutes >= 60 ? `${tracker.pollingIntervalMinutes / 60}h interval` : `${tracker.pollingIntervalMinutes}m interval`}</span></div>
              <div className="history-count"><strong>{tracker.successfulChecks}</strong><span>observations</span></div>
              <span className={`history-status ${tracker.status.toLowerCase()}`}>{tracker.status === 'COMPLETED' ? <CircleCheck size={13} /> : <i />}{tracker.status.toLowerCase()}</span>
              <ArrowUpRight className="history-arrow" size={16} />
            </button>
          ))}
        </div>
      ) : (
        <div className="history-empty"><span className="history-empty-icon"><CalendarDays size={19} /></span><strong>No sessions saved yet</strong><span>Completed sessions will stay here so you can revisit their observations.</span></div>
      )}
    </section>
  );
}
