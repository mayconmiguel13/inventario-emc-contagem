import { Router } from 'express';
import {
  listAudiencias,
  getAudienciaById,
  createAudiencia,
  updateAudiencia,
  deleteAudiencia,
} from './audienciaController.js';
import { authMiddleware } from '../../middlewares/authMiddleware.js';

const router = Router();
router.use(authMiddleware);

router.get('/', listAudiencias);
router.get('/:id', getAudienciaById);
router.post('/', createAudiencia);
router.put('/:id', updateAudiencia);
router.delete('/:id', deleteAudiencia);

export default router;
