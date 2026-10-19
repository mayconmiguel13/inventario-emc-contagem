import { verifyToken } from '../utils/auth.js';
import prisma from '../config/database.js';

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Token de autenticação não fornecido ou em formato inválido.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    
    // Buscar usuário ativo no banco
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        sociedade: {
          select: {
            id: true,
            razaoSocial: true,
            cnpj: true,
            registroOab: true,
            primaryColor: true,
            layoutMode: true,
          },
        },
      },
    });

    if (!user || user.status !== 'Ativo') {
      return res.status(401).json({
        success: false,
        message: 'Usuário inativo ou não encontrado no sistema.',
      });
    }

    req.user = user;
    req.sociedadeId = user.sociedadeId;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_EXPIRED',
        message: 'Token de acesso expirado. Por favor, renove sua sessão.',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Token de autenticação inválido ou corrompido.',
    });
  }
};
