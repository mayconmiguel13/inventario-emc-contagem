import prisma from '../../config/database.js';

export const listAudiencias = async (req, res, next) => {
  try {
    const { search, processoId, formato, status, page = 1, limit = 50 } = req.query;
    const sociedadeId = req.sociedadeId;

    const where = {
      sociedadeId,
    };

    if (processoId) {
      where.processoId = parseInt(processoId, 10);
    }

    if (formato && formato !== 'Todos') {
      where.formato = formato;
    }

    if (status && status !== 'Todos') {
      where.status = status;
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { titulo: { contains: term } },
        { tipo: { contains: term } },
        { local: { contains: term } },
        { processo: { numeroCnj: { contains: term } } },
        { processo: { cliente: { nome: { contains: term } } } },
      ];
    }

    const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [total, audienciasRaw] = await Promise.all([
      prisma.audiencia.count({ where }),
      prisma.audiencia.findMany({
        where,
        take,
        skip,
        orderBy: { dataHora: 'asc' },
        include: {
          processo: {
            include: {
              cliente: { select: { id: true, nome: true } },
            },
          },
        },
      }),
    ]);

    // Mapear campos para compatibilidade com a tabela de Audiências na aba Agenda
    const audiencias = audienciasRaw.map((a) => {
      const dataHoraObj = new Date(a.dataHora);
      const dataFormatada = dataHoraObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const horaFormatada = String(dataHoraObj.getHours()).padStart(2, '0') + ':' + String(dataHoraObj.getMinutes()).padStart(2, '0');

      return {
        ...a,
        data: dataFormatada,
        hora: horaFormatada,
        processo: a.processo?.numeroCnj || 'Processo não identificado',
        cliente: a.processo?.cliente?.nome || 'Silva & Associados',
        parteContraria: a.processo?.parteContraria || 'Indeterminada',
        vara: a.processo?.varaTribunal || a.local || 'Vara Judicial',
        modalidade: a.formato || 'Presencial',
        linkSala: a.linkAcesso || '',
        endereco: a.local || '',
        advogado: 'Dr. Maycon Silva',
        orientacoes: a.observacoes || '',
      };
    });

    return res.json({
      success: true,
      total,
      page: parseInt(page, 10) || 1,
      limit: take,
      data: audiencias,
    });
  } catch (error) {
    next(error);
  }
};

export const getAudienciaById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const audiencia = await prisma.audiencia.findFirst({
      where: { id, sociedadeId },
      include: {
        processo: { include: { cliente: true } },
      },
    });

    if (!audiencia) {
      return res.status(404).json({
        success: false,
        message: 'Audiência não encontrada.',
      });
    }

    return res.json({
      success: true,
      data: audiencia,
    });
  } catch (error) {
    next(error);
  }
};

export const createAudiencia = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const {
      processoId,
      cnj,
      titulo,
      tipo = 'Instrução e Julgamento',
      formato = 'Presencial',
      linkAcesso,
      linkSala,
      local,
      endereco,
      dataHora,
      observacoes,
    } = req.body;

    let resolvedProcessoId = processoId ? parseInt(processoId, 10) : null;
    if (!resolvedProcessoId && cnj) {
      const proc = await prisma.processo.findFirst({
        where: { sociedadeId, numeroCnj: cnj.trim() },
      });
      if (proc) resolvedProcessoId = proc.id;
    }

    const dataHoraFinal = dataHora ? new Date(dataHora) : new Date(Date.now() + 86400000);

    const novaAudiencia = await prisma.audiencia.create({
      data: {
        sociedadeId,
        processoId: resolvedProcessoId,
        titulo: titulo || `${tipo} - Processo`,
        tipo: tipo || 'Instrução e Julgamento',
        formato: formato || 'Presencial',
        linkAcesso: linkAcesso || linkSala || null,
        local: local || endereco || null,
        dataHora: dataHoraFinal,
        observacoes: observacoes || null,
        status: 'Agendada',
      },
      include: {
        processo: { include: { cliente: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.user?.id || null,
        acao: 'CRIAR_AUDIENCIA',
        entidade: 'Audiencia',
        entidadeId: novaAudiencia.id,
        detalhes: { titulo: novaAudiencia.titulo, dataHora: novaAudiencia.dataHora },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Audiência agendada com sucesso!',
      data: novaAudiencia,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAudiencia = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;
    const { titulo, tipo, formato, linkAcesso, linkSala, local, dataHora, observacoes, status } = req.body;

    const audienciaExistente = await prisma.audiencia.findFirst({
      where: { id, sociedadeId },
    });

    if (!audienciaExistente) {
      return res.status(404).json({
        success: false,
        message: 'Audiência não encontrada.',
      });
    }

    const atualizada = await prisma.audiencia.update({
      where: { id },
      data: {
        titulo: titulo || audienciaExistente.titulo,
        tipo: tipo || audienciaExistente.tipo,
        formato: formato || audienciaExistente.formato,
        linkAcesso: linkAcesso !== undefined ? linkAcesso : linkSala !== undefined ? linkSala : audienciaExistente.linkAcesso,
        local: local !== undefined ? local : audienciaExistente.local,
        dataHora: dataHora ? new Date(dataHora) : audienciaExistente.dataHora,
        observacoes: observacoes !== undefined ? observacoes : audienciaExistente.observacoes,
        status: status || audienciaExistente.status,
      },
      include: {
        processo: { include: { cliente: true } },
      },
    });

    return res.json({
      success: true,
      message: 'Audiência atualizada com sucesso!',
      data: atualizada,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAudiencia = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const audiencia = await prisma.audiencia.findFirst({
      where: { id, sociedadeId },
    });

    if (!audiencia) {
      return res.status(404).json({
        success: false,
        message: 'Audiência não encontrada.',
      });
    }

    await prisma.audiencia.delete({ where: { id } });

    return res.json({
      success: true,
      message: 'Audiência cancelada/removida com sucesso.',
    });
  } catch (error) {
    next(error);
  }
};
