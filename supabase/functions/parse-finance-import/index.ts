const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isoDateBR(s: unknown) {
  const [d,m,y] = String(s).trim().split('/');
  if (!d || !m || !y) throw new Error(`Data invalida: ${s}`);
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

function moneyBR(s: unknown) {
  const n = Number(String(s).replace(/R\$/g,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.'));
  if (!Number.isFinite(n)) throw new Error(`Valor invalido: ${s}`);
  return n;
}

function cleanText(s: unknown) {
  return String(s ?? '').replace(/^\uFEFF/,'').replace(/\s+/g,' ').trim();
}

async function sha256(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function classify(description: unknown, amount: number, profile: string, category: unknown = '') {
  const d = cleanText(description).toUpperCase();
  const c = cleanText(category).toUpperCase();
  if (/PAGAMENTO FATURA CARTAO INTER|PAGAMENTO ON LINE/.test(d)) return {flow_type:'transfer',is_internal_transfer:true,include_in_budget:false,category_hint:'Transferência interna'};
  if (/APLICACAO POUPANCA|RESGATE POUPANCA/.test(d)) return {flow_type:'transfer',is_internal_transfer:true,include_in_budget:false,category_hint:'Transferência interna'};
  if (/RENDIMENT/.test(d)) return {flow_type:'yield',is_internal_transfer:false,include_in_budget:false,category_hint:'Rendimentos'};
  if (/IFOOD|99 FOOD/.test(d)) return {flow_type:'expense',is_internal_transfer:false,include_in_budget:true,category_hint:'Delivery / Restaurante'};
  if (/ASSAI ATACADISTA|SUPERMERCADO GUANABARA|DAQUI MESMO/.test(d) || c==='SUPERMERCADO') return {flow_type:'expense',is_internal_transfer:false,include_in_budget:true,category_hint:'Mercado'};
  if (/UBER DO BRASIL|METRO RJ|BARCAS RIO|99\*/.test(d) || c==='TRANSPORTE') return {flow_type:'expense',is_internal_transfer:false,include_in_budget:true,category_hint:'Transporte'};
  if (/DROGARIA|SPEED FARMA/.test(d) || c==='DROGARIA') return {flow_type:'expense',is_internal_transfer:false,include_in_budget:true,category_hint:'Farmácia'};
  if (/PETZ|PET CENTER|COBASI|CLINICA VET/.test(d) || c==='PETSHOP') return {flow_type:'expense',is_internal_transfer:false,include_in_budget:true,category_hint:'Pets'};
  if (/ENEL DISTRIBUICAO/.test(d)) return {flow_type:'expense',is_internal_transfer:false,include_in_budget:true,category_hint:'Energia elétrica'};
  if (/PREDLINK/.test(d)) return {flow_type:'expense',is_internal_transfer:false,include_in_budget:true,category_hint:'Internet'};
  if (/SHEIN/.test(d) || c==='VESTUARIO') return {flow_type:'expense',is_internal_transfer:false,include_in_budget:true,category_hint:'Vestuário'};
  if (/SHOPEE|MERCADOLIVRE/.test(d) || c==='COMPRAS') return {flow_type:'expense',is_internal_transfer:false,include_in_budget:true,category_hint:'Compras gerais'};
  if (/GPS/.test(d)) return {flow_type:'expense',is_internal_transfer:false,include_in_budget:true,category_hint:'Impostos e taxas'};
  if (profile === 'inter_card') return {flow_type:'expense',is_internal_transfer:false,include_in_budget:true,category_hint:null};
  if (amount > 0) return {flow_type:'income',is_internal_transfer:false,include_in_budget:false,category_hint:'Outras receitas'};
  return {flow_type:'expense',is_internal_transfer:false,include_in_budget:true,category_hint:'Outras despesas'};
}

function parseCsvLine(line: string, delimiter = ',') {
  const out: string[]=[]; let cur=''; let q=false;
  for (let i=0;i<line.length;i++) {
    const ch=line[i];
    if (ch==='"') {
      if (q && line[i+1]==='"') { cur+='"'; i++; }
      else q=!q;
    } else if (ch===delimiter && !q) { out.push(cur); cur=''; }
    else cur+=ch;
  }
  out.push(cur);
  return out.map(v=>v.trim());
}

async function parseInterCheckingCsv(text: string) {
  const lines=text.replace(/\r/g,'').split('\n').filter(Boolean);
  const headerIndex=lines.findIndex(l=>l.startsWith('Data Lançamento;'));
  if (headerIndex<0) throw new Error('Cabecalho de conta corrente Inter nao encontrado');
  const rows: any[]=[];
  for (let i=headerIndex+1;i<lines.length;i++) {
    const p=parseCsvLine(lines[i],';'); if (p.length<3) continue;
    const date=isoDateBR(p[0]); const description=cleanText(p[1]); const amount=moneyBR(p[2]);
    if (!amount) continue;
    const saldo=cleanText(p[3] || '');
    const cls=classify(description,amount,'inter_checking');
    const fp=await sha256(['inter','checking_csv',date,description,amount.toFixed(2),saldo].join('|'));
    rows.push({row_number:i-headerIndex,transaction_date:date,description,merchant:null,amount,source_record_id:null,fingerprint:fp,raw_data:{saldo:saldo||null,dedupe_evidence:saldo?'saldo_pos_transacao':'assinatura_csv'},...cls});
  }
  return rows;
}

async function parseInterCardCsv(text: string) {
  const lines=text.replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n').filter(Boolean);
  const rows: any[]=[];
  const occurrences=new Map();
  for (let i=1;i<lines.length;i++) {
    const p=parseCsvLine(lines[i],','); if (p.length<5) continue;
    const date=isoDateBR(p[0]); const description=cleanText(p[1]); const category=cleanText(p[2]); const type=cleanText(p[3]);
    let amount=moneyBR(p[4]);
    const cls=classify(description,amount,'inter_card',category);
    if (cls.flow_type==='expense' || cls.flow_type==='transfer') amount=-Math.abs(amount);
    const base=['inter','card_csv',date,description,category,type,Math.abs(amount).toFixed(2)].join('|');
    const occurrence=(occurrences.get(base)||0)+1; occurrences.set(base,occurrence);
    const fp=await sha256([base,String(occurrence)].join('|'));
    rows.push({row_number:i,transaction_date:date,description,merchant:description,amount,source_record_id:null,fingerprint:fp,raw_data:{category,type,occurrence,dedupe_evidence:'ocorrencia_no_extrato'},...cls});
  }
  return rows;
}

function tag(block: string, name: string) {
  const m=block.match(new RegExp(`<${name}>([^<\\r\\n]+)`,'i'));
  return m ? cleanText(m[1]) : null;
}

async function parseInterOfx(text: string) {
  const blocks=text.split(/<STMTTRN>/i).slice(1);
  const rows: any[]=[];
  const occurrences=new Map();
  for (let i=0;i<blocks.length;i++) {
    const b=blocks[i]; const ds=tag(b,'DTPOSTED'); const amt=tag(b,'TRNAMT'); if (!ds||!amt) continue;
    const date=`${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}`;
    const amount=Number(amt); if (!Number.isFinite(amount)||!amount) continue;
    const memo=tag(b,'MEMO')||tag(b,'NAME')||'Movimentacao'; const name=tag(b,'NAME'); const fitid=tag(b,'FITID');
    const cls=classify(memo,amount,'inter_checking');
    let fp;
    let evidence;
    if (fitid) {
      fp=await sha256(['inter','ofx_fitid',fitid].join('|'));
      evidence='fitid_ofx';
    } else {
      const base=['inter','ofx',date,memo,amount.toFixed(2)].join('|');
      const occurrence=(occurrences.get(base)||0)+1; occurrences.set(base,occurrence);
      fp=await sha256([base,String(occurrence)].join('|'));
      evidence='ocorrencia_ofx';
    }
    rows.push({row_number:i+1,transaction_date:date,description:memo,merchant:name,amount,source_record_id:fitid,fingerprint:fp,raw_data:{trntype:tag(b,'TRNTYPE'),dedupe_evidence:evidence},...cls});
  }
  return rows;
}

Deno.serve(async (req: Request)=>{
  if (req.method==='OPTIONS') return new Response('ok',{headers:cors});
  try {
    const body=await req.json();
    const profile=String(body.profile||''); const text=String(body.text||'');
    if (!text) throw new Error('Arquivo vazio');
    let rows: any[];
    if (profile==='inter_checking_csv') rows=await parseInterCheckingCsv(text);
    else if (profile==='inter_card_csv') rows=await parseInterCardCsv(text);
    else if (profile==='inter_ofx') rows=await parseInterOfx(text);
    else throw new Error('Perfil de importacao nao suportado');
    const totals=rows.reduce((a,r)=>{if(r.amount>0)a.income+=r.amount;else a.outflow+=Math.abs(r.amount);if(r.is_internal_transfer)a.transfers+=Math.abs(r.amount);return a},{income:0,outflow:0,transfers:0});
    return new Response(JSON.stringify({profile,row_count:rows.length,totals,rows}),{headers:{...cors,'Content-Type':'application/json'}});
  } catch (e) {
    return new Response(JSON.stringify({error:e instanceof Error?e.message:String(e)}),{status:400,headers:{...cors,'Content-Type':'application/json'}});
  }
});
