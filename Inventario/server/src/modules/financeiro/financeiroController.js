import prisma from '../../config/database.js';

/**
 * Utilitário para conversão flexível de valores monetários
 */
const parseMonetaryValue = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^\d,-]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

/**
 * Utilitário para parse flexível de datas (DD/MM/AAAA ou ISO)
 */
const parseFlexibleDate = (dataStr) => {
  if (!dataStr) return new Date();
  if (dataStr instanceof Date) return dataStr;

  // Formato brasileiro DD/MM/AAAA
  if (typeof dataStr === 'string' && dataStr.includes('/')) {
    const parts = dataStr.trim().split('/');
    if (parts.length === 3) {
      const dia = parseInt(parts[0], 10);
      const mes = parseInt(parts[1], 10) - 1;
      const ano = parseInt(parts[2], 10);
      const d = new Date(ano, mes, dia);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const d = new Date(dataStr);
  return isNaN(d.getTime()) ? new Date() : d;
};

/**
 * Listagem de lançamentos financeiros com busca, filtros e paginação
 */
export const listLancamentos = async (req, res, next) => {
  try {
    const { search, status, tipo, clienteId, processoId, page = 1, limit = 50 } = req.query;
    const sociedadeId = req.sociedadeId;

    const where = { sociedadeId };

    if (clienteId) {
      where.clienteId = parseInt(clienteId, 10);
    }

    if (processoId) {
      where.processoId = parseInt(processoId, 10);
    }

    if (status && status !== 'todos' && status !== 'Todos') {
      where.status = status;
    }

    if (tipo && tipo !== 'todos' && tipo !== 'Todos') {
      where.tipo = { contains: tipo };
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { descricao: { contains: term } },
        { tipo: { contains: term } },
        { categoria: { contains: term } },
        { formaPagamento: { contains: term } },
        { clienteNome: { contains: term } },
        { processoCnj: { contains: term } },
        { cliente: { nome: { contains: term } } },
        { processo: { numeroCnj: { contains: term } } },
      ];
    }

    const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [total, lancamentosRaw] = await Promise.all([
      prisma.lancamentoFinanceiro.count({ where }),
      prisma.lancamentoFinanceiro.findMany({
        where,
        take,
        skip,
        orderBy: { dataVencimento: 'desc' },
        include: {
          cliente: { select: { id: true, nome: true, cpfCnpj: true } },
          processo: { select: { id: true, numeroCnj: true, titulo: true } },
        },
      }),
    ]);

    const data = lancamentosRaw.map((l) => {
      const vencimentoFormatado = new Date(l.dataVencimento).toLocaleDateString('pt-BR');
      const pagamentoFormatado = l.dataPagamento
        ? new Date(l.dataPagamento).toLocaleDateString('pt-BR')
        : null;

      return {
        id: l.id,
        cliente: l.cliente?.nome || l.clienteNome || 'Cliente Não Informado',
        clienteId: l.clienteId || l.cliente?.id || null,
        clienteDoc: l.cliente?.cpfCnpj || null,
        processo: l.processo?.numeroCnj || l.processoCnj || 'Interno / Administrativo',
        processoId: l.processoId || l.processo?.id || null,
        processoTitulo: l.processo?.titulo || null,
        descricao: l.descricao,
        tipo: l.tipo,
        categoria: l.categoria || l.tipo,
        valor: Number(l.valor),
        vencimento: vencimentoFormatado,
        dataVencimento: l.dataVencimento,
        dataPagamento: pagamentoFormatado,
        status: l.status,
        formaPagamento: l.formaPagamento || 'Pix',
        comprovanteUrl: l.comprovanteUrl,
        observacoes: l.observacoes || '',
        createdAt: l.createdAt,
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
 * Estatísticas consolidadas e fluxo de caixa da controladoria jurídica
 */
export const getLancamentosStats = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;

    const lancamentos = await prisma.lancamentoFinanceiro.findMany({
      where: { sociedadeId },
      select: {
        valor: true,
        status: true,
        tipo: true,
        dataVencimento: true,
      },
    });

    const hoje = new Date();

    let recebido = 0;
    let aReceber = 0;
    let pendentesCount = 0;
    let atrasadosCount = 0;

    const distribuicaoTipos = {};

    lancamentos.forEach((l) => {
      const val = Number(l.valor) || 0;
      const st = l.status;

      // Classificação por status
      if (st === 'Pago') {
        recebido += val;
      } else if (st === 'Em Aberto' || st === 'Pendente') {
        aReceber += val;
        pendentesCount++;

        // Checar se está atrasado
        if (new Date(l.dataVencimento) < hoje) {
          atrasadosCount++;
        }
      } else if (st === 'Atrasado') {
        aReceber += val;
        atrasadosCount++;
        pendentesCount++;
      }

      // Distribuição por tipo de honorário
      const tipoKey = l.tipo || 'Outros';
      distribuicaoTipos[tipoKey] = (distribuicaoTipos[tipoKey] || 0) + val;
    });

    return res.json({
      success: true,
      data: {
        recebido,
        aReceber,
        totalGeral: recebido + aReceber,
        pendentesCount,
        atrasadosCount,
        distribuicaoTipos,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Detalhes de um lançamento financeiro específico
 */
export const getLancamentoById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sociedadeId = req.sociedadeId;

    const lancamento = await prisma.lancamentoFinanceiro.findFirst({
      where: { id: parseInt(id, 10), sociedadeId },
      include: {
        cliente: true,
        processo: true,
      },
    });

    if (!lancamento) {
      return res.status(404).json({
        success: false,
        message: 'Lançamento financeiro não encontrado.',
      });
    }

    return res.json({
      success: true,
      data: {
        id: lancamento.id,
        cliente: lancamento.cliente?.nome || lancamento.clienteNome || 'Cliente Não Informado',
        clienteId: lancamento.clienteId,
        clienteDoc: lancamento.cliente?.cpfCnpj || null,
        processo: lancamento.processo?.numeroCnj || lancamento.processoCnj || 'Interno / Administrativo',
        processoId: lancamento.processoId,
        processoTitulo: lancamento.processo?.titulo || null,
        descricao: lancamento.descricao,
        tipo: lancamento.tipo,
        categoria: lancamento.categoria,
        valor: Number(lancamento.valor),
        vencimento: new Date(lancamento.dataVencimento).toLocaleDateString('pt-BR'),
        dataVencimento: lancamento.dataVencimento,
        dataPagamento: lancamento.dataPagamento ? new Date(lancamento.dataPagamento).toLocaleDateString('pt-BR') : null,
        status: lancamento.status,
        formaPagamento: lancamento.formaPagamento,
        comprovanteUrl: lancamento.comprovanteUrl,
        observacoes: lancamento.observacoes,
        createdAt: lancamento.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Criação de novo lançamento financeiro
 */
export const createLancamento = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const {
      clienteId,
      clienteNome,
      cliente,
      processoId,
      processoCnj,
      processo,
      descricao,
      tipo,
      categoria,
      valor,
      vencimento,
      dataVencimento,
      formaPagamento,
      observacoes,
      status,
    } = req.body;

    if (!descricao) {
      return res.status(400).json({
        success: false,
        message: 'A descrição do lançamento é obrigatória.',
      });
    }

    const valorNumerico = parseMonetaryValue(valor);
    const dataVenc = parseFlexibleDate(dataVencimento || vencimento);

    // Tentar resolver clienteId se não fornecido mas nome fornecido
    let resolvedClienteId = clienteId ? parseInt(clienteId, 10) : null;
    const nomeClienteFinal = cliente || clienteNome || null;

    if (!resolvedClienteId && nomeClienteFinal) {
      const cliExistente = await prisma.cliente.findFirst({
        where: {
          sociedadeId,
          nome: { contains: nomeClienteFinal.trim() },
        },
      });
      if (cliExistente) resolvedClienteId = cliExistente.id;
    }

    // Tentar resolver processoId se não fornecido mas CNJ fornecido
    let resolvedProcessoId = processoId ? parseInt(processoId, 10) : null;
    const cnjFinal = processoCnj || processo || null;

    if (!resolvedProcessoId && cnjFinal && cnjFinal.includes('.')) {
      const procExistente = await prisma.processo.findFirst({
        where: {
          sociedadeId,
          numeroCnj: { contains: cnjFinal.trim() },
        },
      });
      if (procExistente) resolvedProcessoId = procExistente.id;
    }

    const novo = await prisma.lancamentoFinanceiro.create({
      data: {
        sociedadeId,
        clienteId: resolvedClienteId,
        clienteNome: nomeClienteFinal,
        processoId: resolvedProcessoId,
        processoCnj: cnjFinal,
        descricao: descricao.trim(),
        tipo: tipo || 'Contratual',
        categoria: categoria || tipo || 'Honorários',
        valor: valorNumerico,
        dataVencimento: dataVenc,
        status: status || 'Em Aberto',
        formaPagamento: formaPagamento || 'Boleto Bancário',
        observacoes: observacoes || null,
      },
      include: {
        cliente: { select: { id: true, nome: true, cpfCnpj: true } },
        processo: { select: { id: true, numeroCnj: true, titulo: true } },
      },
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.userId || null,
        acao: 'CRIAR_LANCAMENTO_FINANCEIRO',
        entidade: 'LancamentoFinanceiro',
        entidadeId: novo.id,
        detalhes: {
          descricao: novo.descricao,
          valor: valorNumerico,
          tipo: novo.tipo,
        },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Lançamento financeiro registrado com sucesso!',
      data: {
        id: novo.id,
        cliente: novo.cliente?.nome || novo.clienteNome || 'Cliente Não Informado',
        clienteId: novo.clienteId,
        processo: novo.processo?.numeroCnj || novo.processoCnj || 'Interno / Administrativo',
        processoId: novo.processoId,
        descricao: novo.descricao,
        tipo: novo.tipo,
        categoria: novo.categoria,
        valor: Number(novo.valor),
        vencimento: new Date(novo.dataVencimento).toLocaleDateString('pt-BR'),
        dataVencimento: novo.dataVencimento,
        status: novo.status,
        formaPagamento: novo.formaPagamento,
        observacoes: novo.observacoes,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Atualização cadastral de lançamento financeiro
 */
export const updateLancamento = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sociedadeId = req.sociedadeId;
    const lancamentoId = parseInt(id, 10);

    const existing = await prisma.lancamentoFinanceiro.findFirst({
      where: { id: lancamentoId, sociedadeId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Lançamento financeiro não encontrado.',
      });
    }

    const {
      descricao,
      tipo,
      categoria,
      valor,
      vencimento,
      dataVencimento,
      status,
      formaPagamento,
      observacoes,
      cliente,
      clienteNome,
      processo,
      processoCnj,
    } = req.body;

    const updateData = {};

    if (descricao !== undefined) updateData.descricao = descricao.trim();
    if (tipo !== undefined) updateData.tipo = tipo;
    if (categoria !== undefined) updateData.categoria = categoria;
    if (valor !== undefined) updateData.valor = parseMonetaryValue(valor);
    if (vencimento !== undefined || dataVencimento !== undefined) {
      updateData.dataVencimento = parseFlexibleDate(dataVencimento || vencimento);
    }
    if (status !== undefined) updateData.status = status;
    if (formaPagamento !== undefined) updateData.formaPagamento = formaPagamento;
    if (observacoes !== undefined) updateData.observacoes = observacoes;
    if (cliente !== undefined || clienteNome !== undefined) {
      updateData.clienteNome = cliente || clienteNome;
    }
    if (processo !== undefined || processoCnj !== undefined) {
      updateData.processoCnj = processo || processoCnj;
    }

    const updated = await prisma.lancamentoFinanceiro.update({
      where: { id: lancamentoId },
      data: updateData,
      include: {
        cliente: { select: { id: true, nome: true } },
        processo: { select: { id: true, numeroCnj: true } },
      },
    });

    return res.json({
      success: true,
      message: 'Lançamento financeiro atualizado com sucesso!',
      data: {
        id: updated.id,
        cliente: updated.cliente?.nome || updated.clienteNome || 'Cliente Não Informado',
        clienteId: updated.clienteId,
        processo: updated.processo?.numeroCnj || updated.processoCnj || 'Interno / Administrativo',
        processoId: updated.processoId,
        descricao: updated.descricao,
        tipo: updated.tipo,
        categoria: updated.categoria,
        valor: Number(updated.valor),
        vencimento: new Date(updated.dataVencimento).toLocaleDateString('pt-BR'),
        status: updated.status,
        formaPagamento: updated.formaPagamento,
        observacoes: updated.observacoes,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Liquidação rápida de honorário (marcação como Pago com registro de data)
 */
export const liquidarLancamento = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sociedadeId = req.sociedadeId;
    const lancamentoId = parseInt(id, 10);

    const existing = await prisma.lancamentoFinanceiro.findFirst({
      where: { id: lancamentoId, sociedadeId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Lançamento financeiro não encontrado.',
      });
    }

    const updated = await prisma.lancamentoFinanceiro.update({
      where: { id: lancamentoId },
      data: {
        status: 'Pago',
        dataPagamento: new Date(),
      },
      include: {
        cliente: { select: { id: true, nome: true } },
        processo: { select: { id: true, numeroCnj: true } },
      },
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.userId || null,
        acao: 'LIQUIDAR_LANCAMENTO_FINANCEIRO',
        entidade: 'LancamentoFinanceiro',
        entidadeId: lancamentoId,
        detalhes: {
          descricao: updated.descricao,
          valor: Number(updated.valor),
          dataPagamento: updated.dataPagamento,
        },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.json({
      success: true,
      message: 'Honorário liquidado e marcado como Pago com sucesso!',
      data: {
        id: updated.id,
        cliente: updated.cliente?.nome || updated.clienteNome || 'Cliente Não Informado',
        processo: updated.processo?.numeroCnj || updated.processoCnj || 'Interno / Administrativo',
        descricao: updated.descricao,
        tipo: updated.tipo,
        valor: Number(updated.valor),
        vencimento: new Date(updated.dataVencimento).toLocaleDateString('pt-BR'),
        dataPagamento: new Date(updated.dataPagamento).toLocaleDateString('pt-BR'),
        status: updated.status,
        formaPagamento: updated.formaPagamento,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Exclusão de lançamento financeiro com trilha de auditoria
 */
export const deleteLancamento = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sociedadeId = req.sociedadeId;
    const lancamentoId = parseInt(id, 10);

    const existing = await prisma.lancamentoFinanceiro.findFirst({
      where: { id: lancamentoId, sociedadeId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Lançamento financeiro não encontrado.',
      });
    }

    await prisma.lancamentoFinanceiro.delete({
      where: { id: lancamentoId },
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        sociedadeId,
        userId: req.userId || null,
        acao: 'EXCLUIR_LANCAMENTO_FINANCEIRO',
        entidade: 'LancamentoFinanceiro',
        entidadeId: lancamentoId,
        detalhes: {
          descricao: existing.descricao,
          valor: Number(existing.valor),
        },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.json({
      success: true,
      message: 'Lançamento financeiro removido com sucesso.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Importação em lote de lançamentos (Planilhas Excel / CSV)
 */
export const importarLancamentosEmLote = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const { lancamentos } = req.body;

    if (!Array.isArray(lancamentos) || lancamentos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A lista de lançamentos para importação deve conter ao menos um item.',
      });
    }

    const criados = await prisma.$transaction(async (tx) => {
      const resultados = [];

      for (const item of lancamentos) {
        const descricao = item.Descricao || item.descricao || item['Descrição do Serviço'] || 'Honorários Contratuais';
        const tipo = item.Tipo || item.tipo || item['Tipo de Honorário'] || 'Contratual';
        const valor = parseMonetaryValue(item.Valor || item.valor || 0);
        const vencimento = parseFlexibleDate(item.Vencimento || item.vencimento || new Date());
        const status = item.Status || item.status || 'Em Aberto';
        const formaPagamento = item.FormaPagamento || item.formaPagamento || 'Pix';
        const clienteNome = item.Cliente || item.cliente || item['Cliente / Sacado'] || 'Cliente Importado';
        const processoCnj = item.Processo || item.processo || item['Processo / CNJ'] || 'Interno';
        const observacoes = item.Observacoes || item.observacoes || 'Importado via planilha';

        const lanc = await tx.lancamentoFinanceiro.create({
          data: {
            sociedadeId,
            descricao,
            tipo,
            categoria: tipo,
            valor,
            dataVencimento: vencimento,
            status,
            formaPagamento,
            clienteNome,
            processoCnj,
            observacoes,
          },
        });
        resultados.push(lanc);
      }

      return resultados;
    });

    return res.status(201).json({
      success: true,
      message: `${criados.length} lançamentos financeiros importados com sucesso!`,
      total: criados.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DRE Forense Sintético (Demonstrativo de Resultado do Exercício)
 */
export const getDREForense = async (req, res, next) => {
  try {
    const sociedadeId = req.sociedadeId;
    const { ano = new Date().getFullYear() } = req.query;

    const startDate = new Date(parseInt(ano, 10), 0, 1);
    const endDate = new Date(parseInt(ano, 10), 11, 31, 23, 59, 59);

    const lancamentos = await prisma.lancamentoFinanceiro.findMany({
      where: {
        sociedadeId,
        dataVencimento: { gte: startDate, lte: endDate },
      },
    });

    let honorariosContratuais = 0;
    let honorariosExito = 0;
    let honorariosSucumbenciais = 0;
    let partidoMensal = 0;
    let reembolsoCustas = 0;
    let despesasOperacionais = 0;

    lancamentos.forEach((l) => {
      const val = Number(l.valor) || 0;
      const t = (l.tipo || '').toLowerCase();

      if (t.includes('contrat')) {
        honorariosContratuais += val;
      } else if (t.includes('êxito') || t.includes('exito')) {
        honorariosExito += val;
      } else if (t.includes('sucumb')) {
        honorariosSucumbenciais += val;
      } else if (t.includes('partido') || t.includes('mensal')) {
        partidoMensal += val;
      } else if (t.includes('reembolso') || t.includes('custa')) {
        reembolsoCustas += val;
      } else if (t.includes('despesa') || t.includes('perito')) {
        despesasOperacionais += val;
      } else {
        honorariosContratuais += val;
      }
    });

    const receitaBruta = honorariosContratuais + honorariosExito + honorariosSucumbenciais + partidoMensal + reembolsoCustas;
    const resultadoLiquido = receitaBruta - despesasOperacionais;
    const margemLiquida = receitaBruta > 0 ? ((resultadoLiquido / receitaBruta) * 100).toFixed(1) : 100;

    return res.json({
      success: true,
      ano: parseInt(ano, 10),
      data: {
        receitaBruta,
        honorariosContratuais,
        honorariosExito,
        honorariosSucumbenciais,
        partidoMensal,
        reembolsoCustas,
        despesasOperacionais,
        resultadoLiquido,
        margemLiquidaPercentual: parseFloat(margemLiquida),
      },
    });
  } catch (error) {
    next(error);
  }
};
