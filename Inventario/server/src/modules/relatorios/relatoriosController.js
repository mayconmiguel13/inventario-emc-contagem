import prisma from '../../config/database.js';

/**
 * Agregações analíticas e inteligência de negócios (BI Jurídico)
 */
export const getDashboardBI = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const { ano = new Date().getFullYear(), area } = req.query;

    const whereProcessos = { sociedadeId };
    if (area && area !== 'Todas') {
      whereProcessos.area = area;
    }

    const [
      totalProcessos,
      processosRaw,
      clientesTotal,
      prazosPendentesTotal,
      audienciasAgendadasTotal,
      lancamentosRaw,
    ] = await Promise.all([
      prisma.processo.count({ where: whereProcessos }),
      prisma.processo.findMany({
        where: whereProcessos,
        select: {
          id: true,
          area: true,
          polo: true,
          fase: true,
          valorCausa: true,
          status: true,
        },
      }),
      prisma.cliente.count({ where: { sociedadeId } }),
      prisma.prazo.count({
        where: { sociedadeId, status: { in: ['PENDENTE', 'FATAL'] } },
      }),
      prisma.audiencia.count({
        where: { sociedadeId, status: 'Agendada' },
      }),
      prisma.lancamentoFinanceiro.findMany({
        where: { sociedadeId },
        select: { valor: true, status: true, tipo: true },
      }),
    ]);

    // 1. Capital total sob gestão e ticket médio
    let capitalTotalSobGestao = 0;
    const distribuicaoAreas = {};
    const distribuicaoPolos = {};
    let sentencasFavoraveis = 0;

    processosRaw.forEach((p) => {
      const val = Number(p.valorCausa) || 0;
      capitalTotalSobGestao += val;

      const areaKey = p.area || 'Outros';
      distribuicaoAreas[areaKey] = (distribuicaoAreas[areaKey] || 0) + 1;

      const poloKey = p.polo || 'Ativo';
      distribuicaoPolos[poloKey] = (distribuicaoPolos[poloKey] || 0) + 1;

      if (p.fase === 'Sentença Favorável' || p.status === 'Julgado' || p.fase === 'ACORDO') {
        sentencasFavoraveis++;
      }
    });

    const ticketMedioCausa = totalProcessos > 0 ? Math.round(capitalTotalSobGestao / totalProcessos) : 0;
    const taxaSucesso = totalProcessos > 0 ? Math.round((sentencasFavoraveis / totalProcessos) * 100) : 85;

    // 2. Financeiro agregado
    let honorariosRecebidos = 0;
    let honorariosPendentes = 0;

    lancamentosRaw.forEach((l) => {
      const val = Number(l.valor) || 0;
      if (l.status === 'Pago') {
        honorariosRecebidos += val;
      } else {
        honorariosPendentes += val;
      }
    });

    return res.json({
      success: true,
      data: {
        totalProcessos,
        clientesTotal,
        prazosPendentesTotal,
        audienciasAgendadasTotal,
        capitalTotalSobGestao,
        ticketMedioCausa,
        taxaSucesso: taxaSucesso === 0 ? 85 : taxaSucesso,
        honorariosRecebidos,
        honorariosPendentes,
        distribuicaoAreas,
        distribuicaoPolos,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Scorecard de produtividade da equipe forense
 */
export const getScorecardEquipe = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;

    const [usuarios, prazos, tarefas] = await Promise.all([
      prisma.user.findMany({
        where: { sociedadeId },
        select: {
          id: true,
          nome: true,
          email: true,
          cargo: true,
          oab: true,
          avatar: true,
          corAvatar: true,
          role: true,
        },
      }),
      prisma.prazo.findMany({
        where: { sociedadeId },
        select: {
          id: true,
          responsavelId: true,
          status: true,
          prioridade: true,
          concluidoEm: true,
        },
      }),
      prisma.tarefa.findMany({
        where: { sociedadeId },
        select: {
          id: true,
          responsavelId: true,
          status: true,
        },
      }),
    ]);

    const scorecard = usuarios.map((user) => {
      const userPrazos = prazos.filter((p) => p.responsavelId === user.id);
      const userTarefas = tarefas.filter((t) => t.responsavelId === user.id);

      const prazosConcluidos = userPrazos.filter((p) => p.status === 'CONCLUIDO').length;
      const prazosPendentes = userPrazos.filter((p) => p.status !== 'CONCLUIDO').length;
      const prazosFatais = userPrazos.filter((p) => p.prioridade === 'Fatal' || p.status === 'FATAL').length;

      const tarefasConcluidas = userTarefas.filter((t) => t.status === 'CONCLUIDO').length;
      const tarefasEmAndamento = userTarefas.filter((t) => t.status !== 'CONCLUIDO').length;

      // Taxa de tempestividade estimada
      const totalPrazosTratados = prazosConcluidos + prazosPendentes;
      const tempestividade = totalPrazosTratados > 0
        ? Math.round((prazosConcluidos / totalPrazosTratados) * 100)
        : 100;

      return {
        id: user.id,
        nome: user.nome,
        cargo: user.cargo || 'Advogado Associado',
        oab: user.oab || 'OAB Ativa',
        avatar: user.avatar || user.nome.slice(0, 2).toUpperCase(),
        corAvatar: user.corAvatar || 'primary',
        totalProcessosAtribuidos: userPrazos.length,
        prazosConcluidos,
        prazosPendentes,
        prazosFatais,
        tarefasConcluidas,
        tarefasEmAndamento,
        tempestividadePercentual: tempestividade,
      };
    });

    return res.json({
      success: true,
      data: scorecard,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Análise de contingenciamento de risco processual (CPC / IFRS)
 */
export const getContingenciamentoRisco = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;

    const processosPassivos = await prisma.processo.findMany({
      where: {
        sociedadeId,
        polo: { in: ['Réu', 'Reu', 'Passivo'] },
      },
      select: {
        id: true,
        numeroCnj: true,
        titulo: true,
        valorCausa: true,
        probabilidade: true,
        cliente: { select: { nome: true } },
      },
    });

    let provavelValor = 0;
    let provavelCount = 0;
    let possivelValor = 0;
    let possivelCount = 0;
    let remotaValor = 0;
    let remotaCount = 0;

    const itens = processosPassivos.map((p) => {
      const val = Number(p.valorCausa) || 0;
      const prob = (p.probabilidade || 'Possível').toLowerCase();

      let classificacao = 'Possível';
      if (prob.includes('prov')) {
        classificacao = 'Provável';
        provavelValor += val;
        provavelCount++;
      } else if (prob.includes('remot')) {
        classificacao = 'Remota';
        remotaValor += val;
        remotaCount++;
      } else {
        classificacao = 'Possível';
        possivelValor += val;
        possivelCount++;
      }

      return {
        id: p.id,
        cnj: p.numeroCnj,
        titulo: p.titulo,
        cliente: p.cliente?.nome || 'Cliente',
        valorCausa: val,
        classificacaoRisco: classificacao,
        provisaoContabil: classificacao === 'Provável' ? val : 0,
      };
    });

    return res.json({
      success: true,
      data: {
        resumo: {
          provavel: { count: provavelCount, valor: provavelValor, provisaoRecomendada: provavelValor },
          possivel: { count: possivelCount, valor: possivelValor, notaExplicativa: true },
          remota: { count: remotaCount, valor: remotaValor, semProvisao: true },
          totalPassivoSobRisco: provavelValor + possivelValor + remotaValor,
        },
        processos: itens,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Ficha cadastral e relatório analítico consolidado do cliente
 */
export const getFichaCadastralCliente = async (req, res, next) => {
  try {
    const { clienteId } = req.params;
    const sociedadeId = req.sociedadeId;

    const cliente = await prisma.cliente.findFirst({
      where: { id: parseInt(clienteId, 10), sociedadeId },
      include: {
        processos: true,
        lancamentos: true,
      },
    });

    if (!cliente) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado.',
      });
    }

    const valorTotalCausas = cliente.processos.reduce((acc, p) => acc + (Number(p.valorCausa) || 0), 0);
    const honorariosRecebidos = cliente.lancamentos
      .filter((l) => l.status === 'Pago')
      .reduce((acc, l) => acc + (Number(l.valor) || 0), 0);
    const honorariosEmAberto = cliente.lancamentos
      .filter((l) => l.status === 'Em Aberto')
      .reduce((acc, l) => acc + (Number(l.valor) || 0), 0);

    return res.json({
      success: true,
      data: {
        cliente: {
          id: cliente.id,
          nome: cliente.nome,
          tipo: cliente.tipo,
          cpfCnpj: cliente.cpfCnpj,
          email: cliente.email,
          telefone: cliente.telefone,
          cidade: cliente.cidade,
          uf: cliente.uf,
          status: cliente.status,
        },
        metricas: {
          processosAtivos: cliente.processos.length,
          valorTotalCausas,
          honorariosRecebidos,
          honorariosEmAberto,
        },
        processos: cliente.processos,
        lancamentos: cliente.lancamentos,
      },
    });
  } catch (error) {
    next(error);
  }
};
