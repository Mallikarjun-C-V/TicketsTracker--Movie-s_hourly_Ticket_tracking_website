import { Router } from 'express';
import * as trackerController from '../controllers/trackerController.js';

const router = Router();

router.post('/', trackerController.create);
router.get('/', trackerController.list);
router.get('/:id', trackerController.details);
router.get('/:id/snapshots', trackerController.snapshots);
router.get('/:id/attempts', trackerController.attempts);
router.post('/:id/pause', trackerController.pause);
router.post('/:id/resume', trackerController.resume);
router.post('/:id/stop', trackerController.stop);
router.post('/:id/manual-observation', trackerController.manualObservation);
router.get('/:id/export', trackerController.exportCsv);
router.delete('/:id', trackerController.remove);

export default router;
