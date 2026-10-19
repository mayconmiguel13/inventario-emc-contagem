import { Router } from 'express';
import {
  listClientes,
  getClienteById,
  createCliente,
  updateCliente,
  deleteCliente,
  getClientesStats,
} from './clienteController.js';
import { authMiddleware } from '../../middlewares/authMiddleware.js';

const router = Router();

// Todas as rotas de clientes requerem autenticação (JWT) e tenantScope
router.use(authMiddleware);

router.get('/stats', getClientesStats);
router.get('/', listClientes);
router.get('/:id', getClienteById);
router.post('/', createCliente);
router.put('/:id', updateCliente);
router.delete('/:id', deleteCliente);

export default router;
