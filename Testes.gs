// ============================================================
//   TESTES AUTOMATIZADOS — Controle de Devoluções
//
//   Como usar:
//   1. Abra o editor de scripts (Extensões → Apps Script)
//   2. Selecione a função "executarTodosTestes" e clique em Executar
//   3. Veja o resultado no Logger (Exibir → Logs)
//
//   Os testes usam a planilha real mas gravam e apagam dados numa
//   aba sandbox "_TestSandbox" que é criada e destruída automaticamente.
// ============================================================

var _SANDBOX_ABA = '_TestSandbox';

// ── Runner principal ──────────────────────────────────────────
function executarTodosTestes() {
  var resultados = [];
  var funcs = [
    testeGetSS,
    testeFormatacaoData,
    testeContadorConcluidos,
    testeBaterTermos,
    testeSaudeSistema,
    testeSandboxGravacaoLeitura,
    testeScorecardFornecedores,
    testeSLAFornecedores,
    testeNotificarEventoInativo
  ];
  funcs.forEach(function(fn) {
    try {
      var r = fn();
      resultados.push('[OK] ' + fn.name + (r ? ': ' + r : ''));
    } catch(e) {
      resultados.push('[FAIL] ' + fn.name + ': ' + e.message);
    }
  });
  _limparSandbox();
  var resumo = resultados.join('\n');
  Logger.log('\n═══════ RESULTADO DOS TESTES ═══════\n' + resumo + '\n════════════════════════════════════');
  var ok  = resultados.filter(function(r){ return r.indexOf('[OK]')   === 0; }).length;
  var err = resultados.filter(function(r){ return r.indexOf('[FAIL]') === 0; }).length;
  Logger.log('\nTotal: ' + resultados.length + ' | Passou: ' + ok + ' | Falhou: ' + err);
  if (err > 0) throw new Error(err + ' teste(s) falharam. Veja o log acima.');
  return resumo;
}

// ── Helpers ───────────────────────────────────────────────────
function _assert(cond, msg) { if (!cond) throw new Error(msg || 'Asserção falhou'); }
function _assertEquals(a, b, msg) {
  if (a !== b) throw new Error((msg||'assertEquals') + ': esperado "' + b + '", obtido "' + a + '"');
}
function _assertContains(obj, key, msg) {
  if (obj[key] === undefined) throw new Error((msg||'assertContains') + ': chave "' + key + '" ausente em ' + JSON.stringify(obj));
}

function _criarSandbox() {
  var ss = getSS();
  var ws = ss.getSheetByName(_SANDBOX_ABA);
  if (!ws) ws = ss.insertSheet(_SANDBOX_ABA);
  ws.clearContents();
  return ws;
}
function _limparSandbox() {
  try {
    var ss = getSS();
    var ws = ss.getSheetByName(_SANDBOX_ABA);
    if (ws) ss.deleteSheet(ws);
  } catch(_) {}
}

// ── Testes ────────────────────────────────────────────────────

function testeGetSS() {
  var ss = getSS();
  _assert(ss != null, 'getSS() retornou null');
  _assert(typeof ss.getName === 'function', 'getSS() não é Spreadsheet');
  return ss.getName();
}

function testeFormatacaoData() {
  var tz  = Session.getScriptTimeZone();
  var dt  = new Date(2026, 0, 15); // 15/01/2026
  var fmt = Utilities.formatDate(dt, tz, 'dd/MM/yyyy');
  _assertEquals(fmt, '15/01/2026', 'Formatação de data');
  // Verifica que comparação numérica de timestamps ordena corretamente
  var dt2 = new Date(2025, 11, 31); // 31/12/2025
  _assert(dt.getTime() > dt2.getTime(), 'Timestamp 2026 > 2025');
  return fmt;
}

function testeContadorConcluidos() {
  // Salva estado atual
  var props = PropertiesService.getScriptProperties();
  var valorAntes = props.getProperty(_PROP_KEY_CONCLUIDOS) || '0';
  try {
    props.setProperty(_PROP_KEY_CONCLUIDOS, '5');
    _assertEquals(_lerContadorConcluidos(), 5, '_lerContadorConcluidos');
    _incrementarContadorConcluidos();
    _assertEquals(_lerContadorConcluidos(), 6, 'Incrementar contador');
    _decrementarContadorConcluidos(2);
    _assertEquals(_lerContadorConcluidos(), 4, 'Decrementar contador');
    _zerarContadorConcluidos();
    _assertEquals(_lerContadorConcluidos(), 0, 'Zerar contador');
  } finally {
    props.setProperty(_PROP_KEY_CONCLUIDOS, valorAntes);
  }
  return 'ok';
}

function testeBaterTermos() {
  var r1 = _baterTermos(['123', '456'], '123', '999');
  _assert(r1.bate, '_baterTermos deve bater por NFD');
  _assertEquals(r1.termoBateu, '123', 'termo batido deve ser 123');

  var r2 = _baterTermos(['777'], '123', '777');
  _assert(r2.bate, '_baterTermos deve bater por NF');

  var r3 = _baterTermos(['AAA'], '123', '456');
  _assert(!r3.bate, '_baterTermos não deve bater');
  return 'ok';
}

function testeSaudeSistema() {
  var resp = verificarSaudeSistema();
  var d    = JSON.parse(resp);
  _assert(!d.erro, 'verificarSaudeSistema retornou erro: ' + d.erro);
  _assertContains(d, 'status', 'campo status');
  _assertContains(d, 'checks', 'campo checks');
  _assert(Array.isArray(d.checks), 'checks deve ser array');
  _assert(d.checks.length > 0, 'checks não pode ser vazio');
  return 'status=' + d.status + ', checks=' + d.checks.length;
}

function testeSandboxGravacaoLeitura() {
  var ws  = _criarSandbox();
  var val = 'TESTE_' + Date.now();
  ws.getRange(1,1).setValue(val);
  SpreadsheetApp.flush();
  var lido = ws.getRange(1,1).getValue();
  _assertEquals(lido, val, 'Leitura do sandbox');
  return 'sandbox ok';
}

function testeScorecardFornecedores() {
  var resp = obterScorecardFornecedores();
  var d    = JSON.parse(resp);
  _assert(!d.erro, 'obterScorecardFornecedores erro: ' + (d.erro||''));
  _assertContains(d, 'fornecedores', 'campo fornecedores');
  _assert(Array.isArray(d.fornecedores), 'fornecedores deve ser array');
  return 'fornecedores=' + d.fornecedores.length;
}

function testeSLAFornecedores() {
  var resp = obterSLAFornecedores();
  var d    = JSON.parse(resp);
  _assert(!d.erro, 'obterSLAFornecedores erro: ' + (d.erro||''));
  _assertContains(d, 'sla', 'campo sla');
  _assert(Array.isArray(d.sla), 'sla deve ser array');
  return 'fornecedores_com_sla=' + d.sla.length;
}

function testeNotificarEventoInativo() {
  var chaveAnterior = PropertiesService.getScriptProperties().getProperty(_KEY_WEBHOOK_CONF);
  try {
    PropertiesService.getScriptProperties().setProperty(_KEY_WEBHOOK_CONF, JSON.stringify({ ativo: false }));
    var r = notificarEvento('sistema', 'teste');
    _assertEquals(r, null, 'notificarEvento deve retornar null quando config está inativa');
    return 'ok';
  } finally {
    if (chaveAnterior === null) PropertiesService.getScriptProperties().deleteProperty(_KEY_WEBHOOK_CONF);
    else PropertiesService.getScriptProperties().setProperty(_KEY_WEBHOOK_CONF, chaveAnterior);
  }
}
