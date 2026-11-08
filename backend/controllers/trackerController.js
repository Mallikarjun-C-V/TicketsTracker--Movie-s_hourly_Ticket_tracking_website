import { createTrackerSchema, manualObservationSchema } from '../utils/validation.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import {
  addManualObservation,
  createTracker,
  deleteTracker,
  exportTrackerCsv,
  getAttempts,
  getSnapshots,
  getTrackerOrThrow,
  listTrackers,
  setTrackerStatus
} from '../services/trackerService.js';

function parseBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('Please review the entered values.', 400, 'VALIDATION_ERROR', parsed.error.flatten().fieldErrors);
  }
  return parsed.data;
}

export const create = asyncHandler(async (req, res) => {
  const input = parseBody(createTrackerSchema, req.body);
  const tracker = await createTracker(input);
  res.status(201).json({ success: true, data: tracker, message: 'Tracking session created. The first collection is queued immediately.' });
});

export const list = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
  const trackers = await listTrackers(limit);
  res.json({ success: true, data: trackers });
});

export const details = asyncHandler(async (req, res) => {
  const tracker = await getTrackerOrThrow(req.params.id);
  res.json({ success: true, data: tracker });
});

export const snapshots = asyncHandler(async (req, res) => {
  await getTrackerOrThrow(req.params.id);
  const data = await getSnapshots(req.params.id);
  res.json({ success: true, data });
});

export const attempts = asyncHandler(async (req, res) => {
  await getTrackerOrThrow(req.params.id);
  const data = await getAttempts(req.params.id);
  res.json({ success: true, data });
});

export const pause = asyncHandler(async (req, res) => {
  const data = await setTrackerStatus(req.params.id, 'pause');
  res.json({ success: true, data, message: 'Tracking paused.' });
});

export const resume = asyncHandler(async (req, res) => {
  const data = await setTrackerStatus(req.params.id, 'resume');
  res.json({ success: true, data, message: 'Tracking resumed.' });
});

export const stop = asyncHandler(async (req, res) => {
  const data = await setTrackerStatus(req.params.id, 'stop');
  res.json({ success: true, data, message: 'Tracking stopped.' });
});

export const remove = asyncHandler(async (req, res) => {
  await deleteTracker(req.params.id);
  res.json({ success: true, message: 'Tracking session and its observations were deleted.' });
});

export const exportCsv = asyncHandler(async (req, res) => {
  const csv = await exportTrackerCsv(req.params.id);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ticketstracker-${req.params.id}.csv"`);
  res.send(`\uFEFF${csv}`);
});

export const manualObservation = asyncHandler(async (req, res) => {
  const input = parseBody(manualObservationSchema, req.body);
  const data = await addManualObservation(req.params.id, input);
  res.status(201).json({ success: true, data, message: 'Manual observation saved.' });
});
