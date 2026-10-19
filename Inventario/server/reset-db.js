import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('d:/LadingPage-Inventario/node_modules/better-sqlite3');

const db = new Database('d:/LadingPage-Inventario/inventario.sqlite');
db.prepare('DELETE FROM conferencias_galpao').run();
db.prepare('DELETE FROM lotes_romaneio_emc').run();
db.prepare("UPDATE inventario_rows SET status_logistica = 'pendente'").run();

try {
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('conferencias_galpao', 'lotes_romaneio_emc')").run();
} catch (e) {}

console.log('--- STATUS APÓS LIMPEZA ---');
console.log('Conferências no Galpão:', db.prepare('SELECT count(*) as c FROM conferencias_galpao').get().c);
console.log('Romaneios de Devolução:', db.prepare('SELECT count(*) as c FROM lotes_romaneio_emc').get().c);
console.log('Base Contratual Oficial EMC:', db.prepare('SELECT count(*) as c FROM base_contratual_emc').get().c);
console.log('Base Formulário Servidores:', db.prepare('SELECT count(*) as c FROM inventario_rows').get().c);
console.log('Limpeza concluída com sucesso!');
