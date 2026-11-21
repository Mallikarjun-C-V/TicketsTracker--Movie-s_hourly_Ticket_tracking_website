import { useMemo } from 'react';
import { Activity, BarChart3, Clock3, Info, TrendingDown, TrendingUp } from 'lucide-react';
import { buildHourlyBuckets, buildIntervalChanges, sortSnapshotsOldestFirst } from './analytics.js';

const numberFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat('en-IN');

function formatHour(value, timezone) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone || 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(new Date(value));
}

function formatDate(value, timezone) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone || 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value));
}

function formatDateTime(value, timezone) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone || 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(new Date(value));
}

function formatElapsed(minutes) {
  if (minutes < 1) return `${Math.round(minutes * 60)} sec`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function signedNumber(value) {
  const prefix = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${prefix}${integerFormat.format(Math.abs(value))}`;
}

function HourlyLineChart({ buckets, timezone }) {
  const width = 960;
  const height = 290;
  const margin = { top: 22, right: 22, bottom: 57, left: 78 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = buckets.map((bucket) => bucket.average).filter((value) => value !== null);
  if (!values.length) return <div className="analysis-chart-empty"><BarChart3 size={23} /><strong>No numeric observations to plot</strong><span>Hours without a valid reading are retained as gaps, not plotted as zero sales.</span></div>;

  const maxValue = Math.max(1, ...values);
  const rawChartMax = maxValue * 1.1;
  const tickStep = 10 ** Math.floor(Math.log10(rawChartMax / 4));
  const chartMax = Math.ceil(rawChartMax / tickStep) * tickStep;
  const yFor = (value) => margin.top + plotHeight - (value / chartMax) * plotHeight;
  const xFor = (index) => buckets.length <= 1
    ? margin.left + plotWidth / 2
    : margin.left + (index / (buckets.length - 1)) * plotWidth;

  const segments = [];
  let currentSegment = [];
  buckets.forEach((bucket, index) => {
    if (bucket.average === null) {
      if (currentSegment.length) segments.push(currentSegment);
      currentSegment = [];
      return;
    }
    currentSegment.push({ x: xFor(index), y: yFor(bucket.average), bucket, index });
  });
  if (currentSegment.length) segments.push(currentSegment);

  const yTicks = Array.from({ length: 5 }, (_, index) => (chartMax / 4) * index);
  const labelIndexes = new Set();
  const labelCount = Math.min(7, buckets.length);
  if (labelCount === 1) labelIndexes.add(0);
  else {
    for (let index = 0; index < labelCount; index += 1) {
      labelIndexes.add(Math.round((index / (labelCount - 1)) * (buckets.length - 1)));
    }
  }

  return (
    <div className="hourly-chart-wrap">
      <svg className="hourly-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Average rolling one-hour ticket count by clock hour">
        <text x="18" y="17" className="chart-axis-title">AVG. TICKETS IN ROLLING 60-MIN WINDOW</text>
        {yTicks.map((tick, index) => {
          const y = yFor(tick);
          return (
            <g key={index}>
              <line x1={margin.left} x2={width - margin.right} y1={y} y2={y} className="chart-grid-line" />
              <text x={margin.left - 12} y={y + 4} textAnchor="end" className="chart-axis-label">{integerFormat.format(Math.round(tick))}</text>
            </g>
          );
        })}
        {segments.map((segment, index) => (
          <polyline
            key={index}
            points={segment.map((point) => `${point.x},${point.y}`).join(' ')}
            className="chart-line"
            fill="none"
          />
        ))}
        {segments.flat().map((point) => (
          <g key={point.bucket.start}>
            <circle cx={point.x} cy={point.y} r="4" className="chart-point">
              <title>{`${formatDate(point.bucket.start, timezone)} ${formatHour(point.bucket.start, timezone)} · average ${numberFormat.format(point.bucket.average)} · ${point.bucket.validCount} reading(s)`}</title>
            </circle>
          </g>
        ))}
        {[...labelIndexes].sort((a, b) => a - b).map((index) => {
          const bucket = buckets[index];
          return (
            <g key={bucket.start}>
              <text x={xFor(index)} y={height - 31} textAnchor="middle" className="chart-axis-label">{formatDate(bucket.start, timezone)}</text>
              <text x={xFor(index)} y={height - 15} textAnchor="middle" className="chart-axis-label chart-axis-hour">{formatHour(bucket.start, timezone)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SummaryCard({ label, value, caption, icon: Icon }) {
  return (
    <div className="analysis-summary-card">
      <span className="analysis-summary-icon"><Icon size={16} /></span>
      <div><span>{label}</span><strong>{value}</strong><small>{caption}</small></div>
    </div>
  );
}

export default function HourlyAnalysis({ tracker, snapshots }) {
  const timezone = tracker?.timezone || 'Asia/Kolkata';
  const pollingInterval = tracker?.pollingIntervalMinutes || 10;
  const rangeStart = tracker?.startedAt || null;
  const scheduledEnd = tracker?.endsAt ? new Date(tracker.endsAt).getTime() : Date.now();
  const recordedEnd = tracker?.completedAt ? new Date(tracker.completedAt).getTime() : null;
  const rangeEnd = tracker ? new Date(Math.min(Date.now(), recordedEnd || scheduledEnd)) : null;
  const buckets = useMemo(
    () => buildHourlyBuckets(snapshots, timezone, pollingInterval, rangeStart, rangeEnd),
    [snapshots, timezone, pollingInterval, rangeStart, rangeEnd]
  );
  const intervalChanges = useMemo(
    () => buildIntervalChanges(snapshots, pollingInterval),
    [snapshots, pollingInterval]
  );
  const allValidReadings = useMemo(() => sortSnapshotsOldestFirst(snapshots).filter((snapshot) =>
    snapshot.ticketsSold !== null && snapshot.ticketsSold !== undefined && Number.isFinite(Number(snapshot.ticketsSold))
  ), [snapshots]);

  const totalHours = buckets.length;
  const hoursWithData = buckets.filter((bucket) => bucket.validCount > 0).length;
  const noDataHours = totalHours - hoursWithData;
  const readingAverage = allValidReadings.length
    ? allValidReadings.reduce((sum, snapshot) => sum + Number(snapshot.ticketsSold), 0) / allValidReadings.length
    : null;
  const newestBucket = buckets[buckets.length - 1];
  const oldestBucket = buckets[0];

  return (
    <section className="panel hourly-analysis-panel" id="hourly-analysis">
      <div className="panel-heading analysis-heading">
        <div><div className="eyebrow">TRENDS & CALCULATIONS <span className="eyebrow-line" /></div><h2>Hourly ticket analysis</h2><p>Hourly averages, observed interval changes and missing-data visibility.</p></div>
        {tracker && <span className="analysis-timezone"><Clock3 size={13} /> {timezone}</span>}
      </div>

      {!tracker ? (
        <div className="analysis-empty"><BarChart3 size={24} /><strong>Select or create a tracker</strong><span>Hourly averages and interval calculations will appear here when observations are available.</span></div>
      ) : snapshots.length === 0 ? (
        <div className="analysis-empty"><Activity size={24} /><strong>No observations to analyse yet</strong><span>Once the tracker records a successful reading, this page will calculate hourly averages and changes.</span></div>
      ) : (
        <>
          <div className="analysis-summary-grid">
            <SummaryCard label="Average observed count" value={readingAverage === null ? '—' : numberFormat.format(readingAverage)} caption="Mean of numeric readings" icon={Activity} />
            <SummaryCard label="Hours with readings" value={integerFormat.format(hoursWithData)} caption={`${integerFormat.format(totalHours)} clock-hours in range`} icon={Clock3} />
            <SummaryCard label="Hours with no data" value={integerFormat.format(noDataHours)} caption="Not verified as zero sales" icon={Info} />
          </div>

          <div className="analysis-subheading"><div><h3>Average by clock-hour</h3><p>Each hour uses only the numeric readings actually recorded inside that local clock-hour.</p></div><span className="analysis-expected">Expected: {Math.max(1, Math.round(60 / pollingInterval))} readings/hour</span></div>
          <HourlyLineChart buckets={buckets} timezone={timezone} />

          <div className="analysis-note"><Info size={15} /><span><b>How the average is calculated:</b> add the available ticket-count readings in that clock-hour and divide by the number of valid readings. For example, 2 available readings are divided by 2, not 6. An hour with no numeric reading is shown as <b>0 — no data</b> in the table, but as a chart gap. This avoids claiming that no tickets were sold while the laptop was off.</span></div>
          <div className="analysis-note secondary"><Info size={15} /><span>The source count is for the previous rolling 60 minutes. This table averages those rolling counts by observation hour; it is not a verified total of tickets sold during that clock-hour.</span></div>

          <div className="analysis-table-heading"><h3>Hourly breakdown</h3><span>{oldestBucket ? `${formatDate(oldestBucket.start, timezone)} — ${formatDate(newestBucket.start, timezone)}` : ''}</span></div>
          <div className="table-scroll analysis-table-scroll hourly-table-scroll">
            <table className="analysis-table">
              <thead><tr><th>DATE</th><th>HOUR</th><th>AVERAGE TICKETS (ROLLING 60 MIN)</th><th>VALID READINGS</th><th>EXPECTED</th><th>COVERAGE</th></tr></thead>
              <tbody>
                {[...buckets].reverse().map((bucket) => (
                  <tr key={bucket.start} className={bucket.validCount ? '' : 'no-data-row'}>
                    <td>{formatDate(bucket.start, timezone)}</td>
                    <td>{formatHour(bucket.start, timezone)} – {formatHour(bucket.start + 60 * 60 * 1000, timezone)}</td>
                    <td><strong>{bucket.average === null ? '0 — no data' : numberFormat.format(bucket.average)}</strong></td>
                    <td>{bucket.validCount}</td>
                    <td>{bucket.expectedReadings}</td>
                    <td>{bucket.validCount ? `${Math.round(bucket.coverage)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="analysis-divider" />
          <div className="analysis-subheading interval-heading"><div><h3>Change between consecutive observations</h3><p>Current reading minus the previous numeric reading. Rows are newest first.</p></div><span className="analysis-expected">Configured interval: {pollingInterval} min</span></div>
          <div className="analysis-note"><Info size={15} /><span><b>Important:</b> because each source value is a rolling 60-minute count, subtraction gives the net change in that rolling count. It cannot isolate exact tickets sold within the configured polling interval (10 minutes by default). When observations are missing, the full elapsed gap is shown and no missing interval values are invented.</span></div>
          {intervalChanges.length ? (
            <div className="table-scroll analysis-table-scroll interval-table-scroll">
              <table className="analysis-table interval-table">
                <thead><tr><th>PREVIOUS OBSERVATION</th><th>CURRENT OBSERVATION</th><th>ELAPSED</th><th>PREVIOUS COUNT</th><th>CURRENT COUNT</th><th>NET CHANGE</th><th>INTERVAL STATUS</th></tr></thead>
                <tbody>
                  {intervalChanges.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.from, timezone)}</td>
                      <td>{formatDateTime(item.to, timezone)}</td>
                      <td>{formatElapsed(item.elapsedMinutes)}</td>
                      <td>{integerFormat.format(item.fromCount)}</td>
                      <td>{integerFormat.format(item.toCount)}</td>
                      <td><span className={`delta-value ${item.delta > 0 ? 'positive' : item.delta < 0 ? 'negative' : 'neutral'}`}>{item.delta > 0 ? <TrendingUp size={13} /> : item.delta < 0 ? <TrendingDown size={13} /> : null}{signedNumber(item.delta)}</span></td>
                      <td><span className={`interval-status ${item.intervalType}`}>{item.intervalType === 'normal' ? 'Near scheduled interval' : item.intervalType === 'gap' ? `Data gap · no ${pollingInterval}-min estimate` : 'Short interval'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="analysis-empty compact"><strong>At least two numeric observations are required</strong><span>Once another reading is collected, the net change will be calculated here.</span></div>
          )}
        </>
      )}
    </section>
  );
}
