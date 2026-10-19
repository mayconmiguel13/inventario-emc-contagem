import crypto from 'crypto';

// Regex para detecção de prazo em dias
const REGRAS_PRAZO = [
  { padrao: /(\b\d{1,2}\b)\s*(?:\([a-zçãéíóú\s]+\))?\s*dias?\s*úteis/i, tipoDias: 'uteis' },
  { padrao: /no prazo de\s*(\b\d{1,2}\b)\s*(?:\([a-zçãéíóú\s]+\))?\s*dias?/i, tipoDias: 'uteis' },
  { padrao: /em\s*(\b\d{1,2}\b)\s*(?:\([a-zçãéíóú\s]+\))?\s*dias?/i, tipoDias: 'uteis' },
  { padrao: /(\b\d{1,2}\b)\s*dias/i, tipoDias: 'uteis' },
  { padrao: /decêndio\s*legal/i, diasFixo: 10, tipoDias: 'uteis' },
  { padrao: /quinzena|quinze\s*dias/i, diasFixo: 15, tipoDias: 'uteis' },
];

// Identificação de atos e peças processuais
const REGRAS_ATOS = [
  {
    termos: ['réplica', 'impugnação à contestação', 'manifestação sobre a contestação'],
    tipo: 'Réplica à Contestação',
    diasPadrao: 15,
    urgencia: 'Urgente',
  },
  {
    termos: ['apelação', 'recurso de apelação', 'apelar'],
    tipo: 'Recurso de Apelação',
    diasPadrao: 15,
    urgencia: 'Fatal',
  },
  {
    termos: ['contrarrazões', 'contrarrazões de apelação', 'responder ao recurso'],
    tipo: 'Contrarrazões de Apelação',
    diasPadrao: 15,
    urgencia: 'Urgente',
  },
  {
    termos: ['embargos de declaração', 'acórdão embargado', 'omissão', 'obscuridade', 'contradição'],
    tipo: 'Embargos de Declaração',
    diasPadrao: 5,
    urgencia: 'Fatal',
  },
  {
    termos: ['agravo de instrumento', 'decisão interlocutória agravável', 'art. 1.015'],
    tipo: 'Agravo de Instrumento',
    diasPadrao: 15,
    urgencia: 'Fatal',
  },
  {
    termos: ['especificar provas', 'provas que pretendem produzir', 'justificando a pertinência'],
    tipo: 'Especificação de Provas',
    diasPadrao: 5,
    urgencia: 'Urgente',
  },
  {
    termos: ['contestação', 'apresentar defesa', 'citar o réu para responder'],
    tipo: 'Contestação c/ Reconvenção',
    diasPadrao: 15,
    urgencia: 'Fatal',
  },
  {
    termos: ['alegações finais', 'memoriais', 'razões finais'],
    tipo: 'Alegações Finais por Memoriais',
    diasPadrao: 15,
    urgencia: 'Urgente',
  },
  {
    termos: ['cumprimento de sentença', 'art. 523', 'pagamento voluntário'],
    tipo: 'Manifestação / Pagamento Art. 523 CPC',
    diasPadrao: 15,
    urgencia: 'Fatal',
  },
  {
    termos: ['impugnação ao cumprimento de sentença', 'art. 525'],
    tipo: 'Impugnação ao Cumprimento de Sentença',
    diasPadrao: 15,
    urgencia: 'Fatal',
  },
  {
    termos: ['laudo pericial', 'manifestar sobre o laudo', 'perito judicial'],
    tipo: 'Manifestação sobre Laudo Pericial',
    diasPadrao: 15,
    urgencia: 'Normal',
  },
  {
    termos: ['sisbajud', 'penhora online', 'bloqueio de valores'],
    tipo: 'Manifestação sobre Bloqueio Sisbajud',
    diasPadrao: 5,
    urgencia: 'Fatal',
  },
];

const TERMOS_PRECLUSAO = [
  'sob pena de preclusão',
  'pena de revelia',
  'pena de extinção',
  'improrrogável',
  'improrrogáveis',
  'sob pena de desobediência',
  'penhora online',
  'bloqueio sisbajud',
  'mandado de prisão',
  'tutela de urgência',
];

/**
 * Adiciona N dias úteis a uma data conforme Art. 219 do CPC (excluindo sábados e domingos)
 */
export const somarDiasUteis = (dataBase, dias) => {
  const data = new Date(dataBase);
  let adicionados = 0;
  while (adicionados < dias) {
    data.setDate(data.getDate() + 1);
    const diaSemana = data.getDay();
    // 0 = Domingo, 6 = Sábado
    if (diaSemana !== 0 && diaSemana !== 6) {
      adicionados++;
    }
  }
  return data;
};

/**
 * Analisa o teor de uma publicação do DJEN com extração de ato, prazo sugerido e urgência
 */
export const extrairDadosInteligentesDJEN = (teor = '') => {
  const textoLimpo = (teor || '').toLowerCase();

  // 1. Extração de ato processual
  let atoEncontrado = null;
  for (const regra of REGRAS_ATOS) {
    if (regra.termos.some((t) => textoLimpo.includes(t))) {
      atoEncontrado = regra;
      break;
    }
  }

  // 2. Extração do número de dias do prazo
  let diasExtraidos = null;
  for (const regra of REGRAS_PRAZO) {
    if (regra.diasFixo && regra.padrao.test(textoLimpo)) {
      diasExtraidos = regra.diasFixo;
      break;
    }
    const match = textoLimpo.match(regra.padrao);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0 && num <= 60) {
        diasExtraidos = num;
        break;
      }
    }
  }

  const prazoFinalDias = diasExtraidos || (atoEncontrado ? atoEncontrado.diasPadrao : 15);
  const tipoAto = atoEncontrado ? atoEncontrado.tipo : 'Manifestação Processual Geral';

  // 3. Avaliação de gravidade / urgência
  const temPreclusao = TERMOS_PRECLUSAO.some((termo) => textoLimpo.includes(termo));
  let urgenciaFinal = atoEncontrado ? atoEncontrado.urgencia : 'Normal';
  if (temPreclusao || prazoFinalDias <= 5) {
    urgenciaFinal = 'Fatal';
  } else if (prazoFinalDias <= 10 && urgenciaFinal !== 'Fatal') {
    urgenciaFinal = 'Urgente';
  }

  // 4. Cálculo de vencimento estimado
  const dataVencimentoEstimado = somarDiasUteis(new Date(), prazoFinalDias);
  dataVencimentoEstimado.setHours(23, 59, 0, 0);

  return {
    tipoAto,
    prazoSugerido: prazoFinalDias,
    urgencia: urgenciaFinal,
    temPreclusao,
    dataVencimentoEstimado,
  };
};

/**
 * Gera Hash Criptográfico SHA-256 para Certidão Digital de Publicação Forense
 */
export const gerarHashCertidaoForense = ({ cnj, tribunal, dataPublicacao, teor, sociedadeId }) => {
  const payload = `${sociedadeId}|${cnj}|${tribunal}|${new Date(dataPublicacao).toISOString()}|${teor.trim()}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
};

/**
 * Emite a Certidão Forense Digital Completa
 */
export const montarCertidaoDigital = (publicacao, sociedade, usuarioEmissor) => {
  const hash = publicacao.hashCertidao || gerarHashCertidaoForense({
    cnj: publicacao.numeroCnj,
    tribunal: publicacao.tribunal,
    dataPublicacao: publicacao.dataPublicacao,
    teor: publicacao.teorPublicacao,
    sociedadeId: publicacao.sociedadeId,
  });

  const timestampIso = new Date().toISOString();
  const carimboTempo = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return {
    titulo: 'CERTIDÃO DIGITAL DE PUBLICAÇÃO FORENSE - DJEN',
    orgaoExpedidor: 'Diário de Justiça Eletrônico Nacional (DJEN) - Conselho Nacional de Justiça',
    sociedade: sociedade?.razaoSocial || 'Silva & Associados Advocacia Forense',
    cnpjSociedade: sociedade?.cnpj || '12.345.678/0001-90',
    processo: {
      numeroCnj: publicacao.numeroCnj,
      tribunal: publicacao.tribunal,
      orgaoJulgador: publicacao.orgaoJulgador || 'Vara de Origem',
      edicao: publicacao.edicao || 'Edição Eletrônica Regular',
      dataPublicacao: publicacao.dataPublicacao,
      dataDisponibilizacao: publicacao.dataDisponib || publicacao.dataPublicacao,
    },
    teorCertificado: publicacao.teorPublicacao,
    analisePericial: {
      prazoSugeridoDias: publicacao.prazoSugerido,
      tipoAtoSugerido: publicacao.tipoAtoSugerido,
      urgencia: publicacao.urgencia,
      contagemRegra: 'Dias Úteis (Art. 219 c/c Art. 224 do CPC)',
    },
    autenticacaoPericial: {
      hashSha256: hash,
      algoritmo: 'SHA-256 RFC 6234',
      carimboTempoUTC: timestampIso,
      carimboTempoOficial: `${carimboTempo} (Horário Oficial de Brasília - DF)`,
      emissor: usuarioEmissor?.nome || 'Sistema Automatizado de Controladoria Forense',
      oabEmissor: usuarioEmissor?.oab || 'OAB/SP 412.890',
      padraoAssinatura: 'Padrão ICP-Brasil v2.4 (Simulado Forense)',
      verificacaoUrl: `https://djen.jus.br/autenticidade?hash=${hash.substring(0, 16)}`,
    },
  };
};
