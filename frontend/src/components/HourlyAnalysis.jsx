import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Clock3, Info, TrendingDown, TrendingUp, Download, Maximize2, Minimize2, Crosshair, Layers, CalendarDays } from 'lucide-react';
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

function formatCompactCount(value) {
  return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatChartAxisTime(value, timezone, includeDate = false) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone || 'Asia/Kolkata',
    ...(includeDate ? { day: '2-digit', month: 'short' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(new Date(value));
}

function getLocalClockKey(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone || 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.hour}:${values.minute}`;
}

const compareMarkerPalette = ['#ef6a3c', '#c77c55', '#d79b55', '#a66d54', '#e28b69', '#8f7768'];

function getContinuousSegments(buckets, values) {
  const segments = [];
  let current = [];
  buckets.forEach((bucket, index) => {
    const value = values[index];
    if (value === null || value === undefined || !Number.isFinite(value)) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push({ bucket, index, value });
  });
  if (current.length) segments.push(current);
  return segments;
}

function buildThreeHourAverage(buckets) {
  const run = [];
  return buckets.map((bucket) => {
    if (bucket.average === null) {
      run.length = 0;
      return null;
    }
    if (run.length && bucket.start - run[run.length - 1].start !== 60 * 60 * 1000) run.length = 0;
    run.push(bucket);
    if (run.length > 3) run.shift();
    return run.length === 3
      ? run.reduce((sum, item) => sum + item.average, 0) / 3
      : null;
  });
}

function downloadHourlyCSV(buckets, timezone) {
  const rows = [
    ['Date', 'Hour', 'Average rolling 60-minute count', 'Valid readings', 'Expected readings', 'Coverage %', 'Data status'],
    ...buckets.map((bucket) => [
      formatDate(bucket.start, timezone),
      `${formatHour(bucket.start, timezone)} - ${formatHour(bucket.start + 60 * 60 * 1000, timezone)}`,
      bucket.average === null ? '' : bucket.average.toFixed(2),
      bucket.validCount,
      bucket.expectedReadings,
      bucket.validCount ? bucket.coverage.toFixed(1) : '0',
      bucket.validCount ? 'Recorded' : 'No data'
    ])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ticket-hourly-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function HourlyLineChart({ buckets, timezone }) {
  const [chartType, setChartType] = useState('area');
  const [range, setRange] = useState('ALL');
  const [scale, setScale] = useState('auto');
  const [showAverage, setShowAverage] = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    if (!expanded) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [expanded]);

  const visibleBuckets = useMemo(() => {
    if (range === 'ALL' || !buckets.length) return buckets;
    const hours = Number(range) * 24;
    const latest = buckets[buckets.length - 1].start;
    const earliest = latest - (hours - 1) * 60 * 60 * 1000;
    return buckets.filter((bucket) => bucket.start >= earliest);
  }, [buckets, range]);

  const movingAverageByHour = useMemo(() => {
    const map = new Map();
    const values = buildThreeHourAverage(buckets);
    buckets.forEach((bucket, index) => map.set(bucket.start, values[index]));
    return visibleBuckets.map((bucket) => map.get(bucket.start) ?? null);
  }, [buckets, visibleBuckets]);

  const numericBuckets = visibleBuckets.filter((bucket) => bucket.average !== null);
  if (!numericBuckets.length) {
    return <div className="analysis-chart-empty"><BarChart3 size={23} /><strong>No numeric observations to plot</strong><span>Hours without a valid reading remain as visible data gaps, not zero-ticket readings.</span></div>;
  }

  const numericValues = numericBuckets.map((bucket) => bucket.average);
  const latest = numericBuckets[numericBuckets.length - 1];
  const first = numericBuckets[0];
  const highest = Math.max(...numericValues);
  const lowest = Math.min(...numericValues);
  const netChange = latest.average - first.average;
  const hasPositiveChange = netChange >= 0;
  const totalReadings = visibleBuckets.reduce((sum, bucket) => sum + bucket.validCount, 0);
  const expectedReadings = visibleBuckets.reduce((sum, bucket) => sum + bucket.expectedReadings, 0);
  const coveragePercent = expectedReadings ? Math.min(100, (totalReadings / expectedReadings) * 100) : 0;

  const svgWidth = 1280;
  const svgHeight = 520;
  const margin = { left: 92, right: 30, top: 42 };
  const plotBottom = 354;
  const plotTop = margin.top;
  const plotWidth = svgWidth - margin.left - margin.right;
  const plotHeight = plotBottom - plotTop;
  const coverageTop = 392;
  const coverageBottom = 447;
  const xFor = (index) => visibleBuckets.length <= 1
    ? margin.left + plotWidth / 2
    : margin.left + (index / (visibleBuckets.length - 1)) * plotWidth;

  const minValue = Math.min(...numericValues);
  const maxValue = Math.max(...numericValues);
  const spread = maxValue - minValue;
  const padding = Math.max(spread * 0.18, maxValue * 0.008, 8);
  const yMin = scale === 'zero' ? 0 : Math.max(0, minValue - padding);
  const yMax = Math.max(yMin + 1, maxValue + (scale === 'zero' ? Math.max(maxValue * 0.06, 10) : padding));
  const yFor = (value) => plotBottom - ((value - yMin) / (yMax - yMin)) * plotHeight;
  const chartValues = visibleBuckets.map((bucket) => bucket.average);
  const segments = getContinuousSegments(visibleBuckets, chartValues);
  const averageSegments = getContinuousSegments(visibleBuckets, movingAverageByHour);
  const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) * index) / 4);
  const xTickIndexes = new Set();
  const tickCount = Math.min(7, visibleBuckets.length);
  for (let i = 0; i < tickCount; i += 1) {
    xTickIndexes.add(tickCount === 1 ? 0 : Math.round((i / (tickCount - 1)) * (visibleBuckets.length - 1)));
  }
  const barWidth = Math.max(3, Math.min(24, (plotWidth / Math.max(1, visibleBuckets.length)) * 0.58));
  const selectedBucket = hoveredIndex === null ? null : visibleBuckets[hoveredIndex];
  const selectedX = hoveredIndex === null ? null : xFor(hoveredIndex);
  const selectedY = selectedBucket?.average === null || !selectedBucket ? null : yFor(selectedBucket.average);
  const tooltipLeft = selectedX === null ? 50 : Math.min(88, Math.max(8, (selectedX / svgWidth) * 100));
  const compareBuckets = compareMode && selectedBucket
    ? visibleBuckets
      .map((bucket, index) => ({ bucket, index }))
      .filter(({ bucket }) => getLocalClockKey(bucket.start, timezone) === getLocalClockKey(selectedBucket.start, timezone))
    : [];
  const compareClockLabel = selectedBucket ? formatHour(selectedBucket.start, timezone) : '';

  const handlePointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = ((event.clientX - rect.left) / rect.width) * svgWidth;
    if (localX < margin.left || localX > svgWidth - margin.right) return;
    const ratio = (localX - margin.left) / plotWidth;
    const index = Math.round(ratio * Math.max(0, visibleBuckets.length - 1));
    setHoveredIndex(Math.max(0, Math.min(visibleBuckets.length - 1, index)));
  };

  const renderSegmentPath = (segment, type) => {
    if (!segment.length) return '';
    const points = segment.map(({ index, value }) => ({ x: xFor(index), y: yFor(value) }));
    if (type === 'step') {
      return points.reduce((path, point, index) => {
        if (index === 0) return `M ${point.x} ${point.y}`;
        const previous = points[index - 1];
        return `${path} L ${point.x} ${previous.y} L ${point.x} ${point.y}`;
      }, '');
    }
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  };

  return (
    <div className={`market-chart-shell${expanded ? ' is-expanded' : ''}`}>
      <div className="market-chart-header">
        <div className="market-chart-brand">
          <span className="market-chart-brand-icon"><Activity size={18} /></span>
          <div>
            <div className="market-chart-kicker">TICKET FLOW <span className="market-chart-dot" /></div>
            <h3>Hourly rolling count</h3>
            <p>One-hour ticket count · {timezone}</p>
          </div>
        </div>
        <div className="market-chart-feed"><span className="market-feed-indicator" /> RECORDED OBSERVATIONS <span className="market-feed-divider">/</span> {visibleBuckets.length}H WINDOW</div>
      </div>

      <div className="market-chart-stats">
        <div className="market-stat market-stat-primary"><span>LATEST HOURLY AVG.</span><strong>{numberFormat.format(latest.average)}</strong><small>{formatDateTime(latest.start + 60 * 60 * 1000, timezone)}</small></div>
        <div className="market-stat"><span>PERIOD HIGH</span><strong>{numberFormat.format(highest)}</strong><small>Highest hourly average</small></div>
        <div className="market-stat"><span>PERIOD LOW</span><strong>{numberFormat.format(lowest)}</strong><small>Lowest hourly average</small></div>
        <div className="market-stat"><span>NET CHANGE</span><strong className={hasPositiveChange ? 'market-positive' : 'market-negative'}>{hasPositiveChange ? '+' : '−'}{integerFormat.format(Math.abs(netChange))}</strong><small>First → latest rolling count</small></div>
        <div className="market-stat"><span>DATA COVERAGE</span><strong>{coveragePercent.toFixed(1)}%</strong><small>{totalReadings.toLocaleString('en-IN')} / {expectedReadings.toLocaleString('en-IN')} expected</small></div>
      </div>

      <div className="market-chart-toolbar">
        <div className="market-toolbar-group market-range-group" aria-label="Chart date range">
          <span className="market-toolbar-label"><CalendarDays size={13} /> RANGE</span>
          {['1', '3', '7', 'ALL'].map((item) => (
            <button type="button" key={item} className={`market-tool-button${range === item ? ' active' : ''}`} onClick={() => { setRange(item); setHoveredIndex(null); }}>
              {item === 'ALL' ? 'ALL' : `${item}D`}
            </button>
          ))}
        </div>
        <div className="market-toolbar-group market-style-group" aria-label="Chart style">
          <span className="market-toolbar-label"><Layers size={13} /> STYLE</span>
          {[['area', 'Area'], ['line', 'Line'], ['bars', 'Bars'], ['step', 'Step']].map(([value, label]) => (
            <button type="button" key={value} className={`market-tool-button${chartType === value ? ' active' : ''}`} onClick={() => setChartType(value)}>{label}</button>
          ))}
        </div>
        <div className="market-toolbar-spacer" />
        <button type="button" className={`market-tool-button market-toggle-button${compareMode ? ' active' : ''}`} onClick={() => { setCompareMode((value) => !value); setHoveredIndex(null); }} title="Compare the same local clock-hour across all visible dates" aria-pressed={compareMode}>
          <Crosshair size={12} /> COMPARE
        </button>
        <button type="button" className={`market-tool-button market-toggle-button${showAverage ? ' active' : ''}`} onClick={() => setShowAverage((value) => !value)} title="Toggle 3-hour moving average">MA 3H</button>
        <button type="button" className={`market-tool-button market-toggle-button${showCoverage ? ' active' : ''}`} onClick={() => setShowCoverage((value) => !value)} title="Toggle observation coverage">Coverage</button>
        <button type="button" className="market-tool-button market-scale-button" onClick={() => setScale((value) => value === 'auto' ? 'zero' : 'auto')} title="Switch vertical scale">{scale === 'auto' ? 'Auto scale' : 'Zero scale'}</button>
        <button type="button" className="market-icon-button" onClick={() => downloadHourlyCSV(visibleBuckets, timezone)} title="Export visible data as CSV" aria-label="Export visible data as CSV"><Download size={15} /></button>
        <button type="button" className="market-icon-button" onClick={() => setExpanded((value) => !value)} title={expanded ? 'Collapse chart' : 'Expand chart'} aria-label={expanded ? 'Collapse chart' : 'Expand chart'}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
      </div>

      <div className="market-chart-legend">
        <span><i className="legend-mark legend-main" /> Hourly average</span>
        {showAverage && <span><i className="legend-mark legend-average" /> 3-hour moving average</span>}
        {showCoverage && <span><i className="legend-mark legend-coverage" /> Observation coverage</span>}
        {compareMode && <span><i className="legend-mark" style={{ background: compareMarkerPalette[0] }} /> Same clock time across visible dates</span>}
        <span className="market-chart-hint"><Crosshair size={12} /> {compareMode ? (selectedBucket ? `Comparing ${compareClockLabel} · ${compareBuckets.length} date(s)` : 'Hover a time to compare that clock-hour across dates') : 'Move pointer over chart for details'}</span>
      </div>

      <div className="market-chart-stage">
        {selectedBucket && (
          <div
            className={`market-hover-card${tooltipLeft > 68 ? ' to-left' : ''}`}
            style={{
              left: `${tooltipLeft}%`,
              ...(compareMode ? { maxHeight: 'min(360px, 58vh)', overflowY: 'auto', minWidth: '210px' } : {})
            }}
          >
            <div className="market-hover-date">{formatDate(selectedBucket.start, timezone)} · {formatHour(selectedBucket.start, timezone)}</div>
            {selectedBucket.average === null ? (
              <><strong className="market-hover-missing">NO READING</strong><span>This hour has no recorded observation.</span></>
            ) : (
              <><strong>{numberFormat.format(selectedBucket.average)}</strong><span>Average rolling 60-minute count</span><div className="market-hover-meta"><span>{selectedBucket.validCount} / {selectedBucket.expectedReadings} readings</span><b>{selectedBucket.coverage.toFixed(0)}% coverage</b></div></>
            )}
            {compareMode && (
              <div style={{ borderTop: '1px solid #f0e5df', marginTop: 7, paddingTop: 7 }}>
                <div style={{ color: '#8d766b', fontSize: 8, fontWeight: 900, letterSpacing: '.7px', marginBottom: 6 }}>SAME-TIME COMPARISON · {compareClockLabel}</div>
                {compareBuckets.map(({ bucket, index }) => {
                  const color = index === hoveredIndex
                    ? compareMarkerPalette[0]
                    : compareMarkerPalette[(compareBuckets.findIndex((item) => item.index === index) % (compareMarkerPalette.length - 1)) + 1];
                  return (
                    <div key={bucket.start} style={{ display: 'grid', gridTemplateColumns: '8px minmax(0, 1fr) auto', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid rgba(240,229,223,.65)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
                      <span style={{ color: '#77665e', fontSize: 9, whiteSpace: 'nowrap' }}>{formatDate(bucket.start, timezone)}{index === hoveredIndex ? ' · selected' : ''}</span>
                      <strong style={{ color: bucket.average === null ? '#a8753d' : '#a94d2c', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>
                        {bucket.average === null ? 'NO DATA' : numberFormat.format(bucket.average)}
                      </strong>
                    </div>
                  );
                })}
                {compareBuckets.length <= 1 && <span style={{ display: 'block', color: '#7d8a90', fontSize: 8, paddingTop: 4 }}>No other matching date in this selected range.</span>}
                <span style={{ display: 'block', color: '#8d766b', fontSize: 8, paddingTop: 6 }}>Values are hourly averages of recorded rolling 60-minute counts.</span>
              </div>
            )}
          </div>
        )}
        <svg
          className="market-chart-svg"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          role="img"
          aria-label="Interactive chart of hourly average rolling ticket counts with observation coverage and missing-data gaps"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id="market-area-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#35c8bd" stopOpacity="0.30" />
              <stop offset="72%" stopColor="#168f91" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#168f91" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="market-bar-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#4ad2c4" stopOpacity="0.92" />
              <stop offset="100%" stopColor="#168f91" stopOpacity="0.34" />
            </linearGradient>
          </defs>

          <text x="22" y="24" className="market-svg-label">ROLLING 60-MIN COUNT</text>
          <text x={svgWidth - 24} y="24" textAnchor="end" className="market-svg-label">{scale === 'auto' ? 'AUTO SCALE' : 'ZERO BASELINE'}</text>

          {yTicks.map((tick, index) => {
            const y = yFor(tick);
            return <g key={`ytick-${index}`}>
              <line x1={margin.left} x2={svgWidth - margin.right} y1={y} y2={y} className="market-grid-line" />
              <text x={margin.left - 14} y={y + 4} textAnchor="end" className="market-axis-value">{formatCompactCount(tick)}</text>
            </g>;
          })}
          {[...xTickIndexes].sort((a, b) => a - b).map((index) => (
            <line key={`xgrid-${index}`} x1={xFor(index)} x2={xFor(index)} y1={plotTop} y2={plotBottom} className="market-grid-line vertical" />
          ))}

          {visibleBuckets.map((bucket, index) => bucket.average === null ? (
            <rect key={`gap-${bucket.start}`} x={xFor(index) - Math.max(2, barWidth / 2)} y={plotTop} width={Math.max(4, barWidth)} height={plotHeight} className="market-gap-zone" />
          ) : null)}

          {chartType === 'area' && segments.map((segment, index) => {
            const linePath = renderSegmentPath(segment, 'line');
            const firstPoint = segment[0];
            const lastPoint = segment[segment.length - 1];
            const areaPath = `${linePath} L ${xFor(lastPoint.index)} ${plotBottom} L ${xFor(firstPoint.index)} ${plotBottom} Z`;
            return <path key={`area-${index}`} d={areaPath} fill="url(#market-area-gradient)" className="market-area-fill" />;
          })}

          {chartType === 'bars' ? visibleBuckets.map((bucket, index) => bucket.average === null ? null : (
            <rect key={`bar-${bucket.start}`} x={xFor(index) - barWidth / 2} y={yFor(bucket.average)} width={barWidth} height={Math.max(1, plotBottom - yFor(bucket.average))} rx="2" className="market-data-bar" />
          )) : segments.map((segment, index) => (
            <path key={`line-${index}`} d={renderSegmentPath(segment, chartType === 'step' ? 'step' : 'line')} className={`market-price-line ${chartType === 'step' ? 'step-line' : ''}`} />
          ))}

          {showAverage && averageSegments.map((segment, index) => (
            <path key={`ma-${index}`} d={renderSegmentPath(segment, 'line')} className="market-average-line" />
          ))}

          {chartType !== 'bars' && segments.flat().map(({ bucket, index }) => (
            <g key={`point-${bucket.start}`}>
              <circle cx={xFor(index)} cy={yFor(bucket.average)} r={hoveredIndex === index ? 7 : 3.2} className={`market-data-point${hoveredIndex === index ? ' is-hovered' : ''}`} />
            </g>
          ))}

          {!compareMode && selectedBucket && selectedX !== null && <g className="market-crosshair">
            <line x1={selectedX} x2={selectedX} y1={plotTop} y2={showCoverage ? coverageBottom : plotBottom} />
            {selectedY !== null && <><line x1={margin.left} x2={svgWidth - margin.right} y1={selectedY} y2={selectedY} className="horizontal-crosshair" /><circle cx={selectedX} cy={selectedY} r="8" className="market-crosshair-point" /></>}
          </g>}

          {compareMode && compareBuckets.map(({ bucket, index }, compareIndex) => {
            const x = xFor(index);
            const color = index === hoveredIndex
              ? compareMarkerPalette[0]
              : compareMarkerPalette[(compareIndex % (compareMarkerPalette.length - 1)) + 1];
            const markerY = bucket.average === null ? null : yFor(bucket.average);
            return (
              <g key={`compare-marker-${bucket.start}`} pointerEvents="none">
                <line
                  x1={x}
                  x2={x}
                  y1={plotTop}
                  y2={showCoverage ? coverageBottom : plotBottom}
                  stroke={color}
                  strokeWidth={index === hoveredIndex ? 2.2 : 1.5}
                  strokeDasharray={index === hoveredIndex ? 'none' : '4 4'}
                  opacity={index === hoveredIndex ? 0.95 : 0.72}
                  vectorEffect="non-scaling-stroke"
                />
                {markerY !== null && (
                  <>
                    <circle cx={x} cy={markerY} r={index === hoveredIndex ? 8 : 6} fill={color} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    <line x1={x - 5} x2={x + 5} y1={markerY} y2={markerY} stroke="#fff" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                  </>
                )}
              </g>
            );
          })}

          {showCoverage && <g>
            <line x1={margin.left} x2={svgWidth - margin.right} y1={coverageTop - 8} y2={coverageTop - 8} className="market-coverage-divider" />
            <text x="22" y={coverageTop + 20} className="market-svg-label">COVERAGE</text>
            {visibleBuckets.map((bucket, index) => {
              const x = xFor(index);
              const height = bucket.validCount ? Math.max(2, (bucket.coverage / 100) * 40) : 3;
              return <rect key={`coverage-${bucket.start}`} x={x - Math.max(2, barWidth / 2)} y={coverageBottom - height} width={Math.max(4, barWidth)} height={height} rx="1.5" className={bucket.validCount ? 'market-coverage-bar' : 'market-coverage-missing'} />;
            })}
            <text x={svgWidth - margin.right} y={coverageTop + 20} textAnchor="end" className="market-coverage-scale">100%</text>
          </g>}

          {[...xTickIndexes].sort((a, b) => a - b).map((index) => {
            const bucket = visibleBuckets[index];
            return <g key={`xlabel-${bucket.start}`}>
              <text x={xFor(index)} y="482" textAnchor="middle" className="market-axis-date">{formatDate(bucket.start, timezone)}</text>
              <text x={xFor(index)} y="499" textAnchor="middle" className="market-axis-time">{formatChartAxisTime(bucket.start, timezone)}</text>
            </g>;
          })}
        </svg>
      </div>

      <div className="market-chart-footer">
        <span><span className="market-footer-dot" /> {numericBuckets.length} hours with recorded data</span>
        <span>{visibleBuckets.length - numericBuckets.length} hours without data</span>
        <span>First reading: {formatDateTime(first.start, timezone)}</span>
        <span>Latest reading: {formatDateTime(latest.start, timezone)}</span>
      </div>
      <div className="market-chart-disclaimer"><Info size={13} /><span>This visualises the average of recorded rolling 60-minute ticket counts. A gap means no successful observation was recorded; it is not treated as zero sales. Candlesticks are intentionally not used because the source provides one count per hour, not open/high/low/close prices.</span></div>
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
