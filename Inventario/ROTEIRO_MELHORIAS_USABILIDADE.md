# Roteiro de melhorias — Gestão Jurídica

Criado em 05/10/2026. Objetivo: permitir que o advogado identifique suas prioridades, encontre um caso e execute o trabalho com clareza e confiança.

Este documento é um plano de execução incremental. Sua criação não altera a aplicação. O diagnóstico inicial foi feito pela leitura do código; a aparência, a responsividade e a experiência real ainda precisam ser verificadas no navegador e com usuários.

## Como usar

1. Execute uma etapa por vez, na ordem indicada ou respeitando suas dependências.
2. Copie o prompt da etapa para uma tarefa com acesso a este projeto. Os prompts já mandam ler as regras comuns deste documento.
3. Confira os critérios de conclusão e experimente o resultado antes de iniciar a próxima etapa.
4. Marque uma etapa como concluída somente depois da implementação e da validação. Registre limitações e pendências.
5. Se o código já tiver mudado, adapte a implementação ao estado atual. Não refaça algo que já esteja resolvido.

Para retomar sem escolher uma etapa manualmente:

```text
Leia ROTEIRO_MELHORIAS_USABILIDADE.md na raiz do projeto. Identifique a primeira etapa pendente cujas dependências estejam concluídas e execute somente essa etapa, seguindo as regras comuns. Verifique o estado atual do código antes de modificar qualquer arquivo. Ao terminar, atualize o acompanhamento com o que mudou, as validações realizadas e as pendências. Não avance automaticamente para a etapa seguinte.
```

## Regras comuns para todos os prompts

- O frontend jurídico está em `gestao-juridica/`; o backend está em `server/`. A raiz também contém um template Velzon separado. Confirme os pontos de entrada antes de editar e não faça alterações no template por engano.
- Leia as instruções locais aplicáveis e verifique as alterações existentes. Preserve o trabalho do usuário.
- Implemente apenas o escopo solicitado. Não troque o framework, o tema ou a biblioteca visual, nem faça uma reescrita geral.
- Preserve dados existentes, autenticação, autorização e isolamento entre sociedades. Ocultar um menu não substitui autorização no servidor.
- Use dados reais. Ausência de informação deve aparecer como ausência, nunca como número, documento ou evento inventado.
- Não confunda registro interno com ações externas: registrar cumprimento não é protocolar no tribunal; abrir uma conversa não é enviar uma mensagem.
- Não publique, não envie mensagens e não execute migrations ou seeds em produção como parte dessas etapas. Mudanças de schema devem incluir migração revisável e procedimento de recuperação dos dados.
- Para cada alteração funcional, valide o caminho normal, ausência de dados e falha da API. Datas, filtros, permissões e persistência merecem testes específicos. Alterações apenas de texto ou organização podem ser verificadas manualmente.
- Use os scripts disponíveis em cada projeto. No frontend, existem `npm run lint` e `npm run build`. Diferencie falhas anteriores de regressões introduzidas. Não diga que validou no navegador se isso não aconteceu.
- Ao concluir, atualize este documento e informe arquivos alterados, comportamento final, verificações e limitações. Não marque como concluída uma etapa com critérios essenciais pendentes.

## Acompanhamento

| Etapa | Mudança | Dependências | Concluída |
|---|---|---|---|
| 01 | Corrigir o significado de cumprimento e o retorno de falhas | Nenhuma | [ ] |
| 02 | Retirar ações e informações demonstrativas enganosas | Nenhuma | [ ] |
| 03 | Estruturar datas e preservar registros antigos | 01 | [ ] |
| 04 | Corrigir indicadores, agenda do dia e alertas | 02, 03 | [ ] |
| 05 | Simplificar o menu e os nomes | Nenhuma | [ ] |
| 06 | Criar a página Meu dia | 04, 05 | [ ] |
| 07 | Criar uma página própria para cada processo | 02, 03 | [ ] |
| 08 | Abrir o registro certo pela busca e pelos atalhos | 07 | [ ] |
| 09 | Simplificar o cadastro de prazos e compromissos | 03, 07 | [ ] |
| 10 | Organizar a triagem de intimações | 08, 09 | [ ] |
| 11 | Integrar tarefas ao contexto do processo | 06, 07 | [ ] |
| 12 | Simplificar tabelas e filtros | 08 | [ ] |
| 13 | Organizar documentos, modelos e assinaturas | 02, 07 | [ ] |
| 14 | Concentrar comunicação no cliente e no processo | 07, 08 | [ ] |
| 15 | Ajustar a experiência por perfil e responsabilidade | 05, 06 | [ ] |
| 16 | Revisar acessibilidade e uso no celular | 06 a 15 | [ ] |
| 17 | Validar os fluxos com advogados | 16 | [ ] |

## 01 — Corrigir cumprimento e retorno de falhas

**Problema observado:** `cumprirPrazo` altera o status, mas apresenta a mensagem “Prazo protocolado”. O contexto também pode mostrar sucesso depois de erro da API. O cadastro de prazo possui contingência local com mensagem de sucesso que não distingue persistência no servidor.

**Passo a passo:**

1. Rastrear todos os botões e mensagens de cumprimento, incluindo dashboard, agenda, banner e modais.
2. Trocar a ação por “Registrar cumprimento” e explicar que se trata de registro interno.
3. Exibir um resumo do prazo antes de concluir. Se houver campos de protocolo, permitir registrar data, número e comprovante conforme o modelo disponível, sem inventar uma integração.
4. Só remover o prazo da lista de pendentes após confirmação válida da operação. Em falha, preservar os dados e oferecer nova tentativa.
5. Diferenciar explicitamente “salvo no servidor”, “rascunho local” e “não salvo”, se a contingência local for mantida.
6. Impedir cliques repetidos durante a operação e preservar a trilha de auditoria existente.

**Pontos de partida:** `gestao-juridica/src/context/JuridicoContext.jsx`, `components/Common/BannerAlertaFatal.jsx`, `server/src/modules/agenda/prazoController.js` e consumidores da ação.

**Concluída quando:** nenhuma mensagem afirmar protocolo externo sem execução real; falha de persistência não aparecer como sucesso; conclusão atualizar corretamente a lista; duplo clique não duplicar a operação.

```text
Execute somente a etapa 01 de ROTEIRO_MELHORIAS_USABILIDADE.md, seguindo as regras comuns. Corrija o fluxo de cumprimento de prazos e a comunicação de persistência. A ação deve se chamar “Registrar cumprimento”, deixar claro que não protocola no tribunal e tratar falhas sem retirar indevidamente o prazo dos pendentes. Inspecione frontend e backend, preserve a auditoria e evite duplicidade de submissão. Diferencie contingência local de salvamento confirmado. Valide sucesso e falha da API e atualize o acompanhamento.
```

## 02 — Remover promessas e dados demonstrativos

**Problema observado:** o modal de processo contém documentos e movimentações fixos; os botões de download e protocolo apenas mostram notificações. O gráfico de evolução e algumas porcentagens também usam valores fixos.

**Passo a passo:**

1. Inventariar conteúdo demonstrativo e botões sem implementação nas telas jurídicas em uso.
2. Substituir documentos e históricos fixos pelos registros vinculados, quando disponíveis.
3. Mostrar estados vazios claros quando não existirem registros.
4. Retirar ou desabilitar com explicação curta as ações ainda indisponíveis; não emitir mensagens de execução fictícia.
5. Remover porcentagens e séries fixas da experiência real. Indicadores calculáveis serão tratados na etapa 04.
6. Se existir modo de demonstração, identificar visualmente seus dados e mantê-los separados do uso real.

**Pontos de partida:** `components/Modals/ModalDetalhesProcesso.jsx`, `components/Charts/EvolucaoProcessualChart.jsx`, `pages/Dashboard/index.jsx`.

**Concluída quando:** documento, histórico ou indicador demonstrativo não se passar por informação real; botões visíveis executarem a ação descrita ou explicarem sua indisponibilidade.

```text
Execute somente a etapa 02 de ROTEIRO_MELHORIAS_USABILIDADE.md. Inspecione as telas jurídicas e elimine ações que só simulam execução e dados demonstrativos apresentados como reais. Priorize o detalhe do processo e o dashboard. Use vínculos reais quando existirem; caso contrário, apresente estados vazios ou indisponibilidade clara. Não construa novas integrações externas para preencher essas lacunas. Preserve eventual demonstração somente se estiver identificada e separada dos dados reais. Valide e atualize o acompanhamento.
```

## 03 — Estruturar datas sem perder registros antigos

**Problema observado:** o prazo aceita texto como “Amanhã às 18:00”; componentes identificam “hoje” por busca em texto. Isso torna filtros e alertas dependentes da redação do campo.

**Passo a passo:**

1. Inspecionar o schema, os contratos da API e todos os locais que criam e consomem datas.
2. Definir representação consistente para datas civis e horários, explicitando o fuso quando houver instante com hora.
3. Separar o valor armazenado do texto apresentado ao usuário.
4. Introduzir compatibilidade com registros antigos e migrar apenas valores inequívocos.
5. Marcar textos relativos ou ambíguos para revisão, preservando o valor original. Não inferir a data de “amanhã” sem a referência temporal original.
6. Centralizar comparação e formatação para evitar que cada tela tenha sua própria regra.

**Concluída quando:** novos registros usarem datas estruturadas; registros antigos continuarem acessíveis; casos ambíguos estiverem identificados; testes cobrirem virada de dia, mês, ano e fuso. Esta etapa não deve alterar regras jurídicas de contagem de prazos sem análise específica.

```text
Execute somente a etapa 03 de ROTEIRO_MELHORIAS_USABILIDADE.md. Estruture as datas de prazos e audiências de ponta a ponta, inspecionando schema, API e consumidores. Preserve dados legados e texto original; não converta expressões relativas em datas inventadas. Crie compatibilidade e indique registros que precisam de revisão. Centralize comparação e apresentação, com tratamento explícito de data civil e fuso. Prepare migração revisável se necessária, sem executar alterações em produção. Não altere regras jurídicas de contagem. Valide os limites de calendário e atualize o acompanhamento.
```

## 04 — Corrigir indicadores e reduzir ruído dos alertas

**Problema observado:** a lista “Audiências de Hoje” usa outras audiências como fallback; o menu pode rotular todos os prazos pendentes como “Fatal Hoje”; o total de pendentes aparece como “Prazos Críticos”. Honorários apresentados como mensais não são filtrados por mês no cálculo lido.

**Passo a passo:**

1. Definir seletores compartilhados: vencidos, vencem hoje, próximos e concluídos.
2. Usar a data real para audiências do dia; remover o fallback para outros registros.
3. Fazer cada contador refletir exatamente sua descrição, inclusive processos ativos e valores por período e tipo de lançamento.
4. Calcular séries históricas apenas se existirem dados suficientes; caso contrário, informar indisponibilidade.
5. Unificar banner, contador do cabeçalho e menu para evitar resultados contraditórios.
6. Reservar destaque forte para situações acionáveis. Mover “Testar som” para configurações e evitar repetição desnecessária do mesmo alerta ao navegar.

**Concluída quando:** os mesmos dados produzirem as mesmas contagens em todas as telas; ausência de audiência hoje mostrar zero; períodos forem respeitados; alertas não chamarem todo pendente de crítico.

```text
Execute somente a etapa 04 de ROTEIRO_MELHORIAS_USABILIDADE.md. Corrija contadores e filtros do dashboard, menu, banner e cabeçalho usando as datas estruturadas da etapa 03. Remova o fallback indevido em “Audiências de Hoje”, diferencie pendentes de críticos e respeite período, status e tipo nos indicadores. Não invente séries históricas. Reduza alertas repetidos e mova o teste de som para configurações. Teste datas, listas vazias e concordância entre componentes. Atualize o acompanhamento.
```

## 05 — Simplificar menu e nomenclatura

**Problema observado:** 15 destinos no menu e selos técnicos ou promocionais competem pela atenção.

**Passo a passo:**

1. Organizar o primeiro nível em Meu dia, Processos, Agenda, Clientes, Documentos e Financeiro.
2. Manter Intimações e Tarefas facilmente acessíveis em agrupamentos claros e por atalhos do Meu dia, sem apagar suas rotas.
3. Agrupar equipe, configurações e relatórios gerenciais em Administração.
4. Integrar assinaturas a Documentos e comunicação/portal a Clientes, mantendo acesso aos recursos existentes.
5. Colocar contatos de varas em um local secundário com nome compreensível.
6. Retirar selos como RBAC, Ext e 1-Click. Usar contadores somente para pendências reais.
7. Preservar endereço antigo e indicação de item ativo, inclusive em rotas de detalhe.

**Concluída quando:** os seis destinos principais forem fáceis de localizar; nenhum recurso existente ficar sem acesso; navegar por URL antiga continuar funcionando.

```text
Execute somente a etapa 05 de ROTEIRO_MELHORIAS_USABILIDADE.md. Simplifique a navegação jurídica para Meu dia, Processos, Agenda, Clientes, Documentos e Financeiro, com Administração em área secundária. Agrupe os recursos restantes sem removê-los, mantenha Intimações e Tarefas acessíveis e preserve rotas antigas. Remova siglas e selos técnicos desnecessários. Use o tema atual e confira navegação ativa, acesso a todos os recursos e menu no celular. Nesta etapa, renomeie a entrada inicial sem reconstruir seu conteúdo. Atualize o acompanhamento.
```

## 06 — Transformar a entrada em Meu dia

**Objetivo:** responder rapidamente “o que exige minha atenção agora?”.

**Passo a passo:**

1. Ordenar conteúdo por vencidos, prazos de hoje, audiências do dia, intimações a revisar e tarefas.
2. Mostrar contexto suficiente: cliente, processo, data/hora e responsável.
3. Definir uma ação principal por item e um acesso ao detalhe.
4. Disponibilizar poucos atalhos de criação: prazo, tarefa e processo.
5. Oferecer filtro de responsável usando identidades reais; não inferir vínculo comparando apenas nomes.
6. Transferir gráficos gerenciais para Relatórios, reaproveitando apenas indicadores corretos.
7. Criar estados de carregamento, erro, ausência de dados e dia sem pendências.

**Concluída quando:** as prioridades aparecerem antes de métricas gerenciais; ações abrirem o contexto certo; estado vazio não encobrir erro de carregamento.

```text
Execute somente a etapa 06 de ROTEIRO_MELHORIAS_USABILIDADE.md. Transforme o dashboard em Meu dia, priorizando vencidos, prazos de hoje, audiências, intimações para revisar e tarefas. Reutilize os seletores corretos da etapa 04. Mostre cliente, processo e responsável, com uma ação principal por item. Mova a visão gerencial para Relatórios e implemente estados de carregamento, erro e vazio. Respeite as permissões existentes e não deduza a identidade do responsável por texto de nome. Valide e atualize o acompanhamento.
```

## 07 — Criar uma página para cada processo

**Objetivo:** reunir o trabalho do caso em um endereço estável, como `/processos/:id`.

**Passo a passo:**

1. Criar rota de detalhe que funcione por acesso direto e ao atualizar o navegador.
2. Exibir cabeçalho com cliente, CNJ, responsável, situação e próxima pendência conhecida.
3. Organizar abas: Resumo, Movimentações, Prazos e tarefas, Documentos e Financeiro.
4. Carregar apenas registros realmente relacionados ao processo. Preferir identificadores persistentes; não associar dados apenas por coincidência de nome.
5. Reaproveitar formulários existentes com processo previamente selecionado.
6. Migrar a abertura pela lista para a página e manter modais somente para ações curtas.
7. Tratar processo inexistente, acesso negado, carregamento e erro sem expor informações de outra sociedade.

**Concluída quando:** um processo puder ser aberto por URL; suas informações estiverem reunidas sem dados demonstrativos; voltar à lista preservar a navegação esperada.

```text
Execute somente a etapa 07 de ROTEIRO_MELHORIAS_USABILIDADE.md. Crie uma página de processo em rota estável por ID, substituindo o modal como consulta principal. Organize Resumo, Movimentações, Prazos e tarefas, Documentos e Financeiro com dados realmente vinculados e ações contextualizadas. Reutilize componentes existentes e preserve autorização e isolamento entre sociedades. Trate acesso direto, atualização da página, inexistência, erro e retorno à lista. Evite uma reescrita geral. Valide e atualize o acompanhamento.
```

## 08 — Fazer busca e atalhos abrirem o registro exato

**Problema observado:** selecionar um resultado da busca navega apenas para a lista do módulo.

**Passo a passo:**

1. Incluir tipo e identificador de registro em cada resultado.
2. Abrir processo pela sua rota; para outras entidades, criar seleção por URL ou rota de detalhe compatível com a tela existente.
3. Manter o item selecionado ao atualizar o navegador quando o fluxo exigir.
4. Aplicar o mesmo comportamento aos atalhos de Meu dia, notificações e alertas.
5. Preservar filtros de lista no retorno e tratar registro removido ou sem acesso.
6. Verificar teclado, Escape e foco da busca.

**Concluída quando:** clicar em um resultado não exigir repetir a pesquisa; links não dependerem somente de estado em memória; resultados negados não expuserem dados.

```text
Execute somente a etapa 08 de ROTEIRO_MELHORIAS_USABILIDADE.md. Faça a busca global e os atalhos abrirem o registro exato por ID, utilizando a rota de processo existente e rotas ou parâmetros de seleção para as outras entidades. Preserve filtros no retorno e trate item removido e acesso negado. Garanta acesso direto e comportamento de teclado da busca. Não refaça as telas inteiras. Valide e atualize o acompanhamento.
```

## 09 — Simplificar formulários de prazos e audiências

**Passo a passo:**

1. Preencher processo e cliente automaticamente quando a criação partir de um processo.
2. Usar busca de processo por CNJ ou cliente, com seleção inequívoca.
3. Trocar texto livre de vencimento por controles de data/hora compatíveis com o contrato estruturado.
4. Selecionar o responsável a partir de membros disponíveis e autorizados, eliminando nome fixo como padrão.
5. Mostrar inicialmente apenas campos necessários; deixar observações e opções adicionais em seção secundária.
6. Exibir erros perto dos campos e manter o formulário preenchido em falha da API.
7. Preservar acesso à calculadora existente e mostrar o resultado para revisão, sem apresentar cálculo como garantia jurídica.

**Concluída quando:** criar a partir do processo não exigir escolhê-lo novamente; responsável não for fictício; erro não apagar o preenchimento; data salva corresponder à data exibida.

```text
Execute somente a etapa 09 de ROTEIRO_MELHORIAS_USABILIDADE.md. Simplifique os formulários de prazo e audiência com contexto do processo, seleção pesquisável, datas estruturadas e responsável real da equipe. Organize campos essenciais e adicionais, use validação junto aos campos e preserve preenchimento em falhas. Reutilize a calculadora sem alterar suas regras jurídicas nesta etapa. Valide criação pelo processo e pela agenda, inclusive erros. Atualize o acompanhamento.
```

## 10 — Organizar a triagem de intimações

**Objetivo:** tornar evidente o caminho entre receber uma publicação e atribuir a providência necessária.

**Passo a passo:**

1. Apresentar uma fila com estados compreensíveis e compatíveis com o backend: a revisar, revisada e prazo vinculado, por exemplo.
2. Permitir ler o teor e identificar processo e cliente sem sair da triagem.
3. Oferecer “Cadastrar prazo” com dados disponíveis preenchidos e revisão explícita antes de salvar.
4. Tratar publicação sem processo vinculado, sem atribuir um cliente genérico silenciosamente.
5. Exibir o prazo já gerado e prevenir duplicação por clique repetido ou reabertura.
6. Distinguir leitura de providência concluída; não presumir que toda publicação exige prazo.
7. Mostrar confirmação com link para o prazo e atualizar os contadores correspondentes.

**Concluída quando:** origem e prazo estiverem rastreáveis; o usuário perceber o próximo passo; salvar novamente não gerar duplicação acidental; erro não avançar o estado.

```text
Execute somente a etapa 10 de ROTEIRO_MELHORIAS_USABILIDADE.md. Organize a triagem de publicações como leitura, identificação do processo, revisão dos dados e cadastro de prazo quando necessário. Reutilize o conversor existente, diferencie leitura de providência concluída e mantenha vínculo entre publicação e prazo. Previna duplicações no frontend e no backend conforme o modelo atual. Trate publicações sem vínculo e falhas sem avançar o estado. Não altere regras jurídicas de contagem. Valide e atualize o acompanhamento.
```

## 11 — Integrar tarefas ao trabalho do caso

**Passo a passo:**

1. Distinguir tarefa de prazo processual pela finalidade e pelos rótulos.
2. Mostrar tarefas vinculadas dentro do processo e no Meu dia conforme responsável e data.
3. Permitir criar tarefa com contexto já preenchido.
4. Usar estados consistentes entre lista, quadro e detalhe.
5. Oferecer lista simples como visualização inicial; manter o quadro disponível sem usar “Kanban” como requisito de compreensão.
6. Evitar que concluir uma tarefa conclua automaticamente um prazo, salvo fluxo explicitamente modelado e revisado.

**Concluída quando:** as mesmas tarefas aparecerem de modo consistente nas três áreas; mudanças persistirem; prazo e tarefa não forem confundidos.

```text
Execute somente a etapa 11 de ROTEIRO_MELHORIAS_USABILIDADE.md. Integre tarefas ao processo e ao Meu dia por vínculos e responsáveis reais. Disponibilize lista simples e mantenha o quadro como alternativa, com estados consistentes. Preencha o processo automaticamente na criação contextual. Preserve a distinção entre tarefa e prazo, sem conclusão automática indevida. Valide persistência e concordância entre telas. Atualize o acompanhamento.
```

## 12 — Simplificar tabelas e filtros

**Problema observado:** a lista de processos reúne oito colunas e seis botões por linha; a agenda também apresenta tabelas extensas.

**Passo a passo:**

1. Priorizar nas listas as informações necessárias para identificar o item e decidir a próxima ação.
2. Levar detalhes secundários para a página do registro; manter uma ação principal e um menu “Mais ações”.
3. Rotular ações destrutivas claramente e preservar sua confirmação contextual.
4. Adicionar filtros rápidos úteis: meus itens, vencidos, hoje e período, quando fizerem sentido para a entidade.
5. Mostrar filtros ativos e botão para limpá-los; preservar filtros e ordenação na URL quando viável.
6. Revisar paginação existente e evitar renderização ilimitada em listas grandes.

**Concluída quando:** ações existentes continuarem disponíveis; filtros forem combináveis e removíveis; retornar do detalhe preservar contexto; listas extensas permanecerem utilizáveis.

```text
Execute somente a etapa 12 de ROTEIRO_MELHORIAS_USABILIDADE.md. Simplifique as listas de Processos e Agenda, priorizando identificação, situação e próxima ação. Reduza botões por linha usando “Mais ações”, preserve confirmações destrutivas e inclua filtros rápidos pertinentes com indicação dos filtros ativos. Preserve contexto no retorno e revise paginação sem carregar listas ilimitadas. Reutilize componentes existentes. Valide filtros e navegação e atualize o acompanhamento.
```

## 13 — Organizar documentos, modelos e assinaturas

**Passo a passo:**

1. Organizar a área Documentos em Arquivos, Modelos e Assinaturas, preservando recursos existentes.
2. Mostrar documentos reais por cliente/processo e abrir criação com contexto preenchido.
3. Diferenciar claramente gerar um arquivo, solicitar assinatura e obter assinatura concluída.
4. Exibir situação real, responsável e data quando existirem.
5. Confirmar que download entrega o arquivo certo; tratar arquivo ausente e falha.
6. Não usar marcas de provedores ou selos que sugiram integração inexistente.

**Concluída quando:** cada ação produzir o resultado descrito; arquivos e assinaturas exibidos forem reais; rotas antigas continuarem acessíveis.

```text
Execute somente a etapa 13 de ROTEIRO_MELHORIAS_USABILIDADE.md. Organize Documentos em Arquivos, Modelos e Assinaturas, reaproveitando os recursos atuais. Integre os vínculos com cliente e processo e distinga geração, solicitação e conclusão de assinatura. Remova sugestões de integrações inexistentes e valide downloads reais e falhas. Não envie solicitações externas nem contrate provedores. Preserve rotas antigas e atualize o acompanhamento.
```

## 14 — Colocar comunicação no contexto do cliente

**Passo a passo:**

1. Oferecer acesso à comunicação pelo cliente e pelo processo.
2. Preencher destinatário e contexto a partir do registro selecionado.
3. Exibir prévia da mensagem antes de qualquer ação externa.
4. Usar texto preciso para a capacidade atual: “Abrir no WhatsApp” quando apenas abrir a conversa, por exemplo.
5. Não registrar entrega ou envio sem confirmação real do mecanismo utilizado.
6. Apresentar o portal do cliente como acesso ou prévia claramente identificada, mantendo as permissões existentes.

**Concluída quando:** o usuário não precisar buscar novamente o cliente; destinatário ficar explícito; abrir conversa não constar como mensagem entregue.

```text
Execute somente a etapa 14 de ROTEIRO_MELHORIAS_USABILIDADE.md. Integre comunicação ao cliente e ao processo com destinatário e contexto preenchidos, prévia e nomes de ação coerentes com o mecanismo existente. Não marque abertura de conversa como envio ou entrega. Organize o acesso ao portal do cliente sem alterar indevidamente permissões. Não envie mensagens reais durante desenvolvimento ou testes. Valide com dados de teste e atualize o acompanhamento.
```

## 15 — Ajustar experiência por perfil

**Esta etapa exige primeiro inspecionar o modelo atual de papéis e permissões; não pressupõe que ele esteja incorreto.**

**Passo a passo:**

1. Mapear os papéis existentes e as ações permitidas no servidor.
2. Destacar a rotina operacional para advogados e a visão gerencial para quem possui acesso a ela.
3. Aplicar permissões à visibilidade das ações sem depender disso como proteção dos dados.
4. Definir “meus itens” por identificador de usuário ou associação confiável com membro da equipe.
5. Permitir visão da equipe apenas quando autorizada.
6. Tratar ausência de vínculo do usuário com a equipe de maneira explícita, sem mostrar tudo silenciosamente.

**Concluída quando:** interface e API respeitarem os mesmos acessos; URLs diretas não burlarem permissões; “meus itens” não depender de nome fixo.

```text
Execute somente a etapa 15 de ROTEIRO_MELHORIAS_USABILIDADE.md. Inspecione os papéis e permissões atuais antes de alterar a experiência por perfil. Priorize a rotina operacional para advogados e mantenha gestão financeira, equipe e relatórios acessíveis conforme autorização existente. Faça “meus itens” usar vínculo real de identidade. Não trate ocultação de menu como autorização. Valide acesso direto, contas com permissões diferentes e isolamento entre sociedades. Não amplie privilégios. Atualize o acompanhamento.
```

## 16 — Revisar acessibilidade, celular e consistência

**Passo a passo:**

1. Percorrer menu, busca, Meu dia, processo e formulários por teclado.
2. Corrigir foco visível, sequência de navegação e retorno de foco ao fechar modais.
3. Associar rótulos aos campos e dar nome acessível aos botões de ícone.
4. Não depender apenas de cor para urgência, erro ou situação.
5. Verificar contraste, legibilidade e alvos de toque nas telas alteradas.
6. Conferir larguras de celular, tablet e desktop, evitando ações inacessíveis e sobreposições.
7. Unificar textos de carregamento, vazio, erro e confirmação; impedir que erro pareça ausência de registros.

**Concluída quando:** os fluxos essenciais forem utilizáveis por teclado e em tela pequena; modais não prenderem foco incorretamente; rótulos e estados estiverem consistentes.

```text
Execute somente a etapa 16 de ROTEIRO_MELHORIAS_USABILIDADE.md. Revise acessibilidade e responsividade das telas alteradas, com foco em menu, busca, Meu dia, processo e formulários. Corrija foco, rótulos, nomes de botões, legibilidade, contraste e uso independente de cor. Verifique estados de carregamento, vazio e erro. Preserve o tema e evite refazer o design inteiro. Faça verificação no navegador quando disponível e informe explicitamente qualquer limitação. Atualize o acompanhamento.
```

## 17 — Validar com advogados e priorizar ajustes finais

**Esta etapa depende de observação com usuários reais. Uma simulação técnica não substitui essa validação.**

**Passo a passo:**

1. Preparar ambiente de teste com dados fictícios claramente identificados e sem ações externas reais.
2. Recrutar, idealmente, de três a cinco advogados com rotinas distintas.
3. Pedir que encontrem um processo pelo cliente, identifiquem a próxima providência e abram um documento.
4. Pedir que revisem uma intimação, cadastrem um prazo e atribuam responsável.
5. Pedir que registrem um cumprimento e expliquem o que acreditam que o sistema fez.
6. Observar sem ensinar o caminho: registrar conclusão, tempo, pedidos de ajuda, erros e termos mal compreendidos.
7. Classificar ajustes por impacto e recorrência; corrigir primeiro falsas interpretações sobre datas, salvamento e protocolo.
8. Repetir os cenários afetados depois dos ajustes e registrar a decisão final.

**Concluída quando:** houver evidência registrada de testes com advogados; falhas críticas de compreensão estiverem resolvidas; limitações restantes tiverem prioridade e responsável. Na ausência de participantes, manter a etapa pendente e entregar o roteiro pronto.

```text
Prepare a etapa 17 de ROTEIRO_MELHORIAS_USABILIDADE.md seguindo as regras comuns. Crie um roteiro de teste com advogados e uma ficha de observação para encontrar processo, consultar documento, tratar intimação, cadastrar prazo e registrar cumprimento. Use dados fictícios e não faça ações externas reais. Execute as verificações técnicas possíveis, mas não invente entrevistas nem resultados de usuários. Se ainda não houver observações reais, deixe a etapa pendente e entregue o material pronto. Se eu fornecer observações, analise-as e proponha correções priorizadas antes de ampliar o escopo.
```

## Registro de execução

Copie este bloco a cada etapa trabalhada:

```text
Etapa:
Data:
Status: pendente / em andamento / concluída / bloqueada
O que mudou:
Arquivos alterados:
Validações realizadas e resultados:
Pendências ou limitações:
Mudanças de dados e procedimento de recuperação, se aplicável:
Próxima etapa indicada:
```

## Primeiro ciclo recomendado

Comece pelas etapas 01 a 04 para corrigir confiabilidade. Depois faça 05 e 06 para tornar o trabalho diário mais claro. Em seguida, 07 a 12 consolidam a navegação por processo e os principais fluxos. As etapas finais organizam recursos auxiliares e validam a experiência completa.

Não é necessário concluir todas as etapas antes de colher feedback. Após Meu dia e a página do processo, já vale observar usuários, registrar dificuldades e ajustar a prioridade das etapas restantes.
