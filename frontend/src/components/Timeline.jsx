import { Activity, ArrowDownToLine, Clock3, Info } from 'lucide-react';

function formatTime(value, timezone) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: timezone || 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(value));
}

function formatObserved(value, timezone) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: timezone || 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(value));
}

export default function Timeline({ tracker, snapshots, onExport }) {
  return (
    <section className="panel timeline-panel" id="timeline">
      <div className="panel-heading timeline-heading">
        <div><div className="eyebrow">OBSERVATION LOG <span className="eyebrow-line" /></div><h2>Ticket timeline</h2><p>Every row is a separate snapshot of the previous 60 minutes.</p></div>
        <button className="outline-button" onClick={onExport} disabled={!tracker || snapshots.length === 0}><ArrowDownToLine size={15} /> Export CSV</button>
      </div>

      {tracker && <div className="timeline-context"><div className="context-dot" /><span>Showing <b>{tracker.movieLabel || 'Untitled tracker'}</b></span><span className="context-divider" /><span>{tracker.timezone}</span><span className="context-spacer" /><span className="observation-count">{snapshots.length} observations</span></div>}

      {snapshots.length > 0 ? (
        <div className="table-scroll">
          <table className="observation-table">
            <thead><tr><th>NO.</th><th>ESTIMATED ONE-HOUR PERIOD</th><th>TICKETS SOLD</th><th>OBSERVATION TIME</th></tr></thead>
            <tbody>
              {snapshots.map((snapshot, index) => (
                <tr key={snapshot._id}>
                  <td><span className="row-number">{String(index + 1).padStart(2, '0')}</span></td>
                  <td><div className="period-cell"><Clock3 size={14} /><span>{formatTime(snapshot.windowStart, tracker?.timezone)} <i>—</i> {formatTime(snapshot.windowEnd, tracker?.timezone)}</span></div></td>
                  <td><div className="count-cell"><strong>{snapshot.ticketsSold == null ? 'Needs review' : new Intl.NumberFormat('en-IN').format(snapshot.ticketsSold)}</strong><span className={`precision ${String(snapshot.precision || 'REVIEW').toLowerCase()}`}>{snapshot.precision === 'APPROXIMATE' ? '≈' : snapshot.precision === 'REVIEW' || !snapshot.precision ? 'Review' : 'Exact'}</span>{snapshot.sourceProvider === 'MOCK' && <span className="sample-chip">SAMPLE</span>}</div></td>
                  <td><span className="observed-cell">{formatObserved(snapshot.observedAt, tracker?.timezone)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="timeline-empty">
          <div className="timeline-empty-icon"><Activity size={22} /></div>
          <strong>{tracker ? 'No observations yet' : 'Your timeline starts here'}</strong>
          <span>{tracker ? 'The first reading will appear after the backend completes a collection attempt.' : 'Start a tracker to build a chronological record of rolling one-hour ticket counts.'}</span>
          <div className="timeline-empty-note"><Info size={13} /> Failed attempts are recorded separately and never shown as zero-ticket observations.</div>
        </div>
      )}
      {snapshots.length > 0 && <div className="timeline-footer"><span><Info size={13} /> Each count covers an estimated rolling 60-minute window, not lifetime sales.</span><span>Newest observations appear at the bottom.</span></div>}
    </section>
  );
}
