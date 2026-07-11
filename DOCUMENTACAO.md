# DOCUMENTAÇÃO DO SISTEMA — Controle de Devoluções v6.2

> Referência funcional completa. Para changelog de desenvolvimento, ver `FuncSystem.md`.

---

## Sumário

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Arquitetura Técnica](#2-arquitetura-técnica)
3. [Schema de Dados — Planilha Google Sheets](#3-schema-de-dados--planilha-google-sheets)
4. [Sistema de Permissões e Controle de Acesso (RBAC)](#4-sistema-de-permissões-e-controle-de-acesso-rbac)
5. [Design System v11 — Styles.html](#5-design-system-v11--styleshtml)
6. [Referência localStorage](#6-referência-localstorage)
7. [Index.html — Shell SPA e Hub Principal](#7-indexhtml--shell-spa-e-hub-principal)
8. [FormNotas.html — Listagem Central](#8-formnotashtml--listagem-central)
9. [FormLancamento.html — Lançamento de NF](#9-formlancamentohtml--lançamento-de-nf)
10. [FormEmailDevolucao.html — Envio de E-mail](#10-formemaildevoluçãohtml--envio-de-e-mail)
11. [FormTransferencias.html — Gestão de Transferências](#11-formtransfershtml--gestão-de-transferências)
12. [FormProgramarFrete.html — Programação de Frete](#12-formprogramarfretehtml--programação-de-frete)
13. [FormReabertura.html — Reabertura de NFs](#13-formreabertorahtml--reabertura-de-nfs)
14. [FormVenda.html — Baixa em Venda](#14-formvendahtml--baixa-em-venda)
15. [FormExportarPDF.html — Exportação de PDF](#15-formexportarpdfhtml--exportação-de-pdf)
16. [FormDashboard.html — Dashboard Analytics](#16-formdashboardhtml--dashboard-analytics)
17. [FormRelatorios.html — Relatórios](#17-formrelatorioshtml--relatórios)
18. [FormBusca.html — Busca Global](#18-formbuscahtml--busca-global)
19. [FormAuditoria.html — Auditoria e Logs](#19-formauditoriahtml--auditoria-e-logs)
20. [FormBackup.html — Backup e Restauração](#20-formbackuphtml--backup-e-restauração)
21. [FormConfiguracoes.html — Configurações](#21-formconfigureacoeshtml--configurações)
22. [Código.gs — Backend API Reference](#22-códigoGs--backend-api-reference)
23. [Fluxos Cross-Module](#23-fluxos-cross-module)
24. [Otimizações de Performance (P01–P44)](#24-otimizações-de-performance-p01p44)

---

## 1. Visão Geral do Sistema

Sistema de **controle de devoluções de produtos** a fornecedores (Britania, Unilever, Fornecedores Variados), implementado em **Google Apps Script (GAS)** com Google Sheets como banco de dados.

**Propósito principal:** Registrar notas fiscais devolvidas, rastrear status (Pendente → Em Transferência → Devolvido/Vendido), gerenciar fretes, enviar e-mails de devolução, gerar documentos de carga (PDF), auditar operações e produzir relatórios gerenciais.

**Versão:** v6.2 (com melhorias Web App v7.0 em andamento)

**Fornecedores ativos:**
- **Britania** — aba própria na planilha
- **Unilever** — aba própria na planilha
- **Fornecedores Variados** — aba própria, lista dinâmica de fornecedores

---

## 2. Arquitetura Técnica

### Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Google Apps Script (`.gs`) — executa no servidor Google |
| Banco de dados | Google Sheets (múltiplas abas nomeadas) |
| Armazenamento de arquivos | Google Drive (`AnexosNFs/{aba}/NF_{nf}/`) |
| Frontend | HTML + CSS + JS vanilla servido via `HtmlService` |
| Comunicação cliente-servidor | `google.script.run` (async, sem AJAX direto) |
| Estado cross-form | `localStorage` do navegador |
| Cache backend | `CacheService` (Google Apps Script) |
| Propriedades persistentes | `PropertiesService` (Google Apps Script) |
| Controle de concorrência | `LockService` (Google Apps Script) |

### Padrão de Entrega de Páginas

O sistema é uma **SPA (Single Page Application)** baseada em `Index.html`:
- `Index.html` funciona como shell: sidebar + topbar + área de conteúdo (`#page-frame`)
- Cada tela (FormNotas, FormLancamento, etc.) é carregada via **iframe** dentro do frame
- Navegação usa `_getPageContent(pageName)` que retorna HTML com `include()` do GAS
- **Page cache** em memória: `_pageCache[pageName]` evita recarregar HTML já visitado
- Comunicação entre shell e páginas via `postMessage` (ex: `cdvAutoSearch`, badge counter)

### Pasta Drive

Estrutura de armazenamento de arquivos:
```
AnexosNFs/
  {aba}/           → ex: Britania, Unilever, Variados
    NF_{nf}/
      NF_{nf}_{nomearquivo}     → anexo principal da NF
      FOTO_1_NF_{nf}_{nome}     → foto de avaria 1
      FOTO_2_NF_{nf}_{nome}     → foto de avaria 2
      ...
```
Criação automática pela função `_garantirPastaNF(aba, nf)`.

---

## 3. Schema de Dados — Planilha Google Sheets

### Abas da Planilha

| Aba | Conteúdo |
|-----|---------|
| `Britania` | NFs de devolução — Britania |
| `Unilever` | NFs de devolução — Unilever |
| `Fornecedores Variados` | NFs de devolução — fornecedores diversos |
| `_Log` | Registro de auditoria de todas as operações |
| `_Config` | Configurações do sistema (e-mail, cores, etc.) |
| `Dashboard` | Dados agregados para o dashboard |
| `ABA_TRANSFERENCIAS` | Transferências em andamento |
| *(abas extras)* | Criadas via Configurações → Novo Fornecedor; registradas em ScriptProperty `cdv_abas_extras`; excluíveis pela mesma tela |

### Colunas das Abas de NF (cols 1–20)

| Col | Nome | Descrição |
|-----|------|-----------|
| 1 | NFD | Número do documento de devolução |
| 2 | NF | Número da nota fiscal original |
| 3 | Data | Data de lançamento |
| 4 | Fornecedor | Nome do fornecedor |
| 5 | Tipo | Tipo de item |
| 6 | Motivo | Motivo da devolução |
| 7 | Descrição | Descrição detalhada |
| 8 | Qtd | Quantidade (caixas) |
| 9 | Valor Unitário | Valor por unidade |
| 10 | Valor Total | Valor total (Qtd × VlUnit) |
| 11 | Status | `Pendente` / `Em Transferência` / `Devolvido` / `Cancelado` / `Vendido` |
| 12 | chkPend | Checkbox: pendente |
| 13 | chkDev | Checkbox: devolvido |
| 14 | chkVenda | Checkbox: venda |
| 15 | Obs | Observações livres |
| 16 | Resp | Responsável |
| 17 | Anexo | URL do arquivo no Drive |
| 18 | DiasArmaz | Dias em armazém |
| 19 | FreteTipo | Tipo de frete (`Tabela` / `Valor+ICMS` / `Valor` / `Cortesia`) |
| 20 | FreteValor | Valor do frete |

### Colunas de Transferências (cols 21–30 em `ABA_TRANSFERENCIAS`)

| Col | Nome | Descrição |
|-----|------|-----------|
| 21 | NFD | Referência ao NFD |
| 22 | NF | Referência à NF |
| 23 | Tipo | Tipo de transferência |
| 24 | Caixas | Quantidade |
| 25 | Valor | Valor |
| 26 | Nº Pedido | Número do pedido de transferência |
| 27 | Agendamento | Data/hora agendada |
| 28–30 | (extras) | Dados complementares |

---

## 4. Sistema de Permissões e Controle de Acesso (RBAC)

### Hierarquia de Cargos

```
Admin
  └─ Usuário com Cargo atribuído
       └─ Visualizador (fallback read-only)
```

**Regras:**
- Usuário **sem cargo** = bloqueado (nenhum módulo acessível)
- Usuário com cargo = acessa apenas módulos liberados pelo cargo
- Admin = acesso total irrestrito
- Cargo "Visualizador" = acesso somente-leitura a módulos básicos

### Módulos do Sistema

Cada cargo define uma lista de módulos liberados:

| Módulo | Recurso liberado |
|--------|-----------------|
| `notas` | FormNotas — visualizar e operar NFs |
| `lancamento` | FormLancamento — lançar novas NFs |
| `email` | FormEmailDevolucao — enviar e-mails |
| `transferencias` | FormTransferencias — baixa e gestão |
| `relatorios` | FormRelatorios — gerar relatórios |
| `auditoria` | FormAuditoria — logs e auditoria |
| `backup` | FormBackup — backup e restauração |
| `configuracoes` | FormConfiguracoes — configurar sistema |
| `dashboard` | FormDashboard — ver analytics |

### Funções Backend de Acesso

- `obterPermissoesUsuario()` — retorna `{ cargo, modulos[], isAdmin }` para o usuário atual (e-mail Google)
- `salvarCargo(nome, modulos[])` — cria/edita cargo e seus módulos
- `salvarUsuarioCargo(email, cargo)` — atribui cargo a usuário
- `diagnosticarPermissoes()` — retorna diagnóstico completo do estado de permissões (para painel de debug em FormNotas)

### Painel de Debug (FormNotas)

Função `diagnosticarPermissoes()` + painel de debug mostra:
- Cargo atual do usuário
- Módulos acessíveis
- E-mail do usuário logado
- Estado do sistema de permissões

---

## 5. Design System v11 — Styles.html

Arquivo `Styles.html` (393 linhas) é o hub central do Design System. Incluído em todas as telas via `<?= include('Styles') ?>`.

### Tokens CSS (variáveis)

```css
--navy       → azul escuro (primário)
--teal       → verde-azulado (ação secundária)
--red        → vermelho (erro / alerta)
--green      → verde (sucesso)
--amber      → âmbar (aviso)
--bg         → cor de fundo (muda no dark mode)
--surface    → superfície de cards/modais
```

### Variantes de Botão (6 tipos)

| Classe | Uso |
|--------|-----|
| `.btn-primary` | Ação principal |
| `.btn-secondary` | Ação secundária |
| `.btn-danger` | Ação destrutiva |
| `.btn-ghost` | Botão transparente |
| `.btn-outline` | Contorno sem fundo |
| `.btn-icon` | Botão apenas ícone |

Todos os botões recebem **efeito ripple** via `initRipple()`.

### Sistema de Toast

```js
showToast(mensagem, tipo, duracao)
// tipo: 'ok' | 'err' | 'warn' | 'info'
// duracao: ms (padrão: 3000)
```

Toast aparece na parte inferior da tela e desaparece automaticamente.

### Utilitários JavaScript

| Função | Descrição |
|--------|-----------|
| `countUp(el, target, dur)` | Animação de contagem numérica em KPIs |
| `initRipple()` | Ativa efeito ripple em todos os botões com `[data-ripple]` |
| `closeModalAnimated(id, dur)` | Fecha modal com animação (usa `--dur-base` dinâmico) |

### Dark Mode

Ativado via classe `body.dark`. Estado persistido em `localStorage('cdv_dark_mode')`.
Toggle disponível em todas as telas pelo ícone na topbar.

### Keyframes (15+)

Inclui: `fadeIn`, `slideUp`, `slideDown`, `scaleIn`, `ripple`, `pulse`, `spin`, entre outros.

---

## 6. Referência localStorage

Chaves utilizadas pelo sistema para persistência de estado cross-form:

| Chave | Tipo | Descrição | Origem → Destino |
|-------|------|-----------|-----------------|
| `cdv_dark_mode` | `'1'` / vazio | Dark mode ativo | Qualquer form → todos os forms |
| `cdv_filtros_vis` | `'1'` / `'0'` | Filtros visíveis no FormNotas | FormNotas → FormNotas |
| `cdv_retorno_aba` | string (nome da aba) | Aba de origem para retorno após transferência | FormTransferencias → FormNotas |
| `cdv_email_nfds` | JSON (array de NFDs) | NFDs pré-selecionados para e-mail | FormNotas bulk → FormEmailDevolucao |
| `cdv_pdf_prefill` | JSON | Dados pré-preenchidos para exportação PDF | FormNotas → FormExportarPDF |
| `cdv_kpi_visibilidade` | JSON | Estado de visibilidade dos 6 KPIs | FormNotas → FormNotas |
| `transben_prio` | string | Ordenação prioritária da lista de transferências | FormTransferencias → FormTransferencias |
| `transben_cols` | JSON | Colunas visíveis na tabela de transferências | FormTransferencias → FormTransferencias |
| `cdv_filtros_salvos` | JSON | Filtros salvos pelo usuário no FormNotas | FormNotas → FormNotas |
| `cdv_density` | `'compact'`/`'normal'`/`'comfortable'` | Densidade da tabela no FormNotas | FormNotas → FormNotas |

---

## 7. Index.html — Shell SPA e Hub Principal

**Arquivo:** `Index.html` (1676 linhas)
**Papel:** Shell da aplicação Web App. Carrega e gerencia todas as telas.

### Layout

```
┌─────────────────────────────────────────┐
│  Topbar (título, dark mode, usuário)     │
├──────────┬──────────────────────────────┤
│          │                              │
│ Sidebar  │     Área de Conteúdo         │
│ (nav)    │     (#page-frame → iframe)   │
│          │                              │
└──────────┴──────────────────────────────┘
```

### Navegação (NAV)

Estrutura `NAV` define todos os itens de menu com:
- Nome da página
- Ícone
- Rótulo exibido
- Módulo requerido (para controle de acesso)

### Roteamento SPA

- `_getPageContent(pageName)` — solicita HTML ao servidor via `google.script.run`
- `_pageCache[pageName]` — cache em memória: primeira visita carrega, demais são instantâneas
- `navigate(page)` — troca o iframe e atualiza o item ativo na sidebar

### Hub Principal (tela inicial)

Exibido na tela `home` antes de navegar para qualquer form:
- **6 KPIs rápidos** com contadores animados
- **Conquest of the Month** — conquista/meta do mês
- **Quick Notes** — bloco de notas rápidas
- **Badge counter** — indicador de transferências pendentes na sidebar

### Command Palette (Ctrl+K)

- Busca global entre todas as telas/ações disponíveis
- Ativa com `Ctrl+K` ou clique no ícone de busca na topbar
- Filtra em tempo real enquanto o usuário digita

### Hotkeys Globais

| Atalho | Ação |
|--------|------|
| `Alt+1` | Navegar para FormNotas |
| `Alt+2` | Navegar para FormLancamento |
| `Alt+3` | Navegar para FormEmailDevolucao |
| `Alt+4` | Navegar para FormTransferencias |
| `Alt+5` | Navegar para FormDashboard |
| `Alt+6` | Navegar para FormRelatorios |
| `Ctrl+K` | Abrir command palette |

---

## 8. FormNotas.html — Listagem Central

**Arquivo:** `FormNotas.html` (3053 linhas)
**Papel:** Tela principal do sistema. Lista todas as NFs com filtros, bulk actions, KPIs e modal de detalhe.

### KPIs (6 cards colapsáveis)

| KPI | Descrição |
|-----|-----------|
| Pendente | Total de NFs em status Pendente |
| Em Transferência | Total em trânsito |
| Devolvido | Total devolvido ao fornecedor |
| Venda | Total baixado em venda |
| Total | Soma geral de NFs |
| Cxs | Total de caixas (somado via `it.qtd` em `atualizarKPIs()`) |

- Visibilidade individual persistida em `localStorage('cdv_kpi_visibilidade')`
- Toggle via header do card
- Animação `countUp()` ao carregar valores

### Filtros (6 opções)

| Filtro | Elemento | Persistência |
|--------|---------|-------------|
| Status | `#fil-status` | Sim |
| Aba (fornecedor) | `#fil-aba` | Via `cdv_retorno_aba` |
| Data início | `#fil-data-ini` | Sim |
| Data fim | `#fil-data-fim` | Sim |
| Sem frete | `#fil-sem-frete` | Sim |
| Busca fonética | `#fil-busca` | Não |

- Barra de filtros colapsável: toggle via `#filter-toggle-strip`
- Estado visível/colapsado: `localStorage('cdv_filtros_vis')`
- Resumo no strip mostra contagem de filtros ativos
- Filtros salvos pelo usuário: `localStorage('cdv_filtros_salvos')`

### Tabela de NFs

- **Column picker:** usuário seleciona quais colunas exibir
- **Density selector:** compacta / normal / confortável — persiste em `cdv_density`
- **Context menu** (clique direito): ações rápidas na linha
- **Seleção múltipla:** checkbox por linha + "selecionar todos"
- **Undo bar (15s):** aparece após ação destrutiva com opção de desfazer

### Bulk Bar (barra de ações em lote)

Aparece quando ≥1 NF está selecionada. Ações disponíveis:

| Ação | Função | Restrição |
|------|---------|-----------|
| Devolução | Marca NFs como Devolvido | — |
| Venda | Abre wizard FormVenda | — |
| Programar Frete | Abre FormProgramarFrete | — |
| E-mail Dev. | `abrirEmailBulk()` | Mesmo fornecedor |
| Doc. Carga | `gerarDocCarga()` | Mesmo fornecedor |

**`abrirEmailBulk()`:** Valida mesmo fornecedor → salva NFDs em `localStorage('cdv_email_nfds')` → chama `google.script.run.abrirEmailDevolucao()`

**`gerarDocCarga()`:** Gera PDF popup com cards de resumo, tabela de NFDs e seção de assinaturas. **Bloqueia se fornecedores forem distintos.**

### Modal de Detalhe

Abre ao clicar em uma linha da tabela. Campos editáveis + ações especiais:

| Seção | Conteúdo |
|-------|---------|
| Dados gerais | NFD, NF, Data, Fornecedor, Tipo, Motivo, Desc, Qtd, Valor, Status |
| Observações | Campo livre editável |
| Comentários | Thread de comentários internos |
| Respostas fornecedor | Registro de comunicações com o fornecedor |
| Fotos de avaria | Upload + galeria de fotos `FOTO_*` |
| Etiqueta | Geração de etiqueta de identificação |
| QR Code | QR code da NF para rastreamento |

**Botão "Ver Galeria":** `obterGaleriaFotos(aba, linha)` → modal `#modal-galeria` com todas as fotos da pasta Drive da NF.

**Confirmação Fornecedor** (`#btn-forn-receb`): Aparece apenas quando `status = Devolvido`. Chama `confirmarRecebimentoFornecedor()`.

### Atalhos de Teclado (20+)

| Atalho | Ação |
|--------|------|
| `F5` ou `R` | Recarregar lista |
| `Esc` | Fechar modal / limpar seleção |
| `Space` | Selecionar/deselecionar linha focada |
| `A` | Selecionar todas |
| `D` | Abrir bulk action devolução |
| `E` | Abrir bulk e-mail |
| `F` | Focar campo de busca |
| `Ctrl+D` | Toggle dark mode |
| `/` | Focar filtro de busca fonética |
| `←` `→` | Navegar entre abas de fornecedor |

### Retorno de Transferências

Ao carregar, lê `localStorage('cdv_retorno_aba')` e aplica automaticamente como filtro de aba, para retornar à aba correta após baixa em FormTransferencias.

---

## 9. FormLancamento.html — Lançamento de NF

**Arquivo:** `FormLancamento.html` (975 linhas)
**Papel:** Lançar novas notas fiscais de devolução (individual ou em lote).

### Aba Individual

**Fluxo:**
1. Selecionar aba (Britania / Unilever / Variados)
2. Importar XML de NF-e (parse automático dos campos)
3. Preencher campos manualmente se necessário
4. Adicionar fotos de avaria (opcional)
5. Salvar (com confirmação de duplicata se NF já existir)

**Campos:**
- NFD, NF, Data, Fornecedor, Tipo, Motivo, Descrição, Qtd, Valor
- **Fornecedor**: uppercase forçado via `toUpperCase()` ao sair do campo
- **Importação XML**: parse automático preenche NF, Data, Fornecedor, Valor

**Fotos de avaria (`_u_fotos[]`):**
- Drop zone multi-foto (JPG/PNG, máx 5MB por foto)
- Grid de preview `#u-foto-lista`
- Array `_u_fotos[]` enviado como `dados.fotos[]` ao backend
- Backend salva com prefixo `FOTO_N_` na pasta Drive da NF

**Rascunho automático:**
- Auto-save a cada 3 segundos em `localStorage`
- Restaurado automaticamente ao reabrir o form

**Funções backend:**
- `submeterParaAprovacao(dados)` — submete para revisão (se workflow de aprovação ativo)
- `salvarLancamentoFormConfirmado(dados)` — salva diretamente sem aprovação
- `salvarLoteLancamentos(dados[])` — salva múltiplos itens em batch

### Aba Lote

**Fluxo:**
1. Adicionar múltiplos itens (botão "+ Adicionar")
2. Cada item tem campos individuais + upload de arquivo `_loteArquivos{idx}`
3. Salvar todos de uma vez

**Autocomplete Fornecedores Variados:**
- Ao selecionar aba "Variados": `onAbaChange()` → `_carregarFornVariadosDatalist()`
- Chama `google.script.run.listarFornecedoresVariados()`
- Cache em `_fornVariadosList` (não refaz chamada se já carregado)
- Resultado populado em `<datalist>` HTML5 para autocomplete nativo

---

## 10. FormEmailDevolucao.html — Envio de E-mail

**Arquivo:** `FormEmailDevolucao.html` (758 linhas)
**Papel:** Compor e enviar/agendar e-mail de devolução com comunicados anexados.

### Layout

Grid 2 colunas:
- **Esquerda:** NFDs selecionadas + informações da NF
- **Direita:** Destinatários e configurações

Botões de ação **sticky** (fixos no topo ao rolar).

### Pré-preenchimento

Ao carregar, lê `localStorage('cdv_email_nfds')` → preenche textarea de NFDs → limpa a chave (consumo único).

### Comunicados (`_comunicados[]`)

- Drop zone sempre visível para arrastar comunicados (PDF, imagens)
- Lista de comunicados adicionados com botão "×" individual por item
- `removerComunicadoIdx(idx)` — remove comunicado específico da lista
- Parâmetro `params.comunicados[]` enviado ao backend
- Backward compatibility: `params.comBase64` (legado) ainda funciona

### Destinatários

- Campos: Para, CC, BCC (seção `<details>` colapsável)
- **Aviso de e-mail duplicado** — alerta visual se mesmo endereço em múltiplos campos
- Campo assunto e assinatura também em `<details>` colapsável

### Ações Disponíveis

| Ação | Função Backend |
|------|---------------|
| Enviar agora | `enviarEmailDevolucao(params)` |
| Agendar envio | `agendarEmailDevolucao(params, dataHora)` |
| Preview | `previewEmailDevolucao(params)` → abre modal com HTML do e-mail |

### Busca de Dados

`buscarDadosNFDs(nfds[])` — busca informações detalhadas das NFDs para popular a tela.

---

## 11. FormTransferencias.html — Gestão de Transferências

**Arquivo:** `FormTransferencias.html` (765 linhas)
**Papel:** Listar, dar baixa, cancelar e reagendar transferências em andamento.

### Lista de Transferências

- Carregada de `ABA_TRANSFERENCIAS` via `google.script.run`
- Ordenação configurável: `localStorage('transben_prio')`
- Colunas visíveis configuráveis: `localStorage('transben_cols')`

### Ações por Linha

| Ação | Função Backend | Comportamento pós-ação |
|------|---------------|------------------------|
| Dar Baixa | `darBaixaTransferencia(id)` | Remove de `_itens[]`, atualiza lista, salva aba em localStorage, navega para FormNotas |
| Cancelar | `cancelarTransferencia(id)` | Idem |
| Reagendar | `reagendarTransferencia(id, novaData)` | Atualiza data na lista sem remover |

### Cancelamento em Lote

Bulk bar com ação "Cancelar Selecionados" → `executarAcaoEmLoteNotas()`.

### Doc. Carga (Transferências)

`gerarDocCargaTransf()` — Gera PDF de documento de carga adaptado para transferências:
- Colunas: NFD, NF, Tipo, Cxs, Valor, Nº Pedido, Agendamento
- Botão roxo na bulk bar

### Navegação Pós-Ação

Após baixa ou cancelamento:
1. Remove item do array `_itens[]`
2. Chama `filtrar()` para atualizar view
3. Salva aba de origem em `localStorage('cdv_retorno_aba')`
4. Navega de volta para FormNotas

### Sistema de Toast

```js
toast(mensagem, tipo)
// tipo: 'ok' | 'err' | 'warn' | 'info'
// CSS classes: .tst-ok | .tst-err | .tst-warn | .tst-info
```

---

## 12. FormProgramarFrete.html — Programação de Frete

**Arquivo:** `FormProgramarFrete.html` (506 linhas)
**Papel:** Wizard 3 passos para programar frete de devolução em NFs.

### Fluxo Wizard

```
Passo 1: Buscar NF
    ↓ (digita número da NF → busca)
Passo 2: Configurar Frete
    - Tipo: Tabela / Valor+ICMS / Valor / Cortesia
    - Nº Pedido (obrigatório)
    - Data/hora de agendamento
    ↓ (confirmar)
Passo 3: Resultado
    - Confirmação de sucesso ou mensagem de erro
```

### Funções Backend

- `buscarNFParaProgramar(nf, aba)` — busca NF na planilha e retorna dados
- `salvarProgramacaoDevolucao(dados)` — salva configuração de frete na NF

### Tipos de Frete

| Tipo | Descrição |
|------|-----------|
| `Tabela` | Frete conforme tabela acordada com fornecedor |
| `Valor+ICMS` | Valor fixo mais ICMS |
| `Valor` | Valor fixo simples |
| `Cortesia` | Frete sem custo |

---

## 13. FormReabertura.html — Reabertura de NFs

**Arquivo:** `FormReabertura.html` (466 linhas)
**Papel:** Wizard 3 passos para reabrir NFs concluídas (Devolvido/Vendido → Pendente).

### Fluxo Wizard

```
Passo 1: Informar NFs
    - Campo de chips: digita NFDs separados por vírgula/enter
    - Parse live (chips aparecem conforme digita)
    ↓
Passo 2: Preview
    - Tabela mostra NFs encontradas com status atual
    - Confirmar seleção
    ↓
Passo 3: Confirmar Reabertura
    - Executa reabertura
    - Exibe resultado com sucesso/falhas por item
```

### Funções Backend

- `buscarNFsConcluidas(nfds[])` — busca NFs concluídas e retorna dados para preview
- `executarReaberturaPorItens(itens[])` — executa reabertura em batch

---

## 14. FormVenda.html — Baixa em Venda

**Arquivo:** `FormVenda.html` (561 linhas)
**Papel:** Wizard 3 passos para registrar saída por venda de NFs.

### Fluxo Wizard

```
Passo 1: Inserir NFs
    - Chips input (digita NFDs, parse live)
    ↓
Passo 2: Preview
    - Tabela com NFs encontradas, valores, confirmação
    ↓
Passo 3: Resultado
    - Confirmação de baixa
    - Auto-print: gera HTML de Doc. Carga e abre janela de impressão
```

### Funções Backend

- `buscarPreviewNFs(nfds[])` — busca NFs para preview antes da ação
- `executarBaixaVenda(nfds[])` — executa baixa em lote, muda status para `Vendido`

### Auto-print

Após baixa bem-sucedida, gera automaticamente HTML de Doc. Carga e chama `window.print()` para imprimir documento.

---

## 15. FormExportarPDF.html — Exportação de PDF

**Arquivo:** `FormExportarPDF.html` (494 linhas)
**Papel:** Wizard 3 passos para exportar NFs selecionadas em PDF.

### Fluxo Wizard

Idêntico ao FormVenda:
```
Passo 1: Inserir NFs (chips)  →  Passo 2: Preview  →  Passo 3: Resultado + PDF
```

### Pré-preenchimento

Lê `localStorage('cdv_pdf_prefill')` ao carregar — preenche chips automaticamente quando vindo do FormNotas.

### Funções Backend

- `executarExportarPDF(nfds[], opcoes)` — gera PDF das NFs no Drive e retorna URL de download

---

## 16. FormDashboard.html — Dashboard Analytics

**Arquivo:** `FormDashboard.html` (600 linhas)
**Papel:** Visualização analítica de devoluções por fornecedor com gráficos e KPIs.

### Layout

- **Pill tabs** por fornecedor (Britania / Unilever / Variados)
- Troca de fornecedor recarrega todos os dados e gráficos

### KPIs (5)

| KPI | Valor |
|-----|-------|
| Total Pendente | Qtd + Valor |
| Total Devolvido | Qtd + Valor |
| Total em Transferência | Qtd |
| Média de Dias em Armazém | Dias |
| Total Geral | Qtd + Valor |

### Gráficos

| Gráfico | Tipo | Descrição |
|---------|------|-----------|
| Distribuição de Status | SVG Donut | % por status |
| Devoluções por Período | Stacked Bar | Evolução mensal |
| Tendência | SVG Line | 3, 6 ou 12 meses (selecionável) |

### Funções Backend

- `obterDadosDashboard(aba)` — retorna KPIs + dados para gráficos de barras e donut
- `obterTendencia(aba, meses)` — retorna série temporal para gráfico de linha (3/6/12m)

### Tabela Recente

Lista as NFs mais recentes do fornecedor selecionado com status colorido.

---

## 17. FormRelatorios.html — Relatórios

**Arquivo:** `FormRelatorios.html` (630 linhas)
**Papel:** Geração de 5 tipos de relatórios com máquina de estados para navegação.

### Tipos de Relatório

| Tipo | Período/Filtro | Função Backend |
|------|---------------|---------------|
| Mensal | Mês e ano | `gerarRelatorioMensal(mes, ano)` |
| Semanal | Semana | `gerarRelatorioSemanal(semana)` |
| Diário | Data específica | `gerarRelatorioDiario(data)` |
| Por Fornecedor | Fornecedor + período | `gerarRelatorioFornecedor(forn, inicio, fim)` |
| Pendentes | — | `gerarRelatorioPendentes()` |

### Navegação por Máquina de Estados

```
SELECAO → CONFIGURAR → PROCESSANDO → RESULTADO
   ↑                                      |
   └──────────────── voltar ──────────────┘
```

### Dropdown Dinâmico

Para relatório por Fornecedor: dropdown preenchido via `listarFornecedoresVariados()` (lista atualizada dinamicamente da planilha).

---

## 18. FormBusca.html — Busca Global

**Arquivo:** `FormBusca.html` (275 linhas)
**Papel:** Busca cross-abas por NF, fornecedor ou descrição em dados ativos e históricos.

### Campos de Busca

- Número NF
- Fornecedor
- Descrição

### Resultados

- Resultados de dados ativos: clique navega via `navegarParaLinha(aba, linha)` no FormNotas
- Resultados de dados históricos: exibição somente

### Auto-search via postMessage

Aceita mensagem `cdvAutoSearch` com termo de busca — ativado pelo command palette do Index.html.

---

## 19. FormAuditoria.html — Auditoria e Logs

**Arquivo:** `FormAuditoria.html` (1174 linhas)
**Papel:** 10 sub-telas de auditoria, logs e análise.

### Restrição de Acesso

Verifica `modulos.indexOf('auditoria')` — bloqueia acesso se módulo não estiver no cargo do usuário.

### 10 Sub-telas

| Sub-tela | ID | Conteúdo |
|----------|-----|---------|
| Histórico | `historico` | Histórico completo de NFs |
| E-mails | `emails` | Log de e-mails enviados |
| Log | `log` | Registro de operações (aba `_Log`) |
| Acesso | `acesso` | Log de acessos ao sistema |
| Scorecard | `scorecard` | Métricas de performance por usuário |
| SLA | `sla` | Análise de SLA de devolução |
| Comparativo | `comparativo` | Comparação entre períodos |
| Lixeira | `lixeira` | NFs excluídas (recuperáveis) |
| Log Export | `logexport` | Histórico de exports gerados |
| Seleção | `sel` | Tela inicial de seleção de sub-tela |

### Polyfill google.script.run

Inclui polyfill que simula `google.script.run` via `postMessage` — permite testes fora do GAS e comunicação com o shell Index.html.

---

## 20. FormBackup.html — Backup e Restauração

**Arquivo:** `FormBackup.html` (262 linhas)
**Papel:** Tela simples para criar backup da planilha e restaurar a partir de backup.

### Restrição de Acesso

Verifica `modulos.indexOf('backup')` — bloqueia acesso se módulo não estiver liberado.

### Status Card

Exibe estado atual:
- **Com backup**: data/hora do último backup + arquivo no Drive
- **Sem backup**: aviso para criar o primeiro backup

### Ações

| Ação | Função Backend |
|------|---------------|
| Fazer Backup | `executarBackup()` — cria cópia da planilha no Drive com timestamp |
| Restaurar | `executarRestauracao(fileId)` — restaura a partir de backup selecionado |

### Função Informação

`infoBackupExistente()` — retorna metadados do backup mais recente (data, nome, fileId).

---

## 21. FormConfiguracoes.html — Configurações

**Arquivo:** `FormConfiguracoes.html` (2525 linhas)
**Papel:** Central de configurações do sistema, organizada em 14 telas (3 hubs com abas + 11 telas individuais).

### Hubs com Abas (consolidados)

| Hub | ID | Abas |
|-----|-----|------|
| E-mails e Comunicação | `screen-email-hub` | dest, ccbcc, assn, tpl, webhook |
| Cores e Personalização Visual | `screen-visual` | cores, vis |
| Diagnóstico e Manutenção | `screen-sistema` | diag, mnt, inst |
| Controle de Acesso | `screen-acesso-hub` | acesso, cargos, usuarios |

### Navegação entre Abas

```js
mudarTab(hub, tabId, btn?)
// hub: ID do hub pai
// tabId: ID da aba a ativar
// btn: elemento botão clicado (opcional)
```
`mudarTab` carrega dados automaticamente via mapa `loaders` — cada aba tem sua função de carga registrada.

### Telas do Hub E-mail (`screen-email-hub`)

| Aba | Conteúdo |
|-----|---------|
| `dest` | Destinatários padrão por fornecedor |
| `ccbcc` | E-mails CC/BCC globais |
| `assn` | Assinaturas de e-mail por fornecedor |
| `tpl` | Templates de e-mail (assunto + corpo) |
| `webhook` | Configuração de webhook de notificação |

### Telas do Hub Visual (`screen-visual`)

| Aba | IDs dos campos | Descrição |
|-----|---------------|-----------|
| `cores` | `cor-pendente`, `cor-devolvido`, `cor-venda`, `cor-alerta`, `cor-header` | Cores globais do sistema |
| `vis` | `vis-cor-pendente`, `vis-cor-devolvido`, `vis-cor-venda`, `vis-cor-emfrete` | Cores de status na tabela |

### Telas do Hub Sistema (`screen-sistema`)

| Aba | Conteúdo |
|-----|---------|
| `diag` | Diagnóstico do sistema (planilha, Drive, permissões) |
| `mnt` | Manutenção: limpeza de cache, reindexação |
| `inst` | Instruções de uso / changelog |

### Telas do Hub Acesso (`screen-acesso-hub`)

| Aba | Conteúdo | Função Backend |
|-----|---------|---------------|
| `acesso` | Visão geral de usuários e cargos | `obterPermissoesUsuario()` |
| `cargos` | Criar/editar cargos e seus módulos | `salvarCargo()` |
| `usuarios` | Atribuir cargos a usuários | `salvarUsuarioCargo()` |

### Tela Novo Fornecedor (`screen-fornecedor`)

Gestão de abas operacionais extras e do alerta de +30 dias por aba.

- `#ab-lista` é preenchida via `obterConfigAbas()`: lista todas as abas operacionais (fixas + extras) com nº de lançamentos.
- Abas fixas (`ABAS_OPERACIONAIS`) mostram um badge `PADRÃO` e não têm botão de exclusão.
- Abas extras mostram um botão `✕` para excluir.
- Cada aba tem um switch (`.rd-switch`) que liga/desliga o alerta de +30 dias individualmente via `salvarAlerta30Aba({nome, ligado})`.
- Exclusão de aba extra (`excluirAba()` → `excluirAbaExtra({nome, confirmado})`) tem dupla confirmação: primeira chamada sempre com `confirmado:false`; se o backend encontrar dados (`{confirmar:true, usado:N}`), o frontend confirma de novo com o número real antes de reenviar com `confirmado:true`. A exclusão é bloqueada (sem opção de confirmar) se houver transferências "Em Transferência" com origem na aba.
- A lista é recarregada (`carregarConfigAbas()`) após criar (`criarNovoFornecedor`) ou excluir uma aba.

### Funções de Mensagem (DOIS PADRÕES — atenção!)

| Padrão | Assinatura | Uso |
|--------|-----------|-----|
| `showMsg` | `showMsg(prefixo, tipo, txt)` | Busca `#${prefixo}-msg`. Prefixos curtos: `'em'`, `'mn'`, `'re'`, `'c'`, `'f'`, `'lg'`, `'dr'`, `'ac'` |
| `mostrarMsg` | `mostrarMsg(id, txt, tipo)` | Busca elemento com ID direto. Usado com IDs completos como `'assn-msg'`, `'diag-msg'` |

### Funções de Configuração (Código.gs)

- `configurarPlanilha(opcoes)` — aplica configurações gerais
- `manutencaoSistema(tipo)` — executa rotinas de manutenção
- `obterPermissoesUsuario()` — retorna permissões do usuário atual
- `salvarCargo(nome, modulos[])` — cria/edita cargo
- `salvarUsuarioCargo(email, cargo)` — atribui cargo a usuário
- `obterConfigAbas()` — lista abas operacionais com status do alerta +30d e nº de lançamentos (admin)
- `salvarAlerta30Aba({nome, ligado})` — liga/desliga o alerta de +30 dias por aba (ScriptProperty `cdv_alerta30_off`)
- `excluirAbaExtra({nome, confirmado})` — exclui aba extra (nunca fixa); se houver dados e `confirmado=false`, retorna `{confirmar:true, usado:N}`; bloqueada se houver transferências em andamento da aba
- `criarNovoFornecedor({nome, fixar})` — cria aba operacional extra; já entra nos lançamentos e com alerta +30d ativado

---

## 22. Código.gs — Backend API Reference

**Arquivo:** `Código.gs` (7646 linhas)
**Papel:** Todo o backend do sistema.

### Funções de Lançamento

| Função | Parâmetros | Descrição |
|--------|-----------|-----------|
| `salvarLancamentoForm(dados)` | dados: objeto com campos da NF | Salva novo lançamento individual |
| `salvarLancamentoFormConfirmado(dados)` | dados + confirmado: true | Salva sem pedir confirmação de duplicata |
| `submeterParaAprovacao(dados)` | dados da NF | Submete para workflow de aprovação |
| `salvarLoteLancamentos(dados[])` | array de lançamentos | Salva múltiplos lançamentos em batch |

### Funções de Listagem e Busca

| Função | Parâmetros | Descrição |
|--------|-----------|-----------|
| `obterNotasParaTabela(filtros)` | objeto filtros | Retorna NFs filtradas para tabela |
| `buscarNFParaProgramar(nf, aba)` | nf: string, aba: string | Busca NF para programar frete |
| `buscarNFsConcluidas(nfds[])` | array de NFDs | Busca NFs concluídas para reabertura |
| `buscarPreviewNFs(nfds[])` | array de NFDs | Preview de NFs para venda/PDF |
| `buscarDadosNFDs(nfds[])` | array de NFDs | Dados detalhados para e-mail |
| `listarFornecedoresVariados()` | — | Retorna `{ variados: [nomes] }` |

### Funções de Ação em NFs

| Função | Parâmetros | Descrição |
|--------|-----------|-----------|
| `executarAcaoEmLoteNotas(acao, ids[])` | acao: string, ids: array | Aplica ação em múltiplas NFs |
| `salvarProgramacaoDevolucao(dados)` | dados frete | Salva configuração de frete |
| `executarReaberturaPorItens(itens[])` | array de NFDs | Reabre NFs concluídas |
| `executarBaixaVenda(nfds[])` | array de NFDs | Registra saída por venda |
| `confirmarRecebimentoFornecedor(aba, linha)` | aba, linha | Confirma recebimento pelo fornecedor |
| `excluirLancamento(aba, nfd)` | aba, nfd | Move NF para lixeira + apaga pasta Drive |

### Funções de Transferência

| Função | Parâmetros | Descrição |
|--------|-----------|-----------|
| `darBaixaTransferencia(id)` | id da transferência | Conclui transferência |
| `cancelarTransferencia(id)` | id da transferência | Cancela transferência |
| `reagendarTransferencia(id, novaData)` | id, data | Reagenda transferência |

### Funções de E-mail

| Função | Parâmetros | Descrição |
|--------|-----------|-----------|
| `enviarEmailDevolucao(params)` | params com NFDs, dest, comunicados[] | Envia e-mail de devolução |
| `agendarEmailDevolucao(params, dataHora)` | params + dataHora | Agenda envio futuro |
| `previewEmailDevolucao(params)` | params | Retorna HTML do e-mail para preview |
| `abrirEmailDevolucao()` | — | Abre FormEmailDevolucao como dialog modal |
| `verificarAtrasosEEnviarAlerta()` | — | Alerta automático de NFs +30 dias; varre todas as abas operacionais (fixas e extras), pulando abas com alerta desligado |

### Funções de Documentos e PDF

| Função | Parâmetros | Descrição |
|--------|-----------|-----------|
| `executarExportarPDF(nfds[], opcoes)` | array NFDs + opções | Gera PDF no Drive, retorna URL |

### Funções de Dashboard e Relatórios

| Função | Parâmetros | Descrição |
|--------|-----------|-----------|
| `obterDadosDashboard(aba)` | aba: string | KPIs + dados gráficos |
| `obterTendencia(aba, meses)` | aba, meses: 3/6/12 | Série temporal |
| `gerarRelatorioMensal(mes, ano)` | mes, ano | Relatório mensal |
| `gerarRelatorioSemanal(semana)` | semana | Relatório semanal |
| `gerarRelatorioDiario(data)` | data | Relatório diário |
| `gerarRelatorioFornecedor(forn, ini, fim)` | forn, datas | Relatório por fornecedor |
| `gerarRelatorioPendentes()` | — | Relatório de pendentes |

### Funções de Backup e Manutenção

| Função | Parâmetros | Descrição |
|--------|-----------|-----------|
| `infoBackupExistente()` | — | Metadados do backup mais recente |
| `executarBackup()` | — | Cria cópia da planilha no Drive |
| `executarRestauracao(fileId)` | fileId do backup | Restaura planilha a partir de backup |
| `configurarPlanilha(opcoes)` | opcoes: objeto | Aplica configurações |
| `manutencaoSistema(tipo)` | tipo da manutenção | Executa rotina de manutenção |

### Funções de Permissões e Acesso

| Função | Parâmetros | Descrição |
|--------|-----------|-----------|
| `obterPermissoesUsuario()` | — | Retorna `{ cargo, modulos[], isAdmin }` |
| `salvarCargo(nome, modulos[])` | nome, modulos | Cria/edita cargo |
| `salvarUsuarioCargo(email, cargo)` | email, cargo | Atribui cargo a usuário |
| `diagnosticarPermissoes()` | — | Diagnóstico completo do estado de permissões |

### Funções de Arquivo (Drive)

| Função | Parâmetros | Descrição |
|--------|-----------|-----------|
| `_garantirPastaNF(aba, nf)` | aba, nf | Cria pasta `AnexosNFs/{aba}/NF_{nf}/` se não existir |
| `_gravarLancamento(dados)` | dados com fotos[] | Salva arquivo principal + fotos `FOTO_N_*` |
| `_apagarPastaNFDrive(aba, nf, nfd)` | aba, nf, nfd | Move pasta para lixeira do Drive |
| `obterGaleriaFotos(aba, linha)` | aba, linha | Retorna URLs de todas as fotos da NF |

### Ponto de Entrada Web App

```js
doGet(e) // → retorna Index.html via HtmlService
```

### Performance e Cache

- **44 otimizações** documentadas (P01–P44)
- `CacheService` — cache de consultas frequentes
- `PropertiesService` — configurações persistentes
- `LockService` — controle de concorrência em operações críticas
- Batch `setValues` para escrita em bloco na planilha
- Debounce em operações de busca/filtro

---

## 23. Fluxos Cross-Module

### Fluxo: Lançamento → Listagem

```
FormLancamento
  → salvarLancamentoForm()
  → [GAS] grava linha na aba correta + salva arquivo Drive
  → navega para FormNotas
  → FormNotas carrega lista atualizada
```

### Fluxo: Seleção Bulk → E-mail de Devolução

```
FormNotas
  → usuário seleciona NFs (mesmo fornecedor)
  → clica "E-mail Dev." na bulk bar
  → abrirEmailBulk():
      - valida mesmo fornecedor
      - salva NFDs em localStorage('cdv_email_nfds')
      - chama google.script.run.abrirEmailDevolucao()
  → [GAS] abre FormEmailDevolucao como modal dialog

FormEmailDevolucao
  → ao carregar: lê localStorage('cdv_email_nfds'), preenche campo, limpa chave
  → usuário adiciona comunicados, configura destinatários
  → envia / agenda
```

### Fluxo: Bulk → Transferência → Retorno

```
FormNotas
  → usuário seleciona NFs
  → clica "Programar Frete"
  → abre FormProgramarFrete

FormProgramarFrete (wizard 3 passos)
  → configura frete
  → salvarProgramacaoDevolucao() → NF ganha status "Em Transferência"

[...tempo depois...]

FormTransferencias
  → lista transferências pendentes
  → usuário dá baixa: darBaixaTransferencia()
  → salva localStorage('cdv_retorno_aba') = aba de origem
  → navega para FormNotas

FormNotas
  → ao carregar: lê localStorage('cdv_retorno_aba')
  → aplica filtro de aba automaticamente
  → usuário vê exatamente as NFs da aba de origem
```

### Fluxo: Reabertura de NF

```
FormNotas (ou diretamente)
  → abre FormReabertura

FormReabertura (wizard 3 passos)
  → Passo 1: usuário digita NFDs (chips)
  → buscarNFsConcluidas() → Passo 2: preview com status atual
  → usuário confirma → executarReaberturaPorItens()
  → NFs voltam para status Pendente
```

### Fluxo: Venda em Lote

```
FormNotas
  → usuário seleciona NFs para baixa em venda
  → abre FormVenda

FormVenda (wizard 3 passos)
  → Passo 1: chips de NFDs
  → buscarPreviewNFs() → Passo 2: preview + valores
  → usuário confirma → executarBaixaVenda()
  → Passo 3: sucesso + auto-print do Doc. Carga
```

### Fluxo: Alerta Automático de Atrasos

```
[trigger agendado Google Apps Script]
  → verificarAtrasosEEnviarAlerta()
  → varre todas as abas operacionais (fixas + extras), pulando as com alerta +30d desligado (cdv_alerta30_off)
  → busca NFs com DiasArmaz > limite configurado
  → envia e-mail de alerta para destinatários configurados em _Config
```

---

## 24. Otimizações de Performance (P01–P44)

O backend documenta internamente 44 otimizações de performance nos comentários do `Código.gs`:

| Faixa | Área |
|-------|------|
| P01–P10 | Leitura/escrita batch na planilha (`getValues`/`setValues`) |
| P11–P20 | CacheService — cache de consultas recorrentes |
| P21–P30 | LockService — escopo mínimo de lock, evitar deadlock |
| P31–P40 | Debounce em buscas, paginação de resultados grandes |
| P41–P44 | Drive API — criação lazy de pastas, reutilização de referências |

**Princípios gerais aplicados:**
- Nunca ler/escrever célula por célula — sempre em batch via `getValues`/`setValues`
- CacheService para dados que não mudam a cada operação (ex: lista de fornecedores, config)
- LockService com escopo menor possível (LockService.getDocumentLock apenas onde necessário)
- PropertiesService para configurações persistentes sem bater na planilha
- Debounce de 300ms em inputs de busca para evitar chamadas excessivas ao servidor

---

*Documentação gerada em 2026-06-29. Para changelog de implementação, ver `FuncSystem.md`.*
