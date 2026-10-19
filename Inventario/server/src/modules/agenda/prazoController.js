import prisma from '../../config/database.js';

// Auxiliar para normalizar prioridade/urgência
const parsePrioridade = (urgencia) => {
  if (!urgencia) return 'Alta';
  const clean = urgencia.trim().toLowerCase();
  if (clean.includes('fatal')) return 'Fatal';
  if (clean.includes('urgente')) return 'Urgente';
  if (clean.includes('média') || clean.includes('media')) return 'Média';
  if (clean.includes('normal') || clean.includes('baixa')) return 'Normal';
  return 'Alta';
};

// Auxiliar para interpretar vencimento em texto ou formato ISO
const parseDataLimite = (vencimento, dataLimite) => {
  if (dataLimite) return new Date(dataLimite);
  if (!vencimento) {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d;
  }

  const hoje = new Date();
  const v = vencimento.toLowerCase();

  if (v.includes('hoje')) {
    hoje.setHours(23, 59, 59, 999);
    return hoje;
  }
  if (v.includes('amanhã') || v.includes('amanha')) {
    hoje.setDate(hoje.getDate() + 1);
    hoje.setHours(23, 59, 59, 999);
    return hoje;
  }

  const parsed = new Date(vencimento);
  if (!isNaN(parsed.getTime())) return parsed;

  // Tentativa dd/mm/aaaa
  const parts = vencimento.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (parts) {
    return new Date(parseInt(parts[3], 10), parseInt(parts[2], 10) - 1, parseInt(parts[1], 10), 23, 59);
  }

  const d = new Date();
  d.setDate(d.getDate() + 5);
  return d;
};

export const listPrazos = async (req, res, next) => {
  try {
    const { search, processoId, responsavelId, status, urgencia, cumprido, page = 1, limit = 50 } = req.query;
    const sociedadeId = req.sociedadeId;

    const where = {
      sociedadeId,
    };

    if (processoId) {
      where.processoId = parseInt(processoId, 10);
    }

    if (responsavelId) {
      where.responsavelId = parseInt(responsavelId, 10);
    }

    if (status && status !== 'Todos') {
      where.status = status;
    }

    if (urgencia && urgencia !== 'Todas') {
      where.prioridade = urgencia;
    }

    if (cumprido !== undefined && cumprido !== null && cumprido !== '') {
      if (cumprido === 'true' || cumprido === true) {
        where.status = 'CONCLUIDO';
      } else {
        where.status = { not: 'CONCLUIDO' };
      }
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { titulo: { contains: term } },
        { descricao: { contains: term } },
        { processo: { numeroCnj: { contains: term } } },
        { processo: { cliente: { nome: { contains: term } } } },
      ];
    }

    const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [total, prazosRaw] = await Promise.all([
      prisma.prazo.count({ where }),
      prisma.prazo.findMany({
        where,
        take,
        skip,
        orderBy: { dataLimite: 'asc' },
        include: {
          processo: {
            include: {
              cliente: { select: { id: true, nome: true } },
            },
          },
          responsavel: {
            select: { id: true, nome: true, email: true, cargo: true, avatar: true },
          },
        },
      }),
    ]);

    // Mapear campos para compatibilidade completa com a tela Agenda
    const prazos = prazosRaw.map((p) => {
      const isCumprido = p.status === 'CONCLUIDO' || Boolean(p.concluidoEm);
      const dataLimiteObj = new Date(p.dataLimite);

      // Formatar vencimento legível
      const vencFormatado = dataLimiteObj.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }) + ` às ${String(dataLimiteObj.getHours()).padStart(2, '0')}:${String(dataLimiteObj.getMinutes()).padStart(2, '0')}`;

      const urgenciaLabel = p.prioridade || 'Alta';
      const urgenciaColor =
        urgenciaLabel === 'Fatal'
          ? 'danger'
          : urgenciaLabel === 'Urgente'
          ? 'warning'
          : 'info';

      return {
        ...p,
        cnj: p.processo?.numeroCnj || 'Processo Administrativo',
        cliente: p.processo?.cliente?.nome || 'Silva & Associados',
        tribunal: p.processo?.varaTribunal || 'Tribunal de Justiça',
        tipo: p.titulo,
        vencimento: vencFormatado,
        vencimentoISO: p.dataLimite,
        urgencia: urgenciaLabel,
        urgenciaColor,
        responsavel: p.responsavel?.nome || 'Dr. Maycon Silva',
        cumprido: isCumprido,
      };
    });

    return res.json({
      success: true,
      total,
      page: parseInt(page, 10) || 1,
      limit: take,
      data: prazos,
    });
  } catch (error) {
    next(error);
  }
};

export const getPrazoById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const prazo = await prisma.prazo.findFirst({
      where: { id, sociedadeId },
      include: {
        processo: { include: { cliente: true } },
        responsavel: true,
        criador: true,
      },
    });

    if (!prazo) {
      return res.status(404).json({
        success: false,
        message: 'Prazo processual não encontrado.',
      });
    }

    return res.json({
      success: true,
      data: {
        ...prazo,
        cnj: prazo.processo?.numeroCnj,
        cliente: prazo.processo?.cliente?.nome,
        responsavel: prazo.responsavel?.nome,
        cumprido: prazo.status === 'CONCLUIDO',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createPrazo = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const {
      cnj,
      processoId,
      titulo,
      tipo,
      descricao,
      vencimento,
      dataLimite,
      dataPublicacao,
      diasPrazo,
      urgencia,
      prioridade,
      responsavelId,
      tribunal,
      cliente,
    } = req.body;

    const tituloFinal = (tipo || titulo || 'Prazo Processual').trim();
    const dataLimiteFinal = parseDataLimite(vencimento, dataLimite);
    const prioridadeFinal = parsePrioridade(urgencia || prioridade);

    // Resolver processo se fornecido por CNJ
    let resolvedProcessoId = processoId ? parseInt(processoId, 10) : null;
    if (!resolvedProcessoId && cnj) {
      const proc = await prisma.processo.findFirst({
        where: { sociedadeId, numeroCnj: cnj.trim() },
      });
      if (proc) resolvedProcessoId = proc.id;
    }

    const novoPrazo = await prisma.prazo.create({
      data: {
        sociedadeId,
        processoId: resolvedProcessoId,
        responsavelId: responsavelId ? parseInt(responsavelId, 10) : req.user?.id || null,
        criadorId: req.user?.id || null,
        titulo: tituloFinal,
        descricao: descricao || null,
        tipo: 'CPC',
        dataPublicacao: dataPublicacao ? new Date(dataPublicacao) : null,
        dataLimite: dataLimiteFinal,
        diasPrazo: diasPrazo ? parseInt(diasPrazo, 10) : null,
        prioridade: prioridadeFinal,
        status: prioridadeFinal === 'Fatal' ? 'FATAL' : 'PENDENTE',
      },
      include: {
        processo: { include: { cliente: true } },
        responsavel: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.user?.id || null,
        acao: 'CRIAR_PRAZO',
        entidade: 'Prazo',
        entidadeId: novoPrazo.id,
        detalhes: { titulo: novoPrazo.titulo, vencimento: novoPrazo.dataLimite },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    const isCumprido = novoPrazo.status === 'CONCLUIDO';
    const urgenciaColor = prioridadeFinal === 'Fatal' ? 'danger' : prioridadeFinal === 'Urgente' ? 'warning' : 'info';

    return res.status(201).json({
      success: true,
      message: `Prazo '${novoPrazo.titulo}' cadastrado com sucesso!`,
      data: {
        ...novoPrazo,
        cnj: novoPrazo.processo?.numeroCnj || cnj || 'Avulso',
        cliente: novoPrazo.processo?.cliente?.nome || cliente || 'Silva & Associados',
        tribunal: novoPrazo.processo?.varaTribunal || tribunal || 'Tribunal de Justiça',
        tipo: novoPrazo.titulo,
        vencimento: novoPrazo.dataLimite.toLocaleDateString('pt-BR') + ' às 23:59',
        urgencia: prioridadeFinal,
        urgenciaColor,
        responsavel: novoPrazo.responsavel?.nome || 'Dr. Maycon Silva',
        cumprido: isCumprido,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updatePrazo = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;
    const { titulo, tipo, descricao, vencimento, dataLimite, urgencia, prioridade, status, responsavelId } = req.body;

    const prazoExistente = await prisma.prazo.findFirst({
      where: { id, sociedadeId },
    });

    if (!prazoExistente) {
      return res.status(404).json({
        success: false,
        message: 'Prazo não encontrado.',
      });
    }

    const dataLimiteFinal = dataLimite || vencimento ? parseDataLimite(vencimento, dataLimite) : prazoExistente.dataLimite;
    const prioridadeFinal = urgencia || prioridade ? parsePrioridade(urgencia || prioridade) : prazoExistente.prioridade;

    const atualizado = await prisma.prazo.update({
      where: { id },
      data: {
        titulo: tipo || titulo || prazoExistente.titulo,
        descricao: descricao !== undefined ? descricao : prazoExistente.descricao,
        dataLimite: dataLimiteFinal,
        prioridade: prioridadeFinal,
        status: status || prazoExistente.status,
        responsavelId: responsavelId ? parseInt(responsavelId, 10) : prazoExistente.responsavelId,
      },
      include: {
        processo: { include: { cliente: true } },
        responsavel: true,
      },
    });

    return res.json({
      success: true,
      message: 'Prazo atualizado com sucesso!',
      data: {
        ...atualizado,
        cnj: atualizado.processo?.numeroCnj,
        cliente: atualizado.processo?.cliente?.nome,
        tipo: atualizado.titulo,
        urgencia: atualizado.prioridade,
        cumprido: atualizado.status === 'CONCLUIDO',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const cumprirPrazo = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const prazo = await prisma.prazo.findFirst({
      where: { id, sociedadeId },
    });

    if (!prazo) {
      return res.status(404).json({
        success: false,
        message: 'Prazo não encontrado.',
      });
    }

    const cumprido = await prisma.prazo.update({
      where: { id },
      data: {
        status: 'CONCLUIDO',
        concluidoEm: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.user?.id || null,
        acao: 'CUMPRIR_PRAZO',
        entidade: 'Prazo',
        entidadeId: id,
        detalhes: { concluidoEm: cumprido.concluidoEm },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.json({
      success: true,
      message: 'Prazo protocolado e marcado como cumprido com sucesso!',
      data: cumprido,
    });
  } catch (error) {
    next(error);
  }
};

export const deletePrazo = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const prazo = await prisma.prazo.findFirst({
      where: { id, sociedadeId },
    });

    if (!prazo) {
      return res.status(404).json({
        success: false,
        message: 'Prazo não encontrado.',
      });
    }

    await prisma.prazo.delete({ where: { id } });

    return res.json({
      success: true,
      message: 'Prazo excluído com sucesso.',
    });
  } catch (error) {
    next(error);
  }
};

export const getPrazosStats = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;

    const agora = new Date();
    const finalDoDia = new Date();
    finalDoDia.setHours(23, 59, 59, 999);

    const [total, pendentes, concluidos, fatais] = await Promise.all([
      prisma.prazo.count({ where: { sociedadeId } }),
      prisma.prazo.count({ where: { sociedadeId, status: { not: 'CONCLUIDO' } } }),
      prisma.prazo.count({ where: { sociedadeId, status: 'CONCLUIDO' } }),
      prisma.prazo.count({
        where: {
          sociedadeId,
          status: { not: 'CONCLUIDO' },
          prioridade: 'Fatal',
        },
      }),
    ]);

    return res.json({
      success: true,
      data: {
        total,
        pendentes,
        concluidos,
        fatais,
      },
    });
  } catch (error) {
    next(error);
  }
};
