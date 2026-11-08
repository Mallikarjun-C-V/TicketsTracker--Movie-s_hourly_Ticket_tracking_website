import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowUpRight, Clock3, Link2, Plus, SlidersHorizontal } from 'lucide-react';

const TIMEZONES = [
  'Asia/Kolkata', 'UTC', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles'
];

export default function TrackerForm({ onCreate, busy, minInterval = 10, provider = 'mock', defaultTimezone = 'Asia/Kolkata' }) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [intervalValue, setIntervalValue] = useState('10');
  const [intervalUnit, setIntervalUnit] = useState('minutes');
  const [durationValue, setDurationValue] = useState('5');
  const [durationUnit, setDurationUnit] = useState('hours');
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [maximumChecks, setMaximumChecks] = useState('20');
  const [timezone, setTimezone] = useState(defaultTimezone);
  useEffect(() => setTimezone(defaultTimezone), [defaultTimezone]);
  const [clockAligned, setClockAligned] = useState(false);
  const [localError, setLocalError] = useState('');

  const intervalMinutes = useMemo(() => Number(intervalValue) * (intervalUnit === 'hours' ? 60 : 1), [intervalValue, intervalUnit]);
  const durationMinutes = useMemo(() => Number(durationValue) * (durationUnit === 'hours' ? 60 : 1), [durationValue, durationUnit]);
  const intervalTooShort = Number.isFinite(intervalMinutes) && intervalMinutes > 0 && intervalMinutes < minInterval;

  const submit = async (event) => {
    event.preventDefault();
    setLocalError('');
    if (!url.trim()) return setLocalError('Add the complete BookMyShow movie URL to continue.');
    if (!Number.isFinite(intervalMinutes) || intervalMinutes < minInterval) return setLocalError(`The minimum allowed refresh interval is ${minInterval} minutes.`);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) return setLocalError('Enter a valid tracking duration.');
    if (limitEnabled && (!Number.isInteger(Number(maximumChecks)) || Number(maximumChecks) < 1)) return setLocalError('Maximum checks must be a positive whole number.');

    try {
      await onCreate({
        bookMyShowUrl: url.trim(),
        movieLabel: label.trim(),
        pollingIntervalMinutes: intervalMinutes,
        durationMinutes,
        maximumChecks: limitEnabled ? Number(maximumChecks) : null,
        timezone,
        clockAligned
      });
      setUrl('');
      setLabel('');
    } catch (error) {
      setLocalError(error.message);
    }
  };

  return (
    <section className="panel tracker-form-panel" id="trackers">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">NEW SESSION <span className="eyebrow-line" /></div>
          <h2>Start a tracker</h2>
          <p>Set the page and collection schedule.</p>
        </div>
        <div className="heading-icon"><Plus size={19} /></div>
      </div>

      {provider === 'manual' && <div className="info-strip"><AlertCircle size={15} /> Manual provider is active. You will add observations yourself.</div>}
      {provider === 'mock' && <div className="info-strip mock-info"><span className="mock-mini-dot" /> Demo provider is active. Sample readings will be clearly marked.</div>}

      <form onSubmit={submit} className="tracker-form">
        <div className="field-group">
          <label htmlFor="movie-url">BookMyShow movie URL <span className="required">*</span></label>
          <div className="input-with-icon">
            <Link2 size={16} />
            <input id="movie-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste the complete movie page URL" autoComplete="url" />
          </div>
          <span className="field-hint">Only approved BookMyShow domains are accepted.</span>
        </div>

        <div className="field-group">
          <label htmlFor="movie-label">Movie name / label <span className="optional">OPTIONAL</span></label>
          <input id="movie-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Friday evening show" maxLength={120} />
        </div>

        <div className="form-divider" />
        <div className="form-section-label"><SlidersHorizontal size={14} /> COLLECTION SETTINGS</div>

        <div className="two-fields">
          <div className="field-group">
            <label htmlFor="interval-value">Refresh every</label>
            <div className="joined-control">
              <input id="interval-value" type="number" min="1" step="1" value={intervalValue} onChange={(e) => setIntervalValue(e.target.value)} />
              <select value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value)} aria-label="Refresh interval unit">
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </div>
          </div>
          <div className="field-group">
            <label htmlFor="duration-value">Track for</label>
            <div className="joined-control">
              <input id="duration-value" type="number" min="1" step="1" value={durationValue} onChange={(e) => setDurationValue(e.target.value)} />
              <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value)} aria-label="Tracking duration unit">
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </div>
          </div>
        </div>
        {intervalTooShort && <div className="inline-warning"><AlertCircle size={14} /> Minimum interval is {minInterval} minutes.</div>}

        <div className="field-group timezone-field">
          <label htmlFor="timezone">Display timezone</label>
          <select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {[...new Set([defaultTimezone, ...TIMEZONES])].map((zone) => <option key={zone} value={zone}>{zone.replace('_', ' ')}</option>)}
          </select>
        </div>

        <div className="optional-settings">
          <label className="check-row">
            <input type="checkbox" checked={limitEnabled} onChange={(e) => setLimitEnabled(e.target.checked)} />
            <span className="custom-check" />
            <span>Stop after a maximum number of checks</span>
          </label>
          {limitEnabled && <div className="limit-input"><input type="number" min="1" max="10000" value={maximumChecks} onChange={(e) => setMaximumChecks(e.target.value)} /><span>attempts</span></div>}
          <label className="check-row">
            <input type="checkbox" checked={clockAligned} onChange={(e) => setClockAligned(e.target.checked)} />
            <span className="custom-check" />
            <span>Align later checks to clock boundaries</span>
            <span className="small-info" title="The first collection still starts immediately.">i</span>
          </label>
        </div>

        {localError && <div className="form-error"><AlertCircle size={15} /> {localError}</div>}
        <button className="primary-button start-button" type="submit" disabled={busy || intervalTooShort}>
          {busy ? <span className="button-spinner" /> : <><span>Start tracking</span><ArrowUpRight size={17} /></>}
        </button>
        <div className="form-footnote"><Clock3 size={13} /> First collection is queued as soon as you start.</div>
      </form>
    </section>
  );
}
