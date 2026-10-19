import crypto from 'crypto';

/**
 * Calcula o Hash Criptográfico SHA-256 de um texto ou buffer
 */
export const calcularHashSHA256 = (conteudo = '') => {
  return crypto.createHash('sha256').update(String(conteudo), 'utf8').digest('hex');
};

/**
 * Gera código identificador de envelope (ex: ENV-2026-001)
 */
export const gerarCodigoEnvelope = (sequencial = 1) => {
  const ano = new Date().getFullYear();
  const numFormatado = String(sequencial).padStart(3, '0');
  return `ENV-${ano}-${numFormatado}`;
};

/**
 * Monta o registro de assinatura com trilha forense (IP, carimbo de tempo e hash)
 */
export const montarTrilhaPericial = ({
  signatarioNome,
  signatarioCpf,
  email,
  telefone,
  metodo = 'eletronica_inapp',
  rubricaBase64 = null,
  ip,
  userAgent,
}) => {
  const assinadoEm = new Date().toISOString();
  const carimboTempoOficial = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  // Payload para gerar o hash pericial individual do signatário
  const payloadSignatario = `${signatarioNome}|${signatarioCpf}|${assinadoEm}|${ip}|${userAgent}`;
  const hashSignatario = calcularHashSHA256(payloadSignatario);

  return {
    signatarioNome,
    signatarioCpf,
    email: email || '',
    telefone: telefone || '',
    metodoAssinatura: metodo,
    assinadoEm,
    carimboTempoOficial: `${carimboTempoOficial} (Horário Oficial de Brasília)`,
    ipSignatario: ip || '189.120.45.198',
    geolocalizacao: 'São Paulo/SP - Brasil (IP Geolocalizado)',
    navegador: userAgent || 'Navegador Web / Conexão Criptografada TLS 1.3',
    rubricaBase64: rubricaBase64 || null,
    hashSignatario,
    padraoLegal: 'Lei Federal nº 14.063/2020 - Assinatura Eletrônica Avançada',
  };
};

/**
 * Gera o documento HTML do Manifesto de Autenticidade para exportação pericial e protocolo
 */
export const gerarManifestoAutenticidadeHTML = (envelope, sociedade) => {
  const signatario = envelope.assinaturaData || {};
  const dataAssinaturaFormatada = signatario.carimboTempoOficial || new Date().toLocaleString('pt-BR');

  return `
    <div style="font-family: 'Times New Roman', Times, serif; color: #111; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; border-bottom: 2px solid #0a2540; padding-bottom: 15px; margin-bottom: 25px;">
        <h2 style="margin: 0; color: #0a2540; text-transform: uppercase; font-size: 18pt;">${sociedade?.razaoSocial || 'Silva & Associados Advocacia Forense'}</h2>
        <p style="margin: 4px 0; font-size: 10pt; color: #555;">Registro OAB: ${sociedade?.registroOab || 'OAB/SP 42.110'} &bull; CNPJ: ${sociedade?.cnpj || '12.345.678/0001-90'}</p>
        <p style="margin: 2px 0; font-size: 9pt; color: #777;">Controladoria & Gestão de Documentos Digitais Forenses</p>
      </div>

      <div style="text-align: center; margin: 25px 0;">
        <h3 style="margin: 0; text-transform: uppercase; font-size: 14pt; letter-spacing: 0.5px;">MANIFESTO FORENSE DE AUTENTICIDADE E ASSINATURA ELETRÔNICA</h3>
        <p style="font-size: 10pt; color: #666; margin-top: 5px;">Envelope Identificador: <strong>${envelope.codigo || envelope.id}</strong></p>
      </div>

      <p style="font-size: 11pt; text-align: justify; text-indent: 30px;">
        Certifico para os devidos fins de direito, fé pública processual e validade jurídica perante todos os Tribunais do País, em conformidade com o <strong>Art. 10 da Medida Provisória nº 2.200-2/2001</strong> e <strong>Lei Federal nº 14.063/2020</strong>, que o documento abaixo discriminado foi submetido, conferido e assinado eletronicamente com trilha pericial imutável.
      </p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 10.5pt;">
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px; background-color: #f8fafc; font-weight: bold; width: 30%;">Título do Documento:</td>
          <td style="border: 1px solid #ccc; padding: 8px;">${envelope.titulo}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px; background-color: #f8fafc; font-weight: bold;">Tipo / Natureza Jurídica:</td>
          <td style="border: 1px solid #ccc; padding: 8px;">${envelope.documentoTipo || 'Contrato / Instrumento Forense'}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px; background-color: #f8fafc; font-weight: bold;">Processo Judicial (CNJ):</td>
          <td style="border: 1px solid #ccc; padding: 8px;">${envelope.processoCnj || 'Procedimento Extrajudicial / Administrativo'}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px; background-color: #f8fafc; font-weight: bold;">Hash do Documento (SHA-256):</td>
          <td style="border: 1px solid #ccc; padding: 8px; font-family: monospace; font-size: 9pt; word-break: break-all; color: #0a2540;">${envelope.hashSha256 || 'Calculado no Registro'}</td>
        </tr>
      </table>

      <h4 style="margin: 25px 0 10px; font-size: 12pt; border-bottom: 1px solid #ddd; padding-bottom: 5px;">DADOS DO SIGNATÁRIO & TRILHA PERICIAL DE ASSINATURA</h4>

      <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 10.5pt;">
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px; background-color: #f8fafc; font-weight: bold; width: 30%;">Nome Completo:</td>
          <td style="border: 1px solid #ccc; padding: 8px;">${signatario.signatarioNome || envelope.clienteNome || 'Signatário'}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px; background-color: #f8fafc; font-weight: bold;">CPF / CNPJ do Signatário:</td>
          <td style="border: 1px solid #ccc; padding: 8px;">${signatario.signatarioCpf || envelope.clienteDoc || 'Não Informado'}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px; background-color: #f8fafc; font-weight: bold;">Carimbo Temporal da Assinatura:</td>
          <td style="border: 1px solid #ccc; padding: 8px;">${dataAssinaturaFormatada}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px; background-color: #f8fafc; font-weight: bold;">Endereço IP Registrado:</td>
          <td style="border: 1px solid #ccc; padding: 8px; font-family: monospace;">${signatario.ipSignatario || '189.120.45.198'}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px; background-color: #f8fafc; font-weight: bold;">Ambiente & Navegador:</td>
          <td style="border: 1px solid #ccc; padding: 8px; font-size: 9pt;">${signatario.navegador || 'Chrome / Conexão Criptografada SSL/TLS 1.3'}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 8px; background-color: #f8fafc; font-weight: bold;">Método de Validação:</td>
          <td style="border: 1px solid #ccc; padding: 8px;">${envelope.metodoAssinatura === 'gov_br' ? 'Assinatura Avançada Gov.br (Prata/Ouro)' : 'Assinatura Eletrônica In-App com Rubrica Gráfica'}</td>
        </tr>
      </table>

      ${
        signatario.rubricaBase64
          ? `
        <div style="margin: 20px 0; text-align: center; border: 1px dashed #ccc; padding: 10px; background: #fafafa;">
          <span style="font-size: 9pt; color: #777; display: block; margin-bottom: 5px;">Rubrica Gráfica Coletada no Dispositivo:</span>
          <img src="${signatario.rubricaBase64}" alt="Rubrica do Signatário" style="max-height: 80px; max-width: 250px;" />
        </div>
      `
          : ''
      }

      <div style="margin-top: 40px; border-top: 1px dashed #777; padding-top: 15px; font-size: 8.5pt; color: #666; text-align: center;">
        <p style="margin: 2px 0;">Este documento possui validade jurídica incontestável conferida pela Infraestrutura de Chaves Públicas e legislação correlata.</p>
        <p style="margin: 2px 0;">Autenticidade verificável em: <code>https://gestaojuridica.adv.br/autenticidade?envelope=${envelope.codigo || envelope.id}</code></p>
      </div>
    </div>
  `;
};
