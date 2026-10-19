import prisma from '../../config/database.js';

// Auxiliar para converter status do frontend ("a_fazer", "em_andamento") para o Enum Prisma
const mapStatusToPrisma = (st) => {
  if (!st) return 'A_FAZER';
  const clean = st.toLowerCase().replace('-', '_');
  if (clean === 'a_fazer' || clean === 'backlog') return 'A_FAZER';
  if (clean === 'em_andamento' || clean === 'executando') return 'EM_ANDAMENTO';
  if (clean === 'revisao') return 'REVISAO';
  if (clean === 'concluido' || clean === 'finalizado') return 'CONCLUIDO';
  return 'A_FAZER';
};

// Auxiliar para converter Enum Prisma ("A_FAZER") para o status do frontend ("a_fazer")
const mapStatusToFrontend = (st) => {
  if (!st) return 'a_fazer';
  return st.toLowerCase();
};

export const listTarefas = async (req, res, next) => {
  try {
    const { search, status, prioridade, processoId, responsavelId, page = 1, limit = 100 } = req.query;
    const sociedadeId = req.sociedadeId;

    const where = {
      sociedadeId,
    };

    if (status && status !== 'Todos') {
      where.status = mapStatusToPrisma(status);
    }

    if (prioridade && prioridade !== 'Todas') {
      where.prioridade = { contains: prioridade };
    }

    if (processoId) {
      where.processoId = parseInt(processoId, 10);
    }

    if (responsavelId) {
      where.responsavelId = parseInt(responsavelId, 10);
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

    const take = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [total, tarefasRaw] = await Promise.all([
      prisma.tarefa.count({ where }),
      prisma.tarefa.findMany({
        where,
        take,
        skip,
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
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

    // Mapear campos para compatibilidade imediata com o Kanban do frontend
    const tarefas = tarefasRaw.map((t) => {
      const metadata = t.etiquetas && typeof t.etiquetas === 'object' ? t.etiquetas : {};
      const subtarefas = Array.isArray(metadata.subtarefas) ? metadata.subtarefas : [];
      const comentarios = Array.isArray(metadata.comentarios) ? metadata.comentarios : [];

      let dataLimiteFormatada = 'Sem prazo';
      if (t.dataLimite) {
        const d = new Date(t.dataLimite);
        dataLimiteFormatada = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      }

      return {
        ...t,
        id: t.id,
        titulo: t.titulo,
        descricao: t.descricao || '',
        status: mapStatusToFrontend(t.status),
        prioridade: (t.prioridade || 'media').toLowerCase(),
        tipo: metadata.tipo || 'Petição Processual',
        processoId: t.processoId,
        cnj: t.processo?.numeroCnj || 'Fase Administrativa',
        cliente: t.processo?.cliente?.nome || 'Geral',
        responsavel: t.responsavel?.nome || 'Dr. Maycon Silva',
        responsavelAvatar: t.responsavel?.avatar || 'MS',
        dataLimite: dataLimiteFormatada,
        dataLimiteISO: t.dataLimite,
        subtarefas,
        comentarios,
      };
    });

    return res.json({
      success: true,
      total,
      data: tarefas,
    });
  } catch (error) {
    next(error);
  }
};

export const getTarefaById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const tarefa = await prisma.tarefa.findFirst({
      where: { id, sociedadeId },
      include: {
        processo: { include: { cliente: true } },
        responsavel: true,
      },
    });

    if (!tarefa) {
      return res.status(404).json({
        success: false,
        message: 'Tarefa não encontrada.',
      });
    }

    return res.json({
      success: true,
      data: {
        ...tarefa,
        status: mapStatusToFrontend(tarefa.status),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createTarefa = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const {
      titulo,
      descricao,
      status = 'a_fazer',
      prioridade = 'media',
      dataLimite,
      processoId,
      cnj,
      responsavelId,
      subtarefas = [],
      comentarios = [],
      tipo,
    } = req.body;

    if (!titulo) {
      return res.status(400).json({
        success: false,
        message: 'O título da tarefa é obrigatório.',
      });
    }

    let resolvedProcessoId = processoId ? parseInt(processoId, 10) : null;
    if (!resolvedProcessoId && cnj) {
      const proc = await prisma.processo.findFirst({
        where: { sociedadeId, numeroCnj: cnj.trim() },
      });
      if (proc) resolvedProcessoId = proc.id;
    }

    const etiquetasFinal = {
      tipo: tipo || 'Petição Processual',
      subtarefas: Array.isArray(subtarefas) ? subtarefas : [],
      comentarios: Array.isArray(comentarios) ? comentarios : [],
    };

    const novaTarefa = await prisma.tarefa.create({
      data: {
        sociedadeId,
        processoId: resolvedProcessoId,
        responsavelId: responsavelId ? parseInt(responsavelId, 10) : req.user?.id || null,
        criadorId: req.user?.id || null,
        titulo: titulo.trim(),
        descricao: descricao || null,
        status: mapStatusToPrisma(status),
        prioridade: prioridade.toLowerCase(),
        dataLimite: dataLimite ? new Date(dataLimite) : null,
        etiquetas: etiquetasFinal,
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
        acao: 'CRIAR_TAREFA',
        entidade: 'Tarefa',
        entidadeId: novaTarefa.id,
        detalhes: { titulo: novaTarefa.titulo, status: novaTarefa.status },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.status(201).json({
      success: true,
      message: `Tarefa '${novaTarefa.titulo}' criada com sucesso!`,
      data: {
        ...novaTarefa,
        status: mapStatusToFrontend(novaTarefa.status),
        cnj: novaTarefa.processo?.numeroCnj || 'Fase Administrativa',
        cliente: novaTarefa.processo?.cliente?.nome || 'Geral',
        responsavel: novaTarefa.responsavel?.nome || 'Dr. Maycon Silva',
        responsavelAvatar: novaTarefa.responsavel?.avatar || 'MS',
        subtarefas: etiquetasFinal.subtarefas,
        comentarios: etiquetasFinal.comentarios,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateTarefaStatus = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status não fornecido para atualização.',
      });
    }

    const tarefa = await prisma.tarefa.findFirst({
      where: { id, sociedadeId },
    });

    if (!tarefa) {
      return res.status(404).json({
        success: false,
        message: 'Tarefa não encontrada.',
      });
    }

    const prismaStatus = mapStatusToPrisma(status);

    const atualizada = await prisma.tarefa.update({
      where: { id },
      data: { status: prismaStatus },
    });

    return res.json({
      success: true,
      message: `Status atualizado para '${status}' com sucesso!`,
      data: {
        ...atualizada,
        status: mapStatusToFrontend(atualizada.status),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateTarefa = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;
    const { titulo, descricao, status, prioridade, dataLimite, subtarefas, comentarios, tipo, responsavelId } = req.body;

    const tarefaExistente = await prisma.tarefa.findFirst({
      where: { id, sociedadeId },
    });

    if (!tarefaExistente) {
      return res.status(404).json({
        success: false,
        message: 'Tarefa não encontrada.',
      });
    }

    const currentEtiquetas = tarefaExistente.etiquetas && typeof tarefaExistente.etiquetas === 'object' ? tarefaExistente.etiquetas : {};
    const etiquetasAtualizadas = {
      ...currentEtiquetas,
      tipo: tipo !== undefined ? tipo : currentEtiquetas.tipo || 'Petição Processual',
      subtarefas: subtarefas !== undefined ? subtarefas : currentEtiquetas.subtarefas || [],
      comentarios: comentarios !== undefined ? comentarios : currentEtiquetas.comentarios || [],
    };

    const atualizada = await prisma.tarefa.update({
      where: { id },
      data: {
        titulo: titulo || tarefaExistente.titulo,
        descricao: descricao !== undefined ? descricao : tarefaExistente.descricao,
        status: status ? mapStatusToPrisma(status) : tarefaExistente.status,
        prioridade: prioridade ? prioridade.toLowerCase() : tarefaExistente.prioridade,
        dataLimite: dataLimite !== undefined ? (dataLimite ? new Date(dataLimite) : null) : tarefaExistente.dataLimite,
        responsavelId: responsavelId ? parseInt(responsavelId, 10) : tarefaExistente.responsavelId,
        etiquetas: etiquetasAtualizadas,
      },
      include: {
        processo: { include: { cliente: true } },
        responsavel: true,
      },
    });

    return res.json({
      success: true,
      message: 'Tarefa atualizada com sucesso!',
      data: {
        ...atualizada,
        status: mapStatusToFrontend(atualizada.status),
        subtarefas: etiquetasAtualizadas.subtarefas,
        comentarios: etiquetasAtualizadas.comentarios,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTarefa = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const tarefa = await prisma.tarefa.findFirst({
      where: { id, sociedadeId },
    });

    if (!tarefa) {
      return res.status(404).json({
        success: false,
        message: 'Tarefa não encontrada.',
      });
    }

    await prisma.tarefa.delete({ where: { id } });

    return res.json({
      success: true,
      message: 'Tarefa removida com sucesso.',
    });
  } catch (error) {
    next(error);
  }
};

export const getTarefasStats = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;

    const [total, aFazer, emAndamento, revisao, concluido] = await Promise.all([
      prisma.tarefa.count({ where: { sociedadeId } }),
      prisma.tarefa.count({ where: { sociedadeId, status: 'A_FAZER' } }),
      prisma.tarefa.count({ where: { sociedadeId, status: 'EM_ANDAMENTO' } }),
      prisma.tarefa.count({ where: { sociedadeId, status: 'REVISAO' } }),
      prisma.tarefa.count({ where: { sociedadeId, status: 'CONCLUIDO' } }),
    ]);

    return res.json({
      success: true,
      data: {
        total,
        a_fazer: aFazer,
        em_andamento: emAndamento,
        revisao,
        concluido,
      },
    });
  } catch (error) {
    next(error);
  }
};
