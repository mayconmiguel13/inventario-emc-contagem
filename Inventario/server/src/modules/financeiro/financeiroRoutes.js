import { Router } from 'express';
import {
  listLancamentos,
  getLancamentosStats,
  getLancamentoById,
  createLancamento,
  updateLancamento,
  liquidarLancamento,
  deleteLancamento,
  importarLancamentosEmLote,
  getDREForense,
} from './financeiroController.js';
import { authMiddleware } from '../../middlewares/authMiddleware.js';

const router = Router();

// Todas as rotas são protegidas e isoladas por Sociedade
router.use(authMiddleware);

router.get('/', listLancamentos);
router.get('/stats', getLancamentosStats);
router.get('/dre', getDREForense);
router.get('/:id', getLancamentoById);
router.post('/', createLancamento);
router.post('/importar', importarLancamentosEmLote);
router.put('/:id', updateLancamento);
router.patch('/:id/liquidar', liquidarLancamento);
router.delete('/:id', deleteLancamento);

export default router;
