# FormReabertura Wizard 3 Steps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar FormReabertura.html com wizard de 3 steps (Entrada → Prévia → Resultado) idêntico ao padrão do FormVenda/FormProgramarFrete, tema navy, reaproveitando os backends existentes.

**Architecture:** Substituição completa do HTML/CSS/JS de FormReabertura.html. A lógica de negócio (chamadas backend `buscarNFsConcluidas` + `executarReaberturaPorItens`) é mantida intacta; apenas o shell visual é redesenhado para o padrão wizard. A animação de transição entre steps usa `position:absolute` + `translateX` + `setTimeout(310ms)` — exatamente como em FormVenda.html.

**Tech Stack:** HTML/CSS/JS vanilla, Google Apps Script frontend (`google.script.run`), design system via CSS vars (`var(--navy)`, `var(--surface)`, etc.), dark mode via `localStorage`.

## Global Constraints

- GAS: sem `Array.from()`, sem `NodeList.forEach()` — usar for loops ou `Array.prototype.slice.call()`
- CSS: usar variáveis do design system; não hardcodar cores exceto onde o FormVenda já hardcoda (ex: `rgba(28,69,208,.3)` para sombra navy)
- Cor tema: navy (`var(--navy)`, `var(--navy-800)`) — NÃO amber
- `.wz-circle.active` = `linear-gradient(135deg,var(--navy-800),var(--navy))`
- `.wz-line-fill` = `background:var(--navy)`
- Step 1 label: "Entrada", Step 2: "Prévia", Step 3: "Resultado"
- Backends preservados exatamente: `buscarNFsConcluidas(nfs)` e `executarReaberturaPorItens(itensEncontrados, motivo)`
- Banner `#cdv-nav-webapp` e script de webapp URL: preservados sem alteração
- Block `<style id="cdv-v10">`: preservado sem alteração
- Dark mode IIFE: `(function(){ try { if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();` — preservado
- Resposta do backend `buscarNFsConcluidas`: `JSON.parse(resp)` → `{ itens: [{nf, aba, desc, status, linha}], erro?, naoLocalizadas? }`
- Resposta do backend `executarReaberturaPorItens`: `JSON.parse(resp)` → `{ sucesso?, erro? }`

---

### Task 1: Reescrever FormReabertura.html como wizard 3 steps

**Files:**
- Modify: `FormReabertura.html` (substituição completa)

**Interfaces:**
- Consumes: `buscarNFsConcluidas(nfs: string)` → JSON string com `{itens:[{nf,aba,desc,status,linha}], naoLocalizadas?[], erro?}`
- Consumes: `executarReaberturaPorItens(itens: array, motivo: string)` → JSON string com `{sucesso?, erro?}`
- Produces: UI wizard 3 steps para o usuário

- [ ] **Step 1: Verificar conteúdo atual do arquivo**

Ler `FormReabertura.html`. Confirmar que as linhas 138–161 contêm a chamada a `.buscarNFsConcluidas(nfs)` e linhas 164–190 contêm `.executarReaberturaPorItens(itensEncontrados, ...)`. Isso confirma as assinaturas de backend antes de sobrescrever.

- [ ] **Step 2: Substituir FormReabertura.html pelo conteúdo wizard completo**

Substituir o arquivo inteiro pelo conteúdo abaixo:

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

    /* HEADER CARD */
    .hdr{display:flex;align-items:center;gap:11px;background:var(--surface);border:1px solid var(--border);
         border-radius:var(--r);padding:12px 14px;margin-bottom:12px;box-shadow:var(--sh)}
    .hdr-ico{width:38px;height:38px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;
             justify-content:center;font-size:18px;
             background:linear-gradient(135deg,var(--navy-800),var(--navy));box-shadow:0 2px 8px rgba(28,69,208,.28)}
    .hdr-txt h1{font-size:14px;font-weight:800;line-height:1.2}
    .hdr-txt p{font-size:11px;color:var(--text-muted);margin-top:2px}

    /* INFO BANNER */
    .info{background:var(--navy-50);border:1px solid var(--border);border-left:3px solid var(--navy);
          border-radius:var(--r-sm);padding:9px 12px;font-size:11.5px;color:var(--text-body);
          line-height:1.6;margin-bottom:14px}

    /* FIELD */
    .field-lbl{font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;
               letter-spacing:.06em;margin-bottom:6px}
    .field-wrap{margin-bottom:12px}
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

    /* PREVIEW WARN */
    .prev-warn{background:var(--amber-bg);border:1px solid var(--amber);border-radius:var(--r-sm);
               padding:8px 12px;font-size:12px;color:var(--amber);margin-bottom:8px}

    /* PREVIEW TABLE */
    .preview-hdr{font-size:12px;color:var(--text-muted);margin-bottom:10px}
    .preview-hdr strong{color:var(--text)}
    .tbl-wrap{overflow-x:auto;border-radius:var(--r-sm);box-shadow:var(--sh);margin-bottom:12px}
    table.preview{width:100%;border-collapse:collapse;font-size:12px}
    table.preview th{background:linear-gradient(135deg,var(--navy-800),var(--navy));color:#fff;
                     padding:8px 9px;text-align:left;font-size:10px;text-transform:uppercase;
                     letter-spacing:.04em;white-space:nowrap}
    table.preview td{padding:6px 9px;border-bottom:1px solid var(--border);
                     vertical-align:middle;color:var(--text-body)}
    table.preview tbody tr{animation:fadeUp .2s var(--ease) both}
    table.preview tbody tr:last-child td{border-bottom:none}

    /* BADGES */
    .badge{display:inline-block;padding:2px 7px;border-radius:99px;font-size:11px;font-weight:700}
    .badge-dev  {background:#E8F5E9;color:#2E7D32}
    .badge-venda{background:#FFF7ED;color:#D97706}
    .badge-pend {background:var(--navy-50);color:var(--navy)}

    /* RESULT */
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
      <div class="hdr-ico">🔓</div>
      <div class="hdr-txt">
        <h1>Reabrir Devoluções em Lote</h1>
        <p>Retorne NFs concluídas para o status Pendente</p>
      </div>
    </div>
    <div class="info">
      Informe as NFs com status <strong>Devolvido</strong> ou <strong>Venda</strong> que devem retornar ao status Pendente, separadas por vírgula ou uma por linha.
    </div>
    <div class="field-wrap">
      <div class="field-lbl">Números das NFs</div>
      <textarea id="nfs" rows="4" placeholder="123456&#10;789012&#10;ou: 123456, 789012" oninput="parseLive()"></textarea>
      <div class="chip-zone" id="chipZone"></div>
    </div>
    <div class="field-wrap">
      <div class="field-lbl">Motivo da reabertura <span style="text-transform:none;letter-spacing:0;font-weight:400;font-size:10px">(opcional)</span></div>
      <textarea id="motivo" rows="2" placeholder="Ex: Cliente retornou mercadoria, erro de lançamento…"></textarea>
    </div>
    <div class="actions">
      <button class="btn-main" id="btnBuscar" onclick="buscarPrevia()">
        <span class="shim"></span>
        <span class="lbl">🔍 Buscar Prévia</span>
      </button>
      <button class="btn-ghost" onclick="google.script.host.close()">✖ Cancelar</button>
    </div>
  </div>

  <!-- STEP 2 -->
  <div class="wz-pane" id="pane2">
    <div class="prev-warn" id="prevWarn" style="display:none"></div>
    <p class="preview-hdr" id="prevHdr"></p>
    <div class="tbl-wrap">
      <table class="preview">
        <thead><tr>
          <th style="width:32px">#</th>
          <th>NF</th><th>Aba</th><th>Descrição</th><th>Status atual</th>
        </tr></thead>
        <tbody id="prevBody"></tbody>
      </table>
    </div>
    <div class="actions">
      <button class="btn-main" id="btnConfirmar" onclick="confirmar()">
        <span class="shim"></span>
        <span class="lbl">🔓 Confirmar Reabertura</span>
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
  var _step = 1;
  var _ck   = '';
  var itensEncontrados = [];

  /* ── Stepper ─────────────────────────────────────────── */
  function updateStepper(n) {
    [1,2,3].forEach(function(i) {
      var c = document.getElementById('wz' + i);
      c.classList.remove('active','done');
      if (i < n)       { c.classList.add('done');   c.textContent = '✓'; }
      else if (i === n){ c.classList.add('active');  c.textContent = String(i); }
      else               c.textContent = String(i);
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
      cnt.textContent = chips.length + (chips.length === 1 ? ' NF detectada' : ' NFs detectadas');
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
    b.querySelector('.lbl').textContent = on ? '⏳ Buscando…' : '🔍 Buscar Prévia';
  }

  function buscarPrevia() {
    var nfs = document.getElementById('nfs').value.trim();
    if (!nfs) return;
    setBusyBuscar(true);
    google.script.run
      .withSuccessHandler(function(resp) {
        setBusyBuscar(false);
        var r = JSON.parse(resp);
        if (r.erro) { alert(r.erro); return; }
        itensEncontrados = r.itens;
        renderPreview(r.itens);
        var w = document.getElementById('prevWarn');
        if (r.naoLocalizadas && r.naoLocalizadas.length > 0) {
          w.textContent = '⚠ Não localizadas (não encontradas ou já Pendente): ' + r.naoLocalizadas.join(', ');
          w.style.display = 'block';
        } else {
          w.style.display = 'none';
        }
        goTo(2, true);
      })
      .withFailureHandler(function(e) { setBusyBuscar(false); alert('Erro: ' + e.message); })
      .buscarNFsConcluidas(nfs);
  }

  /* ── Step 2: tabela ─────────────────────────────────── */
  function renderPreview(itens) {
    var esc = function(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    var rows = itens.map(function(it, i) {
      var badge = it.status === 'Devolvido'
        ? '<span class="badge badge-dev">Devolvido</span>'
        : it.status === 'Venda'
          ? '<span class="badge badge-venda">Venda</span>'
          : '<span class="badge badge-pend">Pendente</span>';
      return '<tr style="animation-delay:'+Math.min(i*40,400)+'ms">'
        +'<td style="text-align:center;color:var(--text-muted);font-size:11px">'+(i+1)+'</td>'
        +'<td style="font-family:var(--mono);font-weight:700">'+esc(it.nf)+'</td>'
        +'<td>'+esc(it.aba)+'</td>'
        +'<td>'+esc(it.desc)+'</td>'
        +'<td>'+badge+'</td>'
        +'</tr>';
    }).join('');
    document.getElementById('prevBody').innerHTML = rows;
    document.getElementById('prevHdr').innerHTML =
      '<strong>'+itens.length+' NF(s)</strong> encontrada(s) · pronto para reabrir';
  }

  /* ── Step 2 → 3 ──────────────────────────────────────── */
  function setBusyConfirmar(on) {
    var b = document.getElementById('btnConfirmar');
    b.disabled = on; b.classList.toggle('busy', on);
    b.querySelector('.lbl').textContent = on ? '⏳ Processando…' : '🔓 Confirmar Reabertura';
  }

  function confirmar() {
    if (!itensEncontrados.length) return;
    setBusyConfirmar(true);
    var motivo = document.getElementById('motivo').value.trim();
    google.script.run
      .withSuccessHandler(function(resp) {
        setBusyConfirmar(false);
        var r = JSON.parse(resp);
        if (r.sucesso) showOk(r.sucesso);
        else           showErr(r.erro);
      })
      .withFailureHandler(function(e) { setBusyConfirmar(false); showErr('Erro: ' + e.message); })
      .executarReaberturaPorItens(itensEncontrados, motivo);
  }

  /* ── Step 3: resultado ─────────────────────────────── */
  function _makeBtn(btns, cls, txt, fn) {
    var b = document.createElement('button');
    b.className = 'result-link ' + cls;
    b.textContent = txt;
    b.onclick = fn;
    btns.appendChild(b);
  }

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
    _makeBtn(btns, 'rl-navy',  '🔓 Nova Reabertura', function() { limparStep1(); goTo(1, false); });
    _makeBtn(btns, 'rl-ghost', '✖ Fechar',           function() { google.script.host.close(); });
    goTo(3, true);
  }

  function showErr(txt) {
    var box = document.getElementById('resBox');
    box.className = 'result-box err';
    document.getElementById('svgOk').style.display = 'none';
    document.getElementById('resMsg').innerHTML = ('❌ ' + (txt || 'Erro desconhecido')).replace(/\n/g,'<br>');
    var btns = document.getElementById('resBtns');
    btns.innerHTML = '';
    _makeBtn(btns, 'rl-navy',  '↩ Tentar novamente', function() { goTo(1, false); });
    _makeBtn(btns, 'rl-ghost', '✖ Fechar',           function() { google.script.host.close(); });
    goTo(3, true);
  }

  function limparStep1() {
    document.getElementById('nfs').value = '';
    document.getElementById('motivo').value = '';
    var z = document.getElementById('chipZone');
    z.innerHTML = '';
    z.classList.remove('open');
    _ck = '';
    itensEncontrados = [];
  }

  (function(){ try { if(localStorage.getItem('cdv_dark_mode')==='1') document.body.classList.add('dark'); }catch(_){} })();
</script>
</body>
</html>
```

- [ ] **Step 3: Verificação manual**

Abrir o formulário no GAS (Deploy → Test as web app ou via Index.html → "Reabrir Devoluções"):

1. **Step 1 — Layout:** O stepper aparece com "1 Entrada" ativo (círculo navy), "2 Prévia" e "3 Resultado" inativos. O header card mostra 🔓 + título. O banner info aparece. Os dois textareas aparecem (NFs + Motivo). Digitar NFs no campo — os chips aparecem abaixo.
2. **Transição 1→2:** Clicar "🔍 Buscar Prévia" com NFs válidas — o botão fica busy ("⏳ Buscando…"), depois anima para o step 2. O círculo 1 fica verde (✓), o círculo 2 fica navy ativo.
3. **Step 2 — Tabela:** A tabela aparece com colunas #, NF, Aba, Descrição, Status atual. Badges coloridos por status. O botão "← Voltar" retorna ao step 1.
4. **Transição 2→3 sucesso:** Clicar "🔓 Confirmar Reabertura" — aparece a caixa verde com SVG animado, mensagem de sucesso, botões "🔓 Nova Reabertura" e "✖ Fechar".
5. **"Nova Reabertura":** Limpa os campos e volta ao step 1, com todos os círculos resetados.
6. **Dark mode:** `localStorage.setItem('cdv_dark_mode','1')` → recarregar → o form aparece no tema escuro corretamente.

- [ ] **Step 4: Commit**

```bash
git add FormReabertura.html
git commit -m "feat(form): wizard 3 steps para FormReabertura"
```

---

## Self-Review

**Spec coverage:**
- ✅ Step 1: textarea NFs + textarea Motivo + chips + "Buscar Prévia" — Task 1 Step 2
- ✅ Step 2: tabela (NF, Aba, Descrição, Status atual) + badges + warn + "Confirmar Reabertura" + "Voltar" — Task 1 Step 2
- ✅ Step 3: caixa ok/err + SVG animado + botões pós-ação — Task 1 Step 2
- ✅ Cor tema navy — em todo `btn-main`, `wz-circle.active`, `wz-line-fill`, `table th`
- ✅ Backends preservados: `buscarNFsConcluidas(nfs)` e `executarReaberturaPorItens(itensEncontrados, motivo)`
- ✅ Banner `#cdv-nav-webapp` e script webapp: preservados
- ✅ Block `cdv-v10` e dark mode IIFE: preservados
- ✅ Sucesso: "Nova Reabertura" limpa step 1 + volta; "Fechar" fecha
- ✅ Erro: "Tentar novamente" volta ao step 1; "Fechar" fecha

**Placeholder scan:** Nenhum TBD/TODO/placeholder no plano.

**Type consistency:** `itensEncontrados` (array de `{nf,aba,desc,status,linha}`) é passado de `buscarPrevia()` para `confirmar()` via closure — consistente com o comportamento original do form.
