import { Router } from 'express';
import {
  getDashboardBI,
  getScorecardEquipe,
  getContingenciamentoRisco,
  getFichaCadastralCliente,
} from './relatoriosController.js';
import { authMiddleware } from '../../middlewares/authMiddleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/dashboard', getDashboardBI);
router.get('/scorecard', getScorecardEquipe);
router.get('/contingenciamento', getContingenciamentoRisco);
router.get('/cliente/:clienteId', getFichaCadastralCliente);

export default router;
