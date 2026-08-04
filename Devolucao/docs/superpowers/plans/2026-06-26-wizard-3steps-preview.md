# Wizard 3 Steps com Prévia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar FormExportarPDF, FormVenda e FormProgramarFrete para um wizard de 3 steps com stepper visual, prévia de dados antes de confirmar e animações de transição.

**Architecture:** Cada formulário ganha um stepper (círculos 1-2-3 com linha de progresso) e 3 panes que trocam com slide horizontal via `transform:translateX`. FormExportarPDF e FormVenda precisam de nova função GAS `buscarPreviewNFs` para buscar dados sem modificar. FormProgramarFrete reutiliza `buscarNFParaProgramar` existente e avança automaticamente ao encontrar resultado.

**Tech Stack:** Google Apps Script (GAS), HTML/CSS/JS vanilla, CSS Variables (já definidas no design system), Google Fonts (Plus Jakarta Sans + JetBrains Mono já carregadas).

## Global Constraints

- Arquivos HTML são standalone (GAS não usa import/include entre HTMLs) — CSS e JS repetidos em cada arquivo.
- Nenhuma mudança de assinatura nas funções GAS existentes: `executarExportarPDF(nfsStr)`, `executarBaixaVenda(nfsStr)`, `buscarNFParaProgramar(termo)`, `salvarProgramacaoDevolucao(params)`.
- Dark mode via `body.dark` e variáveis CSS — sem change adicional.
- `position:fixed` proibido no stepper (quebra em iframes GAS) — usar fluxo normal.
- Todas as animações respeitam `@media(prefers-reduced-motion:reduce)` já presente no CSS base.
- Constantes já definidas em Código.gs: `IDX_NFD`, `IDX_NF`, `IDX_FORN`, `IDX_TIPO`, `IDX_MOTIVO`, `IDX_QTD`, `IDX_VL_TOT`, `IDX_DATA`, `IDX_STATUS`, `LINHA_DADOS`, `TOTAL_COLUNAS`. Usar essas — não hardcodar índices.

---

## Mapa de arquivos

| Arquivo | Ação |
|---|---|
| `Código.gs` | Adicionar função `buscarPreviewNFs` |
| `FormExportarPDF.html` | Reescrever completo |
| `FormVenda.html` | Reescrever completo |
| `FormProgramarFrete.html` | Reescrever completo |

---

### Task 1: Backend — `buscarPreviewNFs` em Código.gs

**Files:**
- Modify: `Código.gs` (adicionar após a função `buscarNFParaProgramar`, em torno da linha 1895)

**Interfaces:**
- Consumes: `txtNfsRaw: string` (mesma entrada de `executarExportarPDF`)
- Produces: `string` (JSON) — `{ itens: Item[] }` ou `{ erro: string }`
  - `Item = { nfd, nf, forn, tipo, motivo, qtd, vlTot, data }`

- [ ] **Step 1: Localizar ponto de inserção em Código.gs**

  Abrir `Código.gs` e localizar a função `buscarNFParaProgramar` (em torno da linha 1853). A nova função vai logo após o fechamento `}` dessa função (linha ~1895).

- [ ] **Step 2: Inserir a função `buscarPreviewNFs`**

  Adicionar após o `}` de `buscarNFParaProgramar`:

  ```js
  /**
   * Busca NFs/NFDs Pendentes para prévia — sem alterar dados.
   * Retorna { itens: [{nfd,nf,forn,tipo,motivo,qtd,vlTot,data}] } ou { erro }.
   */
  function buscarPreviewNFs(txtNfsRaw) {
    var nfsDigitadas = String(txtNfsRaw || '').split(/[\n,;]+/).map(function(s){ return s.trim(); }).filter(Boolean);
    if (!nfsDigitadas.length) return JSON.stringify({ erro: 'Nenhuma NF válida identificada.' });

    var ss    = getSS();
    var tz    = ss.getSpreadsheetTimeZone();
    var itens = [];
    var naoLocalizadas = nfsDigitadas.slice();

    _getTodasAbas().forEach(function(nomeAba) {
      var ws = ss.getSheetByName(nomeAba);
      if (!ws) return;
      var ul = obterUltimaLinhaDados(ws);
      if (ul < LINHA_DADOS) return;

      var dados = ws.getRange(LINHA_DADOS, 1, ul - LINHA_DADOS + 1, TOTAL_COLUNAS).getValues();
      dados.forEach(function(l) {
        var nfd = String(l[IDX_NFD] || '').trim();
        var nf  = String(l[IDX_NF]  || '').trim();
        var st  = String(l[IDX_STATUS] || '').trim();
        var bat = _baterTermos(nfsDigitadas, nfd, nf);
        if (!bat.bate || st !== 'Pendente') return;

        var dt = l[IDX_DATA];
        itens.push({
          nfd:    nfd,
          nf:     nf,
          forn:   String(l[IDX_FORN]   || '').trim(),
          tipo:   String(l[IDX_TIPO]   || '').trim(),
          motivo: String(l[IDX_MOTIVO] || '').trim(),
          qtd:    parseFloat(l[IDX_QTD]    || 0) || 0,
          vlTot:  parseFloat(l[IDX_VL_TOT] || 0) || 0,
          data:   dt instanceof Date ? Utilities.formatDate(dt, tz, 'dd/MM/yyyy') : ''
        });
        var idx = naoLocalizadas.indexOf(bat.termoBateu);
        if (idx > -1) naoLocalizadas.splice(idx, 1);
      });
    });

    if (!itens.length) return JSON.stringify({ erro: "Nenhuma NF com status 'Pendente' localizada." });
    return JSON.stringify({ itens: itens, naoLocalizadas: naoLocalizadas });
  }
  ```

- [ ] **Step 3: Verificar manualmente no editor GAS**

  Abrir o editor de scripts (Extensões → Apps Script), confirmar que não há erros de sintaxe (ícone vermelho na lateral). Executar `buscarPreviewNFs` manualmente com um número de NF válido via "Executar" para confirmar retorno JSON correto.

  Resultado esperado: log mostra `{ itens: [...], naoLocalizadas: [] }` para uma NF Pendente existente.

- [ ] **Step 4: Commit**

  ```bash
  git add "Código.gs"
  git commit -m "feat(backend): adicionar buscarPreviewNFs — consulta sem alterar status"
  ```

---

### Task 2: FormExportarPDF — Wizard 3 Steps

**Files:**
- Rewrite: `FormExportarPDF.html`

**Interfaces:**
- Consumes: `buscarPreviewNFs(nfsStr)` → `{ itens, naoLocalizadas }` (Task 1)
- Consumes: `executarExportarPDF(nfsStr)` → `{ sucesso, urlPdf }` (já existente)

- [ ] **Step 1: Substituir o conteúdo completo de `FormExportarPDF.html`**

  Reescrever o arquivo inteiro com o seguinte conteúdo:

  ```html
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <base target="_top">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:var(--font);font-size:13px;background:var(--bg);color:var(--text);padding:16px;transition:background .22s,color .22s}

      /* STEPPER */
      .wz-header{display:flex;align-items:flex-start;margin-bottom:16px;animation:fadeUp .22s var(--ease) both}
      .wz-step{display:flex;flex-direction:column;align-items:center;flex-shrink:0}
      .wz-circle{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;
                 font-size:11px;font-weight:700;border:1.5px solid var(--border-def);color:var(--text-muted);
                 background:var(--surface);transition:background .3s,border-color .3s,color .3s,box-shadow .3s}
      .wz-circle.active{background:linear-gradient(135deg,var(--navy-800),var(--navy));border-color:var(--navy);
                         color:#fff;box-shadow:0 2px 8px rgba(28,69,208,.3)}
      .wz-circle.done{background:var(--green-bg);border-color:var(--green);color:var(--green)}
      .wz-lbl{font-size:10px;color:var(--text-muted);margin-top:3px;white-space:nowrap}
      .wz-line{flex:1;height:2px;background:var(--border);margin:0 6px;margin-bottom:16px;
               border-radius:2px;overflow:hidden}
      .wz-line-fill{height:100%;width:0;background:var(--navy);transition:width .35s ease;border-radius:2px}

      /* STEPS CONTAINER */
      .steps-wrap{position:relative;overflow:hidden}
      .wz-pane{display:none}
      .wz-pane.active{display:block}

      /* HEADER CARD (step 1 only) */
      .hdr{display:flex;align-items:center;gap:11px;background:var(--surface);border:1px solid var(--border);
           border-radius:var(--r);padding:12px 14px;margin-bottom:12px;box-shadow:var(--sh)}
      .hdr-ico{width:38px;height:38px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;
               justify-content:center;font-size:18px;
               background:linear-gradient(135deg,var(--navy-800),var(--navy));box-shadow:0 2px 8px rgba(28,69,208,.28)}
      .hdr-txt h1{font-size:14px;font-weight:800;line-height:1.2}
      .hdr-txt p{font-size:11px;color:var(--text-muted);margin-top:2px}

      /* INFO BANNER (step 1 only) */
      .info{background:var(--navy-50);border:1px solid var(--border);border-left:3px solid var(--navy);
            border-radius:var(--r-sm);padding:9px 12px;font-size:11.5px;color:var(--text-body);
            line-height:1.6;margin-bottom:14px}

      /* FIELD */
      .field-lbl{font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;
                 letter-spacing:.06em;margin-bottom:6px}
      textarea{width:100%;padding:10px 12px;border:1.5px solid var(--border-def);border-radius:var(--r-sm);
               font-size:13px;font-family:var(--mono);resize:none;background:var(--input-bg);color:var(--text);
               line-height:1.7;transition:border-color .15s,box-shadow .15s,background .15s;outline:none}
      textarea:focus{border-color:var(--navy);box-shadow:0 0 0 3px rgba(28,69,208,.10);background:var(--surface)}

      /* CHIP ZONE */
      .chip-zone{display:flex;flex-wrap:wrap;gap:5px;overflow:hidden;
                 max-height:0;margin-top:0;transition:max-height .3s var(--ease),margin-top .25s var(--ease)}
      .chip-zone.open{max-height:120px;margin-top:7px}
      .chip{background:var(--navy-50);border:1px solid var(--border);color:var(--navy);
            font-family:var(--mono);font-size:11px;font-weight:600;padding:3px 8px;border-radius:99px;
            animation:chipIn .15s var(--ease) both}
      body.dark .chip{color:#6B9EFF}
      .chip-cnt{font-size:11px;color:var(--text-muted);width:100%;margin-top:2px}

      /* ACTIONS */
      .actions{display:flex;gap:8px;margin-top:14px}
      .btn-main{flex:1;position:relative;overflow:hidden;padding:10px 16px;border:none;cursor:pointer;
                background:linear-gradient(135deg,var(--navy-800),var(--navy));color:#fff;
                border-radius:var(--r-sm);font-size:13px;font-weight:700;font-family:var(--font);
                box-shadow:0 2px 8px rgba(28,69,208,.28);transition:transform .12s,box-shadow .12s}
      .btn-main:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 5px 16px rgba(28,69,208,.38)}
      .btn-main:active:not(:disabled){transform:translateY(0)}
      .btn-main:disabled{opacity:.5;cursor:not-allowed}
      .btn-main .lbl{position:relative;z-index:1}
      .btn-main .shim{position:absolute;inset:0;width:45%;background:rgba(255,255,255,.18);transform:translateX(-120%)}
      .btn-main.busy .shim{animation:sweep 1.3s linear infinite}
      .btn-ghost{padding:10px 14px;border:1.5px solid var(--border-def);background:transparent;
                 color:var(--text-muted);border-radius:var(--r-sm);font-size:13px;font-weight:600;
                 font-family:var(--font);cursor:pointer;transition:border-color .15s,color .15s,background .15s}
      .btn-ghost:hover{border-color:var(--navy);color:var(--navy);background:var(--navy-50)}

      /* PREVIEW TABLE (step 2) */
      .preview-hdr{font-size:12px;color:var(--text-muted);margin-bottom:10px}
      .preview-hdr strong{color:var(--text)}
      .tbl-wrap{overflow-x:auto;border-radius:var(--r-sm);box-shadow:var(--sh);margin-bottom:12px}
      table.preview{width:100%;border-collapse:collapse;font-size:12px;min-width:560px}
      table.preview th{background:linear-gradient(135deg,var(--navy-800),var(--navy));color:#fff;
                       padding:8px 9px;text-align:left;font-size:10px;text-transform:uppercase;
                       letter-spacing:.04em;white-space:nowrap}
      table.preview td{padding:6px 9px;border-bottom:1px solid var(--border);
                       vertical-align:middle;color:var(--text-body)}
      table.preview tbody tr{animation:fadeUp .2s var(--ease) both}
      table.preview tbody tr:last-child td{border-bottom:none}
      table.preview tfoot td{font-weight:700;border-top:2px solid var(--border-def);
                              background:var(--navy-50);color:var(--text);padding:7px 9px}

      /* RESULT (step 3) */
      .result-box{border-radius:var(--r);padding:20px 16px;text-align:center}
      .result-box.ok{background:var(--green-bg);border:1px solid #a5d6a7}
      .result-box.err{background:var(--red-bg);border:1px solid #ef9a9a}
      .svg-check{display:block;margin:0 auto 12px}
      .svg-check-circle{stroke-dasharray:166;stroke-dashoffset:166;
                        animation:drawCircle .4s ease forwards}
      .svg-check-tick{stroke-dasharray:48;stroke-dashoffset:48;
                      animation:drawTick .3s .35s ease forwards}
      .result-msg{font-size:13px;line-height:1.6;margin-bottom:16px}
      .ok .result-msg{color:#1b5e20}
      .err .result-msg{color:#b71c1c}
      .result-btns{display:flex;flex-direction:column;gap:7px}
      .result-link{display:flex;align-items:center;gap:7px;padding:10px 14px;border-radius:var(--r-sm);
                   font-weight:700;font-size:12px;font-family:var(--font);text-decoration:none;
                   border:none;cursor:pointer;text-align:left;
                   transition:transform .15s,box-shadow .15s;animation:fadeUp .2s var(--ease) both}
      .result-link:hover{transform:translateY(-1px)}
      .rl-navy{background:var(--navy);color:#fff;box-shadow:0 2px 8px rgba(28,69,208,.2)}
      .rl-navy:hover{box-shadow:0 4px 14px rgba(28,69,208,.35)}
      .rl-ghost{background:transparent;border:1.5px solid var(--border-def);color:var(--text-muted)}
      .rl-ghost:hover{border-color:var(--navy);color:var(--navy);background:var(--navy-50)}

      /* KEYFRAMES */
      @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      @keyframes chipIn{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:scale(1)}}
      @keyframes sweep{0%{transform:translateX(-120%)}100%{transform:translateX(280%)}}
      @keyframes drawCircle{to{stroke-dashoffset:0}}
      @keyframes drawTick{to{stroke-dashoffset:0}}
      @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
      ::-webkit-scrollbar{width:6px;height:6px}
      ::-webkit-scrollbar-track{background:transparent}
      ::-webkit-scrollbar-thumb{background:var(--border-def);border-radius:99px}
      ::-webkit-scrollbar-thumb:hover{background:var(--navy)}
    </style>
    <style id="cdv-v10">
  :root{--font:'Plus Jakarta Sans',system-ui,sans-serif;--mono:'JetBrains Mono',monospace;--ink:#06101E;--brand-amber:#E8A020;--slate-100:#ECF1FA;--sh:0 2px 8px rgba(6,14,30,.08),0 1px 3px rgba(6,14,30,.05);--sh-md:0 6px 22px rgba(6,14,30,.10),0 2px 6px rgba(6,14,30,.06);--ease:cubic-bezier(.4,0,.2,1);--navy:#1C45D0;--navy-800:#1535A5;--navy-d:#142DB8;--teal:#0891B2;--red:#DC2626;--green:#16A34A;--amber:#D97706;--bg:#ECF1FA;--surface:#FFFFFF;--input-bg:#F4F7FE;--border:#DDE6F4;--border-def:#BACADE;--text:#07162A;--text-body:#29394F;--text-muted:#53708C;--text-faint:#8AA3BF;--text-sm:var(--text-muted);--navy-50:#EDF3FF;--r:12px;--r-sm:9px;--green-bg:#EDFCF2;--red-bg:#FFF1F1;--amber-bg:#FFF7E0;--brand-red:#DC2626}
  body.dark{--bg:#060C19;--surface:#0B1522;--input-bg:#060C19;--border:#172740;--border-def:#1D3154;--text:#E6EDF9;--text-body:#95AFCC;--text-muted:#567090;--text-faint:#2E4562;--navy-50:#112036;--green-bg:#022C1A;--red-bg:#2D0A0A;--amber-bg:#1F1100}
    </style>
  </head>
  <body>
  <div id="cdv-nav-webapp" style="display:none;background:#0E1B30;color:#fff;padding:8px 14px;border-radius:6px;font-size:12px;margin-bottom:10px;align-items:center;justify-content:space-between;font-family:Arial,sans-serif"><a href="?page=Index" style="color:#9CC1FF;text-decoration:none;font-weight:bold">🏠 Menu Principal</a><span style="opacity:.6">📦 Devoluções · Transben</span></div>
  <script>
    try{google.script.run.withSuccessHandler(function(_u){if(!_u)return;var n=document.getElementById('cdv-nav-webapp');if(n){n.style.display='flex';var a=n.querySelector('a[href]');if(a)a.href=_u+'?page=Index';}try{google.script.host.close=function(){window.top.location.href=_u+'?page=Index';};}catch(_c){}})._getWebAppExecUrl();}catch(_e){}
  </script>

  <!-- STEPPER -->
  <div class="wz-header">
    <div class="wz-step">
      <div class="wz-circle active" id="wz1">1</div>
      <div class="wz-lbl">Entrada</div>
    </div>
    <div class="wz-line"><div class="wz-line-fill" id="line1"></div></div>
    <div class="wz-step">
      <div class="wz-circle" id="wz2">2</div>
      <div class="wz-lbl">Prévia</div>
    </div>
    <div class="wz-line"><div class="wz-line-fill" id="line2"></div></div>
    <div class="wz-step">
      <div class="wz-circle" id="wz3">3</div>
      <div class="wz-lbl">Resultado</div>
    </div>
  </div>

  <!-- STEPS -->
  <div class="steps-wrap" id="stepsWrap">

    <!-- STEP 1 -->
    <div class="wz-pane active" id="pane1">
      <div class="hdr">
        <div class="hdr-ico">📄</div>
        <div class="hdr-txt">
          <h1>Exportar e Salvar PDF</h1>
          <p>Gera PDF das NFs · muda status para Devolvido</p>
        </div>
      </div>
      <div class="info">
        Informe as NFs com status <strong>Pendente</strong>, separadas por vírgula ou uma por linha.
        Todas devem ser do <strong>mesmo fornecedor</strong>.
      </div>
      <div class="field-lbl">Números das NFs</div>
      <textarea id="nfs" rows="4" placeholder="123456&#10;789012&#10;ou: 123456, 789012" oninput="parseLive()"></textarea>
      <div class="chip-zone" id="chipZone"></div>
      <div class="actions">
        <button class="btn-main" id="btnBuscar" onclick="buscarPrevia()">
          <span class="shim"></span>
          <span class="lbl">🔍 Buscar Prévia</span>
        </button>
        <button class="btn-ghost" onclick="google.script.host.close()">Cancelar</button>
      </div>
    </div>

    <!-- STEP 2 -->
    <div class="wz-pane" id="pane2">
      <p class="preview-hdr" id="prevHdr"></p>
      <div class="tbl-wrap">
        <table class="preview">
          <thead><tr>
            <th style="width:32px">#</th>
            <th>NFD</th><th>NF orig.</th><th>Fornecedor</th>
            <th>Tipo</th><th>Motivo</th>
            <th style="text-align:center">Cxs</th>
            <th style="text-align:right">Valor</th>
            <th>Data</th>
          </tr></thead>
          <tbody id="prevBody"></tbody>
          <tfoot><tr>
            <td colspan="6" style="text-align:right;font-size:11px">TOTAL</td>
            <td style="text-align:center" id="totCxs"></td>
            <td style="text-align:right;font-family:var(--mono)" id="totVal"></td>
            <td></td>
          </tr></tfoot>
        </table>
      </div>
      <div class="actions">
        <button class="btn-main" id="btnConfirmar" onclick="confirmar()">
          <span class="shim"></span>
          <span class="lbl">✓ Confirmar e Processar</span>
        </button>
        <button class="btn-ghost" onclick="goTo(1,false)">← Voltar</button>
      </div>
    </div>

    <!-- STEP 3 -->
    <div class="wz-pane" id="pane3">
      <div class="result-box" id="resBox">
        <svg id="svgOk" class="svg-check" width="52" height="52" viewBox="0 0 52 52" style="display:none">
          <circle class="svg-check-circle" cx="26" cy="26" r="24" fill="none" stroke="var(--green)" stroke-width="2.5"/>
          <path class="svg-check-tick" fill="none" stroke="var(--green)" stroke-width="3"
                stroke-linecap="round" stroke-linejoin="round" d="M14 27l8 8 16-16"/>
        </svg>
        <div class="result-msg" id="resMsg"></div>
        <div class="result-btns" id="resBtns"></div>
      </div>
    </div>

  </div><!-- /steps-wrap -->

  <script>
    var _step    = 1;
    var _preview = [];
    var _nfsRaw  = '';
    var _ck      = '';

    /* ── Stepper ─────────────────────────────────────────── */
    function updateStepper(n) {
      [1,2,3].forEach(function(i) {
        var c = document.getElementById('wz' + i);
        c.classList.remove('active','done');
        if (i < n)      { c.classList.add('done');   c.textContent = '✓'; }
        else if (i===n) { c.classList.add('active');  c.textContent = String(i); }
        else              c.textContent = String(i);
      });
      document.getElementById('line1').style.width = n >= 2 ? '100%' : '0%';
      document.getElementById('line2').style.width = n >= 3 ? '100%' : '0%';
    }

    /* ── Navigation ──────────────────────────────────────── */
    function goTo(n, forward) {
      if (n === _step) return;
      if (forward === undefined) forward = n > _step;
      var wrap    = document.getElementById('stepsWrap');
      var oldPane = document.getElementById('pane' + _step);
      var newPane = document.getElementById('pane' + n);
      var ease    = 'cubic-bezier(.4,0,.2,1)';

      wrap.style.height = wrap.offsetHeight + 'px';

      newPane.style.display    = 'block';
      newPane.style.position   = 'absolute';
      newPane.style.top        = '0';
      newPane.style.left       = '0';
      newPane.style.width      = '100%';
      newPane.style.opacity    = '0';
      newPane.style.transform  = forward ? 'translateX(100%)' : 'translateX(-100%)';
      newPane.style.transition = 'none';
      void newPane.offsetWidth;

      newPane.style.transition = 'transform .3s '+ease+',opacity .3s '+ease;
      oldPane.style.transition = 'transform .3s '+ease+',opacity .3s '+ease;
      newPane.style.transform  = 'translateX(0)';
      newPane.style.opacity    = '1';
      oldPane.style.transform  = forward ? 'translateX(-100%)' : 'translateX(100%)';
      oldPane.style.opacity    = '0';

      _step = n;
      updateStepper(n);

      setTimeout(function() {
        oldPane.style.display    = 'none';
        oldPane.style.transition = oldPane.style.transform = oldPane.style.opacity = '';
        newPane.style.position   = newPane.style.top = newPane.style.left = newPane.style.width = '';
        newPane.style.transition = '';
        newPane.style.display    = '';
        newPane.classList.add('active');
        oldPane.classList.remove('active');
        wrap.style.height = '';
      }, 310);
    }

    /* ── Step 1: chips ───────────────────────────────────── */
    function parseLive() {
      var chips = document.getElementById('nfs').value.split(/[\n,;]+/).map(function(s){ return s.trim(); }).filter(Boolean);
      var k = chips.join('\x1f');
      if (k === _ck) return;
      _ck = k;
      var z = document.getElementById('chipZone');
      z.innerHTML = '';
      if (chips.length) {
        chips.forEach(function(nf) {
          var c = document.createElement('span');
          c.className = 'chip'; c.textContent = nf; z.appendChild(c);
        });
        var cnt = document.createElement('span');
        cnt.className = 'chip-cnt';
        cnt.textContent = chips.length + (chips.length===1?' NF detectada':' NFs detectadas');
        z.appendChild(cnt);
        z.classList.add('open');
      } else {
        z.classList.remove('open');
      }
    }

    /* ── Step 1 → 2 ──────────────────────────────────────── */
    function setBusyBuscar(on) {
      var b = document.getElementById('btnBuscar');
      b.disabled = on; b.classList.toggle('busy', on);
      b.querySelector('.lbl').textContent = on ? '⏳ Buscando dados…' : '🔍 Buscar Prévia';
    }

    function buscarPrevia() {
      var nfs = document.getElementById('nfs').value.trim();
      if (!nfs) return;
      _nfsRaw = nfs;
      setBusyBuscar(true);
      google.script.run
        .withSuccessHandler(function(resp) {
          setBusyBuscar(false);
          var r = JSON.parse(resp);
          if (r.erro) { alert(r.erro); return; }
          _preview = r.itens;
          renderPreview(r.itens);
          goTo(2, true);
        })
        .withFailureHandler(function(e) { setBusyBuscar(false); alert('Erro: ' + e.message); })
        .buscarPreviewNFs(nfs);
    }

    /* ── Step 2: tabela ─────────────────────────────────── */
    function renderPreview(itens) {
      var fmt = function(v){ return 'R$ '+(parseFloat(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); };
      var esc = function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
      var totCxs = 0, totVal = 0;
      var rows = itens.map(function(it, i) {
        totCxs += parseFloat(it.qtd)||0;
        totVal  += parseFloat(it.vlTot)||0;
        return '<tr style="animation-delay:'+Math.min(i*40,400)+'ms">'
          +'<td style="text-align:center;color:var(--text-muted);font-size:11px">'+(i+1)+'</td>'
          +'<td style="font-family:var(--mono);font-weight:700">'+esc(it.nfd||it.nf)+'</td>'
          +'<td style="font-family:var(--mono)">'+(it.nfd&&it.nf&&it.nfd!==it.nf?esc(it.nf):'—')+'</td>'
          +'<td>'+esc(it.forn)+'</td>'
          +'<td>'+esc(it.tipo||'—')+'</td>'
          +'<td>'+esc(it.motivo||'—')+'</td>'
          +'<td style="text-align:center;font-weight:700">'+(parseFloat(it.qtd)||0)+'</td>'
          +'<td style="text-align:right;font-family:var(--mono)">'+fmt(it.vlTot)+'</td>'
          +'<td style="white-space:nowrap">'+esc(it.data)+'</td>'
          +'</tr>';
      }).join('');
      document.getElementById('prevBody').innerHTML = rows;
      document.getElementById('totCxs').textContent = totCxs.toLocaleString('pt-BR');
      document.getElementById('totVal').textContent  = fmt(totVal);
      document.getElementById('prevHdr').innerHTML   =
        '<strong>'+itens.length+' NF(s)</strong> com status Pendente. Confirme para gerar o PDF.';
    }

    /* ── Step 2 → 3 ──────────────────────────────────────── */
    function setBusyConfirmar(on) {
      var b = document.getElementById('btnConfirmar');
      b.disabled = on; b.classList.toggle('busy', on);
      b.querySelector('.lbl').textContent = on ? '⏳ Gerando PDF…' : '✓ Confirmar e Processar';
    }

    function confirmar() {
      setBusyConfirmar(true);
      google.script.run
        .withSuccessHandler(function(resp) {
          setBusyConfirmar(false);
          var r = JSON.parse(resp);
          if (r.sucesso) showOk(r.sucesso, r.urlPdf);
          else           showErr(r.erro);
        })
        .withFailureHandler(function(e) { setBusyConfirmar(false); showErr('Erro: ' + e.message); })
        .executarExportarPDF(_nfsRaw);
    }

    /* ── Step 3: resultado ─────────────────────────────── */
    function showOk(txt, urlPdf) {
      var box = document.getElementById('resBox');
      box.className = 'result-box ok';
      var svg = document.getElementById('svgOk');
      var clone = svg.cloneNode(true);
      clone.style.display = 'block';
      svg.parentNode.replaceChild(clone, svg);
      document.getElementById('resMsg').innerHTML = txt.replace(/\n/g,'<br>');
      var btns = document.getElementById('resBtns');
      btns.innerHTML = '';
      if (urlPdf) {
        var a = document.createElement('a');
        a.className = 'result-link rl-navy';
        a.style.animationDelay = '0ms';
        a.href = urlPdf; a.target = '_blank';
        a.textContent = '📥 Abrir PDF no Drive';
        btns.appendChild(a);
      }
      var btn = document.createElement('button');
      btn.className = 'result-link rl-ghost';
      btn.style.animationDelay = urlPdf ? '80ms' : '0ms';
      btn.textContent = '+ Nova operação';
      btn.onclick = resetForm;
      btns.appendChild(btn);
      goTo(3, true);
    }

    function showErr(txt) {
      var box = document.getElementById('resBox');
      box.className = 'result-box err';
      document.getElementById('svgOk').style.display = 'none';
      document.getElementById('resMsg').innerHTML = '<strong>✕</strong> ' + txt;
      var btns = document.getElementById('resBtns');
      btns.innerHTML = '';
      var btn = document.createElement('button');
      btn.className = 'result-link rl-ghost';
      btn.style.animationDelay = '0ms';
      btn.textContent = '← Tentar novamente';
      btn.onclick = function(){ goTo(2, false); };
      btns.appendChild(btn);
      goTo(3, true);
    }

    function resetForm() {
      document.getElementById('nfs').value = '';
      _ck = ''; _preview = []; _nfsRaw = '';
      document.getElementById('chipZone').innerHTML = '';
      document.getElementById('chipZone').classList.remove('open');
      document.getElementById('prevBody').innerHTML = '';
      goTo(1, false);
      setTimeout(function(){ document.getElementById('nfs').focus(); }, 320);
    }

    document.getElementById('nfs').focus();
    (function(){ try{ if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
  </script>
  </body>
  </html>
  ```

- [ ] **Step 2: Testar manualmente no GAS**

  Abrir o formulário via menu "📄 Exportar PDF" no Sheets.
  - [ ] Step 1: digitar NFs válidas → chips aparecem → clicar "🔍 Buscar Prévia" → tabela aparece no step 2 com slide
  - [ ] Step 2: clicar "← Voltar" → volta ao step 1 com slide reverso, campo preservado
  - [ ] Step 2: clicar "✓ Confirmar e Processar" → step 3 mostra SVG check animado + botão "Abrir PDF"
  - [ ] Step 3: clicar "+ Nova operação" → step 1 limpo
  - [ ] Digitar NF inválida → step 2 mostra erro → "← Tentar novamente" volta ao step 2
  - [ ] Dark mode: ativar nas configurações → reabrir → cores corretas

- [ ] **Step 3: Commit**

  ```bash
  git add "FormExportarPDF.html"
  git commit -m "feat(form): wizard 3 steps com prévia para FormExportarPDF"
  ```

---

### Task 3: FormVenda — Wizard 3 Steps

**Files:**
- Rewrite: `FormVenda.html`

**Interfaces:**
- Consumes: `buscarPreviewNFs(nfsStr)` → `{ itens, naoLocalizadas }` (Task 1)
- Consumes: `executarBaixaVenda(nfsStr)` → `{ sucesso, urlPdf, itens }` (já existente)
- `r.itens` do `executarBaixaVenda` são os dados para `gerarDocVenda()` — `_preview` NÃO é reutilizado aqui

**Diferenças em relação ao FormExportarPDF (Task 2):**
- Cor primária: `--amber` / `#b45309` em vez de `--navy` / `--navy-800`
- `.btn-main`: `background:linear-gradient(135deg,#b45309,var(--amber))`, `box-shadow: rgba(217,119,6,...)`
- `.btn-ghost:hover`: `border-color:var(--amber)`, `color:#b45309`, `background:var(--amber-bg)`
- `.wz-circle.active`: `background:linear-gradient(135deg,#b45309,var(--amber))`, `border-color:var(--amber)`
- `.wz-line-fill`: `background:var(--amber)`
- `table.preview th`: `background:linear-gradient(135deg,#b45309,var(--amber))`
- `table.preview tfoot td`: `background:var(--amber-bg)`
- `::-webkit-scrollbar-thumb:hover`: `background:var(--amber)`
- Step 3 sucesso: adicionar botão "🖨️ Reimprimir Doc. de Carga" se `r.itens.length > 0`
- `btnConfirmar` busy text: "⏳ Processando…" (em vez de "⏳ Gerando PDF…")
- `prevHdr`: "…Confirme para dar baixa como Venda." (em vez de "…gerar o PDF")
- `gerarDocVenda(itens)` — função completa incluída (igual à versão atual do arquivo)

- [ ] **Step 1: Substituir o conteúdo completo de `FormVenda.html`**

  Copiar o HTML completo do FormExportarPDF (Task 2, Step 1) e aplicar as diferenças listadas acima. O resultado final deve ser:

  **CSS — substituir os trechos com cor navy pelo amber equivalente:**
  ```css
  /* btn-main */
  .btn-main{background:linear-gradient(135deg,#b45309,var(--amber));
            box-shadow:0 2px 8px rgba(217,119,6,.28)}
  .btn-main:hover:not(:disabled){box-shadow:0 5px 16px rgba(217,119,6,.38)}

  /* btn-ghost */
  .btn-ghost:hover{border-color:var(--amber);color:#b45309;background:var(--amber-bg)}

  /* stepper */
  .wz-circle.active{background:linear-gradient(135deg,#b45309,var(--amber));
                    border-color:var(--amber);box-shadow:0 2px 8px rgba(217,119,6,.3)}
  .wz-line-fill{background:var(--amber)}

  /* table */
  table.preview th{background:linear-gradient(135deg,#b45309,var(--amber))}
  table.preview tfoot td{background:var(--amber-bg)}

  /* chip */
  .chip{color:#b45309}
  body.dark .chip{color:#FBBF24}

  /* scrollbar */
  ::-webkit-scrollbar-thumb:hover{background:var(--amber)}

  /* result ghost hover */
  .rl-ghost:hover{border-color:var(--amber);color:#b45309;background:var(--amber-bg)}
  ```

  **HTML — header e info banner (dentro do pane1):**
  ```html
  <div class="hdr-ico" style="background:linear-gradient(135deg,#b45309,var(--amber));box-shadow:0 2px 8px rgba(217,119,6,.28)">🛒</div>
  <h1>Baixa para Venda</h1>
  <p>Muda status para Venda · gera relatório e doc. de carga</p>
  ```

  ```html
  <div class="info" style="background:var(--amber-bg);border-left-color:var(--amber)">
    Informe as NFs com status <strong>Pendente</strong> que serão enviadas para venda, separadas por vírgula ou uma por linha.
  </div>
  ```

  **JS — `prevHdr` e `btnConfirmar` busy text:**
  ```js
  // Em renderPreview():
  document.getElementById('prevHdr').innerHTML =
    '<strong>'+itens.length+' NF(s)</strong> com status Pendente. Confirme para dar baixa como Venda.';

  // Em setBusyConfirmar():
  b.querySelector('.lbl').textContent = on ? '⏳ Processando…' : '✓ Confirmar e Processar';
  ```

  **JS — `confirmar()` chama `executarBaixaVenda` e trata `r.itens`:**
  ```js
  function confirmar() {
    setBusyConfirmar(true);
    google.script.run
      .withSuccessHandler(function(resp) {
        setBusyConfirmar(false);
        var r = JSON.parse(resp);
        if (r.sucesso) showOk(r.sucesso, r.urlPdf, r.itens || []);
        else           showErr(r.erro);
      })
      .withFailureHandler(function(e) { setBusyConfirmar(false); showErr('Erro: ' + e.message); })
      .executarBaixaVenda(_nfsRaw);
  }
  ```

  **JS — `showOk` com botão extra de doc. de carga:**
  ```js
  var _itensVenda = [];

  function showOk(txt, urlPdf, itens) {
    _itensVenda = itens || [];
    var box = document.getElementById('resBox');
    box.className = 'result-box ok';
    var svg = document.getElementById('svgOk');
    var clone = svg.cloneNode(true);
    clone.style.display = 'block';
    svg.parentNode.replaceChild(clone, svg);
    document.getElementById('resMsg').innerHTML = txt.replace(/\n/g,'<br>');
    var btns = document.getElementById('resBtns');
    btns.innerHTML = '';
    var delay = 0;
    if (urlPdf) {
      var a = document.createElement('a');
      a.className = 'result-link rl-amber';
      a.style.animationDelay = delay + 'ms'; delay += 80;
      a.href = urlPdf; a.target = '_blank';
      a.textContent = '📥 Abrir Relatório no Drive';
      btns.appendChild(a);
    }
    if (_itensVenda.length) {
      var b2 = document.createElement('button');
      b2.className = 'result-link rl-navy';
      b2.style.animationDelay = delay + 'ms'; delay += 80;
      b2.textContent = '🖨️ Reimprimir Doc. de Carga';
      b2.onclick = function(){ gerarDocVenda(_itensVenda); };
      btns.appendChild(b2);
      gerarDocVenda(_itensVenda);
    }
    var btnNova = document.createElement('button');
    btnNova.className = 'result-link rl-ghost';
    btnNova.style.animationDelay = delay + 'ms';
    btnNova.textContent = '+ Nova operação';
    btnNova.onclick = resetForm;
    btns.appendChild(btnNova);
    goTo(3, true);
  }
  ```

  **Adicionar `.rl-amber` no CSS:**
  ```css
  .rl-amber{background:var(--amber);color:#fff;box-shadow:0 2px 8px rgba(217,119,6,.2)}
  .rl-amber:hover{box-shadow:0 4px 14px rgba(217,119,6,.35)}
  ```

  **JS — `gerarDocVenda(itens)` — manter igual à versão atual:**
  ```js
  function gerarDocVenda(itens) {
    if (!itens || !itens.length) return;
    var logoUrl = 'https://drive.google.com/thumbnail?id=1xzzAzf7cej96m5rxR2Y9vVL1ou4y-hap&sz=w200';
    var now = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    var fmt = function(v){ return 'R$ '+(parseFloat(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); };
    var esc = function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    var totalCxs = itens.reduce(function(s,it){ return s+(parseFloat(it.qtd)||0); }, 0);
    var totalVal = itens.reduce(function(s,it){ return s+(parseFloat(it.vlTot)||0); }, 0);
    var rows = itens.map(function(it,i) {
      return '<tr>'
        +'<td style="text-align:center;color:#6B7280">'+(i+1)+'</td>'
        +'<td style="font-family:monospace;font-weight:700;font-size:13px">'+(it.nfd||it.nf||'')+'</td>'
        +'<td style="font-family:monospace">'+(it.nfd&&it.nf&&it.nfd!==it.nf?it.nf:'—')+'</td>'
        +'<td>'+esc(it.forn)+'</td>'
        +'<td>'+esc(it.tipo||'—')+'</td>'
        +'<td>'+esc(it.motivo||'—')+'</td>'
        +'<td style="text-align:center;font-weight:700">'+(parseFloat(it.qtd)||0)+'</td>'
        +'<td style="text-align:right;font-family:monospace">'+fmt(it.vlTot)+'</td>'
        +'<td style="white-space:nowrap">'+esc(it.data)+'</td>'
        +'</tr>';
    }).join('');
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Documentação de Carga — Venda</title>'
      +'<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;padding:20px}'
      +'.hdr{display:flex;align-items:center;gap:16px;border-bottom:3px solid #25419A;padding-bottom:10px;margin-bottom:14px}'
      +'.hdr img{height:48px;object-fit:contain}.hdr-txt h1{font-size:15px;color:#25419A;margin-bottom:2px;font-weight:700}'
      +'.hdr-txt p{font-size:10px;color:#6B7280}.resumo{display:flex;gap:12px;margin-bottom:14px}'
      +'.res-card{flex:1;border:1px solid #E5E7EB;border-radius:6px;padding:10px 14px;text-align:center}'
      +'.res-card .lbl{font-size:9px;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}'
      +'.res-card .val{font-size:18px;font-weight:700;color:#D97706}'
      +'table{width:100%;border-collapse:collapse;margin-bottom:12px}'
      +'th{background:#D97706;color:#fff;padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em}'
      +'td{padding:5px 8px;border-bottom:1px solid #F3F4F6;vertical-align:middle}'
      +'tr:nth-child(even) td{background:#FFFBEB}.tot-row td{font-weight:700;border-top:2px solid #E5E7EB;background:#FEF3C7}'
      +'.assinatura{display:flex;gap:40px;margin-top:28px;padding-top:16px;border-top:1px solid #E5E7EB}'
      +'.ass-campo{flex:1;text-align:center}.ass-linha{border-top:1px solid #374151;margin-top:32px;padding-top:4px;font-size:10px;color:#6B7280}'
      +'.footer{margin-top:10px;font-size:9px;color:#9CA3AF;text-align:right}@media print{body{padding:8px}}</style></head><body>'
      +'<div class="hdr"><img src="'+logoUrl+'" onerror="this.style.display=\'none\'" alt="Transben">'
      +'<div class="hdr-txt"><h1>🛒 Documentação de Carga — Venda</h1>'
      +'<p>Gerado em '+now+' &nbsp;·&nbsp; '+itens.length+' NFD(s) listada(s)</p></div></div>'
      +'<div class="resumo">'
      +'<div class="res-card"><div class="lbl">Total de NFDs</div><div class="val">'+itens.length+'</div></div>'
      +'<div class="res-card"><div class="lbl">Total de Cxs</div><div class="val">'+totalCxs.toLocaleString('pt-BR')+'</div></div>'
      +'<div class="res-card"><div class="lbl">Valor Total</div><div class="val" style="font-size:13px">'+fmt(totalVal)+'</div></div>'
      +'</div>'
      +'<table><thead><tr><th style="width:32px">#</th><th>NFD</th><th>NF</th><th>Fornecedor</th>'
      +'<th>Tipo</th><th>Motivo</th><th style="text-align:center">Cxs</th>'
      +'<th style="text-align:right">Valor</th><th>Data Entrada</th></tr></thead>'
      +'<tbody>'+rows+'</tbody>'
      +'<tfoot><tr class="tot-row"><td colspan="6" style="text-align:right;font-size:11px">TOTAL</td>'
      +'<td style="text-align:center">'+totalCxs.toLocaleString('pt-BR')+'</td>'
      +'<td style="text-align:right">'+fmt(totalVal)+'</td><td></td></tr></tfoot></table>'
      +'<div class="assinatura">'
      +'<div class="ass-campo"><div class="ass-linha">Conferência / Responsável</div></div>'
      +'<div class="ass-campo"><div class="ass-linha">Transportadora / Motorista</div></div>'
      +'<div class="ass-campo"><div class="ass-linha">Data / Hora da Entrega</div></div></div>'
      +'<div class="footer">Transben · Sistema de Controle de Devoluções · '+now+'</div>'
      +'</body></html>';
    var w = window.open('','_blank','width=1000,height=760');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(function(){ w.focus(); w.print(); }, 900);
  }
  ```

- [ ] **Step 2: Testar manualmente no GAS**

  Abrir via menu "🛒 Baixa para Venda".
  - [ ] Fluxo completo: NFs → prévia (cor âmbar) → confirmar → step 3 com botões Relatório + Doc. de Carga + Nova operação
  - [ ] Doc. de carga abre em nova janela e imprime automaticamente
  - [ ] "← Voltar" no step 2 preserva o campo de NFs
  - [ ] Cor âmbar em todos os elementos (stepper, tabela, botões)

- [ ] **Step 3: Commit**

  ```bash
  git add "FormVenda.html"
  git commit -m "feat(form): wizard 3 steps com prévia para FormVenda"
  ```

---

### Task 4: FormProgramarFrete — Wizard 3 Steps

**Files:**
- Rewrite: `FormProgramarFrete.html`

**Interfaces:**
- Consumes: `buscarNFParaProgramar(termo)` → `{ itens: [{ nf, nfd, forn, desc, data, peso, freteTipo, freteValor, aba, linha }] }` (já existente)
- Consumes: `salvarProgramacaoDevolucao(params)` → `{ ok }` ou `{ erro }` (já existente)

**Diferenças estruturais em relação às Tasks 2-3:**
- Step 1: campo de busca único (texto + botão) — sem textarea/chips
- Step 1 → 2: avanço **automático** ao receber resposta positiva da busca (sem botão intermediário)
- Step 2: card de dados da NF + formulário de frete completo (não tabela)
- Step 3: labels "Buscar" / "Configurar" / "Resultado"
- Cor: navy (igual ao FormExportarPDF)
- Sem `buscarPreviewNFs` — usa `buscarNFParaProgramar` existente

- [ ] **Step 1: Substituir o conteúdo completo de `FormProgramarFrete.html`**

  ```html
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <base target="_top">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:var(--font);font-size:13px;background:var(--bg);color:var(--text);padding:16px;transition:background .22s,color .22s}

      /* STEPPER — idêntico ao FormExportarPDF */
      .wz-header{display:flex;align-items:flex-start;margin-bottom:16px;animation:fadeUp .22s var(--ease) both}
      .wz-step{display:flex;flex-direction:column;align-items:center;flex-shrink:0}
      .wz-circle{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;
                 font-size:11px;font-weight:700;border:1.5px solid var(--border-def);color:var(--text-muted);
                 background:var(--surface);transition:background .3s,border-color .3s,color .3s,box-shadow .3s}
      .wz-circle.active{background:linear-gradient(135deg,var(--navy-800),var(--navy));border-color:var(--navy);
                         color:#fff;box-shadow:0 2px 8px rgba(28,69,208,.3)}
      .wz-circle.done{background:var(--green-bg);border-color:var(--green);color:var(--green)}
      .wz-lbl{font-size:10px;color:var(--text-muted);margin-top:3px;white-space:nowrap}
      .wz-line{flex:1;height:2px;background:var(--border);margin:0 6px;margin-bottom:16px;border-radius:2px;overflow:hidden}
      .wz-line-fill{height:100%;width:0;background:var(--navy);transition:width .35s ease;border-radius:2px}

      /* STEPS CONTAINER */
      .steps-wrap{position:relative;overflow:hidden}
      .wz-pane{display:none}
      .wz-pane.active{display:block}

      /* STEP 1 — busca */
      .hdr{display:flex;align-items:center;gap:11px;background:var(--surface);border:1px solid var(--border);
           border-radius:var(--r);padding:12px 14px;margin-bottom:12px;box-shadow:var(--sh)}
      .hdr-ico{width:38px;height:38px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;
               justify-content:center;font-size:18px;
               background:linear-gradient(135deg,var(--navy-800),var(--navy));box-shadow:0 2px 8px rgba(28,69,208,.28)}
      .hdr-txt h1{font-size:14px;font-weight:800;line-height:1.2}
      .hdr-txt p{font-size:11px;color:var(--text-muted);margin-top:2px}
      .info{background:var(--navy-50);border:1px solid var(--border);border-left:3px solid var(--navy);
            border-radius:var(--r-sm);padding:9px 12px;font-size:11.5px;color:var(--text-body);
            line-height:1.6;margin-bottom:14px}
      .barra{display:flex;gap:8px;margin-bottom:6px}
      .barra input{flex:1;padding:9px 12px;border:1.5px solid var(--border-def);border-radius:var(--r-sm);
                   font-size:13px;font-family:var(--font);background:var(--input-bg);color:var(--text);
                   transition:border-color .15s,box-shadow .15s;outline:none}
      .barra input:focus{border-color:var(--navy);box-shadow:0 0 0 3px rgba(28,69,208,.10);background:var(--surface)}

      /* ACTIONS */
      .btn-main{flex:1;position:relative;overflow:hidden;padding:10px 16px;border:none;cursor:pointer;
                background:linear-gradient(135deg,var(--navy-800),var(--navy));color:#fff;
                border-radius:var(--r-sm);font-size:13px;font-weight:700;font-family:var(--font);
                box-shadow:0 2px 8px rgba(28,69,208,.28);transition:transform .12s,box-shadow .12s}
      .btn-main:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 5px 16px rgba(28,69,208,.38)}
      .btn-main:active:not(:disabled){transform:translateY(0)}
      .btn-main:disabled{opacity:.5;cursor:not-allowed}
      .btn-main .lbl{position:relative;z-index:1}
      .btn-main .shim{position:absolute;inset:0;width:45%;background:rgba(255,255,255,.18);transform:translateX(-120%)}
      .btn-main.busy .shim{animation:sweep 1.3s linear infinite}
      .btn-ghost{padding:10px 14px;border:1.5px solid var(--border-def);background:transparent;
                 color:var(--text-muted);border-radius:var(--r-sm);font-size:13px;font-weight:600;
                 font-family:var(--font);cursor:pointer;transition:border-color .15s,color .15s,background .15s}
      .btn-ghost:hover{border-color:var(--navy);color:var(--navy);background:var(--navy-50)}
      .actions{display:flex;gap:8px;margin-top:14px}

      /* STEP 2 — card NF + form */
      .nf-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);
               padding:12px 14px;margin-bottom:14px;box-shadow:var(--sh);animation:fadeUp .22s var(--ease) both}
      .ci-linha{display:flex;justify-content:space-between;font-size:12px;
                padding:4px 0;color:var(--text-body);border-bottom:1px solid var(--border)}
      .ci-linha:last-of-type{border-bottom:none}
      .ci-linha b{color:var(--text);font-weight:600}
      .ci-aviso{background:var(--amber-bg);color:#92400E;border-radius:var(--r-sm);
                padding:7px 10px;font-size:11px;margin-top:8px;border:1px solid #FCD34D;display:none}
      .secao{background:var(--navy-50);border-left:3px solid var(--navy);padding:7px 10px;
             border-radius:0 var(--r-sm) var(--r-sm) 0;margin:14px 0 10px;font-size:11px;
             font-weight:700;color:var(--navy);letter-spacing:.3px}
      .frete-opcoes{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
      .frete-radio{display:flex;align-items:flex-start;gap:8px;background:var(--surface);
                   border:1.5px solid var(--border-def);border-radius:var(--r-sm);
                   padding:9px 12px;cursor:pointer;transition:border-color .15s,background .15s}
      .frete-radio:hover{border-color:var(--navy);background:var(--navy-50)}
      .frete-radio.sel{border-color:var(--navy);background:var(--navy-50);box-shadow:0 0 0 2px rgba(28,69,208,.1)}
      .frete-radio input[type=radio]{margin-top:2px;accent-color:var(--navy);cursor:pointer}
      .frete-radio .txt strong{display:block;font-size:12px;color:var(--navy)}
      .frete-radio .txt span{font-size:11px;color:var(--text-muted)}
      .campo{margin-bottom:10px}
      .campo label{display:block;font-weight:700;color:var(--text-muted);font-size:11px;
                   text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
      .obrig{color:var(--brand-red)}
      .campo input[type=text],.campo input[type=date]{width:100%;padding:9px 12px;
        border:1.5px solid var(--border-def);border-radius:var(--r-sm);font-size:13px;
        font-family:var(--font);background:var(--input-bg);color:var(--text);
        transition:border-color .15s,box-shadow .15s;outline:none}
      .campo input:focus{border-color:var(--navy);box-shadow:0 0 0 3px rgba(28,69,208,.10);background:var(--surface)}
      .campo small{font-size:11px;color:var(--text-muted);margin-top:3px;display:block}
      #campoValor{display:none}

      /* STEP 3 — resultado */
      .result-box{border-radius:var(--r);padding:20px 16px;text-align:center}
      .result-box.ok{background:var(--green-bg);border:1px solid #a5d6a7}
      .result-box.err{background:var(--red-bg);border:1px solid #ef9a9a}
      .svg-check{display:block;margin:0 auto 12px}
      .svg-check-circle{stroke-dasharray:166;stroke-dashoffset:166;animation:drawCircle .4s ease forwards}
      .svg-check-tick{stroke-dasharray:48;stroke-dashoffset:48;animation:drawTick .3s .35s ease forwards}
      .result-msg{font-size:13px;line-height:1.6;margin-bottom:16px}
      .ok .result-msg{color:#1b5e20}
      .err .result-msg{color:#b71c1c}
      .result-btns{display:flex;flex-direction:column;gap:7px}
      .result-link{display:flex;align-items:center;gap:7px;padding:10px 14px;border-radius:var(--r-sm);
                   font-weight:700;font-size:12px;font-family:var(--font);text-decoration:none;
                   border:none;cursor:pointer;text-align:left;
                   transition:transform .15s,box-shadow .15s;animation:fadeUp .2s var(--ease) both}
      .result-link:hover{transform:translateY(-1px)}
      .rl-ghost{background:transparent;border:1.5px solid var(--border-def);color:var(--text-muted)}
      .rl-ghost:hover{border-color:var(--navy);color:var(--navy);background:var(--navy-50)}

      /* KEYFRAMES */
      @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      @keyframes sweep{0%{transform:translateX(-120%)}100%{transform:translateX(280%)}}
      @keyframes drawCircle{to{stroke-dashoffset:0}}
      @keyframes drawTick{to{stroke-dashoffset:0}}
      @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
      ::-webkit-scrollbar{width:6px;height:6px}
      ::-webkit-scrollbar-track{background:transparent}
      ::-webkit-scrollbar-thumb{background:var(--border-def);border-radius:99px}
      ::-webkit-scrollbar-thumb:hover{background:var(--navy)}
    </style>
    <style id="cdv-v10">
  :root{--font:'Plus Jakarta Sans',system-ui,sans-serif;--mono:'JetBrains Mono',monospace;--ink:#06101E;--brand-amber:#E8A020;--slate-100:#ECF1FA;--sh:0 2px 8px rgba(6,14,30,.08),0 1px 3px rgba(6,14,30,.05);--sh-md:0 6px 22px rgba(6,14,30,.10),0 2px 6px rgba(6,14,30,.06);--ease:cubic-bezier(.4,0,.2,1);--navy:#1C45D0;--navy-800:#1535A5;--navy-d:#142DB8;--teal:#0891B2;--red:#DC2626;--green:#16A34A;--amber:#D97706;--bg:#ECF1FA;--surface:#FFFFFF;--input-bg:#F4F7FE;--border:#DDE6F4;--border-def:#BACADE;--text:#07162A;--text-body:#29394F;--text-muted:#53708C;--text-faint:#8AA3BF;--text-sm:var(--text-muted);--navy-50:#EDF3FF;--r:12px;--r-sm:9px;--green-bg:#EDFCF2;--red-bg:#FFF1F1;--amber-bg:#FFF7E0;--brand-red:#DC2626}
  body.dark{--bg:#060C19;--surface:#0B1522;--input-bg:#060C19;--border:#172740;--border-def:#1D3154;--text:#E6EDF9;--text-body:#95AFCC;--text-muted:#567090;--text-faint:#2E4562;--navy-50:#112036;--green-bg:#022C1A;--red-bg:#2D0A0A;--amber-bg:#1F1100}
    </style>
  </head>
  <body>
  <div id="cdv-nav-webapp" style="display:none;background:#0E1B30;color:#fff;padding:8px 14px;border-radius:6px;font-size:12px;margin-bottom:10px;align-items:center;justify-content:space-between;font-family:Arial,sans-serif"><a href="?page=Index" style="color:#9CC1FF;text-decoration:none;font-weight:bold">🏠 Menu Principal</a><span style="opacity:.6">📦 Devoluções · Transben</span></div>
  <script>
    try{google.script.run.withSuccessHandler(function(_u){if(!_u)return;var n=document.getElementById('cdv-nav-webapp');if(n){n.style.display='flex';var a=n.querySelector('a[href]');if(a)a.href=_u+'?page=Index';}try{google.script.host.close=function(){window.top.location.href=_u+'?page=Index';};}catch(_c){}})._getWebAppExecUrl();}catch(_e){}
  </script>

  <!-- STEPPER -->
  <div class="wz-header">
    <div class="wz-step">
      <div class="wz-circle active" id="wz1">1</div>
      <div class="wz-lbl">Buscar</div>
    </div>
    <div class="wz-line"><div class="wz-line-fill" id="line1"></div></div>
    <div class="wz-step">
      <div class="wz-circle" id="wz2">2</div>
      <div class="wz-lbl">Configurar</div>
    </div>
    <div class="wz-line"><div class="wz-line-fill" id="line2"></div></div>
    <div class="wz-step">
      <div class="wz-circle" id="wz3">3</div>
      <div class="wz-lbl">Resultado</div>
    </div>
  </div>

  <!-- STEPS -->
  <div class="steps-wrap" id="stepsWrap">

    <!-- STEP 1 -->
    <div class="wz-pane active" id="pane1">
      <div class="hdr">
        <div class="hdr-ico">🚚</div>
        <div class="hdr-txt">
          <h1>Programar Devolução</h1>
          <p>Define frete e agenda antes da baixa final</p>
        </div>
      </div>
      <div class="info">
        Busque a NF ou NFD <strong>Pendente</strong> e defina o frete antes da baixa final.
        Tipo <strong>Tabela</strong> é calculado pelo TMS/CTe.
      </div>
      <div class="barra">
        <input type="text" id="termo" placeholder="Nº NF ou NFD"
               onkeydown="if(event.key==='Enter')buscar()">
        <button class="btn-main" id="btnBuscar" onclick="buscar()" style="flex:0 0 auto;padding:10px 16px">
          <span class="shim"></span>
          <span class="lbl">🔍 Buscar</span>
        </button>
      </div>
      <div class="actions" style="margin-top:8px">
        <button class="btn-ghost" onclick="google.script.host.close()" style="flex:1">✖ Fechar</button>
      </div>
    </div>

    <!-- STEP 2 -->
    <div class="wz-pane" id="pane2">
      <!-- Card NF -->
      <div class="nf-card">
        <div class="ci-linha"><span>NF / NFD</span><b id="ciNf"></b></div>
        <div class="ci-linha"><span>Fornecedor</span><b id="ciForn"></b></div>
        <div class="ci-linha"><span>Descrição</span><b id="ciDesc"></b></div>
        <div class="ci-linha"><span>Data de entrada</span><b id="ciData"></b></div>
        <div class="ci-linha"><span>Peso</span><b id="ciPeso"></b></div>
        <div class="ci-aviso" id="ciAviso"></div>
      </div>

      <!-- Tipo de frete -->
      <div class="secao">🚚 TIPO DE FRETE</div>
      <div class="frete-opcoes">
        <label class="frete-radio" data-tipo="Tabela">
          <input type="radio" name="frete" value="Tabela" onchange="onFreteChange()">
          <span class="txt"><strong>Tabela</strong><span>Calculado pelo TMS/CTe — sem valor manual</span></span>
        </label>
        <label class="frete-radio" data-tipo="Valor + ICMS">
          <input type="radio" name="frete" value="Valor + ICMS" onchange="onFreteChange()">
          <span class="txt"><strong>Valor + ICMS</strong><span>Valor já com ICMS incluso</span></span>
        </label>
        <label class="frete-radio" data-tipo="Valor">
          <input type="radio" name="frete" value="Valor" onchange="onFreteChange()">
          <span class="txt"><strong>Valor</strong><span>Valor sem ICMS</span></span>
        </label>
        <label class="frete-radio" data-tipo="Cortesia">
          <input type="radio" name="frete" value="Cortesia" onchange="onFreteChange()">
          <span class="txt"><strong>Cortesia</strong><span>Sem custo de frete (R$ 0,00)</span></span>
        </label>
      </div>

      <div class="campo" id="campoValor">
        <label>Valor do Frete (R$) <span class="obrig">*</span></label>
        <input type="text" id="freteValor" placeholder="0,00">
      </div>
      <div class="campo">
        <label>📅 Data de Agendamento <span style="color:var(--text-muted);font-weight:normal">(opcional)</span></label>
        <input type="date" id="dataAgend">
        <small>Data prevista para a transportadora retirar a mercadoria</small>
      </div>
      <div class="campo">
        <label>Nº do Pedido <span class="obrig">*</span></label>
        <input type="text" id="numPedido" placeholder="Número do pedido de transporte">
      </div>
      <div class="campo">
        <label>Observações <span style="color:var(--text-muted);font-weight:normal">(opcional)</span></label>
        <input type="text" id="obsField" placeholder="Instruções ou observações">
      </div>

      <div class="actions">
        <button class="btn-main" id="btnSalvar" onclick="salvar()">
          <span class="shim"></span>
          <span class="lbl">💾 Salvar Programação</span>
        </button>
        <button class="btn-ghost" onclick="voltarBusca()">← Voltar</button>
      </div>
    </div>

    <!-- STEP 3 -->
    <div class="wz-pane" id="pane3">
      <div class="result-box" id="resBox">
        <svg id="svgOk" class="svg-check" width="52" height="52" viewBox="0 0 52 52" style="display:none">
          <circle class="svg-check-circle" cx="26" cy="26" r="24" fill="none" stroke="var(--green)" stroke-width="2.5"/>
          <path class="svg-check-tick" fill="none" stroke="var(--green)" stroke-width="3"
                stroke-linecap="round" stroke-linejoin="round" d="M14 27l8 8 16-16"/>
        </svg>
        <div class="result-msg" id="resMsg"></div>
        <div class="result-btns" id="resBtns"></div>
      </div>
    </div>

  </div><!-- /steps-wrap -->

  <script>
    var _step    = 1;
    var _item    = null;

    /* ── Stepper ─────────────────────────────────────────── */
    function updateStepper(n) {
      [1,2,3].forEach(function(i) {
        var c = document.getElementById('wz' + i);
        c.classList.remove('active','done');
        if (i < n)      { c.classList.add('done');  c.textContent = '✓'; }
        else if (i===n) { c.classList.add('active'); c.textContent = String(i); }
        else              c.textContent = String(i);
      });
      document.getElementById('line1').style.width = n >= 2 ? '100%' : '0%';
      document.getElementById('line2').style.width = n >= 3 ? '100%' : '0%';
    }

    /* ── Navigation ──────────────────────────────────────── */
    function goTo(n, forward) {
      if (n === _step) return;
      if (forward === undefined) forward = n > _step;
      var wrap    = document.getElementById('stepsWrap');
      var oldPane = document.getElementById('pane' + _step);
      var newPane = document.getElementById('pane' + n);
      var ease    = 'cubic-bezier(.4,0,.2,1)';

      wrap.style.height = wrap.offsetHeight + 'px';
      newPane.style.display    = 'block';
      newPane.style.position   = 'absolute';
      newPane.style.top        = '0';
      newPane.style.left       = '0';
      newPane.style.width      = '100%';
      newPane.style.opacity    = '0';
      newPane.style.transform  = forward ? 'translateX(100%)' : 'translateX(-100%)';
      newPane.style.transition = 'none';
      void newPane.offsetWidth;

      newPane.style.transition = 'transform .3s '+ease+',opacity .3s '+ease;
      oldPane.style.transition = 'transform .3s '+ease+',opacity .3s '+ease;
      newPane.style.transform  = 'translateX(0)';
      newPane.style.opacity    = '1';
      oldPane.style.transform  = forward ? 'translateX(-100%)' : 'translateX(100%)';
      oldPane.style.opacity    = '0';

      _step = n;
      updateStepper(n);

      setTimeout(function() {
        oldPane.style.display    = 'none';
        oldPane.style.transition = oldPane.style.transform = oldPane.style.opacity = '';
        newPane.style.position   = newPane.style.top = newPane.style.left = newPane.style.width = '';
        newPane.style.transition = '';
        newPane.style.display    = '';
        newPane.classList.add('active');
        oldPane.classList.remove('active');
        wrap.style.height = '';
      }, 310);
    }

    /* ── Step 1: buscar ──────────────────────────────────── */
    function setBusyBuscar(on) {
      var b = document.getElementById('btnBuscar');
      b.disabled = on; b.classList.toggle('busy', on);
      b.querySelector('.lbl').textContent = on ? '⏳ Buscando…' : '🔍 Buscar';
      document.getElementById('termo').disabled = on;
    }

    function buscar() {
      var termo = document.getElementById('termo').value.trim();
      if (!termo) return;
      setBusyBuscar(true);
      google.script.run
        .withSuccessHandler(function(resp) {
          setBusyBuscar(false);
          var r = JSON.parse(resp);
          if (r.erro) { alert(r.erro); return; }
          preencherStep2(r.itens[0]);
          goTo(2, true);
        })
        .withFailureHandler(function(e) { setBusyBuscar(false); alert('Erro: ' + e.message); })
        .buscarNFParaProgramar(termo);
    }

    /* ── Step 2: preencher card ──────────────────────────── */
    function preencherStep2(it) {
      _item = it;
      document.getElementById('ciNf').textContent   = (it.nfd ? it.nfd + ' / ' : '') + it.nf;
      document.getElementById('ciForn').textContent  = it.forn;
      document.getElementById('ciDesc').textContent  = it.desc;
      document.getElementById('ciData').textContent  = it.data;
      document.getElementById('ciPeso').textContent  = it.peso ? (String(it.peso).replace('.',',') + ' kg') : 'Não informado';

      var aviso = document.getElementById('ciAviso');
      if (it.freteTipo) {
        aviso.style.display = 'block';
        aviso.textContent = '⚠️ Já programado como "' + it.freteTipo + '"' +
          (it.freteValor ? ' — R$ ' + Number(it.freteValor).toFixed(2).replace('.',',') : '') +
          '. Salvar irá substituir.';
      } else {
        aviso.style.display = 'none';
      }

      document.querySelectorAll('input[name=frete]').forEach(function(r){ r.checked = false; });
      document.querySelectorAll('.frete-radio').forEach(function(l){ l.classList.remove('sel'); });
      document.getElementById('campoValor').style.display = 'none';
      document.getElementById('freteValor').value  = '';
      document.getElementById('numPedido').value   = '';
      document.getElementById('obsField').value    = '';
      document.getElementById('dataAgend').value   = '';
    }

    function onFreteChange() {
      var tipo = document.querySelector('input[name=frete]:checked');
      document.querySelectorAll('.frete-radio').forEach(function(l){ l.classList.remove('sel'); });
      if (!tipo) return;
      document.querySelector('.frete-radio[data-tipo="'+tipo.value+'"]').classList.add('sel');
      var precisaValor = tipo.value === 'Valor + ICMS' || tipo.value === 'Valor';
      document.getElementById('campoValor').style.display = precisaValor ? 'block' : 'none';
    }

    function voltarBusca() {
      document.getElementById('termo').value = '';
      _item = null;
      goTo(1, false);
      setTimeout(function(){ document.getElementById('termo').focus(); }, 320);
    }

    /* ── Step 2 → 3: salvar ──────────────────────────────── */
    function setBusySalvar(on) {
      var b = document.getElementById('btnSalvar');
      b.disabled = on; b.classList.toggle('busy', on);
      b.querySelector('.lbl').textContent = on ? '⏳ Salvando…' : '💾 Salvar Programação';
    }

    function salvar() {
      if (!_item) return;
      var tipoEl = document.querySelector('input[name=frete]:checked');
      if (!tipoEl) { alert('Selecione o tipo de frete.'); return; }
      var tipo  = tipoEl.value;
      var valor = document.getElementById('freteValor').value.trim().replace(',','.');
      var pedido = document.getElementById('numPedido').value.trim();
      if (!pedido) { alert('Informe o número do pedido.'); return; }
      if ((tipo==='Valor + ICMS'||tipo==='Valor') && (!valor||isNaN(+valor)||+valor<0)) {
        alert('Informe um valor de frete válido.'); return;
      }
      setBusySalvar(true);
      google.script.run
        .withSuccessHandler(function(resp) {
          setBusySalvar(false);
          var r = JSON.parse(resp);
          if (r.ok) showOk(r.ok);
          else      showErr(r.erro || 'Erro ao salvar.');
        })
        .withFailureHandler(function(e){ setBusySalvar(false); showErr('Erro: '+e.message); })
        .salvarProgramacaoDevolucao({
          aba:             _item.aba,
          linha:           _item.linha,
          freteTipo:       tipo,
          freteValor:      valor,
          numeroPedido:    pedido,
          dataAgendamento: document.getElementById('dataAgend').value,
          obs:             document.getElementById('obsField').value.trim(),
          forn:            _item.forn,
          dataNF:          _item.data
        });
    }

    /* ── Step 3: resultado ─────────────────────────────── */
    function showOk(txt) {
      var box = document.getElementById('resBox');
      box.className = 'result-box ok';
      var svg = document.getElementById('svgOk');
      var clone = svg.cloneNode(true);
      clone.style.display = 'block';
      svg.parentNode.replaceChild(clone, svg);
      document.getElementById('resMsg').innerHTML = txt.replace(/\n/g,'<br>');
      var btns = document.getElementById('resBtns');
      btns.innerHTML = '';
      var btn = document.createElement('button');
      btn.className = 'result-link rl-ghost';
      btn.style.animationDelay = '0ms';
      btn.textContent = '+ Nova programação';
      btn.onclick = function() {
        document.getElementById('termo').value = '';
        _item = null;
        goTo(1, false);
        setTimeout(function(){ document.getElementById('termo').focus(); }, 320);
      };
      btns.appendChild(btn);
      goTo(3, true);
    }

    function showErr(txt) {
      var box = document.getElementById('resBox');
      box.className = 'result-box err';
      document.getElementById('svgOk').style.display = 'none';
      document.getElementById('resMsg').innerHTML = '<strong>✕</strong> ' + txt;
      var btns = document.getElementById('resBtns');
      btns.innerHTML = '';
      var btn = document.createElement('button');
      btn.className = 'result-link rl-ghost';
      btn.style.animationDelay = '0ms';
      btn.textContent = '← Tentar novamente';
      btn.onclick = function(){ goTo(2, false); };
      btns.appendChild(btn);
      goTo(3, true);
    }

    document.getElementById('termo').focus();
    (function(){ try{ if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
  </script>
  </body>
  </html>
  ```

- [ ] **Step 2: Testar manualmente no GAS**

  Abrir via menu "🚚 Programar Frete da Devolução".
  - [ ] Step 1: digitar NF válida + Enter ou botão → step 2 aparece com slide automático
  - [ ] Step 2: card mostra dados da NF corretamente; aviso amarelo aparece se já programado
  - [ ] Step 2: selecionar "Valor" → campo de valor aparece; selecionar "Tabela" → campo some
  - [ ] Step 2: preencher pedido + salvar → step 3 com SVG check animado
  - [ ] Step 3: "+ Nova programação" → step 1 limpo com foco no campo
  - [ ] "← Voltar" no step 2 → step 1 limpo (campo termo zerado)
  - [ ] Erro no salvar → step 3 erro → "← Tentar novamente" volta ao step 2

- [ ] **Step 3: Commit**

  ```bash
  git add "FormProgramarFrete.html"
  git commit -m "feat(form): wizard 3 steps para FormProgramarFrete"
  ```

---

## Self-Review

**Spec coverage:**
- ✅ `buscarPreviewNFs` GAS → Task 1
- ✅ FormExportarPDF wizard 3 steps → Task 2
- ✅ FormVenda wizard 3 steps + doc. de carga + cor âmbar → Task 3
- ✅ FormProgramarFrete wizard 3 steps com avanço automático → Task 4
- ✅ Stepper com linha de progresso animada → todas as tasks
- ✅ Slide horizontal `translateX` 300ms → `goTo()` idêntico em todas as tasks
- ✅ SVG circle-check animado com `stroke-dashoffset` → step 3 de todas as tasks
- ✅ `fadeUp` escalonado nas linhas da tabela → `animation-delay: i*40ms` no Task 2-3
- ✅ `fadeUp` escalonado nos botões do step 3 → `animationDelay` por botão
- ✅ Dark mode → variáveis CSS, sem change adicional
- ✅ `@media(prefers-reduced-motion)` → já no CSS base (copiado)
- ✅ Botão "Voltar" no step 2 preserva campo → `goTo(1,false)` sem limpar textarea
- ✅ Erro no step 3 → volta ao step 2 (prévia válida) → `goTo(2,false)`
- ✅ `_preview` reutilizado no FormVenda para `gerarDocVenda` → `r.itens` de `executarBaixaVenda`
- ✅ Sem mudança de assinatura nas funções GAS existentes

**Placeholders:** nenhum TBD ou TODO encontrado.

**Type consistency:**
- `buscarPreviewNFs` retorna `{ itens: [{nfd,nf,forn,tipo,motivo,qtd,vlTot,data}] }` — usados em `renderPreview()` com os mesmos nomes ✅
- `executarBaixaVenda` retorna `{ sucesso, urlPdf, itens }` — `r.itens` passado para `showOk` e `gerarDocVenda` ✅
- `salvarProgramacaoDevolucao` recebe `{aba,linha,freteTipo,freteValor,numeroPedido,dataAgendamento,obs,forn,dataNF}` — todos preenchidos no `salvar()` do Task 4 ✅
