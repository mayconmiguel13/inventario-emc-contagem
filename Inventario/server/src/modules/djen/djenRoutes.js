import { Router } from 'express';
import {
  listPublicacoes,
  getPublicacoesStats,
  getPublicacaoById,
  createPublicacao,
  sincronizarDJENHandler,
  alternarStatusLida,
  marcarTodasLidas,
  converterPublicacao,
  getCertidaoPublicacao,
  deletePublicacao,
} from './djenController.js';
import { authMiddleware } from '../../middlewares/authMiddleware.js';

const router = Router();
router.use(authMiddleware);

router.get('/stats', getPublicacoesStats);
router.get('/', listPublicacoes);
router.get('/:id', getPublicacaoById);
router.get('/:id/certidao', getCertidaoPublicacao);
router.post('/', createPublicacao);
router.post('/sincronizar', sincronizarDJENHandler);
router.post('/marcar-todas-lidas', marcarTodasLidas);
router.patch('/:id/lida', alternarStatusLida);
router.post('/:id/converter', converterPublicacao);
router.delete('/:id', deletePublicacao);

export default router;
