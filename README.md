# Inventario TI (Vue + Vite + SQLite)

Painel web para leitura de planilhas Excel com persistencia local em SQLite.

## Fluxo de importacao incremental

- Primeira planilha: salva os registros no banco `inventario.sqlite`.
- Proximas planilhas: insere apenas linhas novas (deduplicacao por hash da linha normalizada).
- O painel sempre usa o conjunto consolidado salvo no banco.

## Endpoints locais

- `GET /api/dataset`: retorna todos os registros persistidos.
- `POST /api/import`: recebe `{ rows: [...] }`, grava somente novos e retorna o dataset consolidado.

## Como executar

1. Instalar dependências (e recompilar SQLite se necessário):

```bash
npm install
npm rebuild better-sqlite3
```

2. Rodar tudo integrado (Frontend + Backend SQLite em um único comando):

```bash
npm run dev
```

> **Nota:** Com `npm run dev`, o Vite integra diretamente o backend SQLite via middleware nas rotas `/api/*`.

3. Alternativas de execução:
- **Frontend + Backend em processos separados:** `npm run dev:all`
- **Apenas Servidor Backend (porta 3001):** `npm run dev:server`
- **Apenas Frontend:** `npm run dev:client`

4. Na tela inicial, o painel carregará automaticamente os dados existentes do banco `inventario.sqlite` ou você pode importar novas planilhas `.xlsx`.

## Observacoes de desempenho

- SQLite com transacao e indice em hash e rapido para milhares de linhas.
- Em cargas muito grandes (centenas de milhares), o custo principal vira parse do Excel + serializacao JSON.
