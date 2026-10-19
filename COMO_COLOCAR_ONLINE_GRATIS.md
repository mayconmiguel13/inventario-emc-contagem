# 🌐 Como Deixar o Sistema de Inventário Online 100% Gratuito

Este guia explica as **duas melhores formas** de colocar o **Inventário EMC (Prefeitura de Contagem)** acessível pela internet de qualquer celular, tablet ou computador, com **HTTPS oficial (necessário para a câmera do celular ler códigos de barras)** e **custo R$ 0,00**.

---

## 🎯 Por que o HTTPS é Obrigatório no Celular?
Os navegadores modernos de smartphones (Google Chrome, Apple Safari) **bloqueiam o acesso à câmera** quando o site é acessado por conexões sem segurança (`http://`). 
Para que a câmera do celular escaneie os patrimônios instantaneamente, a conexão precisa ter **HTTPS (`https://`)**, o que as duas opções abaixo fornecem automaticamente de graça.

---

## 🚀 OPÇÃO 1: Nuvem 24/7 Permanente no Render.com (Recomendado)
> **Ideal para:** Deixar o sistema sempre online na internet, 24 horas por dia, 7 dias por semana, mesmo que seu computador de trabalho esteja desligado.

### O que você vai precisar:
- Uma conta gratuita no **[GitHub](https://github.com)**
- Uma conta gratuita no **[Render.com](https://render.com)**

### Passo a Passo:

#### 1. Criar repositório no seu GitHub
1. Acesse o [GitHub](https://github.com) e crie um novo repositório (exemplo: `inventario-emc-contagem`).
2. No seu computador, abra o PowerShell na pasta `d:\LadingPage-Inventario` e execute os comandos:
```bash
git init
git add .
git commit -m "feat: configuracao completa para nuvem gratuita"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/inventario-emc-contagem.git
git push -u origin main
```

#### 2. Conectar e Publicar no Render.com
1. Acesse **[Render.com](https://render.com)** e entre com sua conta do GitHub.
2. Clique no botão **"New +"** (no canto superior direito) e selecione **"Web Service"**.
3. Escolha o repositório `inventario-emc-contagem` que você acabou de criar.
4. Preencha as configurações:
   - **Name:** `inventario-emc-contagem` *(ou outro nome de sua preferência)*
   - **Region:** `Ohio (US East)` ou `Frankfurt`
   - **Branch:** `main`
   - **Root Directory:** *(deixe em branco)*
   - **Runtime:** `Node`
   - **Build Command:** `cd Inventario/server && npm install`
   - **Start Command:** `node Inventario/server/src/server.js`
   - **Instance Type:** `Free` ($0.00/mês)
5. Clique em **"Deploy Web Service"**.
6. Em cerca de 2 minutos, o Render gerará o link público com certificado SSL seguro:
   👉 **`https://inventario-emc-contagem.onrender.com`**

Pronto! Qualquer servidor ou operador pode abrir este link no celular, instalar como app PWA e usar o leitor óptico com câmera em qualquer lugar.

---

## ⚡ OPÇÃO 2: Link Seguro Instantâneo via Túnel (Em 5 Segundos)
> **Ideal para:** Testar imediatamente no galpão com o seu computador de trabalho ligado, sem precisar criar contas no GitHub ou no Render.

Criamos um arquivo executável direto na sua pasta:
1. Abra a pasta `d:\LadingPage-Inventario`.
2. Dê um duplo-clique no arquivo **`online_instantaneo.bat`**.
3. O terminal gerará automaticamente uma URL pública segura com HTTPS, por exemplo:
   👉 `https://bright-chairs-sing.loca.lt`
4. Abra esse endereço no navegador do celular (ao abrir pela primeira vez, ele exibirá um botão azul simples de confirmação *"Click to Submit"*).
5. A aplicação abrirá no celular com câmera liberada, bip sonoro ativo e sincronizando os dados direto com o banco de dados do seu computador!

---

## 📋 Resumo das Opções

| Recurso | Opção 1: Render.com | Opção 2: Túnel Local |
| :--- | :--- | :--- |
| **Custo** | R$ 0,00 | R$ 0,00 |
| **Computador precisa ficar ligado?** | **Não** (fica na nuvem 24/7) | Sim (conecta ao seu PC) |
| **HTTPS (Câmera liberada no celular)** | Sim (automático) | Sim (automático) |
| **Instalação como PWA no celular** | Sim | Sim |
| **Tempo para colocar no ar** | ~4 minutos | ~10 segundos |
