import { Router } from 'express';
import {
  listEnvelopes,
  getEnvelopesStats,
  getEnvelopeById,
  createEnvelope,
  assinarEnvelope,
  cancelarEnvelope,
  reenviarLembrete,
  getManifestoAutenticidade,
  deleteEnvelope,
} from './envelopeController.js';
import { authMiddleware } from '../../middlewares/authMiddleware.js';

const router = Router();
router.use(authMiddleware);

router.get('/stats', getEnvelopesStats);
router.get('/', listEnvelopes);
router.get('/:id', getEnvelopeById);
router.get('/:id/manifesto', getManifestoAutenticidade);
router.post('/', createEnvelope);
router.post('/:id/assinar', assinarEnvelope);
router.post('/:id/cancelar', cancelarEnvelope);
router.post('/:id/lembrete', reenviarLembrete);
router.delete('/:id', deleteEnvelope);

export default router;
