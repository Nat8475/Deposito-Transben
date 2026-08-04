# Planilha 2 — Controle de Devoluções (Transben)

Sistema Google Apps Script + Google Sheets. Frontend HTML puro servido via `HtmlService` (sem npm/webpack). Backend em `Código.gs`, chamado do frontend via `google.script.run`.

## Regras críticas (ler antes de editar)

- **Design system v12**: `Styles.html` é injetado pelo servidor antes de `</head>` em TODAS as páginas (`_injetarDesignSystem_()` em Código.gs). Nova variável CSS ou override de dark mode vai **só em Styles.html** — blocos locais `cdv-v10`/`body.dark` dos forms são legado sobrescrito.
- **Nunca usar `::before`/`::after` em `<tr>`** — vira célula anônima no Chrome e desloca todas as colunas do tbody.
- **Animação em `body` ou container de modal nunca pode ter `transform` com `fill: forwards/both`** — deixa transform residual e quebra todo `position:fixed` (modais, toasts).
- **AMBIENTE DE TESTE**: as constantes de e-mail/Drive em Código.gs (`EMAILS_DESTINATARIOS`, `ID_MODELO_DOC`, `ID_PASTA_*`) são de teste. Valores de produção Transben: `git show 1a18e97:Código.gs` (~linhas 142-152). Nunca pushar valores de prod para o script de teste nem vice-versa.
- **Deploy**: `clasp push` sozinho NÃO atualiza o Web App. Fluxo completo na skill `deploy-teste` (pull → push → deploy nos 2 IDs → cache).
- Convenções detalhadas (showMsg vs mostrarMsg, toasts, cache): skill `project-conventions` carrega automaticamente quando relevante.

## Arquivos principais

- `Código.gs` — todo o backend (355KB, monolito)
- `Index.html` — shell/menu do Web App (tem cópia própria dos tokens CSS; não recebe injeção)
- `FormNotas.html` — listagem, filtros, KPIs, modal detalhe
- `FormLancamento.html`, `FormEmailDevolucao.html`, `FormTransferencias.html`, `FormConfiguracoes.html` — telas principais
- `Styles.html` — design system v12 (fonte única de CSS)
- `DOCUMENTACAO.md` — documentação funcional completa (grande; ler só a seção necessária)

## Planilha

Abas: Britania, Unilever, Fornecedores Variados, _Log, _Config, Dashboard, ABA_TRANSFERENCIAS.
Drive: `AnexosNFs/{aba}/NF_{nf}/`.
