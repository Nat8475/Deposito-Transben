# Multi-select Venda/Devolvida → Exportar PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar botão "📄 Exportar PDF" na bulk action bar do FormNotas que aparece apenas quando o filtro de status ativo é "Devolvido" ou "Venda" e há linhas selecionadas, abrindo o FormExportarPDF com os NFDs pré-preenchidos via `localStorage`.

**Architecture:** Dois arquivos independentes: (1) FormNotas.html — botão condicional na bulk bar + show/hide em `atualizarBulkBar()` + função `exportarPDFSelecionados()` que grava no localStorage e chama `google.script.run.abrirFormularioExportarPDF()`; (2) FormExportarPDF.html — IIFE de prefill ao final do script que lê e limpa `localStorage['cdv_pdf_prefill']`, preenche o textarea e chama `parseLive()`. Nenhuma mudança em Código.gs.

**Tech Stack:** Google Apps Script, HTML/CSS/JS vanilla, localStorage API, `google.script.run`.

## Global Constraints

- GAS: sem `Array.from()`, sem `NodeList.forEach()` — usar for loops ou literais de array
- Nenhuma mudança em `Código.gs`
- Chave localStorage exata: `cdv_pdf_prefill`
- Condição de visibilidade: `f-status.value === 'Devolvido'` **ou** `f-status.value === 'Venda'` **e** `cnt > 0`
- Campo de prefill: `sels[i].nfd || sels[i].nf` (NFD se disponível, senão NF)
- Separador de valores: `'\n'` (um valor por linha)
- Remover `cdv_pdf_prefill` do localStorage imediatamente após leitura

---

### Task 1: FormNotas.html — botão + show/hide + função

**Files:**
- Modify: `FormNotas.html`

**Interfaces:**
- Consumes: `getItensSelecionados()` — retorna array de objetos com campos `nfd` e `nf`; `document.getElementById('f-status').value` — string com o status ativo
- Produces: `localStorage['cdv_pdf_prefill']` — string com NFDs/NFs separados por `\n`; chama `google.script.run.abrirFormularioExportarPDF()`

- [ ] **Step 1: Adicionar botão `#btn-exp-pdf` à bulk bar**

Localizar em `FormNotas.html` (linha ~499):
```html
  <button class="btn-sm btn-teal" onclick="abrirFreteModal()">🚚 Prog. Frete</button>
```

Substituir por:
```html
  <button class="btn-sm btn-teal" onclick="abrirFreteModal()">🚚 Prog. Frete</button>
  <button class="btn-sm" id="btn-exp-pdf" onclick="exportarPDFSelecionados()"
    style="display:none;background:#2563EB;color:#fff">📄 Exportar PDF</button>
```

- [ ] **Step 2: Adicionar lógica show/hide em `atualizarBulkBar()`**

Localizar o fechamento da função `atualizarBulkBar()` (linha ~1184-1186):
```javascript
  } else {
    warn.style.display = 'none';
  }
}
```

Substituir por:
```javascript
  } else {
    warn.style.display = 'none';
  }
  var filtSt = document.getElementById('f-status').value;
  var showPdf = cnt > 0 && (filtSt === 'Devolvido' || filtSt === 'Venda');
  document.getElementById('btn-exp-pdf').style.display = showPdf ? '' : 'none';
}
```

- [ ] **Step 3: Adicionar função `exportarPDFSelecionados()`**

Localizar após `getItensSelecionados()` (linha ~1188-1190):
```javascript
function getItensSelecionados() {
  return _filtrados.filter(function(_,i){ return _sel[i]; });
}
```

Inserir imediatamente após (nova linha):
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

- [ ] **Step 4: Verificação manual**

Abrir `FormNotas.html` no editor e confirmar:

1. O `<button id="btn-exp-pdf">` existe na bulk bar logo após o botão `🚚 Prog. Frete`, com `display:none` e `background:#2563EB`
2. Dentro de `atualizarBulkBar()`, as 3 linhas `filtSt`/`showPdf`/`getElementById('btn-exp-pdf')` estão antes do `}` de fechamento
3. `exportarPDFSelecionados()` está definida, usa for loop (não `forEach`), chama `localStorage.setItem('cdv_pdf_prefill', ...)` e `google.script.run.abrirFormularioExportarPDF()`

- [ ] **Step 5: Commit**

```bash
git add FormNotas.html
git commit -m "feat(notas): botão Exportar PDF na bulk bar com handoff localStorage"
```

---

### Task 2: FormExportarPDF.html — IIFE de prefill

**Files:**
- Modify: `FormExportarPDF.html`

**Interfaces:**
- Consumes: `localStorage['cdv_pdf_prefill']` — string com NFDs/NFs separados por `\n` (escrita por Task 1); `document.getElementById('nfs')` — textarea do FormExportarPDF; `parseLive()` — função existente que atualiza chips a partir do valor do textarea
- Produces: nada — apenas preenche a UI no init

- [ ] **Step 1: Adicionar IIFE de prefill ao final do script**

Localizar o final do bloco `<script>` em `FormExportarPDF.html` (linhas ~463-464):
```javascript
  if (e.altKey && !ctrl && '123456'.indexOf(e.key) >= 0) { e.preventDefault(); try { window.parent.postMessage({cdvKey:{ctrlKey:false,metaKey:false,altKey:true,key:e.key}}, '*'); } catch(_) {} }
});
</script>
```

Substituir por:
```javascript
  if (e.altKey && !ctrl && '123456'.indexOf(e.key) >= 0) { e.preventDefault(); try { window.parent.postMessage({cdvKey:{ctrlKey:false,metaKey:false,altKey:true,key:e.key}}, '*'); } catch(_) {} }
});
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
</script>
```

- [ ] **Step 2: Verificação manual**

Abrir `FormExportarPDF.html` e confirmar:

1. A IIFE de prefill está após o relay de hotkeys e antes de `</script>`
2. `localStorage.removeItem('cdv_pdf_prefill')` é chamado **antes** de usar `p` (removido imediatamente após leitura)
3. `parseLive()` é chamado após preencher `document.getElementById('nfs').value`
4. Todo o bloco está dentro de `try/catch`
5. Nenhuma outra linha do arquivo foi alterada

- [ ] **Step 3: Commit**

```bash
git add FormExportarPDF.html
git commit -m "feat(exportar-pdf): prefill via cdv_pdf_prefill ao abrir pelo FormNotas"
```

---

## Self-Review

**Spec coverage:**
- ✅ Botão `#btn-exp-pdf` na bulk bar → Task 1 Step 1
- ✅ Visível apenas quando filtro Devolvido/Venda + cnt > 0 → Task 1 Step 2
- ✅ Coleta NFD || NF de cada linha selecionada → Task 1 Step 3
- ✅ Handoff via `localStorage['cdv_pdf_prefill']` → Task 1 Step 3
- ✅ Abre FormExportarPDF via `google.script.run.abrirFormularioExportarPDF()` → Task 1 Step 3
- ✅ Prefill ao init + `parseLive()` + remoção imediata da chave → Task 2 Step 1
- ✅ Nenhuma mudança em Código.gs → confirmado em ambas as tasks

**Placeholder scan:** Nenhum TBD/TODO. Todos os steps têm código completo e exato.

**Type consistency:** `cdv_pdf_prefill` escrita em Task 1 (`localStorage.setItem`) e lida em Task 2 (`localStorage.getItem`) — nome idêntico. `sels[i].nfd` e `sels[i].nf` são campos reais do objeto retornado por `getItensSelecionados()` (provenientes de `_filtrados`, que vem dos dados do backend).
