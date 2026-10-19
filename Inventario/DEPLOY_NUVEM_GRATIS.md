# 🚀 Guia Completo de Deploy na Nuvem (100% Gratuito)
## Gestão Jurídica Forense LegalTech

Este guia detalha o passo a passo para colocar sua aplicação completa no ar (**Frontend, Backend e Banco de Dados MySQL**) funcionando 24/7 na nuvem, com certificado SSL (HTTPS) e **custo R$ 0,00**.

---

### 🏗️ Arquitetura do Deploy Gratuito

```mermaid
graph LR
    User([Usuário / Celular / Web]) -->|HTTPS| Vercel[Frontend React na Vercel]
    Vercel -->|REST API / JWT| Render[Backend Node.js no Render.com]
    Render -->|Prisma ORM SSL| TiDB[MySQL 8 Cloud no TiDB Cloud Serverless]
```

| Camada | Provedor Recomendado | Plano Gratuito |
| :--- | :--- | :--- |
| **Banco de Dados** | **TiDB Cloud (Serverless)** ou **Aiven** | 5 GB vitalícios, MySQL 8 compatível, zero cartão |
| **Backend API** | **Render.com** | 750 horas/mês (100% grátis), HTTPS automático |
| **Frontend Web** | **Vercel** ou **Cloudflare Pages** | Ilimitado para uso pessoal/comercial leve, HTTPS e CDN global |

---

## 📌 PASSO 1: Criar o Banco de Dados MySQL na Nuvem (5 minutos)

Usaremos o **TiDB Cloud Serverless**, que é 100% compatível com MySQL 8 e Prisma ORM e oferece 5GB gratuitos para sempre:

1. Acesse: **[https://tidbcloud.com](https://tidbcloud.com)**
2. Crie sua conta gratuita com **Google** ou **GitHub** (não pede cartão de crédito).
3. Na tela inicial, clique em **"Create Cluster"** e selecione o plano **Serverless (Free)**.
4. Escolha a região mais próxima (ex: `us-east-1` ou `sa-east-1` se disponível).
5. Clique em **"Connect"**:
   - Selecione a opção **Prisma**.
   - O TiDB gerará a sua URL de conexão no formato:
   ```env
   DATABASE_URL="mysql://usuario:senha@gateway.region.tidbcloud.com:4000/gestao_juridica?sslaccept=strict"
   ```
6. **Copie e guarde essa URL.** Ela será usada no Render.

---

## 📌 PASSO 2: Subir o Código para o seu GitHub (3 minutos)

1. Crie um repositório no seu GitHub (pode ser público ou privado), por exemplo: `gestao-juridica-cloud`.
2. No seu computador, abra o terminal na pasta raiz (`d:\React\React\default`) e execute:

```bash
git init
git add .
git commit -m "feat: configuracao completa para deploy em nuvem gratuita"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/gestao-juridica-cloud.git
git push -u origin main
```

---

## 📌 PASSO 3: Fazer Deploy do Backend no Render.com (4 minutos)

1. Acesse: **[https://render.com](https://render.com)** e faça login com seu GitHub.
2. Clique no botão **"New +"** no topo e selecione **"Web Service"**.
3. Conecte com o seu repositório `gestao-juridica-cloud`.
4. Preencha as configurações:
   - **Name:** `gestao-juridica-api`
   - **Region:** Ohio (US East) ou Oregon
   - **Branch:** `main`
   - **Root Directory:** `server`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npx prisma generate`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Em **Environment Variables** (Variáveis de Ambiente), adicione:
   - `DATABASE_URL`: *(Cole a URL do TiDB que você copiou no Passo 1)*
   - `JWT_SECRET`: `silva_associados_jwt_secret_forense_2026`
   - `JWT_REFRESH_SECRET`: `silva_associados_refresh_token_2026`
   - `NODE_ENV`: `production`
6. Clique em **"Deploy Web Service"**.
7. Após 2 a 3 minutos, o Render gerará a sua URL da API, por exemplo:
   👉 `https://gestao-juridica-api.onrender.com`

---

## 📌 PASSO 4: Criar as Tabelas e Semear os Dados no Banco da Nuvem

Com o banco e a API configurados, você pode rodar as migrações direto da sua máquina para popular o banco da nuvem pela primeira vez:

No seu computador, no terminal da pasta `d:\React\React\default\server`:

```powershell
# Temporariamente aponte o DATABASE_URL para o banco da nuvem:
$env:DATABASE_URL="sua_url_do_tidb_aqui"

# Cria todas as 14 tabelas no banco da nuvem
npx prisma db push

# Popula os clientes, processos, prazos, financeiro e equipe
node prisma/seed.js
```

---

## 📌 PASSO 5: Fazer Deploy do Frontend na Vercel (3 minutos)

1. Acesse: **[https://vercel.com](https://vercel.com)** e faça login com seu GitHub.
2. Clique em **"Add New..."** ➔ **"Project"**.
3. Selecione o repositório `gestao-juridica-cloud`.
4. Configure os campos:
   - **Framework Preset:** `Vite`
   - **Root Directory:** Clique em Edit e selecione a pasta `gestao-juridica`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Em **Environment Variables**, adicione:
   - `VITE_API_URL`: `https://gestao-juridica-api.onrender.com/api` *(substitua pela sua URL do Render gerada no Passo 3)*
6. Clique em **"Deploy"**.

---

### 🎉 Parabéns! Sua Aplicação Está 100% no Ar!

- O seu frontend terá uma URL única gerada pela Vercel no seu Dashboard (ex: `https://gestao-juridica-mayconmiguel13.vercel.app` ou similar).
- O backend responderá na sua URL do Render: `https://gestao-juridica-api.onrender.com`.
- O banco de dados MySQL está seguro e ativo na nuvem (TiDB Cloud Serverless).
- **Credenciais de Acesso Inicial:**
  - **E-mail:** `admin@silvaadvocacia.com.br`
  - **Senha:** `admin123`
- Você pode acessar de qualquer computador, tablet ou celular, de qualquer rede, com o seu computador desligado!

