import { useState } from 'react';
import { Activity, Clock3, Download, ExternalLink, Pause, Play, Square, Ticket, TriangleAlert } from 'lucide-react';

function dateTime(value, timezone) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: timezone || 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function StatusPill({ status }) {
  const labels = { RUNNING: 'Running', PAUSED: 'Paused', STOPPED: 'Stopped', COMPLETED: 'Completed', ERROR: 'Error' };
  return <span className={`status-pill ${String(status || '').toLowerCase()}`}><i />{labels[status] || status}</span>;
}

function ManualReading({ onSubmit, busy }) {
  const [count, setCount] = useState('');
  const [precision, setPrecision] = useState('EXACT');
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!/^\d+$/.test(count) || !Number.isSafeInteger(Number(count))) return setError('Enter a whole-number ticket count.');
    try {
      await onSubmit({ ticketsSold: Number(count), precision, rawDisplayedText: rawText.trim() || undefined });
      setCount('');
      setRawText('');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="manual-entry" onSubmit={submit}>
      <div className="manual-entry-head"><div><strong>Add a manual observation</strong><span>Use the displayed previous-one-hour count.</span></div><span className="manual-tag">MANUAL</span></div>
      <div className="manual-entry-fields">
        <input aria-label="Ticket count" type="number" min="0" step="1" value={count} onChange={(e) => setCount(e.target.value)} placeholder="Ticket count" />
        <select aria-label="Count precision" value={precision} onChange={(e) => setPrecision(e.target.value)}><option value="EXACT">Exact</option><option value="APPROXIMATE">Approximate</option></select>
        <button type="submit" className="secondary-button" disabled={busy}>{busy ? 'Saving…' : 'Add reading'}</button>
      </div>
      <input className="raw-input" value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Optional: paste the wording shown on the page" />
      {error && <div className="manual-error">{error}</div>}
    </form>
  );
}

export default function ActiveTracker({ tracker, snapshots, attempts, onAction, onManual, onExport, busy }) {
  const progress = tracker ? (() => {
    const start = new Date(tracker.startedAt).getTime();
    const end = new Date(tracker.endsAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
  })() : 0;

  if (!tracker) {
    return (
      <section className="panel active-panel empty-active">
        <div className="panel-heading">
          <div><div className="eyebrow">LIVE SESSION <span className="eyebrow-line" /></div><h2>Tracking at a glance</h2><p>Your current session will appear here.</p></div>
          <div className="heading-icon muted-icon"><Activity size={18} /></div>
        </div>
        <div className="empty-session-art"><div className="empty-ring ring-one" /><div className="empty-ring ring-two" /><div className="empty-center"><Ticket size={26} /></div><span className="empty-node node-a" /><span className="empty-node node-b" /><span className="empty-node node-c" /></div>
        <div className="empty-session-copy"><strong>No tracker selected</strong><span>Create a tracking session to see its status, schedule and latest observations here.</span></div>
      </section>
    );
  }

  const failedAttempts = attempts.filter((attempt) => attempt.status === 'FAILED').length;
  const latest = snapshots[snapshots.length - 1];
  const canPause = tracker.status === 'RUNNING';
  const canResume = tracker.status === 'PAUSED';
  const canStop = ['RUNNING', 'PAUSED'].includes(tracker.status);

  return (
    <section className="panel active-panel">
      <div className="panel-heading active-heading">
        <div><div className="eyebrow">LIVE SESSION <span className="eyebrow-line" /></div><h2>Tracking at a glance</h2><p>Monitor the current collection run.</p></div>
        <StatusPill status={tracker.status} />
      </div>

      <div className="active-movie-row">
        <div className="movie-monogram"><Ticket size={21} /></div>
        <div className="movie-title-group"><strong>{tracker.movieLabel || 'Untitled movie tracker'}</strong><a href={tracker.bookMyShowUrl} target="_blank" rel="noreferrer">Open source page <ExternalLink size={12} /></a></div>
        <span className={`provider-chip ${tracker.providerMode}`}>{tracker.providerMode === 'live' ? 'LIVE' : String(tracker.providerMode || 'unknown').toUpperCase()}</span>
      </div>

      <div className="latest-reading">
        <div className="latest-reading-label"><span>Latest observed count</span><span className="reading-window">ROLLING 60 MIN</span></div>
        <div className="latest-number-row">
          <strong>{latest?.ticketsSold == null ? '—' : new Intl.NumberFormat('en-IN').format(latest.ticketsSold)}</strong>
          {latest && <span className={`precision ${String(latest.precision || 'REVIEW').toLowerCase()}`}>{latest.precision === 'APPROXIMATE' ? '≈ Approx.' : latest.precision === 'REVIEW' || !latest.precision ? 'Review' : 'Exact'}</span>}
        </div>
        <div className="latest-caption">{latest ? `Observed ${dateTime(latest.observedAt, tracker.timezone)}` : 'Waiting for the first successful observation'}</div>
      </div>

      <div className="progress-section">
        <div className="progress-labels"><span>Tracking duration</span><b>{Math.round(progress)}%</b></div>
        <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        <div className="progress-dates"><span>{dateTime(tracker.startedAt, tracker.timezone)}</span><span>{dateTime(tracker.endsAt, tracker.timezone)}</span></div>
      </div>

      <div className="session-metrics">
        <div><span>Successful</span><strong>{tracker.successfulChecks}</strong></div>
        <div><span>Failed</span><strong className={failedAttempts ? 'value-warning' : ''}>{failedAttempts}</strong></div>
        <div><span>Refresh</span><strong>{tracker.pollingIntervalMinutes >= 60 ? `${tracker.pollingIntervalMinutes / 60}h` : `${tracker.pollingIntervalMinutes}m`}</strong></div>
      </div>

      <div className="schedule-row"><div className="schedule-icon"><Clock3 size={15} /></div><div><span>Next collection</span><strong>{tracker.providerMode === 'manual' ? 'Manual entry' : (tracker.nextPollAt ? dateTime(tracker.nextPollAt, tracker.timezone) : 'Not scheduled')}</strong></div></div>

      {tracker.providerMode === 'manual' && ['RUNNING', 'PAUSED'].includes(tracker.status) && <ManualReading onSubmit={onManual} busy={busy} />}
      {tracker.status === 'PAUSED' && <div className="paused-note"><TriangleAlert size={14} /> This tracker is paused. Resume it to continue scheduled collection.</div>}

      <div className="active-actions">
        {canPause && <button className="secondary-button" onClick={() => onAction('pause')} disabled={busy}><Pause size={14} /> Pause</button>}
        {canResume && <button className="secondary-button resume-button" onClick={() => onAction('resume')} disabled={busy}><Play size={14} /> Resume</button>}
        {canStop && <button className="quiet-button stop-button" onClick={() => onAction('stop')} disabled={busy}><Square size={13} /> Stop</button>}
        <button className="quiet-button export-button" onClick={onExport} disabled={busy}><Download size={14} /> CSV</button>
      </div>
    </section>
  );
}
