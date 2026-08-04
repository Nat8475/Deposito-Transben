# Design: Multi-select Venda/Devolvida → Exportar PDF

**Data:** 2026-06-27
**Status:** Aprovado
**Escopo:** FormNotas.html + FormExportarPDF.html

---

## Contexto

FormNotas exibe todas as notas em uma tabela com checkboxes para seleção em lote. Quando linhas são selecionadas, aparece uma bulk action bar azul no topo com botões como "Baixa Dev." e "Prog. Frete". O FormExportarPDF é um wizard 3-steps para geração de PDFs de devolução — atualmente só aceita NFDs digitadas manualmente pelo usuário.

O objetivo é adicionar um botão "📄 Exportar PDF" na bulk bar que só aparece quando o filtro de status ativo é "Devolvido" ou "Venda" e há pelo menos 1 linha selecionada. Ao clicar, as NFDs/NFs selecionadas são pré-preenchidas automaticamente no FormExportarPDF.

---

## O que NÃO muda

- Lógica de seleção existente (`_sel[]`, `toggleItem`, `toggleTodos`, `getItensSelecionados`)
- Wizard 3-steps do FormExportarPDF (`buscarPrevia`, `confirmar`, `parseLive`)
- Código.gs — nenhuma mudança de backend
- Outros botões da bulk bar ("Baixa Dev.", "Baixa Venda", "Prog. Frete")

---

## Arquitetura

Dois eixos independentes:
1. **FormNotas.html** — detecta o status do filtro ativo, exibe o botão condicionalmente, coleta NFDs/NFs e handoff via `localStorage`
2. **FormExportarPDF.html** — lê o localStorage no init, pré-preenche o textarea e dispara `parseLive()`

O protocolo de handoff usa a chave `cdv_pdf_prefill` no localStorage (mesmo padrão do `cdv_dark_mode` e `cdv_density` do projeto).

---

## FormNotas.html

### 1. Botão na bulk bar

Adicionar imediatamente após `<button … onclick="abrirFreteModal()">🚚 Prog. Frete</button>`:

```html
<button class="btn-sm btn-navy" id="btn-exp-pdf"
  onclick="exportarPDFSelecionados()" style="display:none">📄 Exportar PDF</button>
```

- `display:none` por padrão — só aparece via JS
- Classe `btn-navy` (mesmo estilo dos outros botões de ação primária no projeto)

### 2. `atualizarBulkBar()` — show/hide condicional

No final da função `atualizarBulkBar()`, adicionar:

```javascript
var filtSt = document.getElementById('f-status').value;
var showPdf = cnt > 0 && (filtSt === 'Devolvido' || filtSt === 'Venda');
document.getElementById('btn-exp-pdf').style.display = showPdf ? '' : 'none';
```

Condição: `cnt > 0` (rows selecionados) **E** filtro de status é exatamente `'Devolvido'` ou `'Venda'`.

### 3. `exportarPDFSelecionados()`

```javascript
function exportarPDFSelecionados() {
  var sels = getItensSelecionados();
  var nfs = [];
  for (var i = 0; i < sels.length; i++) {
    nfs.push(sels[i].nfd || sels[i].nf);
  }
  try { localStorage.setItem('cdv_pdf_prefill', nfs.join('\n')); } catch(_) {}
  google.script.run.abrirFormularioExportarPDF();
}
```

- Usa `nfd` se disponível, senão `nf` (fallback)
- `nfs.join('\n')` — um valor por linha (formato aceito pelo FormExportarPDF)
- `try/catch` em torno do localStorage (padrão do projeto)
- `google.script.run.abrirFormularioExportarPDF()` — reutiliza a função existente; o GAS substitui o modal atual pelo FormExportarPDF

---

## FormExportarPDF.html

### IIFE de prefill

Adicionar após o relay de hotkeys (antes de `</script>`):

```javascript
// prefill via seleção do FormNotas
(function() {
  try {
    var p = localStorage.getItem('cdv_pdf_prefill');
    if (p) {
      localStorage.removeItem('cdv_pdf_prefill');
      document.getElementById('nfs').value = p;
      parseLive();
    }
  } catch(_) {}
})();
```

- Remove a chave imediatamente após leitura (evita reuso acidental em abertura subsequente)
- Chama `parseLive()` para exibir os chips e atualizar o contador
- Se `cdv_pdf_prefill` não existir (abertura standalone via menu), bloco não faz nada — comportamento inalterado

---

## Arquivos modificados

| Arquivo | Mudanças |
|---|---|
| `FormNotas.html` | Botão `#btn-exp-pdf` na bulk bar + show/hide em `atualizarBulkBar()` + função `exportarPDFSelecionados()` |
| `FormExportarPDF.html` | IIFE de prefill ao final do script |

Nenhuma mudança em `Código.gs`.

---

## Fora do Escopo

- Mostrar botão quando filtro não é Venda/Devolvido (outras abas/status)
- Manter FormNotas aberto em paralelo ao FormExportarPDF (limitação do GAS: 1 modal por vez)
- Validação de NFDs duplicados (FormExportarPDF já trata via `buscarPreviewNFs`)
- Novo botão no menu lateral ou topbar
