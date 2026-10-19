# Gestão Jurídica - Backend API Forense (LegalTech)

Backend modular e escalável desenvolvido em **Node.js (Express)**, com banco de dados relacional **MySQL** e **Prisma ORM**.

---

## 🛠️ Stack Tecnológica

* **Runtime:** Node.js (ES Modules)
* **Framework:** Express.js com CORS habilitado
* **Banco de Dados:** MySQL 8.0 (Container Docker ou Instância Nativa)
* **ORM:** Prisma v6
* **Autenticação:** JSON Web Tokens (JWT) + Refresh Token + Bcrypt.js (Salt 10)
* **Arquitetura:** Multi-tenant por Sociedade de Advogados com RBAC (Role-Based Access Control)

---

## 🚀 Como Executar

### 1. Iniciar o Banco MySQL (Docker)
```bash
docker compose up -d
```

### 2. Sincronizar o Schema Prisma com o Banco
```bash
npm run prisma:push
```

### 3. Executar o Povoamento Inicial (Seed)
```bash
npm run prisma:seed
```

### 4. Iniciar a API em Desenvolvimento
```bash
npm run dev
# ou
npm start
```
A API estará ativa em `http://localhost:5000`.

---

## 🔐 Credenciais Padrão Geradas no Seed

| Perfil | E-mail | Senha | Papel (Role) |
| :--- | :--- | :--- | :--- |
| **Administrador / Sócio** | `admin@silvaadvocacia.com.br` | `admin123` | `ADMIN` (Acesso irrestrito) |
| **Advogada Associada** | `camila@silvaadvocacia.com.br` | `admin123` | `ADVOGADO` (Operações forenses) |

---

## 📡 Endpoints Implementados

### 🔐 Módulo de Autenticação (Etapa 1)
| Método | Rota | Proteção | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Pública | Status de saúde da API |
| `POST` | `/api/auth/register-sociedade` | Pública | Cadastra novo escritório e usuário administrador |
| `POST` | `/api/auth/login` | Pública | Realiza autenticação e retorna Access Token + Refresh Token |
| `POST` | `/api/auth/refresh` | Pública | Renova Access Token utilizando Refresh Token válido |
| `GET` | `/api/auth/me` | JWT Bearer | Retorna dados completos do usuário autenticado e sociedade |
| `POST` | `/api/auth/logout` | JWT Bearer | Invalida os refresh tokens do usuário no banco |

### 👥 Módulo de Clientes (Etapa 2)
| Método | Rota | Proteção | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/clientes` | JWT Bearer | Listagem com busca textual, filtro de tipo (PF/PJ), status e paginação |
| `GET` | `/api/clientes/stats` | JWT Bearer | Estatísticas consolidadas (Total, PF, PJ, Ativos) |
| `GET` | `/api/clientes/:id` | JWT Bearer | Detalhes do cliente, processos vinculados e histórico financeiro |
| `POST` | `/api/clientes` | JWT Bearer | Cadastro de novo cliente com validação de unicidade de documento (CPF/CNPJ) |
| `PUT` | `/api/clientes/:id` | JWT Bearer | Atualização cadastral de dados do cliente |
| `DELETE` | `/api/clientes/:id` | JWT Bearer | Remoção de cliente (com trava de segurança para processos ativos) |

### ⚖️ Módulo de Processos Judiciais (Etapa 2)
| Método | Rota | Proteção | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/processos` | JWT Bearer | Listagem com busca por CNJ, cliente, vara, polo, fase e área |
| `GET` | `/api/processos/stats` | JWT Bearer | Métricas consolidadas (Total de processos, polos e valor total sob gestão) |
| `GET` | `/api/processos/:id` | JWT Bearer | Detalhes do processo com prazos, audiências, tarefas e documentos |
| `POST` | `/api/processos` | JWT Bearer | Cadastro de novo processo com validação de CNJ e vínculo automático de cliente |
| `PUT` | `/api/processos/:id` | JWT Bearer | Atualização de dados processuais, fases e observações |
| `DELETE` | `/api/processos/:id` | JWT Bearer | Exclusão de pasta processual com trilha de auditoria |

### ⏰ Módulo de Prazos Processuais & Agenda Forense (Etapa 3)
| Método | Rota | Proteção | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/prazos` | JWT Bearer | Listagem de prazos com busca por CNJ/cliente, urgência e status |
| `GET` | `/api/prazos/stats` | JWT Bearer | Estatísticas consolidadas (Total, Pendentes, Concluídos, Fatais) |
| `GET` | `/api/prazos/:id` | JWT Bearer | Detalhes completos do prazo, responsável e processo vinculado |
| `POST` | `/api/prazos` | JWT Bearer | Cadastro de prazo com parser inteligente de datas e vínculo de CNJ |
| `PUT` | `/api/prazos/:id` | JWT Bearer | Atualização de dados do prazo, responsável e vencimento fatal |
| `PATCH` | `/api/prazos/:id/cumprir` | JWT Bearer | Protocolo e cumprimento de prazo com carimbo de data/hora |
| `DELETE` | `/api/prazos/:id` | JWT Bearer | Exclusão de prazo com trilha de auditoria |

### 🏛️ Módulo de Audiências Judiciais (Etapa 3)
| Método | Rota | Proteção | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/audiencias` | JWT Bearer | Pauta de audiências com filtros por modalidade, status e processo |
| `GET` | `/api/audiencias/:id` | JWT Bearer | Detalhes da audiência, link de sala virtual e orientações prévias |
| `POST` | `/api/audiencias` | JWT Bearer | Agendamento de audiência (presencial, virtual Teams/Zoom ou híbrida) |
| `PUT` | `/api/audiencias/:id` | JWT Bearer | Atualização de data/hora, link de sala e observações da pauta |
| `DELETE` | `/api/audiencias/:id` | JWT Bearer | Cancelamento e remoção da audiência da pauta forense |

### 📋 Módulo de Tarefas & Kanban Forense (Etapa 3)
| Método | Rota | Proteção | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/tarefas` | JWT Bearer | Listagem e visão Kanban com filtro por status, prioridade e responsável |
| `GET` | `/api/tarefas/stats` | JWT Bearer | Métricas do Kanban (A Fazer, Em Andamento, Revisão, Concluído) |
| `GET` | `/api/tarefas/:id` | JWT Bearer | Detalhes da tarefa, checklist interativo e histórico de comentários |
| `POST` | `/api/tarefas` | JWT Bearer | Criação de nova tarefa forense com prioridade e subtarefas |
| `PATCH` | `/api/tarefas/:id/status` | JWT Bearer | Movimentação rápida de coluna no quadro Kanban (`a_fazer`, `em_andamento`, etc.) |
| `PUT` | `/api/tarefas/:id` | JWT Bearer | Atualização completa de tarefa, subtarefas e comentários |
| `DELETE` | `/api/tarefas/:id` | JWT Bearer | Exclusão de tarefa com log de auditoria |

### 📰 Módulo DJEN & Extrator Inteligente de Publicações (Etapa 4)
| Método | Rota | Proteção | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/publicacoes` | JWT Bearer | Listagem de publicações judiciais com busca, filtros de tribunal, status e urgência |
| `GET` | `/api/publicacoes/stats` | JWT Bearer | Estatísticas da triagem (Total, Novas/Não Lidas, Prazos Gerados, Fatais) |
| `GET` | `/api/publicacoes/:id` | JWT Bearer | Detalhes da publicação com processo vinculado e análise pericial |
| `POST` | `/api/publicacoes` | JWT Bearer | Cadastro manual ou ingestão via webhook com análise automática de prazo e hash |
| `POST` | `/api/publicacoes/sincronizar` | JWT Bearer | Sincronização automatizada do DJEN simulando robô de diários oficiais para processos da banca |
| `PATCH` | `/api/publicacoes/:id/lida` | JWT Bearer | Alternância de status de leitura (`Nova` / `Lida`) |
| `POST` | `/api/publicacoes/marcar-todas-lidas` | JWT Bearer | Marcação de todas as publicações não lidas como lidas |
| `POST` | `/api/publicacoes/:id/converter` | JWT Bearer | Conversão direta atômica de publicação em Prazo Fatal e Tarefa Kanban |
| `GET` | `/api/publicacoes/:id/certidao` | JWT Bearer | Emissão de Certidão Forense Digital com carimbo do tempo e hash criptográfico SHA-256 |
| `DELETE` | `/api/publicacoes/:id` | JWT Bearer | Remoção de publicação da triagem com registro pericial em trilha de auditoria |

### 📄 Módulo de Repositório de Documentos Forenses (Etapa 5)
| Método | Rota | Proteção | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/documentos` | JWT Bearer | Listagem com busca por título/conteúdo/autor/processo, filtros de tipo e paginação |
| `GET` | `/api/documentos/stats` | JWT Bearer | Estatísticas do acervo (Total de documentos, Petições, Contratos e Minutas) |
| `GET` | `/api/documentos/:id` | JWT Bearer | Detalhes do documento com processo, cliente e hash SHA-256 |
| `POST` | `/api/documentos` | JWT Bearer | Registro de novo documento/peça com cálculo automático de hash criptográfico SHA-256 |
| `PUT` | `/api/documentos/:id` | JWT Bearer | Atualização de documento com versionamento automático (`versao++`) e recálculo de hash |
| `DELETE` | `/api/documentos/:id` | JWT Bearer | Exclusão de documento do repositório com log de auditoria forense |

### 🖋️ Módulo de Assinaturas Digitais & Envelopes (Etapa 5)
| Método | Rota | Proteção | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/envelopes` | JWT Bearer | Listagem de envelopes com filtros de status (`pendente`, `assinado`, `cancelado`) e método (`eletronica_inapp`, `gov_br`) |
| `GET` | `/api/envelopes/stats` | JWT Bearer | Métricas de conversão de assinaturas (Total, Assinados, Pendentes, Taxa de Conversão %) |
| `GET` | `/api/envelopes/:id` | JWT Bearer | Detalhes do envelope por ID numérico ou código (`ENV-2026-001`) |
| `POST` | `/api/envelopes` | JWT Bearer | Criação de novo envelope de assinatura digital com geração de código único e hash SHA-256 |
| `POST` | `/api/envelopes/:id/assinar` | JWT Bearer | Coleta de assinatura touch/canvas ou Gov.br com registro pericial (IP, User-Agent, Timestamp e Geolocalização) |
| `PATCH` | `/api/envelopes/:id/cancelar` | JWT Bearer | Cancelamento formal de envelope de assinatura |
| `POST` | `/api/envelopes/:id/lembrete` | JWT Bearer | Registro e disparo de lembrete de assinatura via WhatsApp / Notificação |
| `GET` | `/api/envelopes/:id/manifesto` | JWT Bearer | Geração do Manifesto Pericial de Autenticidade em HTML (Folha A4, Lei 14.063/2020 e MP 2.200-2/2001) |
| `DELETE` | `/api/envelopes/:id` | JWT Bearer | Remoção de envelope com trilha de auditoria |

### 💰 Módulo Financeiro & Controladoria Forense (Etapa 6)
| Método | Rota | Proteção | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/financeiro` | JWT Bearer | Listagem de lançamentos com busca por cliente/processo/descrição, filtros de status e tipo |
| `GET` | `/api/financeiro/stats` | JWT Bearer | Métricas em tempo real (Total Recebido, A Receber, Total Geral, Pendentes, Atrasados e tipos) |
| `GET` | `/api/financeiro/dre` | JWT Bearer | DRE Forense Sintético com apuração de receitas brutas, custas, despesas e margem líquida |
| `GET` | `/api/financeiro/:id` | JWT Bearer | Detalhes completos do lançamento com dados do processo e cliente |
| `POST` | `/api/financeiro` | JWT Bearer | Registro de novo honorário (Contratual, Êxito, Sucumbência, Partido, Reembolso) |
| `PUT` | `/api/financeiro/:id` | JWT Bearer | Atualização de valores, vencimentos, forma de pagamento e observações |
| `PATCH` | `/api/financeiro/:id/liquidar` | JWT Bearer | Liquidação rápida de honorário (marcação como `Pago` e registro de data de quitação) |
| `POST` | `/api/financeiro/importar` | JWT Bearer | Importação em lote de planilhas CSV/Excel com transação atômica no banco |
| `DELETE` | `/api/financeiro/:id` | JWT Bearer | Exclusão de lançamento com trilha de auditoria |

### 📊 Módulo de Relatórios & BI Forense (Etapa 6)
| Método | Rota | Proteção | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/relatorios/dashboard` | JWT Bearer | Indicadores consolidados de BI (Capital sob Gestão R$ 5M+, Ticket Médio, Taxa de Sucesso, Áreas e Polos) |
| `GET` | `/api/relatorios/scorecard` | JWT Bearer | Scorecard de produtividade da equipe forense (processos, prazos cumpridos e tempestividade %) |
| `GET` | `/api/relatorios/contingenciamento` | JWT Bearer | Análise contábil CPC/IFRS de contingenciamento passivo (Provável, Possível, Remota e Provisão) |
| `GET` | `/api/relatorios/cliente/:clienteId` | JWT Bearer | Ficha cadastral e histórico analítico consolidado do cliente |

### 💬 Central de Comunicação & WhatsApp API (Etapa 6)
| Método | Rota | Proteção | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/comunicacoes` | JWT Bearer | Histórico de disparos com filtros de canal (WhatsApp/E-mail/SMS), tipo e status |
| `GET` | `/api/comunicacoes/stats` | JWT Bearer | Métricas de entrega, leitura e engajamento |
| `POST` | `/api/comunicacoes` | JWT Bearer | Envio e registro de mensagem com suporte a templates (Audiência, Andamento e Cobrança com PIX) |
| `POST` | `/api/comunicacoes/disparo-em-massa` | JWT Bearer | Disparo automatizado de notificações e lembretes em lote via gateway simulado |
| `DELETE` | `/api/comunicacoes/:id` | JWT Bearer | Remoção de mensagem do histórico com log de auditoria |

---

## 🏆 Status de Execução das Etapas do Backend

* ✅ **Etapa 1:** Fundação, Prisma, Banco MySQL & Autenticação JWT / RBAC (Concluída)
* ✅ **Etapa 2:** Módulos Core - Clientes & Processos Judiciais (Concluída)
* ✅ **Etapa 3:** Agenda Forense, Prazos Fatais CPC/CLT & Kanban de Tarefas (Concluída)
* ✅ **Etapa 4:** DJEN & Extrator Inteligente de Prazos (Concluída)
* ✅ **Etapa 5:** Assinaturas Digitais, Envelopes & Auditoria Criptográfica SHA-256 (Concluída)
* ✅ **Etapa 6:** Gestão Financeira, Relatórios/BI & Central WhatsApp (Concluída)

**100% DAS 6 ETAPAS DO BACKEND FORAM CONCLUÍDAS COM SUCESSO!**


