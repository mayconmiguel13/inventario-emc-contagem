import prisma from '../../config/database.js';

// Auxiliar para normalizar o TipoPessoa
const parseTipoPessoa = (tipo) => {
  if (!tipo) return 'JURIDICA';
  const clean = tipo.toUpperCase();
  if (clean.includes('FÍSICA') || clean.includes('FISICA') || clean === 'PF') return 'FISICA';
  return 'JURIDICA';
};

export const listClientes = async (req, res, next) => {
  try {
    const { search, tipo, status, page = 1, limit = 50 } = req.query;
    const sociedadeId = req.sociedadeId;

    const where = {
      sociedadeId,
    };

    if (status && status !== 'Todos') {
      where.status = status;
    }

    if (tipo && tipo !== 'Todos') {
      where.tipo = parseTipoPessoa(tipo);
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { nome: { contains: term } },
        { cpfCnpj: { contains: term } },
        { email: { contains: term } },
        { telefone: { contains: term } },
      ];
    }

    const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [total, clientesRaw] = await Promise.all([
      prisma.cliente.count({ where }),
      prisma.cliente.findMany({
        where,
        take,
        skip,
        orderBy: { nome: 'asc' },
        include: {
          _count: {
            select: { processos: true },
          },
        },
      }),
    ]);

    // Mapear campos para compatibilidade completa com o frontend
    const clientes = clientesRaw.map((c) => ({
      ...c,
      documento: c.cpfCnpj,
      contato: c.email || '',
      processosAtivos: c._count.processos,
      tipoLabel: c.tipo === 'FISICA' ? 'Pessoa Física' : 'Pessoa Jurídica',
      statusColor: c.status === 'Ativo' ? 'success' : c.status === 'Em Análise' ? 'warning' : 'secondary',
    }));

    return res.json({
      success: true,
      total,
      page: parseInt(page, 10) || 1,
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
      data: clientes,
    });
  } catch (error) {
    next(error);
  }
};

export const getClienteById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const cliente = await prisma.cliente.findFirst({
      where: { id, sociedadeId },
      include: {
        processos: {
          orderBy: { updatedAt: 'desc' },
        },
        lancamentos: {
          take: 10,
          orderBy: { dataVencimento: 'desc' },
        },
        _count: {
          select: { processos: true, lancamentos: true },
        },
      },
    });

    if (!cliente) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado ou você não possui permissão para acessá-lo.',
      });
    }

    return res.json({
      success: true,
      data: {
        ...cliente,
        documento: cliente.cpfCnpj,
        contato: cliente.email || '',
        processosAtivos: cliente._count.processos,
        tipoLabel: cliente.tipo === 'FISICA' ? 'Pessoa Física' : 'Pessoa Jurídica',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createCliente = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const {
      nome,
      tipo,
      documento,
      cpfCnpj,
      contato,
      email,
      telefone,
      profissao,
      estadoCivil,
      rg,
      cep,
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      uf,
      status = 'Ativo',
    } = req.body;

    const docFinal = (documento || cpfCnpj || '').trim();

    if (!nome || !docFinal) {
      return res.status(400).json({
        success: false,
        message: 'Nome/Razão Social e CPF/CNPJ são campos obrigatórios.',
      });
    }

    // Verificar se já existe cliente com este documento no mesmo escritório
    const existente = await prisma.cliente.findFirst({
      where: {
        sociedadeId,
        cpfCnpj: docFinal,
      },
    });

    if (existente) {
      return res.status(409).json({
        success: false,
        message: `Já existe um cliente cadastrado com este documento (${docFinal}): ${existente.nome}.`,
      });
    }

    const tipoEnum = parseTipoPessoa(tipo);
    const emailFinal = (contato || email || '').trim();

    const novoCliente = await prisma.cliente.create({
      data: {
        sociedadeId,
        nome: nome.trim(),
        tipo: tipoEnum,
        cpfCnpj: docFinal,
        email: emailFinal || null,
        telefone: telefone ? telefone.trim() : null,
        profissao: profissao || null,
        estadoCivil: estadoCivil || null,
        rg: rg || null,
        cep: cep || null,
        logradouro: logradouro || null,
        numero: numero || null,
        complemento: complemento || null,
        bairro: bairro || null,
        cidade: cidade || 'São Paulo',
        uf: uf || 'SP',
        status: status || 'Ativo',
      },
    });

    // Registrar auditoria
    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.user?.id || null,
        acao: 'CRIAR_CLIENTE',
        entidade: 'Cliente',
        entidadeId: novoCliente.id,
        detalhes: { nome: novoCliente.nome, cpfCnpj: novoCliente.cpfCnpj },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.status(201).json({
      success: true,
      message: `Cliente ${novoCliente.nome} cadastrado com sucesso!`,
      data: {
        ...novoCliente,
        documento: novoCliente.cpfCnpj,
        contato: novoCliente.email || '',
        processosAtivos: 0,
        tipoLabel: novoCliente.tipo === 'FISICA' ? 'Pessoa Física' : 'Pessoa Jurídica',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateCliente = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;
    const {
      nome,
      tipo,
      documento,
      cpfCnpj,
      contato,
      email,
      telefone,
      profissao,
      estadoCivil,
      rg,
      cep,
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      uf,
      status,
    } = req.body;

    const clienteExistente = await prisma.cliente.findFirst({
      where: { id, sociedadeId },
    });

    if (!clienteExistente) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado.',
      });
    }

    const docFinal = (documento || cpfCnpj || clienteExistente.cpfCnpj).trim();

    const atualizado = await prisma.cliente.update({
      where: { id },
      data: {
        nome: nome !== undefined ? nome.trim() : clienteExistente.nome,
        tipo: tipo ? parseTipoPessoa(tipo) : clienteExistente.tipo,
        cpfCnpj: docFinal,
        email: email !== undefined ? email : contato !== undefined ? contato : clienteExistente.email,
        telefone: telefone !== undefined ? telefone : clienteExistente.telefone,
        profissao: profissao !== undefined ? profissao : clienteExistente.profissao,
        estadoCivil: estadoCivil !== undefined ? estadoCivil : clienteExistente.estadoCivil,
        rg: rg !== undefined ? rg : clienteExistente.rg,
        cep: cep !== undefined ? cep : clienteExistente.cep,
        logradouro: logradouro !== undefined ? logradouro : clienteExistente.logradouro,
        numero: numero !== undefined ? numero : clienteExistente.numero,
        complemento: complemento !== undefined ? complemento : clienteExistente.complemento,
        bairro: bairro !== undefined ? bairro : clienteExistente.bairro,
        cidade: cidade !== undefined ? cidade : clienteExistente.cidade,
        uf: uf !== undefined ? uf : clienteExistente.uf,
        status: status !== undefined ? status : clienteExistente.status,
      },
    });

    return res.json({
      success: true,
      message: 'Dados do cliente atualizados com sucesso!',
      data: {
        ...atualizado,
        documento: atualizado.cpfCnpj,
        contato: atualizado.email || '',
        tipoLabel: atualizado.tipo === 'FISICA' ? 'Pessoa Física' : 'Pessoa Jurídica',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCliente = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const cliente = await prisma.cliente.findFirst({
      where: { id, sociedadeId },
      include: {
        _count: {
          select: { processos: true },
        },
      },
    });

    if (!cliente) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado.',
      });
    }

    if (cliente._count.processos > 0) {
      return res.status(400).json({
        success: false,
        message: `Não é possível excluir o cliente ${cliente.nome} pois existem ${cliente._count.processos} pasta(s) processuais ativas vinculadas a ele.`,
      });
    }

    await prisma.cliente.delete({
      where: { id },
    });

    return res.json({
      success: true,
      message: `Cliente ${cliente.nome} removido com sucesso.`,
    });
  } catch (error) {
    next(error);
  }
};

export const getClientesStats = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;

    const [total, pf, pj, ativos] = await Promise.all([
      prisma.cliente.count({ where: { sociedadeId } }),
      prisma.cliente.count({ where: { sociedadeId, tipo: 'FISICA' } }),
      prisma.cliente.count({ where: { sociedadeId, tipo: 'JURIDICA' } }),
      prisma.cliente.count({ where: { sociedadeId, status: 'Ativo' } }),
    ]);

    return res.json({
      success: true,
      data: {
        total,
        pessoaFisica: pf,
        pessoaJuridica: pj,
        ativos,
      },
    });
  } catch (error) {
    next(error);
  }
};
