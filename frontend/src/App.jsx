import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, ArrowUpRight, Check, CircleHelp, RefreshCw, ShieldCheck, Timer, Ticket, X } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import StatCard from './components/StatCard.jsx';
import TrackerForm from './components/TrackerForm.jsx';
import ActiveTracker from './components/ActiveTracker.jsx';
import Timeline from './components/Timeline.jsx';
import History from './components/History.jsx';
import {
  addManualObservation,
  createTracker,
  downloadCsv,
  getAttempts,
  getHealth,
  getSnapshots,
  getTrackers,
  trackerAction
} from './services/api.js';

function Notice({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className={`notice-banner ${notice.type}`} role="status">
      {notice.type === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}
      <span>{notice.message}</span>
      <button onClick={onClose} aria-label="Dismiss notification"><X size={15} /></button>
    </div>
  );
}

function formatToday() {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date());
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [trackers, setTrackers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [snapshots, setSnapshots] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const refreshDashboard = useCallback(async (showError = false) => {
    try {
      const [healthData, trackerData] = await Promise.all([getHealth(), getTrackers()]);
      setHealth(healthData);
      setTrackers(trackerData);
      setConnected(true);
      setSelectedId((current) => {
        if (current && trackerData.some((item) => item._id === current)) return current;
        const preferred = trackerData.find((item) => ['RUNNING', 'PAUSED'].includes(item.status)) || trackerData[0];
        return preferred?._id || '';
      });
      return true;
    } catch (error) {
      setConnected(false);
      if (showError) setNotice({ type: 'error', message: error.message });
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDashboard(true);
    const interval = window.setInterval(() => refreshDashboard(false), 5000);
    return () => window.clearInterval(interval);
  }, [refreshDashboard]);

  useEffect(() => {
    let active = true;
    if (!selectedId) {
      setSnapshots([]);
      setAttempts([]);
      return undefined;
    }
    const loadObservationData = async () => {
      try {
        const [snapshotData, attemptData] = await Promise.all([getSnapshots(selectedId), getAttempts(selectedId)]);
        if (active) {
          setSnapshots(snapshotData);
          setAttempts(attemptData);
        }
      } catch (error) {
        if (active) setNotice({ type: 'error', message: error.message });
      }
    };
    loadObservationData();
    const interval = window.setInterval(loadObservationData, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [selectedId]);

  const selectedTracker = useMemo(() => trackers.find((item) => item._id === selectedId) || null, [trackers, selectedId]);
  const totalObservations = trackers.reduce((sum, item) => sum + (item.successfulChecks || 0), 0);
  const activeTrackers = trackers.filter((item) => item.status === 'RUNNING').length;
  const failedChecks = trackers.reduce((sum, item) => sum + Math.max(0, (item.attemptedChecks || 0) - (item.successfulChecks || 0)), 0);
  const provider = health?.provider || 'mock';

  const handleCreate = async (payload) => {
    if (!connected) throw new Error('The backend is not connected. Start the backend and try again.');
    setBusy(true);
    try {
      const created = await createTracker(payload);
      setSelectedId(created._id);
      await refreshDashboard(false);
      setNotice({ type: 'success', message: 'Tracking session created. Its first collection is queued immediately.' });
    } finally {
      setBusy(false);
    }
  };

  const handleAction = async (action) => {
    if (!selectedTracker) return;
    setBusy(true);
    try {
      await trackerAction(selectedTracker._id, action);
      await refreshDashboard(false);
      setNotice({ type: 'success', message: action === 'pause' ? 'Tracking paused.' : action === 'resume' ? 'Tracking resumed.' : 'Tracking stopped.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setBusy(false);
    }
  };

  const handleManualObservation = async (payload) => {
    if (!selectedTracker) return;
    setBusy(true);
    try {
      await addManualObservation(selectedTracker._id, payload);
      await refreshDashboard(false);
      setSnapshots(await getSnapshots(selectedTracker._id));
      setAttempts(await getAttempts(selectedTracker._id));
      setNotice({ type: 'success', message: 'Manual observation added to the timeline.' });
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    if (!selectedTracker) return;
    try {
      await downloadCsv(selectedTracker._id);
      setNotice({ type: 'success', message: 'CSV export is ready.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    }
  };

  return (
    <div className="app-shell" id="overview">
      <Sidebar provider={provider} connected={connected} />
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><i>/</i><b>Overview</b></div>
          <div className="topbar-right">
            <span className="today-label">{formatToday()}</span>
            <span className={`secure-label ${connected ? '' : 'offline'}`}><ShieldCheck size={14} /> {connected ? 'Local & secure' : 'API disconnected'}</span>
            <button className="refresh-button" title="Refresh dashboard" onClick={() => refreshDashboard(true)}><RefreshCw size={16} /></button>
          </div>
        </header>

        <div className="content-wrap">
          <Notice notice={notice} onClose={() => setNotice(null)} />

          <section className="welcome-row">
            <div>
              <div className="welcome-kicker"><span className="kicker-mark" /> MOVIE TICKET MONITORING</div>
              <h1>Keep an eye on <em>ticket momentum.</em></h1>
              <p>Collect rolling one-hour ticket observations and build a clear history over time.</p>
            </div>
            <div className="welcome-aside">
              <div className="welcome-aside-icon"><Activity size={18} /></div>
              <div><strong>One hour at a time</strong><span>Every snapshot is its own rolling window.</span></div>
            </div>
          </section>

          <section className="stats-grid" aria-label="Workspace statistics">
            <StatCard label="Active trackers" value={activeTrackers} caption="Currently collecting" icon={Activity} tone="orange" />
            <StatCard label="Observations saved" value={totalObservations.toLocaleString('en-IN')} caption="Successful readings" icon={Ticket} tone="green" />
            <StatCard label="Failed attempts" value={failedChecks.toLocaleString('en-IN')} caption="Logged separately" icon={Timer} tone="slate" />
          </section>

          {!connected && <div className="connection-alert"><AlertCircle size={17} /><div><strong>Could not reach the backend</strong><span>Start the Express server at http://localhost:5000. Your tracker data remains in MongoDB.</span></div><button onClick={() => refreshDashboard(true)}>Retry <ArrowUpRight size={14} /></button></div>}

          <section className="dashboard-grid">
            <TrackerForm onCreate={handleCreate} busy={busy || !connected} minInterval={health?.minimumPollingIntervalMinutes || 10} provider={provider} defaultTimezone={health?.defaultTimezone || 'Asia/Kolkata'} />
            <ActiveTracker
              tracker={selectedTracker}
              snapshots={snapshots}
              attempts={attempts}
              onAction={handleAction}
              onManual={handleManualObservation}
              onExport={handleExport}
              busy={busy}
            />
          </section>

          <Timeline tracker={selectedTracker} snapshots={snapshots} onExport={handleExport} />
          <History trackers={trackers} selectedId={selectedId} onSelect={setSelectedId} />

          <footer className="page-footer"><span>TicketsTracker <b>•</b> Focused ticket-count monitoring</span><span><CircleHelp size={13} /> Rolling observations are not cumulative sales totals.</span></footer>
          {loading && <div className="initial-loader"><span className="loader-dot" /> Connecting to your workspace…</div>}
        </div>
      </main>
    </div>
  );
}
