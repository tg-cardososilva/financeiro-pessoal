import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm'

const SUPABASE_URL = 'https://qhpkraqrcvhhtbqjhkmm.supabase.co'
const SUPABASE_KEY = 'sb_publishable_OXgobfJOCgDy4OP2n_zKgg_tOvEa28F'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })

const $ = (id) => document.getElementById(id)
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
const state = { session: null, view: 'overview', realView: true, month: monthKey(new Date()), accounts: [], categories: [], transactions: [], loading: false, authMode: 'signin', import: null }

function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function monthKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function parseDate(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function setHidden(el, hide){el.classList.toggle('hidden', !!hide)}
function setBusy(btn,busy,label){btn.disabled=busy;btn.innerHTML=busy?`<span class="spinner"></span>${esc(label)}`:label}
function showError(msg=''){setHidden($('errorBanner'),!msg);$('errorText').textContent=msg}
function showInfo(id,msg){const el=$(id);el.textContent=msg;setHidden(el,!msg)}

async function boot(){
  $('monthPicker').value=state.month
  bindGlobalEvents()
  const { data } = await supabase.auth.getSession()
  state.session=data.session
  supabase.auth.onAuthStateChange((_e,session)=>{state.session=session;renderSession()})
  renderSession()
}

function bindGlobalEvents(){
  $('authForm').addEventListener('submit',handleAuth)
  $('togglePassword').addEventListener('click',()=>{const p=$('authPassword');p.type=p.type==='password'?'text':'password'})
  document.querySelectorAll('[data-auth]').forEach(b=>b.addEventListener('click',()=>setAuthMode(b.dataset.auth)))
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)))
  $('monthPicker').addEventListener('change',()=>{state.month=$('monthPicker').value;loadData()})
  $('viewModeBtn').addEventListener('click',()=>{state.realView=!state.realView;$('viewModeBtn').textContent=state.realView?'Visão real':'Fluxo bancário';$('viewModeBtn').classList.toggle('active',state.realView);renderMain()})
  $('newEntryBtn').addEventListener('click',openEntryModal)
  $('logoutBtn').addEventListener('click',()=>supabase.auth.signOut())
  $('menuBtn').addEventListener('click',()=>toggleSidebar(true));$('sidebarClose').addEventListener('click',()=>toggleSidebar(false));$('mobileOverlay').addEventListener('click',()=>toggleSidebar(false))
  $('retryBtn').addEventListener('click',loadData)
}

function toggleSidebar(open){$('sidebar').classList.toggle('open',open);setHidden($('mobileOverlay'),!open)}
function renderSession(){
  setHidden($('splash'),true)
  const signed=!!state.session
  setHidden($('authView'),signed);setHidden($('appView'),!signed)
  if(signed){const email=state.session.user.email||'usuario';$('userEmail').textContent=email;$('userName').textContent=email.split('@')[0];$('userAvatar').textContent=email[0].toUpperCase();loadData()}
}

function setAuthMode(mode){
  state.authMode=mode;showInfo('authMessage','')
  const map={signin:['Entrar no painel','Use seu e-mail e senha para acessar seus dados.','Entrar'],signup:['Criar acesso','Primeiro acesso: crie sua conta pessoal.','Criar conta'],reset:['Recuperar senha','Enviaremos um link seguro para definir uma nova senha.','Enviar recuperação']}
  const [title,subtitle,cta]=map[mode];$('authTitle').textContent=title;$('authSubtitle').textContent=subtitle;$('authSubmit').querySelector('span').textContent=cta
  setHidden($('passwordLabel'),mode==='reset');$('authPassword').required=mode!=='reset'
  $('authActions').innerHTML=mode==='signin'?'<button type="button" class="text-btn" data-auth="reset">Esqueci minha senha</button><button type="button" class="text-btn" data-auth="signup">Primeiro acesso</button>':'<button type="button" class="text-btn" data-auth="signin">Voltar para o login</button>'
  $('authActions').querySelectorAll('[data-auth]').forEach(b=>b.addEventListener('click',()=>setAuthMode(b.dataset.auth)))
}

async function handleAuth(e){
  e.preventDefault();const email=$('authEmail').value.trim(),password=$('authPassword').value,btn=$('authSubmit');showInfo('authMessage','');setBusy(btn,true,'Processando')
  try{
    if(state.authMode==='signin'){const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error}
    if(state.authMode==='signup'){const {error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:location.href.split('#')[0]}});if(error)throw error;showInfo('authMessage','Conta criada. Se a confirmação de e-mail estiver habilitada no Supabase, confirme o endereço antes de entrar.')}
    if(state.authMode==='reset'){const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.href.split('#')[0]});if(error)throw error;showInfo('authMessage','Link de recuperação enviado para o seu e-mail.')}
  }catch(err){showInfo('authMessage',humanError(err))}finally{setBusy(btn,false,`<span>${state.authMode==='signin'?'Entrar':state.authMode==='signup'?'Criar conta':'Enviar recuperação'}</span><b>→</b>`)}
}
function humanError(err){const msg=err?.message||String(err);if(/Invalid login credentials/i.test(msg))return 'E-mail ou senha incorretos.';if(/already registered/i.test(msg))return 'Esse e-mail já possui uma conta.';return msg}

function navigate(view){state.view=view;document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('pageTitle').textContent={overview:'Visão geral',transactions:'Transações',import:'Importar extrato',accounts:'Contas e patrimônio'}[view];toggleSidebar(false);renderMain()}

async function loadData(){
  if(!state.session)return;state.loading=true;showError('');renderMain()
  try{
    const [y,m]=state.month.split('-').map(Number), start=`${state.month}-01`, next=new Date(y,m,1), end=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-01`
    const [acc,cat,tx]=await Promise.all([
      supabase.from('accounts').select('*').eq('active',true).order('created_at'),
      supabase.from('categories').select('*').eq('active',true).order('group_name').order('name'),
      supabase.from('transactions').select('*, accounts(name,institution), categories(name,group_name)').gte('transaction_date',start).lt('transaction_date',end).order('transaction_date',{ascending:false}).limit(1000)
    ])
    const err=acc.error||cat.error||tx.error;if(err)throw err
    state.accounts=acc.data||[];state.categories=cat.data||[];state.transactions=tx.data||[]
  }catch(err){showError(humanError(err))}finally{state.loading=false;renderMain()}
}

function visibleTransactions(){
  if(state.realView)return state.transactions.filter(t=>!t.is_internal_transfer)
  const virtual=state.accounts.find(a=>a.name==='Pagamentos por terceiros')?.id
  return state.transactions.filter(t=>t.account_id!==virtual)
}

function renderMain(){
  if(state.loading){$('mainArea').innerHTML=`<div class="content-stack"><div class="skeleton-block h80"></div><div class="kpi-grid">${'<div class="skeleton-block h130"></div>'.repeat(4)}</div><div class="skeleton-block h330"></div></div>`;return}
  if(state.view==='overview')renderOverview();if(state.view==='transactions')renderTransactions();if(state.view==='import')renderImport();if(state.view==='accounts')renderAccounts()
}

function calcTotals(tx){return tx.reduce((a,t)=>{const v=Number(t.amount);if(['income','yield'].includes(t.flow_type))a.income+=Math.max(0,v);if(t.flow_type==='expense')a.expense+=Math.abs(v);if(t.flow_type==='investment')a.invest+=Math.abs(v);return a},{income:0,expense:0,invest:0})}
function categorySpend(tx){const map=new Map();tx.filter(t=>t.flow_type==='expense').forEach(t=>{const n=t.categories?.group_name||t.categories?.name||'Sem categoria';map.set(n,(map.get(n)||0)+Math.abs(Number(t.amount)))});return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6)}
function dailySeries(tx){const [y,m]=state.month.split('-').map(Number),days=new Date(y,m,0).getDate(),by=new Map();tx.forEach(t=>{if(t.flow_type==='transfer')return;const d=parseDate(t.transaction_date).getDate();by.set(d,(by.get(d)||0)+Number(t.amount))});let c=0;return Array.from({length:days},(_,i)=>{c+=by.get(i+1)||0;return c})}

function renderOverview(){
  const tx=visibleTransactions(), totals=calcTotals(tx),balance=totals.income-totals.expense-totals.invest,cats=categorySpend(tx),label=monthFmt.format(parseDate(`${state.month}-01`)),series=dailySeries(tx)
  $('mainArea').innerHTML=`<div class="content-stack">
    <section class="summary-head"><div><span class="muted">Resumo de ${esc(label)}</span><h2>${tx.length?'Seu mês em uma leitura.':'Seu painel está pronto.'}</h2></div><div class="summary-badge">✦ ${tx.length?`${tx.length} movimentações`:'Importe seu primeiro extrato'}</div></section>
    <section class="kpi-grid">${kpi('Receitas',money.format(totals.income),'Entradas reconhecidas','↓')}${kpi('Gastos reais',money.format(totals.expense),'Transferências internas excluídas','↑')}${kpi('Investimentos',money.format(totals.invest),'Aportes e movimentações patrimoniais','◇')}${kpi('Saldo financeiro',money.format(balance),'Receitas menos gastos e aportes','$',true)}</section>
    <section class="dashboard-grid primary-grid"><div class="panel chart-panel">${panelHead('Evolução do mês','Saldo financeiro acumulado')}<div class="chart-wrap">${lineChart(series)}</div></div><div class="panel budget-panel">${panelHead('Ritmo do mês','Gastos em relação às receitas')}<div class="budget-number">${totals.income?Math.round(totals.expense/totals.income*100):0}%</div><div class="progress-track"><div class="progress-value" style="width:${Math.min(100,totals.income?totals.expense/totals.income*100:0)}%"></div></div><div class="budget-stats"><div><span>Gastos</span><strong>${money.format(totals.expense)}</strong></div><div><span>Receitas</span><strong>${money.format(totals.income)}</strong></div></div><div class="budget-note">O orçamento personalizado será aplicado aqui quando você definir sua meta mensal.</div></div></section>
    <section class="dashboard-grid secondary-grid"><div class="panel">${panelHead('Gastos por categoria','Onde seu dinheiro está concentrado')}${cats.length?categoryBars(cats):empty('As categorias aparecem depois da primeira importação.')}</div><div class="panel">${panelHead('Contas acompanhadas','Fontes do seu patrimônio e fluxo',`${state.accounts.length} contas`)}<div class="account-list">${state.accounts.slice(0,5).map(accountRow).join('')}</div></div></section>
    <section class="panel">${panelHead('Últimas movimentações','Consolidação das contas','<button class="small-btn" id="goImport">⇧ Importar extrato</button>')}${tx.length?`<div class="transaction-table">${tx.slice(0,7).map(transactionRow).join('')}</div>`:empty('Nenhuma movimentação ainda.','<button class="primary-btn" id="goImport">⇧ Importar extrato</button>')}</section>
  </div>`
  document.querySelectorAll('#goImport').forEach(b=>b.addEventListener('click',()=>navigate('import')))
}
function kpi(label,value,helper,icon,accent=false){return `<div class="kpi-card ${accent?'accent':''}"><div class="kpi-top"><span>${esc(label)}</span><div class="kpi-icon">${icon}</div></div><strong>${esc(value)}</strong><small>${esc(helper)}</small></div>`}
function panelHead(title,subtitle,action=''){return `<div class="panel-head"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div>${action?action.startsWith('<')?action:`<span class="panel-tag">${esc(action)}</span>`:''}</div>`}
function empty(text,action=''){return `<div class="empty-state"><div class="empty-icon">◇</div><p>${esc(text)}</p>${action}</div>`}
function lineChart(values){const w=760,h=250,p=24;if(!values.length)return empty('Sem dados no período.');let min=Math.min(0,...values),max=Math.max(0,...values);if(min===max){max+=1;min-=1}const pts=values.map((v,i)=>{const x=p+i*(w-p*2)/Math.max(1,values.length-1),y=p+(max-v)*(h-p*2)/(max-min);return [x,y]});const d=pts.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Evolução do saldo"><line x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}" stroke="#e9ebef"/><line x1="${p}" y1="${h/2}" x2="${w-p}" y2="${h/2}" stroke="#eef0f2"/><path d="${d}" fill="none" stroke="#252b3b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="5" fill="#252b3b"/><text x="${p}" y="${h-5}" fill="#89909d" font-size="11">01</text><text x="${w/2}" y="${h-5}" text-anchor="middle" fill="#89909d" font-size="11">15</text><text x="${w-p}" y="${h-5}" text-anchor="end" fill="#89909d" font-size="11">${values.length}</text></svg>`}
function categoryBars(cats){const max=cats[0]?.[1]||1;return `<div class="category-bars">${cats.map(([n,v],i)=>`<div class="cat-bar"><div class="cat-line"><span>${esc(n)}</span><strong>${money.format(v)}</strong></div><div class="cat-track"><div class="cat-fill shade-${i}" style="width:${Math.max(3,v/max*100)}%"></div></div></div>`).join('')}</div>`}
function accountRow(a){const icon=a.account_type==='credit_card'?'▣':a.account_type==='virtual'?'⌂':'◇';return `<div class="account-row"><div class="account-icon">${icon}</div><div class="account-text"><strong>${esc(a.name)}</strong><span>${esc(a.institution.replace('_',' '))}</span></div><span>›</span></div>`}
function transactionRow(t){const pos=Number(t.amount)>0;return `<div class="transaction-row"><div class="tx-symbol ${pos?'positive':''}">${pos?'↓':'↑'}</div><div class="tx-main"><strong>${esc(t.description)}</strong><span>${esc(t.accounts?.name||'Conta')} · ${esc(t.categories?.name||t.flow_type)}</span></div><div class="tx-date">${esc(dateFmt.format(parseDate(t.transaction_date)))}</div><div class="tx-amount ${pos?'positive':''}">${pos?'+ ':''}${money.format(Number(t.amount))}</div></div>`}

function renderTransactions(){
  $('mainArea').innerHTML=`<div class="content-stack"><section class="panel"><div class="filter-bar"><label class="search-field">⌕<input id="txSearch" placeholder="Buscar transação"></label><select id="txAccount"><option value="">Todas as contas</option>${state.accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select><select id="txCategory"><option value="">Todas as categorias</option>${state.categories.filter(c=>c.kind==='expense').map(c=>`<option value="${c.id}">${esc(c.group_name)} · ${esc(c.name)}</option>`).join('')}</select><button id="txRefresh" class="icon-btn boxed">↻</button></div><div id="txList" class="transaction-table"></div></section></div>`
  const render=()=>{const q=$('txSearch').value.toLowerCase(),acc=$('txAccount').value,cat=$('txCategory').value;const rows=state.transactions.filter(t=>(!q||`${t.description} ${t.merchant||''}`.toLowerCase().includes(q))&&(!acc||t.account_id===acc)&&(!cat||t.category_id===cat));$('txList').innerHTML=rows.length?rows.map(transactionRow).join(''):empty('Nenhuma transação com esses filtros.')}
  ;['txSearch','txAccount','txCategory'].forEach(id=>$(id).addEventListener(id==='txSearch'?'input':'change',render));$('txRefresh').addEventListener('click',loadData);render()
}

function renderAccounts(){
  const activity=id=>state.transactions.filter(t=>t.account_id===id).reduce((s,t)=>s+Number(t.amount),0)
  $('mainArea').innerHTML=`<div class="content-stack"><section class="accounts-grid">${state.accounts.map(a=>`<article class="account-card"><div class="account-card-top"><div class="account-icon large">${a.account_type==='credit_card'?'▣':a.account_type==='virtual'?'⌂':'◇'}</div><span class="panel-tag">${esc(a.account_type.replace('_',' '))}</span></div><span class="muted cap">${esc(a.institution.replace('_',' '))}</span><h3>${esc(a.name)}</h3><div class="account-activity"><span>Movimento no período</span><strong>${money.format(activity(a.id))}</strong></div><div class="account-card-footer"><span>${a.include_in_net_worth?'Inclui no patrimônio':'Conta de controle'}</span><span>›</span></div></article>`).join('')}</section></div>`
}

function renderImport(){
  state.import ??={step:1,accountId:state.accounts[0]?.id||'',file:null,rows:[],message:''};const imp=state.import
  if(!state.accounts.some(a=>a.id===imp.accountId))imp.accountId=state.accounts[0]?.id||''
  const steps=`<section class="import-steps">${step('1','Arquivo',imp.step)}<div class="step-line"></div>${step('2','Conferência',imp.step)}<div class="step-line"></div>${step('3','Concluído',imp.step)}</section>`
  if(imp.step===1){$('mainArea').innerHTML=`<div class="content-stack">${steps}<section class="dashboard-grid import-grid"><div class="panel">${panelHead('Selecione o extrato','OFX e CSV são processados no seu ambiente autenticado.')}<label class="field-label">Conta de origem<select id="importAccount">${state.accounts.map(a=>`<option value="${a.id}" ${a.id===imp.accountId?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label><label class="dropzone"><div class="drop-icon">⇧</div><strong id="fileName">${imp.file?esc(imp.file.name):'Escolher arquivo'}</strong><span id="fileMeta">${imp.file?`${(imp.file.size/1024).toFixed(1)} KB`:'OFX ou CSV · até 10 MB'}</span><input id="importFile" type="file" accept=".ofx,.csv,text/csv"></label><button id="analyzeBtn" class="primary-btn full">✦ Analisar extrato</button><div id="importMessage" class="info-message ${imp.message?'':'hidden'}">${esc(imp.message)}</div></div><div class="panel">${panelHead('O que vamos verificar','Importação segura antes de gravar qualquer dado.')}<div class="check-list">${checkItem('Duplicidades','Comparamos a impressão digital de cada transação.')}${checkItem('Transferências internas','Fatura, poupança e movimentações próprias não viram gasto.')}${checkItem('Categorias','Sugerimos alimentação, transporte, moradia e outras.')}${checkItem('Confirmação','Nada novo entra no banco sem sua revisão.')}</div></div></section></div>`
    $('importAccount').addEventListener('change',e=>imp.accountId=e.target.value);$('importFile').addEventListener('change',e=>{imp.file=e.target.files?.[0]||null;renderImport()});$('analyzeBtn').addEventListener('click',analyzeImport);return
  }
  if(imp.step===2){const fresh=imp.rows.filter(r=>!r.duplicate),dup=imp.rows.filter(r=>r.duplicate);$('mainArea').innerHTML=`<div class="content-stack">${steps}<section class="panel"><div class="review-head"><div><span class="eyebrow">PRÉVIA DO EXTRATO</span><h2>${fresh.length} novas · ${dup.length} já existentes</h2><p class="muted">Revise antes de confirmar. Duplicidades ficam fora da importação.</p></div><button id="changeFile" class="secondary-btn">Trocar arquivo</button></div><div class="review-summary">${summaryChip('Novas',fresh.length)}${summaryChip('Duplicadas',dup.length)}${summaryChip('Para revisar',fresh.filter(r=>!r.category_hint).length)}</div><div class="review-table">${imp.rows.slice(0,150).map(reviewRow).join('')}</div><div class="review-actions"><button id="confirmImport" class="primary-btn" ${fresh.length?'':'disabled'}>✓ Importar ${fresh.length} novas</button></div><div id="importMessage" class="info-message ${imp.message?'':'hidden'}">${esc(imp.message)}</div></section></div>`;$('changeFile').addEventListener('click',()=>{imp.step=1;imp.rows=[];imp.message='';renderImport()});$('confirmImport').addEventListener('click',confirmImport);return}
  $('mainArea').innerHTML=`<div class="content-stack">${steps}<section class="panel success-panel"><div class="success-icon">✓</div><h2>Extrato importado.</h2><p>As transações novas foram adicionadas e as duplicidades foram ignoradas.</p><button id="importAgain" class="secondary-btn">Importar outro extrato</button></section></div>`;$('importAgain').addEventListener('click',()=>{state.import={step:1,accountId:state.accounts[0]?.id||'',file:null,rows:[],message:''};renderImport()})
}
function step(n,label,current){const done=current>Number(n),active=current===Number(n);return `<div class="step ${done?'done':''} ${active?'active':''}"><span>${done?'✓':n}</span><strong>${label}</strong></div>`}
function checkItem(title,text){return `<div class="check-item"><div>✓</div><p><strong>${esc(title)}</strong><span>${esc(text)}</span></p></div>`}
function summaryChip(label,value){return `<div class="summary-chip"><span>${esc(label)}</span><strong>${value}</strong></div>`}
function reviewRow(r){return `<div class="review-row ${r.duplicate?'duplicate':''}"><div><strong>${esc(r.description)}</strong><span>${esc(dateFmt.format(parseDate(r.transaction_date)))} · ${esc(r.category_hint||'Sem categoria')}</span></div><span class="flow-chip">${r.is_internal_transfer?'Transferência':esc(r.flow_type)}</span><strong>${money.format(r.amount)}</strong><span>${r.duplicate?'Já existe':'Nova'}</span></div>`}
function inferProfile(account,file){const ext=file.name.toLowerCase().split('.').pop();if(account.institution==='inter'&&account.account_type==='credit_card')return 'inter_card_csv';if(account.institution==='inter'&&account.account_type==='checking'&&ext==='ofx')return 'inter_ofx';if(account.institution==='inter'&&account.account_type==='checking')return 'inter_checking_csv';return ''}
async function analyzeImport(){const imp=state.import,account=state.accounts.find(a=>a.id===imp.accountId);if(!imp.file||!account){imp.message='Selecione uma conta e um arquivo.';renderImport();return}const profile=inferProfile(account,imp.file);if(!profile){imp.message='Este formato ainda não está habilitado. Para Mercado Pago, adicionaremos o parser a partir de um extrato exportável.';renderImport();return}const btn=$('analyzeBtn');setBusy(btn,true,'Analisando');try{const text=await imp.file.text();const {data,error}=await supabase.functions.invoke('parse-finance-import',{body:{profile,text}});if(error)throw error;const parsed=data?.rows||[],fps=parsed.map(r=>r.fingerprint),existing=[];for(let i=0;i<fps.length;i+=100){const {data:found,error:e}=await supabase.from('transactions').select('source_fingerprint').in('source_fingerprint',fps.slice(i,i+100));if(e)throw e;existing.push(...(found||[]).map(x=>x.source_fingerprint))}const set=new Set(existing);imp.rows=parsed.map(r=>({...r,duplicate:set.has(r.fingerprint)}));imp.step=2;imp.message='';renderImport()}catch(err){imp.message=humanError(err);renderImport()}}
async function sha256(text){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function confirmImport(){const imp=state.import,fresh=imp.rows.filter(r=>!r.duplicate),account=state.accounts.find(a=>a.id===imp.accountId);if(!imp.file||!account||!fresh.length)return;const btn=$('confirmImport');setBusy(btn,true,'Importando');try{const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Sessão expirada. Entre novamente.');const hash=await sha256(await imp.file.text());const {data:batch,error:bErr}=await supabase.from('import_batches').insert({user_id:user.id,account_id:account.id,file_name:imp.file.name,file_hash:hash,institution:account.institution,source_format:imp.file.name.toLowerCase().endsWith('.ofx')?'ofx':'csv',status:'confirmed',row_count:imp.rows.length,duplicate_count:imp.rows.length-fresh.length,review_count:fresh.filter(r=>!r.category_hint).length,confirmed_at:new Date().toISOString()}).select('id').single();if(bErr){if(bErr.code==='23505'){imp.message='Esse arquivo já foi importado anteriormente.';renderImport();return}throw bErr}const catMap=new Map(state.categories.map(c=>[c.name,c.id]));const payload=fresh.map(r=>({user_id:user.id,account_id:account.id,category_id:r.category_hint?catMap.get(r.category_hint)||null:null,import_batch_id:batch.id,transaction_date:r.transaction_date,description:r.description,merchant:r.merchant,amount:r.amount,flow_type:r.flow_type,is_internal_transfer:r.is_internal_transfer,include_in_budget:r.include_in_budget,transaction_source:'import',source_record_id:r.source_record_id,source_fingerprint:r.fingerprint,metadata:r.raw_data}));const {error}=await supabase.from('transactions').insert(payload);if(error)throw error;imp.step=3;await loadData();state.view='import';renderImport()}catch(err){imp.message=humanError(err);renderImport()}}

function openEntryModal(){
  const modal=$('modalHost');let mode='expense';const render=()=>{const cats=state.categories.filter(c=>mode==='income'?c.kind==='income':c.kind==='expense');modal.innerHTML=`<div class="modal-backdrop"><form id="entryForm" class="modal"><div class="modal-head"><div><span class="eyebrow">NOVO LANÇAMENTO</span><h2>Registrar movimentação</h2></div><button id="closeModal" type="button" class="icon-btn boxed">×</button></div><div class="mode-switch"><button type="button" data-mode="expense" class="${mode==='expense'?'active':''}">Despesa</button><button type="button" data-mode="income" class="${mode==='income'?'active':''}">Receita</button><button type="button" data-mode="third_party" class="${mode==='third_party'?'active':''}">Pago por terceiro</button></div><div class="form-grid"><label class="field-label">Data<input id="entryDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label class="field-label">Valor<input id="entryAmount" inputmode="decimal" placeholder="0,00" required></label><label class="field-label full-span">Descrição<input id="entryDescription" placeholder="${mode==='third_party'?'Ex.: Aluguel + condomínio':'Ex.: supermercado'}"></label>${mode!=='third_party'?`<label class="field-label">Conta<select id="entryAccount">${state.accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>`:''}<label class="field-label">Categoria<select id="entryCategory">${cats.map(c=>`<option value="${c.id}">${esc(c.group_name)} · ${esc(c.name)}</option>`).join('')}</select></label></div>${mode==='third_party'?'<div class="third-party-note"><span>⌂</span><span>Entra na visão financeira real, mas não altera o saldo do Inter ou Mercado Pago.</span></div>':''}<div id="entryMessage" class="info-message hidden"></div><div class="modal-actions"><button id="cancelModal" class="secondary-btn" type="button">Cancelar</button><button id="saveEntry" class="primary-btn" type="submit">✓ Salvar</button></div></form></div>`
    $('closeModal').addEventListener('click',close);$('cancelModal').addEventListener('click',close);modal.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;render()}));$('entryForm').addEventListener('submit',save)
  }
  const close=()=>modal.innerHTML=''
  async function save(e){e.preventDefault();const amount=Number($('entryAmount').value.replace('.','').replace(',','.')),date=$('entryDate').value,description=$('entryDescription').value.trim()||'Lançamento manual',category=$('entryCategory').value;if(!Number.isFinite(amount)||amount<=0){showInfo('entryMessage','Informe um valor válido.');return}const btn=$('saveEntry');setBusy(btn,true,'Salvando');try{const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Sessão expirada.');if(mode==='third_party'){const {error}=await supabase.rpc('record_third_party_expense',{p_date:date,p_amount:amount,p_description:description,p_category_id:category,p_notes:null});if(error)throw error}else{const {error}=await supabase.from('transactions').insert({user_id:user.id,account_id:$('entryAccount').value,category_id:category,transaction_date:date,description,amount:mode==='expense'?-amount:amount,flow_type:mode,is_internal_transfer:false,include_in_budget:mode==='expense',transaction_source:'manual'});if(error)throw error}close();await loadData()}catch(err){showInfo('entryMessage',humanError(err));setBusy(btn,false,'✓ Salvar')}}
  render()
}

boot()
