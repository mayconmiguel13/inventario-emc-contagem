import prisma from '../../config/database.js';

// Auxiliar para converter valor em formato BRL ("R$ 450.000,00" ou 450000) em Decimal numérico
const parseValorCausa = (valor) => {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return valor;
  const str = String(valor).replace(/[R$\s.]/g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
};

// Auxiliar para normalizar a FaseProcessual do enum Prisma
const parseFaseProcessual = (fase) => {
  if (!fase) return 'CONHECIMENTO';
  const clean = fase.toUpperCase();
  if (clean.includes('RECURS')) return 'RECURSAL';
  if (clean.includes('EXECU')) return 'EXECUCAO';
  if (clean.includes('CUMPRIMENTO')) return 'CUMPRIMENTO_SENTENCA';
  if (clean.includes('ARQUIV')) return 'ARQUIVADO';
  if (clean.includes('ACORDO')) return 'ACORDO';
  return 'CONHECIMENTO';
};

export const listProcessos = async (req, res, next) => {
  try {
    const { search, clienteId, polo, area, fase, status, page = 1, limit = 50 } = req.query;
    const sociedadeId = req.sociedadeId;

    const where = {
      sociedadeId,
    };

    if (clienteId) {
      where.clienteId = parseInt(clienteId, 10);
    }

    if (polo && polo !== 'Todos') {
      where.polo = polo;
    }

    if (area && area !== 'Todos') {
      where.area = area;
    }

    if (status && status !== 'Todos') {
      where.status = status;
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { numeroCnj: { contains: term } },
        { titulo: { contains: term } },
        { parteContraria: { contains: term } },
        { varaTribunal: { contains: term } },
        { cliente: { nome: { contains: term } } },
      ];
    }

    const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [total, processosRaw] = await Promise.all([
      prisma.processo.count({ where }),
      prisma.processo.findMany({
        where,
        take,
        skip,
        orderBy: { updatedAt: 'desc' },
        include: {
          cliente: {
            select: { id: true, nome: true, cpfCnpj: true, tipo: true },
          },
          _count: {
            select: { prazos: true, audiencias: true, tarefas: true, documentos: true },
          },
        },
      }),
    ]);

    // Mapear campos para compatibilidade perfeita com a tabela do frontend
    const processos = processosRaw.map((p) => {
      const valNum = p.valorCausa ? Number(p.valorCausa) : 0;
      const valFormatado = valNum > 0
        ? valNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : 'R$ 0,00';

      return {
        ...p,
        cnj: p.numeroCnj,
        cliente: p.cliente?.nome || 'Cliente não identificado',
        clienteId: p.clienteId,
        vara: p.varaTribunal || 'Vara Cível',
        valorCausaFormatado: valFormatado,
        valorCausa: valFormatado,
        poloColor: p.polo === 'Réu' ? 'secondary' : 'success',
        faseColor:
          p.fase === 'ARQUIVADO'
            ? 'secondary'
            : p.fase === 'EXECUCAO'
            ? 'danger'
            : p.fase === 'RECURSAL'
            ? 'warning'
            : 'primary',
        totalPrazos: p._count.prazos,
        totalAudiencias: p._count.audiencias,
        totalTarefas: p._count.tarefas,
        totalDocumentos: p._count.documentos,
      };
    });

    return res.json({
      success: true,
      total,
      page: parseInt(page, 10) || 1,
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
      data: processos,
    });
  } catch (error) {
    next(error);
  }
};

export const getProcessoById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const processo = await prisma.processo.findFirst({
      where: { id, sociedadeId },
      include: {
        cliente: true,
        prazos: {
          orderBy: { dataLimite: 'asc' },
        },
        audiencias: {
          orderBy: { dataHora: 'asc' },
        },
        tarefas: {
          orderBy: { createdAt: 'desc' },
        },
        documentos: {
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!processo) {
      return res.status(404).json({
        success: false,
        message: 'Processo não encontrado ou sem permissão de acesso.',
      });
    }

    const valNum = processo.valorCausa ? Number(processo.valorCausa) : 0;
    const valFormatado = valNum > 0
      ? valNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : 'R$ 0,00';

    return res.json({
      success: true,
      data: {
        ...processo,
        cnj: processo.numeroCnj,
        cliente: processo.cliente?.nome || '',
        vara: processo.varaTribunal || '',
        valorCausaFormatado: valFormatado,
        valorCausa: valFormatado,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createProcesso = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const {
      cnj,
      numeroCnj,
      cliente,
      clienteId,
      polo = 'Autor',
      area = 'Cível',
      vara,
      varaTribunal,
      comarca,
      uf,
      valorCausa,
      fase,
      parteContraria,
      observacoes,
      titulo,
      segredoJustica = false,
      probabilidade = 'Provavel',
    } = req.body;

    const cnjFinal = (cnj || numeroCnj || '').trim();

    if (!cnjFinal) {
      return res.status(400).json({
        success: false,
        message: 'O número CNJ do processo é obrigatório.',
      });
    }

    // Verificar se já existe processo com este número CNJ no sistema
    const existente = await prisma.processo.findUnique({
      where: { numeroCnj: cnjFinal },
    });

    if (existente) {
      return res.status(409).json({
        success: false,
        message: `Já existe um processo cadastrado com a numeração CNJ ${cnjFinal}.`,
      });
    }

    // Resolver clienteId: por ID direto ou por busca de nome
    let resolvedClienteId = clienteId ? parseInt(clienteId, 10) : null;

    if (!resolvedClienteId && cliente) {
      const cli = await prisma.cliente.findFirst({
        where: {
          sociedadeId,
          nome: { contains: cliente.trim() },
        },
      });
      if (cli) {
        resolvedClienteId = cli.id;
      }
    }

    if (!resolvedClienteId) {
      // Se não encontrou o cliente, criar automaticamente para fluidez da experiência forense
      const nomeClienteAuto = cliente || 'Cliente Cadastrado Automaticamente';
      const novoCli = await prisma.cliente.create({
        data: {
          sociedadeId,
          nome: nomeClienteAuto,
          tipo: 'JURIDICA',
          cpfCnpj: '00.000.000/0000-00',
          status: 'Ativo',
        },
      });
      resolvedClienteId = novoCli.id;
    }

    const valorDecimal = parseValorCausa(valorCausa);
    const faseEnum = parseFaseProcessual(fase);
    const varaFinal = (vara || varaTribunal || 'Vara Cível').trim();
    const tituloFinal = titulo || `${area}: Processo ${cnjFinal}`;

    const novoProcesso = await prisma.processo.create({
      data: {
        sociedadeId,
        clienteId: resolvedClienteId,
        numeroCnj: cnjFinal,
        titulo: tituloFinal,
        area: area || 'Cível',
        varaTribunal: varaFinal,
        comarca: comarca || 'São Paulo',
        uf: uf || 'SP',
        polo: polo || 'Autor',
        parteContraria: parteContraria ? parteContraria.trim() : null,
        valorCausa: valorDecimal,
        fase: faseEnum,
        segredoJustica: Boolean(segredoJustica),
        probabilidade: probabilidade || 'Provavel',
        status: 'Em Andamento',
        observacoes: observacoes || null,
      },
      include: {
        cliente: true,
      },
    });

    // Registrar log de auditoria
    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.user?.id || null,
        acao: 'CRIAR_PROCESSO',
        entidade: 'Processo',
        entidadeId: novoProcesso.id,
        detalhes: { cnj: novoProcesso.numeroCnj, cliente: novoProcesso.cliente.nome },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    const valNum = novoProcesso.valorCausa ? Number(novoProcesso.valorCausa) : 0;
    const valFormatado = valNum > 0
      ? valNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : 'R$ 0,00';

    return res.status(201).json({
      success: true,
      message: `Processo ${novoProcesso.numeroCnj} cadastrado com sucesso!`,
      data: {
        ...novoProcesso,
        cnj: novoProcesso.numeroCnj,
        cliente: novoProcesso.cliente?.nome || '',
        vara: novoProcesso.varaTribunal,
        valorCausaFormatado: valFormatado,
        valorCausa: valFormatado,
        poloColor: novoProcesso.polo === 'Réu' ? 'secondary' : 'success',
        faseColor: 'primary',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateProcesso = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;
    const {
      cnj,
      numeroCnj,
      clienteId,
      polo,
      area,
      vara,
      varaTribunal,
      comarca,
      uf,
      valorCausa,
      fase,
      parteContraria,
      observacoes,
      titulo,
      status,
      segredoJustica,
      probabilidade,
    } = req.body;

    const processoExistente = await prisma.processo.findFirst({
      where: { id, sociedadeId },
    });

    if (!processoExistente) {
      return res.status(404).json({
        success: false,
        message: 'Processo não encontrado ou sem permissão de acesso.',
      });
    }

    const cnjFinal = (cnj || numeroCnj || processoExistente.numeroCnj).trim();
    const valorDecimal = valorCausa !== undefined ? parseValorCausa(valorCausa) : processoExistente.valorCausa;
    const varaFinal = vara || varaTribunal || processoExistente.varaTribunal;

    const atualizado = await prisma.processo.update({
      where: { id },
      data: {
        numeroCnj: cnjFinal,
        clienteId: clienteId ? parseInt(clienteId, 10) : processoExistente.clienteId,
        polo: polo || processoExistente.polo,
        area: area || processoExistente.area,
        varaTribunal: varaFinal,
        comarca: comarca !== undefined ? comarca : processoExistente.comarca,
        uf: uf !== undefined ? uf : processoExistente.uf,
        valorCausa: valorDecimal,
        fase: fase ? parseFaseProcessual(fase) : processoExistente.fase,
        parteContraria: parteContraria !== undefined ? parteContraria : processoExistente.parteContraria,
        observacoes: observacoes !== undefined ? observacoes : processoExistente.observacoes,
        titulo: titulo || processoExistente.titulo,
        status: status || processoExistente.status,
        segredoJustica: segredoJustica !== undefined ? Boolean(segredoJustica) : processoExistente.segredoJustica,
        probabilidade: probabilidade || processoExistente.probabilidade,
      },
      include: {
        cliente: true,
      },
    });

    const valNum = atualizado.valorCausa ? Number(atualizado.valorCausa) : 0;
    const valFormatado = valNum > 0
      ? valNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : 'R$ 0,00';

    return res.json({
      success: true,
      message: 'Processo atualizado com sucesso!',
      data: {
        ...atualizado,
        cnj: atualizado.numeroCnj,
        cliente: atualizado.cliente?.nome || '',
        vara: atualizado.varaTribunal,
        valorCausaFormatado: valFormatado,
        valorCausa: valFormatado,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProcesso = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const processo = await prisma.processo.findFirst({
      where: { id, sociedadeId },
    });

    if (!processo) {
      return res.status(404).json({
        success: false,
        message: 'Processo não encontrado ou sem permissão de acesso.',
      });
    }

    await prisma.processo.delete({
      where: { id },
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.user?.id || null,
        acao: 'EXCLUIR_PROCESSO',
        entidade: 'Processo',
        entidadeId: id,
        detalhes: { cnj: processo.numeroCnj },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.json({
      success: true,
      message: `Processo ${processo.numeroCnj} excluído com sucesso.`,
    });
  } catch (error) {
    next(error);
  }
};

export const getProcessosStats = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;

    const [total, poloAutor, poloReu, aggregateValor] = await Promise.all([
      prisma.processo.count({ where: { sociedadeId } }),
      prisma.processo.count({ where: { sociedadeId, polo: 'Autor' } }),
      prisma.processo.count({ where: { sociedadeId, polo: 'Réu' } }),
      prisma.processo.aggregate({
        where: { sociedadeId },
        _sum: { valorCausa: true },
      }),
    ]);

    const totalValor = aggregateValor._sum.valorCausa ? Number(aggregateValor._sum.valorCausa) : 0;

    return res.json({
      success: true,
      data: {
        totalProcessos: total,
        poloAutor,
        poloReu,
        valorTotalCarteira: totalValor,
        valorTotalFormatado: totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      },
    });
  } catch (error) {
    next(error);
  }
};
