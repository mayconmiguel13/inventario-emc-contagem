# 📦 Sistema de Gestão de Ativos e Devolução EMC

Sistema completo de logística reversa e auditoria para devolução de equipamentos locados à empresa **EMC**, desenvolvido especificamente para atender a operação da **Prefeitura Municipal de Contagem**.

---

## 🎯 Solução para o Dilema dos Equipamentos Excedentes ("Buraco Negro")

Quando a equipe recolhe equipamentos nas secretarias (ex: Secretaria X previa 20 CPUs, mas foram encontradas 25), o sistema resolve através do **Motor Inteligente de Conciliação**:

1. **Equipamento Previsto no Local:** Marcado como `Conforme`.
2. **Equipamento de Outro Setor:** O sistema identifica que pertencia a outra secretaria e registra como `Deslocado`, explicando simultaneamente a falta no setor de origem.
3. **Equipamento Não Catalogado na Planilha Base (Os 5 a mais):** O sistema cadastra o item no ato com status `Excedente Novo`, vincula ao lote de devolução da EMC e elimina o "buraco". Nenhum equipamento vai para o caminhão sem registro.

---

## 🚀 Como Iniciar a Aplicação

### Opção 1: Dois cliques (Mais rápido)
Dê um duplo clique no arquivo:
```
d:\LadingPage-Inventario\Inventario\iniciar.bat
```
O servidor será iniciado e abrirá automaticamente no seu navegador em `http://localhost:5000`.

### Opção 2: Via Terminal
```bash
cd d:\LadingPage-Inventario\Inventario\server
npm start
```
Acesse no navegador: **`http://localhost:5000`**

---

## 🛠️ Funcionalidades Implementadas

### 1. 📊 Dashboard Executivo de Devolução
* **Total Contratado:** 1.960 equipamentos carregados diretamente do banco `inventario.sqlite`.
* **Total Físico no Galpão:** Contador em tempo real dos itens já conferidos.
* **Deslocados de Setor:** Equipamentos encontrados fora do local original.
* **Excedentes Recuperados:** Todos os itens a mais encontrados.
* **Pendentes:** Máquinas que ainda faltam recolher (para evitar multas/cobranças da EMC).
* **Quadro das 25 Secretarias:** Acompanhamento da taxa de conclusão de cada setor (SMDS, SEFAZ, SEMAD, SETGER, etc.).

### 2. ⚡ Central de Bipagem & Conciliação
* **Aba Upload de Arquivos:** Arraste e solte arquivos `.txt` gerados pelo **Coletor APK** (`coleta_SETGER...txt`) ou `.csv` do **QRbot**. O sistema lê os códigos, executa a normalização inteligente de códigos de barras (reconhecendo prefixos `1000...`) e salva a auditoria em milissegundos.
* **Aba Leitor Rápido de Galpão:** Campo com foco contínuo para leitura direta via **pistola de código de barras USB**, com bip sonoro de feedback e exibição imediata do card do ativo.

### 3. ➕ Gestão de Itens Excedentes
* Painel exclusivo para auditar todos os equipamentos não catalogados que surgiram no galpão, garantindo rastreabilidade de data, tipo e lote de destino.

### 4. 🏢 Base Geral de Ativos (1.960 Equipamentos)
* Busca instantânea por Servidor, Secretaria, Unidade ou Patrimônio de CPU/Monitor.
* Filtros dinâmicos por status (`Conforme`, `Deslocado`, `Excedente`, `Pendente`).

### 5. 📄 Romaneios Oficiais de Devolução EMC
* Agrupamento dos itens conferidos em um lote numerado (ex: `ROM-EMC-202610-001`).
* Registro dos dados da transportadora, motorista, RG/CNH, placa do veículo e responsável da TI.
* **Impressão do Termo Timbrado Oficial:** Layout pronto para assinatura e termo de responsabilidade com a EMC.
