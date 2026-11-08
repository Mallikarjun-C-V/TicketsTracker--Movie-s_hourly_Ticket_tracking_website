import { DateTime } from 'luxon';

export function getRollingWindow(observedAt, minutes = 60) {
  const end = new Date(observedAt);
  const start = new Date(end.getTime() - minutes * 60_000);
  return { windowStart: start, windowEnd: end, metricWindowMinutes: minutes };
}

export function getNextPollAt(now, intervalMinutes, clockAligned = false, timezone = 'Asia/Kolkata') {
  if (!clockAligned) return new Date(now.getTime() + intervalMinutes * 60_000);
  const current = DateTime.fromJSDate(now, { zone: timezone });
  const minuteOfDay = current.hour * 60 + current.minute + (current.second + current.millisecond / 1000) / 60;
  const nextBoundary = (Math.floor(minuteOfDay / intervalMinutes) + 1) * intervalMinutes;
  return current.startOf('day').plus({ minutes: nextBoundary }).toJSDate();
}

export function isTrackerLimitReached(tracker) {
  return tracker.maximumChecks != null && tracker.attemptedChecks >= tracker.maximumChecks;
}
