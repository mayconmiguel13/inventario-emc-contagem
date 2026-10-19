import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('d:/LadingPage-Inventario/node_modules/better-sqlite3');
const db = new Database('d:/LadingPage-Inventario/inventario.sqlite');

function cleanAssetCode(raw) {
  if (!raw) return raw;
  let s = String(raw).trim();
  if (!/EMC/i.test(s)) return raw;

  // Remove "EMC ", "EMC-", "EMC.", "EMC:"
  s = s.replace(/^EMC\s*[-:_.]?\s*/i, '');
  // Remove trailing "- EMC IMOBILIZADO", "(EMC)", etc.
  s = s.replace(/\s*[-–]\s*EMC.*$/i, '');
  s = s.replace(/\s*\(\s*EMC\s*\).*$/i, '');

  // If it starts with digits (5 to 8 digits) and has extra notes, extract the code
  const matchDigits = s.match(/^(\d{5,8})/);
  if (matchDigits) {
    s = matchDigits[1];
  }

  return s.trim();
}

const rows = db.prepare('SELECT id, row_json FROM inventario_rows').all();
let updatedRows = 0;
let totalFieldsCleaned = 0;
const updateStmt = db.prepare('UPDATE inventario_rows SET row_json = ? WHERE id = ?');
const fields = ['Patrimônio da CPU', 'Patrimônio do Monitor', 'Patrimônio do Monitor Avulso', 'Patrimônio do Notebook'];

for (const r of rows) {
  try {
    const d = JSON.parse(r.row_json);
    let changed = false;
    for (const f of fields) {
      if (d[f] && /EMC/i.test(d[f])) {
        const cleaned = cleanAssetCode(d[f]);
        if (cleaned !== d[f]) {
          console.log(`ID ${r.id} [${f}]: "${d[f]}" -> "${cleaned}"`);
          d[f] = cleaned;
          changed = true;
          totalFieldsCleaned++;
        }
      }
    }
    if (changed) {
      updateStmt.run(JSON.stringify(d), r.id);
      updatedRows++;
    }
  } catch (e) {
    console.error('Error on row:', r.id, e);
  }
}

console.log(`\nFinalizado com sucesso: ${updatedRows} formulários atualizados (${totalFieldsCleaned} campos de patrimônio limpos).`);
