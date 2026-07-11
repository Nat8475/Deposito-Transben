# Gestão de abas de notas + toggle de alerta +30 dias — Design

Data: 2026-07-11
Status: aguardando aprovação

## Objetivo

Na tela de Configurações (visual do redesign, `redesign/FormConfiguracoes_Exemplo.html`), o usuário gerencia as abas onde ficam as notas:

1. Vê todas as abas operacionais (fixas + extras) numa lista.
2. Cria nova aba (fluxo `criarNovoFornecedor` existente).
3. Exclui aba extra (fixas não são excluíveis).
4. Liga/desliga, por aba, o alerta de e-mail de atraso crítico (+30 dias).

## Decisões tomadas (com o usuário)

- **Escopo do toggle**: só o e-mail de alerta (`verificarAtrasosEEnviarAlerta`). Cor vermelha `COR_ALERTA_30DIAS` na planilha e flag `alerta` do dashboard NÃO mudam.
- **Abas fixas** (Britania, Unilever, Fornecedores Variados) também têm toggle. Default: ligado.
- **Exclusão de aba extra** entra no escopo.
- **Visual**: seguir o mockup do redesign (pane-fornecedor), integrando com o port em andamento.

## Armazenamento (abordagem A — aprovada)

Nova key em ScriptProperties: `cdv_alerta30_off` = JSON array de nomes de abas com alerta DESLIGADO. Aba ausente = ligado. Assim, abas novas nascem com alerta ligado sem escrita extra e não há migração de formato.

## Backend (Código.gs)

### Novos helpers/funções

- `_getAlerta30Off()` → array (parse seguro de `cdv_alerta30_off`, fallback `[]`).
- `obterConfigAbas()` → `JSON.stringify({ abas: [{ nome, fixa, alerta30, usado }] })` — fixas primeiro, depois extras; `usado` = linhas de dados (mesma conta de `obterDiagnostico`), usado no aviso de exclusão. Restrito a admin (`_usuarioEhAdmin`).
- `salvarAlerta30Aba(nome, ligado)` → atualiza `cdv_alerta30_off`, `registrarLog` da mudança, retorna `{ok}`/`{erro}`. Restrito a admin.
- `excluirAbaExtra(nome)` → restrito a admin. Valida: nome está em `cdv_abas_extras` (nunca fixa). Exclui a sheet (`ss.deleteSheet`), remove de `cdv_abas_extras` e de `cdv_alerta30_off`, `registrarLog`. Se a aba tiver dados, exige `confirmado: true` no param (frontend confirma antes). Retorna `{ok}`/`{erro}`.

### Alterações em funções existentes

- `verificarAtrasosEEnviarAlerta` (linha ~4961): trocar `ABAS_OPERACIONAIS.forEach` por `_getTodasAbas()` filtrado por `_getAlerta30Off()`. **Corrige bug latente**: abas extras hoje nunca entram no alerta.
- `criarNovoFornecedor`: sem mudança de lógica (aba nova já nasce ligada por ausência na lista off). Remover do texto de sucesso a instrução obsoleta de editar `ABAS_OPERACIONAIS` no código.

## Frontend (FormConfiguracoes.html, pane-fornecedor no visual v12/redesign)

- **Card "Abas de notas"**: lista vinda de `obterConfigAbas()`. Cada linha: nome, badge "padrão" (fixa) ou botão ✕ (extra), switch "Alerta +30 dias". Switch salva na hora via `salvarAlerta30Aba` com feedback showMsg/toast do form (convenção do projeto).
- **Card "Adicionar Novo Fornecedor"**: mantém fluxo atual; após criar, recarrega a lista.
- **Exclusão**: clique no ✕ → se `usado > 0`, modal/confirm com aviso "aba tem N lançamentos — exclusão apaga os dados"; senão confirmação simples. Chama `excluirAbaExtra`, recarrega lista.
- Substitui o card estático "Abas extras existentes" do mockup (tags AMBEV/ZUNE eram demo).

## Fluxo de dados

FormConfiguracoes → `google.script.run` → `obterConfigAbas` (load) / `salvarAlerta30Aba` (toggle) / `criarNovoFornecedor` (criar) / `excluirAbaExtra` (excluir). Trigger diário `verificarAtrasosEEnviarAlerta` lê `_getTodasAbas()` − `_getAlerta30Off()`.

## Tratamento de erros

- Todas as funções novas: try/catch com `registrarErroSistema`, retorno `{erro}` padrão do projeto.
- `excluirAbaExtra` nunca aceita nome de aba fixa nem aba fora de `cdv_abas_extras` (defesa mesmo se o frontend mandar errado).
- Parse de `cdv_alerta30_off` corrompido → tratar como `[]` (tudo ligado, comportamento seguro).

## Testes / verificação

Sem framework de testes no projeto (GAS). Verificação manual pós-deploy (skill `deploy-teste`):

1. Configurações lista 3 fixas + extras existentes, toggles ligados.
2. Desligar toggle de uma aba, rodar `verificarAtrasosEEnviarAlerta` manualmente → aba fora do relatório; religar → volta.
3. Criar aba extra → aparece na lista com toggle ligado e entra no alerta.
4. Excluir aba extra sem dados → some da lista e da planilha. Com dados → pede confirmação.
5. Tentar excluir fixa via console → `{erro}`.
6. Dark mode e cache de páginas (`limparCachePaginas`) após publicar.

## Fora de escopo

- Toggle não afeta cor vermelha na planilha nem dashboard.
- Sem renomear abas.
- Sem config extra por aba (cor, ordem) — se surgir, migrar storage para objeto por aba.
