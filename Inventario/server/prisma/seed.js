import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log(' Iniciando povoamento inicial do banco de dados (Seed)...');

  // 1. Criar ou atualizar Sociedade padrão
  const sociedade = await prisma.sociedade.upsert({
    where: { cnpj: '12.345.678/0001-90' },
    update: {},
    create: {
      razaoSocial: 'Silva & Associados Advocacia Forense',
      registroOab: 'OAB/SP 42.110',
      cnpj: '12.345.678/0001-90',
      email: 'contato@silvaadvocacia.com.br',
      telefone: '(11) 3456-7890',
      responsavel: 'Dr. Maycon Silva',
      cidade: 'São Paulo',
      uf: 'SP',
      chavePix: '12.345.678/0001-90',
      primaryColor: '#405189',
      layoutMode: 'light',
    },
  });

  console.log(` Sociedade configurada: ${sociedade.razaoSocial} (ID: ${sociedade.id})`);

  // Senha padrão criptografada: admin123
  const senhaHash = await bcrypt.hash('admin123', 10);

  // 2. Criar ou atualizar Usuário Administrador
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@silvaadvocacia.com.br' },
    update: {
      senhaHash,
      status: 'Ativo',
    },
    create: {
      sociedadeId: sociedade.id,
      nome: 'Dr. Maycon Silva',
      email: 'admin@silvaadvocacia.com.br',
      senhaHash,
      telefone: '(11) 98765-4321',
      cargo: 'Sócio Fundador & Diretor Jurídico',
      oab: 'OAB/SP 412.890',
      role: 'ADMIN',
      status: 'Ativo',
      avatar: 'MS',
      corAvatar: 'primary',
      permissoes: {
        financeiro: true,
        excluir: true,
        assinar: true,
        djen: true,
        relatorios: true,
      },
    },
  });

  console.log(` Usuário Admin configurado: ${adminUser.nome} (${adminUser.email})`);

  // 3. Criar ou atualizar Usuária Advogada Associada
  const advogadaUser = await prisma.user.upsert({
    where: { email: 'camila@silvaadvocacia.com.br' },
    update: {
      senhaHash,
      status: 'Ativo',
    },
    create: {
      sociedadeId: sociedade.id,
      nome: 'Dra. Camila Mendes',
      email: 'camila@silvaadvocacia.com.br',
      senhaHash,
      telefone: '(11) 97654-3210',
      cargo: 'Advogada Cível Sênior',
      oab: 'OAB/SP 389.215',
      role: 'ADVOGADO',
      status: 'Ativo',
      avatar: 'CM',
      corAvatar: 'success',
      permissoes: {
        financeiro: false,
        excluir: false,
        assinar: true,
        djen: true,
        relatorios: false,
      },
    },
  });

  console.log(` Advogada configurada: ${advogadaUser.nome} (${advogadaUser.email})`);

  // 4. Clientes Padrão (PF e PJ)
  const clientesData = [
    {
      nome: 'TechSolutions Brasil S/A',
      tipo: 'JURIDICA',
      cpfCnpj: '12.345.678/0001-90',
      email: 'contato@techsolutions.com.br',
      telefone: '(11) 3214-5500',
      cidade: 'São Paulo',
      uf: 'SP',
      status: 'Ativo',
    },
    {
      nome: 'Indústria Metalúrgica Aliança Ltda',
      tipo: 'JURIDICA',
      cpfCnpj: '08.991.234/0001-12',
      email: 'juridico@aliancametal.com.br',
      telefone: '(11) 4567-8899',
      cidade: 'São Paulo',
      uf: 'SP',
      status: 'Ativo',
    },
    {
      nome: 'Dr. Roberto Albuquerque',
      tipo: 'FISICA',
      cpfCnpj: '284.192.838-12',
      email: 'roberto.albuquerque@gmail.com',
      telefone: '(11) 98765-4321',
      profissao: 'Médico Cirurgião',
      cidade: 'São Paulo',
      uf: 'SP',
      status: 'Ativo',
    },
    {
      nome: 'Logística Express Distribuição',
      tipo: 'JURIDICA',
      cpfCnpj: '33.109.845/0001-44',
      email: 'diretoria@logexpress.com.br',
      telefone: '(19) 3812-9900',
      cidade: 'Campinas',
      uf: 'SP',
      status: 'Em Análise',
    },
  ];

  const clientesCriados = {};
  for (const c of clientesData) {
    const existing = await prisma.cliente.findFirst({
      where: { sociedadeId: sociedade.id, cpfCnpj: c.cpfCnpj },
    });
    if (existing) {
      clientesCriados[c.nome] = existing;
    } else {
      const cli = await prisma.cliente.create({
        data: { sociedadeId: sociedade.id, ...c },
      });
      clientesCriados[c.nome] = cli;
    }
  }

  // 5. Processos Judiciais Padrão
  const processosData = [
    {
      numeroCnj: '0014285-44.2024.8.26.0100',
      clienteNome: 'TechSolutions Brasil S/A',
      titulo: 'Ação Revisional de Contrato Bancário',
      area: 'Cível',
      varaTribunal: '14ª Vara Cível de SP',
      comarca: 'São Paulo',
      uf: 'SP',
      polo: 'Réu',
      parteContraria: 'Banco Safra S/A',
      valorCausa: 450000.00,
      fase: 'CONHECIMENTO',
      status: 'Em Andamento',
      observacoes: 'Petição de juntada de documentos anexada.',
    },
    {
      numeroCnj: '5002194-81.2023.4.03.6100',
      clienteNome: 'Indústria Metalúrgica Aliança Ltda',
      titulo: 'Mandado de Segurança Coletivo - Exclusão ICMS da base PIS/COFINS',
      area: 'Tributário',
      varaTribunal: '3ª Vara Federal Cível de SP',
      comarca: 'São Paulo',
      uf: 'SP',
      polo: 'Autor',
      parteContraria: 'Fazenda Nacional / União Federal',
      valorCausa: 1820000.00,
      fase: 'RECURSAL',
      status: 'Em Andamento',
      observacoes: 'Conclusos para julgamento do Relator.',
    },
    {
      numeroCnj: '1029384-11.2024.5.02.0042',
      clienteNome: 'Logística Express Distribuição',
      titulo: 'Reclamatória Trabalhista - Horas Extras e Adicional Noturno',
      area: 'Trabalhista',
      varaTribunal: '42ª Vara do Trabalho de SP',
      comarca: 'São Paulo',
      uf: 'SP',
      polo: 'Réu',
      parteContraria: 'Antônio Ferreira Santos',
      valorCausa: 85000.00,
      fase: 'CONHECIMENTO',
      status: 'Em Andamento',
      observacoes: 'Laudo pericial médico homologado.',
    },
    {
      numeroCnj: '0089211-92.2023.8.26.0002',
      clienteNome: 'TechSolutions Brasil S/A',
      titulo: 'Execução de Título Extrajudicial - Contrato de Prestação de Serviços',
      area: 'Empresarial',
      varaTribunal: '2ª Vara Empresarial da Capital',
      comarca: 'São Paulo',
      uf: 'SP',
      polo: 'Autor',
      parteContraria: 'Construtora Horizonte Verde',
      valorCausa: 960000.00,
      fase: 'EXECUCAO',
      status: 'Em Andamento',
      observacoes: 'Bloqueio Sisbajud positivo parcial.',
    },
    {
      numeroCnj: '1004921-30.2024.8.26.0011',
      clienteNome: 'Dr. Roberto Albuquerque',
      titulo: 'Inventário e Partilha Amigável de Bens de Família',
      area: 'Cível',
      varaTribunal: '1ª Vara de Família de Pinheiros',
      comarca: 'São Paulo',
      uf: 'SP',
      polo: 'Autor',
      parteContraria: 'Espólio de Maria Albuquerque',
      valorCausa: 320000.00,
      fase: 'CONHECIMENTO',
      status: 'Julgado',
      observacoes: 'Sentença homologatória de partilha transitada em julgado.',
    },
  ];

  const processosCriados = {};
  for (const p of processosData) {
    const cli = clientesCriados[p.clienteNome];
    if (!cli) continue;

    const proc = await prisma.processo.upsert({
      where: { numeroCnj: p.numeroCnj },
      update: {
        clienteId: cli.id,
        polo: p.polo,
        valorCausa: p.valorCausa,
        varaTribunal: p.varaTribunal,
        fase: p.fase,
        status: p.status,
      },
      create: {
        sociedadeId: sociedade.id,
        clienteId: cli.id,
        numeroCnj: p.numeroCnj,
        titulo: p.titulo,
        area: p.area,
        varaTribunal: p.varaTribunal,
        comarca: p.comarca,
        uf: p.uf,
        polo: p.polo,
        parteContraria: p.parteContraria,
        valorCausa: p.valorCausa,
        fase: p.fase,
        status: p.status,
        observacoes: p.observacoes,
      },
    });

    processosCriados[p.numeroCnj] = proc;
  }

  // 6. Prazos Forenses Padrão (Etapa 3)
  const prazosData = [
    {
      cnj: '0014285-44.2024.8.26.0100',
      titulo: 'Contestação c/ Reconvenção',
      tipo: 'CPC',
      prioridade: 'Fatal',
      status: 'FATAL',
      diasAdd: 0, // Hoje
      responsavelId: adminUser.id,
      descricao: 'Protocolar contestação impugnando juros remuneratórios e cumulação de comissão de permanência.',
    },
    {
      cnj: '5002194-81.2023.4.03.6100',
      titulo: 'Apelação Cível (TRF3)',
      tipo: 'CPC',
      prioridade: 'Urgente',
      status: 'PENDENTE',
      diasAdd: 1, // Amanhã
      responsavelId: advogadaUser.id,
      descricao: 'Interposição de recurso de apelação demonstrando inconstitucionalidade da cobrança tributária.',
    },
    {
      cnj: '1029384-11.2024.5.02.0042',
      titulo: 'Manifestação sobre Laudo Pericial',
      tipo: 'CLT',
      prioridade: 'Alta',
      status: 'PENDENTE',
      diasAdd: 3,
      responsavelId: advogadaUser.id,
      descricao: 'Apresentar quesitos elucidativos ao perito judicial de insalubridade.',
    },
    {
      cnj: '0089211-92.2023.8.26.0002',
      titulo: 'Indicação de Bens à Penhora (Sisbajud)',
      tipo: 'CPC',
      prioridade: 'Média',
      status: 'PENDENTE',
      diasAdd: 5,
      responsavelId: adminUser.id,
      descricao: 'Requerer reiteração de teimosinha no sistema Sisbajud e pesquisa Renajud.',
    },
  ];

  for (const p of prazosData) {
    const proc = processosCriados[p.cnj];
    if (!proc) continue;

    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() + p.diasAdd);
    dataLimite.setHours(23, 59, 0, 0);

    const existing = await prisma.prazo.findFirst({
      where: { sociedadeId: sociedade.id, processoId: proc.id, titulo: p.titulo },
    });

    if (!existing) {
      await prisma.prazo.create({
        data: {
          sociedadeId: sociedade.id,
          processoId: proc.id,
          responsavelId: p.responsavelId,
          criadorId: adminUser.id,
          titulo: p.titulo,
          tipo: p.tipo,
          prioridade: p.prioridade,
          status: p.status,
          dataLimite,
          descricao: p.descricao,
        },
      });
      console.log(` Prazo configurado: ${p.titulo} (${p.cnj})`);
    }
  }

  // 7. Audiências Judiciais Padrão (Etapa 3)
  const audienciasData = [
    {
      cnj: '0014285-44.2024.8.26.0100',
      titulo: 'Audiência de Instrução e Julgamento',
      tipo: 'Instrução e Julgamento',
      formato: 'Virtual',
      linkAcesso: 'https://teams.microsoft.com/l/meetup-join/tjsp14civ',
      local: 'Sala Virtual 14ª Vara Cível SP',
      diasAdd: 1,
      hora: '10:30',
      observacoes: 'Dr. Maycon Silva entrará 15 minutos antes. Testemunhas já intimadas.',
    },
    {
      cnj: '1029384-11.2024.5.02.0042',
      titulo: 'Mediação & Conciliação Trabalhista',
      tipo: 'Mediação & Conciliação',
      formato: 'Presencial',
      local: 'Fórum Ruy Barbosa - Av. Marquês de São Vicente, 235 - Barra Funda, São Paulo - SP',
      diasAdd: 2,
      hora: '14:00',
      observacoes: 'Proposta inicial de acordo autorizada pela diretoria até R$ 25.000,00.',
    },
    {
      cnj: '5002194-81.2023.4.03.6100',
      titulo: 'Sessão de Julgamento / Sustentação Oral',
      tipo: 'Sustentação Oral',
      formato: 'Virtual',
      linkAcesso: 'https://trf3-jus-br.zoom.us/j/84920194821',
      local: 'TRF3 - 4ª Turma Cível Federal',
      diasAdd: 4,
      hora: '15:00',
      observacoes: 'Inscrição para sustentação oral deferida com antecedência.',
    },
  ];

  for (const a of audienciasData) {
    const proc = processosCriados[a.cnj];
    if (!proc) continue;

    const [hora, min] = a.hora.split(':');
    const dataHora = new Date();
    dataHora.setDate(dataHora.getDate() + a.diasAdd);
    dataHora.setHours(parseInt(hora, 10), parseInt(min, 10), 0, 0);

    const existing = await prisma.audiencia.findFirst({
      where: { sociedadeId: sociedade.id, processoId: proc.id, tipo: a.tipo },
    });

    if (!existing) {
      await prisma.audiencia.create({
        data: {
          sociedadeId: sociedade.id,
          processoId: proc.id,
          titulo: a.titulo,
          tipo: a.tipo,
          formato: a.formato,
          linkAcesso: a.linkAcesso || null,
          local: a.local,
          dataHora,
          observacoes: a.observacoes,
          status: 'Agendada',
        },
      });
      console.log(` Audiência configurada: ${a.titulo} (${a.cnj})`);
    }
  }

  // 8. Tarefas Kanban Padrão (Etapa 3)
  const tarefasData = [
    {
      cnj: '0014285-44.2024.8.26.0100',
      titulo: 'Elaborar Minuta de Contestação com Reconvenção',
      descricao: 'Elaboração das preliminares de inépcia e razões de mérito atacando cobrança indevida.',
      status: 'A_FAZER',
      prioridade: 'alta',
      responsavelId: adminUser.id,
      dataLimiteAdd: 2,
      etiquetas: {
        tipo: 'Petição Processual',
        subtarefas: [
          { id: 101, texto: 'Análise detalhada do contrato e extratos', concluida: true },
          { id: 102, texto: 'Cálculo de juros abusivos pelo perito assistente', concluida: true },
          { id: 103, texto: 'Redação das razões e juntada no sistema', concluida: false },
        ],
        comentarios: [
          { id: 1, autor: 'Dr. Maycon Silva', data: 'Ontem', texto: 'Contrato preliminar já anexado na pasta.' },
        ],
      },
    },
    {
      cnj: '5002194-81.2023.4.03.6100',
      titulo: 'Preparar Memorial para Julgamento no TRF3',
      descricao: 'Elaboração de memoriais sucintos para entrega em gabinete aos desembargadores.',
      status: 'EM_ANDAMENTO',
      prioridade: 'fatal',
      responsavelId: advogadaUser.id,
      dataLimiteAdd: 1,
      etiquetas: {
        tipo: 'Memoriais / Sustentação',
        subtarefas: [
          { id: 201, texto: 'Pesquisa dos precedentes recentes da 4ª Turma', concluida: true },
          { id: 202, texto: 'Envio aos gabinetes dos desembargadores', concluida: false },
        ],
        comentarios: [],
      },
    },
    {
      cnj: '5002194-81.2023.4.03.6100',
      titulo: 'Revisão Técnica de Recurso Tributário',
      descricao: 'Revisão das razões recursais e conferência de recolhimento das custas de preparo.',
      status: 'REVISAO',
      prioridade: 'alta',
      responsavelId: adminUser.id,
      dataLimiteAdd: 3,
      etiquetas: {
        tipo: 'Revisão Técnica',
        subtarefas: [
          { id: 301, texto: 'Verificar tempestividade e recolhimento de preparo', concluida: true },
          { id: 302, texto: 'Aprovação final do sócio', concluida: false },
        ],
        comentarios: [],
      },
    },
    {
      cnj: '1029384-11.2024.5.02.0042',
      titulo: 'Protocolo de Laudo Pericial Assistente Técnico',
      descricao: 'Protocolo do parecer técnico do médico do trabalho no sistema PJe.',
      status: 'CONCLUIDO',
      prioridade: 'media',
      responsavelId: advogadaUser.id,
      dataLimiteAdd: -1,
      etiquetas: {
        tipo: 'Protocolo Eletrônico',
        subtarefas: [
          { id: 401, texto: 'Recebimento do laudo assinado pelo perito', concluida: true },
          { id: 402, texto: 'Petição de juntada e protocolo via PJe', concluida: true },
        ],
        comentarios: [],
      },
    },
  ];

  for (const t of tarefasData) {
    const proc = processosCriados[t.cnj];
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() + t.dataLimiteAdd);

    const existing = await prisma.tarefa.findFirst({
      where: { sociedadeId: sociedade.id, titulo: t.titulo },
    });

    if (!existing) {
      await prisma.tarefa.create({
        data: {
          sociedadeId: sociedade.id,
          processoId: proc?.id || null,
          responsavelId: t.responsavelId,
          criadorId: adminUser.id,
          titulo: t.titulo,
          descricao: t.descricao,
          status: t.status,
          prioridade: t.prioridade,
          dataLimite,
          etiquetas: t.etiquetas,
        },
      });
      console.log(` Tarefa Kanban configurada: ${t.titulo}`);
    }
  }

  // 9. Publicações do DJEN & Intimações Eletrônicas (Etapa 4)
  const publicacoesData = [
    {
      cnj: '0014285-44.2024.8.26.0100',
      tribunal: 'TJSP - 14ª Vara Cível da Comarca de SP',
      orgaoJulgador: '14ª Vara Cível da Comarca de São Paulo',
      edicao: 'Caderno Judicial 1ª Instância - Edição nº 3.912/2026',
      diasAtras: 0,
      teor: 'Vistos. Intime-se a parte autora/reconvinda para apresentação de réplica à contestação e manifestação detalhada sobre os documentos juntados com a defesa no prazo legal de 15 (quinze) dias úteis, sob pena de preclusão.',
      prazoSugerido: 15,
      tipoAtoSugerido: 'Réplica à Contestação',
      status: 'Nova',
      urgencia: 'Fatal',
      hashCertidao: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
    {
      cnj: '0089211-92.2023.8.26.0002',
      tribunal: 'TJSP - 2ª Vara Empresarial da Capital',
      orgaoJulgador: '2ª Vara Empresarial da Comarca de São Paulo',
      edicao: 'Caderno Judicial 1ª Instância - Edição nº 3.912/2026',
      diasAtras: 0,
      teor: 'Decisão interlocutória publicada: Deferida a penhora online de ativos financeiros via sistema Sisbajud até o limite do débito exequendo. Intime-se o credor sobre o resultado das ordens judiciais no prazo improrrogável de 5 (cinco) dias.',
      prazoSugerido: 5,
      tipoAtoSugerido: 'Manifestação sobre Bloqueio Sisbajud',
      status: 'Nova',
      urgencia: 'Fatal',
      hashCertidao: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    },
    {
      cnj: '5002194-81.2023.4.03.6100',
      tribunal: 'TRF3 - 4ª Turma Julgadora Regional',
      orgaoJulgador: '4ª Turma Julgadora Cível Regional - TRF 3ª Região',
      edicao: 'Diário Eletrônico da Justiça Federal TRF-3 - Edição 241',
      diasAtras: 1,
      teor: 'Pauta de Julgamento Presencial/Virtual: Processo incluído em mesa para a sessão ordinária da 4ª Turma do dia 15/10/2026, às 14h. Intimem-se os patronos para eventual sustentação oral nos termos do regimento interno.',
      prazoSugerido: 5,
      tipoAtoSugerido: 'Inscrição para Sustentação Oral',
      status: 'Lida',
      urgencia: 'Normal',
      hashCertidao: 'f8e7d6c5b4a3928170192837465abcdeffedcba9876543210123456789abcdef',
    },
    {
      cnj: '1029384-11.2024.5.02.0042',
      tribunal: 'TRT2 - 42ª Vara do Trabalho de São Paulo',
      orgaoJulgador: '42ª Vara do Trabalho de São Paulo (Fórum Ruy Barbosa)',
      edicao: 'DEJT - Diário Eletrônico da Justiça do Trabalho nº 4.108',
      diasAtras: 2,
      teor: 'Homologado laudo pericial médico pericial conclusivo. Fixados os honorários definitivos do perito judicial. Ficam as partes intimadas para manifestação e apresentação de razões finais por memoriais em 15 (quinze) dias.',
      prazoSugerido: 15,
      tipoAtoSugerido: 'Alegações Finais por Memoriais',
      status: 'Lida',
      urgencia: 'Normal',
      hashCertidao: '5566778899aabbccddeeff00112233445566778899aabbccddeeff0011223344',
    },
    {
      cnj: '1004921-30.2024.8.26.0011',
      tribunal: 'TJSP - 1ª Vara de Família de Pinheiros',
      orgaoJulgador: '1ª Vara da Família e Sucessões de Pinheiros',
      edicao: 'Caderno Judicial 1ª Instância - Edição nº 3.909/2026',
      diasAtras: 3,
      teor: 'Sentença homologatória proferida: Homologado por sentença o plano de partilha amigável de bens. Certificado o trânsito em julgado. Expeçam-se os competentes formais de partilha e alvarás judiciais aos herdeiros.',
      prazoSugerido: 15,
      tipoAtoSugerido: 'Cumprimento de Sentença / Alvarás',
      status: 'Lida',
      urgencia: 'Normal',
      hashCertidao: '99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa',
    },
  ];

  for (const pub of publicacoesData) {
    const proc = processosCriados[pub.cnj];

    const dataPublicacao = new Date();
    dataPublicacao.setDate(dataPublicacao.getDate() - pub.diasAtras);

    const existing = await prisma.publicacaoDJEN.findFirst({
      where: { sociedadeId: sociedade.id, numeroCnj: pub.cnj, teorPublicacao: pub.teor },
    });

    if (!existing) {
      await prisma.publicacaoDJEN.create({
        data: {
          sociedadeId: sociedade.id,
          processoId: proc?.id || null,
          numeroCnj: pub.cnj,
          tribunal: pub.tribunal,
          orgaoJulgador: pub.orgaoJulgador,
          edicao: pub.edicao,
          dataPublicacao,
          dataDisponib: dataPublicacao,
          teorPublicacao: pub.teor,
          prazoSugerido: pub.prazoSugerido,
          tipoAtoSugerido: pub.tipoAtoSugerido,
          status: pub.status,
          urgencia: pub.urgencia,
          hashCertidao: pub.hashCertidao,
        },
      });
      console.log(` Publicação DJEN configurada: ${pub.cnj} (${pub.tipoAtoSugerido})`);
    }
  }

  // 10. Repositório de Documentos Forenses (Etapa 5)
  const documentosData = [
    {
      titulo: 'Contestação c/ Reconvenção - TechSolutions',
      cnj: '0014285-44.2024.8.26.0100',
      tipo: 'Petição Processual (DOCX)',
      tamanho: '1.4 MB',
      autor: 'Dra. Camila Mendes',
      status: 'Pronta para Protocolo',
      conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 14ª VARA CÍVEL DO FORO CENTRAL DA COMARCA DE SÃO PAULO - SP.\n\nProcesso nº 0014285-44.2024.8.26.0100\n\nTECHSOLUTIONS BRASIL S/A, pessoa jurídica de direito privado, já qualificada nos autos em epígrafe, vem, mui respeitosamente, apresentar sua CONTESTAÇÃO com pedido de RECONVENÇÃO...',
      hashSha256: 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    },
    {
      titulo: 'Contrato de Prestação de Serviços Advocatícios',
      cnj: null,
      tipo: 'Contrato (PDF Assinado)',
      tamanho: '3.2 MB',
      autor: 'Dr. Maycon Silva',
      status: 'Assinado Digitalmente',
      conteudo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS E HONORÁRIOS\n\nPelo presente instrumento particular, de um lado SILVA & ASSOCIADOS ADVOCACIA e de outro lado o CONTRATANTE, ajustam as cláusulas a seguir estipuladas para a condução do patrocínio judicial...',
      hashSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
    {
      titulo: 'Recurso de Apelação - Metalúrgica Aliança',
      cnj: '5002194-81.2023.4.03.6100',
      tipo: 'Recurso (DOCX)',
      tamanho: '2.1 MB',
      autor: 'Dr. Maycon Silva',
      status: 'Em Revisão',
      conteudo: 'AO EGRÉGIO TRIBUNAL REGIONAL FEDERAL DA 3ª REGIÃO\n\nRazões de Apelação interpostas por INDÚSTRIA METALÚRGICA ALIANÇA LTDA, demonstrando a necessária reforma da r. sentença de primeiro grau para assegurar o creditamento tributário...',
      hashSha256: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
    },
    {
      titulo: 'Procuração Ad Judicia - TechSolutions',
      cnj: '0014285-44.2024.8.26.0100',
      tipo: 'Procuração (PDF)',
      tamanho: '450 KB',
      autor: 'Dr. Maycon Silva',
      status: 'Assinado Digitalmente',
      conteudo: 'INSTRUMENTO PARTICULAR DE PROCURAÇÃO AD JUDICIA ET EXTRA\n\nOUTORGANTE: TECHSOLUTIONS BRASIL S/A, CNPJ 12.345.678/0001-90.\nOUTORGADO: DR. MAYCON SILVA, OAB/SP 412.890, com amplos poderes para o foro em geral...',
      hashSha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    },
  ];

  for (const doc of documentosData) {
    const proc = doc.cnj ? processosCriados[doc.cnj] : null;

    const existing = await prisma.documento.findFirst({
      where: { sociedadeId: sociedade.id, titulo: doc.titulo },
    });

    if (!existing) {
      await prisma.documento.create({
        data: {
          sociedadeId: sociedade.id,
          processoId: proc?.id || null,
          titulo: doc.titulo,
          tipo: doc.tipo,
          tamanho: doc.tamanho,
          autor: doc.autor,
          status: doc.status,
          conteudo: doc.conteudo,
          hashSha256: doc.hashSha256,
        },
      });
      console.log(` Documento Forense configurado: ${doc.titulo}`);
    }
  }

  // 11. Envelopes de Assinatura Digital & Trilha Pericial (Etapa 5)
  const envelopesData = [
    {
      codigo: 'ENV-2026-001',
      titulo: 'Procuração Ad Judicia et Extra - TechSolutions Brasil S/A',
      documentoTipo: 'Procuração',
      clienteNome: 'TechSolutions Brasil S/A',
      clienteDoc: '12.345.678/0001-90',
      clienteTelefone: '(11) 3214-5500',
      clienteEmail: 'contato@techsolutions.com.br',
      processoCnj: '0014285-44.2024.8.26.0100',
      status: 'ASSINADO',
      metodoAssinatura: 'eletronica_inapp',
      hashSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      assinaturaData: {
        signatarioNome: 'Roberto Silva (Diretor)',
        signatarioCpf: '12.345.678/0001-90',
        email: 'diretoria@techsolutions.com.br',
        telefone: '(11) 98765-4321',
        assinadoEm: '28/09/2026 14:22:10',
        ipSignatario: '189.120.45.198',
        geolocalizacao: 'São Paulo/SP - Brasil',
        navegador: 'Chrome 128 / Windows 11',
        rubricaBase64: null,
      },
      signatarios: [
        {
          nome: 'Roberto Silva (Diretor)',
          cpf: '12.345.678/0001-90',
          email: 'diretoria@techsolutions.com.br',
          status: 'ASSINADO',
          assinadoEm: '2026-09-28T14:22:10.000Z',
          ip: '189.120.45.198',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0',
        },
      ],
      diasExpiracao: 30,
    },
    {
      codigo: 'ENV-2026-002',
      titulo: 'Contrato de Prestação de Serviços Advocatícios - Indústria Metalúrgica Aliança',
      documentoTipo: 'Contrato de Honorários',
      clienteNome: 'Indústria Metalúrgica Aliança Ltda',
      clienteDoc: '08.991.234/0001-12',
      clienteTelefone: '(11) 4567-8899',
      clienteEmail: 'juridico@aliancametal.com.br',
      processoCnj: '5002194-81.2023.4.03.6100',
      status: 'PENDENTE',
      metodoAssinatura: 'gov_br',
      hashSha256: '7d8e9f0123456789abcdef0123456789ae3b0c44298fc1c149afbf4c8996fb92',
      assinaturaData: null,
      signatarios: [
        {
          nome: 'Carlos Eduardo Aliança',
          cpf: '08.991.234/0001-12',
          email: 'juridico@aliancametal.com.br',
          status: 'PENDENTE',
        },
      ],
      diasExpiracao: 15,
    },
    {
      codigo: 'ENV-2026-003',
      titulo: 'Declaração de Hipossuficiência Econômica - Dr. Roberto Albuquerque',
      documentoTipo: 'Declaração',
      clienteNome: 'Dr. Roberto Albuquerque',
      clienteDoc: '284.192.838-12',
      clienteTelefone: '(11) 98765-4321',
      clienteEmail: 'roberto.albuquerque@gmail.com',
      processoCnj: '1004921-30.2024.8.26.0011',
      status: 'ASSINADO',
      metodoAssinatura: 'gov_br',
      hashSha256: 'a3f89e2c45b7801d9f4c32e189a05b67d8e9f0123456789abcdef0123456789a',
      assinaturaData: {
        signatarioNome: 'Dr. Roberto Albuquerque',
        signatarioCpf: '284.192.838-12',
        email: 'roberto.albuquerque@gmail.com',
        telefone: '(11) 98765-4321',
        assinadoEm: '25/09/2026 10:45:00',
        ipSignatario: '177.89.201.55',
        geolocalizacao: 'São Paulo/SP - Brasil',
        navegador: 'Safari Mobile / iOS 17.6',
        rubricaBase64: null,
      },
      signatarios: [
        {
          nome: 'Dr. Roberto Albuquerque',
          cpf: '284.192.838-12',
          email: 'roberto.albuquerque@gmail.com',
          status: 'ASSINADO',
          assinadoEm: '2026-09-25T10:45:00.000Z',
          ip: '177.89.201.55',
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15',
        },
      ],
      diasExpiracao: 25,
    },
    {
      codigo: 'ENV-2026-004',
      titulo: 'Contrato de Honorários e Procuração - Logística Express Ltda',
      documentoTipo: 'Contrato de Honorários',
      clienteNome: 'Logística Express Distribuição',
      clienteDoc: '33.109.845/0001-44',
      clienteTelefone: '(19) 3812-9900',
      clienteEmail: 'diretoria@logexpress.com.br',
      processoCnj: '1029384-11.2024.5.02.0042',
      status: 'PENDENTE',
      metodoAssinatura: 'eletronica_inapp',
      hashSha256: 'f4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149afb',
      assinaturaData: null,
      signatarios: [
        {
          nome: 'Marcos Paulo Distribuidor',
          cpf: '33.109.845/0001-44',
          email: 'diretoria@logexpress.com.br',
          status: 'PENDENTE',
        },
      ],
      diasExpiracao: 20,
    },
  ];

  for (const env of envelopesData) {
    const cli = clientesCriados[env.clienteNome];
    const dataExp = new Date();
    dataExp.setDate(dataExp.getDate() + env.diasExpiracao);

    const existing = await prisma.envelope.findFirst({
      where: { sociedadeId: sociedade.id, codigo: env.codigo },
    });

    if (!existing) {
      await prisma.envelope.create({
        data: {
          sociedadeId: sociedade.id,
          codigo: env.codigo,
          titulo: env.titulo,
          documentoTipo: env.documentoTipo,
          clienteId: cli?.id || null,
          clienteNome: env.clienteNome,
          clienteDoc: env.clienteDoc,
          clienteTelefone: env.clienteTelefone,
          clienteEmail: env.clienteEmail,
          processoCnj: env.processoCnj,
          status: env.status,
          metodoAssinatura: env.metodoAssinatura,
          hashSha256: env.hashSha256,
          assinaturaData: env.assinaturaData,
          signatarios: env.signatarios,
          dataExpiracao: dataExp,
        },
      });
      console.log(` Envelope de Assinatura configurado: ${env.codigo} (${env.titulo})`);
    }
  }

  // 12. Gestão Financeira & Honorários Advocatícios (Etapa 6)
  const lancamentosData = [
    {
      clienteNome: 'TechSolutions Brasil S/A',
      processoCnj: '0014285-44.2024.8.26.0100',
      descricao: 'Honorários de Êxito - Fase Inicial',
      tipo: 'Êxito',
      categoria: 'Honorários de Êxito',
      valor: 35000.00,
      diasVencimento: 3,
      status: 'Em Aberto',
      formaPagamento: 'Boleto Bancário / TED',
      observacoes: 'Acordo de 10% sobre o proveito inicial homologado em juízo.',
    },
    {
      clienteNome: 'Indústria Metalúrgica Aliança Ltda',
      processoCnj: '5002194-81.2023.4.03.6100',
      descricao: 'Mensalidade / Partido Jurídico - Set/2026',
      tipo: 'Partido / Mensalidade',
      categoria: 'Partido Mensal',
      valor: 18500.00,
      diasVencimento: -7,
      status: 'Pago',
      formaPagamento: 'Pix',
      observacoes: 'Assessoria tributária contínua mensal.',
    },
    {
      clienteNome: 'Logística Express Distribuição',
      processoCnj: '1029384-11.2024.5.02.0042',
      descricao: 'Reembolso de Custas e Perito Judicial',
      tipo: 'Reembolso de Custas',
      categoria: 'Custas e Perícias',
      valor: 4200.00,
      diasVencimento: 1,
      status: 'Em Aberto',
      formaPagamento: 'Transferência Bancária',
      observacoes: 'Adiantamento para honorários prévios do perito médico.',
    },
    {
      clienteNome: 'TechSolutions Brasil S/A',
      processoCnj: '0089211-92.2023.8.26.0002',
      descricao: 'Honorários Contratuais - Execução',
      tipo: 'Contratual',
      categoria: 'Honorários Contratuais',
      valor: 22000.00,
      diasVencimento: 13,
      status: 'Em Aberto',
      formaPagamento: 'Boleto Bancário',
      observacoes: 'Parcela 2 de 4 referente ao ajuizamento da execução de título.',
    },
    {
      clienteNome: 'Dr. Roberto Albuquerque',
      processoCnj: '1004921-30.2024.8.26.0011',
      descricao: 'Honorários Sucumbenciais Fixados',
      tipo: 'Sucumbência',
      categoria: 'Honorários de Sucumbência',
      valor: 15300.00,
      diasVencimento: -12,
      status: 'Pago',
      formaPagamento: 'Depósito Judicial Levantado',
      observacoes: 'Alvará expedido e valor creditado na conta do escritório.',
    },
  ];

  for (const l of lancamentosData) {
    const cli = clientesCriados[l.clienteNome];
    const proc = l.processoCnj ? processosCriados[l.processoCnj] : null;

    const dataVenc = new Date();
    dataVenc.setDate(dataVenc.getDate() + l.diasVencimento);

    const existing = await prisma.lancamentoFinanceiro.findFirst({
      where: { sociedadeId: sociedade.id, descricao: l.descricao },
    });

    if (!existing) {
      await prisma.lancamentoFinanceiro.create({
        data: {
          sociedadeId: sociedade.id,
          clienteId: cli?.id || null,
          clienteNome: l.clienteNome,
          processoId: proc?.id || null,
          processoCnj: l.processoCnj,
          descricao: l.descricao,
          tipo: l.tipo,
          categoria: l.categoria,
          valor: l.valor,
          dataVencimento: dataVenc,
          dataPagamento: l.status === 'Pago' ? dataVenc : null,
          status: l.status,
          formaPagamento: l.formaPagamento,
          observacoes: l.observacoes,
        },
      });
      console.log(` Lançamento Financeiro configurado: ${l.descricao} (R$ ${l.valor})`);
    }
  }

  // 13. Central de Comunicações & Disparos WhatsApp (Etapa 6)
  const comunicacoesData = [
    {
      clienteNome: 'TechSolutions Brasil S/A',
      destinatario: '(11) 3214-5500',
      telefone: '1132145500',
      canal: 'WhatsApp',
      tipo: 'Lembrete de Audiência',
      processoCnj: '0014285-44.2024.8.26.0100',
      status: 'Entregue',
      texto: 'Prezada equipe TechSolutions Brasil, lembramos que hoje às 10:30 ocorrerá a Audiência de Instrução no processo 0014285-44.2024.8.26.0100 via Teams. O Dr. Maycon Silva estará presente 15 minutos antes. Segue o link de acesso...',
    },
    {
      clienteNome: 'Indústria Metalúrgica Aliança Ltda',
      destinatario: '(11) 4567-8899',
      telefone: '1145678899',
      canal: 'WhatsApp',
      tipo: 'Atualização de Andamento',
      processoCnj: '5002194-81.2023.4.03.6100',
      status: 'Lido',
      texto: 'Olá, equipe Metalúrgica Aliança! Informamos que o processo nº 5002194-81.2023.4.03.6100 foi pautado para julgamento no TRF3 para o dia 15/10/2026. Já providenciamos a inscrição para sustentação oral...',
    },
    {
      clienteNome: 'Dr. Roberto Albuquerque',
      destinatario: '(11) 98765-4321',
      telefone: '11987654321',
      canal: 'WhatsApp',
      tipo: 'Cobrança de Honorários com PIX',
      processoCnj: '1004921-30.2024.8.26.0011',
      status: 'Entregue',
      texto: 'Prezado Dr. Roberto, comunicamos a expedição do alvará e o encerramento da fase de cumprimento. Seguem os dados para acerto dos honorários contratuais de êxito via chave PIX...',
    },
  ];

  for (const c of comunicacoesData) {
    const cli = clientesCriados[c.clienteNome];

    const existing = await prisma.comunicacao.findFirst({
      where: { sociedadeId: sociedade.id, destinatario: c.destinatario, tipo: c.tipo },
    });

    if (!existing) {
      await prisma.comunicacao.create({
        data: {
          sociedadeId: sociedade.id,
          clienteId: cli?.id || null,
          clienteNome: c.clienteNome,
          destinatario: c.destinatario,
          telefone: c.telefone,
          canal: c.canal,
          tipo: c.tipo,
          processoCnj: c.processoCnj,
          status: c.status,
          texto: c.texto,
        },
      });
      console.log(` Comunicação WhatsApp configurada: ${c.destinatario} (${c.tipo})`);
    }
  }

  console.log(' Povoamento da Etapa 6 (Financeiro & Comunicação) concluído com sucesso!');
  console.log('   - 5 Lançamentos de Honorários e Contratos Financeiros configurados');
  console.log('   - 3 Comunicações e Disparos WhatsApp configurados');
}

main()
  .catch((e) => {
    console.error(' Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
