import prisma from '../../config/database.js';
import {
  hashPassword,
  comparePassword,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../utils/auth.js';

export const registerSociedade = async (req, res, next) => {
  try {
    const {
      razaoSocial,
      cnpj,
      registroOab,
      email,
      telefone,
      responsavel,
      cidade,
      uf,
      nomeAdmin,
      emailAdmin,
      senhaAdmin,
      oabAdmin,
    } = req.body;

    if (!razaoSocial || !cnpj || !emailAdmin || !senhaAdmin || !nomeAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Preencha os campos obrigatórios (Razão Social, CNPJ, Nome, E-mail e Senha).',
      });
    }

    // Verificar se CNPJ ou e-mail de admin já existem
    const existingCnpj = await prisma.sociedade.findUnique({ where: { cnpj } });
    if (existingCnpj) {
      return res.status(409).json({
        success: false,
        message: 'Já existe um escritório/sociedade cadastrado com este CNPJ.',
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: emailAdmin } });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Já existe um usuário cadastrado com este e-mail.',
      });
    }

    const senhaHash = await hashPassword(senhaAdmin);

    // Transação atômica: cria a Sociedade e o Usuário Administrador
    const result = await prisma.$transaction(async (tx) => {
      const sociedade = await tx.sociedade.create({
        data: {
          razaoSocial,
          cnpj,
          registroOab: registroOab || 'OAB/BR 00.000',
          email: email || emailAdmin,
          telefone: telefone || '',
          responsavel: responsavel || nomeAdmin,
          cidade: cidade || 'São Paulo',
          uf: uf || 'SP',
          primaryColor: '#405189',
          layoutMode: 'light',
        },
      });

      const user = await tx.user.create({
        data: {
          sociedadeId: sociedade.id,
          nome: nomeAdmin,
          email: emailAdmin,
          senhaHash,
          cargo: 'Sócio Fundador & Administrador',
          oab: oabAdmin || '',
          role: 'ADMIN',
          status: 'Ativo',
          avatar: nomeAdmin.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase(),
          corAvatar: 'primary',
          permissoes: {
            financeiro: true,
            excluir: true,
            assinar: true,
            djen: true,
            relatorios: true,
          },
        },
      });

      return { sociedade, user };
    });

    const token = generateToken({
      userId: result.user.id,
      sociedadeId: result.sociedade.id,
      role: result.user.role,
    });

    const refreshToken = generateRefreshToken({
      userId: result.user.id,
    });

    // Salvar refresh token com validade de 7 dias
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: result.user.id,
        expiresAt,
      },
    });

    // Registrar log de auditoria
    await prisma.auditLog.create({
      data: {
        sociedadeId: result.sociedade.id,
        userId: result.user.id,
        acao: 'CADASTRO_SOCIEDADE',
        entidade: 'Sociedade',
        entidadeId: result.sociedade.id,
        detalhes: { razaoSocial: result.sociedade.razaoSocial, cnpj: result.sociedade.cnpj },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    const sanitizedUser = { ...result.user };
    delete sanitizedUser.senhaHash;
    delete sanitizedUser.secret2fa;

    return res.status(201).json({
      success: true,
      message: 'Sociedade e usuário administrador cadastrados com sucesso!',
      token,
      refreshToken,
      user: sanitizedUser,
      sociedade: result.sociedade,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({
        success: false,
        message: 'Por favor, informe seu e-mail e senha de acesso.',
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        sociedade: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas. Verifique seu e-mail e senha.',
      });
    }

    if (user.status !== 'Ativo') {
      return res.status(403).json({
        success: false,
        message: 'Este usuário está inativo ou suspenso. Procure o administrador do escritório.',
      });
    }

    const senhaCorreta = await comparePassword(senha, user.senhaHash);
    if (!senhaCorreta) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas. Verifique seu e-mail e senha.',
      });
    }

    const token = generateToken({
      userId: user.id,
      sociedadeId: user.sociedadeId,
      role: user.role,
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
    });

    // Salvar ou atualizar refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    // Registrar auditoria de login
    await prisma.auditLog.create({
      data: {
        sociedadeId: user.sociedadeId,
        userId: user.id,
        acao: 'LOGIN',
        entidade: 'User',
        entidadeId: user.id,
        detalhes: { email: user.email, cargo: user.cargo },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    const sanitizedUser = { ...user };
    delete sanitizedUser.senhaHash;
    delete sanitizedUser.secret2fa;

    return res.json({
      success: true,
      message: 'Autenticado com sucesso!',
      token,
      refreshToken,
      user: sanitizedUser,
      sociedade: user.sociedade,
    });
  } catch (error) {
    next(error);
  }
};

export const refreshTokenHandler = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token não fornecido.',
      });
    }

    // Validar token no banco
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: {
          include: {
            sociedade: true,
          },
        },
      },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'Sessão expirada. Por favor, realize novo login.',
      });
    }

    // Gerar novo access token
    const newToken = generateToken({
      userId: storedToken.user.id,
      sociedadeId: storedToken.user.sociedadeId,
      role: storedToken.user.role,
    });

    return res.json({
      success: true,
      token: newToken,
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = { ...req.user };
    delete user.senhaHash;
    delete user.secret2fa;

    return res.json({
      success: true,
      user,
      sociedade: user.sociedade,
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    if (req.user) {
      await prisma.refreshToken.deleteMany({
        where: { userId: req.user.id },
      });

      await prisma.auditLog.create({
        data: {
          sociedadeId: req.user.sociedadeId,
          userId: req.user.id,
          acao: 'LOGOUT',
          entidade: 'User',
          entidadeId: req.user.id,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });
    }

    return res.json({
      success: true,
      message: 'Sessão encerrada com sucesso.',
    });
  } catch (error) {
    next(error);
  }
};

export const listUsers = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const users = await prisma.user.findMany({
      where: { sociedadeId },
      orderBy: { createdAt: 'asc' },
    });

    const data = users.map((u) => {
      const sanitized = { ...u };
      delete sanitized.senhaHash;
      delete sanitized.secret2fa;
      return {
        id: sanitized.id,
        nome: sanitized.nome,
        email: sanitized.email,
        telefone: sanitized.telefone || '',
        cargo: sanitized.cargo || 'Advogado Associado',
        oab: sanitized.oab || 'OAB Ativa',
        role: sanitized.role.toLowerCase(),
        roleLabel: sanitized.role === 'ADMIN' ? 'Sócio Coordenador (Admin)' : 'Advogado Associado',
        status: sanitized.status,
        avatar: sanitized.avatar || sanitized.nome.slice(0, 2).toUpperCase(),
        corAvatar: sanitized.corAvatar || 'primary',
        areas: ['Cível', 'Empresarial'],
        permissoes: sanitized.permissoes || {
          financeiro: sanitized.role === 'ADMIN',
          excluir: sanitized.role === 'ADMIN',
          assinar: true,
          djen: true,
          relatorios: true,
        },
      };
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const { nome, email, senha, telefone, cargo, oab, role, status, avatar, corAvatar, permissoes } = req.body;

    if (!nome || !email) {
      return res.status(400).json({ success: false, message: 'Nome e e-mail são obrigatórios.' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Já existe um usuário cadastrado com este e-mail.' });
    }

    const senhaHash = await hashPassword(senha || 'admin123');
    const roleUpper = (role || 'ADVOGADO').toUpperCase();

    const novo = await prisma.user.create({
      data: {
        sociedadeId,
        nome,
        email,
        senhaHash,
        telefone: telefone || '',
        cargo: cargo || 'Advogado Associado',
        oab: oab || '',
        role: ['ADMIN', 'SOCIO', 'ADVOGADO', 'ESTAGIARIO', 'FINANCEIRO'].includes(roleUpper) ? roleUpper : 'ADVOGADO',
        status: status || 'Ativo',
        avatar: avatar || nome.slice(0, 2).toUpperCase(),
        corAvatar: corAvatar || 'primary',
        permissoes: permissoes || {},
      },
    });

    return res.status(201).json({
      success: true,
      message: `Membro ${novo.nome} cadastrado na equipe com sucesso!`,
      data: {
        id: novo.id,
        nome: novo.nome,
        email: novo.email,
        telefone: novo.telefone,
        cargo: novo.cargo,
        oab: novo.oab,
        role: novo.role.toLowerCase(),
        roleLabel: novo.role === 'ADMIN' ? 'Sócio Coordenador (Admin)' : 'Advogado Associado',
        status: novo.status,
        avatar: novo.avatar,
        corAvatar: novo.corAvatar,
        areas: ['Cível'],
        permissoes: novo.permissoes,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sociedadeId = req.sociedadeId;
    const userId = parseInt(id, 10);

    const existing = await prisma.user.findFirst({
      where: { id: userId, sociedadeId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Membro da equipe não encontrado.' });
    }

    const { nome, telefone, cargo, oab, role, status, corAvatar, permissoes } = req.body;
    const updateData = {};
    if (nome) updateData.nome = nome;
    if (telefone !== undefined) updateData.telefone = telefone;
    if (cargo !== undefined) updateData.cargo = cargo;
    if (oab !== undefined) updateData.oab = oab;
    if (role) {
      const roleUpper = role.toUpperCase();
      if (['ADMIN', 'SOCIO', 'ADVOGADO', 'ESTAGIARIO', 'FINANCEIRO'].includes(roleUpper)) {
        updateData.role = roleUpper;
      }
    }
    if (status) updateData.status = status;
    if (corAvatar) updateData.corAvatar = corAvatar;
    if (permissoes) updateData.permissoes = permissoes;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return res.json({
      success: true,
      message: 'Dados e permissões do membro atualizados com sucesso!',
      data: {
        id: updated.id,
        nome: updated.nome,
        email: updated.email,
        telefone: updated.telefone,
        cargo: updated.cargo,
        oab: updated.oab,
        role: updated.role.toLowerCase(),
        roleLabel: updated.role === 'ADMIN' ? 'Sócio Coordenador (Admin)' : 'Advogado Associado',
        status: updated.status,
        avatar: updated.avatar,
        corAvatar: updated.corAvatar,
        areas: ['Cível'],
        permissoes: updated.permissoes,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sociedadeId = req.sociedadeId;
    const userId = parseInt(id, 10);

    const existing = await prisma.user.findFirst({
      where: { id: userId, sociedadeId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Membro da equipe não encontrado.' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { status: 'Inativo' },
    });

    return res.json({
      success: true,
      message: 'Membro desativado da equipe.',
    });
  } catch (error) {
    next(error);
  }
};
