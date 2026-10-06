// Livro-Caixa — controle financeiro pessoal (dados em LocalStorage)
const KEY = 'livro-caixa:v1';
const CATS = {
  saida: ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Estudos', 'Outros'],
  entrada: ['Salário', 'Extra', 'Investimentos', 'Outros'],
};
const $ = s => document.querySelector(s);
const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

let txs = load();
let month = todayStr().slice(0, 7); // 'AAAA-MM'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(txs)); }
  catch { alert('Não foi possível salvar. Verifique se o navegador permite armazenamento local.'); }
}

const sum = list => list.reduce((a, t) => a + t.amount, 0);
const signed = t => (t.type === 'entrada' ? t.amount : -t.amount);

function fillCategories() {
  const type = document.querySelector('[name=type]:checked').value;
  $('#cat').innerHTML = CATS[type].map(c => `<option>${c}</option>`).join('');
}

function shiftMonth(delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  render();
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

  // Gastos por categoria
  const byCat = {};
  mine.filter(t => t.type === 'saida').forEach(t => byCat[t.category] = (byCat[t.category] || 0) + t.amount);
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  $('#cats').innerHTML = cats.length
    ? cats.map(([c, v]) => `<div class="bar"><div><span>${c}</span><span>${brl(v)}</span></div><div class="track"><i style="width:${(v / exp * 100).toFixed(1)}%"></i></div></div>`).join('')
    : '<p class="empty">Nenhuma saída neste mês.</p>';

  // Lançamentos agrupados por dia
  const days = [...new Set(mine.map(t => t.date))].sort().reverse();
  $('#list').innerHTML = days.length ? days.map(d => {
    const items = mine.filter(t => t.date === d);
    const spent = sum(items.filter(t => t.type === 'saida'));
    const label = new Date(d + 'T00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    return `<div class="day"><h3>${label}<small>gasto no dia: ${brl(spent)}</small></h3>` +
      items.map(t => `<div class="row"><div>${esc(t.desc)}<small>${t.category}</small></div>` +
        `<strong class="${t.type === 'entrada' ? 'pos' : 'neg'}">${t.type === 'entrada' ? '+' : '−'} ${brl(t.amount)}</strong>` +
        `<button data-id="${t.id}" aria-label="Excluir lançamento">✕</button></div>`).join('') + '</div>';
  }).join('') : '<p class="empty">Nada lançado neste mês. Use o formulário para começar.</p>';
}

const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Eventos
$('#form').addEventListener('submit', e => {
  e.preventDefault();
  txs.push({
    id: Date.now(),
    type: document.querySelector('[name=type]:checked').value,
    desc: $('#desc').value.trim(),
    amount: Math.round(parseFloat($('#amount').value) * 100) / 100,
    category: $('#cat').value,
    date: $('#date').value,
  });
  save();
  month = $('#date').value.slice(0, 7);
  $('#desc').value = ''; $('#amount').value = '';
  render();
  $('#desc').focus();
});
document.querySelectorAll('[name=type]').forEach(r => r.addEventListener('change', fillCategories));
$('#list').addEventListener('click', e => {
  const id = e.target.dataset.id;
  if (id && confirm('Excluir este lançamento?')) { txs = txs.filter(t => t.id != id); save(); render(); }
});
$('#prev').onclick = () => shiftMonth(-1);
$('#next').onclick = () => shiftMonth(1);

// Backup
$('#export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(txs, null, 2)], { type: 'application/json' }));
  a.download = `livro-caixa-${todayStr()}.json`;
  a.click();
};
$('#import').onchange = async e => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(data)) throw 0;
    if (confirm('Isto substitui os dados atuais. Continuar?')) { txs = data; save(); render(); }
  } catch { alert('Arquivo de backup inválido.'); }
  e.target.value = '';
};

$('#date').value = todayStr();
fillCategories();
render();
