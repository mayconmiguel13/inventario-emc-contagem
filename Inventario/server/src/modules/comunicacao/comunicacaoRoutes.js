import { Router } from 'express';
import {
  listComunicacoes,
  getComunicacoesStats,
  createComunicacao,
  disparoEmMassa,
  deleteComunicacao,
} from './comunicacaoController.js';
import { authMiddleware } from '../../middlewares/authMiddleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', listComunicacoes);
router.get('/stats', getComunicacoesStats);
router.post('/', createComunicacao);
router.post('/disparo-em-massa', disparoEmMassa);
router.delete('/:id', deleteComunicacao);

export default router;
