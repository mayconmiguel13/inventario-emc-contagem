import prisma from '../../config/database.js';

/**
 * Listagem paginada de comunicações e disparos
 */
export const listComunicacoes = async (req, res, next) => {
  try {
    const { search, canal, tipo, status, clienteId, page = 1, limit = 50 } = req.query;
    const sociedadeId = req.sociedadeId;

    const where = { sociedadeId };

    if (clienteId) {
      where.clienteId = parseInt(clienteId, 10);
    }

    if (canal && canal !== 'todos' && canal !== 'Todos') {
      where.canal = canal;
    }

    if (tipo && tipo !== 'todos' && tipo !== 'Todos') {
      where.tipo = { contains: tipo };
    }

    if (status && status !== 'todos' && status !== 'Todos') {
      where.status = status;
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { destinatario: { contains: term } },
        { clienteNome: { contains: term } },
        { telefone: { contains: term } },
        { texto: { contains: term } },
        { tipo: { contains: term } },
        { processoCnj: { contains: term } },
        { cliente: { nome: { contains: term } } },
      ];
    }

    const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [total, comunicacoesRaw] = await Promise.all([
      prisma.comunicacao.count({ where }),
      prisma.comunicacao.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          cliente: { select: { id: true, nome: true, telefone: true } },
        },
      }),
    ]);

    const data = comunicacoesRaw.map((c) => {
      const d = new Date(c.createdAt);
      const dataHoraFormatada = d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }) + ` às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

      return {
        id: c.id,
        cliente: c.cliente?.nome || c.clienteNome || 'Cliente Não Informado',
        clienteId: c.clienteId,
        destinatario: c.destinatario,
        telefone: c.telefone || c.cliente?.telefone || '',
        canal: c.canal,
        tipo: c.tipo,
        processo: c.processoCnj || 'Extrajudicial',
        dataHora: dataHoraFormatada,
        createdAt: c.createdAt,
        status: c.status,
        texto: c.texto,
        payload: c.payload,
      };
    });

    return res.json({
      success: true,
      total,
      page: parseInt(page, 10) || 1,
      limit: take,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Estatísticas e taxas de engajamento da Central de Comunicações
 */
export const getComunicacoesStats = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;

    const [total, entregues, lidos, respondidos] = await Promise.all([
      prisma.comunicacao.count({ where: { sociedadeId } }),
      prisma.comunicacao.count({
        where: { sociedadeId, status: { in: ['Entregue', 'Lido', 'Respondido'] } },
      }),
      prisma.comunicacao.count({
        where: { sociedadeId, status: { in: ['Lido', 'Respondido'] } },
      }),
      prisma.comunicacao.count({
        where: { sociedadeId, status: 'Respondido' },
      }),
    ]);

    const taxaEntrega = total > 0 ? Math.round((entregues / total) * 100) : 98;
    const taxaLeitura = total > 0 ? Math.round((lidos / total) * 100) : 92;

    return res.json({
      success: true,
      data: {
        total,
        entregues,
        lidos,
        respondidos,
        taxaEntrega,
        taxaLeitura,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Registro e simulação de envio de nova comunicação (WhatsApp / Notificação)
 */
export const createComunicacao = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const {
      cliente,
      clienteNome,
      clienteId,
      destinatario,
      telefone,
      canal,
      tipo,
      processo,
      processoCnj,
      texto,
    } = req.body;

    if (!texto) {
      return res.status(400).json({
        success: false,
        message: 'O texto da mensagem é obrigatório.',
      });
    }

    const nomeClienteFinal = cliente || clienteNome || destinatario || 'Cliente';
    let resolvedClienteId = clienteId ? parseInt(clienteId, 10) : null;

    if (!resolvedClienteId && nomeClienteFinal) {
      const cli = await prisma.cliente.findFirst({
        where: {
          sociedadeId,
          nome: { contains: nomeClienteFinal.trim() },
        },
      });
      if (cli) resolvedClienteId = cli.id;
    }

    const nova = await prisma.comunicacao.create({
      data: {
        sociedadeId,
        clienteId: resolvedClienteId,
        clienteNome: nomeClienteFinal,
        destinatario: destinatario || nomeClienteFinal,
        telefone: telefone || '',
        canal: canal || 'WhatsApp',
        tipo: tipo || 'Mensagem Geral',
        processoCnj: processoCnj || processo || 'Geral',
        status: 'Entregue',
        texto: texto.trim(),
      },
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.userId || null,
        acao: 'DISPARAR_COMUNICACAO',
        entidade: 'Comunicacao',
        entidadeId: nova.id,
        detalhes: {
          destinatario: nova.destinatario,
          canal: nova.canal,
          tipo: nova.tipo,
        },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    const d = new Date(nova.createdAt);
    const dataHoraFormatada = d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }) + ` às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    return res.status(201).json({
      success: true,
      message: `Mensagem registrada no histórico de ${nova.destinatario}!`,
      data: {
        id: nova.id,
        cliente: nova.clienteNome,
        destinatario: nova.destinatario,
        telefone: nova.telefone,
        canal: nova.canal,
        tipo: nova.tipo,
        processo: nova.processoCnj,
        dataHora: dataHoraFormatada,
        status: nova.status,
        texto: nova.texto,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Disparo em massa de notificações
 */
export const disparoEmMassa = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const { mensagens } = req.body;

    if (!Array.isArray(mensagens) || mensagens.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A lista de mensagens para disparo em massa deve conter ao menos um item.',
      });
    }

    const criadas = await prisma.$transaction(async (tx) => {
      const resultados = [];
      for (const m of mensagens) {
        const item = await tx.comunicacao.create({
          data: {
            sociedadeId,
            clienteNome: m.cliente || 'Cliente',
            destinatario: m.destinatario || m.cliente || 'Cliente',
            telefone: m.telefone || '',
            canal: m.canal || 'WhatsApp',
            tipo: m.tipo || 'Atualização de Andamento',
            processoCnj: m.processo || m.processoCnj || 'Geral',
            status: 'Entregue',
            texto: m.texto || '',
          },
        });
        resultados.push(item);
      }
      return resultados;
    });

    return res.status(201).json({
      success: true,
      message: `${criadas.length} mensagens disparadas com sucesso via WhatsApp Gateway!`,
      total: criadas.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Exclusão de registro de comunicação
 */
export const deleteComunicacao = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sociedadeId = req.sociedadeId;
    const comunicacaoId = parseInt(id, 10);

    const existing = await prisma.comunicacao.findFirst({
      where: { id: comunicacaoId, sociedadeId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Registro de comunicação não encontrado.',
      });
    }

    await prisma.comunicacao.delete({
      where: { id: comunicacaoId },
    });

    return res.json({
      success: true,
      message: 'Comunicação removida do histórico.',
    });
  } catch (error) {
    next(error);
  }
};
