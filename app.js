/* ===================== STATE ===================== */
const DB_KEY = 'ledger_db_v1';
let db = load();

function load(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return { accounts:[], transactions:[], loans:[] };
}
function save(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function fmt(n){
  const sign = n<0 ? '-' : '';
  return sign + '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');
}
function fmtDate(iso){
  const d = new Date(iso+'T00:00:00');
  return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
}
function toast(msg){
  const t = document.createElement('div');
  t.className='toast'; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),1800);
}

const CATS = ['Food','Travel','Bills','Shopping','Health','Entertainment','Groceries','Rent','Fuel','Education','Other'];
const ACC_TYPES = [
  {k:'bank', label:'Bank Account', icon:'🏦'},
  {k:'wallet', label:'Cash Wallet', icon:'💵'},
  {k:'credit', label:'Credit Card', icon:'💳'},
  {k:'debit', label:'Debit Card', icon:'🔷'},
];
function accIcon(type){ return (ACC_TYPES.find(t=>t.k===type)||{}).icon || '💰'; }
function accLabel(type){ return (ACC_TYPES.find(t=>t.k===type)||{}).label || type; }
function getAcc(id){ return db.accounts.find(a=>a.id===id); }

/* ===================== DERIVED TOTALS ===================== */
function totals(){
  let netWorth=0, cardOwed=0, cashLiquid=0;
  db.accounts.forEach(a=>{
    if(a.type==='credit'){ cardOwed += a.balance; netWorth -= a.balance; }
    else { cashLiquid += a.balance; netWorth += a.balance; }
  });
  const outstandingLent = db.loans.filter(l=>!l.closed).reduce((s,l)=>s + (l.principal - l.repaid), 0);
  const thisMonth = todayISO().slice(0,7);
  const monthExpense = db.transactions.filter(t=>t.type==='expense' && t.date.slice(0,7)===thisMonth)
    .reduce((s,t)=>s+t.amount,0);
  return {netWorth, cardOwed, cashLiquid, outstandingLent, monthExpense};
}

/* ===================== NAVIGATION ===================== */
let activeTab = 'dashboard';
function setTab(tab){
  activeTab = tab;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('hidden', p.id!== 'page-'+tab));
  renderAll();
}

/* ===================== RENDER: DASHBOARD ===================== */
function renderDashboard(){
  const t = totals();
  document.getElementById('heroAmount').textContent = fmt(t.netWorth);
  document.getElementById('statOwed').textContent = fmt(t.cardOwed);
  document.getElementById('statLent').textContent = fmt(t.outstandingLent);
  document.getElementById('statMonth').textContent = fmt(t.monthExpense);
  document.getElementById('statCash').textContent = fmt(t.cashLiquid);

  const recent = [...db.transactions].sort((a,b)=> b.date.localeCompare(a.date) || b.createdAt-a.createdAt).slice(0,6);
  const wrap = document.getElementById('recentList');
  wrap.innerHTML='';
  if(recent.length===0){
    wrap.innerHTML = '<div class="empty">No transactions yet. Tap + to add your first one.</div>';
  } else {
    recent.forEach(tx=> wrap.appendChild(txRow(tx)));
  }
}

function txMeta(tx){
  const map = {
    expense:{icon:'🧾', cls:'neg', sign:'-'},
    income:{icon:'⬇️', cls:'pos', sign:'+'},
    transfer:{icon:'↔️', cls:'neutral', sign:''},
    lend:{icon:'🤝', cls:'neg', sign:'-'},
    purchase_for_other:{icon:'🎁', cls:'neg', sign:'-'},
    repay_in:{icon:'✅', cls:'pos', sign:'+'},
  };
  return map[tx.type] || {icon:'•',cls:'neutral',sign:''};
}
function txTitle(tx){
  if(tx.type==='expense') return tx.category || 'Expense';
  if(tx.type==='income') return tx.note || 'Income';
  if(tx.type==='transfer') return 'Transfer';
  if(tx.type==='lend') return 'Lent to ' + (tx.person||'—');
  if(tx.type==='purchase_for_other') return 'Paid for ' + (tx.person||'—');
  if(tx.type==='repay_in') return (tx.person||'—') + ' repaid you';
  return tx.type;
}
function txSub(tx){
  const acc = getAcc(tx.accountId);
  const accName = acc ? acc.name : '—';
  if(tx.type==='transfer'){
    const to = getAcc(tx.toAccountId);
    return accName + ' → ' + (to?to.name:'—');
  }
  return accName + (tx.note ? ' · '+tx.note : '');
}
function txRow(tx){
  const meta = txMeta(tx);
  const div = document.createElement('div');
  div.className='row';
  div.innerHTML = `
    <div class="icon">${meta.icon}</div>
    <div class="mid">
      <div class="t1">${escapeHtml(txTitle(tx))}</div>
      <div class="t2">${escapeHtml(txSub(tx))} · ${fmtDate(tx.date)}</div>
    </div>
    <div class="amt ${meta.cls}">${meta.sign}${fmt(tx.amount)}</div>
  `;
  div.onclick = ()=> openTxDetail(tx.id);
  return div;
}
function escapeHtml(s){ return (s||'').toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ===================== RENDER: ACCOUNTS ===================== */
function renderAccounts(){
  const wrap = document.getElementById('accountsList');
  wrap.innerHTML='';
  if(db.accounts.length===0){
    wrap.innerHTML = '<div class="empty">No accounts yet. Tap "Add account" to add your banks, cards and wallet.</div>';
    return;
  }
  const order = {bank:0,debit:1,credit:2,wallet:3};
  const sorted = [...db.accounts].sort((a,b)=>order[a.type]-order[b.type]);
  sorted.forEach(a=>{
    const div = document.createElement('div');
    div.className='acc-card';
    let limLine = '';
    if(a.type==='credit' && a.creditLimit){
      const avail = a.creditLimit - a.balance;
      limLine = `Available ${fmt(avail)} of ${fmt(a.creditLimit)}`;
    }
    div.innerHTML = `
      <div class="left">
        <div class="name">${accIcon(a.type)} ${escapeHtml(a.name)}</div>
        <div class="type">${accLabel(a.type)}${a.last4? ' · ••'+a.last4:''}</div>
      </div>
      <div class="right">
        <div class="bal">${a.type==='credit' ? fmt(-a.balance) : fmt(a.balance)}</div>
        ${limLine? `<div class="lim">${limLine}</div>`:''}
      </div>
    `;
    div.onclick = ()=> openAccountSheet(a.id);
    wrap.appendChild(div);
  });
}

/* ===================== RENDER: TRANSACTIONS ===================== */
function renderTransactions(){
  const wrap = document.getElementById('txList');
  wrap.innerHTML='';
  const filterVal = document.getElementById('txFilter').value;
  let list = [...db.transactions].sort((a,b)=> b.date.localeCompare(a.date) || b.createdAt-a.createdAt);
  if(filterVal!=='all') list = list.filter(t=>t.type===filterVal);
  if(list.length===0){
    wrap.innerHTML = '<div class="empty">No transactions match this filter.</div>';
    return;
  }
  let lastMonth='';
  list.forEach(tx=>{
    const m = tx.date.slice(0,7);
    if(m!==lastMonth){
      lastMonth=m;
      const h = document.createElement('div');
      h.className='section-head'; h.style.margin='16px 0 4px';
      const label = new Date(m+'-01').toLocaleDateString('en-IN',{month:'long',year:'numeric'});
      h.innerHTML = `<h2>${label}</h2>`;
      wrap.appendChild(h);
    }
    wrap.appendChild(txRow(tx));
  });
}

/* ===================== RENDER: LENDING ===================== */
function renderLending(){
  const wrap = document.getElementById('loansList');
  wrap.innerHTML='';
  const open = db.loans.filter(l=>!l.closed);
  const closed = db.loans.filter(l=>l.closed);
  const totalOut = open.reduce((s,l)=>s+(l.principal-l.repaid),0);
  document.getElementById('lendingTotal').textContent = fmt(totalOut);

  if(db.loans.length===0){
    wrap.innerHTML = '<div class="empty">No lending records yet. Track money you lend to people here.</div>';
    return;
  }
  [...open, ...closed].forEach(l=>{
    const remaining = l.principal - l.repaid;
    const div = document.createElement('div');
    div.className='row';
    div.innerHTML = `
      <div class="icon">🤝</div>
      <div class="mid">
        <div class="t1">${escapeHtml(l.person)} <span class="badge ${l.closed?'closed':'open'}">${l.closed?'Settled':'Open'}</span></div>
        <div class="t2">Lent ${fmt(l.principal)} on ${fmtDate(l.date)} ${l.repaid>0?'· repaid '+fmt(l.repaid):''}</div>
      </div>
      <div class="amt ${l.closed?'pos':'neg'}">${l.closed? 'Settled' : fmt(remaining)}</div>
    `;
    div.onclick = ()=> openLoanDetail(l.id);
    wrap.appendChild(div);
  });
}

/* ===================== RENDER ALL ===================== */
function renderAll(){
  fillAccountSelects();
  if(activeTab==='dashboard') renderDashboard();
  if(activeTab==='accounts') renderAccounts();
  if(activeTab==='transactions') renderTransactions();
  if(activeTab==='lending') renderLending();
}

/* ===================== SHEETS (MODALS) ===================== */
function openSheet(html){
  const backdrop = document.createElement('div');
  backdrop.className='sheet-backdrop';
  backdrop.onclick = (e)=>{ if(e.target===backdrop) closeSheet(); };
  backdrop.innerHTML = `<div class="sheet">
    <button class="close-x" onclick="closeSheet()">✕</button>
    <div class="sheet-handle"></div>
    ${html}
  </div>`;
  document.getElementById('sheetRoot').appendChild(backdrop);
}
function closeSheet(){
  document.getElementById('sheetRoot').innerHTML='';
}

function fillAccountSelects(){
  document.querySelectorAll('.acc-select').forEach(sel=>{
    const cur = sel.value;
    sel.innerHTML = db.accounts.map(a=>`<option value="${a.id}">${accIcon(a.type)} ${escapeHtml(a.name)}</option>`).join('');
    if(cur) sel.value = cur;
  });
}

/* ---------- ADD ACCOUNT ---------- */
function openAddAccountSheet(){
  openSheet(`
    <h3>Add account</h3>
    <div class="field"><label>Type</label>
      <div class="seg" id="accTypeSeg">
        ${ACC_TYPES.map((t,i)=>`<button data-v="${t.k}" class="${i===0?'active':''}">${t.icon} ${t.label}</button>`).join('')}
      </div>
    </div>
    <div class="field"><label>Name</label><input id="accName" placeholder="e.g. HDFC Savings"></div>
    <div class="row-2">
      <div class="field"><label>Bank / Issuer</label><input id="accBank" placeholder="e.g. HDFC"></div>
      <div class="field"><label>Last 4 digits</label><input id="accLast4" maxlength="4" placeholder="1234"></div>
    </div>
    <div class="field"><label id="balLabel">Current balance</label><input id="accBalance" type="number" placeholder="0"></div>
    <div class="field" id="limitField"><label>Credit limit</label><input id="accLimit" type="number" placeholder="0"></div>
    <button class="btn-primary" onclick="saveAccount()">Save account</button>
  `);
  let selectedType = 'bank';
  document.querySelectorAll('#accTypeSeg button').forEach(b=>{
    b.onclick = ()=>{
      document.querySelectorAll('#accTypeSeg button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      selectedType = b.dataset.v;
      document.getElementById('limitField').style.display = selectedType==='credit' ? 'block':'none';
      document.getElementById('balLabel').textContent = selectedType==='credit' ? 'Current amount owed' : 'Current balance';
      document.getElementById('accTypeSeg').dataset.selected = selectedType;
    };
  });
  document.getElementById('accTypeSeg').dataset.selected='bank';
  document.getElementById('limitField').style.display='none';
}
function saveAccount(){
  const type = document.getElementById('accTypeSeg').dataset.selected || 'bank';
  const name = document.getElementById('accName').value.trim();
  if(!name){ toast('Enter an account name'); return; }
  const acc = {
    id: uid(),
    type,
    name,
    bank: document.getElementById('accBank').value.trim(),
    last4: document.getElementById('accLast4').value.trim(),
    balance: parseFloat(document.getElementById('accBalance').value)||0,
    creditLimit: parseFloat(document.getElementById('accLimit').value)||0,
  };
  db.accounts.push(acc);
  save(); closeSheet(); renderAll();
  toast('Account added');
}

function openAccountSheet(id){
  const a = getAcc(id);
  if(!a) return;
  openSheet(`
    <h3>${accIcon(a.type)} ${escapeHtml(a.name)}</h3>
    <div class="field"><label>${a.type==='credit'?'Amount owed':'Balance'}</label>
      <input id="editBalance" type="number" value="${a.balance}"></div>
    ${a.type==='credit' ? `<div class="field"><label>Credit limit</label><input id="editLimit" type="number" value="${a.creditLimit||0}"></div>`:''}
    <button class="btn-primary" onclick="updateAccount('${id}')">Save changes</button>
    <button class="btn-secondary btn-danger" onclick="deleteAccount('${id}')">Delete account</button>
  `);
}
function updateAccount(id){
  const a = getAcc(id);
  a.balance = parseFloat(document.getElementById('editBalance').value)||0;
  const limEl = document.getElementById('editLimit');
  if(limEl) a.creditLimit = parseFloat(limEl.value)||0;
  save(); closeSheet(); renderAll();
  toast('Account updated');
}
function deleteAccount(id){
  db.accounts = db.accounts.filter(a=>a.id!==id);
  db.transactions = db.transactions.filter(t=>t.accountId!==id && t.toAccountId!==id);
  save(); closeSheet(); renderAll();
  toast('Account deleted');
}

/* ---------- ADD TRANSACTION ---------- */
const TX_TYPES = [
  {k:'expense', label:'Expense'},
  {k:'income', label:'Income'},
  {k:'transfer', label:'Transfer'},
  {k:'lend', label:'Lend money'},
  {k:'purchase_for_other', label:'Pay for someone'},
  {k:'repay_in', label:'Receive repayment'},
];
function openAddTxSheet(){
  if(db.accounts.length===0){
    toast('Add an account first');
    openAddAccountSheet();
    return;
  }
  openSheet(`
    <h3>Add transaction</h3>
    <div class="seg" id="txTypeSeg">
      ${TX_TYPES.map((t,i)=>`<button data-v="${t.k}" class="${i===0?'active':''}">${t.label}</button>`).join('')}
    </div>
    <div id="txFormBody"></div>
  `);
  document.getElementById('txTypeSeg').dataset.selected='expense';
  document.querySelectorAll('#txTypeSeg button').forEach(b=>{
    b.onclick=()=>{
      document.querySelectorAll('#txTypeSeg button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      document.getElementById('txTypeSeg').dataset.selected = b.dataset.v;
      renderTxForm(b.dataset.v);
    };
  });
  renderTxForm('expense');
}
function renderTxForm(type){
  const body = document.getElementById('txFormBody');
  const accOptions = ()=> `<select class="acc-select" id="txAccount"></select>`;
  let extra='';
  if(type==='expense'){
    extra = `
      <div class="field"><label>Account / Card used</label>${accOptions()}</div>
      <div class="field"><label>Category</label>
        <select id="txCategory">${CATS.map(c=>`<option>${c}</option>`).join('')}</select>
      </div>`;
  } else if(type==='income'){
    extra = `<div class="field"><label>Into account</label>${accOptions()}</div>`;
  } else if(type==='transfer'){
    extra = `
      <div class="field"><label>From account</label>${accOptions()}</div>
      <div class="field"><label>To account</label><select class="acc-select" id="txToAccount"></select></div>`;
  } else if(type==='lend'){
    extra = `
      <div class="field"><label>From account</label>${accOptions()}</div>
      <div class="field"><label>Person's name</label><input id="txPerson" placeholder="Who did you lend to?"></div>`;
  } else if(type==='purchase_for_other'){
    extra = `
      <div class="field"><label>Card / account used</label>${accOptions()}</div>
      <div class="field"><label>Person's name</label><input id="txPerson" placeholder="Who is this for?"></div>`;
  } else if(type==='repay_in'){
    const openLoans = db.loans.filter(l=>!l.closed);
    extra = `
      <div class="field"><label>Into account</label>${accOptions()}</div>
      <div class="field"><label>From person (optional loan link)</label>
        <select id="txLoanLink"><option value="">— Not linked / general —</option>
        ${openLoans.map(l=>`<option value="${l.id}">${escapeHtml(l.person)} (owes ${fmt(l.principal-l.repaid)})</option>`).join('')}
        </select>
      </div>
      <div class="field hidden" id="manualPersonField"><label>Person's name</label><input id="txPerson" placeholder="Name"></div>`;
  }
  body.innerHTML = `
    <div class="field"><label>Amount</label><input id="txAmount" type="number" placeholder="0"></div>
    ${extra}
    <div class="field"><label>Date</label><input id="txDate" type="date" value="${todayISO()}"></div>
    <div class="field"><label>Note (optional)</label><input id="txNote" placeholder="Add a note"></div>
    <button class="btn-primary" onclick="saveTx('${type}')">Save transaction</button>
  `;
  fillAccountSelects();
  if(type==='repay_in'){
    const linkSel = document.getElementById('txLoanLink');
    linkSel.onchange = ()=>{
      document.getElementById('manualPersonField').classList.toggle('hidden', !!linkSel.value);
    };
  }
}
function saveTx(type){
  const amount = parseFloat(document.getElementById('txAmount').value);
  if(!amount || amount<=0){ toast('Enter a valid amount'); return; }
  const date = document.getElementById('txDate').value || todayISO();
  const note = document.getElementById('txNote').value.trim();
  const base = { id: uid(), type, amount, date, note, createdAt: Date.now() };

  if(type==='expense'){
    const accountId = document.getElementById('txAccount').value;
    const acc = getAcc(accountId);
    const category = document.getElementById('txCategory').value;
    if(acc.type==='credit') acc.balance += amount; else acc.balance -= amount;
    db.transactions.push({...base, accountId, category});
  } else if(type==='income'){
    const accountId = document.getElementById('txAccount').value;
    getAcc(accountId).balance += amount;
    db.transactions.push({...base, accountId});
  } else if(type==='transfer'){
    const accountId = document.getElementById('txAccount').value;
    const toAccountId = document.getElementById('txToAccount').value;
    if(accountId===toAccountId){ toast('Choose two different accounts'); return; }
    const from = getAcc(accountId), to = getAcc(toAccountId);
    if(from.type==='credit') from.balance -= amount; else from.balance -= amount;
    if(to.type==='credit') to.balance -= amount; else to.balance += amount;
    db.transactions.push({...base, accountId, toAccountId});
  } else if(type==='lend'){
    const accountId = document.getElementById('txAccount').value;
    const person = document.getElementById('txPerson').value.trim() || 'Unknown';
    const acc = getAcc(accountId);
    if(acc.type==='credit') acc.balance += amount; else acc.balance -= amount;
    const loanId = uid();
    db.loans.push({id:loanId, person, principal:amount, repaid:0, date, notes:note, closed:false});
    db.transactions.push({...base, accountId, person, loanId});
  } else if(type==='purchase_for_other'){
    const accountId = document.getElementById('txAccount').value;
    const person = document.getElementById('txPerson').value.trim() || 'Unknown';
    const acc = getAcc(accountId);
    if(acc.type==='credit') acc.balance += amount; else acc.balance -= amount;
    const loanId = uid();
    db.loans.push({id:loanId, person, principal:amount, repaid:0, date, notes:'Paid on their behalf: '+note, closed:false});
    db.transactions.push({...base, accountId, person, loanId});
  } else if(type==='repay_in'){
    const accountId = document.getElementById('txAccount').value;
    const loanId = document.getElementById('txLoanLink').value;
    let person = '';
    getAcc(accountId).balance += amount;
    if(loanId){
      const loan = db.loans.find(l=>l.id===loanId);
      loan.repaid += amount;
      person = loan.person;
      if(loan.repaid >= loan.principal) loan.closed = true;
    } else {
      person = document.getElementById('txPerson') ? document.getElementById('txPerson').value.trim() : '';
    }
    db.transactions.push({...base, accountId, person, loanId: loanId||null});
  }
  save(); closeSheet(); renderAll();
  toast('Saved');
}

function openTxDetail(id){
  const tx = db.transactions.find(t=>t.id===id);
  if(!tx) return;
  openSheet(`
    <h3>${escapeHtml(txTitle(tx))}</h3>
    <p style="color:var(--text-dim);font-size:13px;margin:0 0 14px;">${fmtDate(tx.date)} · ${escapeHtml(txSub(tx))}</p>
    <div class="hero" style="padding:16px;margin-bottom:14px;">
      <div class="amount">${fmt(tx.amount)}</div>
    </div>
    ${tx.note ? `<p style="font-size:14px;color:var(--text-dim);">Note: ${escapeHtml(tx.note)}</p>` : ''}
    <button class="btn-secondary btn-danger" onclick="deleteTx('${id}')">Delete transaction</button>
  `);
}
function deleteTx(id){
  const tx = db.transactions.find(t=>t.id===id);
  if(!tx) return;
  // reverse the balance effect
  if(tx.type==='expense'){
    const acc = getAcc(tx.accountId);
    if(acc) acc.type==='credit' ? acc.balance-=tx.amount : acc.balance+=tx.amount;
  } else if(tx.type==='income'){
    const acc = getAcc(tx.accountId);
    if(acc) acc.balance -= tx.amount;
  } else if(tx.type==='transfer'){
    const from = getAcc(tx.accountId), to = getAcc(tx.toAccountId);
    if(from) from.balance += tx.amount;
    if(to) to.type==='credit' ? to.balance+=tx.amount : to.balance-=tx.amount;
  } else if(tx.type==='lend' || tx.type==='purchase_for_other'){
    const acc = getAcc(tx.accountId);
    if(acc) acc.type==='credit' ? acc.balance-=tx.amount : acc.balance+=tx.amount;
    if(tx.loanId){
      db.loans = db.loans.filter(l=>l.id!==tx.loanId);
    }
  } else if(tx.type==='repay_in'){
    const acc = getAcc(tx.accountId);
    if(acc) acc.balance -= tx.amount;
    if(tx.loanId){
      const loan = db.loans.find(l=>l.id===tx.loanId);
      if(loan){ loan.repaid -= tx.amount; loan.closed=false; }
    }
  }
  db.transactions = db.transactions.filter(t=>t.id!==id);
  save(); closeSheet(); renderAll();
  toast('Transaction deleted');
}

/* ---------- LOAN DETAIL ---------- */
function openLoanDetail(id){
  const l = db.loans.find(x=>x.id===id);
  if(!l) return;
  const remaining = l.principal - l.repaid;
  openSheet(`
    <h3>🤝 ${escapeHtml(l.person)}</h3>
    <div class="hero" style="padding:16px;margin-bottom:14px;">
      <div class="label">Outstanding</div>
      <div class="amount">${l.closed?'Settled ✅':fmt(remaining)}</div>
      <div class="sub">
        <div>Lent<span class="val">${fmt(l.principal)}</span></div>
        <div>Repaid<span class="val">${fmt(l.repaid)}</span></div>
        <div>Date<span class="val">${fmtDate(l.date)}</span></div>
      </div>
    </div>
    ${!l.closed ? `
    <div class="field"><label>Record a repayment</label><input id="loanRepayAmt" type="number" placeholder="Amount received"></div>
    <div class="field"><label>Into account</label><select class="acc-select" id="loanRepayAcc"></select></div>
    <button class="btn-primary" onclick="recordLoanRepay('${id}')">Record repayment</button>
    <button class="btn-secondary" onclick="markLoanClosed('${id}')">Mark fully settled</button>
    ` : ''}
    <button class="btn-secondary btn-danger" onclick="deleteLoan('${id}')">Delete record</button>
  `);
  fillAccountSelects();
}
function recordLoanRepay(id){
  const l = db.loans.find(x=>x.id===id);
  const amount = parseFloat(document.getElementById('loanRepayAmt').value);
  const accountId = document.getElementById('loanRepayAcc').value;
  if(!amount || amount<=0){ toast('Enter a valid amount'); return; }
  getAcc(accountId).balance += amount;
  l.repaid += amount;
  if(l.repaid >= l.principal) l.closed = true;
  db.transactions.push({id:uid(), type:'repay_in', amount, date:todayISO(), note:'', accountId, person:l.person, loanId:l.id, createdAt:Date.now()});
  save(); closeSheet(); renderAll();
  toast('Repayment recorded');
}
function markLoanClosed(id){
  const l = db.loans.find(x=>x.id===id);
  l.closed = true; l.repaid = l.principal;
  save(); closeSheet(); renderAll();
  toast('Marked as settled');
}
function deleteLoan(id){
  db.loans = db.loans.filter(l=>l.id!==id);
  db.transactions = db.transactions.filter(t=>t.loanId!==id);
  save(); closeSheet(); renderAll();
  toast('Loan record deleted');
}

/* ===================== INIT ===================== */
window.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('.tab').forEach(b=> b.onclick = ()=> setTab(b.dataset.tab));
  document.getElementById('fab').onclick = openAddTxSheet;
  document.getElementById('addAccountBtn').onclick = openAddAccountSheet;
  document.getElementById('txFilter').onchange = renderTransactions;
  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});
  setTab('dashboard');

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  }
});
