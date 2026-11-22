'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = c => c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const toCents = s => { if (s == null || String(s).trim() === '') return null; const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : Math.round(n * 100); };
const ST = { disponivel: 'Disponível', reservado: 'Reservado', preparacao: 'Em preparação', vendido: 'Vendido', bloqueado: 'Bloqueado' };
const CATS = { frente: 'Frente', traseira: 'Traseira', lateral_direita: 'Lateral direita', lateral_esquerda: 'Lateral esquerda', interior: 'Interior', painel: 'Painel', motor: 'Motor', porta_malas: 'Porta-malas', rodas_pneus: 'Rodas e pneus', detalhes: 'Detalhes' };
const COSTS = { comissao_aquisicao: 'Comissão de aquisição', transporte: 'Transporte', preparacao: 'Preparação', funilaria: 'Funilaria', pintura: 'Pintura', mecanica: 'Mecânica', pneus: 'Pneus', higienizacao: 'Higienização', documentacao: 'Documentação', multas_loja: 'Multas pagas pela loja', ipva_loja: 'IPVA pago pela loja', outros: 'Outros custos', adicionais: 'Despesas adicionais' };
let ME = null;

function toast(m) { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 3500); }
async function api(path, opt = {}) {
  const o = { method: opt.method || ((opt.json !== undefined || opt.form) ? 'POST' : 'GET'), headers: { 'X-Requested-With': 'autogestao' } };
  if (opt.json !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opt.json); }
  if (opt.form) o.body = opt.form;
  const r = await fetch(path, o);
  let d = null; try { d = await r.json(); } catch { }
  if (r.status === 401 && path !== '/api/login' && path !== '/api/me') { ME = null; render(); throw new Error('sessão expirada'); }
  if (!r.ok) { const e = new Error((d && (d.erro || d.mensagem)) || 'erro ' + r.status); e.data = d; e.status = r.status; throw e; }
  return d;
}
const can = p => ME && ME.perms.includes(p);
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };

// ------------------------------------------------------------------ shell
const NAV = [['#/', 'Painel'], ['#/estoque', 'Estoque'], ['#/novo', '+ Veículo', 'vehicle.create'], ['#/sistema', 'Sistema', 'audit.view']];
function shell(content) {
  const cur = location.hash || '#/';
  const items = NAV.filter(n => !n[2] || can(n[2]));
  const link = n => `<a href="${n[0]}" class="${cur === n[0] ? 'on' : ''}">${n[1]}</a>`;
  return `<div class="layout"><nav class="side"><div class="logo">🚗 AutoGestão</div>${items.map(link).join('')}
    ${can('users.manage') ? `<a href="#/usuarios" class="${cur === '#/usuarios' ? 'on' : ''}">Usuários</a>` : ''}
    <div class="who">${esc(ME.nome)} · ${esc(ME.perfil)}${ME.ambiente === 'test' ? '<br><b>AMBIENTE DE TESTES</b>' : ''}<br><a id="out" style="padding:4px 0">Sair</a></div></nav>
    <main>${ME.ambiente === 'test' ? '<div class="warn">Ambiente de testes — dados fictícios.</div>' : ''}${content}</main>
    <nav class="bottom">${items.map(link).join('')}<a id="out2">Sair</a></nav></div>`;
}
function bindShell() { ['#out', '#out2'].forEach(s => { const b = $(s); if (b) b.onclick = guard(async () => { await api('/api/logout', { method: 'POST', json: {} }); ME = null; render(); }); }); }

async function render() {
  const app = $('#app');
  if (!ME) { try { ME = await api('/api/me'); } catch { } }
  if (!ME) return loginView(app);
  const h = location.hash || '#/';
  try {
    let m;
    if (h === '#/') await dashView(app);
    else if (h === '#/estoque') await stockView(app);
    else if (h === '#/novo') await newView(app);
    else if (h === '#/usuarios') await usersView(app);
    else if (h === '#/sistema') await sysView(app);
    else if ((m = h.match(/^#\/v\/(\d+)(?:\/(\w+))?$/))) await vehicleView(app, +m[1], m[2] || 'resumo');
    else app.innerHTML = shell('<h1>Página não encontrada</h1>');
  } catch (e) { if (ME) app.innerHTML = shell(`<div class="err">${esc(e.message)}</div>`); }
  bindShell();
}
window.addEventListener('hashchange', render);

function loginView(app) {
  app.innerHTML = `<div class="login card"><h1>🚗 AutoGestão</h1><label>E-mail</label><input id="em" type="email" autocomplete="username">
  <label>Senha</label><input id="pw" type="password" autocomplete="current-password"><p><button id="go" style="width:100%">Entrar</button></p><div id="le"></div></div>`;
  const go = async () => { try { ME = await api('/api/login', { json: { email: $('#em').value, senha: $('#pw').value } }); render(); } catch (e) { $('#le').innerHTML = `<div class="err">${esc(e.message)}</div>`; } };
  $('#go').onclick = go; $('#pw').onkeydown = e => e.key === 'Enter' && go();
}

// ------------------------------------------------------------------ dashboard
async function dashView(app) {
  const d = await api('/api/dashboard');
  const k = (l, v) => `<div class="card kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  let h = `<h1>Painel</h1>${can('vehicle.create') ? '<p><a class="btn big" href="#/novo" style="width:100%;text-align:center;background:var(--acc)">+ ADICIONAR VEÍCULO</a></p>' : ''}
  <div class="grid kpis">${k('Em estoque', d.total_estoque)}${k('Disponíveis', d.por_status.disponivel)}${k('Reservados', d.por_status.reservado)}${k('Em preparação', d.por_status.preparacao)}${k('Vendidos', d.por_status.vendido)}${k('Bloqueados', d.por_status.bloqueado)}
  ${k('Parados > 30 dias', d.parados[30])}${k('Parados > 60 dias', d.parados[60])}${k('Parados > 90 dias', d.parados[90])}`;
  if (d.investido_estoque !== undefined) h += k('Investido no estoque', brl(d.investido_estoque)) + k('Valor potencial de venda', brl(d.potencial_venda)) + k('Lucro estimado', brl(d.lucro_estimado)) +
    k('Faturamento do mês', brl(d.faturamento_mensal)) + k('Lucro realizado', brl(d.lucro_realizado)) + k('Débitos pendentes', 'Disponível na Fase 2/3');
  h += '</div>';
  if (d.serie_mensal) {
    const meses = Object.keys(d.serie_mensal);
    const chart = (t, key, money) => {
      const mx = Math.max(1, ...meses.map(m => Math.abs(d.serie_mensal[m][key])));
      return `<div class="card"><b>${t}</b><div class="bars">${meses.map(m => { const v = d.serie_mensal[m][key]; return `<div class="c">${money ? brl(v) : v}<div class="bar" style="height:${Math.round(Math.abs(v) / mx * 85)}%"></div>${m.slice(5)}/${m.slice(2, 4)}</div>`; }).join('')}</div></div>`;
    };
    h += `<h2>Evolução</h2><div class="grid cards">${chart('Compras (R$)', 'compras', 1)}${chart('Vendas (qtd)', 'vendas')}${chart('Faturamento', 'faturamento', 1)}${chart('Lucro realizado', 'lucro', 1)}${chart('Entradas no estoque', 'entradas')}</div>`;
  }
  app.innerHTML = shell(h);
}

// ------------------------------------------------------------------ estoque
const vcard = v => `<div class="card vcard" data-id="${v.id}"><div class="ph" ${v.foto_url ? `style="background-image:url('${esc(v.foto_url)}')"` : ''}>${v.foto_url ? '' : 'sem foto'}</div>
 <div class="b"><div class="t">${esc(v.marca)} ${esc(v.modelo)} ${esc(v.versao || '')}</div><div class="m">${esc(v.ano_fab || '')}/${esc(v.ano_modelo || '')} · ${v.km != null ? v.km.toLocaleString('pt-BR') + ' km' : 'km —'} · ${esc(v.placa || 'sem placa')}</div>
 <div class="m">FIPE ${brl(v.fipe_valor)} · Venda <b>${brl(v.preco_venda)}</b>${v.custo_total !== undefined ? ` · Custo ${brl(v.custo_total)}` : ''}</div>
 <div class="m">${v.dias_estoque} dias · <span class="tag s-${esc(v.status)}">${ST[v.status]}</span></div>
 ${v.pendencias.length ? `<div class="pend">⚠ ${v.pendencias.map(esc).join(' · ')}</div>` : ''}</div></div>`;

async function stockView(app) {
  app.innerHTML = shell(`<h1>Estoque</h1><div class="card"><div class="row"><input id="q" placeholder="Buscar marca, modelo, placa, chassi, código"><select id="st"><option value="">Todos os status</option>${Object.entries(ST).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
  <input id="ano" type="number" placeholder="Ano/modelo"><input id="pmin" placeholder="Preço mín (R$)"><input id="pmax" placeholder="Preço máx (R$)"><input id="de" type="date" title="Entrada de"><input id="ate" type="date" title="Entrada até"></div></div><div id="list" class="grid cards" style="margin-top:12px"></div>`);
  let t;
  const load = guard(async () => {
    const p = new URLSearchParams(); const set = (k, v) => v && p.set(k, v);
    set('q', $('#q').value); set('status', $('#st').value); set('ano', $('#ano').value); set('entrada_de', $('#de').value); set('entrada_ate', $('#ate').value);
    const a = toCents($('#pmin').value), b = toCents($('#pmax').value); if (a) p.set('preco_min', a); if (b) p.set('preco_max', b);
    const l = await api('/api/vehicles?' + p);
    $('#list').innerHTML = l.length ? l.map(vcard).join('') : '<div class="card">Nenhum veículo encontrado.</div>';
    document.querySelectorAll('.vcard').forEach(c => c.onclick = () => location.hash = '#/v/' + c.dataset.id);
  });
  app.querySelectorAll('input,select').forEach(e => e.oninput = () => { clearTimeout(t); t = setTimeout(load, 250); });
  load();
}

// ------------------------------------------------------------------ novo veículo
const FIELDS = [['marca', 'Marca*'], ['modelo', 'Modelo*'], ['versao', 'Versão'], ['placa', 'Placa'], ['chassi', 'Chassi'], ['renavam', 'RENAVAM'], ['ano_fab', 'Ano fabricação', 'number'], ['ano_modelo', 'Ano modelo', 'number'],
['cor', 'Cor'], ['combustivel', 'Combustível'], ['cambio', 'Câmbio'], ['km', 'Quilometragem', 'number'], ['portas', 'Portas', 'number'], ['valor_compra', 'Valor de compra (R$)', 'money'], ['preco_venda', 'Preço de venda (R$)', 'money'],
['fornecedor_nome', 'Fornecedor'], ['fornecedor_doc', 'CNPJ/CPF do fornecedor'], ['nf_numero', 'Nº da nota'], ['nf_data', 'Data da nota', 'date'], ['nf_chave', 'Chave da NF-e']];
function formHTML(v = {}) {
  const fin = can('finance.view') || can('cost.manage');
  return `<div class="row">${FIELDS.filter(f => fin || f[0] !== 'valor_compra').map(([k, l, t]) => {
    let val = v[k] ?? ''; if (t === 'money' && val !== '') val = (val / 100).toFixed(2).replace('.', ',');
    return `<div><label>${l}</label><input data-f="${k}" type="${t === 'money' ? 'text' : t || 'text'}" value="${esc(val)}"></div>`;
  }).join('')}</div><label>Opcionais</label><textarea data-f="opcionais">${esc(v.opcionais || '')}</textarea><label>Observações</label><textarea data-f="observacoes">${esc(v.observacoes || '')}</textarea>`;
}
function readForm(root = document) {
  const o = {};
  root.querySelectorAll('[data-f]').forEach(e => {
    const k = e.dataset.f; let v = e.value.trim(); if (v === '') return;
    if (['valor_compra', 'preco_venda'].includes(k)) v = toCents(v); else if (e.type === 'number') v = parseInt(v, 10);
    o[k] = v;
  });
  return o;
}
async function newView(app) {
  app.innerHTML = shell(`<h1>Adicionar veículo</h1><div id="step"></div>`);
  const step = $('#step');
  const form = (pre, origem, token, aviso) => {
    step.innerHTML = `${aviso ? `<div class="warn">${aviso}</div>` : ''}<div class="card">${formHTML(pre)}<p><button id="save" class="big">Salvar veículo</button></p></div>`;
    $('#save').onclick = guard(async () => {
      const body = readForm(step); body.origem_cadastro = origem; if (token) body.xml_token = token;
      const v = await api('/api/vehicles', { json: body }); toast('Veículo cadastrado'); location.hash = '#/v/' + v.id + '/fipe';
    });
  };
  const opts = `<div class="grid cards">
   <div class="card opt" id="o1">📄 Importar XML da nota fiscal</div><div class="card opt" id="o2">📷 Fotografar ou enviar a nota</div>
   <div class="card opt" id="o3">🔎 Informar a placa</div><div class="card opt" id="o4">✍️ Cadastrar manualmente</div></div>`;
  step.innerHTML = opts;
  $('#o4').onclick = () => form({}, 'manual');
  $('#o1').onclick = () => {
    step.innerHTML = `<div class="card"><label>Arquivo XML da NF-e</label><input type="file" id="f" accept=".xml,text/xml"><p><button id="go">Importar</button> <button class="sec" id="bk">Voltar</button></p></div>`;
    $('#bk').onclick = () => newView(app);
    $('#go').onclick = guard(async () => {
      const fd = new FormData(); fd.append('arquivo', $('#f').files[0]);
      const r = await api('/api/vehicles/import-xml', { method: 'POST', form: fd });
      const v = r.veiculos[0];
      const falt = v._faltantes.length ? `Não constam no XML (preencha): <b>${esc(v._faltantes.join(', '))}</b>.` : '';
      form(v, 'xml', r.xml_token, `${esc(r.aviso)} ${falt}${r.veiculos.length > 1 ? ` O XML tem ${r.veiculos.length} veículos; importando o primeiro.` : ''}`);
    });
  };
  $('#o2').onclick = () => {
    step.innerHTML = `<div class="card"><label>Foto da nota fiscal</label><input type="file" id="f" accept="image/*" capture="environment"><p><button id="go">Ler nota (OCR)</button> <button class="sec" id="bk">Voltar</button></p></div>`;
    $('#bk').onclick = () => newView(app);
    $('#go').onclick = guard(async () => {
      const fd = new FormData(); fd.append('arquivo', $('#f').files[0]);
      const r = await api('/api/vehicles/ocr', { method: 'POST', form: fd });
      form(r.campos, 'ocr', null, esc(r.aviso) + ' Campos lidos: ' + (Object.keys(r.campos).join(', ') || 'nenhum'));
    });
  };
  $('#o3').onclick = () => {
    step.innerHTML = `<div class="card"><label>Placa</label><input id="pl" maxlength="8" style="text-transform:uppercase"><p><button id="go">Consultar</button> <button class="sec" id="bk">Voltar</button></p></div>`;
    $('#bk').onclick = () => newView(app);
    $('#go').onclick = guard(async () => {
      const r = await api('/api/vehicles/by-plate', { json: { placa: $('#pl').value } });
      form({ placa: r.placa }, 'placa', null, esc(r.mensagem));
    });
  };
}

// ------------------------------------------------------------------ ficha
async function vehicleView(app, id, tab) {
  const v = await api('/api/vehicles/' + id);
  const tabs = [['resumo', 'Resumo'], ['dados', 'Dados'], ['fipe', 'FIPE'], ['fotos', 'Fotos'], ['fin', 'Financeiro', v.custos !== undefined], ['docs', 'Documentos'], ['hist', 'Histórico']].filter(t => t[2] === undefined || t[2]);
  app.innerHTML = shell(`<p><a href="#/estoque">← Estoque</a></p><h1>${esc(v.marca)} ${esc(v.modelo)} <span class="tag s-${esc(v.status)}">${ST[v.status]}</span></h1>
   <div class="m" style="color:var(--mut)">${esc(v.codigo)} · ${esc(v.placa || 'sem placa')} · ${v.dias_estoque} dias em estoque</div>
   ${v.pendencias.length ? `<div class="warn">Pendências: ${v.pendencias.map(esc).join(' · ')}</div>` : ''}
   <div class="tabs">${tabs.map(t => `<button class="${tab === t[0] ? 'on' : ''}" data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div id="tab"></div>`);
  app.querySelectorAll('.tabs button').forEach(b => b.onclick = () => location.hash = `#/v/${id}/${b.dataset.t}`);
  const el = $('#tab'), reload = () => render();
  const kv = (k, val) => `<tr><td style="color:var(--mut)">${k}</td><td>${val}</td></tr>`;
  if (tab === 'resumo') {
    el.innerHTML = `<div class="card">${v.foto_url ? `<img src="${esc(v.foto_url)}" style="width:100%;max-height:340px;object-fit:cover;border-radius:10px">` : ''}<table>
    ${kv('Versão', esc(v.versao || '—'))}${kv('Ano', `${esc(v.ano_fab || '—')}/${esc(v.ano_modelo || '—')}`)}${kv('Km', v.km != null ? v.km.toLocaleString('pt-BR') : '—')}${kv('Cor / combustível / câmbio', `${esc(v.cor || '—')} / ${esc(v.combustivel || '—')} / ${esc(v.cambio || '—')}`)}
    ${kv('FIPE', `${brl(v.fipe_valor)} ${v.fipe_mes_ref ? '(' + esc(v.fipe_mes_ref) + ')' : ''} ${v.fipe_valor && !v.fipe_confirmado ? '— não confirmada' : ''}`)}${kv('Preço de venda', `<b>${brl(v.preco_venda)}</b>`)}
    ${v.custo_total !== undefined ? kv('Custo total', brl(v.custo_total)) + kv('Lucro estimado', `${brl(v.lucro_estimado)} ${v.margem != null ? '(' + v.margem + '%)' : ''}`) + kv('Venda − FIPE', brl(v.diff_venda_fipe)) : ''}</table></div>
    <h2>Alterar status</h2><div class="row">${Object.entries(ST).filter(([k]) => k !== 'vendido').map(([k, l]) => `<button class="sec st" data-s="${k}">${l}</button>`).join('')}${can('vehicle.status') ? '<button class="st" data-s="vendido">Marcar vendido…</button>' : ''}</div>`;
    el.querySelectorAll('.st').forEach(b => b.onclick = guard(async () => {
      const body = { status: b.dataset.s };
      if (body.status === 'vendido') { const vv = prompt('Valor de venda (R$):'); if (vv === null) return; body.valor_venda = toCents(vv); }
      await api(`/api/vehicles/${id}/status`, { json: body }); toast('Status atualizado'); reload();
    }));
  } else if (tab === 'dados') {
    el.innerHTML = `<div class="card">${formHTML(v)}${can('vehicle.edit') ? '<p><button id="sv">Salvar alterações</button></p>' : ''}</div>`;
    if (!can('vehicle.edit')) el.querySelectorAll('input,textarea').forEach(e => e.disabled = true);
    const s = $('#sv'); if (s) s.onclick = guard(async () => { await api('/api/vehicles/' + id, { method: 'PUT', json: readForm(el) }); toast('Salvo'); reload(); });
  } else if (tab === 'fipe') {
    el.innerHTML = `<div class="card"><p>Valor atual: <b>${brl(v.fipe_valor)}</b> ${v.fipe_codigo ? `· código ${esc(v.fipe_codigo)} · ${esc(v.fipe_mes_ref)}` : '(nunca consultada)'}</p>
    ${can('vehicle.edit') ? `<div class="row"><select id="fm"><option>Carregando marcas…</option></select><select id="fmo" disabled></select><select id="fa" disabled></select></div><p><button id="fb" disabled>Consultar valor</button></p><div id="fr"></div>` : ''}
    <h2>Histórico de consultas</h2><table>${v.fipe_historico.map(h => `<tr><td>${esc(h.consultado_em)}</td><td>${esc(h.codigo)}</td><td>${brl(h.valor)}</td><td>${esc(h.mes_ref)}</td><td>${esc(h.fonte || '')}</td></tr>`).join('') || '<tr><td>—</td></tr>'}</table></div>`;
    if (can('vehicle.edit')) fipeUI(id, el);
  } else if (tab === 'fotos') {
    const grp = c => v.midias.filter(m => m.categoria === c);
    el.innerHTML = `${can('photos.manage') ? `<div class="card"><div class="row"><select id="mc">${Object.entries(CATS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><input id="mf" type="file" accept="image/*,video/mp4,video/quicktime,video/webm" capture="environment" multiple></div><p><button id="mu">Enviar</button></p></div>` : ''}
    ${Object.entries(CATS).map(([c, l]) => grp(c).length ? `<h2>${l}</h2><div class="media">${grp(c).map(m => `<div>${m.tipo === 'video' ? `<video src="/media/${esc(m.arquivo)}" controls></video>` : `<img class="${v.foto_principal_id === m.id ? 'star' : ''}" src="/media/${esc(m.arquivo)}">`}
      <input value="${esc(m.legenda || '')}" placeholder="legenda" data-cap="${m.id}" style="padding:4px;margin-top:4px" ${can('photos.manage') ? '' : 'disabled'}>
      ${can('photos.manage') ? `<button class="sec pm" data-m="${m.id}" style="padding:4px 8px;font-size:12px">★ principal</button> <button class="bad dm" data-m="${m.id}" style="padding:4px 8px;font-size:12px">✕</button>` : ''}</div>`).join('')}</div>` : '').join('')}`;
    const mu = $('#mu'); if (mu) mu.onclick = guard(async () => {
      for (const f of $('#mf').files) { const fd = new FormData(); fd.append('arquivo', f); fd.append('categoria', $('#mc').value); await api(`/api/vehicles/${id}/media`, { method: 'POST', form: fd }); }
      toast('Enviado'); reload();
    });
    el.querySelectorAll('.pm').forEach(b => b.onclick = guard(async () => { await api(`/api/vehicles/${id}/media/${b.dataset.m}/principal`, { method: 'POST', json: {} }); reload(); }));
    el.querySelectorAll('.dm').forEach(b => b.onclick = guard(async () => { if (confirm('Remover esta mídia?')) { await api(`/api/vehicles/${id}/media/${b.dataset.m}`, { method: 'DELETE' }); reload(); } }));
    el.querySelectorAll('[data-cap]').forEach(i => i.onchange = guard(() => api(`/api/vehicles/${id}/media/${i.dataset.cap}`, { method: 'PUT', json: { legenda: i.value } })));
  } else if (tab === 'fin') {
    el.innerHTML = `<div class="card"><table>${kv('Valor de compra', brl(v.valor_compra))}${v.custos.map(c => `<tr><td>${esc(COSTS[c.categoria])} ${esc(c.descricao || '')}<br><small>${esc(c.data)}</small></td><td>${brl(c.valor)} ${can('cost.manage') ? `<button class="bad dc" data-c="${c.id}" style="padding:2px 8px">✕</button>` : ''}</td></tr>`).join('')}
    ${kv('<b>CUSTO TOTAL</b> (compra + despesas)', `<b>${brl(v.custo_total)}</b>`)}${kv('Preço de venda', brl(v.preco_venda))}${kv('Lucro bruto estimado', brl(v.lucro_estimado))}${kv('Margem', v.margem != null ? v.margem + '%' : '—')}</table></div>
    ${can('cost.manage') ? `<h2>Lançar custo</h2><div class="card"><div class="row"><select id="cc">${Object.entries(COSTS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><input id="cd" placeholder="Descrição"><input id="cv" placeholder="Valor (R$)"></div><p><button id="ca">Adicionar</button></p></div>` : ''}`;
    const ca = $('#ca'); if (ca) ca.onclick = guard(async () => { await api(`/api/vehicles/${id}/costs`, { json: { categoria: $('#cc').value, descricao: $('#cd').value, valor: toCents($('#cv').value) } }); reload(); });
    el.querySelectorAll('.dc').forEach(b => b.onclick = guard(async () => { if (confirm('Remover lançamento?')) { await api(`/api/vehicles/${id}/costs/${b.dataset.c}`, { method: 'DELETE' }); reload(); } }));
  } else if (tab === 'docs') {
    el.innerHTML = `<div class="card">${v.documentos.map(d => `<p>📄 ${esc(d.nome)} — ${esc(d.created_at)}</p>`).join('') || 'Nenhum documento anexado.'}<div class="warn">Consultas de procedência e débitos: pendentes (Fase 2).</div></div>`;
  } else {
    el.innerHTML = `<div class="card"><table>${v.historico.map(h => `<tr><td>${esc(h.ts)}</td><td>${esc(h.usuario || '—')}</td><td>${esc(h.acao)}</td><td><small>${esc(h.detalhe || '')}</small></td></tr>`).join('')}</table></div>`;
  }
}
async function fipeUI(id, el) {
  const sel = (e, l, ph) => { e.innerHTML = `<option value="">${ph}</option>` + l.map(x => `<option value="${esc(x.code)}">${esc(x.name)}</option>`).join(''); e.disabled = false; };
  const fm = $('#fm', el), fmo = $('#fmo', el), fa = $('#fa', el), fb = $('#fb', el), fr = $('#fr', el);
  try { sel(fm, await api('/api/fipe/marcas'), 'Marca'); }
  catch (e) { fm.innerHTML = '<option>indisponível</option>'; fr.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  fm.onchange = guard(async () => { fmo.disabled = fa.disabled = fb.disabled = true; if (!fm.value) return; const r = await api('/api/fipe/modelos?marca=' + fm.value); sel(fmo, r.models || r, 'Modelo'); });
  fmo.onchange = guard(async () => { fa.disabled = fb.disabled = true; if (!fmo.value) return; sel(fa, await api(`/api/fipe/anos?marca=${fm.value}&modelo=${fmo.value}`), 'Ano'); });
  fa.onchange = () => fb.disabled = !fa.value;
  fb.onclick = guard(async () => {
    const r = await api(`/api/fipe/valor?marca=${fm.value}&modelo=${fmo.value}&ano=${fa.value}`);
    fr.innerHTML = `<div class="card" style="background:#eef6fb"><p><b>${esc(r.marca)} ${esc(r.modelo)}</b> · ${esc(r.ano)} · ${esc(r.combustivel)}<br>Código ${esc(r.codigo_fipe)} · ${esc(r.mes_ref)} · fonte: ${esc(r.fonte)}</p><p style="font-size:22px"><b>${brl(r.valor)}</b></p>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="cf" style="width:auto"> Confirmo que modelo e versão correspondem ao veículo</label><p><button id="sf">Salvar na ficha</button></p></div>`;
    $('#sf').onclick = guard(async () => { await api(`/api/vehicles/${id}/fipe`, { json: { codigo_fipe: r.codigo_fipe, valor: r.valor, mes_ref: r.mes_ref, fonte: r.fonte, confirmado: $('#cf').checked } }); toast('FIPE registrada'); render(); });
  });
}

// ------------------------------------------------------------------ usuários e sistema
async function usersView(app) {
  const us = await api('/api/users');
  app.innerHTML = shell(`<h1>Usuários</h1><div class="card"><table>${us.map(u => `<tr><td>${esc(u.nome)}<br><small>${esc(u.email)}</small></td><td>${esc(u.perfil)}</td><td>${u.ativo ? 'ativo' : 'inativo'}</td>
   <td><button class="sec tg" data-u="${u.id}" data-a="${u.ativo ? 0 : 1}">${u.ativo ? 'Desativar' : 'Ativar'}</button></td></tr>`).join('')}</table></div>
   <h2>Novo usuário</h2><div class="card"><div class="row"><input id="un" placeholder="Nome"><input id="ue" placeholder="E-mail"><input id="up" type="password" placeholder="Senha (mín. 10)"><select id="uf">${['administrador', 'gerente', 'vendedor', 'estoque', 'financeiro'].map(p => `<option>${p}</option>`).join('')}</select></div><p><button id="uc">Criar</button></p></div>`);
  $('#uc').onclick = guard(async () => { await api('/api/users', { json: { nome: $('#un').value, email: $('#ue').value, senha: $('#up').value, perfil: $('#uf').value } }); render(); });
  app.querySelectorAll('.tg').forEach(b => b.onclick = guard(async () => { await api('/api/users/' + b.dataset.u, { method: 'PUT', json: { ativo: +b.dataset.a } }); render(); }));
}
async function sysView(app) {
  const [ints, log] = await Promise.all([api('/api/integrations'), api('/api/audit')]);
  app.innerHTML = shell(`<h1>Sistema</h1><h2>Integrações</h2><div class="card"><table>${ints.map(i => `<tr><td>${esc(i.nome)}</td><td>${esc(i.status)}</td></tr>`).join('')}</table></div>
  <h2>Registro de atividades</h2><div class="card"><table>${log.map(a => `<tr><td>${esc(a.ts)}</td><td>${esc(a.usuario || '—')}</td><td>${esc(a.acao)}</td><td>${esc(a.entidade || '')} ${esc(a.entidade_id || '')}</td></tr>`).join('')}</table></div>`);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
render();
