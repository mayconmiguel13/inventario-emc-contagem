import prisma from '../../config/database.js';
import { calcularHashSHA256 } from '../../utils/assinaturaDigital.js';

export const listDocumentos = async (req, res, next) => {
  try {
    const { search, tipo, status, processoId, page = 1, limit = 50 } = req.query;
    const sociedadeId = req.sociedadeId;

    const where = { sociedadeId };

    if (processoId) {
      where.processoId = parseInt(processoId, 10);
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
        { titulo: { contains: term } },
        { tipo: { contains: term } },
        { autor: { contains: term } },
        { conteudo: { contains: term } },
        { processo: { numeroCnj: { contains: term } } },
        { processo: { cliente: { nome: { contains: term } } } },
      ];
    }

    const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [total, docsRaw] = await Promise.all([
      prisma.documento.count({ where }),
      prisma.documento.findMany({
        where,
        take,
        skip,
        orderBy: { updatedAt: 'desc' },
        include: {
          processo: {
            include: {
              cliente: { select: { id: true, nome: true } },
            },
          },
        },
      }),
    ]);

    const data = docsRaw.map((d) => {
      const dataModObj = new Date(d.updatedAt);
      const dataModFormatada = dataModObj.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }) + ` às ${String(dataModObj.getHours()).padStart(2, '0')}:${String(dataModObj.getMinutes()).padStart(2, '0')}`;

      return {
        id: d.id,
        titulo: d.titulo,
        processo: d.processo?.numeroCnj || 'Interno / Geral',
        processoId: d.processoId,
        cliente: d.processo?.cliente?.nome || 'Escritório',
        tipo: d.tipo,
        tamanho: d.tamanho || (d.tamanhoBytes ? `${(d.tamanhoBytes / 1024 / 1024).toFixed(1)} MB` : '1.2 MB'),
        dataMod: dataModFormatada,
        autor: d.autor || 'Dr. Maycon Silva',
        status: d.status,
        conteudo: d.conteudo || '',
        versao: d.versao,
        hashSha256: d.hashSha256,
        urlArquivo: d.urlArquivo,
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

export const getDocumentosStats = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;

    const [total, peticoes, contratos, minutas] = await Promise.all([
      prisma.documento.count({ where: { sociedadeId } }),
      prisma.documento.count({
        where: { sociedadeId, tipo: { contains: 'Peti' } },
      }),
      prisma.documento.count({
        where: { sociedadeId, tipo: { contains: 'Contrato' } },
      }),
      prisma.documento.count({
        where: { sociedadeId, status: { contains: 'Minuta' } },
      }),
    ]);

    return res.json({
      success: true,
      data: {
        total,
        peticoes,
        contratos,
        minutas,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getDocumentoById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const doc = await prisma.documento.findFirst({
      where: { id, sociedadeId },
      include: {
        processo: { include: { cliente: true } },
      },
    });

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Documento não encontrado no repositório.',
      });
    }

    return res.json({
      success: true,
      data: doc,
    });
  } catch (error) {
    next(error);
  }
};

export const createDocumento = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const {
      titulo,
      processoId,
      cnj,
      processo,
      tipo = 'Petição (DOCX)',
      conteudo,
      autor,
      status = 'Pronta para Protocolo',
      tamanho,
      urlArquivo,
    } = req.body;

    if (!titulo || !titulo.trim()) {
      return res.status(400).json({
        success: false,
        message: 'O título do documento é obrigatório.',
      });
    }

    let resolvedProcessoId = processoId ? parseInt(processoId, 10) : null;
    const procIdentificador = cnj || processo;
    if (!resolvedProcessoId && procIdentificador && procIdentificador !== 'Interno / Geral') {
      const proc = await prisma.processo.findFirst({
        where: { sociedadeId, numeroCnj: procIdentificador.trim() },
      });
      if (proc) resolvedProcessoId = proc.id;
    }

    const conteudoTexto = conteudo || '';
    const hashSha256 = calcularHashSHA256(`${titulo}|${conteudoTexto}|${Date.now()}`);

    const novoDoc = await prisma.documento.create({
      data: {
        sociedadeId,
        processoId: resolvedProcessoId,
        titulo: titulo.trim(),
        tipo,
        conteudo: conteudoTexto,
        autor: autor || req.user?.nome || 'Dr. Maycon Silva',
        status,
        tamanho: tamanho || '1.2 MB',
        tamanhoBytes: conteudoTexto.length,
        hashSha256,
        urlArquivo: urlArquivo || null,
        versao: 1,
      },
      include: {
        processo: { include: { cliente: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.user?.id || null,
        acao: 'CRIAR_DOCUMENTO',
        entidade: 'Documento',
        entidadeId: novoDoc.id,
        detalhes: { titulo: novoDoc.titulo, tipo: novoDoc.tipo, hash: hashSha256 },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.status(201).json({
      success: true,
      message: `Documento "${novoDoc.titulo}" adicionado ao repositório forense!`,
      data: {
        ...novoDoc,
        processo: novoDoc.processo?.numeroCnj || 'Interno / Geral',
        cliente: novoDoc.processo?.cliente?.nome || 'Escritório',
        dataMod: 'Hoje, ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateDocumento = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;
    const { titulo, tipo, conteudo, status, autor } = req.body;

    const docExistente = await prisma.documento.findFirst({
      where: { id, sociedadeId },
    });

    if (!docExistente) {
      return res.status(404).json({
        success: false,
        message: 'Documento não encontrado para atualização.',
      });
    }

    const novoConteudo = conteudo !== undefined ? conteudo : docExistente.conteudo;
    const novoHash = conteudo !== undefined ? calcularHashSHA256(novoConteudo) : docExistente.hashSha256;

    const atualizado = await prisma.documento.update({
      where: { id },
      data: {
        titulo: titulo || docExistente.titulo,
        tipo: tipo || docExistente.tipo,
        conteudo: novoConteudo,
        status: status || docExistente.status,
        autor: autor || docExistente.autor,
        versao: docExistente.versao + 1,
        hashSha256: novoHash,
      },
      include: {
        processo: { include: { cliente: true } },
      },
    });

    return res.json({
      success: true,
      message: 'Documento atualizado com nova versão gerada!',
      data: atualizado,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteDocumento = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const doc = await prisma.documento.findFirst({
      where: { id, sociedadeId },
    });

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Documento não encontrado para exclusão.',
      });
    }

    await prisma.documento.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.user?.id || null,
        acao: 'EXCLUIR_DOCUMENTO',
        entidade: 'Documento',
        entidadeId: id,
        detalhes: { titulo: doc.titulo, tipo: doc.tipo },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.json({
      success: true,
      message: 'Documento removido do repositório forense.',
    });
  } catch (error) {
    next(error);
  }
};
