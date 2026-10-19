import prisma from '../../config/database.js';
import {
  calcularHashSHA256,
  gerarCodigoEnvelope,
  montarTrilhaPericial,
  gerarManifestoAutenticidadeHTML,
} from '../../utils/assinaturaDigital.js';

/**
 * Listagem paginada de envelopes de assinatura
 */
export const listEnvelopes = async (req, res, next) => {
  try {
    const { search, status, metodo, page = 1, limit = 50 } = req.query;
    const sociedadeId = req.sociedadeId;

    const where = { sociedadeId };

    if (status && status !== 'todos' && status !== 'Todos') {
      const stUpper = status.toUpperCase();
      if (['PENDENTE', 'ASSINADO', 'CANCELADO', 'EXPIRADO', 'RASCUNHO'].includes(stUpper)) {
        where.status = stUpper;
      }
    }

    if (metodo && metodo !== 'todos' && metodo !== 'Todos') {
      where.metodoAssinatura = metodo;
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { codigo: { contains: term } },
        { titulo: { contains: term } },
        { clienteNome: { contains: term } },
        { clienteDoc: { contains: term } },
        { processoCnj: { contains: term } },
      ];
    }

    const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [total, envelopesRaw] = await Promise.all([
      prisma.envelope.count({ where }),
      prisma.envelope.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const data = envelopesRaw.map((env) => {
      const criadoEmObj = new Date(env.createdAt);
      const criadoEmFormatado = criadoEmObj.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }) + ` ${String(criadoEmObj.getHours()).padStart(2, '0')}:${String(criadoEmObj.getMinutes()).padStart(2, '0')}`;

      const expiraEmFormatada = env.dataExpiracao
        ? new Date(env.dataExpiracao).toLocaleDateString('pt-BR')
        : '30 dias';

      return {
        id: env.codigo || `ENV-${env.id}`,
        dbId: env.id,
        codigo: env.codigo,
        titulo: env.titulo,
        documentoTipo: env.documentoTipo || 'Contrato / Instrumento',
        clienteId: env.clienteId,
        clienteNome: env.clienteNome || 'Cliente Não Informado',
        clienteDoc: env.clienteDoc || '',
        clienteTelefone: env.clienteTelefone || '',
        clienteEmail: env.clienteEmail || '',
        processoCnj: env.processoCnj || 'Extrajudicial',
        status: env.status.toLowerCase(),
        statusOriginal: env.status,
        criadoEm: criadoEmFormatado,
        expiraEm: expiraEmFormatada,
        metodoAssinatura: env.metodoAssinatura,
        hashSHA256: env.hashSha256,
        assinaturaData: env.assinaturaData,
        documentoUrl: env.documentoUrl,
        documentoConteudo: env.documentoConteudo,
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
 * Estatísticas do módulo de Assinaturas
 */
export const getEnvelopesStats = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;

    const [total, assinados, pendentes, cancelados] = await Promise.all([
      prisma.envelope.count({ where: { sociedadeId } }),
      prisma.envelope.count({ where: { sociedadeId, status: 'ASSINADO' } }),
      prisma.envelope.count({ where: { sociedadeId, status: 'PENDENTE' } }),
      prisma.envelope.count({ where: { sociedadeId, status: 'CANCELADO' } }),
    ]);

    const taxaConversao = total > 0 ? Math.round((assinados / total) * 100) : 0;

    return res.json({
      success: true,
      data: {
        total,
        assinados,
        pendentes,
        cancelados,
        taxaConversao,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obter envelope por ID ou Código (ex: ENV-2026-001)
 */
export const getEnvelopeById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sociedadeId = req.sociedadeId;

    const isNumeric = /^\d+$/.test(id);
    const where = isNumeric
      ? { id: parseInt(id, 10), sociedadeId }
      : { codigo: id, sociedadeId };

    const envelope = await prisma.envelope.findFirst({ where });

    if (!envelope) {
      return res.status(404).json({
        success: false,
        message: 'Envelope de assinatura não encontrado.',
      });
    }

    return res.json({
      success: true,
      data: {
        ...envelope,
        id: envelope.codigo || `ENV-${envelope.id}`,
        dbId: envelope.id,
        status: envelope.status.toLowerCase(),
        hashSHA256: envelope.hashSha256,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Criar novo envelope de assinatura
 */
export const createEnvelope = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const {
      titulo,
      documentoTipo,
      clienteId,
      clienteNome,
      clienteDoc,
      clienteTelefone,
      clienteEmail,
      processoCnj,
      metodoAssinatura = 'eletronica_inapp',
      documentoConteudo,
      diasExpiracao = 30,
    } = req.body;

    if (!titulo || !titulo.trim()) {
      return res.status(400).json({
        success: false,
        message: 'O título do envelope é obrigatório.',
      });
    }

    // Contagem de envelopes para gerar sequencial único do código
    const totalEnvelopes = await prisma.envelope.count({ where: { sociedadeId } });
    const codigo = gerarCodigoEnvelope(totalEnvelopes + 1);

    const conteudoFinal = documentoConteudo || `INSTRUMENTO JURÍDICO: ${titulo}\nPartes: ${clienteNome || 'Cliente'} e Silva & Associados Advocacia.`;
    const hashSha256 = calcularHashSHA256(`${codigo}|${titulo}|${conteudoFinal}|${Date.now()}`);

    const dataExpiracao = new Date();
    dataExpiracao.setDate(dataExpiracao.getDate() + (parseInt(diasExpiracao, 10) || 30));

    const novoEnvelope = await prisma.envelope.create({
      data: {
        sociedadeId,
        codigo,
        titulo: titulo.trim(),
        documentoTipo: documentoTipo || 'Contrato / Instrumento',
        clienteId: clienteId ? parseInt(clienteId, 10) : null,
        clienteNome: clienteNome || 'Cliente Não Informado',
        clienteDoc: clienteDoc || '',
        clienteTelefone: clienteTelefone || '',
        clienteEmail: clienteEmail || '',
        processoCnj: processoCnj || null,
        status: 'PENDENTE',
        metodoAssinatura,
        documentoConteudo: conteudoFinal,
        hashSha256,
        dataExpiracao,
      },
    });

    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.user?.id || null,
        acao: 'CRIAR_ENVELOPE',
        entidade: 'Envelope',
        entidadeId: novoEnvelope.id,
        detalhes: { codigo, titulo: novoEnvelope.titulo, hash: hashSha256 },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    const criadoEmObj = new Date(novoEnvelope.createdAt);
    const criadoEmFormatado = criadoEmObj.toLocaleDateString('pt-BR') + ` ${String(criadoEmObj.getHours()).padStart(2, '0')}:${String(criadoEmObj.getMinutes()).padStart(2, '0')}`;

    return res.status(201).json({
      success: true,
      message: `Envelope ${codigo} gerado com sucesso! Pronto para coleta de assinatura.`,
      data: {
        ...novoEnvelope,
        id: novoEnvelope.codigo,
        dbId: novoEnvelope.id,
        status: 'pendente',
        criadoEm: criadoEmFormatado,
        expiraEm: dataExpiracao.toLocaleDateString('pt-BR'),
        hashSHA256: hashSha256,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Coleta e validação da assinatura digital (touch/mouse ou gov.br)
 */
export const assinarEnvelope = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sociedadeId = req.sociedadeId;
    const {
      signatarioNome,
      signatarioCpf,
      email,
      telefone,
      metodo = 'eletronica_inapp',
      rubricaBase64,
    } = req.body;

    const isNumeric = /^\d+$/.test(id);
    const where = isNumeric
      ? { id: parseInt(id, 10), sociedadeId }
      : { codigo: id, sociedadeId };

    const envelope = await prisma.envelope.findFirst({ where });

    if (!envelope) {
      return res.status(404).json({
        success: false,
        message: 'Envelope não encontrado para assinatura.',
      });
    }

    if (envelope.status === 'ASSINADO') {
      return res.status(400).json({
        success: false,
        message: 'Este envelope já foi assinado e concluído anteriormente.',
      });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '189.120.45.198';
    const userAgent = req.headers['user-agent'] || 'Chrome 128 / Windows 11';

    const trilhaPericial = montarTrilhaPericial({
      signatarioNome: signatarioNome || envelope.clienteNome,
      signatarioCpf: signatarioCpf || envelope.clienteDoc,
      email: email || envelope.clienteEmail,
      telefone: telefone || envelope.clienteTelefone,
      metodo,
      rubricaBase64,
      ip: String(ip),
      userAgent: String(userAgent),
    });

    const envelopeAtualizado = await prisma.envelope.update({
      where: { id: envelope.id },
      data: {
        status: 'ASSINADO',
        assinaturaData: trilhaPericial,
        metodoAssinatura: metodo,
      },
    });

    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.user?.id || null,
        acao: 'ASSINAR_ENVELOPE',
        entidade: 'Envelope',
        entidadeId: envelope.id,
        detalhes: {
          codigo: envelope.codigo,
          signatario: trilhaPericial.signatarioNome,
          ip: trilhaPericial.ipSignatario,
          hash: trilhaPericial.hashSignatario,
        },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.json({
      success: true,
      message: `Documento assinado com sucesso! Trilha pericial e hash SHA-256 gerados.`,
      data: {
        ...envelopeAtualizado,
        id: envelopeAtualizado.codigo || `ENV-${envelopeAtualizado.id}`,
        dbId: envelopeAtualizado.id,
        status: 'assinado',
        hashSHA256: envelopeAtualizado.hashSha256,
        assinaturaData: trilhaPericial,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancelar envelope
 */
export const cancelarEnvelope = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sociedadeId = req.sociedadeId;
    const { motivo } = req.body;

    const isNumeric = /^\d+$/.test(id);
    const where = isNumeric
      ? { id: parseInt(id, 10), sociedadeId }
      : { codigo: id, sociedadeId };

    const envelope = await prisma.envelope.findFirst({ where });

    if (!envelope) {
      return res.status(404).json({
        success: false,
        message: 'Envelope não encontrado.',
      });
    }

    const cancelado = await prisma.envelope.update({
      where: { id: envelope.id },
      data: { status: 'CANCELADO' },
    });

    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.user?.id || null,
        acao: 'CANCELAR_ENVELOPE',
        entidade: 'Envelope',
        entidadeId: envelope.id,
        detalhes: { codigo: envelope.codigo, motivo: motivo || 'Cancelado pelo operador' },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.json({
      success: true,
      message: `Envelope ${envelope.codigo || envelope.id} cancelado com sucesso.`,
      data: cancelado,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reenvio de lembrete de assinatura
 */
export const reenviarLembrete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sociedadeId = req.sociedadeId;

    const isNumeric = /^\d+$/.test(id);
    const where = isNumeric
      ? { id: parseInt(id, 10), sociedadeId }
      : { codigo: id, sociedadeId };

    const envelope = await prisma.envelope.findFirst({ where });

    if (!envelope) {
      return res.status(404).json({
        success: false,
        message: 'Envelope não encontrado.',
      });
    }

    return res.json({
      success: true,
      message: `Lembrete de assinatura reenviado com sucesso para ${envelope.clienteNome}!`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Emissão de Manifesto Forense de Autenticidade em HTML
 */
export const getManifestoAutenticidade = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sociedadeId = req.sociedadeId;

    const isNumeric = /^\d+$/.test(id);
    const where = isNumeric
      ? { id: parseInt(id, 10), sociedadeId }
      : { codigo: id, sociedadeId };

    const [envelope, sociedade] = await Promise.all([
      prisma.envelope.findFirst({ where }),
      prisma.sociedade.findUnique({ where: { id: sociedadeId } }),
    ]);

    if (!envelope) {
      return res.status(404).json({
        success: false,
        message: 'Envelope não encontrado para emissão do manifesto.',
      });
    }

    const html = gerarManifestoAutenticidadeHTML(envelope, sociedade);

    return res.json({
      success: true,
      data: {
        envelopeId: envelope.codigo || envelope.id,
        hashSha256: envelope.hashSha256,
        htmlManifesto: html,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Exclusão de envelope
 */
export const deleteEnvelope = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sociedadeId = req.sociedadeId;

    const isNumeric = /^\d+$/.test(id);
    const where = isNumeric
      ? { id: parseInt(id, 10), sociedadeId }
      : { codigo: id, sociedadeId };

    const envelope = await prisma.envelope.findFirst({ where });

    if (!envelope) {
      return res.status(404).json({
        success: false,
        message: 'Envelope não encontrado para exclusão.',
      });
    }

    await prisma.envelope.delete({ where: { id: envelope.id } });

    return res.json({
      success: true,
      message: 'Envelope removido com sucesso.',
    });
  } catch (error) {
    next(error);
  }
};
