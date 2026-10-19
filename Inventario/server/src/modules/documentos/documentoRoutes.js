import { Router } from 'express';
import {
  listDocumentos,
  getDocumentosStats,
  getDocumentoById,
  createDocumento,
  updateDocumento,
  deleteDocumento,
} from './documentoController.js';
import { authMiddleware } from '../../middlewares/authMiddleware.js';

const router = Router();
router.use(authMiddleware);

router.get('/stats', getDocumentosStats);
router.get('/', listDocumentos);
router.get('/:id', getDocumentoById);
router.post('/', createDocumento);
router.put('/:id', updateDocumento);
router.delete('/:id', deleteDocumento);

export default router;
