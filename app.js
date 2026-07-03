/* ===================== STATE ===================== */
const DB_KEY = 'ledger_db_v1';
let db = load();

function load(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(!parsed.people) parsed.people = [];
      return parsed;
    }
  }catch(e){}
  return { accounts:[], transactions:[], loans:[], people:[] };
}
function save(){
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  cloudPush();
}
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

function personKey(name){ return (name||'Unknown').trim().toLowerCase(); }

function getOrCreatePerson(rawName){
  const name = (rawName||'').trim();
  if(!name) return 'Unknown';
  const key = personKey(name);
  let p = db.people.find(x=>personKey(x.name)===key);
  if(!p){
    p = {id:uid(), name};
    db.people.push(p);
  }
  return p.name;
}
function fillPeopleDatalist(){
  const dl = document.getElementById('peopleDatalist');
  if(!dl) return;
  dl.innerHTML = db.people.map(p=>`<option value="${escapeHtml(p.name)}">`).join('');
}

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

/* ===================== RENDER: LENDING (People, like an accounts list) ===================== */
function allPeopleGrouped(){
  const map = {};
  db.people.forEach(p=>{
    map[personKey(p.name)] = { key: personKey(p.name), display: p.name, loans: [] };
  });
  db.loans.forEach(l=>{
    const key = personKey(l.person);
    if(!map[key]) map[key] = { key, display: l.person || 'Unknown', loans: [] };
    map[key].loans.push(l);
  });
  return Object.values(map).map(g=>{
    const totalPrincipal = g.loans.reduce((s,l)=>s+l.principal,0);
    const totalRepaid = g.loans.reduce((s,l)=>s+l.repaid,0);
    const outstanding = g.loans.reduce((s,l)=>s+(l.principal-l.repaid),0);
    const allClosed = g.loans.length>0 && g.loans.every(l=>l.closed);
    const lastDate = g.loans.reduce((max,l)=> l.date>max?l.date:max, '0000-00-00');
    return { ...g, totalPrincipal, totalRepaid, outstanding, allClosed, hasLoans: g.loans.length>0, lastDate };
  }).sort((a,b)=> (b.outstanding>0)-(a.outstanding>0) || b.lastDate.localeCompare(a.lastDate) || a.display.localeCompare(b.display));
}

function renderLending(){
  const wrap = document.getElementById('loansList');
  wrap.innerHTML='';
  const groups = allPeopleGrouped();
  const totalOut = groups.reduce((s,g)=>s+g.outstanding,0);
  document.getElementById('lendingTotal').textContent = fmt(totalOut);

  if(groups.length===0){
    wrap.innerHTML = '<div class="empty">No people added yet. Tap "+ Add person" to start tracking who you lend to.</div>';
    return;
  }
  groups.forEach(g=>{
    const div = document.createElement('div');
    div.className='row';
    const isDebt = g.outstanding < 0;
    const statusBadge = g.hasLoans ? `<span class="badge ${g.allClosed?'closed':'open'}">${g.allClosed?'Settled':'Open'}</span>` : `<span class="badge">No loans yet</span>`;
    const subLine = g.hasLoans
      ? `${g.loans.length} loan${g.loans.length>1?'s':''} · lent ${fmt(g.totalPrincipal)} total${g.totalRepaid>0?' · repaid '+fmt(g.totalRepaid):''}`
      : 'Tap to record a lend for them';
    const amtClass = isDebt ? 'debt' : (g.allClosed || !g.hasLoans ? 'pos' : 'neg');
    const amtText = isDebt ? `You owe ${fmt(-g.outstanding)}` : (g.hasLoans ? (g.allClosed?'Settled':fmt(g.outstanding)) : '');
    div.innerHTML = `
      <div class="icon">🤝</div>
      <div class="mid">
        <div class="t1">${escapeHtml(g.display)} ${statusBadge}</div>
        <div class="t2">${subLine}</div>
      </div>
      <div class="amt ${amtClass}">${amtText}</div>
    `;
    div.onclick = ()=> openPersonDetail(g.key);
    wrap.appendChild(div);
  });
}

function openAddPersonSheet(){
  openSheet(`
    <h3>Add person</h3>
    <div class="field"><label>Name</label><input id="personName" placeholder="e.g. Arun"></div>
    <button class="btn-primary" onclick="savePerson()">Save person</button>
  `);
}
function savePerson(){
  const name = document.getElementById('personName').value.trim();
  if(!name){ toast('Enter a name'); return; }
  getOrCreatePerson(name);
  save(); closeSheet(); renderAll();
  toast('Person added');
}

function openPersonDetail(key){
  const g = allPeopleGrouped().find(x=>x.key===key);
  if(!g) return;
  const history = db.transactions
    .filter(t=> (t.type==='lend'||t.type==='purchase_for_other'||t.type==='repay_in') && personKey(t.person)===key)
    .sort((a,b)=> b.date.localeCompare(a.date) || b.createdAt-a.createdAt);
  const openLoans = g.loans.filter(l=>!l.closed);
  const isDebt = g.outstanding < 0;

  let paybackSection = '';
  if(isDebt){
    paybackSection = `
      <div class="field"><label>Pay back (reduce debt)</label><input id="personPaybackAmt" type="number" placeholder="Amount to pay"></div>
      <div class="field"><label>From account</label><select class="acc-select" id="personPaybackAcc"></select></div>
      <button class="btn-primary" onclick="recordPayback('${key}')">Pay back</button>
    `;
  }

  let repaySection = '';
  if(openLoans.some(l => (l.principal - l.repaid) > 0)){
    repaySection = `
      <div class="field"><label>Record a repayment</label><input id="personRepayAmt" type="number" placeholder="Amount received"></div>
      <div class="field"><label>Into account</label><select class="acc-select" id="personRepayAcc"></select></div>
      <div class="field"><label>Applies to which loan</label>
        <select id="personRepayLoan">
          ${openLoans.filter(l => (l.principal - l.repaid) > 0).map(l=>`<option value="${l.id}">${fmtDate(l.date)} · ${fmt(l.principal-l.repaid)} remaining</option>`).join('')}
        </select>
      </div>
      <button class="btn-primary" onclick="recordPersonRepay('${key}')">Record repayment</button>
    `;
  }

  openSheet(`
    <h3>🤝 ${escapeHtml(g.display)}</h3>
    <div class="hero" style="padding:16px;margin-bottom:14px;">
      <div class="label">${isDebt ? 'You owe' : 'Outstanding'}</div>
      <div class="amount ${isDebt ? 'debt' : ''}">${isDebt ? fmt(-g.outstanding) : (g.hasLoans ? (g.allClosed?'Settled ✅':fmt(g.outstanding)) : fmt(0))}</div>
      <div class="sub">
        <div>Total lent<span class="val">${fmt(g.totalPrincipal)}</span></div>
        <div>Total repaid<span class="val">${fmt(g.totalRepaid)}</span></div>
      </div>
    </div>

    ${repaySection}
    ${paybackSection}

    <div class="section-head" style="margin-top:18px;"><h2>History</h2></div>
    <div class="tape" id="personHistoryList"></div>

    <div class="section-head" style="margin-top:18px;"><h2>Manage contact</h2></div>
    <div class="field"><label>Rename</label><input id="personRenameInput" value="${escapeHtml(g.display)}"></div>
    <button class="btn-secondary" onclick="renamePerson('${key}')">Save name</button>
    ${!g.hasLoans ? `<button class="btn-secondary btn-danger" onclick="removePersonContact('${key}')">Remove person</button>` : ''}
  `);
  fillAccountSelects();

  const histWrap = document.getElementById('personHistoryList');
  if(history.length===0){
    histWrap.innerHTML = '<div class="empty">No transactions recorded yet.</div>';
  } else {
    history.forEach(tx=> histWrap.appendChild(txRow(tx)));
  }
}

function recordPersonRepay(key){
  const amount = parseFloat(document.getElementById('personRepayAmt').value);
  const accountId = document.getElementById('personRepayAcc').value;
  const loanId = document.getElementById('personRepayLoan').value;
  if(!amount || amount<=0){ toast('Enter a valid amount'); return; }
  const l = db.loans.find(x=>x.id===loanId);
  if(!l) return;
  const acc = getAcc(accountId);
  if(acc.type==='credit') acc.balance -= amount;
  else acc.balance += amount;
  l.repaid += amount;
  db.transactions.push({id:uid(), type:'repay_in', amount, date:todayISO(), note:'', accountId, person:l.person, loanId:l.id, createdAt:Date.now()});
  save(); closeSheet(); renderAll();
  toast('Repayment recorded');
  openPersonDetail(key);
}

function recordPayback(key){
  const amount = parseFloat(document.getElementById('personPaybackAmt').value);
  const accountId = document.getElementById('personPaybackAcc').value;
  if(!amount || amount<=0){ toast('Enter a valid amount'); return; }
  const personName = db.people.find(p=>personKey(p.name)===key)?.name || key;
  const acc = getAcc(accountId);
  if(acc.type==='credit') acc.balance += amount;
  else acc.balance -= amount;
  const loanId = uid();
  db.loans.push({id:loanId, person:personName, principal:amount, repaid:0, date:todayISO(), notes:'Payback (debt repayment)', closed:false});
  db.transactions.push({id:uid(), type:'lend', amount, date:todayISO(), note:'Payback', accountId, person:personName, loanId});
  save(); closeSheet(); renderAll();
  toast('Payback recorded');
  openPersonDetail(key);
}

function renamePerson(oldKey){
  const newName = document.getElementById('personRenameInput').value.trim();
  if(!newName){ toast('Enter a name'); return; }
  const newKey = personKey(newName);
  let p = db.people.find(x=>personKey(x.name)===oldKey);
  if(p) p.name = newName; else db.people.push({id:uid(), name:newName});
  db.loans.forEach(l=>{ if(personKey(l.person)===oldKey) l.person = newName; });
  db.transactions.forEach(t=>{ if(t.person && personKey(t.person)===oldKey) t.person = newName; });
  save(); closeSheet(); renderAll();
  toast('Renamed');
  openPersonDetail(newKey);
}
function removePersonContact(key){
  db.people = db.people.filter(p=>personKey(p.name)!==key);
  save(); closeSheet(); renderAll();
  toast('Person removed');
}

/* ===================== RENDER ALL ===================== */
function renderAll(){
  fillAccountSelects();
  fillPeopleDatalist();
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

/* ===================== SMART REPAYMENT DISTRIBUTOR ===================== */
function applyRepaymentToPerson(rawPerson, amount, accountId, date, note) {
  const person = getOrCreatePerson(rawPerson);
  const personKeyVal = personKey(person);

  // Get all open loans (not fully repaid, not marked closed) for this person
  let openLoans = db.loans.filter(l => 
    personKey(l.person) === personKeyVal && 
    !l.closed && 
    l.repaid < l.principal
  );
  // Sort oldest first (FIFO)
  openLoans.sort((a, b) => a.date.localeCompare(b.date));

  let remaining = amount;

  for (let loan of openLoans) {
    let outstanding = loan.principal - loan.repaid;
    if (remaining <= outstanding) {
      loan.repaid += remaining;
      if (loan.repaid >= loan.principal) loan.closed = true;
      remaining = 0;
      break;
    } else {
      remaining -= outstanding;
      loan.repaid = loan.principal;
      loan.closed = true;
    }
  }

  // If there's still remaining money after clearing all open loans
  if (remaining > 0) {
    // Apply excess to the most recent loan (to create a negative balance / debt)
    let targetLoan = null;
    // Get all loans for this person sorted by date
    let allLoans = db.loans.filter(l => personKey(l.person) === personKeyVal);
    allLoans.sort((a, b) => a.date.localeCompare(b.date));
    
    if (allLoans.length > 0) {
      targetLoan = allLoans[allLoans.length - 1]; // most recent
      targetLoan.repaid += remaining;
      targetLoan.closed = false; // Keep it open to show debt
    } else {
      // No loans at all (rare case), create a dummy loan to hold the debt
      targetLoan = {
        id: uid(),
        person: person,
        principal: 0,
        repaid: remaining,
        date: date,
        notes: note || 'Over-repayment (debt)',
        closed: false
      };
      db.loans.push(targetLoan);
    }
  }

  // Record the transaction
  db.transactions.push({
    id: uid(),
    type: 'repay_in',
    amount: amount,
    date: date,
    note: note || '',
    accountId: accountId,
    person: person,
    loanId: null,
    createdAt: Date.now()
  });
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
  const accOptions = (withCredit=true)=> {
    let accounts = db.accounts;
    if(!withCredit) accounts = accounts.filter(a=>a.type!=='credit');
    return `<select class="acc-select" id="txAccount">${accounts.map(a=>`<option value="${a.id}">${accIcon(a.type)} ${escapeHtml(a.name)}</option>`).join('')}</select>`;
  };
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
      <div class="field"><label>Person's name</label><input id="txPerson" list="peopleDatalist" placeholder="Who did you lend to?"></div>`;
  } else if(type==='purchase_for_other'){
    extra = `
      <div class="field"><label>Card / account used</label>${accOptions()}</div>
      <div class="field"><label>Person's name</label><input id="txPerson" list="peopleDatalist" placeholder="Who is this for?"></div>`;
  } else if(type==='repay_in'){
    const openLoans = db.loans.filter(l=>!l.closed && (l.principal - l.repaid) > 0);
    extra = `
      <div class="field"><label>Into account</label>${accOptions()}</div>
      <div class="field"><label>From person (optional loan link)</label>
        <select id="txLoanLink"><option value="">— Not linked / general —</option>
        ${openLoans.map(l=>`<option value="${l.id}">${escapeHtml(l.person)} (owes ${fmt(l.principal-l.repaid)})</option>`).join('')}
        </select>
      </div>
      <div class="field hidden" id="manualPersonField"><label>Person's name</label><input id="txPerson" list="peopleDatalist" placeholder="Name"></div>`;
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
    if(linkSel){
      linkSel.onchange = ()=>{
        const manualField = document.getElementById('manualPersonField');
        if(manualField) manualField.classList.toggle('hidden', !!linkSel.value);
      };
    }
  }
}

/* ===================== SAVE TX ===================== */
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
    const acc = getAcc(accountId);
    if(acc.type==='credit') acc.balance -= amount;
    else acc.balance += amount;
    db.transactions.push({...base, accountId});
  } else if(type==='transfer'){
    const accountId = document.getElementById('txAccount').value;
    const toAccountId = document.getElementById('txToAccount').value;
    if(accountId===toAccountId){ toast('Choose two different accounts'); return; }
    const from = getAcc(accountId), to = getAcc
