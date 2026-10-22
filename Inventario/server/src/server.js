import express from 'express';
import cors from 'cors';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  try {
    Database = require(path.resolve(process.cwd(), 'node_modules/better-sqlite3'));
  } catch (err) {
    try {
      Database = require(path.resolve(__dirname, '../../../node_modules/better-sqlite3'));
    } catch (err2) {
      try {
        Database = require('d:/LadingPage-Inventario/node_modules/better-sqlite3');
      } catch (err3) {
        throw new Error('Falha ao carregar better-sqlite3: ' + e.message);
      }
    }
  }
}
const pdfParse = require('pdf-parse');

// Intelligent DB path resolution (Cloud Linux / Docker vs Local Windows)
const possibleDbPaths = [
  process.env.DB_PATH,
  path.resolve(__dirname, '../../../inventario.sqlite'),
  path.resolve(__dirname, '../../inventario.sqlite'),
  path.resolve(__dirname, '../inventario.sqlite'),
  path.resolve(process.cwd(), 'inventario.sqlite'),
  path.resolve(process.cwd(), 'Inventario/inventario.sqlite'),
  'd:/LadingPage-Inventario/inventario.sqlite'
].filter(Boolean);

const DB_PATH = possibleDbPaths.find(p => fs.existsSync(p)) || path.resolve(__dirname, '../../../inventario.sqlite');
console.log(`[DB] Usando banco de dados em: ${DB_PATH} (Existe: ${fs.existsSync(DB_PATH)})`);

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL UNCAUGHT EXCEPTION]:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRITICAL UNHANDLED REJECTION]:', reason);
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

const db = new Database(DB_PATH);
try {
  db.pragma('journal_mode = DELETE');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 10000');
} catch (e) {
  console.warn('[DB Pragma warning]:', e.message);
}

// ==========================================
// TURSO CLOUD DATABASE REPLICATION & SYNC
// ==========================================
const TURSO_URL = (process.env.TURSO_DATABASE_URL || 'https://inventario-contagem-mayconmiguel.aws-sa-east-1.turso.io')
  .replace(/^libsql:\/\//, 'https://');
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTI1ODc0NDIsImlkIjoiMDFhMTVlODYtMmIwMS03ZTQwLTk5ODctZmY1NjY0NjUwOTc1Iiwia2lkIjoid0tuUjN5OGxoLW5SVDhBcXNGVkI4UlhYWG42dFBqX2h2VDVnRE9ybzY3QSIsInJpZCI6IjBkZjNlOWJmLWI0MGEtNDE0Ni1hMDI5LWE3M2M3NTIxOTg4OSJ9.4XZyt_vTPcQZIkmk8qEgAPtCCpRhRTCKDGECCJHOBAV9rjO0kMczi95NCEGEmLem9NBR9VGxiNxLq5Dx5y6qAg';

let lastTursoSyncTime = null;
let lastTursoStatus = 'Iniciando conexão...';
let isSyncingTurso = false;

function valueToTursoArg(val) {
  if (val === null || val === undefined) return { type: 'null' };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { type: 'integer', value: String(val) } : { type: 'float', value: val };
  }
  if (typeof val === 'bigint') return { type: 'integer', value: String(val) };
  return { type: 'text', value: String(val) };
}

async function executeTurso(sql, args = []) {
  if (!TURSO_URL || !TURSO_TOKEN) return null;
  try {
    const formattedArgs = args.map(valueToTursoArg);
    const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TURSO_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          { type: 'execute', stmt: { sql, args: formattedArgs } },
          { type: 'close' }
        ]
      })
    });
    return await res.json();
  } catch (err) {
    console.error('[Turso Execution Error]:', err.message);
    return null;
  }
}

async function executeTursoBatch(stmts) {
  if (!TURSO_URL || !TURSO_TOKEN || !stmts.length) return null;
  try {
    const requests = stmts.map(s => ({
      type: 'execute',
      stmt: {
        sql: s.sql,
        args: (s.args || []).map(valueToTursoArg)
      }
    }));
    requests.push({ type: 'close' });

    const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TURSO_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    });
    return await res.json();
  } catch (err) {
    console.error('[Turso Batch Error]:', err.message);
    return null;
  }
}

function tursoResultToObjects(result) {
  if (!result || !result.cols || !result.rows) return [];
  const colNames = result.cols.map(c => c.name);
  return result.rows.map(row => {
    const obj = {};
    row.forEach((cell, idx) => {
      const col = colNames[idx];
      if (cell.type === 'null') obj[col] = null;
      else if (cell.type === 'integer') obj[col] = Number(cell.value);
      else if (cell.type === 'float') obj[col] = cell.value;
      else obj[col] = cell.value;
    });
    return obj;
  });
}

async function syncRecordToTurso(tableName, id) {
  if (!TURSO_URL || !TURSO_TOKEN || !id) return;
  try {
    const row = db.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`).get(id);
    if (!row) return;
    const cols = Object.keys(row);
    const colList = cols.map(c => `"${c}"`).join(', ');
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT OR REPLACE INTO "${tableName}" (${colList}) VALUES (${placeholders})`;
    const args = cols.map(c => row[c]);
    await executeTurso(sql, args);
  } catch (e) {
    console.error(`[Turso Sync ${tableName}] error:`, e.message);
  }
}

async function syncCodesToTurso(tableName, codes) {
  if (!TURSO_URL || !TURSO_TOKEN || !codes || !codes.length) return;
  try {
    const uniqueCodes = [...new Set(codes.filter(Boolean))];
    const placeholders = uniqueCodes.map(() => '?').join(', ');
    const rows = db.prepare(`SELECT * FROM "${tableName}" WHERE codigo_bipado IN (${placeholders}) OR codigo_normalizado IN (${placeholders})`).all(...uniqueCodes, ...uniqueCodes);
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const colList = cols.map(c => `"${c}"`).join(', ');
    const valPlaceholders = cols.map(() => '?').join(', ');
    const sql = `INSERT OR REPLACE INTO "${tableName}" (${colList}) VALUES (${valPlaceholders})`;
    const stmts = rows.map(r => ({ sql, args: cols.map(c => r[c]) }));
    await executeTursoBatch(stmts);
  } catch (e) {
    console.error(`[Turso Sync Codes ${tableName}] error:`, e.message);
  }
}

async function syncBatchToTurso(tableName, ids) {
  if (!TURSO_URL || !TURSO_TOKEN || !ids || !ids.length) return;
  try {
    const placeholders = ids.map(() => '?').join(', ');
    const rows = db.prepare(`SELECT * FROM "${tableName}" WHERE id IN (${placeholders})`).all(...ids);
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const colList = cols.map(c => `"${c}"`).join(', ');
    const placeholdersVals = cols.map(() => '?').join(', ');
    const sql = `INSERT OR REPLACE INTO "${tableName}" (${colList}) VALUES (${placeholdersVals})`;
    const stmts = rows.map(r => ({ sql, args: cols.map(c => r[c]) }));
    await executeTursoBatch(stmts);
  } catch (e) {
    console.error(`[Turso Batch ${tableName}] error:`, e.message);
  }
}

async function syncDeleteToTurso(tableName, ids) {
  if (!TURSO_URL || !TURSO_TOKEN || !ids || !ids.length) return;
  try {
    const placeholders = ids.map(() => '?').join(', ');
    await executeTurso(`DELETE FROM "${tableName}" WHERE id IN (${placeholders})`, ids);
  } catch (err) {
    console.error(`[Turso Delete ${tableName}] error:`, err.message);
  }
}

async function syncResetToTurso() {
  if (!TURSO_URL || !TURSO_TOKEN) return;
  try {
    await executeTurso('DELETE FROM conferencias_galpao');
    await executeTurso('DELETE FROM lotes_romaneio_emc');
  } catch (e) {
    console.error('[Turso Reset error]:', e.message);
  }
}

async function syncFromTurso() {
  if (!TURSO_URL || !TURSO_TOKEN || isSyncingTurso) return;
  isSyncingTurso = true;
  try {
    console.log('[Turso] Sincronizando dados da nuvem Turso para o banco SQLite local...');
    
    // 1. Sincronizar conferencias_galpao
    const resGalpao = await executeTurso('SELECT * FROM conferencias_galpao');
    if (resGalpao && resGalpao.results && resGalpao.results[0]?.response?.result) {
      const rows = tursoResultToObjects(resGalpao.results[0].response.result);
      if (rows.length > 0) {
        const cols = Object.keys(rows[0]);
        const colList = cols.map(c => `"${c}"`).join(', ');
        const placeholders = cols.map(c => `@${c}`).join(', ');
        const upsert = db.prepare(`INSERT OR REPLACE INTO conferencias_galpao (${colList}) VALUES (${placeholders})`);
        const runTx = db.transaction((items) => {
          for (const it of items) upsert.run(it);
        });
        runTx(rows);
        console.log(`[Turso] Sincronizados ${rows.length} itens em conferencias_galpao.`);
      }
    }

    // 2. Sincronizar lotes_romaneio_emc
    const resLotes = await executeTurso('SELECT * FROM lotes_romaneio_emc');
    if (resLotes && resLotes.results && resLotes.results[0]?.response?.result) {
      const lotes = tursoResultToObjects(resLotes.results[0].response.result);
      if (lotes.length > 0) {
        const cols = Object.keys(lotes[0]);
        const colList = cols.map(c => `"${c}"`).join(', ');
        const placeholders = cols.map(c => `@${c}`).join(', ');
        const upsertLote = db.prepare(`INSERT OR REPLACE INTO lotes_romaneio_emc (${colList}) VALUES (${placeholders})`);
        const runLotesTx = db.transaction((items) => {
          for (const l of items) upsertLote.run(l);
        });
        runLotesTx(lotes);
        console.log(`[Turso] Sincronizados ${lotes.length} lotes de romaneio.`);
      }
    }

    lastTursoSyncTime = new Date().toLocaleString('pt-BR');
    lastTursoStatus = 'Conectado e Sincronizado';
    invalidateCache();
  } catch (err) {
    console.error('[Turso Sync Error]:', err.message);
    lastTursoStatus = `Erro: ${err.message}`;
  } finally {
    isSyncingTurso = false;
  }
}

// Ensure tables & columns
db.exec(`
  CREATE TABLE IF NOT EXISTS base_contratual_emc (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item TEXT,
    n_serie TEXT,
    nfe_remessa TEXT,
    descricao TEXT,
    software TEXT,
    valor_mensal TEXT,
    tipo_estimado TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_bce_item ON base_contratual_emc(item);
  CREATE INDEX IF NOT EXISTS idx_bce_serie ON base_contratual_emc(n_serie);

  CREATE TABLE IF NOT EXISTS lotes_romaneio_emc (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_romaneio TEXT UNIQUE NOT NULL,
    data_criacao TEXT DEFAULT (datetime('now', 'localtime')),
    data_fechamento TEXT,
    status TEXT DEFAULT 'aberto',
    transportadora TEXT,
    motorista_nome TEXT,
    motorista_rg_cnh TEXT,
    placa_veiculo TEXT,
    responsavel_ti TEXT,
    total_cpus INTEGER DEFAULT 0,
    total_monitores INTEGER DEFAULT 0,
    total_notebooks INTEGER DEFAULT 0,
    total_geral INTEGER DEFAULT 0,
    comprovante_pdf_emc TEXT,
    observacoes TEXT
  );

  CREATE TABLE IF NOT EXISTS conferencias_galpao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_bipado TEXT NOT NULL,
    codigo_normalizado TEXT,
    tipo_equipamento TEXT NOT NULL,
    localidade_coletada TEXT NOT NULL,
    status_conciliacao TEXT NOT NULL,
    status_etapa TEXT DEFAULT 'aguardando_retirada_emc',
    inventario_row_id INTEGER,
    contrato_emc_id INTEGER,
    secretaria_prevista TEXT,
    secretaria_coletada TEXT,
    servidor_previsto TEXT,
    origem_registro TEXT NOT NULL,
    arquivo_origem TEXT,
    data_hora_coleta TEXT,
    data_hora_baixa_emc TEXT,
    comprovante_baixa_emc TEXT,
    tipo_baixa_emc TEXT,
    observacao TEXT,
    lote_romaneio_id INTEGER REFERENCES lotes_romaneio_emc(id),
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_conf_codigo ON conferencias_galpao(codigo_bipado);
  CREATE INDEX IF NOT EXISTS idx_conf_norm ON conferencias_galpao(codigo_normalizado);
  CREATE INDEX IF NOT EXISTS idx_conf_status ON conferencias_galpao(status_conciliacao);
`);

// Backward compatibility for existing databases: ensure new columns
try { db.exec("ALTER TABLE conferencias_galpao ADD COLUMN status_etapa TEXT DEFAULT 'aguardando_retirada_emc'"); } catch(e) {}
try { db.exec("ALTER TABLE conferencias_galpao ADD COLUMN data_hora_baixa_emc TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE conferencias_galpao ADD COLUMN comprovante_baixa_emc TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE conferencias_galpao ADD COLUMN tipo_baixa_emc TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE conferencias_galpao ADD COLUMN contrato_emc_id INTEGER"); } catch(e) {}
try { db.exec("ALTER TABLE lotes_romaneio_emc ADD COLUMN comprovante_pdf_emc TEXT"); } catch(e) {}

try {
  db.exec("CREATE INDEX IF NOT EXISTS idx_conf_etapa ON conferencias_galpao(status_etapa)");
} catch (e) {}

// --- SMART MATCHING CACHE ---
let cacheTimestamp = 0;
let cachedBase = null;
let cachedCompiledContrato = null;
let cachedCompiledEquipamentos = null;
let cachedDashboardStats = null;
let cachedAuditoriaData = null;

const EXACT_JUNK_SET = new Set([
  'NA', 'N/A', 'NT', 'N/T', 'ND', 'SN', 'S/N', 'S/P', 'SIM', 'COMPUTADOR', 'NOTEBOOK', 'NOTBOOK', 'TELEVISÃO', 'TELEVISAO',
  'X', 'XX', 'XXX', 'XXXX', 'XXXXX', 'XXXXXX', 'X.X.X.', 'X.X.X.X', 'INDEFINIDO'
]);

const JUNK_PATTERNS = [
  /N[ÃA]O/i, /NAO/i, /POSSU[IE]/i, /SEI/i, /APLICA/i, /ALICA/i, /XXXX/i,
  /^NA$/i, /^NT$/i, /^N\/T$/i, /^ND$/i, /SEM\s/i, /NENHUM/i, /DESCONHEC/i, /INFORMA/i,
  /COMPENSA[ÇC][ÃA]O/i, /SOMENTE\s+NOTEBOOK/i, /AUS[ÊE]NCIA/i, /AUSENCIA/i, /TENHO\s+UM/i,
  /TENHO\s+DUAS/i, /N[ÃA]O\s+USO/i, /C[ÓO]DIGO\s+DE\s+BARRA/i, /MANUTEN[ÇC][ÃA]O/i,
  /PARTICULAR/i, /DOA[ÇC][ÃA]O/i, /RECEITA\s+FEDERAL/i, /FAVOR\s+DAR\s+BAIXA/i,
  /NOTEBOOK\s+PESSOAL/i, /\(31\)/, /RUA\s+RIO/i
];

function isJunkCodeText(val) {
  if (!val) return true;
  const s = String(val).trim().toUpperCase();
  if (!s || s === '-' || s === '--' || s === '---' || s === 'NULL' || s === '0' || s === '*' || s === '..') return true;
  if (EXACT_JUNK_SET.has(s)) return true;
  if (/^X+$/i.test(s) || /^X(\.X)+$/i.test(s)) return true;
  return JUNK_PATTERNS.some(p => p.test(s));
}

const REGEX_PREFIX_CORP = /^(EMC|CMC|EMS|PMC)\s*[-:_.]?\s*/i;
const REGEX_PREFIX_LABEL = /^(N[º°.]|TAG|PATRIM[ÔO]NIO|C[ÓO]DIGO\s+DE\s+BARRAS?)\s*[-:_.]?\s*/i;
const REGEX_PREFIX_SIM = /^SIM\s*[-–]\s*N[º°.]?\s*/i;
const REGEX_PREFIX_MONITOR = /^MONITOR\s*\d*\s*[-–]\s*/i;
const REGEX_TRAILING_NOTE = /\s*[-–]\s*(EMC|IMOBILIZADO).*$/i;
const REGEX_PAREN_EMC = /\s*\(\s*EMC\s*\).*$/i;
const REGEX_THOUSANDS_DOT = /^\d{3}\.\d{3}$/;
const REGEX_TRAILING_DOT = /\.+$/;
const REGEX_LEADING_DIGITS = /^(\d{5,8})/;

function cleanAssetCode(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  s = s.replace(REGEX_PREFIX_CORP, '');
  s = s.replace(REGEX_PREFIX_LABEL, '');
  s = s.replace(REGEX_PREFIX_SIM, '');
  s = s.replace(REGEX_PREFIX_MONITOR, '');
  s = s.replace(REGEX_TRAILING_NOTE, '');
  s = s.replace(REGEX_PAREN_EMC, '');
  if (REGEX_THOUSANDS_DOT.test(s)) {
    s = s.replace('.', '');
  }
  s = s.replace(REGEX_TRAILING_DOT, '');
  const matchDigits = s.match(REGEX_LEADING_DIGITS);
  if (matchDigits) {
    s = matchDigits[1];
  }
  return s.trim();
}

function normalizeCode(raw) {
  if (!raw) return '';
  return cleanAssetCode(raw).toUpperCase();
}

function getLookupMaps() {
  if (cachedBase) {
    return cachedBase;
  }

  // 1. Contract items (4,344 from EMC)
  let contractItems = [];
  try {
    contractItems = db.prepare("SELECT * FROM base_contratual_emc").all();
  } catch (err) {
    console.error('[DB Error] base_contratual_emc:', err.message);
  }
  const contractByItem = new Map();
  const contractBySerie = new Map();

  for (const c of contractItems) {
    if (c.item) {
      const it = String(c.item).trim().toUpperCase();
      contractByItem.set(it, c);
      if (it.length === 6 && it.startsWith('1')) {
        contractByItem.set(it.substring(1), c);
        contractByItem.set('1000' + it.substring(1), c);
      } else if (it.length === 5) {
        contractByItem.set('1' + it, c);
        contractByItem.set('1000' + it, c);
      } else if (it.startsWith('1000') && it.length === 9) {
        const suf = it.substring(4);
        contractByItem.set(suf, c);
        contractByItem.set('1' + suf, c);
      }
    }
    if (c.n_serie) {
      const ser = String(c.n_serie).trim().toUpperCase();
      contractBySerie.set(ser, c);
    }
  }

  // 2. Form items (1,960 records from employees)
  let formRows = [];
  try {
    formRows = db.prepare("SELECT id, row_json, status_logistica FROM inventario_rows").all();
  } catch (err) {
    console.error('[DB Error] inventario_rows:', err.message);
  }
  const formByCode = new Map();
  const parsedFormRows = [];

  function registerFormKey(key, rowObj) {
    if (!key) return;
    const raw = String(key).trim();
    if (!raw || isJunkCodeText(raw)) return;
    const str = cleanAssetCode(raw).toUpperCase();
    if (!str || isJunkCodeText(str) || str === '-' || str === 'NULL' || str === 'INDEFINIDO') return;

    formByCode.set(str, rowObj);
    if (str.length === 6 && str.startsWith('1')) {
      formByCode.set(str.substring(1), rowObj);
      formByCode.set('1000' + str.substring(1), rowObj);
    } else if (str.length === 5) {
      formByCode.set('1' + str, rowObj);
      formByCode.set('1000' + str, rowObj);
    } else if (str.startsWith('1000') && str.length === 9) {
      const suffix = str.substring(4);
      formByCode.set(suffix, rowObj);
      formByCode.set('1' + suffix, rowObj);
    }
  }

  for (const r of formRows) {
    try {
      const data = JSON.parse(r.row_json) || {};
      const rowObj = {
        id: r.id,
        status_logistica: r.status_logistica,
        data,
        secretaria: data.Secretaria || null,
        servidor: data['Nome completo do servidor'] || null,
        unidade: data['Nome da unidade onde o equipamento está instalado'] || null,
        matricula: data['Matrícula do servidor'] || data['Matrícula'] || '-',
        telefone: data['Telefone do responsável pelo equipamento'] || '-',
        endereco: data['Endereço'] || (data['Logradouro'] ? `${data['Logradouro']}, ${data['Número'] || 'S/N'}` : '-'),
        cpu: data['Patrimônio da CPU'] || null,
        notebook: data['Patrimônio do Notebook'] || null,
        monitor: data['Patrimônio do Monitor'] || null,
        monitorAvulso: data['Patrimônio do Monitor Avulso'] || null
      };
      parsedFormRows.push(rowObj);

      registerFormKey(rowObj.cpu, rowObj);
      registerFormKey(rowObj.notebook, rowObj);
      registerFormKey(rowObj.monitor, rowObj);
      registerFormKey(rowObj.monitorAvulso, rowObj);
    } catch (e) {}
  }

  cachedBase = { contractItems, contractByItem, contractBySerie, parsedFormRows, formByCode };
  cacheTimestamp = Date.now();
  return cachedBase;
}

// Invalidate all caches on write operations
function invalidateCache() {
  cachedBase = null;
  cacheTimestamp = 0;
  cachedCompiledContrato = null;
  cachedCompiledEquipamentos = null;
  cachedDashboardStats = null;
  cachedAuditoriaData = null;
}

// Pre-compiled Contrato Data & KPIs
function getCompiledContrato() {
  if (cachedCompiledContrato) return cachedCompiledContrato;

  try {
    const { contractItems, formByCode } = getLookupMaps();
    let warehouseRows = [];
    try {
      warehouseRows = db.prepare("SELECT * FROM conferencias_galpao").all() || [];
    } catch (e) {
      console.error('[DB Error] conferencias_galpao in getCompiledContrato:', e.message);
    }

    const whByCode = new Map();
    for (const w of warehouseRows) {
      if (w.codigo_bipado) whByCode.set(String(w.codigo_bipado).trim().toUpperCase(), w);
      if (w.codigo_normalizado) whByCode.set(String(w.codigo_normalizado).trim().toUpperCase(), w);
    }

    const matchedWhIds = new Set();
    const list = contractItems.map(item => {
      const itUpper = String(item.item || '').trim().toUpperCase();
      const serUpper = item.n_serie ? String(item.n_serie).trim().toUpperCase() : '';
      const matchForm = formByCode.get(itUpper) || (serUpper ? formByCode.get(serUpper) : null);
      const matchWarehouse = whByCode.get(itUpper) || (serUpper ? whByCode.get(serUpper) : null);

      let statusLogistico = 'em_campo';
      let comprovanteBaixa = null;
      let dataBaixa = null;
      let tipoBaixa = null;

      if (matchWarehouse) {
        matchedWhIds.add(matchWarehouse.id);
        statusLogistico = matchWarehouse.status_etapa === 'devolvido_emc' ? 'devolvido_emc' : 'no_galpao';
        comprovanteBaixa = matchWarehouse.comprovante_baixa_emc || null;
        dataBaixa = matchWarehouse.data_hora_baixa_emc || null;
        tipoBaixa = matchWarehouse.tipo_baixa_emc || null;
      }

      return {
        id: `contrato_${item.id}`,
        item: item.item,
        n_serie: item.n_serie || '-',
        descricao: item.descricao,
        tipo_estimado: item.tipo_estimado,
        nfe_remessa: item.nfe_remessa || '-',
        software: item.software || '-',
        valor_mensal: item.valor_mensal || '-',
        secretariaDeclarada: matchForm ? (matchForm.secretaria || matchForm.data?.Secretaria || null) : null,
        servidorDeclarado: matchForm ? (matchForm.servidor || matchForm.data?.['Nome completo do servidor'] || null) : null,
        unidadeDeclarada: matchForm ? (matchForm.unidade || matchForm.data?.['Nome da unidade onde o equipamento está instalado'] || null) : null,
        declaradoNoForm: !!matchForm,
        statusLogistico,
        comprovanteBaixa,
        dataBaixa,
        tipoBaixa,
        origem: 'base_contratual'
      };
    });

    for (const w of warehouseRows) {
      if (!matchedWhIds.has(w.id)) {
        list.push({
          id: `galpao_${w.id}`,
          item: w.codigo_bipado,
          n_serie: typeof w.observacao === 'string' && w.observacao.includes('Serial:') ? (w.observacao.match(/Serial:\s*([A-Za-z0-9]+)/) || [])[1] || '-' : '-',
          descricao: `${w.tipo_equipamento} (Ativo Coletado / Devolvido EMC - Contrato 22645)`,
          tipo_estimado: w.tipo_equipamento,
          nfe_remessa: w.comprovante_baixa_emc || '-',
          software: '-',
          valor_mensal: '-',
          secretariaDeclarada: (w.secretaria_prevista && w.secretaria_prevista !== 'Não Mapeada') ? w.secretaria_prevista : (w.secretaria_coletada || null),
          servidorDeclarado: (w.servidor_previsto && w.servidor_previsto !== 'Não Declarado') ? w.servidor_previsto : null,
          unidadeDeclarada: w.localidade_coletada || null,
          declaradoNoForm: !!(w.secretaria_prevista && w.secretaria_prevista !== 'Não Mapeada'),
          statusLogistico: w.status_etapa === 'devolvido_emc' ? 'devolvido_emc' : 'no_galpao',
          comprovanteBaixa: w.comprovante_baixa_emc || null,
          dataBaixa: w.data_hora_baixa_emc || null,
          tipoBaixa: w.tipo_baixa_emc || null,
          origem: 'galpao_conferencia'
        });
      }
    }

    let emCampo = 0, noGalpao = 0, devolvidoEMC = 0, mapeadosForm = 0, semMapeamento = 0;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it.statusLogistico === 'em_campo') emCampo++;
      else if (it.statusLogistico === 'no_galpao') noGalpao++;
      else if (it.statusLogistico === 'devolvido_emc') devolvidoEMC++;
      if (it.declaradoNoForm) mapeadosForm++;
      else semMapeamento++;
    }

    const kpis = {
      total: list.length,
      emCampo,
      noGalpao,
      devolvidoEMC,
      mapeadosForm,
      semMapeamento
    };

    cachedCompiledContrato = { list, kpis };
    return cachedCompiledContrato;
  } catch (err) {
    console.error('[CRITICAL getCompiledContrato Error]:', err);
    return {
      list: [],
      kpis: { total: 0, emCampo: 0, noGalpao: 0, devolvidoEMC: 0, mapeadosForm: 0, semMapeamento: 0 }
    };
  }
}

// Pre-compiled Equipamentos Data & KPIs
function getCompiledEquipamentos() {
  if (cachedCompiledEquipamentos) return cachedCompiledEquipamentos;

  try {
    const { parsedFormRows } = getLookupMaps();
    let confRows = [];
    try {
      confRows = db.prepare("SELECT * FROM conferencias_galpao").all() || [];
    } catch (e) {
      console.error('[DB Error] conferencias_galpao in getCompiledEquipamentos:', e.message);
    }

    const confByRowId = new Map();
    const confByCode = new Map();

    for (const c of confRows) {
      if (c.inventario_row_id) confByRowId.set(c.inventario_row_id, c);
      if (c.codigo_bipado) confByCode.set(String(c.codigo_bipado).trim().toUpperCase(), c);
      if (c.codigo_normalizado) confByCode.set(String(c.codigo_normalizado).trim().toUpperCase(), c);
    }

    const items = parsedFormRows.map(r => {
      const rowConf = confByRowId.get(r.id);
      const d = r.data || {};

      const cpuRaw = r.cpu || d['Patrimônio da CPU'] || '';
      const monRaw = r.monitor || d['Patrimônio do Monitor'] || '';
      const monAvRaw = r.monitorAvulso || d['Patrimônio do Monitor Avulso'] || '';
      const noteRaw = r.notebook || d['Patrimônio do Notebook'] || '';

      const cpuClean = cpuRaw && cpuRaw !== '-' ? cleanAssetCode(cpuRaw).toUpperCase() : '';
      const monClean = monRaw && monRaw !== '-' ? cleanAssetCode(monRaw).toUpperCase() : '';
      const monAvClean = monAvRaw && monAvRaw !== '-' ? cleanAssetCode(monAvRaw).toUpperCase() : '';
      const noteClean = noteRaw && noteRaw !== '-' ? cleanAssetCode(noteRaw).toUpperCase() : '';

      const matchCpu = cpuClean ? confByCode.get(cpuClean) : null;
      const matchMon = monClean ? confByCode.get(monClean) : null;
      const matchMonAv = monAvClean ? confByCode.get(monAvClean) : null;
      const matchNote = noteClean ? confByCode.get(noteClean) : null;

      let statusConf = 'pendente';
      const confList = [matchCpu, matchMon, matchMonAv, matchNote, rowConf].filter(Boolean);

      let bestConf = null;
      if (confList.some(c => c.status_etapa === 'devolvido_emc')) {
        statusConf = 'devolvido_emc';
        bestConf = confList.find(c => c.status_etapa === 'devolvido_emc');
      } else if (confList.some(c => c.status_etapa === 'aguardando_retirada_emc' || !c.status_etapa)) {
        statusConf = 'no_galpao';
        bestConf = confList.find(c => c.status_etapa === 'aguardando_retirada_emc' || !c.status_etapa);
      }

      return {
        id: r.id,
        servidor: r.servidor || d['Nome completo do servidor'] || 'Não informado',
        matricula: r.matricula || d['Matrícula do servidor'] || d['Matrícula'] || '-',
        telefone: r.telefone || d['Telefone do responsável pelo equipamento'] || '-',
        endereco: r.endereco || d['Endereço'] || (d['Logradouro'] ? `${d['Logradouro']}, ${d['Número'] || 'S/N'} - ${d['Bairro'] || ''}` : '-'),
        secretaria: r.secretaria || d.Secretaria || 'Não informada',
        unidade: r.unidade || d['Nome da unidade onde o equipamento está instalado'] || '-',
        cpu: cpuRaw || '-',
        cpuStatus: matchCpu ? (matchCpu.status_etapa === 'devolvido_emc' ? 'devolvido_emc' : 'no_galpao') : 'pendente',
        monitor: monRaw || '-',
        monitorStatus: matchMon ? (matchMon.status_etapa === 'devolvido_emc' ? 'devolvido_emc' : 'no_galpao') : 'pendente',
        monitorAvulso: monAvRaw || '-',
        notebook: noteRaw || '-',
        notebookStatus: matchNote ? (matchNote.status_etapa === 'devolvido_emc' ? 'devolvido_emc' : 'no_galpao') : 'pendente',
        statusConferencia: statusConf,
        comprovanteBaixa: bestConf ? bestConf.comprovante_baixa_emc : null,
        dataConferencia: bestConf ? (bestConf.data_hora_baixa_emc || bestConf.data_hora_coleta || bestConf.created_at) : null
      };
    });

    let devolvidos = 0, noGalpao = 0, pendentes = 0;
    const secSet = new Set();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.statusConferencia === 'devolvido_emc') devolvidos++;
      else if (item.statusConferencia === 'no_galpao') noGalpao++;
      else pendentes++;
      if (item.secretaria && item.secretaria !== 'Não informada') secSet.add(item.secretaria.trim());
    }

    const kpis = {
      total: items.length,
      devolvidos,
      noGalpao,
      pendentes,
      secretariasCount: secSet.size
    };
    const secretariasDisponiveis = Array.from(secSet).sort();

    cachedCompiledEquipamentos = { items, kpis, secretariasDisponiveis };
    return cachedCompiledEquipamentos;
  } catch (err) {
    console.error('[CRITICAL getCompiledEquipamentos Error]:', err);
    return {
      items: [],
      kpis: { total: 0, devolvidos: 0, noGalpao: 0, pendentes: 0, secretariasCount: 0 },
      secretariasDisponiveis: []
    };
  }
}

// Pre-compiled Dashboard Stats
function getCompiledStats() {
  if (cachedDashboardStats) return cachedDashboardStats;

  try {
    const { contractItems, parsedFormRows, formByCode } = getLookupMaps();
    const totalContratadoEMC = contractItems.length;
    const totalFormularioServidores = parsedFormRows.length;

    let contratadosDeclaradosNoForm = 0;
    for (const c of contractItems) {
      const code = String(c.item).toUpperCase();
      const serie = c.n_serie ? String(c.n_serie).toUpperCase() : '';
      if (formByCode.has(code) || (serie && formByCode.has(serie))) {
        contratadosDeclaradosNoForm++;
      }
    }
    const contratadosSemFormulario = Math.max(0, totalContratadoEMC - contratadosDeclaradosNoForm);

    let galpaoStats = { total: 0, cpus: 0, monitores: 0, notebooks: 0 };
    try {
      galpaoStats = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN tipo_equipamento = 'CPU' THEN 1 ELSE 0 END) as cpus,
          SUM(CASE WHEN tipo_equipamento = 'MONITOR' THEN 1 ELSE 0 END) as monitores,
          SUM(CASE WHEN tipo_equipamento = 'NOTEBOOK' THEN 1 ELSE 0 END) as notebooks
        FROM conferencias_galpao
        WHERE status_etapa = 'aguardando_retirada_emc' OR status_etapa IS NULL
      `).get() || {};
    } catch (e) {
      console.error('[DB Error] galpaoStats:', e.message);
    }

    const totalAguardandoEMC = galpaoStats.total || 0;
    const cpusGalpao = galpaoStats.cpus || 0;
    const monitoresGalpao = galpaoStats.monitores || 0;
    const notebooksGalpao = galpaoStats.notebooks || 0;

    let devolvidosStats = { total: 0, cpus: 0, monitores: 0, notebooks: 0 };
    try {
      devolvidosStats = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN tipo_equipamento = 'CPU' THEN 1 ELSE 0 END) as cpus,
          SUM(CASE WHEN tipo_equipamento = 'MONITOR' THEN 1 ELSE 0 END) as monitores,
          SUM(CASE WHEN tipo_equipamento = 'NOTEBOOK' THEN 1 ELSE 0 END) as notebooks
        FROM conferencias_galpao
        WHERE status_etapa = 'devolvido_emc'
      `).get() || {};
    } catch (e) {
      console.error('[DB Error] devolvidosStats:', e.message);
    }

    const totalDevolvidosEMC = devolvidosStats.total || 0;
    const cpusDevolvidos = devolvidosStats.cpus || 0;
    const monitoresDevolvidos = devolvidosStats.monitores || 0;
    const notebooksDevolvidos = devolvidosStats.notebooks || 0;

    const totalConferidos = totalAguardandoEMC + totalDevolvidosEMC;
    const totalEmCampo = Math.max(0, totalContratadoEMC - totalConferidos);

    let conciliationBreakdown = [];
    try {
      conciliationBreakdown = db.prepare(`
        SELECT status_conciliacao, COUNT(*) as count 
        FROM conferencias_galpao 
        GROUP BY status_conciliacao
      `).all() || [];
    } catch (e) {
      console.error('[DB Error] conciliationBreakdown:', e.message);
    }

    let totalConformes = 0;
    let totalDeslocados = 0;
    let totalExcedentes = 0;
    for (const row of conciliationBreakdown) {
      if (row.status_conciliacao === 'conforme') totalConformes += row.count;
      else if (row.status_conciliacao === 'deslocado') totalDeslocados += row.count;
      else if (row.status_conciliacao && row.status_conciliacao.startsWith('excedente')) totalExcedentes += row.count;
    }

    const secMap = new Map();
    for (const r of parsedFormRows) {
      const sec = (r.data?.Secretaria || 'NÃO DEFINIDA').trim().toUpperCase();
      if (!secMap.has(sec)) {
        secMap.set(sec, { secretaria: sec, previsto: 0, noGalpao: 0, devolvidoEMC: 0, excedente: 0, faltante: 0 });
      }
      secMap.get(sec).previsto++;
    }

    let checkedBySec = [];
    try {
      checkedBySec = db.prepare(`
        SELECT 
          COALESCE(secretaria_prevista, secretaria_coletada) as sec,
          status_conciliacao,
          status_etapa,
          COUNT(*) as count
        FROM conferencias_galpao
        GROUP BY sec, status_conciliacao, status_etapa
      `).all() || [];
    } catch (e) {
      console.error('[DB Error] checkedBySec:', e.message);
    }

    for (const item of checkedBySec) {
      const secName = (item.sec || 'NÃO DEFINIDA').trim().toUpperCase();
      if (!secMap.has(secName)) {
        secMap.set(secName, { secretaria: secName, previsto: 0, noGalpao: 0, devolvidoEMC: 0, excedente: 0, faltante: 0 });
      }
      const entry = secMap.get(secName);
      if (item.status_etapa === 'devolvido_emc') {
        entry.devolvidoEMC += item.count;
      } else {
        entry.noGalpao += item.count;
      }
      if (item.status_conciliacao && item.status_conciliacao.startsWith('excedente')) {
        entry.excedente += item.count;
      }
    }

    for (const [_, entry] of secMap) {
      const totalConferidoSec = entry.noGalpao + entry.devolvidoEMC;
      entry.faltante = Math.max(0, entry.previsto - totalConferidoSec);
    }

    const secretariasList = Array.from(secMap.values());

    const contractTypeCounts = { cpus: 0, monitores: 0, notebooks: 0, outros: 0 };
    for (const c of contractItems) {
      const t = (c.tipo_estimado || '').toUpperCase();
      if (t === 'CPU') contractTypeCounts.cpus++;
      else if (t === 'MONITOR') contractTypeCounts.monitores++;
      else if (t === 'NOTEBOOK') contractTypeCounts.notebooks++;
      else contractTypeCounts.outros++;
    }

    let lotesList = [];
    try {
      lotesList = db.prepare("SELECT * FROM lotes_romaneio_emc ORDER BY id DESC LIMIT 5").all() || [];
    } catch (e) {}

    let returnsByDoc = [];
    try {
      returnsByDoc = db.prepare(`
        SELECT comprovante_baixa_emc, tipo_equipamento, count(1) as count, min(data_hora_baixa_emc) as data
        FROM conferencias_galpao
        WHERE status_etapa = 'devolvido_emc'
        GROUP BY comprovante_baixa_emc, tipo_equipamento
        ORDER BY data DESC
      `).all() || [];
    } catch (e) {}

    let recentScans = [];
    try {
      recentScans = db.prepare("SELECT * FROM conferencias_galpao ORDER BY id DESC LIMIT 10").all() || [];
    } catch (e) {}

    let totalRomaneios = 0;
    try {
      totalRomaneios = db.prepare("SELECT count(1) as c FROM lotes_romaneio_emc").get()?.c || 0;
    } catch (e) {}

    cachedDashboardStats = {
      totalContratadoEMC,
      totalGestaoContratual: totalContratadoEMC + totalExcedentes,
      totalFormularioServidores,
      contratadosDeclaradosNoForm,
      contratadosSemFormulario,
      totalConferidos,
      totalEmCampo,
      totalAguardandoEMC,
      totalDevolvidosEMC,
      totalConformes,
      totalDeslocados,
      totalExcedentes,
      contractTypeCounts,
      cpusGalpao,
      monitoresGalpao,
      notebooksGalpao,
      cpusDevolvidos,
      monitoresDevolvidos,
      notebooksDevolvidos,
      taxaDevolucao: totalContratadoEMC > 0 ? Math.min(100, Math.round((totalDevolvidosEMC / totalContratadoEMC) * 100)) : 0,
      taxaGeral: totalContratadoEMC > 0 ? Math.min(100, Math.round((totalConferidos / totalContratadoEMC) * 100)) : 0,
      secretariasList,
      recentScans,
      totalRomaneios,
      lotesList,
      returnsByDoc
    };

    return cachedDashboardStats;
  } catch (err) {
    console.error('[CRITICAL getCompiledStats Error]:', err);
    return {
      totalContratadoEMC: 0,
      totalGestaoContratual: 0,
      totalFormularioServidores: 0,
      contratadosDeclaradosNoForm: 0,
      contratadosSemFormulario: 0,
      totalConferidos: 0,
      totalEmCampo: 0,
      totalAguardandoEMC: 0,
      totalDevolvidosEMC: 0,
      totalConformes: 0,
      totalDeslocados: 0,
      totalExcedentes: 0,
      contractTypeCounts: { cpus: 0, monitores: 0, notebooks: 0, outros: 0 },
      cpusGalpao: 0,
      monitoresGalpao: 0,
      notebooksGalpao: 0,
      cpusDevolvidos: 0,
      monitoresDevolvidos: 0,
      notebooksDevolvidos: 0,
      taxaDevolucao: 0,
      taxaGeral: 0,
      secretariasList: [],
      recentScans: [],
      totalRomaneios: 0,
      lotesList: [],
      returnsByDoc: []
    };
  }
}

// ==========================================
// 1. DASHBOARD & STATS (DUPLA CONFERÊNCIA)
// ==========================================
app.get('/api/dashboard/stats', (req, res) => {
  try {
    const { contractItems, parsedFormRows, formByCode } = getLookupMaps();
    const totalContratadoEMC = contractItems.length; // 4,344
    const totalFormularioServidores = parsedFormRows.length; // 1,960

    // Contract cross-match with form
    let contratadosDeclaradosNoForm = 0;
    for (const c of contractItems) {
      const code = String(c.item).toUpperCase();
      const serie = c.n_serie ? String(c.n_serie).toUpperCase() : '';
      if (formByCode.has(code) || (serie && formByCode.has(serie))) {
        contratadosDeclaradosNoForm++;
      }
    }
    const contratadosSemFormulario = Math.max(0, totalContratadoEMC - contratadosDeclaradosNoForm);

    // Etapa 1: No Galpão (Aguardando Retirada EMC)
    let galpaoStats = { total: 0, cpus: 0, monitores: 0, notebooks: 0 };
    try {
      galpaoStats = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN tipo_equipamento = 'CPU' THEN 1 ELSE 0 END) as cpus,
          SUM(CASE WHEN tipo_equipamento = 'MONITOR' THEN 1 ELSE 0 END) as monitores,
          SUM(CASE WHEN tipo_equipamento = 'NOTEBOOK' THEN 1 ELSE 0 END) as notebooks
        FROM conferencias_galpao
        WHERE status_etapa = 'aguardando_retirada_emc' OR status_etapa IS NULL
      `).get() || {};
    } catch (e) {
      console.error('[DB Error] galpaoStats:', e.message);
    }

    const totalAguardandoEMC = galpaoStats.total || 0;
    const cpusGalpao = galpaoStats.cpus || 0;
    const monitoresGalpao = galpaoStats.monitores || 0;
    const notebooksGalpao = galpaoStats.notebooks || 0;

    // Etapa 2: Devolvidos à EMC (Baixados com documento)
    let devolvidosStats = { total: 0, cpus: 0, monitores: 0, notebooks: 0 };
    try {
      devolvidosStats = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN tipo_equipamento = 'CPU' THEN 1 ELSE 0 END) as cpus,
          SUM(CASE WHEN tipo_equipamento = 'MONITOR' THEN 1 ELSE 0 END) as monitores,
          SUM(CASE WHEN tipo_equipamento = 'NOTEBOOK' THEN 1 ELSE 0 END) as notebooks
        FROM conferencias_galpao
        WHERE status_etapa = 'devolvido_emc'
      `).get() || {};
    } catch (e) {
      console.error('[DB Error] devolvidosStats:', e.message);
    }

    const totalDevolvidosEMC = devolvidosStats.total || 0;
    const cpusDevolvidos = devolvidosStats.cpus || 0;
    const monitoresDevolvidos = devolvidosStats.monitores || 0;
    const notebooksDevolvidos = devolvidosStats.notebooks || 0;

    // Total geral processado no galpão
    const totalConferidos = totalAguardandoEMC + totalDevolvidosEMC;
    const totalEmCampo = Math.max(0, totalContratadoEMC - totalConferidos);

    // Conciliation status breakdown
    let conciliationBreakdown = [];
    try {
      conciliationBreakdown = db.prepare(`
        SELECT status_conciliacao, COUNT(*) as count 
        FROM conferencias_galpao 
        GROUP BY status_conciliacao
      `).all() || [];
    } catch (e) {
      console.error('[DB Error] conciliationBreakdown:', e.message);
    }

    let totalConformes = 0;
    let totalDeslocados = 0;
    let totalExcedentes = 0;
    for (const cb of conciliationBreakdown) {
      if (cb.status_conciliacao === 'conforme') totalConformes += cb.count;
      else if (cb.status_conciliacao === 'deslocado') totalDeslocados += cb.count;
      else if (cb.status_conciliacao === 'excedente_novo' || cb.status_conciliacao === 'excedente_devolvido') totalExcedentes += cb.count;
    }

    // Secretarias aggregation
    const secMap = new Map();
    for (const r of parsedFormRows) {
      const sec = (r.data?.Secretaria || 'NÃO DEFINIDA').trim().toUpperCase();
      if (!secMap.has(sec)) {
        secMap.set(sec, { secretaria: sec, previsto: 0, noGalpao: 0, devolvidoEMC: 0, excedente: 0, faltante: 0 });
      }
      secMap.get(sec).previsto++;
    }

    let checkedBySec = [];
    try {
      checkedBySec = db.prepare(`
        SELECT 
          COALESCE(secretaria_prevista, secretaria_coletada) as sec,
          status_conciliacao,
          status_etapa,
          COUNT(*) as count
        FROM conferencias_galpao
        GROUP BY sec, status_conciliacao, status_etapa
      `).all() || [];
    } catch (e) {
      console.error('[DB Error] checkedBySec:', e.message);
    }

    for (const item of checkedBySec) {
      const secName = (item.sec || 'NÃO DEFINIDA').trim().toUpperCase();
      if (!secMap.has(secName)) {
        secMap.set(secName, { secretaria: secName, previsto: 0, noGalpao: 0, devolvidoEMC: 0, excedente: 0, faltante: 0 });
      }
      const entry = secMap.get(secName);
      if (item.status_conciliacao === 'excedente_novo') {
        entry.excedente += item.count;
      }
      if (item.status_etapa === 'devolvido_emc') {
        entry.devolvidoEMC += item.count;
      } else {
        entry.noGalpao += item.count;
      }
    }

    const secretariasList = Array.from(secMap.values()).map(s => {
      s.conferido = s.noGalpao + s.devolvidoEMC;
      s.faltante = Math.max(0, s.previsto - s.conferido);
      s.taxaConclusao = s.previsto > 0 ? Math.min(100, Math.round((s.conferido / s.previsto) * 100)) : 100;
      return s;
    }).sort((a, b) => b.previsto - a.previsto);

    const contractTypeCounts = { cpus: 0, monitores: 0, notebooks: 0, outros: 0 };
    for (const c of contractItems) {
      const t = (c.tipo_estimado || '').toUpperCase();
      if (t === 'CPU') contractTypeCounts.cpus++;
      else if (t === 'MONITOR') contractTypeCounts.monitores++;
      else if (t === 'NOTEBOOK') contractTypeCounts.notebooks++;
      else contractTypeCounts.outros++;
    }

    let lotesList = [];
    try {
      lotesList = db.prepare("SELECT * FROM lotes_romaneio_emc ORDER BY id DESC LIMIT 5").all() || [];
    } catch (e) {}

    let returnsByDoc = [];
    try {
      returnsByDoc = db.prepare(`
        SELECT comprovante_baixa_emc, tipo_equipamento, count(1) as count, min(data_hora_baixa_emc) as data
        FROM conferencias_galpao
        WHERE status_etapa = 'devolvido_emc'
        GROUP BY comprovante_baixa_emc, tipo_equipamento
        ORDER BY data DESC
      `).all() || [];
    } catch (e) {}

    let recentScans = [];
    try {
      recentScans = db.prepare("SELECT * FROM conferencias_galpao ORDER BY id DESC LIMIT 10").all() || [];
    } catch (e) {}

    let totalRomaneios = 0;
    try {
      totalRomaneios = db.prepare("SELECT count(1) as c FROM lotes_romaneio_emc").get()?.c || 0;
    } catch (e) {}

    res.json({
      success: true,
      data: {
        totalContratadoEMC,
        totalGestaoContratual: totalContratadoEMC + totalExcedentes,
        totalFormularioServidores,
        contratadosDeclaradosNoForm,
        contratadosSemFormulario,
        totalConferidos,
        totalEmCampo,
        totalAguardandoEMC,
        totalDevolvidosEMC,
        totalConformes,
        totalDeslocados,
        totalExcedentes,
        contractTypeCounts,
        cpusGalpao,
        monitoresGalpao,
        notebooksGalpao,
        cpusDevolvidos,
        monitoresDevolvidos,
        notebooksDevolvidos,
        taxaDevolucao: totalContratadoEMC > 0 ? Math.min(100, Math.round((totalDevolvidosEMC / totalContratadoEMC) * 100)) : 0,
        taxaGeral: totalContratadoEMC > 0 ? Math.min(100, Math.round((totalConferidos / totalContratadoEMC) * 100)) : 0,
        secretariasList,
        recentScans,
        totalRomaneios,
        lotesList,
        returnsByDoc
      }
    });
  } catch (err) {
    console.error('Error stats:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 2. ETAPA 1: CONCILIAÇÃO & ENTRADA GALPÃO
// ==========================================
app.post('/api/conciliacao/upload', async (req, res) => {
  try {
    const { rawText, localidadeFallback, nomeArquivo, tipoForcado, items } = req.body;
    if ((!rawText || typeof rawText !== 'string') && (!items || !Array.isArray(items) || items.length === 0)) {
      return res.status(400).json({ success: false, message: 'Conteúdo ou lista de itens não fornecido.' });
    }

    const { contractByItem, contractBySerie, formByCode } = getLookupMaps();
    let localidade = localidadeFallback || 'Galpão Central';
    let dataColeta = new Date().toLocaleString('pt-BR');
    let currentTipo = tipoForcado || 'CPU';
    let isQRbotCSV = false;
    let isColetorTxt = false;
    let origemRegistro = (items && Array.isArray(items) && items.length > 0) ? 'coletor_mobile' : 'lista_texto';
    const itemsToProcess = [];

    if (items && Array.isArray(items) && items.length > 0) {
      for (const it of items) {
        if (!it) continue;
        const code = typeof it === 'string' ? it : (it.codigo || it.code);
        if (!code) continue;
        const tipo = (typeof it === 'object' && it.tipo) ? it.tipo : currentTipo;
        const hora = (typeof it === 'object' && (it.hora || it.timestamp)) ? (it.hora || it.timestamp) : dataColeta;
        itemsToProcess.push({ codigo: String(code).trim(), tipo, hora });
      }
    } else {
      const lines = rawText.split(/\r?\n/);
      isQRbotCSV = lines.some(l => l.includes('CODECONTENT') || l.includes('CODETYPE'));
      isColetorTxt = lines.some(l => l.includes('RELATÓRIO DE COLETA') || l.includes('CPUS (') || l.includes('MONITORES ('));

      if (isColetorTxt) {
        origemRegistro = 'arquivo_txt';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('Localidade:')) {
            localidade = trimmed.replace('Localidade:', '').trim();
          } else if (trimmed.startsWith('Data:')) {
            dataColeta = trimmed.replace('Data:', '').trim();
          } else if (/^CPUS\s*\(/i.test(trimmed)) {
            currentTipo = 'CPU';
          } else if (/^MONITORES\s*\(/i.test(trimmed)) {
            currentTipo = 'MONITOR';
          } else if (/^NOTEBOOKS\s*\(/i.test(trimmed)) {
            currentTipo = 'NOTEBOOK';
          } else if (trimmed.startsWith('-')) {
            const m = trimmed.match(/^-\s*([A-Za-z0-9_-]+)/);
            if (m) itemsToProcess.push({ codigo: m[1].trim(), tipo: currentTipo, hora: dataColeta });
          }
        }
      } else if (isQRbotCSV) {
        origemRegistro = 'arquivo_csv';
        for (const line of lines) {
          if (!line.trim() || line.startsWith('DATE')) continue;
          const cols = line.split(',');
          if (cols.length >= 4) {
            const datePart = cols[0].replace(/"/g, '').trim();
            const namePart = cols[2] ? cols[2].replace(/"/g, '').toLowerCase() : '';
            const codePart = cols[3] ? cols[3].replace(/"/g, '').trim() : '';
            if (!codePart) continue;
            let tipo = 'CPU';
            if (namePart.includes('monitor')) tipo = 'MONITOR';
            if (namePart.includes('note')) tipo = 'NOTEBOOK';
            itemsToProcess.push({ codigo: codePart, tipo, hora: datePart });
          }
        }
      } else {
        origemRegistro = 'lista_texto';
        for (const line of lines) {
          let trimmed = line.trim().replace(/^-\s*/, '');
          if (!trimmed || trimmed.startsWith('#') || trimmed.length < 3) continue;
          let tipo = currentTipo;
          if (/^(monitor|cpu|notebook|outro)[\s:=-]+/i.test(trimmed)) {
            const typeMatch = trimmed.match(/^(monitor|cpu|notebook|outro)/i);
            if (typeMatch) tipo = typeMatch[1].toUpperCase();
            trimmed = trimmed.replace(/^(monitor|cpu|notebook|outro)[\s:=-]+/i, '').trim();
          } else {
            if (/monitor/i.test(trimmed)) tipo = 'MONITOR';
            if (/cpu/i.test(trimmed)) tipo = 'CPU';
            if (/note/i.test(trimmed)) tipo = 'NOTEBOOK';
          }
          const m = trimmed.match(/([A-Za-z0-9_-]+)/);
          if (m) itemsToProcess.push({ codigo: m[1].trim(), tipo, hora: dataColeta });
        }
      }
    }

    if (itemsToProcess.length === 0) {
      return res.status(400).json({ success: false, message: 'Nenhum código identificável encontrado no arquivo.' });
    }

    const checkExistingStmt = db.prepare("SELECT id, status_etapa FROM conferencias_galpao WHERE codigo_bipado = ? OR codigo_normalizado = ?");
    const updateStmt = db.prepare(`
      UPDATE conferencias_galpao SET
        codigo_normalizado = ?,
        tipo_equipamento = ?,
        localidade_coletada = ?,
        status_conciliacao = ?,
        status_etapa = 'aguardando_retirada_emc',
        inventario_row_id = ?,
        contrato_emc_id = ?,
        secretaria_prevista = ?,
        servidor_previsto = ?,
        origem_registro = ?,
        arquivo_origem = ?,
        data_hora_coleta = ?,
        observacao = ?
      WHERE id = ?
    `);

    const insertStmt = db.prepare(`
      INSERT INTO conferencias_galpao (
        codigo_bipado,
        codigo_normalizado,
        tipo_equipamento,
        localidade_coletada,
        status_conciliacao,
        status_etapa,
        inventario_row_id,
        contrato_emc_id,
        secretaria_prevista,
        secretaria_coletada,
        servidor_previsto,
        origem_registro,
        arquivo_origem,
        data_hora_coleta,
        observacao
      ) VALUES (?, ?, ?, ?, ?, 'aguardando_retirada_emc', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateFormStmt = db.prepare("UPDATE inventario_rows SET status_logistica = 'no_galpao' WHERE id = ?");

    const results = {
      totalLidos: itemsToProcess.length,
      conformes: 0,
      deslocados: 0,
      excedentes: 0,
      detalhes: []
    };

    const runTx = db.transaction(() => {
      for (const item of itemsToProcess) {
        const rawCode = item.codigo;
        const normCode = normalizeCode(rawCode);

        const contractMatch = contractByItem.get(normCode) || contractBySerie.get(normCode);
        const formMatch = formByCode.get(normCode);

        let status = 'excedente_novo';
        let rowId = formMatch ? formMatch.id : null;
        let contratoId = contractMatch ? contractMatch.id : null;
        let secPrevista = formMatch ? formMatch.data.Secretaria : null;
        let servidorPrevisto = formMatch ? formMatch.data['Nome completo do servidor'] : null;
        let obs = '';

        if (formMatch) {
          const secPrevUpper = (secPrevista || '').toUpperCase();
          const localUpper = localidade.toUpperCase();

          if (localUpper.includes(secPrevUpper) || secPrevUpper.includes(localUpper) || localUpper.includes('GALPÃO')) {
            status = 'conforme';
            obs = `No Galpão (Aguardando Retirada EMC). Previsto em ${secPrevista}.`;
            results.conformes++;
          } else {
            status = 'deslocado';
            obs = `No Galpão (Aguardando Retirada EMC). Previsto em ${secPrevista}, coletado em ${localidade}.`;
            results.deslocados++;
          }
          updateFormStmt.run(formMatch.id);
        } else if (contractMatch) {
          status = 'conforme';
          obs = `No Galpão (Aguardando Retirada EMC). Ativo oficial do contrato EMC (${contractMatch.descricao || 'Equipamento'}).`;
          results.conformes++;
        } else {
          status = 'excedente_novo';
          obs = `No Galpão (Aguardando Retirada EMC). Item excedente não previsto na planilha base.`;
          results.excedentes++;
        }

        const existing = checkExistingStmt.get(rawCode, normCode);
        if (existing) {
          updateStmt.run(
            normCode, item.tipo, localidade, status, rowId, contratoId,
            secPrevista, servidorPrevisto,
            origemRegistro,
            nomeArquivo || 'upload_manual', item.hora, obs, existing.id
          );
        } else {
          insertStmt.run(
            rawCode, normCode, item.tipo, localidade, status, rowId, contratoId,
            secPrevista, localidade, servidorPrevisto,
            origemRegistro,
            nomeArquivo || 'upload_manual', item.hora, obs
          );
        }

        results.detalhes.push({
          codigo: rawCode,
          tipo: item.tipo,
          status,
          secretariaPrevista: secPrevista,
          localidadeColeta: localidade,
          servidorPrevisto,
          observacao: obs
        });
      }
    });

    runTx();
    await syncCodesToTurso('conferencias_galpao', itemsToProcess.map(it => it.codigo));
    invalidateCache();

    res.json({
      success: true,
      message: `Recebidos no Galpão ${results.totalLidos} equipamentos: ${results.conformes} conformes, ${results.deslocados} deslocados e ${results.excedentes} excedentes aguardando retirada da EMC!`,
      data: results
    });

  } catch (err) {
    console.error('Error upload:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Retorna a lista compacta de todos os códigos de patrimônio e números de série do contrato EMC para validação instantânea no PWA
app.get('/api/conciliacao/codigos-validos', (req, res) => {
  try {
    const { contractByItem, contractBySerie } = getLookupMaps();
    const codes = Array.from(new Set([...contractByItem.keys(), ...contractBySerie.keys()]));
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache de 5 min
    res.json({ success: true, total: codes.length, codes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Consulta rápida em memória sem salvar nada no banco (usado pelo Coletor para identificar na hora)
app.get('/api/conciliacao/consultar', (req, res) => {
  try {
    const rawCode = String(req.query.codigo || '').trim();
    if (!rawCode) return res.status(400).json({ success: false, message: 'Código não informado.' });

    const normCode = normalizeCode(rawCode);
    const { contractByItem, contractBySerie, formByCode } = getLookupMaps();

    const contractMatch = contractByItem.get(normCode) || contractBySerie.get(normCode);
    const formMatch = formByCode.get(normCode);

    if (contractMatch) {
      return res.json({
        success: true,
        encontrado: true,
        noContrato: true,
        tipo: contractMatch.tipo || 'CPU',
        descricao: contractMatch.descricao || 'Ativo Oficial Contrato EMC',
        n_serie: contractMatch.n_serie,
        item: contractMatch.item,
        status: 'conforme',
        secretaria: formMatch ? formMatch.data.Secretaria : null,
        servidor: formMatch ? formMatch.data['Nome completo do servidor'] : null
      });
    }

    if (formMatch) {
      return res.json({
        success: true,
        encontrado: true,
        noContrato: false,
        tipo: 'CPU',
        descricao: formMatch.data['Descrição do equipamento'] || 'Equipamento declarado em formulário',
        status: 'deslocado',
        secretaria: formMatch.data.Secretaria,
        servidor: formMatch.data['Nome completo do servidor']
      });
    }

    return res.json({
      success: true,
      encontrado: false,
      noContrato: false,
      status: 'excedente_novo',
      descricao: 'Item não localizado no contrato EMC (Excedente)'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Single Barcode Gun Scan (Galpão)
app.post('/api/conciliacao/bipar', async (req, res) => {
  try {
    const { codigo, tipo, localidade } = req.body;
    if (!codigo) return res.status(400).json({ success: false, message: 'Código não informado.' });

    const rawCode = String(codigo).trim();
    const normCode = normalizeCode(rawCode);
    const tipoItem = tipo || 'CPU';
    const local = localidade || 'Galpão Central';

    const { contractByItem, contractBySerie, formByCode } = getLookupMaps();
    const contractMatch = contractByItem.get(normCode) || contractBySerie.get(normCode);
    const formMatch = formByCode.get(normCode);

    let status = 'excedente_novo';
    let rowId = formMatch ? formMatch.id : null;
    let contratoId = contractMatch ? contractMatch.id : null;
    let secPrevista = formMatch ? formMatch.data.Secretaria : null;
    let servidorPrevisto = formMatch ? formMatch.data['Nome completo do servidor'] : null;
    let obs = '';

    if (formMatch) {
      status = 'conforme';
      obs = `Bipado no Galpão (Aguardando Retirada EMC). Pertence a ${servidorPrevisto} (${secPrevista}).`;
      db.prepare("UPDATE inventario_rows SET status_logistica = 'no_galpao' WHERE id = ?").run(formMatch.id);
    } else if (contractMatch) {
      status = 'conforme';
      obs = `Bipado no Galpão (Aguardando Retirada EMC). Ativo oficial EMC (${contractMatch.descricao || 'Equipamento'}).`;
    } else {
      status = 'excedente_novo';
      obs = `Bipado no Galpão (Aguardando Retirada EMC). Equipamento excedente.`;
    }

    const existing = db.prepare("SELECT id FROM conferencias_galpao WHERE codigo_bipado = ? OR codigo_normalizado = ?").get(rawCode, normCode);
    let recordId;
    if (existing) {
      db.prepare(`
        UPDATE conferencias_galpao SET
          status_etapa = 'aguardando_retirada_emc',
          status_conciliacao = ?,
          localidade_coletada = ?,
          data_hora_coleta = datetime('now', 'localtime'),
          observacao = ?
        WHERE id = ?
      `).run(status, local, obs, existing.id);
      recordId = existing.id;
    } else {
      const ins = db.prepare(`
        INSERT INTO conferencias_galpao (
          codigo_bipado, codigo_normalizado, tipo_equipamento, localidade_coletada,
          status_conciliacao, status_etapa, inventario_row_id, contrato_emc_id,
          secretaria_prevista, secretaria_coletada, servidor_previsto,
          origem_registro, data_hora_coleta, observacao
        ) VALUES (?, ?, ?, ?, ?, 'aguardando_retirada_emc', ?, ?, ?, ?, ?, 'bipagem_direta', datetime('now', 'localtime'), ?)
      `).run(rawCode, normCode, tipoItem, local, status, rowId, contratoId, secPrevista, local, servidorPrevisto, obs);
      recordId = ins.lastInsertRowid;
    }

    await syncRecordToTurso('conferencias_galpao', recordId);
    invalidateCache();

    res.json({
      success: true,
      jaCadastrado: !!existing,
      data: {
        id: recordId,
        codigo: rawCode,
        codigoNormalizado: normCode,
        tipo: tipoItem,
        status,
        statusEtapa: 'aguardando_retirada_emc',
        secretariaPrevista: secPrevista,
        servidorPrevisto,
        observacao: obs,
        contractMatch: !!contractMatch,
        descricaoContrato: contractMatch ? contractMatch.descricao : null
      }
    });
  } catch (err) {
    console.error('Error bipar:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Helper for robust PDF text extraction across pdf-parse versions
async function extractTextFromPdfBuffer(buffer) {
  try {
    if (typeof pdfParse === 'function') {
      const res = await pdfParse(buffer);
      return res.text || '';
    }
    if (pdfParse && pdfParse.PDFParse) {
      const parser = new pdfParse.PDFParse({ data: buffer });
      const res = await parser.getText();
      return res.text || '';
    }
    if (pdfParse && pdfParse.default) {
      if (typeof pdfParse.default === 'function') {
        const res = await pdfParse.default(buffer);
        return res.text || '';
      }
      if (pdfParse.default.PDFParse) {
        const parser = new pdfParse.default.PDFParse({ data: buffer });
        const res = await parser.getText();
        return res.text || '';
      }
    }
  } catch (err) {
    console.error('Error in PDF parser library:', err);
  }
  return buffer.toString('utf-8');
}

// ==========================================
// 3. ETAPA 2: 2ª CONFERÊNCIA & BAIXA EMC (PDF/TXT/CSV)
// ==========================================

// Parse and Preview EMC document before confirming baixa
app.post('/api/emc/parse-pdf', async (req, res) => {
  try {
    const { pdfBase64, rawText, fileName } = req.body;
    let extractedText = '';

    if (pdfBase64) {
      const buffer = Buffer.from(pdfBase64, 'base64');
      if (fileName && fileName.toLowerCase().endsWith('.pdf')) {
        extractedText = await extractTextFromPdfBuffer(buffer);
      } else {
        extractedText = buffer.toString('utf-8');
      }
    } else if (rawText) {
      extractedText = rawText;
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Nenhum texto pôde ser extraído do documento da EMC.' });
    }

    const { contractItems, contractByItem, contractBySerie, formByCode } = getLookupMaps();

    // Query current items in warehouse waiting for pickup
    const warehouseItems = db.prepare(`
      SELECT * FROM conferencias_galpao 
      WHERE status_etapa = 'aguardando_retirada_emc' OR status_etapa IS NULL
    `).all();

    const warehouseByCode = new Map();
    for (const w of warehouseItems) {
      if (w.codigo_bipado) warehouseByCode.set(String(w.codigo_bipado).toUpperCase(), w);
      if (w.codigo_normalizado) warehouseByCode.set(String(w.codigo_normalizado).toUpperCase(), w);
    }

    // Try detecting Movimentação de Estoque number & date from header
    let detectedDocNumero = null;
    let detectedData = null;
    const docMatch = extractedText.match(/MOVIMENTAÇÃO DE ESTOQUE Nº\.?:?\s*(\d+)/i);
    if (docMatch) detectedDocNumero = `Mov. Estoque EMC ${docMatch[1]}`;
    const dateMatch = extractedText.match(/Data:\s*([0-9]{2}\s*\/\s*[0-9]{2}\s*\/\s*[0-9]{4})/i);
    if (dateMatch) detectedData = dateMatch[1].replace(/\s+/g, '');

    const lines = extractedText.split(/\r?\n/);
    const matchedItemsMap = new Map();
    const confirmedWarehouseIds = new Set();

    // Pass 1: Structured EMC Table Lines (both single-line and multi-line layouts)
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const m = trimmed.match(/^(\d+)\s+(\d{5,6})\s+([A-Z0-9]{5,12})(?:\s+(.*))?$/i);
      if (m) {
        const seq = parseInt(m[1], 10);
        const itemCode = m[2].trim().toUpperCase();
        const tag = m[3].trim().toUpperCase();
        let rest = (m[4] || '').trim();

        // If model text wasn't on the same line, check subsequent lines for model
        if (!rest && i + 1 < lines.length) {
          const next1 = lines[i + 1].trim();
          if (/COMPUTADOR|MONITOR|NOTEBOOK|DELL|OPTIPLEX|TABLET/i.test(next1)) {
            rest = next1;
            if (i + 2 < lines.length && /SFF|I5|I7|3080|3000|5090|7010|RAM/i.test(lines[i + 2])) {
              rest += ' ' + lines[i + 2].trim();
            }
          }
        }

        let tipo = 'CPU';
        if (/MONITOR/i.test(rest)) tipo = 'MONITOR';
        else if (/NOTEBOOK/i.test(rest)) tipo = 'NOTEBOOK';
        else if (/TABLET/i.test(rest)) tipo = 'TABLET';
        else if (/COMPUTADOR|DESKTOP|OPTIPLEX|CPU/i.test(rest)) tipo = 'CPU';

        let descricao = rest.split(/\s+\d{4,6}\s+/)[0] || rest;
        if (!descricao || descricao.length < 3) descricao = `${tipo} DELL (Patrimônio ${itemCode})`;

        const key = `ITEM_${itemCode}`;
        if (!matchedItemsMap.has(key)) {
          const wMatch = warehouseByCode.get(itemCode) || warehouseByCode.get(tag);
          const cMatch = contractByItem.get(itemCode) || contractBySerie.get(tag);
          const fMatch = formByCode.get(itemCode) || formByCode.get(tag);

          let estavaNoGalpao = false;
          let galpaoId = null;
          let secOrigem = null;
          let servidorOrigem = null;

          if (wMatch) {
            estavaNoGalpao = true;
            galpaoId = wMatch.id;
            secOrigem = wMatch.secretaria_prevista || wMatch.secretaria_coletada;
            servidorOrigem = wMatch.servidor_previsto;
            confirmedWarehouseIds.add(wMatch.id);
          } else if (fMatch) {
            secOrigem = fMatch.data.Secretaria;
            servidorOrigem = fMatch.data['Nome completo do servidor'];
          } else if (cMatch) {
            const cf = formByCode.get(String(cMatch.item).toUpperCase());
            if (cf) {
              secOrigem = cf.data.Secretaria;
              servidorOrigem = cf.data['Nome completo do servidor'];
            }
          }

          matchedItemsMap.set(key, {
            key,
            seq,
            itemCodigo: itemCode,
            nSerie: tag,
            descricao: cMatch ? cMatch.descricao : descricao,
            tipo: cMatch ? (cMatch.tipo_estimado || tipo) : tipo,
            estavaNoGalpao,
            galpaoId,
            secretariaOrigem: secOrigem || 'Não Mapeada',
            servidorOrigem: servidorOrigem || 'Não Declarado',
            situacaoDuplaConferencia: estavaNoGalpao ? 'no_galpao_confirmado' : 'direto_emc'
          });
        }
      }
    }

    // Pass 2: Fallback Token Scanner ONLY if no structured EMC table lines were detected (e.g. unformatted raw text)
    if (matchedItemsMap.size === 0) {
      const tokens = extractedText.match(/[A-Za-z0-9\-_]{4,25}/g) || [];
      for (const rawToken of tokens) {
        const token = rawToken.trim().toUpperCase();
        const matchContrato = contractByItem.get(token) || contractBySerie.get(token);
        const matchGalpao = warehouseByCode.get(token);
        const matchForm = formByCode.get(token);

        if (matchContrato || matchGalpao || matchForm) {
          const itemCode = matchContrato ? matchContrato.item : (matchGalpao ? matchGalpao.codigo_bipado : token);
          const key = `ITEM_${itemCode}`;
          if (!matchedItemsMap.has(key)) {
            const nSerie = matchContrato ? matchContrato.n_serie : '-';
            const descricao = matchContrato ? matchContrato.descricao : (matchGalpao ? matchGalpao.tipo_equipamento : 'EQUIPAMENTO');
            const tipo = matchContrato ? (matchContrato.tipo_estimado || 'EQUIPAMENTO') : (matchGalpao ? matchGalpao.tipo_equipamento : 'EQUIPAMENTO');

            let estavaNoGalpao = false;
            let galpaoId = null;
            let secOrigem = null;
            let servidorOrigem = null;

            if (matchGalpao) {
              estavaNoGalpao = true;
              galpaoId = matchGalpao.id;
              secOrigem = matchGalpao.secretaria_prevista || matchGalpao.secretaria_coletada;
              servidorOrigem = matchGalpao.servidor_previsto;
              confirmedWarehouseIds.add(matchGalpao.id);
            } else if (matchForm) {
              secOrigem = matchForm.data.Secretaria;
              servidorOrigem = matchForm.data['Nome completo do servidor'];
            }

            matchedItemsMap.set(key, {
              key,
              seq: matchedItemsMap.size + 1,
              itemCodigo: itemCode,
              nSerie,
              descricao,
              tipo,
              estavaNoGalpao,
              galpaoId,
              secretariaOrigem: secOrigem || 'Não Mapeada',
              servidorOrigem: servidorOrigem || 'Não Declarado',
              situacaoDuplaConferencia: estavaNoGalpao ? 'no_galpao_confirmado' : 'direto_emc'
            });
          }
        }
      }
    }

    const matchedItems = Array.from(matchedItemsMap.values()).sort((a, b) => (a.seq || 0) - (b.seq || 0));

    // Find warehouse items that were NOT mentioned in the EMC document
    const itensPermanecemNoGalpao = warehouseItems
      .filter(w => !confirmedWarehouseIds.has(w.id))
      .map(w => ({
        id: w.id,
        codigo: w.codigo_bipado,
        tipo: w.tipo_equipamento,
        secretaria: w.secretaria_prevista || w.secretaria_coletada,
        servidor: w.servidor_previsto,
        dataColeta: w.data_hora_coleta
      }));

    const confirmadosGalpao = matchedItems.filter(i => i.estavaNoGalpao).length;
    const diretoEMC = matchedItems.filter(i => !i.estavaNoGalpao).length;

    res.json({
      success: true,
      fileName: fileName || 'Relatório de Devolução EMC',
      detectedDocNumero,
      detectedData,
      totalItensDocumento: matchedItems.length,
      confirmadosGalpao,
      diretoEMC,
      totalPermanecemNoGalpao: itensPermanecemNoGalpao.length,
      itensDocumento: matchedItems,
      itensPermanecemNoGalpao
    });

  } catch (err) {
    console.error('Error parse PDF EMC:', err);
    res.status(500).json({ success: false, message: 'Falha ao processar arquivo da EMC: ' + err.message });
  }
});

// Confirm final write-off (Baixa Definitiva)
app.post('/api/emc/confirmar-baixa', (req, res) => {
  try {
    const { itens, comprovante, dataBaixa, responsavel, observacao } = req.body;
    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ success: false, message: 'Nenhum item selecionado para baixa.' });
    }

    const docNumero = comprovante || `DEV-EMC-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}-${Date.now().toString().slice(-4)}`;
    const dataOperacao = dataBaixa || new Date().toLocaleDateString('pt-BR');
    const resp = responsavel || 'Gestor de Contratos';

    // Create return lot
    const lotCount = db.prepare("SELECT count(*) as c FROM lotes_romaneio_emc").get().c;
    const numRomaneio = `DEV-EMC-${new Date().getFullYear()}-${String(lotCount + 1).padStart(3, '0')}`;

    let cpus = 0, monitores = 0, notes = 0;
    for (const it of itens) {
      const t = (it.tipo || '').toUpperCase();
      if (t.includes('CPU')) cpus++;
      else if (t.includes('MONITOR')) monitores++;
      else if (t.includes('NOTE')) notes++;
    }

    const lotInsert = db.prepare(`
      INSERT INTO lotes_romaneio_emc (
        numero_romaneio,
        data_fechamento,
        status,
        transportadora,
        responsavel_ti,
        total_cpus,
        total_monitores,
        total_notebooks,
        total_geral,
        comprovante_pdf_emc,
        observacoes
      ) VALUES (?, datetime('now', 'localtime'), 'devolvido_emc', 'Empresa EMC / Transportadora Oficial', ?, ?, ?, ?, ?, ?, ?)
    `).run(numRomaneio, resp, cpus, monitores, notes, itens.length, docNumero, observacao || 'Baixa confirmada via documento EMC');

    const loteId = lotInsert.lastInsertRowid;

    const updateWarehouseStmt = db.prepare(`
      UPDATE conferencias_galpao SET
        status_etapa = 'devolvido_emc',
        data_hora_baixa_emc = datetime('now', 'localtime'),
        comprovante_baixa_emc = ?,
        tipo_baixa_emc = ?,
        lote_romaneio_id = ?,
        observacao = observacao || ' | Devolvido à EMC conforme doc ' || ?
      WHERE id = ?
    `);

    const insertDirectStmt = db.prepare(`
      INSERT INTO conferencias_galpao (
        codigo_bipado,
        codigo_normalizado,
        tipo_equipamento,
        localidade_coletada,
        status_conciliacao,
        status_etapa,
        secretaria_prevista,
        secretaria_coletada,
        servidor_previsto,
        origem_registro,
        data_hora_coleta,
        data_hora_baixa_emc,
        comprovante_baixa_emc,
        tipo_baixa_emc,
        lote_romaneio_id,
        observacao
      ) VALUES (?, ?, ?, 'Galpão Central', 'conforme', 'devolvido_emc', ?, 'Galpão Central', ?, 'pdf_emc_direto', datetime('now', 'localtime'), datetime('now', 'localtime'), ?, 'direto_emc', ?, ?)
    `);

    const updateFormStmt = db.prepare("UPDATE inventario_rows SET status_logistica = 'devolvido_emc' WHERE id = ?");
    const { formByCode } = getLookupMaps();

    const runTx = db.transaction(() => {
      for (const it of itens) {
        if (it.galpaoId) {
          updateWarehouseStmt.run(docNumero, 'dupla_conferencia', loteId, docNumero, it.galpaoId);
        } else {
          insertDirectStmt.run(
            it.itemCodigo,
            normalizeCode(it.itemCodigo),
            it.tipo || 'EQUIPAMENTO',
            it.secretariaOrigem,
            it.servidorOrigem,
            docNumero,
            loteId,
            `Devolvido à EMC diretamente (doc ${docNumero})`
          );
        }

        // Update form status if applicable
        const formMatch = formByCode.get(normalizeCode(it.itemCodigo)) || formByCode.get(normalizeCode(it.nSerie));
        if (formMatch) {
          updateFormStmt.run(formMatch.id);
        }
      }
    });

    runTx();
    syncRecordToTurso('lotes_romaneio_emc', loteId);
    syncCodesToTurso('conferencias_galpao', itens.map(it => it.itemCodigo || it.codigo || it.nSerie));
    invalidateCache();

    res.json({
      success: true,
      message: `Baixa definitiva de ${itens.length} equipamentos devolvidos à EMC realizada com sucesso!`,
      loteId,
      numeroRomaneio: numRomaneio,
      totalBaixados: itens.length
    });

  } catch (err) {
    console.error('Error confirmar baixa:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// List items currently in warehouse with status filtering and counts
app.get('/api/galpao/itens', (req, res) => {
  try {
    const { search = '', tipo = '', status = 'aguardando_retirada_emc', page = 1, limit = 50 } = req.query;

    const countAguardando = db.prepare("SELECT COUNT(*) as c FROM conferencias_galpao WHERE status_etapa = 'aguardando_retirada_emc' OR status_etapa IS NULL").get().c;
    const countDevolvidos = db.prepare("SELECT COUNT(*) as c FROM conferencias_galpao WHERE status_etapa = 'devolvido_emc'").get().c;
    const countTotal = countAguardando + countDevolvidos;

    let query = "SELECT * FROM conferencias_galpao WHERE 1=1";
    const params = [];

    if (status === 'aguardando_retirada_emc') {
      query += " AND (status_etapa = 'aguardando_retirada_emc' OR status_etapa IS NULL)";
    } else if (status === 'devolvido_emc') {
      query += " AND status_etapa = 'devolvido_emc'";
    } else if (status === 'excedente') {
      query += " AND (status_conciliacao LIKE 'excedente%')";
    }

    if (tipo) {
      query += " AND tipo_equipamento = ?";
      params.push(tipo);
    }
    if (search) {
      query += " AND (codigo_bipado LIKE ? OR codigo_normalizado LIKE ? OR secretaria_prevista LIKE ? OR servidor_previsto LIKE ? OR comprovante_baixa_emc LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }

    query += " ORDER BY id DESC";
    const all = db.prepare(query).all(...params);
    const total = all.length;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const items = all.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      success: true,
      total,
      countAguardando,
      countDevolvidos,
      countTotal,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      items
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Give Baixa (mark as devolvido à EMC) for one, multiple or all items in warehouse
app.post('/api/galpao/dar-baixa-emc', async (req, res) => {
  try {
    const { ids = [], todos = false, comprovante = '', observacao = '' } = req.body;

    const docNumero = (comprovante && comprovante.trim()) || `BAIXA-GALPAO-${new Date().toISOString().slice(0, 10)}`;
    const obsTexto = (observacao && observacao.trim()) || 'Devolvido à EMC via Estoque do Galpão';

    let itemsToProcess = [];
    if (todos) {
      itemsToProcess = db.prepare("SELECT * FROM conferencias_galpao WHERE status_etapa = 'aguardando_retirada_emc' OR status_etapa IS NULL").all();
    } else if (Array.isArray(ids) && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      itemsToProcess = db.prepare(`SELECT * FROM conferencias_galpao WHERE id IN (${placeholders})`).all(...ids);
    }

    if (itemsToProcess.length === 0) {
      return res.status(400).json({ success: false, message: 'Nenhum equipamento selecionado para baixa.' });
    }

    // Insert Romaneio batch record
    const numRomaneio = `ROM-GALPAO-${Date.now().toString().slice(-6)}`;
    let cpus = 0, monitores = 0, notes = 0;
    for (const it of itemsToProcess) {
      const t = (it.tipo_equipamento || '').toUpperCase();
      if (t.includes('CPU')) cpus++;
      else if (t.includes('MONITOR')) monitores++;
      else if (t.includes('NOTE')) notes++;
    }

    const lotInsert = db.prepare(`
      INSERT INTO lotes_romaneio_emc (
        numero_romaneio,
        data_fechamento,
        status,
        transportadora,
        responsavel_ti,
        total_cpus,
        total_monitores,
        total_notebooks,
        total_geral,
        comprovante_pdf_emc,
        observacoes
      ) VALUES (?, datetime('now', 'localtime'), 'devolvido_emc', 'Transportadora EMC', 'Equipe de Inventário Contagem', ?, ?, ?, ?, ?, ?)
    `).run(numRomaneio, cpus, monitores, notes, itemsToProcess.length, docNumero, obsTexto);

    const loteId = lotInsert.lastInsertRowid;

    const updateWarehouseStmt = db.prepare(`
      UPDATE conferencias_galpao SET
        status_etapa = 'devolvido_emc',
        data_hora_baixa_emc = datetime('now', 'localtime'),
        comprovante_baixa_emc = ?,
        tipo_baixa_emc = 'baixa_direta_galpao',
        lote_romaneio_id = ?,
        observacao = coalesce(observacao, '') || ' | ' || ?
      WHERE id = ?
    `);

    const updateFormStmt = db.prepare("UPDATE inventario_rows SET status_logistica = 'devolvido_emc' WHERE id = ?");
    const { formByCode } = getLookupMaps();

    const runTx = db.transaction(() => {
      for (const it of itemsToProcess) {
        updateWarehouseStmt.run(docNumero, loteId, `Baixa EMC (${docNumero})`, it.id);
        if (it.inventario_row_id) {
          updateFormStmt.run(it.inventario_row_id);
        } else if (it.codigo_normalizado) {
          const formMatch = formByCode.get(it.codigo_normalizado);
          if (formMatch) updateFormStmt.run(formMatch.id);
        }
      }
    });

    runTx();
    await syncRecordToTurso('lotes_romaneio_emc', loteId);
    await syncBatchToTurso('conferencias_galpao', itemsToProcess.map(it => it.id));
    invalidateCache();

    res.json({
      success: true,
      message: `${itemsToProcess.length} equipamento(s) baixado(s) com sucesso como Devolvido(s) à EMC!`,
      totalBaixados: itemsToProcess.length,
      loteId,
      numeroRomaneio: numRomaneio
    });
  } catch (err) {
    console.error('Error dar-baixa-emc:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Exclude/Delete an item from warehouse (e.g. test bip or scanned by mistake)
app.post('/api/galpao/excluir-item', async (req, res) => {
  try {
    const { id, ids } = req.body;
    const targetIds = ids || (id ? [id] : []);
    if (!targetIds || targetIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Nenhum ID informado para exclusão.' });
    }

    const placeholders = targetIds.map(() => '?').join(',');
    const items = db.prepare(`SELECT * FROM conferencias_galpao WHERE id IN (${placeholders})`).all(...targetIds);

    const deleteStmt = db.prepare("DELETE FROM conferencias_galpao WHERE id = ?");
    const resetFormStmt = db.prepare("UPDATE inventario_rows SET status_logistica = 'em_campo' WHERE id = ?");

    const runTx = db.transaction(() => {
      for (const it of items) {
        deleteStmt.run(it.id);
        if (it.inventario_row_id) {
          resetFormStmt.run(it.inventario_row_id);
        }
      }
    });

    runTx();
    await syncDeleteToTurso('conferencias_galpao', targetIds);
    invalidateCache();

    res.json({
      success: true,
      message: `${items.length} registro(s) removido(s) com sucesso do galpão!`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// List return history
app.get('/api/emc/historico-devolucoes', (req, res) => {
  try {
    const lotes = db.prepare("SELECT * FROM lotes_romaneio_emc ORDER BY id DESC").all();
    const itensDevolvidos = db.prepare("SELECT * FROM conferencias_galpao WHERE status_etapa = 'devolvido_emc' ORDER BY id DESC").all();
    res.json({ success: true, lotes, itensDevolvidos, total: itensDevolvidos.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 4. RESET / LIMPEZA COMPLETA DE CONFERÊNCIAS
// ==========================================
app.post('/api/sistema/reset-conferencias', (req, res) => {
  try {
    db.prepare('DELETE FROM conferencias_galpao').run();
    db.prepare('DELETE FROM lotes_romaneio_emc').run();
    db.prepare("UPDATE inventario_rows SET status_logistica = 'pendente'").run();

    try {
      db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('conferencias_galpao', 'lotes_romaneio_emc')").run();
    } catch (e) {}

    syncResetToTurso();
    invalidateCache();

    res.json({
      success: true,
      message: 'Conferências e baixas zeradas com sucesso! As bases de Contrato EMC (4.344) e Formulário (1.960) estão 100% preservadas e prontas para novas importações.'
    });
  } catch (err) {
    console.error('Error reset:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Download de backup do banco de dados SQLite
app.get('/api/sistema/backup-db', (req, res) => {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return res.status(404).json({ success: false, message: 'Arquivo do banco de dados não encontrado.' });
    }
    const today = new Date().toISOString().slice(0, 10);
    res.download(DB_PATH, `inventario_contagem_backup_${today}.sqlite`);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Limpeza de cache de consultas em memória e sincronização Turso Cloud
app.post('/api/sistema/limpar-cache', async (req, res) => {
  try {
    await syncFromTurso();
    invalidateCache();
    res.json({
      success: true,
      message: 'Cache em memória invalidado e dados sincronizados com a nuvem Turso com sucesso!'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Status da sincronização com Turso Cloud
app.get('/api/sistema/turso-status', (req, res) => {
  try {
    const localGalpao = db.prepare("SELECT count(*) as c FROM conferencias_galpao").get().c;
    const localLotes = db.prepare("SELECT count(*) as c FROM lotes_romaneio_emc").get().c;
    res.json({
      success: true,
      connected: !!TURSO_URL && !!TURSO_TOKEN,
      url: TURSO_URL,
      status: lastTursoStatus,
      lastSync: lastTursoSyncTime,
      localGalpaoCount: localGalpao,
      localLotesCount: localLotes
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Forçar sincronização imediata com Turso Cloud
app.post('/api/sistema/turso-sync', async (req, res) => {
  try {
    await syncFromTurso();
    const localGalpao = db.prepare("SELECT count(*) as c FROM conferencias_galpao").get().c;
    res.json({
      success: true,
      message: 'Sincronização com Nuvem Turso concluída com sucesso!',
      status: lastTursoStatus,
      lastSync: lastTursoSyncTime,
      localGalpaoCount: localGalpao
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 5. BASE CONTRATUAL EMC (4.344 ITENS + CONFERÊNCIAS)
// ==========================================
app.get('/api/contrato/itens', (req, res) => {
  try {
    const { search = '', tipo = '', status = '', page = 1, limit = 50 } = req.query;
    const cache = getCompiledContrato();

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;

    // Fast path: if no filters, return sliced cache directly (0ms)
    if (!search && !tipo && !status) {
      const total = cache.list.length;
      return res.json({
        success: true,
        kpis: cache.kpis,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        items: cache.list.slice((pageNum - 1) * limitNum, pageNum * limitNum)
      });
    }

    // Filtered path: single streaming filter
    const s = search ? search.trim().toLowerCase() : '';
    const t = tipo ? tipo.trim().toUpperCase() : '';

    const filtered = cache.list.filter(i => {
      if (t && (i.tipo_estimado || '').toUpperCase() !== t) return false;
      if (status === 'mapeado' && !i.declaradoNoForm) return false;
      if (status === 'nao_mapeado' && i.declaradoNoForm) return false;
      if (status === 'no_galpao' && i.statusLogistico !== 'no_galpao') return false;
      if (status === 'devolvido_emc' && i.statusLogistico !== 'devolvido_emc') return false;
      if (status === 'em_campo' && i.statusLogistico !== 'em_campo') return false;
      if (s) {
        const match =
          (i.item && String(i.item).toLowerCase().includes(s)) ||
          (i.n_serie && String(i.n_serie).toLowerCase().includes(s)) ||
          (i.descricao && String(i.descricao).toLowerCase().includes(s)) ||
          (i.secretariaDeclarada && String(i.secretariaDeclarada).toLowerCase().includes(s)) ||
          (i.servidorDeclarado && String(i.servidorDeclarado).toLowerCase().includes(s)) ||
          (i.comprovanteBaixa && String(i.comprovanteBaixa).toLowerCase().includes(s)) ||
          (i.nfe_remessa && String(i.nfe_remessa).toLowerCase().includes(s));
        if (!match) return false;
      }
      return true;
    });

    const total = filtered.length;
    res.json({
      success: true,
      kpis: cache.kpis,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      items: filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum)
    });
  } catch (err) {
    console.error('Error contrato itens:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 6. FORMULÁRIO SERVIDORES (1.960 REGISTROS)
// ==========================================
app.get('/api/equipamentos', (req, res) => {
  try {
    const { search = '', status = '', secretaria = '', page = 1, limit = 50 } = req.query;
    const cache = getCompiledEquipamentos();

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = limit === 'todas' ? cache.items.length : (parseInt(limit, 10) || 50);

    // Fast path: if no filters, return sliced cache directly (0ms)
    if (!search && !status && !secretaria) {
      const total = cache.items.length;
      return res.json({
        success: true,
        kpis: cache.kpis,
        secretariasDisponiveis: cache.secretariasDisponiveis,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: limit === 'todas' ? 1 : (Math.ceil(total / limitNum) || 1),
        items: limit === 'todas' ? cache.items : cache.items.slice((pageNum - 1) * limitNum, pageNum * limitNum)
      });
    }

    // Filtered path: single streaming filter
    const s = search ? search.trim().toLowerCase() : '';
    const sec = secretaria ? secretaria.trim().toUpperCase() : '';

    const filtered = cache.items.filter(i => {
      if (sec && !String(i.secretaria || '').toUpperCase().includes(sec)) return false;
      if (status && i.statusConferencia !== status) return false;
      if (s) {
        const match =
          String(i.servidor || '').toLowerCase().includes(s) ||
          String(i.matricula || '').toLowerCase().includes(s) ||
          String(i.secretaria || '').toLowerCase().includes(s) ||
          String(i.unidade || '').toLowerCase().includes(s) ||
          String(i.cpu || '').toLowerCase().includes(s) ||
          String(i.monitor || '').toLowerCase().includes(s) ||
          String(i.notebook || '').toLowerCase().includes(s) ||
          (i.comprovanteBaixa && String(i.comprovanteBaixa).toLowerCase().includes(s));
        if (!match) return false;
      }
      return true;
    });

    const total = filtered.length;
    res.json({
      success: true,
      kpis: cache.kpis,
      secretariasDisponiveis: cache.secretariasDisponiveis,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: limit === 'todas' ? 1 : (Math.ceil(total / limitNum) || 1),
      items: limit === 'todas' ? filtered : filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum)
    });
  } catch (err) {
    console.error('Error equipamentos:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 7. ITENS EXCEDENTES DE GALPÃO
// ==========================================
app.get('/api/excedentes', (req, res) => {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    let query = "SELECT * FROM conferencias_galpao WHERE status_conciliacao = 'excedente_novo' OR status_conciliacao = 'excedente_devolvido'";
    const params = [];

    if (search) {
      query += " AND (codigo_bipado LIKE ? OR localidade_coletada LIKE ? OR observacao LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += " ORDER BY id DESC";
    const all = db.prepare(query).all(...params);
    const total = all.length;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const items = all.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      items
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 8. AUDITORIA & DISCREPÂNCIAS CONTRATUAIS
// ==========================================


function getAuditoriaDataset() {
  const { contractItems, parsedFormRows } = getLookupMaps();
  const confRows = db.prepare("SELECT * FROM conferencias_galpao").all();

  // 1. Contract Lookup Map
  const contractCodeMap = new Map();
  function regContract(code, item) {
    if (!code) return;
    const s = String(code).trim().toUpperCase();
    if (!s || s === '-' || s === 'NULL') return;
    contractCodeMap.set(s, item);
    if (s.length === 6 && s.startsWith('1')) {
      contractCodeMap.set(s.substring(1), item);
      contractCodeMap.set('1000' + s.substring(1), item);
    } else if (s.length === 5) {
      contractCodeMap.set('1' + s, item);
      contractCodeMap.set('1000' + s, item);
    } else if (s.startsWith('1000') && s.length === 9) {
      contractCodeMap.set(s.substring(4), item);
      contractCodeMap.set('1' + s.substring(4), item);
    }
  }
  for (const c of contractItems) {
    regContract(c.item, c);
    if (c.n_serie) regContract(c.n_serie, c);
  }

  // 2. Warehouse Map
  const whByCode = new Map();
  for (const w of confRows) {
    if (w.codigo_bipado) {
      const s = String(w.codigo_bipado).trim().toUpperCase();
      whByCode.set(s, w);
      if (s.length === 6 && s.startsWith('1')) {
        whByCode.set(s.substring(1), w);
        whByCode.set('1000' + s.substring(1), w);
      }
    }
    if (w.codigo_normalizado) {
      whByCode.set(String(w.codigo_normalizado).trim().toUpperCase(), w);
    }
  }

  // 3. Form Assets extraction, Separation of Junk Texts & Duplicity tracking
  const formAssets = [];
  const quarentenaList = [];
  const codeOccurrences = new Map();
  const secretariasSet = new Set();

  for (const r of parsedFormRows) {
    const d = r.data;
    const srv = d['Nome completo do servidor'] || 'Não informado';
    const sec = (d.Secretaria || 'Não informada').trim();
    if (sec && sec !== 'Não informada') secretariasSet.add(sec);
    const mat = d['Matrícula do servidor'] || d['Matrícula'] || '-';
    const unid = d['Nome da unidade onde o equipamento está instalado'] || '-';
    const tel = d['Telefone do responsável pelo equipamento'] || '-';
    const end = d['Endereço'] || (d['Logradouro'] ? `${d['Logradouro']}, ${d['Número'] || 'S/N'}` : '-');

    const fields = [
      { tipo: 'CPU', key: 'Patrimônio da CPU', val: d['Patrimônio da CPU'] },
      { tipo: 'MONITOR', key: 'Patrimônio do Monitor', val: d['Patrimônio do Monitor'] },
      { tipo: 'MONITOR_AVULSO', key: 'Patrimônio do Monitor Avulso', val: d['Patrimônio do Monitor Avulso'] },
      { tipo: 'NOTEBOOK', key: 'Patrimônio do Notebook', val: d['Patrimônio do Notebook'] }
    ];

    for (const f of fields) {
      if (!f.val) continue;
      const rawStr = String(f.val).trim();
      if (!rawStr || rawStr === '-' || rawStr === '--' || rawStr === 'NULL' || rawStr === '0') continue;

      if (isJunkCodeText(rawStr)) {
        quarentenaList.push({
          id: `quar_${r.id}_${f.tipo}`,
          formId: r.id,
          fieldKey: f.key,
          tipo: f.tipo,
          codigoDeclarado: rawStr,
          servidor: srv,
          matricula: mat,
          secretaria: sec,
          unidade: unid,
          telefone: tel,
          endereco: end
        });
        continue;
      }

      const str = cleanAssetCode(rawStr);
      if (!str || str === '-' || str === '--' || str === 'NULL' || str === '0') continue;

      if (isJunkCodeText(str)) {
        quarentenaList.push({
          id: `quar_${r.id}_${f.tipo}`,
          formId: r.id,
          fieldKey: f.key,
          tipo: f.tipo,
          codigoDeclarado: rawStr,
          servidor: srv,
          matricula: mat,
          secretaria: sec,
          unidade: unid,
          telefone: tel,
          endereco: end
        });
        continue;
      }

      const clean = str.toUpperCase();
      const asset = {
        formId: r.id,
        fieldKey: f.key,
        servidor: srv,
        matricula: mat,
        secretaria: sec,
        unidade: unid,
        telefone: tel,
        endereco: end,
        tipo: f.tipo,
        codigo: str,
        clean
      };
      formAssets.push(asset);

      if (!codeOccurrences.has(clean)) codeOccurrences.set(clean, []);
      codeOccurrences.get(clean).push(asset);
    }
  }

  // A. Duplicidades (Somente patrimônios reais, sem textos lixo duplicados)
  const duplicidadesList = [];
  for (const [code, entries] of codeOccurrences.entries()) {
    if (entries.length > 1) {
      const inContract = contractCodeMap.has(code);
      duplicidadesList.push({
        id: `dup_${code}`,
        codigo: code,
        qtdOcorrencias: entries.length,
        pertenceContratoEMC: inContract,
        tipo: entries[0].tipo,
        secretarias: Array.from(new Set(entries.map(e => e.secretaria))),
        servidores: entries.map(e => ({
          formId: e.formId,
          servidor: e.servidor,
          matricula: e.matricula,
          secretaria: e.secretaria,
          unidade: e.unidade,
          tipo: e.tipo
        }))
      });
    }
  }

  // B. Declarados Fora do Contrato (Somente códigos reais sem constar no contrato da EMC)
  const foraDoContratoList = [];
  for (const fa of formAssets) {
    if (!contractCodeMap.has(fa.clean)) {
      const wh = whByCode.get(fa.clean);
      foraDoContratoList.push({
        id: `fora_${fa.formId}_${fa.tipo}_${fa.codigo}`,
        codigo: fa.codigo,
        tipo: fa.tipo,
        servidor: fa.servidor,
        matricula: fa.matricula,
        secretaria: fa.secretaria,
        unidade: fa.unidade,
        telefone: fa.telefone,
        endereco: fa.endereco,
        statusLogistico: wh ? (wh.status_etapa === 'devolvido_emc' ? 'devolvido_emc' : 'no_galpao') : 'em_campo',
        comprovanteBaixa: wh ? wh.comprovante_baixa_emc : null
      });
    }
  }

  // C. Contratados Não Localizados
  const fantasmasList = [];
  let contratadosMapeados = 0;
  let contratadosDevolvidos = 0;

  for (const c of contractItems) {
    const it = String(c.item).trim().toUpperCase();
    const ser = c.n_serie ? String(c.n_serie).trim().toUpperCase() : '';

    const formMatch = codeOccurrences.get(it) || (ser ? codeOccurrences.get(ser) : null);
    const whMatch = whByCode.get(it) || (ser ? whByCode.get(ser) : null);

    if (whMatch && whMatch.status_etapa === 'devolvido_emc') {
      contratadosDevolvidos++;
    } else if (formMatch) {
      contratadosMapeados++;
    } else {
      fantasmasList.push({
        id: `fantasma_${c.id}`,
        item: c.item,
        n_serie: c.n_serie || '-',
        descricao: c.descricao,
        tipo_estimado: c.tipo_estimado,
        nfe_remessa: c.nfe_remessa || '-',
        valor_mensal: c.valor_mensal || '-',
        software: c.software || '-',
        statusRisco: whMatch ? 'No Galpão (Aguardando Retirada)' : 'Sem Paradeiro (Não Declarado no Form)'
      });
    }
  }

  const kpis = {
    totalContrato: contractItems.length,
    totalAtivosForm: formAssets.length,
    contratadosMapeados,
    contratadosDevolvidos,
    fantasmasCount: fantasmasList.length,
    foraDoContratoCount: foraDoContratoList.length,
    duplicidadesCount: duplicidadesList.length,
    quarentenaCount: quarentenaList.length
  };

  const secretariasDisponiveis = Array.from(secretariasSet).sort();

  return {
    contractItems,
    fantasmasList,
    foraDoContratoList,
    duplicidadesList,
    quarentenaList,
    kpis,
    secretariasDisponiveis
  };
}

app.get('/api/auditoria/discrepancias', (req, res) => {
  try {
    const { tab = 'fantasmas', search = '', secretaria = '', tipo = '', page = 1, limit = 50 } = req.query;
    const {
      fantasmasList,
      foraDoContratoList,
      duplicidadesList,
      quarentenaList,
      kpis,
      secretariasDisponiveis
    } = getAuditoriaDataset();

    let currentList = [];
    if (tab === 'fantasmas') {
      currentList = fantasmasList;
      if (tipo) currentList = currentList.filter(i => (i.tipo_estimado || '').toUpperCase() === tipo.toUpperCase());
      if (search) {
        const s = search.toLowerCase().trim();
        currentList = currentList.filter(i =>
          (i.item && String(i.item).toLowerCase().includes(s)) ||
          (i.n_serie && String(i.n_serie).toLowerCase().includes(s)) ||
          (i.descricao && String(i.descricao).toLowerCase().includes(s)) ||
          (i.nfe_remessa && String(i.nfe_remessa).toLowerCase().includes(s))
        );
      }
    } else if (tab === 'excedentes') {
      currentList = foraDoContratoList;
      if (secretaria) currentList = currentList.filter(i => (i.secretaria || '').toUpperCase().includes(secretaria.toUpperCase()));
      if (tipo) currentList = currentList.filter(i => (i.tipo || '').toUpperCase().includes(tipo.toUpperCase()));
      if (search) {
        const s = search.toLowerCase().trim();
        currentList = currentList.filter(i =>
          (i.codigo && String(i.codigo).toLowerCase().includes(s)) ||
          (i.servidor && String(i.servidor).toLowerCase().includes(s)) ||
          (i.matricula && String(i.matricula).toLowerCase().includes(s)) ||
          (i.secretaria && String(i.secretaria).toLowerCase().includes(s)) ||
          (i.unidade && String(i.unidade).toLowerCase().includes(s))
        );
      }
    } else if (tab === 'duplicidades') {
      currentList = duplicidadesList;
      if (secretaria) currentList = currentList.filter(i => (i.secretarias || []).some(sec => sec && sec.toUpperCase().includes(secretaria.toUpperCase())));
      if (search) {
        const s = search.toLowerCase().trim();
        currentList = currentList.filter(i =>
          (i.codigo && String(i.codigo).toLowerCase().includes(s)) ||
          (i.servidores || []).some(srv =>
            (srv.servidor && srv.servidor.toLowerCase().includes(s)) ||
            (srv.matricula && srv.matricula.toLowerCase().includes(s)) ||
            (srv.secretaria && srv.secretaria.toLowerCase().includes(s))
          )
        );
      }
    } else if (tab === 'quarentena') {
      currentList = quarentenaList;
      if (secretaria) currentList = currentList.filter(i => (i.secretaria || '').toUpperCase().includes(secretaria.toUpperCase()));
      if (tipo) currentList = currentList.filter(i => (i.tipo || '').toUpperCase().includes(tipo.toUpperCase()));
      if (search) {
        const s = search.toLowerCase().trim();
        currentList = currentList.filter(i =>
          (i.codigoDeclarado && String(i.codigoDeclarado).toLowerCase().includes(s)) ||
          (i.servidor && String(i.servidor).toLowerCase().includes(s)) ||
          (i.matricula && String(i.matricula).toLowerCase().includes(s)) ||
          (i.secretaria && String(i.secretaria).toLowerCase().includes(s)) ||
          (i.unidade && String(i.unidade).toLowerCase().includes(s))
        );
      }
    }

    const total = currentList.length;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = limit === 'todas' ? total : (parseInt(limit, 10) || 50);
    const paginated = limit === 'todas' ? currentList : currentList.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      success: true,
      tab,
      kpis,
      secretariasDisponiveis,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      items: paginated
    });
  } catch (err) {
    console.error('Error auditoria:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// CSV Export Endpoint
app.get('/api/auditoria/export', (req, res) => {
  try {
    const { tab = 'fantasmas' } = req.query;
    const {
      fantasmasList,
      foraDoContratoList,
      duplicidadesList,
      quarentenaList
    } = getAuditoriaDataset();

    let csvContent = '\ufeff';
    let filename = `auditoria_${tab}_${new Date().toISOString().slice(0, 10)}.csv`;

    if (tab === 'fantasmas') {
      csvContent += 'Patrimônio / Item;Nº Série;Tipo Estimado;Descrição do Equipamento;NFe Remessa;Valor Mensal;Status no Contrato\r\n';
      for (const c of fantasmasList) {
        csvContent += `"${c.item || ''}";"${c.n_serie || ''}";"${c.tipo_estimado || ''}";"${(c.descricao || '').replace(/"/g, '""')}";"${c.nfe_remessa || ''}";"${c.valor_mensal || ''}";"${c.statusRisco}"\r\n`;
      }
    } else if (tab === 'excedentes') {
      csvContent += 'Código Declarado;Tipo;Servidor Responsável;Matrícula;Secretaria;Unidade de Trabalho;Telefone;Endereço;Status Logístico\r\n';
      for (const fa of foraDoContratoList) {
        csvContent += `"${fa.codigo}";"${fa.tipo}";"${(fa.servidor || '').replace(/"/g, '""')}";"${fa.matricula}";"${fa.secretaria}";"${(fa.unidade || '').replace(/"/g, '""')}";"${fa.telefone}";"${(fa.endereco || '').replace(/"/g, '""')}";"${fa.statusLogistico}"\r\n`;
      }
    } else if (tab === 'duplicidades') {
      csvContent += 'Código Duplicado;Qtd Declarações;Pertence Contrato EMC;Servidores e Secretarias Declarantes\r\n';
      for (const d of duplicidadesList) {
        const inContract = d.pertenceContratoEMC ? 'Sim' : 'Não';
        const srvList = (d.servidores || []).map(e => `${e.servidor} (${e.matricula} - ${e.secretaria})`).join(' // ');
        csvContent += `"${d.codigo}";"${d.qtdOcorrencias}";"${inContract}";"${srvList.replace(/"/g, '""')}"\r\n`;
      }
    } else if (tab === 'quarentena') {
      csvContent += 'Texto Declarado;Tipo;Servidor Responsável;Matrícula;Secretaria;Unidade de Trabalho;Telefone;Endereço\r\n';
      for (const q of quarentenaList) {
        csvContent += `"${(q.codigoDeclarado || '').replace(/"/g, '""')}";"${q.tipo}";"${(q.servidor || '').replace(/"/g, '""')}";"${q.matricula}";"${q.secretaria}";"${(q.unidade || '').replace(/"/g, '""')}";"${q.telefone}";"${(q.endereco || '').replace(/"/g, '""')}"\r\n`;
      }
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).send('Erro ao exportar CSV: ' + err.message);
  }
});

// Corrigir inconsistência / editar e retornar à base ativa
app.post('/api/auditoria/corrigir-inconsistencia', (req, res) => {
  try {
    const { formId, fieldKey, novoCodigo } = req.body;
    if (!formId || !fieldKey || !novoCodigo || !String(novoCodigo).trim()) {
      return res.status(400).json({ success: false, message: 'Informe o novo código de patrimônio.' });
    }

    const row = db.prepare("SELECT * FROM inventario_rows WHERE id = ?").get(formId);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Registro de formulário não encontrado.' });
    }

    const data = JSON.parse(row.row_json);
    const cleanedCode = cleanAssetCode(novoCodigo);
    data[fieldKey] = cleanedCode;

    db.prepare("UPDATE inventario_rows SET row_json = ? WHERE id = ?").run(JSON.stringify(data), formId);

    // Invalidate memory cache so next request recalculates
    cachedBase = null;
    cacheTimestamp = 0;

    res.json({
      success: true,
      message: `Patrimônio atualizado para "${cleanedCode}". O ativo foi reintegrado à base ativa com sucesso!`
    });
  } catch (err) {
    console.error('Erro ao corrigir inconsistência:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Descartar inconsistência (marcar que o servidor realmente não tem esse equipamento)
app.post('/api/auditoria/descartar-inconsistencia', (req, res) => {
  try {
    const { formId, fieldKey } = req.body;
    if (!formId || !fieldKey) {
      return res.status(400).json({ success: false, message: 'Dados incompletos.' });
    }

    const row = db.prepare("SELECT * FROM inventario_rows WHERE id = ?").get(formId);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Registro de formulário não encontrado.' });
    }

    const data = JSON.parse(row.row_json);
    data[fieldKey] = null;

    db.prepare("UPDATE inventario_rows SET row_json = ? WHERE id = ?").run(JSON.stringify(data), formId);

    // Invalidate memory cache
    cachedBase = null;
    cacheTimestamp = 0;

    res.json({
      success: true,
      message: 'Pendência descartada: servidor marcado como sem este equipamento.'
    });
  } catch (err) {
    console.error('Erro ao descartar inconsistência:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 8. ROMANEIOS DE DEVOLUÇÃO
// ==========================================
app.get('/api/romaneios', (req, res) => {
  try {
    const lotes = db.prepare("SELECT * FROM lotes_romaneio_emc ORDER BY id DESC").all();
    res.json({ success: true, lotes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/romaneios/criar', async (req, res) => {
  try {
    const { transportadora, motorista_nome, motorista_rg_cnh, placa_veiculo, responsavel_ti, observacoes } = req.body;
    const count = db.prepare("SELECT count(*) as c FROM lotes_romaneio_emc").get().c;
    const num = `ROM-EMC-${new Date().getFullYear()}${(new Date().getMonth()+1).toString().padStart(2, '0')}-${(count + 1).toString().padStart(3, '0')}`;

    const unassigned = db.prepare("SELECT id, tipo_equipamento FROM conferencias_galpao WHERE lote_romaneio_id IS NULL AND status_etapa = 'aguardando_retirada_emc'").all();
    let cpus = 0, monitores = 0, notes = 0;
    for (const u of unassigned) {
      if (u.tipo_equipamento === 'CPU') cpus++;
      if (u.tipo_equipamento === 'MONITOR') monitores++;
      if (u.tipo_equipamento === 'NOTEBOOK') notes++;
    }

    const totalGeral = unassigned.length;
    const info = db.prepare(`
      INSERT INTO lotes_romaneio_emc (
        numero_romaneio, data_fechamento, status, transportadora, motorista_nome,
        motorista_rg_cnh, placa_veiculo, responsavel_ti, total_cpus, total_monitores,
        total_notebooks, total_geral, observacoes
      ) VALUES (?, datetime('now', 'localtime'), 'fechado', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      num, transportadora || 'Transportadora EMC', motorista_nome || '',
      motorista_rg_cnh || '', placa_veiculo || '', responsavel_ti || 'Equipe TI Contagem',
      cpus, monitores, notes, totalGeral, observacoes || ''
    );

    const loteId = info.lastInsertRowid;
    db.prepare("UPDATE conferencias_galpao SET lote_romaneio_id = ? WHERE lote_romaneio_id IS NULL AND status_etapa = 'aguardando_retirada_emc'").run(loteId);

    await syncRecordToTurso('lotes_romaneio_emc', loteId);
    await executeTurso("UPDATE conferencias_galpao SET lote_romaneio_id = ? WHERE lote_romaneio_id IS NULL AND status_etapa = 'aguardando_retirada_emc'", [loteId]);

    res.json({
      success: true,
      message: `Romaneio ${num} gerado com sucesso com ${totalGeral} itens no galpão para devolução!`,
      loteId,
      numeroRomaneio: num
    });
  } catch (err) {
    console.error('Error romaneio:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/romaneios/:id/itens', (req, res) => {
  try {
    const lote = db.prepare("SELECT * FROM lotes_romaneio_emc WHERE id = ?").get(req.params.id);
    if (!lote) return res.status(404).json({ success: false, message: 'Romaneio não encontrado.' });
    const itens = db.prepare("SELECT * FROM conferencias_galpao WHERE lote_romaneio_id = ? ORDER BY tipo_equipamento, codigo_bipado").all(req.params.id);
    res.json({ success: true, lote, itens });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Health check with DB diagnostics
app.get('/api/health', (req, res) => {
  let dbStatus = 'unknown';
  let dbError = null;
  let tables = [];
  let counts = {};
  try {
    const row = db.prepare("SELECT sqlite_version() as ver").get();
    tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    dbStatus = `connected (sqlite v${row.ver})`;
    try { counts.baseContratual = db.prepare("SELECT count(1) as c FROM base_contratual_emc").get()?.c; } catch(e) {}
    try { counts.inventarioRows = db.prepare("SELECT count(1) as c FROM inventario_rows").get()?.c; } catch(e) {}
    try { counts.conferenciasGalpao = db.prepare("SELECT count(1) as c FROM conferencias_galpao").get()?.c; } catch(e) {}
  } catch (err) {
    dbStatus = 'error';
    dbError = err.message;
  }

  res.json({
    status: 'ok',
    version: '2.1.0-ultra-fast-cache',
    time: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    cacheWarmed: !!cachedCompiledContrato,
    contratoCount: cachedCompiledContrato?.list?.length || 0,
    equipamentosCount: cachedCompiledEquipamentos?.items?.length || 0,
    dbPath: DB_PATH,
    dbFileExists: fs.existsSync(DB_PATH),
    dbFileSize: fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0,
    dbStatus,
    dbError,
    counts,
    tables
  });
});

// Serve frontend static build
const possibleDistPaths = [
  process.env.DIST_PATH,
  path.resolve(__dirname, '../../dist'),
  path.resolve(__dirname, '../../../dist'),
  path.resolve(process.cwd(), 'dist'),
  path.resolve(process.cwd(), 'Inventario/dist'),
  'd:/LadingPage-Inventario/Inventario/dist'
].filter(Boolean);
const clientDistPath = possibleDistPaths.find(p => fs.existsSync(p)) || path.resolve(__dirname, '../../dist');
console.log(`[Static] Servindo frontend de: ${clientDistPath} (index.html: ${fs.existsSync(path.resolve(clientDistPath, 'index.html'))})`);
app.use(express.static(clientDistPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.resolve(clientDistPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`[API Inventário EMC] Servidor ativo e pronto na porta ${PORT} (${HOST})`);
  // Sincronização inicial com Turso Cloud
  syncFromTurso().catch(e => console.error('[Turso startup error]:', e.message));
  // Sincronização periódica a cada 5 minutos
  setInterval(() => {
    syncFromTurso().catch(e => console.error('[Turso periodic sync error]:', e.message));
  }, 5 * 60 * 1000);
});
