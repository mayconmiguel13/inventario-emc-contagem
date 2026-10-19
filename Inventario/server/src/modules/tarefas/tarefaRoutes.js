import { Router } from 'express';
import {
  listTarefas,
  getTarefaById,
  createTarefa,
  updateTarefa,
  updateTarefaStatus,
  deleteTarefa,
  getTarefasStats,
} from './tarefaController.js';
import { authMiddleware } from '../../middlewares/authMiddleware.js';

const router = Router();
router.use(authMiddleware);

router.get('/stats', getTarefasStats);
router.get('/', listTarefas);
router.get('/:id', getTarefaById);
router.post('/', createTarefa);
router.patch('/:id/status', updateTarefaStatus);
router.put('/:id', updateTarefa);
router.delete('/:id', deleteTarefa);

export default router;
