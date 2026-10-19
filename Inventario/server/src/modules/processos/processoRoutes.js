import { Router } from 'express';
import {
  listProcessos,
  getProcessoById,
  createProcesso,
  updateProcesso,
  deleteProcesso,
  getProcessosStats,
} from './processoController.js';
import { authMiddleware } from '../../middlewares/authMiddleware.js';

const router = Router();

// Todas as rotas de processos requerem autenticação (JWT) e tenantScope
router.use(authMiddleware);

router.get('/stats', getProcessosStats);
router.get('/', listProcessos);
router.get('/:id', getProcessoById);
router.post('/', createProcesso);
router.put('/:id', updateProcesso);
router.delete('/:id', deleteProcesso);

export default router;
