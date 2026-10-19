import prisma from '../../config/database.js';
import {
  extrairDadosInteligentesDJEN,
  gerarHashCertidaoForense,
  montarCertidaoDigital,
} from '../../utils/extratorDJEN.js';

/**
 * Listagem paginada de publicações do DJEN com filtros avançados
 */
export const listPublicacoes = async (req, res, next) => {
  try {
    const {
      search,
      status,
      tribunal,
      urgencia,
      processoId,
      page = 1,
      limit = 50,
    } = req.query;
    const sociedadeId = req.sociedadeId;

    const where = { sociedadeId };

    if (processoId) {
      where.processoId = parseInt(processoId, 10);
    }

    if (status && status !== 'todas' && status !== 'Todas') {
      if (status.toLowerCase() === 'novas' || status.toLowerCase() === 'nova') {
        where.status = 'Nova';
      } else if (status.toLowerCase() === 'lidas' || status.toLowerCase() === 'lida') {
        where.status = 'Lida';
      } else if (status.toLowerCase() === 'prazo_gerado' || status === 'Prazo Gerado') {
        where.status = 'Prazo Gerado';
      } else {
        where.status = status;
      }
    }

    if (tribunal && tribunal !== 'todos' && tribunal !== 'Todos') {
      where.tribunal = { contains: tribunal };
    }

    if (urgencia && urgencia !== 'todos' && urgencia !== 'Todas') {
      where.urgencia = urgencia;
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { numeroCnj: { contains: term } },
        { teorPublicacao: { contains: term } },
        { tribunal: { contains: term } },
        { orgaoJulgador: { contains: term } },
        { processo: { titulo: { contains: term } } },
        { processo: { cliente: { nome: { contains: term } } } },
      ];
    }

    const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [total, publicacoesRaw] = await Promise.all([
      prisma.publicacaoDJEN.count({ where }),
      prisma.publicacaoDJEN.findMany({
        where,
        take,
        skip,
        orderBy: { dataPublicacao: 'desc' },
        include: {
          processo: {
            include: {
              cliente: { select: { id: true, nome: true } },
            },
          },
        },
      }),
    ]);

    // Mapear campos para compatibilidade direta com a tela de Publicações
    const data = publicacoesRaw.map((p) => {
      const dataPubObj = new Date(p.dataPublicacao);
      const dataFormatada = dataPubObj.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const dataHoraStr = `${dataFormatada} às ${String(dataPubObj.getHours()).padStart(2, '0')}:${String(dataPubObj.getMinutes()).padStart(2, '0')}`;

      const dataDispObj = p.dataDisponib ? new Date(p.dataDisponib) : dataPubObj;
      const dataDispFormatada = dataDispObj.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      return {
        id: p.id,
        cnj: p.numeroCnj,
        processoId: p.processoId,
        processoTitulo: p.processo?.titulo || 'Processo em Acompanhamento',
        cliente: p.processo?.cliente?.nome || 'Geral do Escritório',
        tribunal: p.tribunal,
        vara: p.orgaoJulgador || p.processo?.varaTribunal || 'Vara Judicial',
        orgaoJulgador: p.orgaoJulgador || p.processo?.varaTribunal || 'Vara Judicial',
        edicao: p.edicao || 'Caderno Judicial Eletrônico - DJEN',
        data: dataHoraStr,
        dataPublicacao: dataFormatada,
        dataDisponibilizacao: dataDispFormatada,
        teor: p.teorPublicacao,
        status: p.status,
        urgencia: p.urgencia,
        prazoSugerido: p.prazoSugerido,
        tipoAtoSugerido: p.tipoAtoSugerido,
        convertida: p.convertida,
        prazoVinculadoId: p.prazoVinculadoId,
        tarefaVinculadaId: p.tarefaVinculadaId,
        hashCertidao: p.hashCertidao,
        createdAt: p.createdAt,
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
 * Estatísticas do módulo DJEN
 */
export const getPublicacoesStats = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;

    const [total, novas, lidas, prazosGerados, fatais] = await Promise.all([
      prisma.publicacaoDJEN.count({ where: { sociedadeId } }),
      prisma.publicacaoDJEN.count({ where: { sociedadeId, status: 'Nova' } }),
      prisma.publicacaoDJEN.count({ where: { sociedadeId, status: 'Lida' } }),
      prisma.publicacaoDJEN.count({ where: { sociedadeId, status: 'Prazo Gerado' } }),
      prisma.publicacaoDJEN.count({ where: { sociedadeId, urgencia: 'Fatal' } }),
    ]);

    return res.json({
      success: true,
      data: {
        total,
        novas,
        lidas,
        prazosGerados,
        fatais,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Detalhes da publicação por ID
 */
export const getPublicacaoById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const publicacao = await prisma.publicacaoDJEN.findFirst({
      where: { id, sociedadeId },
      include: {
        processo: {
          include: { cliente: true },
        },
      },
    });

    if (!publicacao) {
      return res.status(404).json({
        success: false,
        message: 'Publicação não encontrada no acervo.',
      });
    }

    return res.json({
      success: true,
      data: publicacao,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Criação manual ou ingestão de publicação
 */
export const createPublicacao = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const {
      numeroCnj,
      cnj,
      processoId,
      tribunal = 'TJSP - Tribunal de Justiça de São Paulo',
      orgaoJulgador,
      edicao,
      teorPublicacao,
      teor,
      dataPublicacao,
      dataDisponib,
      prazoSugerido,
      tipoAtoSugerido,
      urgencia,
    } = req.body;

    const cnjFinal = (cnj || numeroCnj || '').trim();
    const teorFinal = (teor || teorPublicacao || '').trim();

    if (!cnjFinal || !teorFinal) {
      return res.status(400).json({
        success: false,
        message: 'Número do processo CNJ e teor da publicação são obrigatórios.',
      });
    }

    // Resolver processo pelo CNJ se não fornecido
    let resolvedProcessoId = processoId ? parseInt(processoId, 10) : null;
    if (!resolvedProcessoId && cnjFinal) {
      const proc = await prisma.processo.findFirst({
        where: { sociedadeId, numeroCnj: cnjFinal },
      });
      if (proc) resolvedProcessoId = proc.id;
    }

    // Extração automática via inteligência forense se não informada
    const dadosInteligentes = extrairDadosInteligentesDJEN(teorFinal);
    const prazoSugeridoFinal = prazoSugerido ? parseInt(prazoSugerido, 10) : dadosInteligentes.prazoSugerido;
    const tipoAtoFinal = tipoAtoSugerido || dadosInteligentes.tipoAto;
    const urgenciaFinal = urgencia || dadosInteligentes.urgencia;

    const dataPubFinal = dataPublicacao ? new Date(dataPublicacao) : new Date();
    const dataDispFinal = dataDisponib ? new Date(dataDisponib) : dataPubFinal;

    const hashCertidao = gerarHashCertidaoForense({
      cnj: cnjFinal,
      tribunal,
      dataPublicacao: dataPubFinal,
      teor: teorFinal,
      sociedadeId,
    });

    const novaPub = await prisma.publicacaoDJEN.create({
      data: {
        sociedadeId,
        processoId: resolvedProcessoId,
        numeroCnj: cnjFinal,
        tribunal,
        orgaoJulgador: orgaoJulgador || null,
        edicao: edicao || 'Caderno Judicial Eletrônico - DJEN Regular',
        dataPublicacao: dataPubFinal,
        dataDisponib: dataDispFinal,
        teorPublicacao: teorFinal,
        prazoSugerido: prazoSugeridoFinal,
        tipoAtoSugerido: tipoAtoFinal,
        urgencia: urgenciaFinal,
        status: 'Nova',
        hashCertidao,
      },
      include: {
        processo: { include: { cliente: true } },
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Publicação capturada e registrada com sucesso no acervo do DJEN!',
      data: novaPub,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Simulação de Sincronização Automatizada do DJEN (Varredura de Tribunais)
 */
export const sincronizarDJENHandler = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;

    // Buscar processos ativos do escritório para associar a publicações reais
    const processos = await prisma.processo.findMany({
      where: { sociedadeId },
      include: { cliente: true },
      take: 5,
    });

    const processoAlvo = processos.length > 0 ? processos[Math.floor(Math.random() * processos.length)] : null;
    const cnjAlvo = processoAlvo ? processoAlvo.numeroCnj : '0014285-44.2024.8.26.0100';
    const tribunalAlvo = processoAlvo?.varaTribunal || 'TJSP - 14ª Vara Cível da Comarca de SP';

    const modelosTeor = [
      `Vistos. Intime-se o autor/exequente sobre o resultado positivo parcial da penhora Sisbajud no prazo legal de 5 (cinco) dias, sob pena de extinção do cumprimento de sentença.`,
      `Decisão: Deferida a juntada de novos documentos. Diga a parte contrária no decêndio legal de 15 (quinze) dias úteis, apresentando réplica à contestação nos moldes do art. 351 do CPC.`,
      `Intimação do despacho: Manifestem-se as partes em 5 (cinco) dias sobre o laudo pericial apresentado pelo perito judicial, indicando eventuais quesitos elucidativos.`,
      `Publicação de Acórdão: Por unanimidade, negaram provimento ao recurso de apelação. Ficam os patronos intimados para eventual oposição de embargos de declaração no prazo improrrogável de 5 (cinco) dias.`,
    ];

    const teorSorteado = modelosTeor[Math.floor(Math.random() * modelosTeor.length)];
    const dadosInteligentes = extrairDadosInteligentesDJEN(teorSorteado);

    const agora = new Date();
    const hash = gerarHashCertidaoForense({
      cnj: cnjAlvo,
      tribunal: tribunalAlvo,
      dataPublicacao: agora,
      teor: teorSorteado,
      sociedadeId,
    });

    const novaPublicacao = await prisma.publicacaoDJEN.create({
      data: {
        sociedadeId,
        processoId: processoAlvo?.id || null,
        numeroCnj: cnjAlvo,
        tribunal: tribunalAlvo,
        orgaoJulgador: tribunalAlvo,
        edicao: `DJEN - Edição Eletrônica nº ${Math.floor(Math.random() * 900 + 3100)}/2026`,
        dataPublicacao: agora,
        dataDisponib: agora,
        teorPublicacao: teorSorteado,
        prazoSugerido: dadosInteligentes.prazoSugerido,
        tipoAtoSugerido: dadosInteligentes.tipoAto,
        urgencia: dadosInteligentes.urgencia,
        status: 'Nova',
        hashCertidao: hash,
      },
      include: {
        processo: { include: { cliente: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.user?.id || null,
        acao: 'SINCRONIZAR_DJEN',
        entidade: 'PublicacaoDJEN',
        entidadeId: novaPublicacao.id,
        detalhes: { cnj: cnjAlvo, teor: teorSorteado.substring(0, 100) },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.json({
      success: true,
      message: `Diário DJEN Sincronizado com Sucesso! 1 nova intimação judicial capturada para o processo ${cnjAlvo}.`,
      data: novaPublicacao,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Marca publicação individual como Lida / Nova
 */
export const alternarStatusLida = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;
    const { status } = req.body;

    const pub = await prisma.publicacaoDJEN.findFirst({
      where: { id, sociedadeId },
    });

    if (!pub) {
      return res.status(404).json({
        success: false,
        message: 'Publicação não encontrada.',
      });
    }

    const novoStatus = status || (pub.status === 'Nova' ? 'Lida' : 'Nova');

    const atualizada = await prisma.publicacaoDJEN.update({
      where: { id },
      data: { status: novoStatus },
    });

    return res.json({
      success: true,
      message: `Publicação marcada como '${novoStatus}'.`,
      data: atualizada,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Marca todas as publicações como Lidas
 */
export const marcarTodasLidas = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;

    const resultado = await prisma.publicacaoDJEN.updateMany({
      where: { sociedadeId, status: 'Nova' },
      data: { status: 'Lida' },
    });

    return res.json({
      success: true,
      message: `${resultado.count} publicações foram marcadas como lidas com sucesso.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Conversão direta inteligente de publicação em Prazo Fatal e Tarefa Kanban
 */
export const converterPublicacao = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;
    const { dadosPrazo, criarTarefa = true, dadosTarefa } = req.body;

    const publicacao = await prisma.publicacaoDJEN.findFirst({
      where: { id, sociedadeId },
      include: { processo: true },
    });

    if (!publicacao) {
      return res.status(404).json({
        success: false,
        message: 'Publicação não encontrada para conversão.',
      });
    }

    // Executar a criação do prazo, tarefa e atualização da publicação em uma única transação atômica
    const resultado = await prisma.$transaction(async (tx) => {
      // 1. Criar o Prazo Processual
      const dataLimite = dadosPrazo?.vencimento
        ? new Date(dadosPrazo.vencimento)
        : new Date(Date.now() + (publicacao.prazoSugerido || 15) * 86400000);

      const novoPrazo = await tx.prazo.create({
        data: {
          sociedadeId,
          processoId: publicacao.processoId,
          criadorId: req.user?.id || null,
          titulo: dadosPrazo?.tipo || publicacao.tipoAtoSugerido || 'Prazo Decorrente do DJEN',
          tipo: 'CPC',
          prioridade: dadosPrazo?.urgencia || publicacao.urgencia || 'Fatal',
          dataPublicacao: publicacao.dataPublicacao,
          dataLimite,
          diasPrazo: publicacao.prazoSugerido || 15,
          status: 'PENDENTE',
          descricao: `Prazo gerado automaticamente a partir de intimação no DJEN (${publicacao.numeroCnj}): ${publicacao.teorPublicacao.substring(0, 250)}...`,
        },
      });

      // 2. Criar a Tarefa Kanban (se solicitado)
      let novaTarefa = null;
      if (criarTarefa) {
        const tituloTarefa = dadosTarefa?.titulo || `Elaborar ${dadosPrazo?.tipo || publicacao.tipoAtoSugerido || 'Petição'}`;
        const responsavelNome = dadosTarefa?.responsavel || req.user?.nome || 'Dr. Maycon Silva';

        const subtarefas = [
          { id: Date.now() + 1, texto: 'Análise aprofundada da publicação judicial', concluida: true },
          { id: Date.now() + 2, texto: `Redação da peça (${novoPrazo.titulo})`, concluida: false },
          { id: Date.now() + 3, texto: 'Revisão técnica e aprovação pelo sócio coordenador', concluida: false },
          { id: Date.now() + 4, texto: 'Protocolo eletrônico no portal do Tribunal e recibo', concluida: false },
        ];

        const comentarios = [
          {
            id: 1,
            autor: 'Sistema DJEN',
            data: 'Agora',
            texto: `Tarefa originada a partir da intimação judicial nº ${publicacao.id} publicada no processo ${publicacao.numeroCnj}.`,
          },
        ];

        novaTarefa = await tx.tarefa.create({
          data: {
            sociedadeId,
            processoId: publicacao.processoId,
            criadorId: req.user?.id || null,
            titulo: tituloTarefa,
            descricao: dadosTarefa?.descricao || `Tarefa gerada diretamente do DJEN. Prazo fatal vinculado para ${dataLimite.toLocaleDateString('pt-BR')}.`,
            status: 'A_FAZER',
            prioridade: publicacao.urgencia === 'Fatal' ? 'fatal' : 'alta',
            dataLimite,
            etiquetas: {
              tipo: 'Petição Processual',
              subtarefas,
              comentarios,
            },
          },
        });
      }

      // 3. Atualizar a Publicação para 'Prazo Gerado'
      const publicacaoAtualizada = await tx.publicacaoDJEN.update({
        where: { id },
        data: {
          status: 'Prazo Gerado',
          convertida: true,
          prazoVinculadoId: novoPrazo.id,
          tarefaVinculadaId: novaTarefa?.id || null,
        },
      });

      return {
        prazo: novoPrazo,
        tarefa: novaTarefa,
        publicacao: publicacaoAtualizada,
      };
    });

    return res.json({
      success: true,
      message: `Publicação convertida com sucesso em Prazo Fatal${resultado.tarefa ? ' e Tarefa adicionada ao Kanban!' : '!'}`,
      data: resultado,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Emissão de Certidão Digital de Publicação Forense (com Hash SHA-256 e Carimbo do Tempo)
 */
export const getCertidaoPublicacao = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const [publicacao, sociedade, usuarioEmissor] = await Promise.all([
      prisma.publicacaoDJEN.findFirst({
        where: { id, sociedadeId },
        include: { processo: { include: { cliente: true } } },
      }),
      prisma.sociedade.findUnique({ where: { id: sociedadeId } }),
      prisma.user.findUnique({ where: { id: req.user?.id || 1 } }),
    ]);

    if (!publicacao) {
      return res.status(404).json({
        success: false,
        message: 'Publicação não encontrada.',
      });
    }

    const certidao = montarCertidaoDigital(publicacao, sociedade, usuarioEmissor);

    return res.json({
      success: true,
      data: certidao,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Exclusão de publicação da triagem
 */
export const deletePublicacao = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sociedadeId = req.sociedadeId;

    const publicacao = await prisma.publicacaoDJEN.findFirst({
      where: { id, sociedadeId },
    });

    if (!publicacao) {
      return res.status(404).json({
        success: false,
        message: 'Publicação não encontrada para exclusão.',
      });
    }

    await prisma.publicacaoDJEN.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.user?.id || null,
        acao: 'EXCLUIR_PUBLICACAO_DJEN',
        entidade: 'PublicacaoDJEN',
        entidadeId: id,
        detalhes: { cnj: publicacao.numeroCnj, tribunal: publicacao.tribunal },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.json({
      success: true,
      message: 'Publicação removida da triagem do DJEN com sucesso.',
    });
  } catch (error) {
    next(error);
  }
};
