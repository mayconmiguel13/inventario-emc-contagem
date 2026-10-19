import { Router } from 'express';
import {
  registerSociedade,
  login,
  refreshTokenHandler,
  getMe,
  logout,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} from './authController.js';
import { authMiddleware } from '../../middlewares/authMiddleware.js';

const router = Router();

// Rotas públicas
router.post('/register-sociedade', registerSociedade);
router.post('/login', login);
router.post('/refresh', refreshTokenHandler);

// Rotas protegidas por JWT
router.get('/me', authMiddleware, getMe);
router.post('/logout', authMiddleware, logout);

// Rotas de Gestão de Equipe & Usuários (RBAC)
router.get('/users', authMiddleware, listUsers);
router.post('/users', authMiddleware, createUser);
router.put('/users/:id', authMiddleware, updateUser);
router.delete('/users/:id', authMiddleware, deleteUser);

export default router;
