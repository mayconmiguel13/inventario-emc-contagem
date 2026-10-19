import { Router } from 'express';
import {
  listPrazos,
  getPrazoById,
  createPrazo,
  updatePrazo,
  cumprirPrazo,
  deletePrazo,
  getPrazosStats,
} from './prazoController.js';
import { authMiddleware } from '../../middlewares/authMiddleware.js';

const router = Router();
router.use(authMiddleware);

router.get('/stats', getPrazosStats);
router.get('/', listPrazos);
router.get('/:id', getPrazoById);
router.post('/', createPrazo);
router.put('/:id', updatePrazo);
router.patch('/:id/cumprir', cumprirPrazo);
router.delete('/:id', deletePrazo);

export default router;
