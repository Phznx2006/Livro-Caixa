// Livro-Caixa — controle financeiro pessoal (dados em LocalStorage)
// Valores são guardados em CENTAVOS (inteiros) para evitar erros de ponto flutuante.
const KEY = 'livro-caixa:v1';
const UI_KEY = 'livro-caixa:ui:v1';
const CATS = {
  saida: ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Estudos', 'Outros'],
  entrada: ['Salário', 'Extra', 'Investimentos', 'Outros'],
};
const MAX_CENTS = 99999999999; // R$ 999.999.999,99
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = cents => fmt.format(cents / 100);
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const newId = () => crypto.randomUUID?.() || Date.now() + '-' + Math.random().toString(36).slice(2);
const currentType = () => document.querySelector('[name=type]:checked').value;

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Aceita "1.250,50", "1250,5", "1250.50", "R$ 10"; devolve centavos ou null
function parseCents(str) {
  let s = String(str).replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const m = s.match(/^(\d{1,11})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const c = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
  return c > 0 && c <= MAX_CENTS ? c : null;
}
const centsToInput = c => `${Math.floor(c / 100)},${pad(c % 100)}`;

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return y >= 2000 && y <= 2100 && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Valida/limpa um lançamento (também migra o formato antigo com "amount" decimal)
function normalize(t) {
  if (!t || typeof t !== 'object') return null;
  const type = t.type === 'entrada' || t.type === 'saida' ? t.type : null;
  const cents = Number.isInteger(t.cents) ? t.cents : Math.round(Number(t.amount) * 100);
  const date = String(t.date || '');
  if (!type || !Number.isFinite(cents) || cents <= 0 || cents > MAX_CENTS || !validDate(date)) return null;
  return {
    id: String(t.id ?? newId()), type, cents, date,
    desc: String(t.desc ?? '').trim().slice(0, 60) || '(sem descrição)',
    category: String(t.category || 'Outros').slice(0, 40),
  };
}

// ---------- Persistência ----------
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return []; }
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw 0;
    return data.map(normalize).filter(Boolean);
  } catch {
    // Não sobrescreve dados ilegíveis: guarda uma cópia antes de recomeçar
    try { localStorage.setItem(KEY + ':corrompido', raw); } catch { /* ignore */ }
    alert('Os dados salvos estão ilegíveis. Uma cópia foi guardada e o site começou vazio.');
    return [];
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(txs)); }
  catch { alert('Não foi possível salvar. Verifique se o navegador permite armazenamento local.'); }
}
function loadUI() {
  try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { return {}; }
}
function saveUI() {
  try {
    const ui = loadUI();
    ui.month = month;
    if (!editingId) ui.draft = { type: currentType(), desc: $('#desc').value, amount: $('#amount').value, category: $('#cat').value, date: $('#date').value };
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch { /* sem armazenamento */ }
}
function clearDraft() {
  try { const ui = loadUI(); delete ui.draft; ui.month = month; localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* ignore */ }
}

let txs = load();
let editingId = null;
let month = /^\d{4}-(0[1-9]|1[0-2])$/.test(loadUI().month) ? loadUI().month : todayStr().slice(0, 7);
let lastSig = '', lastAt = 0;

// ---------- Formulário ----------
function fillCategories(selected) {
  const list = [...CATS[currentType()]];
  if (selected && !list.includes(selected)) list.push(selected);
  $('#cat').innerHTML = list.map(c => `<option>${esc(c)}</option>`).join('');
  if (selected) $('#cat').value = selected;
}
function setForm(d) {
  (document.querySelector(`[name=type][value="${d.type}"]`) || document.querySelector('[name=type][value=saida]')).checked = true;
  fillCategories(d.category);
  $('#desc').value = d.desc || '';
  $('#amount').value = d.amount || '';
  $('#date').value = d.date || todayStr();
}
function startEdit(id) {
  const t = txs.find(x => x.id === id);
  if (!t) return;
  editingId = id;
  setForm({ type: t.type, category: t.category, desc: t.desc, amount: centsToInput(t.cents), date: t.date });
  $('#formTitle').textContent = 'Editar lançamento';
  $('#submit').textContent = 'Salvar alteração';
  $('#cancel').hidden = false;
  $('#form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#desc').focus();
}
function endEdit() {
  editingId = null;
  $('#formTitle').textContent = 'Novo lançamento';
  $('#submit').textContent = 'Lançar';
  $('#cancel').hidden = true;
  setForm(loadUI().draft || {}); // volta ao rascunho que existia antes da edição
}
function fail(el, msg) { el.setCustomValidity(msg); el.reportValidity(); el.focus(); }

$('#form').addEventListener('submit', e => {
  e.preventDefault();
  const desc = $('#desc').value.trim();
  const cents = parseCents($('#amount').value);
  const date = $('#date').value;
  if (!desc) return fail($('#desc'), 'Informe uma descrição.');
  if (!cents) return fail($('#amount'), 'Informe um valor maior que zero, como 1.250,50.');
  if (!validDate(date)) return fail($('#date'), 'Informe uma data válida (entre 2000 e 2100).');

  const data = { type: currentType(), desc: desc.slice(0, 60), cents, category: $('#cat').value, date };
  if (editingId) {
    const i = txs.findIndex(t => t.id === editingId);
    if (i < 0) { alert('Este lançamento não existe mais.'); endEdit(); render(); return; }
    txs[i] = { ...txs[i], ...data };
    save(); month = date.slice(0, 7); endEdit();
  } else {
    const sig = JSON.stringify(data);
    if (sig === lastSig && Date.now() - lastAt < 2000) return; // clique duplo
    lastSig = sig; lastAt = Date.now();
    txs.push({ id: newId(), ...data });
    save(); month = date.slice(0, 7);
    clearDraft(); setForm({});
  }
  render(); saveUI();
  $('#desc').focus();
});
$('#cancel').onclick = endEdit;
document.querySelectorAll('[name=type]').forEach(r => r.addEventListener('change', () => fillCategories()));
$('#form').addEventListener('input', e => { e.target.setCustomValidity?.(''); saveUI(); });
$('#form').addEventListener('change', saveUI);

// ---------- Lista ----------
$('#list').addEventListener('click', e => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  const id = b.dataset.id;
  if (b.dataset.act === 'edit') return startEdit(id);
  if (confirm('Tem certeza que deseja excluir esta movimentação?')) {
    txs = txs.filter(t => t.id !== id);
    if (editingId === id) endEdit();
    save(); render();
  }
});

// ---------- Cálculos e tela ----------
const sum = list => list.reduce((a, t) => a + t.cents, 0);
const signed = t => (t.type === 'entrada' ? t.cents : -t.cents);

function shiftMonth(delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  render(); saveUI();
}

function render() {
  const [y, m] = month.split('-').map(Number);
  $('#monthLabel').textContent = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const mine = txs.filter(t => t.date.startsWith(month));
  const inc = sum(mine.filter(t => t.type === 'entrada'));
  const exp = sum(mine.filter(t => t.type === 'saida'));
  const total = txs.reduce((a, t) => a + signed(t), 0);

  $('#total').textContent = brl(total);
  $('#total').className = 'big ' + (total < 0 ? 'neg' : 'pos');
  $('#inc').textContent = brl(inc);
  $('#exp').textContent = brl(exp);
  $('#net').textContent = brl(inc - exp);
  $('#net').className = inc - exp < 0 ? 'neg' : 'pos';

  const byCat = {};
  mine.filter(t => t.type === 'saida').forEach(t => byCat[t.category] = (byCat[t.category] || 0) + t.cents);
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  $('#cats').innerHTML = cats.length
    ? cats.map(([c, v]) => `<div class="bar"><div><span>${esc(c)}</span><span>${brl(v)}</span></div><div class="track"><i style="width:${(v / exp * 100).toFixed(1)}%"></i></div></div>`).join('')
    : '<p class="empty">Nenhuma saída neste mês.</p>';

  const days = [...new Set(mine.map(t => t.date))].sort().reverse();
  $('#list').innerHTML = days.length ? days.map(d => {
    const items = mine.filter(t => t.date === d).reverse(); // mais recentes primeiro
    const spent = sum(items.filter(t => t.type === 'saida'));
    const label = new Date(d + 'T00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    return `<div class="day"><h3>${label}<small>gasto no dia: ${brl(spent)}</small></h3>` +
      items.map(t => `<div class="row"><div>${esc(t.desc)}<small>${esc(t.category)}</small></div>` +
        `<strong class="${t.type === 'entrada' ? 'pos' : 'neg'}">${t.type === 'entrada' ? '+' : '−'} ${brl(t.cents)}</strong>` +
        `<button class="edit" data-act="edit" data-id="${esc(t.id)}" aria-label="Editar lançamento">✎</button>` +
        `<button data-act="del" data-id="${esc(t.id)}" aria-label="Excluir lançamento">✕</button></div>`).join('') + '</div>';
  }).join('') : '<p class="empty">Nada lançado neste mês. Use o formulário para começar.</p>';
}

$('#prev').onclick = () => shiftMonth(-1);
$('#next').onclick = () => shiftMonth(1);

// ---------- Backup ----------
$('#export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(txs, null, 2)], { type: 'application/json' }));
  a.download = `livro-caixa-${todayStr()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#import').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    if (file.size > 5e6) throw 0;
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw 0;
    const seen = new Set(), clean = [];
    for (const raw of data) {
      const t = normalize(raw);
      if (t && !seen.has(t.id)) { seen.add(t.id); clean.push(t); }
    }
    if (data.length && !clean.length) throw 0;
    const skipped = data.length - clean.length;
    if (confirm(`Importar ${clean.length} lançamentos? Isto substitui os dados atuais.` + (skipped ? ` (${skipped} inválidos ou repetidos serão ignorados.)` : ''))) {
      txs = clean;
      if (editingId) endEdit();
      save(); render();
    }
  } catch { alert('Arquivo de backup inválido.'); }
};

// Outra aba alterou os dados: recarrega para não sobrescrever com informação antiga
window.addEventListener('storage', e => { if (e.key === KEY) { txs = load(); render(); } });

// ---------- Início ----------
const ui = loadUI();
setForm(ui.draft || ui); // ui.draft; "ui" cobre o formato antigo
render();
