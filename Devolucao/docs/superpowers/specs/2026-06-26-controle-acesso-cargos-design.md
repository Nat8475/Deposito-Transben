# Design: Controle de Acesso e Permissões por Cargos

**Data:** 2026-06-26  
**Status:** Aprovado  
**Escopo:** FormConfiguracoes.html + Código.gs + enforcement nos Forms

---

## Contexto

Atualmente existem 3 telas separadas em FormConfiguracoes para controle de acesso:
- `screen-acesso` — lista de admins (dono + e-mails adicionais)
- `screen-readonly` — toggle global de somente leitura
- `screen-permissoes` — listas de e-mail por módulo + flag RO por módulo

O sistema de permissões atual opera por lista de e-mails individuais por módulo. O novo sistema substitui isso por **cargos** (roles) com módulos e flag de leitura configuráveis, consolidando tudo em um único hub com abas.

---

## Objetivo

1. Consolidar as 3 telas em um hub `screen-acesso-hub` com 3 abas
2. Criar sistema de cargos (roles) com módulos permitidos e flag somente-leitura
3. Vincular e-mails a cargos
4. Manter Admin como conceito separado (dono + lista de admins)
5. Manter toggle de modo leitura global (bloqueia todos exceto admins)

---

## O que NÃO muda

- Admin = dono da planilha + lista de e-mails de administradores adicionais
- Admins sempre têm acesso total, independente de qualquer configuração
- A interface de gerenciar admins permanece idêntica à atual

---

## Estrutura do Hub

### Card no menu principal (`screen-sel`)

Substituir os 3 cards separados (Controle de Acesso, Modo Somente-Leitura, Permissões por Módulo) por **1 card único**:

```
🔐 Controle de Acesso e Permissões
   Administradores, cargos, usuários e modo leitura
```

### Screen: `screen-acesso-hub` — 3 abas

```
[ Acesso ]  [ Cargos ]  [ Usuários ]
```

---

## Aba 1 — Acesso

Duas seções empilhadas:

**Seção: Administradores**
- Exibe o dono da planilha (read-only, fixo)
- Lista de admins adicionais com tags removíveis
- Input de e-mail + botão adicionar
- Botão "Salvar Administradores"

**Seção: Modo Somente-Leitura Global**
- Toggle on/off
- Quando ATIVO: todos os cargos ficam em modo leitura; admins mantêm acesso pleno
- Quando INATIVO: cada cargo opera com suas próprias configurações
- Status text dinâmico ("Ativo — sistema em manutenção" / "Inativo")

---

## Aba 2 — Cargos

**Formulário de criação (sempre visível, colapsável):**
- Campo: Nome do cargo (texto livre)
- Checkboxes: módulos permitidos (Notas, Lançamento, E-mail, Frete, Configurações, Auditoria)
- Toggle: Somente leitura (quando marcado, usuários desse cargo podem ver mas não criar/editar/deletar/enviar)
- Botão: "Criar Cargo"

**Lista de cargos existentes:**
- Cada item: nome · módulos (badges) · ícone 🔒 se RO · botões [✏️ Editar] [🗑️ Excluir]
- Excluir mostra aviso se houver usuários vinculados ao cargo

**Aviso fixo no rodapé da aba:**
> "Usuários sem cargo atribuído operam como Visualizador — acesso a todos os módulos, somente leitura."

---

## Aba 3 — Usuários

**Formulário de vínculo:**
- Input: e-mail do usuário
- Dropdown: selecionar cargo (lista dos cargos criados)
- Botão: "Adicionar"

**Lista de vínculos ativos:**
- Cada item: e-mail · badge com nome do cargo (colorido por cargo) · botão [🗑️ Remover]
- Usuários sem vínculo aparecem como "sem cargo → Visualizador (padrão)" se tentados de ser adicionados sem cargo

---

## Modelo de Dados

### Chaves novas no PropertiesService

```
cdv_cargos    → JSON: CargoItem[]
cdv_usuarios  → JSON: UsuarioItem[]
```

### Tipos

```json
// CargoItem
{
  "id": "c1",               // gerado: Date.now().toString(36)
  "nome": "Auditor",
  "modulos": ["notas", "auditoria"],
  "somenteLeitura": true
}

// UsuarioItem
{
  "email": "ana@empresa.com",
  "cargoId": "c1"
}
```

### Chaves abandonadas (sem migração)

- `cdv_perm_*` — listas de e-mail por módulo
- `cdv_ro_*` — flags RO por módulo

---

## Backend — Funções novas em Código.gs

| Função | Assinatura | Descrição |
|---|---|---|
| `obterCargos` | `() → JSON` | Lê `cdv_cargos` |
| `salvarCargo` | `(id, nome, modulos[], somenteLeitura) → JSON` | Cria ou atualiza cargo |
| `excluirCargo` | `(id) → JSON` | Remove cargo; retorna erro se há usuários vinculados |
| `obterUsuariosCargos` | `() → JSON` | Lê `cdv_usuarios` |
| `salvarUsuarioCargo` | `(email, cargoId) → JSON` | Upsert de vínculo email → cargo |
| `removerUsuarioCargo` | `(email) → JSON` | Remove vínculo |
| `obterPermissoesUsuario` | `(email) → JSON` | Resolve permissões efetivas |

### Lógica de `obterPermissoesUsuario(email)`

```
Retorna: { admin: bool, modulos: string[], somenteLeitura: bool }

1. email é dono ou está na lista de admins?
   → { admin: true, modulos: ['*'], somenteLeitura: false }

2. RO global ativado? (cdv_modo_ro === 'true')
   → { admin: false, modulos: todosOsModulos, somenteLeitura: true }

3. email tem cargo vinculado em cdv_usuarios?
   → usa cargo.modulos e cargo.somenteLeitura

4. Sem cargo:
   → { admin: false, modulos: todosOsModulos, somenteLeitura: true }
```

---

## Enforcement nos Forms

Cada form chama `obterPermissoesUsuario` no `init()` via `google.script.run`.

**Se módulo não está em `modulos`:**
- Exibe tela de acesso negado (não carrega o form)

**Se `somenteLeitura: true`:**
- Todos os botões de escrita ficam `disabled`
- Banner no topo: "🔒 Modo somente leitura — você não tem permissão para realizar alterações"

**Forms afetados:**
- FormNotas, FormLancamento, FormEmailDevolucao, FormProgramarFrete, FormConfiguracoes, FormAuditoria

---

## Avatar do Usuário (Grupo C — mencionado como relacionado)

`Session.getActiveUser().getEmail()` retorna o e-mail do usuário atual. A foto do Google Avatar não é acessível diretamente via GAS sem People API.

**Decisão:** Exibir **iniciais** do e-mail num círculo colorido (cor derivada do hash do e-mail). Sem dependência de API externa. Exibir no canto superior da sidebar ou topbar do Index.html.

---

## Fora do Escopo

- Migração automática das permissões antigas para cargos
- Roles hierárquicas (herança de cargo)
- Permissão por ação (apenas por módulo + flag global RO)
- Avatar via People API
