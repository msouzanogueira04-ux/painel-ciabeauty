var MYID=null,USERNS=null,NOMES={};
/* Painel de Projetos Cia Beauty — app */
(function(){
const D=JSON.parse(document.getElementById('data').textContent);
const fmtI=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0});
const fmtR=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const fmtR0=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const fmtU=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4});
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=s=>String(s||'').replace(/ (LTDA|S\/A|SA|EPP|ME|-ME)\b.*$/i,'').trim();
$('#upd').textContent=D.atualizado;

/* ---------- estado ---------- */
// ov[id] = {qtd, abater, comps, incluir}; novos = projetos criados aqui (ov com custom)
let ov={};
let db=null, saveMode='local';
const LS='ciab-painel-v1';
function lsLoad(){try{const r=localStorage.getItem(LS);if(r)ov=JSON.parse(r)||{}}catch(e){}}
function lsSave(){try{localStorage.setItem(LS,JSON.stringify(ov))}catch(e){}}
lsLoad();
function allProjects(){
  const base=D.projetos.map(p=>p);
  Object.keys(ov).forEach(id=>{const o=ov[id];if(o&&o.custom&&!o.removido)base.push(Object.assign({id,comps:[],rec:0,p2:0,estrutura:false,novo:true},o.custom))});
  return base;
}
function byId(id){return allProjects().find(p=>p.id===id)}
function st(p){return ov[p.id]||{}}
function comps(p){const o=st(p);return o.comps||p.comps||[]}
function total(p){return (p.p1||0)+(p.p2||0)}
function saldoEnt(p){return Math.max(0,total(p)-(p.rec||0))}
/* 1º pedido já começou a ser entregue => conta como produzido; o que falta produzir é o 2º pedido */
function produzido(p){const r=p.rec||0;return r>0?Math.min(total(p),Math.max(r,p.p1||0)):0}
function aProduzir(p){return Math.max(0,total(p)-produzido(p))}
function qtd(p){const o=st(p);return o.qtd!=null?o.qtd:aProduzir(p)}
function abater(p){const o=st(p);return o.abater!=null?o.abater:true}
function incluir(p){const o=st(p);return o.incluir!=null?o.incluir:qtd(p)>0}
/* prazo de pagamento por fornecedor: compras a prazo saem do desembolso (caixa agora) */
let CFG_PAG={forn:{}};try{const r=localStorage.getItem('ciab-pag');if(r)CFG_PAG=Object.assign({forn:{}},JSON.parse(r))}catch(e){}
let PAG_SOMAR=false;try{PAG_SOMAR=localStorage.getItem('ciab-pag-somar')==='1'}catch(e){}
const PRAZOS=['','30','45','60','90','30/60/90','30/45/90'];
function pagKey(c){return c.forn?'f:'+semAc(short(c.forn)).slice(0,60):'i:'+String(c.cod&&c.cod!=='?'?c.cod:semAc(c.nome).slice(0,40))}
function prazoDe(c){return (CFG_PAG.forn||{})[pagKey(c)]||''}
function prazoResumo(pp){return Object.keys(pp).map(Number).sort((a,b)=>a-b).map(d=>d+'d '+fmtR0.format(pp[d])).join(' · ')}
function prazoTxt(z){return z?z.replace(/\//g,' / ')+' dias':'à vista'}
function partesPrazo(z,v){const d=z.split('/').map(Number).filter(Boolean);return d.map(x=>[x,v/d.length])}
function calc(p){
  const Q=qtd(p),ab=abater(p);let unit=0,desemb=0,bruto=0,falta=0,aPrazo=0;const porPrazo={};const linhas=[];
  comps(p).forEach(c=>{
    const coef=+c.coef||0,cu=c.custo==null||c.custo===''?null:+c.custo;
    const nec=Q*coef,disp=EMP_INS[c.cod]?((ALOC[p.id]||{})[c.cod]||0):(+c.saldo||0)+(XIN[c.cod]||0),est=ab?Math.min(Math.max(disp,0),nec):0,comprar=nec-est;
    const v=comprar*(cu||0);if(cu==null)falta++;
    const z=prazoDe(c);unit+=coef*(cu||0);bruto+=nec*(cu||0);
    if(z){aPrazo+=v;partesPrazo(z,v).forEach(([d,x])=>{porPrazo[d]=(porPrazo[d]||0)+x});if(PAG_SOMAR)desemb+=v}else desemb+=v;
    linhas.push({c,nec,est,comprar,v,cu,z});
  });
  return{Q,unit,desemb,bruto,falta,aPrazo,porPrazo,linhas,semEstrutura:comps(p).length===0};
}
function status(p){const t=total(p),r=p.rec||0;if(t>0&&r>=t)return['ok','Entregue'];if(r>0)return['warn','Parcial'];return['bad','Aguardando']}

/* ---------- persistência ---------- */
const timers={};let chain=Promise.resolve();
function setSave(kind,txt){const el=$('#saveState');el.innerHTML='<span class="dot '+kind+'"></span><span>'+esc(txt)+'</span>'}
function persist(id){
  lsSave();
  if(!db){setSave('warn','Salvo só neste navegador');return}
  setSave('','Salvando…');
  clearTimeout(timers[id]);
  timers[id]=setTimeout(()=>{
    if(ov[id]&&MYID){ov[id]._por=MYID;ov[id]._em=new Date().toISOString()}
    const body=JSON.parse(JSON.stringify(ov[id]||{removido:true}));
    chain=chain.then(()=>db.collection('projetos').doc(id).set(body)).then(()=>{delete timers[id];setSave('ok','Salvo na nuvem · '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}))}).catch(e=>{setSave('warn','Não salvou na nuvem — ficou neste navegador')});
  },700);
}
const EDIT={};
function setOv(p,patch){ov[p.id]=Object.assign({},ov[p.id]||{},patch);if(EDIT[p.id]&&Object.keys(patch).every(k=>k==='comps')){lsSave();renderAll();return}persist(p.id);renderAll()}

/* ---------- KPIs ---------- */
function renderKpis(){
  const ps=allProjects();
  const ped=ps.reduce((a,p)=>a+total(p),0),rec=ps.reduce((a,p)=>a+(p.rec||0),0);
  const ent=ps.filter(p=>status(p)[0]==='ok').length,parc=ps.filter(p=>status(p)[0]==='warn').length;
  let des=0,sem=0,n=0;ps.forEach(p=>{if(!incluir(p))return;n++;const c=calc(p);des+=c.desemb;if(c.semEstrutura||c.falta)sem++});
  $('#kpis').innerHTML=[
    ['Projetos',fmtI.format(ps.length),ent+' entregues · '+parc+' parciais'],
    ['Unidades pedidas',fmtI.format(ped),'1º + 2º pedido'],
    ['Recebidas',fmtI.format(rec),(ped?Math.round(rec/ped*100):0)+'% do pedido'],
    ['A receber',fmtI.format(ped-rec),'unidades em aberto'],
    ['Desembolso previsto',fmtR0.format(des),n+' projetos na carteira',true],
    ['Sem custo completo',fmtI.format(sem),'projetos para estruturar']
  ].map(k=>'<div class="kpi'+(k[3]?' hl':'')+'"><span class="eyebrow">'+k[0]+'</span><span class="v">'+k[1]+'</span><span class="s">'+k[2]+'</span></div>').join('');
}

/* ---------- ENTREGAS ---------- */
let colFilter='';
function renderEntregas(){
  const ps=allProjects(),cols={};
  ps.forEach(p=>{const c=cols[p.colecao]||(cols[p.colecao]={n:0,t:0,r:0});c.n++;c.t+=total(p);c.r+=p.rec||0});
  $('#colTiles').innerHTML=Object.entries(cols).map(([k,c])=>{const pc=c.t?c.r/c.t*100:0;return '<button class="tile" data-col="'+esc(k)+'" aria-pressed="'+(colFilter===k)+'"><span class="eyebrow">'+esc(k)+' · '+c.n+' SKUs</span><span class="big">'+fmtI.format(c.r)+' <span class="muted">/ '+fmtI.format(c.t)+'</span></span><div class="prog"><i style="width:'+pc.toFixed(1)+'%"></i></div><span class="note">'+pc.toFixed(0)+'% recebido</span></button>'}).join('');
  const q=$('#entSearch').value.trim().toLowerCase(),sf=$('#entStatus').value;
  const rows=ps.filter(p=>(!colFilter||p.colecao===colFilter)&&(!sf||status(p)[0]===sf)&&(!q||[p.sku,p.codigo,p.forn,p.colecao].join(' ').toLowerCase().includes(q)));
  let T=[0,0,0,0];const VC=vendasPorCod(),EC=estPorCod();
  const body=rows.map(p=>{const s=status(p),t=total(p),r=p.rec||0,pc=t?Math.min(100,r/t*100):0;T[0]+=p.p1||0;T[1]+=p.p2||0;T[2]+=t;T[3]+=r;
    return '<tr><td>'+esc(p.colecao)+'</td><td class="mono">'+esc(p.codigo||'—')+'</td><td>'+esc(p.sku)+(p.novo?' <span class="pill neu">novo</span>':'')+'</td><td>'+esc(p.forn||'')+'</td><td class="n">'+fmtI.format(p.p1||0)+'</td><td class="n">'+fmtI.format(p.p2||0)+'</td><td class="n">'+fmtI.format(t)+'</td><td class="n">'+fmtI.format(r)+'</td><td><div class="prog" title="'+pc.toFixed(0)+'%"><i style="width:'+pc.toFixed(1)+'%"></i></div></td><td class="n">'+fmtI.format(Math.max(0,t-r))+'</td><td class="n">'+(VC[normK(p.codigo)]?fmtI.format(VC[normK(p.codigo)].q):'—')+'</td><td class="n">'+(EC[normK(p.codigo)]?fmtI.format(EC[normK(p.codigo)].qtd):'—')+'</td><td><span class="pill '+s[0]+'">'+s[1]+'</span>'+(p.est?' <span class="pill warn" title="'+esc(p.src)+'">estimado</span>':'')+'</td><td class="note">'+esc(p.src||'')+'</td></tr>'}).join('');
  $('#entTbl').innerHTML='<thead><tr><th>Coleção</th><th>Código</th><th>SKU</th><th>Fornecedor</th><th class="n">1º pedido</th><th class="n">2º pedido</th><th class="n">Total</th><th class="n">Recebido</th><th>Progresso</th><th class="n">Saldo</th><th class="n">Vendido</th><th class="n">Estoque Stralog</th><th>Status</th><th>Origem</th></tr></thead><tbody>'+(body||'<tr><td colspan="14" class="muted">Nenhum projeto com esse filtro.</td></tr>')+'</tbody><tfoot><tr><td colspan="4">'+rows.length+' projetos</td><td class="n">'+fmtI.format(T[0])+'</td><td class="n">'+fmtI.format(T[1])+'</td><td class="n">'+fmtI.format(T[2])+'</td><td class="n">'+fmtI.format(T[3])+'</td><td></td><td class="n">'+fmtI.format(T[2]-T[3])+'</td><td colspan="4"></td></tr></tfoot>';
}
$('#colTiles').addEventListener('click',e=>{const b=e.target.closest('.tile');if(!b)return;colFilter=colFilter===b.dataset.col?'':b.dataset.col;renderEntregas()});
$('#entSearch').addEventListener('input',renderEntregas);$('#entStatus').addEventListener('change',renderEntregas);

/* ---------- SIMULADOR ---------- */
let cur=D.projetos[0].id;
function renderPlist(){
  const q=$('#simSearch').value.trim().toLowerCase();
  $('#plist').innerHTML=allProjects().filter(p=>!q||[p.sku,p.codigo,p.colecao].join(' ').toLowerCase().includes(q)).map(p=>{const c=calc(p);
    const tag=c.semEstrutura?'<span class="pill bad">sem estrutura</span>':c.falta?'<span class="pill warn">custo faltando</span>':'<span class="mono" style="font-size:.78rem">'+fmtR.format(c.unit)+'/un</span>';
    return '<button class="pitem" data-id="'+esc(p.id)+'" aria-current="'+(p.id===cur)+'"><span class="nm" title="'+esc(p.sku)+'">'+esc(p.sku)+'</span>'+tag+'<span class="cd">'+esc(p.codigo||p.colecao)+'</span><span class="cd" style="text-align:right">'+fmtI.format(c.Q)+' un</span></button>'}).join('');
}
$('#plist').addEventListener('click',e=>{const b=e.target.closest('.pitem');if(!b)return;cur=b.dataset.id;renderSim()});
$('#simSearch').addEventListener('input',renderPlist);

function origemPill(c){const o=c.origem||'';if(o==='NF')return '<span class="pill ok">NF</span>';if(o==='planilha')return '<span class="pill neu">planilha</span>';if(o==='info')return '<span class="pill ok">informado</span>';if(o==='ref')return '<span class="pill warn">referência</span>';if(o==='?')return '<span class="pill bad">não encontrado</span>';if(o==='orc')return '<span class="pill warn">a orçar</span>';return ''}
function renderEditor(){
  const p=byId(cur);if(!p){cur=D.projetos[0].id;return renderEditor()}
  const c=calc(p),o=st(p);
  const copyOpts=allProjects().filter(x=>x.id!==p.id&&comps(x).length).map(x=>'<option value="'+esc(x.id)+'">'+esc((x.codigo?x.codigo+' · ':'')+x.sku)+'</option>').join('');
  let h='<div class="row" style="align-items:flex-start"><div class="grow" style="min-width:0"><div class="eyebrow">'+esc(p.colecao)+(p.codigo?' · '+esc(p.codigo):'')+(p.tipo?' · '+esc(p.tipo):'')+'</div><h2>'+esc(p.sku)+'</h2>'+auditLine(o)+'<div class="note">Pedido '+fmtI.format(total(p))+' · recebido '+fmtI.format(p.rec||0)+' · saldo '+fmtI.format(saldoEnt(p))+' · fornecedor '+esc(p.forn||'—')+'</div></div>'
   +(p.novo?'<button class="btn ghost" id="delProj">Excluir projeto</button>':'')+'</div>';
  h+='<div class="row" style="margin-top:14px"><label class="row" style="gap:6px">Quantidade a produzir <input type="number" id="simQ" min="0" step="100" value="'+c.Q+'" style="width:120px"></label>'
   +'<button class="btn" data-q="'+saldoEnt(p)+'">Saldo ('+fmtI.format(saldoEnt(p))+')</button><button class="btn" data-q="3000">3.000</button><button class="btn" data-q="5000">5.000</button><button class="btn" data-q="10000">10.000</button>'
   +'<label class="chk"><input type="checkbox" id="simAb" '+(abater(p)?'checked':'')+'> Abater insumos em estoque</label>'
   +'<label class="chk"><input type="checkbox" id="simInc" '+(incluir(p)?'checked':'')+'> Incluir na carteira</label></div>';
  h+='<div class="res"><div class="box"><div class="eyebrow">Custo unitário</div><div class="v num">'+fmtR.format(c.unit)+'</div></div>'
   +'<div class="box"><div class="eyebrow">Custo do lote</div><div class="v num">'+fmtR0.format(c.bruto)+'</div><div class="note">'+fmtI.format(c.Q)+' un × custo unitário</div></div>'
   +'<div class="box hl"><div class="eyebrow">'+(PAG_SOMAR?'Necessidade de caixa':'Desembolso à vista')+'</div><div class="v num">'+fmtR0.format(c.desemb)+'</div><div class="note">'+(abater(p)?'já descontando estoque':'sem abater estoque')+(c.aPrazo&&!PAG_SOMAR?' · sem as compras a prazo':'')+'</div></div>'
   +(c.aPrazo?'<div class="box"><div class="eyebrow">A prazo (faturado)</div><div class="v num">'+fmtR0.format(c.aPrazo)+'</div><div class="note">'+prazoResumo(c.porPrazo)+'</div></div>':'<div class="box"><div class="eyebrow">Economia com estoque</div><div class="v num">'+fmtR0.format(Math.max(0,c.bruto-c.desemb-c.aPrazo))+'</div></div>')+'</div>';
  if(c.semEstrutura)h+='<div class="callout">Este projeto ainda não tem estrutura de custo. Busque os insumos no catálogo de NFs abaixo, adicione uma linha manual ou copie a estrutura de um produto parecido.</div>';
  else if(c.falta)h+='<div class="callout">'+c.falta+' insumo(s) sem custo unitário — preencha para o total ficar completo.</div>';
  const ed=!!EDIT[p.id],dis=ed?'':' disabled';
  h+='<div class="row" style="margin:6px 0 10px;gap:8px">'+(document.body.classList.contains('ro')?'':ed?'<span class="pill warn">Editando — alterações ainda não salvas</span><span class="grow"></span><button class="btn" id="edCancel">Cancelar</button><button class="btn pri" id="edSave">Salvar estrutura</button>':'<span class="pill neu">🔒 Estrutura travada</span><span class="grow"></span><button class="btn" id="edOpen">✎ Editar estrutura</button>')+'</div>';
  if(comps(p).some(x=>x.auto)&&!o.comps)h+='<div class="note" style="margin-bottom:8px">Estrutura inicial montada com o preço de envase das NFs da Giudit (matéria-prima + mão de obra). Adicione frasco, rótulo, cartucho e caixa para fechar o custo.</div>';
  h+='<div class="tbl-wrap ed"><table><thead><tr><th>Insumo</th><th>Fornecedor</th><th class="n">Qtd/un</th><th class="n">Custo un. (R$)</th><th class="n">Estoque</th><th class="n">Necessidade</th><th class="n">Comprar</th><th class="n">Desembolso</th><th></th></tr></thead><tbody>';
  c.linhas.forEach((l,i)=>{h+='<tr><td><input type="text" data-i="'+i+'" data-f="nome" value="'+esc(l.c.nome)+'" aria-label="Insumo"'+dis+'><div class="note"><span class="mono">'+esc(l.c.cod||'')+'</span> '+origemPill(l.c)+(l.c.nota?' · '+esc(l.c.nota):'')+sinalPill(p.id,l.c)+'</div></td><td class="note">'+esc(short(l.c.forn))+'</td>'
    +'<td class="n"><input type="number" step="0.01" min="0" data-i="'+i+'" data-f="coef" value="'+l.c.coef+'" style="width:70px" aria-label="Quantidade por unidade"'+dis+'></td>'
    +'<td class="n"><input type="number" step="0.01" min="0" data-i="'+i+'" data-f="custo" value="'+(l.cu==null?'':l.cu)+'" placeholder="?" aria-label="Custo unitário"'+dis+'></td>'
    +'<td class="n"><input type="number" step="1" data-i="'+i+'" data-f="saldo" value="'+(+l.c.saldo||0)+'" aria-label="Estoque" title="Ajuste manual de estoque (planilha)"'+dis+'>'+(()=>{const e=EMP_INS[String(l.c.cod||'')];if(!e)return '';const lc=Object.entries(e.loc.loc||{}).filter(([,q])=>q).map(([k,q])=>locNome(k)+' '+fmtI.format(Math.round(q))).join(' · ');
      return '<div class="note" style="white-space:nowrap;text-align:right" title="Montagem = entrou pelas notas/planilha − consumido no que já foi produzido (1º pedido). Depósitos = Bling + Stralog + Galpão e demais locais.">'
      +(e.semEntrada?'<span style="color:var(--warn,#b54708)">montagem sem nota de entrada</span>':'montagem '+fmtI.format(Math.round(e.mont)))+(e.loc.qtd?' + depósitos '+fmtI.format(Math.round(e.loc.qtd)):'')
      +'<br><b>tenho '+fmtI.format(Math.round(e.disp))+'</b> · 2º pedido/a produzir '+fmtI.format(Math.round(e.resT))+'<br>'+(e.livre<0?'<b style="color:var(--bad)">comprar '+fmtI.format(Math.round(-e.livre))+'</b>':'<span style="color:var(--ok)">sobra '+fmtI.format(Math.round(e.livre))+'</span>')+(lc?'<br>'+esc(lc):'')+'</div>'})()+'</td>'
    +'<td class="n">'+fmtI.format(l.nec)+'</td><td class="n">'+fmtI.format(l.comprar)+'</td><td class="n"'+(l.z&&!PAG_SOMAR?' style="opacity:.6"':'')+'>'+fmtR.format(l.v)+'<div><select data-prazo="'+i+'" aria-label="Pagamento" title="Prazo de pagamento deste fornecedor (vale para todos os produtos dele). A prazo sai do desembolso à vista."'+(document.body.classList.contains('ro')?' disabled':'')+' style="font-size:12px;padding:2px 4px;margin-top:4px">'+PRAZOS.map(z=>'<option value="'+z+'"'+(z===l.z?' selected':'')+'>'+prazoTxt(z)+'</option>').join('')+'</select></div></td><td style="white-space:nowrap">'+(document.body.classList.contains('ro')?'':'<button class="btn ghost" data-sinal="'+i+'" title="Sinalizar: este insumo está errado / indicar o insumo correto" aria-label="Sinalizar insumo">⚑</button>')+(ed?'<button class="btn ghost" data-del="'+i+'" aria-label="Remover">✕</button>':'')+'</td></tr>'});
  if(!c.linhas.length)h+='<tr><td colspan="9" class="muted">Nenhum insumo ainda.</td></tr>';
  h+='</tbody><tfoot><tr><td colspan="7">'+(PAG_SOMAR?'Total':'Total à vista')+'</td><td class="n">'+fmtR.format(c.desemb)+'</td><td></td></tr>'+(c.aPrazo&&!PAG_SOMAR?'<tr><td colspan="7" class="note">A prazo (fora do desembolso): '+prazoResumo(c.porPrazo)+'</td><td class="n note">'+fmtR.format(c.aPrazo)+'</td><td></td></tr>':'')+'</tfoot></table></div>';
  if(ed)h+='<div class="row" style="margin-top:12px"><div class="searchbox grow" style="min-width:240px"><input type="search" id="addSearch" placeholder="Adicionar insumo: busque nos insumos cadastrados e no catálogo de NFs (ex.: frasco 200ml, rótulo, caixa)" style="width:100%" autocomplete="off" aria-label="Adicionar insumo"><div class="sugg" id="sugg" hidden></div></div>'
   +'<button class="btn" id="addManual">+ Linha manual</button>'
   +(copyOpts?'<select id="copyFrom" aria-label="Copiar estrutura"><option value="">Copiar estrutura de…</option>'+copyOpts+'</select>':'')
   +(o.comps||o.qtd!=null?'<button class="btn ghost" id="resetP">Restaurar original</button>':'')+'</div>';
  else h+='<p class="note" style="margin-top:10px">Para incluir, trocar ou remover insumos, clique em <b>✎ Editar estrutura</b>. Nada é salvo até clicar em <b>Salvar estrutura</b>.</p>';
  h+='<p class="note">Necessidade = quantidade × qtd/un. Comprar = necessidade − estoque disponível. O estoque inicial vem da aba Estruturas (recebido − consumido); nos demais itens, informe o que tem na Stralog.</p>';
  $('#editor').innerHTML=h;
}
function editComps(p,fn){const arr=JSON.parse(JSON.stringify(comps(p)));fn(arr);setOv(p,{comps:arr})}
const ed=$('#editor');
ed.addEventListener('change',e=>{const p=byId(cur);const t=e.target;
  if(t.id==='simQ'){setOv(p,{qtd:Math.max(0,+t.value||0)});return}
  if(t.id==='simAb'){setOv(p,{abater:t.checked});return}
  if(t.id==='simInc'){setOv(p,{incluir:t.checked});return}
  if(t.id==='copyFrom'&&t.value){const src=byId(t.value);editComps(p,a=>{a.length=0;comps(src).forEach(x=>a.push(Object.assign({},x,{auto:false})))});return}
  if(t.dataset.f){const i=+t.dataset.i,f=t.dataset.f;editComps(p,a=>{a[i][f]=f==='nome'?t.value:(t.value===''?(f==='custo'?null:0):+t.value)})}
});
ed.addEventListener('click',e=>{const p=byId(cur);const t=e.target.closest('button');if(!t)return;
  if(t.dataset.sinal!=null){const l=calc(p).linhas[+t.dataset.sinal];abrirSinal(p,l.c);return}
  if(t.id==='edOpen'){EDIT[p.id]={snap:ov[p.id]?JSON.parse(JSON.stringify(ov[p.id])):null};renderEditor();return}
  if(t.id==='edCancel'){const s0=EDIT[p.id];delete EDIT[p.id];if(s0){if(s0.snap)ov[p.id]=s0.snap;else delete ov[p.id]}lsSave();renderAll();return}
  if(t.id==='edSave'){delete EDIT[p.id];persist(p.id);renderAll();setSave('ok','Estrutura de '+(p.codigo||p.sku)+' salva');return}
  if(t.dataset.ins!=null){const r=INS_LISTA[+t.dataset.ins];editComps(p,a=>a.push({nome:r.nome,cod:r.cod,forn:r.forn,custo:r.custo,coef:1,saldo:0,origem:r.origem||'NF'}));return}
  if(t.dataset.q!=null){setOv(p,{qtd:+t.dataset.q});return}
  if(t.dataset.del!=null){editComps(p,a=>a.splice(+t.dataset.del,1));return}
  if(t.id==='addManual'){editComps(p,a=>a.push({nome:'Novo insumo',cod:'',forn:'',custo:null,coef:1,saldo:0}));return}
  if(t.id==='resetP'){const o=Object.assign({},ov[p.id]);delete o.comps;delete o.qtd;ov[p.id]=o;persist(p.id);renderAll();return}
  if(t.id==='delProj'){ov[p.id]={removido:true};persist(p.id);cur=D.projetos[0].id;renderAll();return}
  if(t.dataset.cat!=null){const r=D.catalogo[+t.dataset.cat];editComps(p,a=>a.push({nome:r[1],cod:r[0],forn:r[2],custo:r[4],compra:r[4],coef:1,saldo:0}));return}
});
ed.addEventListener('input',e=>{if(e.target.id!=='addSearch')return;const q=e.target.value.trim().toLowerCase(),box=$('#sugg');
  if(q.length<2){box.hidden=true;return}
  const terms=semAc(q).split(/\s+/);const hits=[];
  INS_LISTA=insumosCadastrados();const insHits=[];INS_LISTA.forEach((r,i)=>{const s=semAc(r.cod+' '+r.nome+' '+r.forn);if(terms.every(t=>s.includes(t)))insHits.push(i)});
  const ja=new Set(insHits.map(i=>INS_LISTA[i].cod).filter(Boolean));
  D.catalogo.forEach((r,i)=>{if(ja.has(String(r[0])))return;const s=semAc(r[0]+' '+r[1]+' '+r[2]);if(terms.every(t=>s.includes(t)))hits.push(i)});
  box.innerHTML=(insHits.length?'<div class="note" style="padding:6px 10px 2px"><b>Insumos já cadastrados</b></div>':'')+insHits.slice(0,25).map(i=>{const r=INS_LISTA[i];return '<button data-ins="'+i+'"><div>'+esc(r.nome)+'</div><div class="note mono">'+esc(r.cod||'sem código')+' · '+esc(short(r.forn)||'—')+' · '+(r.custo==null?'sem custo':fmtR.format(r.custo))+' · usado em '+r.n+' produto(s)</div></button>'}).join('')
    +(hits.length?'<div class="note" style="padding:6px 10px 2px"><b>Catálogo das notas fiscais</b></div>':'')+hits.slice(0,30).map(i=>{const r=D.catalogo[i];return '<button data-cat="'+i+'"><div>'+esc(r[1])+'</div><div class="note mono">'+esc(r[0])+' · '+esc(short(r[2]))+' · '+fmtR.format(r[4])+' · '+fmtI.format(r[3])+' un compradas</div></button>'}).join('')
    ||'<div class="note" style="padding:8px 10px">Nada encontrado. Use "+ Linha manual".</div>';
  box.hidden=false;
});
let INS_LISTA=[];
function insumosCadastrados(){const m={};allProjects().forEach(p=>comps(p).forEach(c=>{const k=(c.cod&&c.cod!=='?')?'c:'+c.cod:'n:'+semAc(c.nome);const x=m[k]||(m[k]={nome:c.nome||'',cod:(c.cod&&c.cod!=='?')?String(c.cod):'',forn:c.forn||'',custo:c.custo==null||c.custo===''?null:+c.custo,origem:c.origem,n:0,ps:new Set()});if(!x.ps.has(p.id)){x.ps.add(p.id);x.n++}if(x.custo==null&&c.custo!=null&&c.custo!=='')x.custo=+c.custo}));return Object.values(m).sort((a,b)=>b.n-a.n)}
function renderSim(){renderPlist();renderEditor()}

/* novo projeto */
$('#btnNovo').addEventListener('click',()=>{$('#nCopy').innerHTML='<option value="">Começar vazio</option>'+allProjects().filter(x=>comps(x).length).map(x=>'<option value="'+esc(x.id)+'">'+esc((x.codigo?x.codigo+' · ':'')+x.sku)+'</option>').join('');$('#modal').hidden=false;$('#nColecao').focus()});
$('#nCancel').addEventListener('click',()=>{$('#modal').hidden=true});
$('#novoForm').addEventListener('submit',e=>{e.preventDefault();
  const id='NOVO-'+Date.now().toString(36);const src=$('#nCopy').value?byId($('#nCopy').value):null;
  ov[id]={custom:{colecao:$('#nColecao').value.trim(),sku:$('#nSku').value.trim(),forn:$('#nForn').value.trim(),p1:+$('#nQtd').value||0,codigo:null,tipo:''},comps:src?JSON.parse(JSON.stringify(comps(src))):[],incluir:true};
  persist(id);cur=id;$('#modal').hidden=true;$('#novoForm').reset();renderAll();
});

/* ---------- CARTEIRA ---------- */
function cartRows(){return allProjects().map(p=>({p,c:calc(p),inc:incluir(p)}))}
let cartQ='',cartF='todos';
const semAc=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function cartFiltro({p,c,inc}){
  if(cartF==='marcados'&&!inc)return false;if(cartF==='desmarcados'&&inc)return false;
  if(cartF==='completo'&&(c.semEstrutura||c.falta))return false;if(cartF==='falta'&&(c.semEstrutura||!c.falta))return false;if(cartF==='sem'&&!c.semEstrutura)return false;
  if(!cartQ)return true;
  const alvo=semAc([p.sku,p.codigo,p.colecao].concat(c.linhas.map(l=>(l.c.forn||'')+' '+(l.c.nome||''))).join(' '));
  return semAc(cartQ).split(/\s+/).filter(Boolean).every(t=>alvo.includes(t));
}
function renderCarteira(){
  const todas=cartRows();const filtrando=!!cartQ||cartF!=='todos';const rows=todas.filter(cartFiltro);let T=0,TQ=0,TP=0;const PP={};const forn={},col={};let sem=0,falta=0;
  const body=rows.map(({p,c,inc})=>{if(inc){T+=c.desemb;TQ+=c.Q;TP+=c.aPrazo;Object.entries(c.porPrazo).forEach(([d,x])=>{PP[d]=(PP[d]||0)+x});col[p.colecao]=(col[p.colecao]||0)+c.desemb;c.linhas.forEach(l=>{const k=short(l.c.forn)||'Sem fornecedor';forn[k]=(forn[k]||0)+l.v});if(c.semEstrutura)sem++;else if(c.falta)falta++}
    const flag=c.semEstrutura?'<span class="pill bad">sem estrutura</span>':c.falta?'<span class="pill warn">custo faltando</span>':'<span class="pill ok">completo</span>';
    return '<tr'+(inc?'':' class="muted"')+'><td><input type="checkbox" data-inc="'+esc(p.id)+'" '+(inc?'checked':'')+' aria-label="Incluir"></td><td><button class="btn ghost" style="color:inherit;padding:0;text-align:left" data-open="'+esc(p.id)+'">'+esc(p.sku)+'</button><div class="note">'+esc(p.colecao)+(p.codigo?' · '+esc(p.codigo):'')+'</div></td><td class="n">'+fmtI.format(c.Q)+'</td><td class="n">'+fmtR.format(c.unit)+'</td><td class="n">'+fmtR0.format(c.desemb)+'</td><td>'+flag+'</td></tr>'}).join('');
  let TG=0;if(filtrando)todas.forEach(({c,inc})=>{if(inc)TG+=c.desemb});
  const vazio=rows.length?'':'<tr><td></td><td colspan="5" class="muted">Nenhum projeto encontrado para essa busca.</td></tr>';
  $('#cartTbl').innerHTML='<thead><tr><th></th><th>Projeto</th><th class="n">Qtd</th><th class="n">Custo un.</th><th class="n">Caixa</th><th>Estrutura</th></tr></thead><tbody>'+body+vazio+'</tbody><tfoot><tr><td></td><td>'+(filtrando?'Total dos filtrados ('+rows.length+' de '+todas.length+')':'Total da carteira')+(PAG_SOMAR?'':' · à vista')+'</td><td class="n">'+fmtI.format(TQ)+'</td><td></td><td class="n">'+fmtR0.format(T)+'</td><td></td></tr>'+(TP?'<tr><td></td><td class="note">A prazo / faturado'+(PAG_SOMAR?' (já somado acima)':' (fora do desembolso)')+': '+prazoResumo(PP)+'</td><td></td><td></td><td class="n note">'+fmtR0.format(TP)+'</td><td></td></tr>':'')+'<tr><td></td><td colspan="5"><label class="chk note"><input type="checkbox" id="pagSomar"'+(PAG_SOMAR?' checked':'')+'> Somar compras a prazo no desembolso</label></td></tr>'+(filtrando?'<tr><td></td><td class="muted">Total da carteira (todos marcados)</td><td></td><td></td><td class="n muted">'+fmtR0.format(TG)+'</td><td></td></tr>':'')+'</tfoot>';
  const w=$('#cartWarn');if(sem||falta){w.hidden=false;w.textContent=(sem?sem+' projeto(s) sem estrutura entram com R$ 0':'')+(sem&&falta?' e ':'')+(falta?falta+' com custo faltando':'')+'. Abra cada um em Custos para completar e o total fica real.'}else w.hidden=true;
  bars('#cartForn',Object.entries(forn).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,10));
  bars('#cartCol',Object.entries(col).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]));
}
function bars(sel,arr){const m=Math.max(1,...arr.map(x=>x[1]));$(sel).innerHTML=arr.length?arr.map(([k,v])=>'<span class="lab" title="'+esc(k)+'">'+esc(k)+'</span><span class="num" style="text-align:right">'+fmtR0.format(v)+'</span><div class="b"><i style="width:'+(v/m*100).toFixed(1)+'%"></i></div>').join(''):'<span class="note">Nada ainda.</span>'}
$('#cartSearch').addEventListener('input',e=>{cartQ=e.target.value.trim();renderCarteira()});
$('#cartChips').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;cartF=b.dataset.f;document.querySelectorAll('#cartChips .chip').forEach(x=>x.setAttribute('aria-pressed',x===b));renderCarteira()});
$('#cartTbl').addEventListener('change',e=>{if(e.target.id==='pagSomar'){PAG_SOMAR=e.target.checked;try{localStorage.setItem('ciab-pag-somar',PAG_SOMAR?'1':'0')}catch(x){}renderAll();return}const id=e.target.dataset.inc;if(id)setOv(byId(id),{incluir:e.target.checked})});
$('#cartTbl').addEventListener('click',e=>{const b=e.target.closest('[data-open]');if(!b)return;cur=b.dataset.open;showTab('simulador')});
$('#btnCsv').addEventListener('click',async()=>{
  const L=[['Coleção','Código','Projeto','Qtd','Insumo','Fornecedor','Qtd/un','Custo un','Necessidade','Estoque usado','Comprar','Desembolso'].join(';')];
  const n=x=>String(Math.round(x*10000)/10000).replace('.',',');
  cartRows().filter(r=>r.inc).forEach(({p,c})=>{if(!c.linhas.length)L.push([p.colecao,p.codigo||'',p.sku,c.Q,'(sem estrutura)','','','','','','',0].join(';'));c.linhas.forEach(l=>L.push([p.colecao,p.codigo||'',p.sku,c.Q,l.c.nome,l.c.forn,n(+l.c.coef||0),n(l.cu||0),n(l.nec),n(l.est),n(l.comprar),n(l.v)].map(x=>String(x).replace(/;/g,',')).join(';')))});
  const csv='﻿'+L.join('\n');
  try{const dl=await claude.use('downloads');if(dl){await dl.save({filename:'carteira_simulacao.csv',data:csv});return}}catch(e){}
  try{await navigator.clipboard.writeText(csv);$('#btnCsv').textContent='CSV copiado';setTimeout(()=>$('#btnCsv').textContent='Exportar CSV',2000)}catch(e){$('#btnCsv').textContent='Exportação indisponível aqui'}
});

/* ---------- COMPRAS ---------- */
function renderCompras(){
  const ent=Object.entries(D.comprasMes).sort();const W=Math.max(520,ent.length*52),H=220,pl=56,pb=28,pt=12;const m=Math.max(...ent.map(x=>x[1]));
  const step=Math.ceil(m/4/100000)*100000;const top=step*4;const bw=(W-pl-10)/ent.length;
  const mes=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  let s='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Compras por mês">';
  for(let i=0;i<=4;i++){const y=H-pb-(H-pb-pt)*i/4;s+='<line x1="'+pl+'" x2="'+(W-6)+'" y1="'+y+'" y2="'+y+'" stroke="var(--line)" stroke-width="1"/><text x="'+(pl-6)+'" y="'+(y+3)+'" text-anchor="end">'+(step*i/1000).toLocaleString('pt-BR')+' mil</text>'}
  ent.forEach(([k,v],i)=>{const h=(H-pb-pt)*v/top,x=pl+i*bw+bw*.18,y=H-pb-h;const[yy,mm]=k.split('-');
    s+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+(bw*.64).toFixed(1)+'" height="'+h.toFixed(1)+'" rx="2" fill="var(--accent)"><title>'+mes[+mm-1]+'/'+yy+': '+fmtR0.format(v)+'</title></rect><text x="'+(x+bw*.32).toFixed(1)+'" y="'+(H-pb+14)+'" text-anchor="middle">'+mes[+mm-1]+'/'+yy.slice(2)+'</text>'});
  $('#chartMes').innerHTML=s+'</svg>';
  bars('#topForn',D.comprasForn.slice(0,12).map(([k,v])=>[short(k),v]));
  renderCat();
}
function renderCat(){
  const q=$('#catSearch').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows=D.catalogo.filter(r=>{const s=(r[0]+' '+r[1]+' '+r[2]).toLowerCase();return q.every(t=>s.includes(t))}).sort((a,b)=>b[5].localeCompare(a[5])).slice(0,300);
  $('#catTbl').innerHTML='<thead><tr><th>Código</th><th>Descrição</th><th>Fornecedor</th><th class="n">Qtd comprada</th><th class="n">Último preço</th><th class="n">Última NF</th></tr></thead><tbody>'+rows.map(r=>'<tr><td class="mono">'+esc(r[0])+'</td><td>'+esc(r[1])+'</td><td class="note">'+esc(short(r[2]))+'</td><td class="n">'+fmtI.format(r[3])+'</td><td class="n">'+fmtR.format(r[4])+'</td><td class="n">'+(r[5]?r[5].split('-').reverse().join('/'):'—')+'</td></tr>').join('')+'</tbody>';
}
$('#catSearch').addEventListener('input',renderCat);

/* ---------- NOTAS XML (importar / exportar) ---------- */
const BASE_CH=new Set(D.chaves||[]);
const CAT_BASE=D.catalogo.slice(),MES_BASE=Object.assign({},D.comprasMes);
D.projetos.forEach(p=>{p.rec0=p.rec||0});
let notas={};let XIN={},XOUT={};let notaFiltro='',notaAberta=null;
const LSN='ciab-notas-v1';const BASEN={};(D.notasBase||[]).forEach(n=>{BASEN[n.chave]=n});
const REMOV=new Set();
function mergeNotas(user){const out=Object.assign({},BASEN);REMOV.clear();Object.keys(user||{}).forEach(k=>{const u=user[k];if(u&&u.removido){delete out[k];REMOV.add(k)}else if(u&&u.chave)out[k]=Object.assign({},BASEN[k]||{},u)});return out}
try{const r=localStorage.getItem(LSN);notas=mergeNotas(r?JSON.parse(r):{})}catch(e){notas=mergeNotas({})}
let XMLB=null;
async function xmlDe(n){if(n.xml)return n.xml;if(!XMLB)XMLB={};if(!(n.chave in XMLB)){try{XMLB[n.chave]=window.CIA_XML?await window.CIA_XML(n.chave):''}catch(e){return ''}}return XMLB[n.chave]||''}
function userDoc(k){if(REMOV.has(k))return{removido:true,chave:k};const n=notas[k];if(!n)return null;if(n.base&&!n.mod)return null;const b=Object.assign({},n);if(n.base)delete b.xml;return b}
function lsNotas(){const s={};Object.keys(notas).concat([...REMOV]).forEach(k=>{const d=userDoc(k);if(d)s[k]=d});try{localStorage.setItem(LSN,JSON.stringify(s))}catch(e){try{Object.keys(s).forEach(k=>{s[k]=Object.assign({},s[k],{xml:''})});localStorage.setItem(LSN,JSON.stringify(s))}catch(e2){}}}
const OURS=/WE\s*PREMIUM|CIA\.?\s*BEAUTY|CREATIVE\s*HOUSE/i,WEP=/WE\s*PREMIUM/i;
function tg(el,tag){const x=el&&el.getElementsByTagNameNS('*',tag)[0];return x?x.textContent.trim():''}
function parseNFe(txt){
  const doc=new DOMParser().parseFromString(txt,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)return null;
  const inf=doc.getElementsByTagNameNS('*','infNFe')[0];if(!inf)return null;
  const ide=inf.getElementsByTagNameNS('*','ide')[0],emit=inf.getElementsByTagNameNS('*','emit')[0],dest=inf.getElementsByTagNameNS('*','dest')[0],tot=inf.getElementsByTagNameNS('*','ICMSTot')[0];
  const chave=((inf.getAttribute('Id')||'').replace(/^NFe/,''))||tg(doc,'chNFe');
  const itens=[...inf.getElementsByTagNameNS('*','det')].map(d=>{const p=d.getElementsByTagNameNS('*','prod')[0];return[tg(p,'cProd'),tg(p,'xProd'),tg(p,'uCom'),+tg(p,'qCom')||0,+tg(p,'vUnCom')||0,+tg(p,'vProd')||0,tg(p,'CFOP')]});
  const dh=tg(ide,'dhEmi')||tg(ide,'dEmi');
  const n={chave,num:tg(ide,'nNF'),serie:tg(ide,'serie'),data:dh.slice(0,10),natOp:tg(ide,'natOp'),tpNF:tg(ide,'tpNF'),
    emit:tg(emit,'xNome'),emitDoc:tg(emit,'CNPJ')||tg(emit,'CPF'),dest:tg(dest,'xNome'),destDoc:tg(dest,'CNPJ')||tg(dest,'CPF'),
    vNF:+tg(tot,'vNF')||itens.reduce((a,i)=>a+i[5],0),itens};
  n.tipo=OURS.test(n.dest)?'entrada':OURS.test(n.emit)?(n.tpNF==='0'?'entrada':'saida'):'entrada';
  return n;
}
const qN=[];let qBusy=false;
function saveNota(ch){if(!db){lsNotas();return}qN.push(ch);if(!qBusy)pump()}
async function pump(){qBusy=true;while(qN.length){const ch=qN.shift();try{const b=userDoc(ch);if(b){if((b.xml||'').length>200000)b.xml='';await db.collection('notas').doc(ch).set(b)}else await db.collection('notas').doc(ch).delete();setSave('ok','Notas salvas')}catch(e){setSave('warn','Notas ficaram só neste navegador');lsNotas()}}qBusy=false;lsNotas()}
async function importFiles(files){
  const msg=$('#impMsg');let ok=0,dup=0,bad=0,plan=0;const textos=[];
  msg.textContent='Lendo arquivos…';
  for(const f of files){
    try{
      if(/\.zip$/i.test(f.name)){
        if(!window.JSZip){bad++;continue}
        const z=await JSZip.loadAsync(f);
        for(const nm of Object.keys(z.files)){if(/\.xml$/i.test(nm)&&!z.files[nm].dir)textos.push(await z.files[nm].async('string'))}
      }else textos.push(await f.text());
    }catch(e){bad++}
  }
  textos.forEach(x=>{const n=parseNFe(x);if(!n||!n.chave){bad++;return}
    if(notas[n.chave]){dup++;return}
    n.xml=x;n.importado=new Date().toISOString().slice(0,10);if(BASE_CH.has(n.chave))plan++;
    notas[n.chave]=n;ok++;saveNota(n.chave)});
  lsNotas();applyNotas();renderAll();
  msg.textContent=ok+' nota(s) importada(s)'+(dup?' · '+dup+' já estavam no painel':'')+(plan?' · '+plan+' já constam na planilha (não somam de novo)':'')+(bad?' · '+bad+' arquivo(s) não são NF-e válida':'');
}
let CFG_ENT={fonte:'planilha',ignorar:[]};let CONS={},ENT_ALL={},EMP_INS={},ALOC={};
function fonteNotas(){return CFG_ENT.fonte==='notas'}
function envDe(p){const o=st(p);return o.envCods||p.envCods||[]}
function estInsumo(cod){let ea=null;try{ea=estoqueAtual}catch(x){}const k=normK0(cod);const it=ea&&ea.itens?ea.itens.find(i=>normK0(i.cod)===k):null;return{qtd:it?(+it.qtd||0):0,loc:it?it.loc||{}:{}}}
function normK0(s){return String(s==null?'':s).trim().toUpperCase()}
function applyNotas(){
  XIN={};XOUT={};ENT_ALL={};const soNotas=fonteNotas();const mes=soNotas?{}:Object.assign({},MES_BASE),cat={};
  Object.values(notas).forEach(n=>{if(n.tipo!=='entrada'||n.cancelada||/STRALOG/i.test(n.emit))return;n.itens.forEach(i=>{if(/^[1256](201|202|410|411)$/.test(i[6]))return;ENT_ALL[i[0]]=(ENT_ALL[i[0]]||0)+i[3]})});
  Object.values(notas).forEach(n=>{
    if(n.tipo==='saida'){n.itens.forEach(i=>{XOUT[i[0]]=(XOUT[i[0]]||0)+i[3]});return}
    if((!soNotas&&BASE_CH.has(n.chave))||n.cancelada||/STRALOG/i.test(n.emit))return;
    const m=(n.data||'').slice(0,7);
    n.itens.forEach(i=>{if(/^[1256](201|202|410|411)$/.test(i[6]))return;XIN[i[0]]=(XIN[i[0]]||0)+i[3];if(m)mes[m]=(mes[m]||0)+i[5];
      const k=i[0]+'|'+n.emit;const c=cat[k]||(cat[k]=[i[0],i[1],n.emit,0,i[4],n.data]);c[3]+=i[3];if((n.data||'')>=c[5]){c[4]=i[4];c[5]=n.data}});
  });
  D.comprasMes=mes;D.catalogo=(soNotas?[]:CAT_BASE).concat(Object.values(cat));
  D.projetos.forEach(p=>{const cs=envDe(p);const ex=cs.length?Math.min(...cs.map(c=>XIN[c]||0)):0;p.rec=(soNotas?0:p.rec0)+ex});
  CONS={};EMP_INS={};ALOC={};
  const ps=allProjects();
  ps.forEach(p=>comps(p).forEach(c=>{if(!c.cod||c.cod==='?')return;const k=String(c.cod);const coef=+c.coef||0;const e=EMP_INS[k]||(EMP_INS[k]={cod:k,nome:c.nome||'',forn:c.forn||'',entrou:ENT_ALL[k]||0,saldoPl:0,cons:{},res:{}});e.saldoPl=Math.max(e.saldoPl,+c.saldo||0);
    const cq=produzido(p)*coef,rq=aProduzir(p)*coef;if(cq)e.cons[p.id]=(e.cons[p.id]||0)+cq;if(rq)e.res[p.id]=(e.res[p.id]||0)+rq;CONS[k]=(CONS[k]||0)+cq}));
  Object.values(EMP_INS).forEach(e=>{e.consT=Object.values(e.cons).reduce((a,b)=>a+b,0);e.resT=Object.values(e.res).reduce((a,b)=>a+b,0);e.mont=(soNotas||!e.saldoPl)?e.entrou-e.consT:e.saldoPl+(XIN[e.cod]||0);e.loc=estInsumo(e.cod);e.semEntrada=e.mont<0;e.disp=Math.max(0,e.mont)+e.loc.qtd;let livre=e.disp;e.aloc={};
    Object.keys(e.res).sort((a,b)=>a.localeCompare(b)).forEach(pid=>{const q=Math.min(e.res[pid],livre);livre-=q;e.aloc[pid]=q;(ALOC[pid]=ALOC[pid]||{})[e.cod]=q});e.livre=e.disp-e.resT});
}
/* ---------- ENTRADAS: notas do Bling, origem das entradas e cadastro de vínculos (estruturas) ---------- */
let BLX={rodando:false,feito:false,msg:''};
async function puxarXmlsBling(){
  if(BLX.rodando||!db||!window.CIA_XML_LISTA||document.body.classList.contains('ro'))return;BLX.rodando=true;
  try{const lista=await CIA_XML_LISTA('bling');const falta=lista.filter(k=>!notas[k]);let ok=0;
    for(const k of falta){try{const x=await CIA_XML(k);const n=parseNFe(x);if(!n||!n.chave)continue;n.importado=new Date().toISOString().slice(0,10);n.origem='bling';notas[n.chave]=n;saveNota(n.chave);ok++;if(ok%25===0){BLX.msg='Trazendo notas do Bling… '+ok+' de '+falta.length;setSave('',BLX.msg)}}catch(e){}}
    BLX.msg=lista.length?(lista.length+' notas de entrada vindas do Bling'+(ok?' ('+ok+' novas agora)':'')):'Nenhuma nota do Bling ainda';
    if(ok){lsNotas();applyNotas();renderAll()}setSave('ok','Salvo na nuvem')}
  catch(e){BLX.msg='Não consegui ler as notas do Bling: '+(e.message||e)}
  BLX.rodando=false;BLX.feito=true;const el=$('#entBling');if(el)el.textContent=BLX.msg}
function salvarCfgEnt(){applyNotas();renderAll();if(db)db.doc('cfg/entradas').set(CFG_ENT).catch(()=>setSave('warn','Não salvou a configuração'))}
function recPorModo(modo){const salvo=CFG_ENT.fonte;CFG_ENT.fonte=modo;applyNotas();const r={};allProjects().forEach(p=>{r[p.id]=p.rec||0});CFG_ENT.fonte=salvo;applyNotas();return r}
function renderEntradas(){
  const el=$('#entPainel');if(!el)return;const gestor=['admin','master'].includes(window.CIA_PAPEL?CIA_PAPEL():'');
  const a=recPorModo('planilha'),b=recPorModo('notas');const ps=allProjects();
  const dif=ps.filter(p=>(a[p.id]||0)!==(b[p.id]||0));const tA=ps.reduce((s,p)=>s+(a[p.id]||0),0),tB=ps.reduce((s,p)=>s+(b[p.id]||0),0);
  const nBling=Object.values(notas).filter(n=>n.origem==='bling').length;
  el.innerHTML='<div class="row" style="margin-bottom:6px"><h3 class="grow">De onde vêm as entradas</h3><span class="note" id="entBling">'+esc(BLX.msg||(nBling?nBling+' notas vindas do Bling':'buscando notas do Bling…'))+'</span></div>'
    +'<div class="row" style="gap:14px;flex-wrap:wrap"><label class="ck"><input type="radio" name="entFonte" value="planilha"'+(fonteNotas()?'':' checked')+(gestor?'':' disabled')+'> Planilha Geral + notas novas</label><label class="ck"><input type="radio" name="entFonte" value="notas"'+(fonteNotas()?' checked':'')+(gestor?'':' disabled')+'> Só notas fiscais (Bling e XML importado)</label></div>'
    +'<div class="res" style="margin-top:8px"><div class="box"><div class="eyebrow">Recebido pela planilha</div><div class="v num">'+fmtI.format(tA)+'</div></div><div class="box hl"><div class="eyebrow">Recebido só pelas notas</div><div class="v num">'+fmtI.format(tB)+'</div></div><div class="box"><div class="eyebrow">Projetos com diferença</div><div class="v num">'+dif.length+'</div><div class="note">de '+ps.length+'</div></div></div>'
    +(dif.length?'<details style="margin-top:6px"><summary class="note" style="cursor:pointer">Ver projetos com diferença</summary><div class="tbl-wrap" style="max-height:320px;overflow:auto;margin-top:6px"><table><thead><tr><th>Projeto</th><th class="n">Pela planilha</th><th class="n">Pelas notas</th><th class="n">Diferença</th><th>Códigos de recebimento</th></tr></thead><tbody>'
      +dif.sort((x,y)=>Math.abs((b[y.id]||0)-(a[y.id]||0))-Math.abs((b[x.id]||0)-(a[x.id]||0))).map(p=>'<tr><td>'+esc(p.id+' · '+pdNomeCurto(p))+'</td><td class="n">'+fmtI.format(a[p.id]||0)+'</td><td class="n">'+fmtI.format(b[p.id]||0)+'</td><td class="n">'+fmtI.format((b[p.id]||0)-(a[p.id]||0))+'</td><td class="mono note">'+esc(envDe(p).join(', ')||'— sem código')+'</td></tr>').join('')+'</tbody></table></div></details>':'')
    +'<p class="note">Com "Só notas fiscais", recebido, compras e estoque de insumos passam a sair das NF de entrada (as do Bling chegam sozinhas a cada 30 min). Os códigos que ligam cada nota ao produto ficam no cadastro de vínculos, na aba Compras.</p>';
}
document.addEventListener('change',e=>{if(e.target.dataset&&e.target.dataset.prazo!=null){const p=byId(cur);if(!p)return;const l=calc(p).linhas[+e.target.dataset.prazo];if(!l)return;const k=pagKey(l.c);CFG_PAG.forn=Object.assign({},CFG_PAG.forn);if(e.target.value)CFG_PAG.forn[k]=e.target.value;else delete CFG_PAG.forn[k];try{localStorage.setItem('ciab-pag',JSON.stringify(CFG_PAG))}catch(x){}renderAll();if(db)db.doc('cfg/pagamento').set(CFG_PAG).then(()=>setSave('ok','Prazo salvo: '+(short(l.c.forn)||l.c.nome)+' → '+prazoTxt(e.target.value))).catch(()=>setSave('warn','Prazo não salvou'));return}
  if(e.target.name==='entFonte'){CFG_ENT.fonte=e.target.value;salvarCfgEnt()}});
/* códigos de recebimento (qual linha da NF dá entrada no produto acabado) */
function codigosNF(){const m={};Object.values(notas).forEach(n=>{if(n.tipo!=='entrada'||n.cancelada||/STRALOG/i.test(n.emit))return;n.itens.forEach(i=>{const c=String(i[0]||'');if(c&&!m[c])m[c]=i[1]+' · '+short(n.emit)})});return m}
function pdRecebBlock(p){const cs=envDe(p);const ro=document.body.classList.contains('ro');const nomes=codigosNF();
  const chips=cs.map(c=>'<span class="chip" style="display:inline-flex;gap:6px;align-items:center" title="'+esc(nomes[c]||'código sem nota no painel')+'"><b class="mono">'+esc(c)+'</b><span class="note">'+fmtI.format(XIN[c]||0)+(fonteNotas()?' un. nas notas':' un. em notas novas')+'</span>'+(ro?'':'<button type="button" class="btn ghost" data-rcdel="'+esc(c)+'" aria-label="Remover código '+esc(c)+'" style="padding:0 6px">×</button>')+'</span>').join(' ')||'<span class="note">Nenhum código: o recebido vem só da planilha.</span>';
  return '<div><h3 style="margin-bottom:6px">Códigos de recebimento</h3><p class="note" style="margin-bottom:6px">A quantidade destes códigos nas NF de entrada conta como produto acabado recebido (ex.: mão de obra do envase da Giudit). Com mais de um código, vale o menor — o produto só fica pronto com todas as partes.</p><div style="display:flex;flex-wrap:wrap;gap:6px">'+chips+'</div>'
    +(ro?'':'<div class="row" style="margin-top:6px;gap:6px"><input type="text" id="rcNovo" list="rcCods" placeholder="Código da NF (ex.: 5833MO)" aria-label="Novo código de recebimento" style="width:200px"><datalist id="rcCods">'+Object.entries(nomes).slice(0,4000).map(([c,d])=>'<option value="'+esc(c)+'">'+esc(d)+'</option>').join('')+'</datalist><button type="button" class="btn" data-rcadd="'+esc(p.id)+'">Adicionar código</button><span class="note">Recebido hoje: <b>'+fmtI.format(p.rec||0)+'</b> de '+fmtI.format(total(p))+'</span></div>')+'</div>'}
function salvarRecebimento(pid,lista){const p=byId(pid);if(!p)return;const o=ov[pid]||(ov[pid]={});o.envCods=[...new Set(lista.map(c=>String(c).trim().toUpperCase()).filter(Boolean))];persist(pid);applyNotas();renderAll();if(!$('#tab-produtos').hidden)pdPainel()}
document.addEventListener('click',e=>{const d=e.target.closest('[data-rcdel]'),a=e.target.closest('[data-rcadd]');if(!d&&!a)return;const pid=PD.cur;const p=byId(pid);if(!p)return;
  if(d){salvarRecebimento(pid,envDe(p).filter(c=>c!==d.dataset.rcdel));setSave('ok','Código '+d.dataset.rcdel+' removido de '+pid);return}
  const v=($('#rcNovo').value||'').trim().toUpperCase();if(!v){$('#rcNovo').focus();return}salvarRecebimento(pid,envDe(p).concat([v]));setSave('ok','Código '+v+' adicionado a '+pid)});
/* empenho de insumos por produto acabado */
let EMPI_Q='',EMPI_F='';
function renderEmpInsumos(){const el=$('#empiPainel');if(!el)return;const P={};allProjects().forEach(p=>P[p.id]=p);
  const L=Object.values(EMP_INS).filter(e=>e.cod&&(e.entrou||e.consT||e.resT));const q=EMPI_Q.toLowerCase();
  const F=L.filter(e=>(!q||(e.cod+' '+e.nome+' '+e.forn+' '+Object.keys(e.res).concat(Object.keys(e.cons)).join(' ')).toLowerCase().includes(q))&&(!EMPI_F||(EMPI_F==='falta'?e.livre<0:EMPI_F==='multi'?new Set(Object.keys(e.cons).concat(Object.keys(e.res))).size>1:e.livre>0)))
    .sort((a,b)=>a.livre-b.livre);
  const nF=L.filter(e=>e.livre<0).length,nM=L.filter(e=>new Set(Object.keys(e.cons).concat(Object.keys(e.res))).size>1).length;
  const det=e=>{const ids=[...new Set(Object.keys(e.cons).concat(Object.keys(e.res)))].sort();return '<table style="margin:4px 0 2px"><thead><tr><th>Produto</th><th class="n">Consumido</th><th class="n">Empenhado</th><th class="n">Coberto pelo saldo</th></tr></thead><tbody>'+ids.map(id=>'<tr><td>'+esc(id+' · '+(P[id]?pdNomeCurto(P[id]):''))+'</td><td class="n">'+fmtI.format(Math.round(e.cons[id]||0))+'</td><td class="n">'+fmtI.format(Math.round(e.res[id]||0))+'</td><td class="n">'+(e.res[id]?fmtI.format(Math.round(e.aloc[id]||0))+(e.aloc[id]<e.res[id]?' <span class="pill bad">falta '+fmtI.format(Math.round(e.res[id]-e.aloc[id]))+'</span>':''):'—')+'</td></tr>').join('')+'</tbody></table>'};
  el.innerHTML='<div class="row" style="margin-bottom:8px"><h3 class="grow">Empenho de insumos por produto</h3><input type="search" id="empiBusca" value="'+esc(EMPI_Q)+'" placeholder="Buscar insumo, código, fornecedor ou produto" aria-label="Buscar insumo" style="flex:1 1 260px"></div>'
    +'<div class="chips" id="empiChips" style="margin-bottom:8px">'+[['','Todos ('+L.length+')'],['falta','Faltando ('+nF+')'],['multi','Usados em mais de um produto ('+nM+')'],['sobra','Com saldo livre']].map(([k,t])=>'<button class="chip" data-ef="'+k+'" aria-pressed="'+(EMPI_F===k)+'">'+t+'</button>').join('')+'</div>'
    +'<p class="note" style="margin-bottom:8px">Tenho = insumo na montagem (entrou pelas notas/planilha − consumido no que já foi produzido) + saldo nos depósitos (Bling, Stralog, Galpão e demais locais). O 1º pedido conta como produzido assim que começa a ser entregue; empenhado = o que falta produzir (2º pedido), na ordem dos códigos de produto. Clique na linha para ver produto a produto.</p>'
    +(F.length?'<div class="tbl-wrap" style="max-height:560px;overflow:auto"><table><thead><tr><th>Código</th><th>Insumo</th><th>Fornecedor</th><th class="n">Entrou (notas)</th><th class="n">Consumido</th><th class="n">Disponível</th><th class="n">Empenhado</th><th class="n">Saldo livre</th><th class="n">Produtos</th></tr></thead><tbody>'
      +F.slice(0,400).map(e=>{const n=new Set(Object.keys(e.cons).concat(Object.keys(e.res))).size;return '<tr class="empiL" style="cursor:pointer"><td class="mono">'+esc(e.cod)+'</td><td>'+esc(e.nome)+'</td><td>'+esc(short(e.forn))+'</td><td class="n">'+fmtI.format(Math.round(e.entrou))+'</td><td class="n">'+fmtI.format(Math.round(e.consT))+'</td><td class="n">'+fmtI.format(Math.round(e.disp))+'</td><td class="n">'+fmtI.format(Math.round(e.resT))+'</td><td class="n">'+(e.livre<0?'<span class="pill bad">falta '+fmtI.format(Math.round(-e.livre))+'</span>':fmtI.format(Math.round(e.livre)))+'</td><td class="n">'+n+'</td></tr><tr class="empiD" hidden><td colspan="9">'+det(e)+'</td></tr>'}).join('')+'</tbody></table></div>':'<p class="note">Nada encontrado.</p>')
    ;
  const b=$('#empiBusca');if(b)b.oninput=e=>{EMPI_Q=e.target.value;renderEmpInsumos();const nb=$('#empiBusca');nb.focus();nb.setSelectionRange(nb.value.length,nb.value.length)}}
document.addEventListener('click',e=>{const el=$('#empiPainel');if(!el||!el.contains(e.target))return;const c=e.target.closest('[data-ef]');if(c){EMPI_F=c.dataset.ef;renderEmpInsumos();return}
  const tr=e.target.closest('tr.empiL');if(tr){const d=tr.nextElementSibling;if(d)d.hidden=!d.hidden}});
/* sinalizar insumo errado / indicar o correto */
let SINAIS={};
function renderSinaisSim(){const el=$('#sinaisSim');if(!el)return;const n=sinaisAbertos().length;el.hidden=!n;el.innerHTML=n?'⚑ '+n+' insumo(s) sinalizado(s) aguardando correção — veja a lista na aba Compras. ':''}
const sinalKey=(pid,c)=>pid+'|'+(c.cod&&c.cod!=='?'?c.cod:semAc(c.nome).slice(0,40));
function sinaisAbertos(){return Object.entries(SINAIS).filter(([,x])=>x&&!x.resolvido)}
function sinalPill(pid,c){const x=SINAIS[sinalKey(pid,c).replace(/[^\w|.-]/g,'_')];return x&&!x.resolvido?' <span class="pill bad" title="'+esc((x.correto?'Correto: '+x.correto+'. ':'')+(x.msg||'')+' — '+(x.por||'')+' '+dBR((x.em||'').slice(0,10)))+'">⚑ sinalizado</span>':''}
function abrirSinal(p,c){const id=sinalKey(p.id,c).replace(/[^\w|.-]/g,'_');const x=SINAIS[id]||{};
  let m=$('#sinalModal');if(!m){document.body.insertAdjacentHTML('beforeend','<div class="modal" id="sinalModal" hidden><form class="panel" id="sinalForm" style="width:min(520px,100%)"><h2>Sinalizar insumo</h2><p class="note" id="sgInfo"></p><label>Qual é o insumo correto?<input type="text" id="sgCorreto" list="sgLista" placeholder="Ex.: Frasco Amarelo Unique 200ml (08.1513.0001-L)"></label><datalist id="sgLista"></datalist><label>Observação<textarea id="sgMsg" rows="3" placeholder="Ex.: este frasco é do kit, não do leave-in"></textarea></label><div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" id="sgResolver">Marcar como resolvido</button><span class="grow"></span><button type="button" class="btn" id="sgFechar">Fechar</button><button class="btn pri">Salvar sinal</button></div></form></div>');m=$('#sinalModal');
    $('#sgFechar').onclick=()=>{m.hidden=true};m.addEventListener('click',e=>{if(e.target===m)m.hidden=true});
    $('#sinalForm').addEventListener('submit',e=>{e.preventDefault();const d=m._d;SINAIS[d.id]={pid:d.pid,sku:d.sku,cod:d.cod,nome:d.nome,correto:$('#sgCorreto').value.trim().slice(0,160),msg:$('#sgMsg').value.trim().slice(0,500),por:window.__NOME||'',em:new Date().toISOString(),resolvido:false};salvarSinal(d.id);m.hidden=true});
    $('#sgResolver').onclick=()=>{const d=m._d;if(SINAIS[d.id]){SINAIS[d.id]=Object.assign({},SINAIS[d.id],{resolvido:true,resolvidoPor:window.__NOME||'',resolvidoEm:new Date().toISOString()});salvarSinal(d.id)}m.hidden=true}}
  m._d={id,pid:p.id,sku:p.sku,cod:c.cod||'',nome:c.nome||''};
  $('#sgInfo').innerHTML='<b>'+esc(p.id+' · '+pdNomeCurto(p))+'</b><br>Insumo: '+esc(c.nome||'')+(c.cod?' <span class="mono">('+esc(c.cod)+')</span>':'')+(x.em&&!x.resolvido?'<br><span class="pill bad">já sinalizado por '+esc(x.por||'—')+' em '+dBR((x.em||'').slice(0,10))+'</span>':'');
  $('#sgCorreto').value=x.correto||'';$('#sgMsg').value=x.msg||'';$('#sgResolver').hidden=!x.em||x.resolvido;
  $('#sgLista').innerHTML=insumosCadastrados().slice(0,800).map(r=>'<option value="'+esc(r.nome+(r.cod?' ('+r.cod+')':''))+'">').join('');
  m.hidden=false;$('#sgCorreto').focus()}
function salvarSinal(id){renderAll();if(db)db.collection('sinais').doc(id).set(SINAIS[id]).then(()=>setSave('ok','Sinal salvo')).catch(()=>setSave('warn','Sinal não salvou'))}
function renderSinais(){const el=$('#sinaisPainel');if(!el)return;const L=sinaisAbertos().sort((a,b)=>String(b[1].em).localeCompare(String(a[1].em)));el.hidden=!L.length;if(!L.length){el.innerHTML='';return}
  el.innerHTML='<div class="row" style="margin-bottom:8px"><h3 class="grow">⚑ Insumos sinalizados ('+L.length+')</h3><span class="note">Indicações de insumo errado para corrigir na estrutura</span></div><div class="tbl-wrap"><table><thead><tr><th>Produto</th><th>Insumo sinalizado</th><th>Insumo correto</th><th>Observação</th><th>Por</th><th></th></tr></thead><tbody>'
    +L.map(([id,x])=>'<tr><td>'+esc(x.pid+' · '+(x.sku||''))+'</td><td>'+esc(x.nome)+(x.cod?' <span class="mono note">'+esc(x.cod)+'</span>':'')+'</td><td>'+esc(x.correto||'—')+'</td><td class="note">'+esc(x.msg||'')+'</td><td class="note">'+esc(x.por||'—')+' · '+dBR(String(x.em||'').slice(0,10))+'</td><td style="white-space:nowrap"><button class="btn" data-sgabrir="'+esc(x.pid)+'">Abrir em Custos</button>'+(document.body.classList.contains('ro')?'':' <button class="btn ghost" data-sgok="'+esc(id)+'">Resolvido</button>')+'</td></tr>').join('')+'</tbody></table></div>'}
document.addEventListener('click',e=>{const a=e.target.closest('[data-sgabrir]'),o=e.target.closest('[data-sgok]');if(a){cur=a.dataset.sgabrir;showTab('simulador');return}
  if(o){const id=o.dataset.sgok;SINAIS[id]=Object.assign({},SINAIS[id],{resolvido:true,resolvidoPor:window.__NOME||'',resolvidoEm:new Date().toISOString()});salvarSinal(id)}});
/* cadastro de vínculos: código de insumo da NF -> produto acabado */
let VINC_Q='';
function codigosVinculados(){const s=new Set();allProjects().forEach(p=>{comps(p).forEach(c=>{if(c.cod){s.add(String(c.cod));if(/Envase Giudit/i.test(c.nome||''))s.add(c.cod+'MO')}});envDe(p).forEach(c=>s.add(String(c)))});return s}
function codigosSemVinculo(){const lig=codigosVinculados(),ign=new Set(CFG_ENT.ignorar||[]),m={};
  Object.values(notas).forEach(n=>{if(n.tipo!=='entrada'||n.cancelada||/STRALOG/i.test(n.emit))return;n.itens.forEach(i=>{const c=String(i[0]||'');if(!c||lig.has(c)||ign.has(c+'|'+short(n.emit))||/^[1256](201|202|410|411|949|915|916)$/.test(i[6]))return;
    const k=c+'|'+n.emit;const x=m[k]||(m[k]={cod:c,desc:i[1],forn:n.emit,q:0,v:i[4],data:n.data,nf:n.num});x.q+=i[3];if((n.data||'')>=x.data){x.data=n.data;x.v=i[4];x.nf=n.num;x.desc=i[1]}})});
  return Object.values(m).sort((a,b)=>String(b.data).localeCompare(String(a.data)))}
function renderVinculos(){const el=$('#vincPainel');if(!el)return;const ro=document.body.classList.contains('ro');const L=codigosSemVinculo();const q=VINC_Q.toLowerCase();
  const F=L.filter(x=>!q||(x.cod+' '+x.desc+' '+x.forn).toLowerCase().includes(q));
  const ops=allProjects().slice().sort((a,b)=>(a.colecao||'').localeCompare(b.colecao||'')||a.sku.localeCompare(b.sku)).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.id+' · '+(p.colecao||'')+' · '+pdNomeCurto(p))+'</option>').join('');
  el.innerHTML='<div class="row" style="margin-bottom:8px"><h3 class="grow">Cadastro de vínculos: códigos das notas sem produto</h3><input type="search" id="vincBusca" value="'+esc(VINC_Q)+'" placeholder="Buscar código, insumo ou fornecedor" aria-label="Buscar código sem vínculo" style="flex:1 1 260px"></div>'
    +'<p class="note" style="margin-bottom:8px">'+L.length+' código(s) de NF de entrada ainda não estão ligados a nenhum produto acabado. Ligue cada um ao produto: ele entra na estrutura de custo (com o preço da nota) e, se marcar "recebido", passa a contar como produto entregue.</p>'
    +(F.length?'<div class="tbl-wrap" style="max-height:520px;overflow:auto"><table><thead><tr><th>Código</th><th>Descrição na NF</th><th>Fornecedor</th><th class="n">Qtd</th><th class="n">Últ. preço</th><th>Últ. NF</th>'+(ro?'':'<th>Ligar ao produto</th><th></th>')+'</tr></thead><tbody>'
      +F.slice(0,300).map((x,i)=>'<tr data-vi="'+i+'"><td class="mono">'+esc(x.cod)+'</td><td>'+esc(x.desc)+'</td><td>'+esc(short(x.forn))+'</td><td class="n">'+fmtI.format(x.q)+'</td><td class="n">'+fmtR.format(x.v)+'</td><td class="note">'+esc(x.nf)+' · '+dBR(x.data)+'</td>'
        +(ro?'':'<td style="min-width:300px"><select class="vi-p" aria-label="Produto" style="max-width:260px"><option value="">Escolha o produto…</option>'+ops+'</select> <input class="vi-k" type="number" min="0" step="0.0001" value="1" title="Quantidade por unidade do produto" aria-label="Quantidade por unidade" style="width:70px"> <label class="ck note" title="A quantidade desta nota conta como produto recebido"><input type="checkbox" class="vi-r"> recebido</label></td><td><button type="button" class="btn" data-vlig="'+i+'">Ligar</button> <button type="button" class="btn ghost" data-vign="'+i+'" title="Não é insumo de produto (ex.: material de escritório)">Ignorar</button></td>')+'</tr>').join('')+'</tbody></table></div>':'<p class="note">Todos os códigos das notas de entrada já estão ligados a produtos. 👍</p>');
  el._lista=F;
  const b=$('#vincBusca');if(b)b.oninput=e=>{VINC_Q=e.target.value;renderVinculos();const nb=$('#vincBusca');nb.focus();nb.setSelectionRange(nb.value.length,nb.value.length)};
}
document.addEventListener('click',e=>{const el=$('#vincPainel');if(!el||!el.contains(e.target))return;
  const lg=e.target.closest('[data-vlig]'),ig=e.target.closest('[data-vign]');
  if(ig){const x=el._lista[+ig.dataset.vign];CFG_ENT.ignorar=(CFG_ENT.ignorar||[]).concat([x.cod+'|'+short(x.forn)]);salvarCfgEnt();return}
  if(!lg)return;const tr=lg.closest('tr'),x=el._lista[+lg.dataset.vlig];const pid=tr.querySelector('.vi-p').value,k=+tr.querySelector('.vi-k').value||0,rec=tr.querySelector('.vi-r').checked;
  if(!pid){tr.querySelector('.vi-p').focus();return}const p=byId(pid);if(!p)return;
  const o=ov[pid]||(ov[pid]={});o.comps=comps(p).map(c=>Object.assign({},c));
  o.comps.push({nome:String(x.desc).slice(0,80),cod:x.cod,forn:x.forn,coef:k,custo:x.v,origem:'NF',nota:'ligado pelo cadastro de vínculos (NF '+x.nf+')'});
  if(rec){o.envCods=envDe(p).concat([x.cod])}
  persist(pid);applyNotas();renderAll();setSave('ok','Código '+x.cod+' ligado a '+pid)});
/* ---------- GRUPO ECONÔMICO x EMPRESA (só filtra o que as abas Notas e Vendas mostram) ---------- */
const soDig=s=>String(s||'').replace(/\D/g,'');
const fmtCnpj=d=>d.length===14?d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):d;
function empRotulo(nome){return WEP.test(nome||'')?'We Premium':/CREATIVE/i.test(nome||'')?'Creative House':/CIA\.?\s*BEAUTY/i.test(nome||'')?'Cia Beauty':short(nome)}
function empNota(n){const e={doc:soDig(n.emitDoc),nome:n.emit},d={doc:soDig(n.destDoc),nome:n.dest};const nosso=x=>OURS.test(x.nome||'');
  if(n.tipo==='saida')return nosso(e)?e:(nosso(d)?d:e);return nosso(d)?d:(nosso(e)?e:d)}
function empresasGrupo(){const m={};Object.values(notas).forEach(n=>{const e=empNota(n);if(e.doc&&OURS.test(e.nome||'')&&!m[e.doc])m[e.doc]={doc:e.doc,nome:empRotulo(e.nome)}});
  const L=Object.values(m);const cont={};L.forEach(x=>{cont[x.nome]=(cont[x.nome]||0)+1});L.forEach(x=>{if(cont[x.nome]>1)x.nome+=' ('+fmtCnpj(x.doc).slice(-8)+')'});return L.sort((a,b)=>a.nome.localeCompare(b.nome))}
function empNome(doc){if(!doc)return 'Fora do grupo / não identificada';const e=empresasGrupo().find(x=>x.doc===doc);return e?e.nome:fmtCnpj(doc)}
let EMP='';try{EMP=localStorage.getItem('ciab-emp')||''}catch(e){}
function empChips(sel){const L=empresasGrupo();if(EMP&&!L.some(x=>x.doc===EMP))EMP='';
  $(sel).innerHTML='<button class="chip" data-emp="" aria-pressed="'+(EMP==='')+'">Grupo econômico</button>'+L.map(x=>'<button class="chip" data-emp="'+x.doc+'" aria-pressed="'+(EMP===x.doc)+'" title="CNPJ '+fmtCnpj(x.doc)+'">'+esc(x.nome)+'</button>').join('')}
function setEmp(d){EMP=d;try{localStorage.setItem('ciab-emp',d)}catch(e){}renderAll()}
function notasLista(){
  const q=$('#notaSearch').value.trim().toLowerCase();
  return Object.values(notas).filter(n=>(!EMP||empNota(n).doc===EMP)&&(!notaFiltro||n.tipo===notaFiltro)&&(!q||[n.num,n.emit,n.dest,n.natOp,n.chave].concat(n.itens.map(i=>i[0]+' '+i[1])).join(' ').toLowerCase().includes(q))).sort((a,b)=>(b.data||'').localeCompare(a.data||''));
}
function renderNotas(){
  empChips('#notaEmp');
  const todas=Object.values(notas),all=todas.filter(n=>!EMP||empNota(n).doc===EMP),E=all.filter(n=>n.tipo==='entrada'),S=all.filter(n=>n.tipo==='saida');
  {const G={};todas.forEach(n=>{const d=empNota(n).doc;const k=OURS.test(empNota(n).nome||'')?d:'';const g=G[k]||(G[k]={e:0,ev:0,s:0,sv:0});if(n.tipo==='entrada'){g.e++;g.ev+=n.vNF||0}else{g.s++;g.sv+=n.vNF||0}});
   const ks=Object.keys(G).sort((a,b)=>empNome(a).localeCompare(empNome(b)));const tot=ks.reduce((t,k)=>({e:t.e+G[k].e,ev:t.ev+G[k].ev,s:t.s+G[k].s,sv:t.sv+G[k].sv}),{e:0,ev:0,s:0,sv:0});
   $('#notaEmpTbl').innerHTML=EMP?'':'<h3 style="margin-bottom:8px">Por empresa do grupo</h3><div class="tbl-wrap"><table><thead><tr><th>Empresa</th><th class="n">Entradas</th><th class="n">Valor entradas</th><th class="n">Saídas</th><th class="n">Valor saídas</th></tr></thead><tbody>'+ks.map(k=>'<tr class="empLinha" data-emp="'+k+'" style="cursor:'+(k?'pointer':'default')+'"><td>'+esc(empNome(k))+(k?' <span class="note mono">'+fmtCnpj(k)+'</span>':'')+'</td><td class="n">'+fmtI.format(G[k].e)+'</td><td class="n">'+fmtR0.format(G[k].ev)+'</td><td class="n">'+fmtI.format(G[k].s)+'</td><td class="n">'+fmtR0.format(G[k].sv)+'</td></tr>').join('')+'</tbody><tfoot><tr><td>Grupo econômico</td><td class="n">'+fmtI.format(tot.e)+'</td><td class="n">'+fmtR0.format(tot.ev)+'</td><td class="n">'+fmtI.format(tot.s)+'</td><td class="n">'+fmtR0.format(tot.sv)+'</td></tr></tfoot></table></div>';}
  const sum=a=>a.reduce((x,n)=>x+(n.vNF||0),0);
  $('#notaResumo').innerHTML='<div class="box"><div class="eyebrow">Entradas'+(EMP?' · '+esc(empNome(EMP)):'')+'</div><div class="v num">'+E.length+'</div><div class="note">'+fmtR0.format(sum(E))+'</div></div><div class="box"><div class="eyebrow">Saídas'+(EMP?' · '+esc(empNome(EMP)):'')+'</div><div class="v num">'+S.length+'</div><div class="note">'+fmtR0.format(sum(S))+'</div></div><div class="box"><div class="eyebrow">Itens novos no estoque</div><div class="v num">'+fmtI.format(Object.values(XIN).reduce((a,b)=>a+b,0))+'</div><div class="note">un. de entradas fora da planilha</div></div>';
  document.querySelectorAll('#notaChips .chip').forEach(c=>c.setAttribute('aria-pressed',c.dataset.f===notaFiltro));
  const rows=notasLista();
  if(!all.length){$('#notasTbl').innerHTML='<tbody><tr><td class="muted" style="padding:18px">'+(EMP&&todas.length?'Nenhuma nota desta empresa.</td></tr></tbody>':'Nenhuma nota importada ainda. Arraste os XMLs de NF-e (ou o .zip exportado do Bling) na área acima.</td></tr></tbody>');return}
  let h='<thead><tr><th>Tipo</th><th>Nº</th><th>Emissão</th><th>Emitente</th><th>Destinatário</th><th>Natureza</th><th class="n">Itens</th><th class="n">Valor</th><th></th><th></th></tr></thead><tbody>';
  rows.forEach(n=>{
    h+='<tr class="nrow" data-ch="'+esc(n.chave)+'" style="cursor:pointer"><td><span class="pill '+(n.tipo==='entrada'?'ok':'warn')+'">'+(n.tipo==='entrada'?'Entrada':'Saída')+'</span></td><td class="mono">'+esc(n.num)+'</td><td class="mono">'+(n.data?n.data.split('-').reverse().join('/'):'—')+'</td><td>'+esc(short(n.emit))+'</td><td>'+esc(short(n.dest))+'</td><td class="note">'+esc(n.natOp)+'</td><td class="n">'+n.itens.length+'</td><td class="n">'+fmtR.format(n.vNF||0)+'</td><td>'+(n.cancelada?'<span class="pill bad">cancelada</span> ':'')+(BASE_CH.has(n.chave)?'<span class="pill neu">já na planilha</span>':'')+'</td><td style="white-space:nowrap"><button class="btn ghost" data-tg="'+esc(n.chave)+'" title="Trocar entrada/saída">⇄</button><button class="btn ghost" data-rm="'+esc(n.chave)+'" aria-label="Excluir nota">✕</button></td></tr>';
    if(notaAberta===n.chave){h+='<tr><td colspan="10" style="background:var(--sunk)"><div class="note mono" style="margin-bottom:6px">Chave '+esc(n.chave)+'</div><table><thead><tr><th>Código</th><th>Descrição</th><th>Unid.</th><th class="n">Qtd</th><th class="n">Valor un.</th><th class="n">Total</th><th>CFOP</th></tr></thead><tbody>'+n.itens.map(i=>'<tr><td class="mono">'+esc(i[0])+'</td><td>'+esc(i[1])+'</td><td>'+esc(i[2])+'</td><td class="n">'+fmtI.format(i[3])+'</td><td class="n">'+fmtU.format(i[4])+'</td><td class="n">'+fmtR.format(i[5])+'</td><td class="mono">'+esc(i[6])+'</td></tr>').join('')+'</tbody></table></td></tr>'}
  });
  $('#notasTbl').innerHTML=h+'</tbody>';
}
let ULT_EXPORT=null;
async function baixar(nome,data,btn){
  let motivo='';
  try{
    const pm=await claude.use('permissions');
    if(pm){let st=await pm.state('downloads');if(st==='prompt'){const r=await pm.request(['downloads']);st=r&&r.downloads||st}
      if(st==='denied'){abrirCopia(nome,'o download foi bloqueado nas permissões deste app',true);return}}
    const dl=await claude.use('downloads');
    if(dl){await dl.save({filename:nome,data});return}
    motivo='esta visualização não permite baixar arquivos';
  }catch(e){
    const c=e&&e.code;if(c==='declined')return;
    motivo=({rejected_extension:'o formato do arquivo foi recusado',extension_not_enabled:'arquivos Excel/ZIP estão desligados nesta visualização',rate_limited:'já existe um download aguardando confirmação',too_large:'arquivo grande demais',unavailable:'download indisponível nesta visualização',not_granted:'download não autorizado'})[c]||('erro '+(c||e&&e.message||''));
  }
  abrirCopia(nome,motivo,motivo.includes('autoriz'));
}
function tsv(rows){return rows.map(r=>r.map(v=>{const s=v==null?'':String(v);return typeof v==='number'?s.replace('.',','):s.replace(/[\t\n\r]+/g,' ')}).join('\t')).join('\n')}
function abrirCopia(nome,motivo,perm){
  const m=$('#copyModal');const ks=ULT_EXPORT||[];
  $('#copyMotivo').textContent='Não deu para baixar: '+motivo+'. Tente de novo pelo navegador Chrome no computador. Enquanto isso, copie cada tabela abaixo e cole no Excel (Ctrl+V).';
  $('#copyList').innerHTML=ks.length?ks.map(k=>'<button class="btn" data-copy="'+k+'">Copiar '+esc(ABA_NOME[k])+'</button>').join(''):'<span class="note">Use os botões "Exportar esta aba" ou "Relatório completo" para gerar as tabelas.</span>';
  $('#copyPerm').hidden=!perm;
  m.hidden=false;
}
$('#fileIn').addEventListener('change',e=>{importFiles([...e.target.files]);e.target.value=''});
const drop=$('#drop');
['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',e=>{const fs=[...(e.dataTransfer?e.dataTransfer.files:[])];if(fs.length)importFiles(fs)});
$('#notaEmp').addEventListener('click',e=>{const c=e.target.closest('[data-emp]');if(c)setEmp(c.dataset.emp)});
$('#notaEmpTbl').addEventListener('click',e=>{const c=e.target.closest('tr[data-emp]');if(c&&c.dataset.emp)setEmp(c.dataset.emp)});
$('#notaChips').addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;notaFiltro=c.dataset.f;renderNotas()});
$('#notaSearch').addEventListener('input',renderNotas);
$('#notasTbl').addEventListener('click',e=>{
  const tgb=e.target.closest('[data-tg]'),rm=e.target.closest('[data-rm]');
  if(tgb){const n=notas[tgb.dataset.tg];n.mod=true;n.tipo=n.tipo==='entrada'?'saida':'entrada';saveNota(n.chave);applyNotas();renderAll();return}
  if(rm){const ch=rm.dataset.rm;if(rm.dataset.ok){if(notas[ch]&&notas[ch].base)REMOV.add(ch);delete notas[ch];saveNota(ch);applyNotas();renderAll()}else{rm.dataset.ok='1';rm.textContent='Excluir?';setTimeout(()=>{if(rm.isConnected){delete rm.dataset.ok;rm.textContent='✕'}},3000)}return}
  const r=e.target.closest('.nrow');if(r){notaAberta=notaAberta===r.dataset.ch?null:r.dataset.ch;renderNotas()}
});
$('#expXml').addEventListener('click',async e=>{ULT_EXPORT=['notas'];
  const btn=e.currentTarget,rows=notasLista();
  if(!rows.length){btn.textContent='Nenhum XML para exportar';setTimeout(()=>btn.textContent='Exportar XML (.zip)',2000);return}
  if(!window.JSZip){btn.textContent='Compactador indisponível';return}
  btn.textContent='Preparando…';const z=new JSZip();for(const n of rows){const x=await xmlDe(n);if(x)z.file((n.tipo==='entrada'?'entrada':'saida')+'/NFe'+n.chave+'.xml',x)}btn.textContent='Exportar XML (.zip)';
  const blob=await z.generateAsync({type:'blob'});
  baixar('notas_'+(notaFiltro||'todas')+'_xml.zip',blob,btn);
});
$('#expCsv').addEventListener('click',e=>{ULT_EXPORT=['notas'];
  const L=[['Tipo','Chave de Acesso','Número NF','Data Emissão','Emitente','Destinatário','Código','Descrição','Unid.','Qtd','Valor Unit.','Valor Total','CFOP'].join(';')];
  const n2=x=>String(x).replace('.',',');const cl=s=>String(s||'').replace(/;/g,',');
  notasLista().forEach(n=>n.itens.forEach(i=>L.push([n.tipo==='entrada'?'Entrada':'Saída',n.chave,n.num,(n.data||'').split('-').reverse().join('/'),cl(n.emit),cl(n.dest),cl(i[0]),cl(i[1]),cl(i[2]),n2(i[3]),n2(i[4]),n2(i[5]),i[6]].join(';'))));
  baixar('notas_'+(notaFiltro||'todas')+'_itens.csv','﻿'+L.join('\n'),e.currentTarget);
});
applyNotas();

/* ---------- VENDAS e ESTOQUE STRALOG (importação de planilhas) ---------- */
let vendasLotes={};let estoqueAtual=null;let vendaCanal='',estFiltro='',SERIE='';
const LSV='ciab-vendas-v1',LSE='ciab-estoque-v1';
try{const r=localStorage.getItem(LSV);if(r)vendasLotes=JSON.parse(r)||{}}catch(e){}
try{const r=localStorage.getItem(LSE);if(r)estoqueAtual=JSON.parse(r)}catch(e){}
function lsVE(){try{localStorage.setItem(LSV,JSON.stringify(vendasLotes))}catch(e){}try{localStorage.setItem(LSE,JSON.stringify(estoqueAtual))}catch(e){}}
/* ---------- ESTOQUE POR LOCAL (Stralog, Galpão Pedro Voss e outros) ---------- */
let EMPENHO=null;
let LOCAIS=[{id:'stralog',nome:'Stralog'},{id:'pedrovoss',nome:'Galpão Pedro Voss'}];let estLocais={};
const LSE2='ciab-estoque-v2';const locDoc=id=>id==='stralog'?'atual':id;const locNome=id=>(LOCAIS.find(l=>l.id===id)||{nome:id}).nome;
try{const r=localStorage.getItem(LSE2);if(r){const o=JSON.parse(r)||{};estLocais=o.locais||{};if(o.lista&&o.lista.length)LOCAIS=o.lista}else if(estoqueAtual&&estoqueAtual.itens)estLocais={stralog:estoqueAtual}}catch(e){}
function combinarEstoque(){const ag={};let data='';const arqs=[];
  LOCAIS.forEach(L=>{const e=estLocais[L.id];if(!e||!e.itens)return;if((e.data||'')>data)data=e.data||'';arqs.push(L.nome+': '+(e.arquivo||'lançamento manual'));
    e.itens.forEach(i=>{const a=ag[i.cod]||(ag[i.cod]={cod:i.cod,desc:'',qtd:0,loc:{},lotes:[]});a.qtd+=+i.qtd||0;a.loc[L.id]=(a.loc[L.id]||0)+(+i.qtd||0);if(!a.desc&&i.desc)a.desc=i.desc;(i.lotes||[]).forEach(l=>{if(a.lotes.length<20)a.lotes.push(l)})})});
  estoqueAtual=arqs.length?{arquivo:arqs.join(' · '),data:data||hojeISO(),itens:Object.values(ag)}:null;EMPENHO=null;try{applyNotas()}catch(x){}}
function hojeISO(){return new Date().toISOString().slice(0,10)}
function lsEst(){try{localStorage.setItem(LSE2,JSON.stringify({lista:LOCAIS,locais:estLocais}))}catch(e){}}
function salvarLocal(id){combinarEstoque();lsEst();renderAll();if(!db)return;setSave('','Salvando estoque…');
  const d=estLocais[id];const ref=db.doc('estoque/'+locDoc(id));(d?ref.set(d):ref.delete()).then(()=>setSave('ok','Estoque salvo')).catch(()=>setSave('warn','Estoque ficou só neste navegador'))}
function salvarLocais(){lsEst();if(db)db.doc('estoque/_locais').set({lista:LOCAIS}).catch(()=>{})}
function selLocais(){['#estLocal','#estAjLoc'].forEach(s=>{const el=$(s);if(!el)return;const v=el.value;el.innerHTML=LOCAIS.map(l=>'<option value="'+esc(l.id)+'">'+esc(l.nome)+'</option>').join('');if(LOCAIS.some(l=>l.id===v))el.value=v})}
combinarEstoque();
const normK=s=>String(s==null?'':s).trim().toUpperCase();
function num(v){if(typeof v==='number')return v;let s=String(v==null?'':v).trim().replace(/[R$\s]/g,'');if(!s)return 0;if(/,\d{1,4}$/.test(s))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
function dataISO(v){if(typeof v==='number'&&v>20000&&v<80000){const d=new Date(Math.round((v-25569)*864e5));return d.toISOString().slice(0,10)}const s=String(v||'').trim();let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(m){const y=m[3].length===2?'20'+m[3]:m[3];return y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0')}m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[0]:''}
async function lerPlanilha(file){
  if(!window.XLSX)throw new Error('O leitor de planilhas não carregou. Recarregue a página.');
  const buf=await file.arrayBuffer();let wb;
  if(/\.(csv|txt)$/i.test(file.name)){let txt=new TextDecoder('utf-8').decode(buf);if(txt.includes('\uFFFD'))txt=new TextDecoder('windows-1252').decode(buf);wb=XLSX.read(txt.replace(/^\uFEFF/,''),{type:'string',raw:true,FS:txt.split('\n')[0].includes(';')?';':','})}
  else wb=XLSX.read(buf,{type:'array',cellDates:false});
  const ws=wb.Sheets[wb.SheetNames[0]];return XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
}
function acharColunas(rows,spec){
  for(let r=0;r<Math.min(rows.length,25);r++){
    const h=rows[r].map(x=>String(x).trim().toLowerCase());const map={};
    Object.entries(spec).forEach(([k,res])=>{for(const re of res){const i=h.findIndex((c,ix)=>c&&re.test(c)&&!Object.values(map).includes(ix));if(i>=0){map[k]=i;break}}});
    if(map.cod!=null&&map.qtd!=null)return{row:r,map,head:rows[r]};
  }
  return null;
}
const SPEC_EST={cod:[/^c[oó]d(igo)?(\s|\.|$)/,/^sku/,/c[oó]d.*produto/,/^refer/,/c[oó]digo/],desc:[/descri/,/^produto/,/^nome/],
  qtd:[/dispon/,/^saldo/,/estoque f[ií]sico/,/^estoque/,/qtd|quantidade/],lote:[/^lote/],val:[/validade|vencimento/]};
const SPEC_VEN={data:[/^data/,/emiss/],cod:[/^c[oó]d(igo)?(\s|\.|$)/,/^sku/,/c[oó]d.*produto|c[oó]d.*item/,/c[oó]digo/],desc:[/descri/,/^produto/,/^item/,/^nome/],
  qtd:[/^qtd|^quant/,/qtd|quantidade/],valor:[/valor total|total do item|total item|^total$/,/^valor/,/pre[cç]o total/],canal:[/canal|loja|marketplace|integra|origem/],pedido:[/pedido|^n[uú]mero/],serie:[/^s[eé]rie/]};
async function importEstoque(file){
  const msg=$('#estMsg');const loc=$('#estLocal').value||'stralog';msg.textContent='Lendo '+file.name+' para '+locNome(loc)+'…';
  try{
    const rows=await lerPlanilha(file);const h=acharColunas(rows,SPEC_EST);
    if(!h){msg.textContent='Não achei as colunas de código e quantidade. Colunas encontradas: '+(rows[0]||[]).filter(Boolean).join(', ');return}
    const ag={};
    rows.slice(h.row+1).forEach(r=>{const c=normK(r[h.map.cod]);if(!c)return;const a=ag[c]||(ag[c]={cod:c,desc:'',qtd:0,lotes:[]});a.qtd+=num(r[h.map.qtd]);if(h.map.desc!=null&&!a.desc)a.desc=String(r[h.map.desc]).trim();
      if(h.map.lote!=null&&r[h.map.lote]!=='')a.lotes.push([String(r[h.map.lote]),num(r[h.map.qtd]),h.map.val!=null?dataISO(r[h.map.val]):''])});
    estLocais[loc]={arquivo:file.name,data:hojeISO(),itens:Object.values(ag).map(a=>({cod:a.cod,desc:a.desc.slice(0,120),qtd:a.qtd,lotes:a.lotes.slice(0,20)}))};
    salvarLocal(loc);
    msg.textContent=locNome(loc)+': '+estLocais[loc].itens.length+' produtos lidos de '+file.name+' (coluna de quantidade: "'+h.head[h.map.qtd]+'"). Os outros locais continuam como estavam.';
  }catch(e){msg.textContent='Não consegui ler o arquivo: '+(e.message||e)}
}
async function importVendas(file){
  const msg=$('#venMsg');msg.textContent='Lendo '+file.name+'…';
  try{
    const rows=await lerPlanilha(file);const h=acharColunas(rows,SPEC_VEN);
    if(!h){msg.textContent='Não achei as colunas de código e quantidade. Colunas encontradas: '+(rows[0]||[]).filter(Boolean).join(', ');return}
    const canalArq=file.name.replace(/\.[^.]+$/,'');const empArq=$('#venEmpArq').value||'',serieArq=($('#venSerieArq')&&$('#venSerieArq').value)||'';
    const linhas=[];rows.slice(h.row+1).forEach(r=>{const c=normK(r[h.map.cod]);const q=num(r[h.map.qtd]);if(!c||!q)return;
      linhas.push([h.map.data!=null?dataISO(r[h.map.data]):'',c,h.map.desc!=null?String(r[h.map.desc]).trim().slice(0,90):'',q,h.map.valor!=null?num(r[h.map.valor]):0,h.map.canal!=null?String(r[h.map.canal]).trim().slice(0,40):canalArq,empArq,h.map.serie!=null?String(r[h.map.serie]).trim().replace(/^0+(?=\d)/,'').slice(0,6):serieArq])});
    if(!linhas.length){msg.textContent='Nenhuma linha de venda com código e quantidade.';return}
    const id='L'+Date.now().toString(36);const partes=[];for(let i=0;i<linhas.length;i+=1500)partes.push(linhas.slice(i,i+1500));
    vendasLotes[id]={arquivo:file.name,importado:new Date().toISOString().slice(0,10),partes:partes.length,linhas,empresa:empArq,serie:serieArq};
    lsVE();
    if(db){setSave('','Salvando vendas…');(async()=>{try{for(let i=0;i<partes.length;i++)await db.collection('vendas').doc(id+'-'+i).set({lote:id,arquivo:file.name,importado:vendasLotes[id].importado,parte:i,partes:partes.length,linhas:partes[i],empresa:empArq,serie:serieArq});setSave('ok','Vendas salvas')}catch(e){setSave('warn','Vendas ficaram só neste navegador')}})()}
    msg.textContent=linhas.length+' linhas de venda lidas de '+file.name+'.';
    renderAll();
  }catch(e){msg.textContent='Não consegui ler o arquivo: '+(e.message||e)}
}
function vendasLinhas(){
  const L=[];Object.values(vendasLotes).forEach(l=>l.linhas.forEach(x=>{const y=x.slice(0,8);if(y.length<7)y.push(l.empresa||'');if(y.length<8)y.push(l.serie||'');L.push(y)}));
  Object.values(notas).forEach(n=>{if(n.tipo!=='saida'||n.cancelada)return;if(/remessa|retorno|transfer|devolu|armazen|dep[oó]sito/i.test(n.natOp))return;n.itens.forEach(i=>L.push([n.data,normK(i[0]),i[1],i[3],i[5],'NF '+short(n.dest),empNota(n).doc,String(n.serie||'')]))});
  return L;
}
function vendasPorCod(){const V={};vendasLinhas().forEach(([d,c,ds,q,v,cn])=>{const a=V[c]||(V[c]={q:0,v:0,mes:{},desc:ds,canais:{}});a.q+=q;a.v+=v;const m=(d||'').slice(0,7);if(m)a.mes[m]=(a.mes[m]||0)+q;a.canais[cn]=(a.canais[cn]||0)+q});return V}
function mediaMensal(a){const ms=Object.keys(a.mes).sort();if(!ms.length)return 0;const ult=ms.slice(-3);return ult.reduce((s,m)=>s+a.mes[m],0)/ult.length}
function projPorCod(){const P={};allProjects().forEach(p=>{if(p.codigo)P[normK(p.codigo)]=p});return P}
function estPorCod(){const E={};(estoqueAtual&&estoqueAtual.itens||[]).forEach(i=>{E[i.cod]=i});return E}
function renderVendas(){
  empChips('#venEmp');{const sel=$('#venEmpArq');const v=sel.value;sel.innerHTML='<option value="">Grupo / não informada</option>'+empresasGrupo().map(x=>'<option value="'+x.doc+'">'+esc(x.nome)+'</option>').join('');sel.value=[...sel.options].some(o=>o.value===v)?v:(EMP||'')}
  {const sel=$('#venSerieArq');if(sel){const v=sel.value;const ss=[...new Set(['1','2'].concat(vendasLinhas().map(x=>x[7]).filter(Boolean)))].sort();sel.innerHTML='<option value="">Não informada</option>'+ss.map(x=>'<option value="'+esc(x)+'">Série '+esc(x)+'</option>').join('');sel.value=v}}
  const LG=vendasLinhas();const LE=LG.filter(x=>!EMP||x[6]===EMP);const SS=[...new Set(LE.map(x=>x[7]||''))].sort();if(SERIE&&!SS.includes(SERIE))SERIE='';
  $('#venSerie').innerHTML=SS.length>1||SS[0]?'<button class="chip" data-s="" aria-pressed="'+(SERIE==='')+'">Todas as séries</button>'+SS.map(x=>'<button class="chip" data-s="'+esc(x)+'" aria-pressed="'+(SERIE===x)+'">'+(x?'Série '+esc(x):'Sem série')+'</button>').join(''):'';
  const L=LE.filter(x=>!SERIE||(x[7]||'')===SERIE);const canais={};L.forEach(x=>{canais[x[5]]=(canais[x[5]]||0)+x[3]});
  {const G={};LE.forEach(x=>{const k=(x[6]||'')+'|'+(x[7]||'');const g=G[k]||(G[k]={q:0,v:0});g.q+=x[3];g.v+=x[4]});const ks=Object.keys(G).sort((a,b)=>empNome(a.split('|')[0]).localeCompare(empNome(b.split('|')[0]))||a.localeCompare(b));const tq=ks.reduce((t,k)=>t+G[k].q,0),tv=ks.reduce((t,k)=>t+G[k].v,0);
   $('#venEmpTbl').innerHTML=!ks.length||(EMP&&ks.length<2)?'':'<h3 style="margin-bottom:8px">Por empresa e série</h3><div class="tbl-wrap"><table><thead><tr><th>Empresa</th><th>Série</th><th class="n">Unidades</th><th class="n">Faturamento</th><th class="n">% '+(EMP?'da empresa':'do grupo')+'</th></tr></thead><tbody>'+ks.map(k=>{const[e,se]=k.split('|');return '<tr class="empLinha" data-emp="'+e+'" data-serie="'+esc(se)+'" style="cursor:pointer'+(SERIE&&SERIE===se?';background:var(--sunk)':'')+'"><td>'+esc(empNome(e))+(e?'':' <span class="note">(planilhas sem empresa)</span>')+'</td><td>'+(se?'Série '+esc(se):'<span class="note">não informada</span>')+'</td><td class="n">'+fmtI.format(G[k].q)+'</td><td class="n">'+fmtR0.format(G[k].v)+'</td><td class="n">'+(tv?(G[k].v/tv*100).toFixed(1).replace('.',',')+'%':'—')+'</td></tr>'}).join('')+'</tbody><tfoot><tr><td>'+(EMP?esc(empNome(EMP)):'Grupo econômico')+'</td><td></td><td class="n">'+fmtI.format(tq)+'</td><td class="n">'+fmtR0.format(tv)+'</td><td class="n">100%</td></tr></tfoot></table></div>';}
  $('#venChips').innerHTML='<button class="chip" data-c="" aria-pressed="'+(vendaCanal==='')+'">Todos os canais</button>'+Object.entries(canais).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([c])=>'<button class="chip" data-c="'+esc(c)+'" aria-pressed="'+(vendaCanal===c)+'">'+esc(c)+'</button>').join('');
  const F=L.filter(x=>!vendaCanal||x[5]===vendaCanal);
  const q=F.reduce((s,x)=>s+x[3],0),v=F.reduce((s,x)=>s+x[4],0),skus=new Set(F.map(x=>x[1])).size;
  $('#venResumo').innerHTML='<div class="box"><div class="eyebrow">Unidades vendidas</div><div class="v num">'+fmtI.format(q)+'</div></div><div class="box hl"><div class="eyebrow">Faturamento</div><div class="v num">'+fmtR0.format(v)+'</div></div><div class="box"><div class="eyebrow">Produtos vendidos</div><div class="v num">'+fmtI.format(skus)+'</div></div><div class="box"><div class="eyebrow">Arquivos importados</div><div class="v num">'+Object.keys(vendasLotes).length+'</div><div class="note">+ NFs de saída da aba Notas XML</div></div>';
  // por mês
  const mes={};F.forEach(x=>{const m=(x[0]||'').slice(0,7);if(m)mes[m]=(mes[m]||0)+x[4]});
  const ent=Object.entries(mes).sort().slice(-12);
  if(ent.length){const W=Math.max(480,ent.length*56),H=200,pl=60,pb=26,pt=10,mx=Math.max(...ent.map(x=>x[1]))||1;const bw=(W-pl-8)/ent.length;const mn=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    let s='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Faturamento por mês">';for(let i=0;i<=4;i++){const y=H-pb-(H-pb-pt)*i/4;s+='<line x1="'+pl+'" x2="'+(W-4)+'" y1="'+y+'" y2="'+y+'" stroke="var(--line)"/><text x="'+(pl-6)+'" y="'+(y+3)+'" text-anchor="end">'+fmtR0.format(mx*i/4).replace('R$','').trim()+'</text>'}
    ent.forEach(([k,val],i)=>{const h=(H-pb-pt)*val/mx,x=pl+i*bw+bw*.18;const[yy,mm]=k.split('-');s+='<rect x="'+x.toFixed(1)+'" y="'+(H-pb-h).toFixed(1)+'" width="'+(bw*.64).toFixed(1)+'" height="'+h.toFixed(1)+'" rx="2" fill="var(--accent)"><title>'+mn[+mm-1]+'/'+yy+': '+fmtR0.format(val)+'</title></rect><text x="'+(x+bw*.32).toFixed(1)+'" y="'+(H-pb+14)+'" text-anchor="middle">'+mn[+mm-1]+'/'+yy.slice(2)+'</text>'});
    $('#venChart').innerHTML=s+'</svg>'}else $('#venChart').innerHTML='<p class="note">Sem datas nas vendas importadas.</p>';
  // por produto
  const V={};F.forEach(([d,c,ds,qq,vv])=>{const a=V[c]||(V[c]={q:0,v:0,desc:ds});a.q+=qq;a.v+=vv;if(!a.desc)a.desc=ds});
  const P=projPorCod(),E=estPorCod(),s2=$('#venSearch').value.trim().toLowerCase();
  const rows=Object.entries(V).filter(([c,a])=>!s2||(c+' '+a.desc).toLowerCase().includes(s2)).sort((a,b)=>b[1].v-a[1].v);
  if(!L.length){$('#venTbl').innerHTML='<tbody><tr><td class="muted" style="padding:18px">Nenhuma venda ainda. Importe o relatório de pedidos do Bling ou dos marketplaces (Excel ou CSV) na área acima, ou importe XMLs de saída na aba Notas XML.</td></tr></tbody>';return}
  $('#venTbl').innerHTML='<thead><tr><th>Código</th><th>Produto</th><th>Coleção</th><th class="n">Vendido</th><th class="n">Faturamento</th><th class="n">Preço médio</th><th class="n">Recebido</th><th class="n">% vendido</th><th class="n">Estoque Stralog</th></tr></thead><tbody>'+rows.slice(0,400).map(([c,a])=>{const p=P[c],e=E[c];const pv=p&&p.rec?a.q/p.rec*100:null;
    return '<tr><td class="mono">'+esc(c)+'</td><td>'+esc(p?p.sku:a.desc)+'</td><td>'+esc(p?p.colecao:'—')+'</td><td class="n">'+fmtI.format(a.q)+'</td><td class="n">'+fmtR.format(a.v)+'</td><td class="n">'+(a.q?fmtR.format(a.v/a.q):'—')+'</td><td class="n">'+(p?fmtI.format(p.rec||0):'—')+'</td><td class="n">'+(pv==null?'—':pv.toFixed(0)+'%')+'</td><td class="n">'+(e?fmtI.format(e.qtd):'—')+'</td></tr>'}).join('')+'</tbody>';
}
function renderEstoque(){
  selLocais();const E=estoqueAtual;const V=vendasPorCod(),P=projPorCod();const EP=calcEmpenho().porCod;
  $('#estLocInfo').innerHTML=LOCAIS.map(l=>{const e=estLocais[l.id];return '<div class="box"><div class="eyebrow">'+esc(l.nome)+'</div><div class="v num">'+(e?fmtI.format(e.itens.reduce((s,i)=>s+Math.max(0,+i.qtd||0),0))+' un.':'—')+'</div><div class="note">'+(e?esc(e.arquivo||'lançamento manual')+' · '+dBR(e.data):'ainda não alimentado')+'</div></div>'}).join('');
  if(!E&&!Object.keys(EP).length){$('#estInfo').textContent='';$('#estResumo').innerHTML='';$('#estTbl').innerHTML='<tbody><tr><td class="muted" style="padding:18px">Escolha o local e importe o relatório de estoque (Stralog, Galpão Pedro Voss ou o de estoque por depósito do Bling) em Excel ou CSV. O app procura sozinho as colunas de código e saldo. Para o galpão, use <b>Baixar modelo</b>, preencha as quantidades e importe.</td></tr></tbody>';return}
  $('#estInfo').textContent=E?'Atualizado em '+dBR(E.data):'';
  const itens=(E&&E.itens||[]).slice();const tem=new Set(itens.map(i=>i.cod));Object.keys(EP).forEach(c=>{if(!tem.has(c))itens.push({cod:c,desc:EP[c].desc,qtd:0,loc:{},lotes:[]})});
  const rows=itens.map(i=>{const v=V[i.cod],m=v?mediaMensal(v):0,p=P[i.cod],e=EP[i.cod];const emp=e?e.empPed+e.empProp:0,disp=Math.max(0,i.qtd)-emp,falta=e?e.falta:0,cob=m?Math.max(0,disp)/m:null;
    let st=['neu','Sem venda'];if(falta)st=['bad','Falta p/ pedidos'];else if(i.qtd<=0)st=['bad','Zerado'];else if(cob!=null&&cob<1)st=['bad','Ruptura < 1 mês'];else if(cob!=null&&cob<2)st=['warn','Atenção < 2 meses'];else if(cob!=null&&cob>6)st=['warn','Parado > 6 meses'];else if(cob!=null)st=['ok','Ok'];else if(emp)st=['ok','Empenhado'];
    return{i,m,cob,p,st,emp,disp,falta}});
  const tot=rows.reduce((s,r)=>s+Math.max(0,r.i.qtd),0),te=rows.reduce((s,r)=>s+r.emp,0),tf=rows.reduce((s,r)=>s+r.falta,0),rup=rows.filter(r=>r.st[0]==='bad').length;
  $('#estResumo').innerHTML='<div class="box hl"><div class="eyebrow">Estoque total</div><div class="v num">'+fmtI.format(tot)+'</div><div class="note">todos os locais</div></div><div class="box"><div class="eyebrow">Empenhado</div><div class="v num">'+fmtI.format(te)+'</div><div class="note">pedidos e propostas em aberto</div></div><div class="box"><div class="eyebrow">Disponível</div><div class="v num">'+fmtI.format(Math.max(0,tot-te))+'</div><div class="note">livre para vender</div></div><div class="box"><div class="eyebrow">Falta para pedidos</div><div class="v num">'+fmtI.format(tf)+'</div></div><div class="box"><div class="eyebrow">Ruptura, zerados e faltas</div><div class="v num">'+rup+'</div><div class="note">venda média dos últimos 3 meses</div></div>';
  document.querySelectorAll('#estChips .chip').forEach(c=>c.setAttribute('aria-pressed',c.dataset.f===estFiltro));
  const s2=$('#estSearch').value.trim().toLowerCase();
  const F=rows.filter(r=>(!s2||(r.i.cod+' '+r.i.desc+' '+(r.p?r.p.colecao+' '+r.p.sku:'')).toLowerCase().includes(s2))&&(!estFiltro||(estFiltro==='proj'?r.p:estFiltro==='rup'?r.st[0]==='bad':estFiltro==='emp'?r.emp||r.falta:estFiltro.startsWith('loc:')?(r.i.loc&&r.i.loc[estFiltro.slice(4)]):r.st[1].startsWith('Parado'))))
    .sort((a,b)=>b.falta-a.falta||(a.cob==null)-(b.cob==null)||(a.cob||0)-(b.cob||0));
  $('#estTbl').innerHTML='<thead><tr><th>Código</th><th>Produto</th><th>Coleção</th>'+LOCAIS.map(l=>'<th class="n">'+esc(l.nome)+'</th>').join('')+'<th class="n">Total</th><th class="n">Empenhado</th><th class="n">Disponível</th><th class="n">Venda/mês</th><th class="n">Cobertura</th><th>Situação</th><th>Lotes</th></tr></thead><tbody>'
    +F.slice(0,700).map(r=>'<tr><td class="mono">'+esc(r.i.cod)+'</td><td>'+esc(r.p?r.p.sku:r.i.desc)+'</td><td>'+esc(r.p?r.p.colecao:'—')+'</td>'+LOCAIS.map(l=>'<td class="n">'+(r.i.loc&&r.i.loc[l.id]!=null?fmtI.format(r.i.loc[l.id]):'—')+'</td>').join('')+'<td class="n"><b>'+fmtI.format(r.i.qtd)+'</b></td><td class="n">'+(r.emp?fmtI.format(r.emp):'—')+'</td><td class="n">'+fmtI.format(r.disp)+(r.falta?' <span class="pill bad">falta '+fmtI.format(r.falta)+'</span>':'')+'</td><td class="n">'+(r.m?fmtI.format(Math.round(r.m)):'—')+'</td><td class="n">'+(r.cob==null?'—':r.cob.toFixed(1).replace('.',',')+' mês')+'</td><td><span class="pill '+r.st[0]+'">'+r.st[1]+'</span></td><td class="note">'+(r.i.lotes&&r.i.lotes.length?esc(r.i.lotes.slice(0,3).map(l=>l[0]+(l[2]?' (val. '+dBR(l[2])+')':'')).join(', ')+(r.i.lotes.length>3?'…':'')):'')+'</td></tr>').join('')+'</tbody>';
  $('#estLocChips').innerHTML=LOCAIS.map(l=>'<button class="chip" data-f="loc:'+esc(l.id)+'" aria-pressed="'+(estFiltro==='loc:'+l.id)+'">Só '+esc(l.nome)+'</button>').join('');
}
function ligaEstoqueLocais(){
  $('#estLocChips').addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;estFiltro=estFiltro===c.dataset.f?'':c.dataset.f;renderEstoque()});
  $('#estAjForm').addEventListener('submit',e=>{e.preventDefault();const m=$('#estAjMsg');if(document.body.classList.contains('ro')){m.textContent='Seu usuário é somente leitura.';return}
    const loc=$('#estAjLoc').value,c=normK($('#estAjCod').value),q=num($('#estAjQtd').value);if(!c){m.textContent='Informe o código.';return}
    const d=estLocais[loc]||(estLocais[loc]={arquivo:'lançamento manual',data:hojeISO(),itens:[]});let it=d.itens.find(i=>i.cod===c);
    if(!it){const k=codigosConhecidos();it={cod:c,desc:String(k[c]||'').slice(0,120),qtd:0,lotes:[]};d.itens.push(it)}it.qtd=q;d.data=hojeISO();
    if(!/manual/.test(d.arquivo||''))d.arquivo=(d.arquivo||'')+' + ajuste manual';salvarLocal(loc);m.textContent=locNome(loc)+': '+c+' agora com '+fmtI.format(q)+' un.';$('#estAjCod').value='';$('#estAjQtd').value='';$('#estAjCod').focus()});
  $('#estAjCod').addEventListener('focus',()=>{$('#estCods').innerHTML=Object.entries(codigosConhecidos()).slice(0,3000).map(([c,d])=>'<option value="'+esc(c)+'">'+esc(d)+'</option>').join('')},{once:false});
  $('#estModelo').addEventListener('click',async e=>{const b=e.currentTarget;if(!window.XLSX){b.textContent='Leitor de planilhas não carregou';return}const loc=$('#estLocal').value;const atual={};((estLocais[loc]||{}).itens||[]).forEach(i=>atual[i.cod]=i);
    const L=[['Código','Descrição','Quantidade','Lote','Validade']];const vist=new Set();allProjects().forEach(p=>{const c=normK(p.codigo);if(!c||vist.has(c))return;vist.add(c);L.push([c,p.colecao+' · '+p.sku,atual[c]?atual[c].qtd:'','',''])});Object.values(atual).forEach(i=>{if(!vist.has(i.cod))L.push([i.cod,i.desc,i.qtd,'',''])});
    const ws=XLSX.utils.aoa_to_sheet(L);ws['!cols']=[{wch:16},{wch:48},{wch:12},{wch:12},{wch:12}];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Estoque');
    await baixar('Estoque_'+locNome(loc).replace(/\W+/g,'_')+'_modelo.xlsx',new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),b)});
  $('#estNovoLoc').addEventListener('click',()=>{const w=$('#estNovoWrap');w.hidden=!w.hidden;if(!w.hidden)$('#estNovoNome').focus()});
  $('#estNovoOk').addEventListener('click',()=>{const n=$('#estNovoNome').value.trim();if(!n)return;let id=n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'').slice(0,24)||'local';if(id==='atual'||id==='_locais')id+='2';let k=id,j=1;while(LOCAIS.some(l=>l.id===k))k=id+(++j);
    LOCAIS.push({id:k,nome:n.slice(0,40)});salvarLocais();$('#estNovoNome').value='';$('#estNovoWrap').hidden=true;selLocais();$('#estLocal').value=k;renderEstoque()});
  $('#estZerar').addEventListener('click',e=>{const b=e.currentTarget,loc=$('#estLocal').value;if(!estLocais[loc]){$('#estMsg').textContent=locNome(loc)+' já está vazio.';return}
    if(!b.dataset.ok){b.dataset.ok='1';b.textContent='Confirmar: apagar estoque de '+locNome(loc);setTimeout(()=>{delete b.dataset.ok;b.textContent='Apagar estoque deste local'},3000);return}
    delete b.dataset.ok;b.textContent='Apagar estoque deste local';delete estLocais[loc];salvarLocal(loc);$('#estMsg').textContent='Estoque de '+locNome(loc)+' apagado.'});
}
/* ---------- COMERCIAL: pedidos de venda e propostas, com empenho no estoque ---------- */
let pedidos={};let comTipo='',comSit='abertos',pedEdit=null;const LSP='ciab-pedidos-v1';
try{const r=localStorage.getItem(LSP);if(r)pedidos=JSON.parse(r)||{}}catch(e){}
function lsPed(){try{localStorage.setItem(LSP,JSON.stringify(pedidos))}catch(e){}}
const TIPO_NOME={pedido:'Pedido de venda',proposta:'Proposta'};const SIT_NOME={aberto:'Em aberto',atendido:'Atendido',cancelado:'Cancelado'};
function aReceber(c){const p=projPorCod()[c];return p?Math.max(0,total(p)-(p.rec||0)):0}
function calcEmpenho(){if(EMPENHO)return EMPENHO;
  const E=estPorCod();const rest={};Object.values(E).forEach(i=>{rest[i.cod]=Math.max(0,i.qtd)});
  const ab=Object.entries(pedidos).filter(([,p])=>p.status==='aberto').sort((a,b)=>(a[1].tipo==='pedido'?0:1)-(b[1].tipo==='pedido'?0:1)||String(a[1].data||'9999').localeCompare(String(b[1].data||'9999'))||String(a[1].prev||'9999').localeCompare(String(b[1].prev||'9999'))||String(a[1].numero).localeCompare(String(b[1].numero),undefined,{numeric:true}));
  const porCod={},res={};
  ab.forEach(([id,p],ix)=>{let tot=0,at=0,val=0;const it=(p.itens||[]).map(([c,d,q,v])=>{c=normK(c);q=+q||0;v=+v||0;const r=rest[c]||0,a=Math.min(q,r);rest[c]=r-a;tot+=q;at+=a;val+=q*v;
      const pc=porCod[c]||(porCod[c]={ped:0,prop:0,empPed:0,empProp:0,falta:0,desc:d||''});if(p.tipo==='pedido'){pc.ped+=q;pc.empPed+=a}else{pc.prop+=q;pc.empProp+=a}pc.falta+=q-a;if(!pc.desc)pc.desc=d||'';return{c,d,q,v,a,f:q-a}});
    res[id]={it,tot,at,val,ord:ix+1,st:!tot?['neu','Sem itens']:at>=tot?['ok','Atende']:at>0?['warn','Parcial']:['bad','Sem estoque']}});
  Object.entries(pedidos).forEach(([id,p])=>{if(res[id])return;let tot=0,val=0;const it=(p.itens||[]).map(([c,d,q,v])=>{q=+q||0;v=+v||0;tot+=q;val+=q*v;return{c:normK(c),d,q,v,a:0,f:0}});res[id]={it,tot,at:0,val,ord:null,st:p.status==='atendido'?['ok','Atendido']:['neu','Cancelado']}});
  return EMPENHO={res,porCod,rest}}
function empenhoCod(c){const e=calcEmpenho().porCod[c];return e?e.empPed+e.empProp:0}
const SPEC_PED={prev:[/previs|prevista|data de entrega|prazo/],data:[/^data( do pedido| da proposta| de emiss[aã]o| emiss[aã]o)?$/,/^data/,/emiss/],numero:[/^n[uú]mero( do)?( pedido| da proposta| proposta)?$/,/^n[ºo°.]/,/pedido|proposta/,/^n[uú]mero/],
  cod:[/^c[oó]d(igo)?(\s|\.|$)/,/^sku/,/c[oó]d.*produto|c[oó]d.*item/,/c[oó]digo/],desc:[/descri/,/^produto/,/^item/],qtd:[/^qtd|^quant/,/qtd|quantidade/],
  valor:[/valor unit|pre[cç]o unit|unit[aá]rio/,/^valor|pre[cç]o/],cliente:[/cliente|contato|raz[aã]o|destinat|comprador/,/^nome/],sit:[/situa|status/],obs:[/observa/],vend:[/vendedor/]};
function sitImport(s,tipo){s=String(s||'').toLowerCase();if(/cancel|recusad|perdid|n[aã]o aprovad|reprovad/.test(s))return 'cancelado';if(/atendid|faturad|entregue|conclu|finaliz|enviad|despachad/.test(s))return 'atendido';return 'aberto'}
async function importPedidos(file){const msg=$('#comMsg');msg.textContent='Lendo '+file.name+'…';
  try{const rows=await lerPlanilha(file);const h=acharColunas(rows,SPEC_PED);
    if(!h){msg.textContent='Não achei as colunas de código e quantidade. Colunas encontradas: '+(rows[0]||[]).filter(Boolean).join(', ');return}
    const tipo=$('#comTipoArq').value||'pedido',emp=$('#comEmpArq').value||'';const M=h.map,col=k=>M[k]!=null;const vTot=col('valor')&&/total/i.test(String(h.head[M.valor]));
    const G={};let ult={numero:'',cliente:'',data:'',prev:'',sit:''};let semNum=0;
    rows.slice(h.row+1).forEach(r=>{const c=normK(r[M.cod]),q=num(r[M.qtd]);
      const n=col('numero')?String(r[M.numero]).trim():'';if(n){ult={numero:n,cliente:col('cliente')?String(r[M.cliente]).trim():'',data:col('data')?dataISO(r[M.data]):'',prev:col('prev')?dataISO(r[M.prev]):'',sit:col('sit')?String(r[M.sit]).trim():''}}
      if(!c||!q)return;const numero=n||ult.numero||('S'+(++semNum));
      const g=G[numero]||(G[numero]={numero,cliente:(col('cliente')&&String(r[M.cliente]).trim())||ult.cliente,data:(col('data')&&dataISO(r[M.data]))||ult.data,prev:(col('prev')&&dataISO(r[M.prev]))||ult.prev,sit:(col('sit')&&String(r[M.sit]).trim())||ult.sit,obs:col('obs')?String(r[M.obs]).trim().slice(0,300):'',itens:[]});
      let v=col('valor')?num(r[M.valor]):0;if(vTot&&q)v=v/q;g.itens.push([c,col('desc')?String(r[M.desc]).trim().slice(0,90):'',q,Math.round(v*10000)/10000])});
    const lista=Object.values(G);if(!lista.length){msg.textContent='Nenhuma linha com código e quantidade.';return}
    let nA=0,nC=0;const ids=[];
    lista.forEach(g=>{const id=(tipo==='pedido'?'P':'O')+'-'+(emp||'g')+'-'+String(g.numero).replace(/[^\w.-]+/g,'_').slice(0,40);const st=sitImport(g.sit,tipo);if(st==='aberto')nA++;else nC++;
      const ant=pedidos[id]||{};pedidos[id]={tipo,numero:g.numero,cliente:g.cliente.slice(0,90),emp,data:g.data,prev:g.prev||ant.prev||'',status:st,sitBling:g.sit.slice(0,40),itens:g.itens,obs:g.obs||ant.obs||'',origem:'planilha',arquivo:file.name,em:new Date().toISOString()};ids.push(id)});
    EMPENHO=null;lsPed();renderAll();
    msg.textContent=lista.length+' '+(tipo==='pedido'?'pedido(s)':'proposta(s)')+' lido(s) de '+file.name+': '+nA+' em aberto, '+nC+' atendido(s)/cancelado(s).'+(col('numero')?'':' Sem coluna de número: cada linha virou um documento.');
    if(db){setSave('','Salvando pedidos…');const docs=ids.map(id=>[id,pedidos[id]]);try{for(const[id,d]of docs)await db.collection('pedidos').doc(id).set(d);setSave('ok','Pedidos salvos')}catch(e){setSave('warn','Pedidos ficaram só neste navegador')}}
  }catch(e){msg.textContent='Não consegui ler o arquivo: '+(e.message||e)}}
function salvarPedido(id){EMPENHO=null;lsPed();renderAll();if(!db)return;setSave('','Salvando…');const ref=db.collection('pedidos').doc(id);(pedidos[id]?ref.set(pedidos[id]):ref.delete()).then(()=>setSave('ok','Salvo na nuvem')).catch(()=>setSave('warn','Ficou só neste navegador'))}
function selEmpresas(sel,vazio){const el=$(sel);if(!el)return;const v=el.value;el.innerHTML='<option value="">'+(vazio||'Grupo / não informada')+'</option>'+empresasGrupo().map(x=>'<option value="'+x.doc+'">'+esc(x.nome)+'</option>').join('');el.value=[...el.options].some(o=>o.value===v)?v:(EMP||'')}
function codigosConhecidos(){const m={};allProjects().forEach(p=>{if(p.codigo)m[normK(p.codigo)]=p.colecao+' · '+p.sku});(estoqueAtual&&estoqueAtual.itens||[]).forEach(i=>{if(!m[i.cod])m[i.cod]=i.desc||''});return m}
function renderComercial(){
  selEmpresas('#comEmpArq');empChips('#comEmp');
  const{res,porCod}=calcEmpenho();const P=projPorCod(),E=estPorCod();
  const todos=Object.entries(pedidos).filter(([,p])=>!EMP||p.emp===EMP);
  const ab=todos.filter(([,p])=>p.status==='aberto');const peds=ab.filter(([,p])=>p.tipo==='pedido'),props=ab.filter(([,p])=>p.tipo==='proposta');
  const soma=(L,f)=>L.reduce((s,[id])=>s+f(res[id]),0);const cnt=(L,k)=>L.filter(([id])=>res[id].st[1]===k).length;
  const faltaU=soma(peds,r=>r.tot-r.at);
  $('#comResumo').innerHTML='<div class="box hl"><div class="eyebrow">Pedidos em aberto</div><div class="v num">'+peds.length+'</div><div class="note">'+fmtR0.format(soma(peds,r=>r.val))+' · '+fmtI.format(soma(peds,r=>r.tot))+' un.</div></div>'
    +'<div class="box"><div class="eyebrow">Pedidos que atendem 100%</div><div class="v num">'+cnt(peds,'Atende')+'</div><div class="note">'+cnt(peds,'Parcial')+' parcial · '+cnt(peds,'Sem estoque')+' sem estoque</div></div>'
    +'<div class="box"><div class="eyebrow">Faltam para os pedidos</div><div class="v num">'+fmtI.format(faltaU)+' un.</div><div class="note">depois de empenhar o estoque</div></div>'
    +'<div class="box"><div class="eyebrow">Propostas em aberto</div><div class="v num">'+props.length+'</div><div class="note">'+fmtR0.format(soma(props,r=>r.val))+' · '+cnt(props,'Atende')+' atendem 100%</div></div>';
  document.querySelectorAll('#comChips .chip').forEach(c=>c.setAttribute('aria-pressed',c.dataset.t===comTipo));
  document.querySelectorAll('#comSit .chip').forEach(c=>c.setAttribute('aria-pressed',c.dataset.s===comSit));
  const s2=($('#comSearch').value||'').trim().toLowerCase();
  const F=todos.filter(([id,p])=>(!comTipo||p.tipo===comTipo)&&(comSit==='todos'||(comSit==='abertos'?p.status==='aberto':comSit==='fechados'?p.status!=='aberto':p.status==='aberto'&&res[id].st[0]===comSit))
    &&(!s2||(p.numero+' '+p.cliente+' '+(p.itens||[]).map(i=>i[0]+' '+i[1]).join(' ')).toLowerCase().includes(s2)))
    .sort((a,b)=>(res[a[0]].ord||1e9)-(res[b[0]].ord||1e9)||String(b[1].data).localeCompare(String(a[1].data)));
  if(!Object.keys(pedidos).length){$('#comTbl').innerHTML='<tbody><tr><td class="muted" style="padding:18px">Nenhum pedido ou proposta ainda. Arraste a planilha de pedidos de venda ou de propostas comerciais exportada do Bling, ou clique em <b>Novo pedido ou proposta</b>.</td></tr></tbody>'}
  else $('#comTbl').innerHTML='<thead><tr><th class="n">Fila</th><th>Tipo</th><th>Nº</th><th>Cliente</th><th>Empresa</th><th>Data</th><th>Previsão</th><th class="n">Unidades</th><th class="n">Valor</th><th>Atendimento</th><th class="n">Faltam</th></tr></thead><tbody>'
    +F.slice(0,500).map(([id,p])=>{const r=res[id];const pct=r.tot?Math.round(r.at/r.tot*100):0;
      return '<tr class="pedLinha" data-id="'+esc(id)+'" style="cursor:pointer"><td class="n">'+(r.ord||'—')+'</td><td>'+(p.tipo==='pedido'?'Pedido':'Proposta')+'</td><td class="mono">'+esc(p.numero)+'</td><td>'+esc(p.cliente||'—')+'</td><td>'+esc(p.emp?empNome(p.emp):'—')+'</td><td>'+dBR(p.data)+'</td><td>'+dBR(p.prev)+'</td><td class="n">'+fmtI.format(r.tot)+'</td><td class="n">'+fmtR0.format(r.val)+'</td><td><span class="pill '+r.st[0]+'">'+r.st[1]+(p.status==='aberto'&&r.st[1]==='Parcial'?' '+pct+'%':'')+'</span></td><td class="n">'+(p.status==='aberto'&&r.tot-r.at?fmtI.format(r.tot-r.at):'—')+'</td></tr>'}).join('')+'</tbody>';
  // empenho por produto
  const cods=new Set(Object.keys(porCod));const sp=($('#comProdSearch').value||'').trim().toLowerCase();
  const linhas=[...cods].map(c=>{const e=porCod[c],est=E[c]?E[c].qtd:0,p=P[c];return{c,e,est,p,desc:p?p.colecao+' · '+p.sku:(E[c]&&E[c].desc)||e.desc,livre:Math.max(0,est-e.empPed-e.empProp),rec:aReceber(c)}})
    .filter(x=>!sp||(x.c+' '+x.desc).toLowerCase().includes(sp)).sort((a,b)=>b.e.falta-a.e.falta||a.c.localeCompare(b.c));
  $('#comProdTbl').innerHTML=!linhas.length?'<tbody><tr><td class="muted" style="padding:14px">Sem pedidos ou propostas em aberto.</td></tr></tbody>':'<thead><tr><th>Código</th><th>Produto</th>'+LOCAIS.map(l=>'<th class="n">'+esc(l.nome)+'</th>').join('')+'<th class="n">Estoque total</th><th class="n">Pedidos</th><th class="n">Propostas</th><th class="n">Empenhado</th><th class="n">Livre</th><th class="n">Falta</th><th class="n">A receber</th></tr></thead><tbody>'
    +linhas.slice(0,500).map(x=>'<tr><td class="mono">'+esc(x.c)+'</td><td>'+esc(x.desc)+'</td>'+LOCAIS.map(l=>'<td class="n">'+(E[x.c]&&E[x.c].loc[l.id]?fmtI.format(E[x.c].loc[l.id]):'—')+'</td>').join('')+'<td class="n">'+fmtI.format(x.est)+'</td><td class="n">'+fmtI.format(x.e.ped)+'</td><td class="n">'+fmtI.format(x.e.prop)+'</td><td class="n">'+fmtI.format(x.e.empPed+x.e.empProp)+'</td><td class="n">'+fmtI.format(x.livre)+'</td><td class="n">'+(x.e.falta?'<span class="pill bad">'+fmtI.format(x.e.falta)+'</span>':'—')+'</td><td class="n">'+(x.rec?fmtI.format(x.rec):'—')+'</td></tr>').join('')+'</tbody>';
}
/* editor de pedido / proposta */
function linhaItem(i,info){i=i||['','',1,0];return '<tr><td><input type="text" class="pi-c mono" list="pedCods" value="'+esc(i[0])+'" style="width:120px"></td><td><input type="text" class="pi-d" value="'+esc(i[1])+'" style="width:100%"></td><td><input class="pi-q" type="number" min="0" step="1" value="'+(+i[2]||0)+'" style="width:84px"></td><td><input class="pi-v" type="number" min="0" step="0.01" value="'+(+i[3]||0)+'" style="width:90px"></td><td class="note pi-info">'+(info||'')+'</td><td><button type="button" class="btn ghost pi-x" title="Remover item" aria-label="Remover item">×</button></td></tr>'}
function abrirPedido(id,tipo){pedEdit=id||null;const p=id?pedidos[id]:{tipo:tipo||'pedido',numero:'',cliente:'',emp:EMP||'',data:hojeISO(),prev:'',status:'aberto',itens:[],obs:''};
  selEmpresas('#pdEmp');$('#pdTitulo').textContent=id?(TIPO_NOME[p.tipo]+' '+p.numero):'Novo pedido ou proposta';
  $('#pdTipo').value=p.tipo;$('#pdNum').value=p.numero||'';$('#pdCli').value=p.cliente||'';$('#pdEmp').value=p.emp||'';$('#pdData').value=p.data||'';$('#pdPrev').value=p.prev||'';$('#pdSit').value=p.status||'aberto';$('#pdObs').value=p.obs||'';
  const m=codigosConhecidos();$('#pedCods').innerHTML=Object.entries(m).slice(0,3000).map(([c,d])=>'<option value="'+esc(c)+'">'+esc(d)+'</option>').join('');
  const r=id&&calcEmpenho().res[id];
  $('#pdItens').innerHTML=(p.itens.length?p.itens:[null]).map((it,k)=>{const x=r&&r.it[k];const info=x&&p.status==='aberto'?(x.f?'empenhado '+fmtI.format(x.a)+' · <b style="color:var(--bad)">falta '+fmtI.format(x.f)+'</b>'+(aReceber(x.c)?' · a receber '+fmtI.format(aReceber(x.c)):''):'<span style="color:var(--ok)">empenhado '+fmtI.format(x.a)+'</span>'):'';return linhaItem(it,info)}).join('');
  $('#pdResumo').innerHTML=r?'<span class="pill '+r.st[0]+'">'+r.st[1]+'</span> '+(r.ord?'Posição '+r.ord+' na fila de empenho · ':'')+fmtI.format(r.at)+' de '+fmtI.format(r.tot)+' un. atendidas pelo estoque':'';
  $('#pdExcluir').hidden=!id;$('#pdConverter').hidden=!(id&&p.tipo==='proposta');$('#pdMsg').textContent='';
  if(window.__abrirModal)window.__abrirModal('pedModal');else $('#pedModal').hidden=false}
function fecharPedido(){$('#pedModal').hidden=true;pedEdit=null}
function lerFormPedido(){const itens=[...document.querySelectorAll('#pdItens tr')].map(tr=>[normK(tr.querySelector('.pi-c').value),tr.querySelector('.pi-d').value.trim().slice(0,90),+tr.querySelector('.pi-q').value||0,+tr.querySelector('.pi-v').value||0]).filter(i=>i[0]&&i[2]>0);
  return{tipo:$('#pdTipo').value,numero:$('#pdNum').value.trim(),cliente:$('#pdCli').value.trim().slice(0,90),emp:$('#pdEmp').value,data:$('#pdData').value,prev:$('#pdPrev').value,status:$('#pdSit').value,obs:$('#pdObs').value.trim().slice(0,500),itens}}
function ligaComercial(){
  ligaDrop('#comDrop','#comIn',importPedidos);
  $('#comNovo').addEventListener('click',()=>abrirPedido(null,comTipo||'pedido'));
  $('#comEmp').addEventListener('click',e=>{const c=e.target.closest('[data-emp]');if(c)setEmp(c.dataset.emp)});
  $('#comChips').addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;comTipo=c.dataset.t;renderComercial()});
  $('#comSit').addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;comSit=c.dataset.s;renderComercial()});
  $('#comSearch').addEventListener('input',renderComercial);$('#comProdSearch').addEventListener('input',renderComercial);
  $('#comTbl').addEventListener('click',e=>{const tr=e.target.closest('tr.pedLinha');if(tr)abrirPedido(tr.dataset.id)});
  $('#pdAdd').addEventListener('click',()=>{$('#pdItens').insertAdjacentHTML('beforeend',linhaItem());const l=$('#pdItens').lastElementChild.querySelector('.pi-c');if(l)l.focus()});
  $('#pdItens').addEventListener('click',e=>{const x=e.target.closest('.pi-x');if(x){x.closest('tr').remove();if(!$('#pdItens').children.length)$('#pdItens').insertAdjacentHTML('beforeend',linhaItem())}});
  $('#pdItens').addEventListener('change',e=>{if(!e.target.classList.contains('pi-c'))return;const tr=e.target.closest('tr');e.target.value=normK(e.target.value);const d=tr.querySelector('.pi-d');if(!d.value){const m=codigosConhecidos();d.value=m[e.target.value]||''}});
  $('#pdCancelar').addEventListener('click',fecharPedido);
  $('#pedModal').addEventListener('click',e=>{if(e.target.id==='pedModal')fecharPedido()});
  $('#pedForm').addEventListener('submit',e=>{e.preventDefault();if(document.body.classList.contains('ro')){$('#pdMsg').textContent='Seu usuário é somente leitura.';return}
    const f=lerFormPedido();if(!f.numero){$('#pdMsg').textContent='Informe o número do pedido ou da proposta.';return}if(!f.itens.length){$('#pdMsg').textContent='Inclua pelo menos um item com código e quantidade.';return}
    const ant=pedEdit?pedidos[pedEdit]:null;let id=pedEdit;
    if(!id||(ant&&ant.tipo!==f.tipo)){const base=(f.tipo==='pedido'?'P':'O')+'-'+(f.emp||'g')+'-'+f.numero.replace(/[^\w.-]+/g,'_').slice(0,40);id=base;let k=1;while(pedidos[id]&&id!==pedEdit)id=base+'-'+(++k)}
    if(pedEdit&&id!==pedEdit){delete pedidos[pedEdit];salvarPedido(pedEdit)}
    pedidos[id]=Object.assign({},ant||{},f,{origem:ant&&ant.origem||'manual',em:new Date().toISOString(),por:window.__NOME||''});salvarPedido(id);fecharPedido()});
  $('#pdExcluir').addEventListener('click',e=>{const b=e.currentTarget;if(!pedEdit)return;if(!b.dataset.ok){b.dataset.ok='1';b.textContent='Confirmar exclusão';setTimeout(()=>{delete b.dataset.ok;b.textContent='Excluir'},3000);return}
    delete b.dataset.ok;b.textContent='Excluir';const id=pedEdit;delete pedidos[id];salvarPedido(id);fecharPedido()});
  $('#pdConverter').addEventListener('click',()=>{if(!pedEdit)return;const p=pedidos[pedEdit];if(!p||p.tipo!=='proposta')return;const f=lerFormPedido();
    const id='P-'+(f.emp||'g')+'-'+(f.numero||p.numero).replace(/[^\w.-]+/g,'_').slice(0,40);pedidos[id]=Object.assign({},p,f,{tipo:'pedido',status:'aberto',deProposta:p.numero,em:new Date().toISOString()});
    pedidos[pedEdit]=Object.assign({},p,{status:'atendido',obs:((p.obs||'')+' Convertida no pedido '+(f.numero||p.numero)+'.').trim()});salvarPedido(pedEdit);salvarPedido(id);abrirPedido(id)});
}
function ligaDrop(zoneSel,inputSel,fn){const z=$(zoneSel);$(inputSel).addEventListener('change',e=>{[...e.target.files].forEach(fn);e.target.value=''});
  ['dragenter','dragover'].forEach(ev=>z.addEventListener(ev,e=>{e.preventDefault();z.classList.add('over')}));['dragleave','drop'].forEach(ev=>z.addEventListener(ev,e=>{e.preventDefault();z.classList.remove('over')}));
  z.addEventListener('drop',e=>{[...(e.dataTransfer?e.dataTransfer.files:[])].forEach(fn)})}
ligaDrop('#venDrop','#venIn',importVendas);ligaDrop('#estDrop','#estIn',importEstoque);ligaEstoqueLocais();ligaComercial();
$('#venEmp').addEventListener('click',e=>{const c=e.target.closest('[data-emp]');if(c)setEmp(c.dataset.emp)});
$('#venEmpTbl').addEventListener('click',e=>{const c=e.target.closest('tr[data-emp]');if(!c)return;SERIE=SERIE===c.dataset.serie&&EMP===c.dataset.emp?'':c.dataset.serie;if(c.dataset.emp&&c.dataset.emp!==EMP)setEmp(c.dataset.emp);else renderVendas()});
$('#venSerie').addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;SERIE=c.dataset.s;renderVendas()});
$('#venChips').addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;vendaCanal=c.dataset.c;renderVendas()});
$('#venSearch').addEventListener('input',renderVendas);
$('#estChips').addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;estFiltro=c.dataset.f;renderEstoque()});
$('#estSearch').addEventListener('input',renderEstoque);
$('#venLimpar').addEventListener('click',async e=>{const b=e.currentTarget;if(!b.dataset.ok){b.dataset.ok='1';b.textContent='Confirmar: apagar vendas importadas';setTimeout(()=>{delete b.dataset.ok;b.textContent='Apagar vendas importadas'},3000);return}
  const ids=Object.keys(vendasLotes);vendasLotes={};lsVE();renderAll();if(db){try{const s=await db.collection('vendas').get();for(const d of s.docs)await db.collection('vendas').doc(d.id).delete()}catch(err){}}b.textContent='Apagar vendas importadas';delete b.dataset.ok});


/* ---------- BLING: conexão e sincronização ---------- */
let BL={carregado:false,contas:[],ocupado:false,precos:null};
function pdPrecoBling(p,unit){const cod=normK(p.codigo);if(!cod||!window.CIA_FN)return '';const it=(BL.precos&&BL.precos.itens&&BL.precos.itens[cod])||{};const ro=document.body.classList.contains('ro');
  const linhas=[['we','We Premium'],['cr','Creative House']].map(([e,n])=>{const x=it[e];
    if(!x)return '<div class="row" style="gap:8px;align-items:center"><span style="min-width:120px">'+n+'</span><span class="note">'+(BL.precos?'sem fornecedor no Bling':'aguardando sincronização')+'</span></div>';
    return '<div class="row" style="gap:8px;align-items:center"><span style="min-width:120px">'+n+'</span><input type="number" step="0.01" min="0" value="'+(+x.v||0)+'" data-blpcin="'+e+'" style="width:110px" aria-label="Preço de compra '+n+'"'+(ro?' disabled':'')+'>'+(ro?'':'<button type="button" class="btn" data-blpc="'+e+'" data-cod="'+esc(cod)+'">Salvar no Bling</button>')+(unit&&x.v?'<span class="note">'+(x.v>unit?'+':'')+pdPct.format((x.v-unit)/unit)+' vs custo calculado</span>':'')+'</div>'}).join('');
  return '<div><h3 style="margin-bottom:6px">Preço de compra no Bling</h3><div style="display:flex;flex-direction:column;gap:6px">'+linhas+'</div><p class="note" id="blpcMsg">Custo calculado pelo painel: '+pdR3.format(unit)+'/un. Ao salvar, o valor vai para o fornecedor padrão do produto no Bling.</p></div>'}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-blpc]');if(!b)return;const emp=b.dataset.blpc,inp=b.parentElement.querySelector('[data-blpcin]');const v=parseFloat(String(inp.value).replace(',','.'));const m=$('#blpcMsg');
  if(!(v>=0)){if(m)m.textContent='Informe um valor válido.';return}b.disabled=true;b.textContent='Salvando…';
  try{await CIA_FN('bling-sync',{acao:'precoCompra',empresa:emp,cod:b.dataset.cod,valor:v});b.textContent='Salvo ✓';if(m)m.textContent='Preço de compra atualizado no Bling da '+(emp==='we'?'We Premium':'Creative')+'.'}
  catch(err){b.textContent='Salvar no Bling';if(m)m.textContent='Não salvou: '+err.message}b.disabled=false});
const dtBR=s=>s?new Date(s).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
async function blStatus(){if(!window.CIA_FN){$('#blingBox').hidden=true;$('#syncAll').hidden=true;return}try{const r=await CIA_FN('bling-sync',{acao:'status'});BL.contas=r.contas||[];BL.carregado=true}catch(e){BL.erro=e.message}renderBling();syncInfo()}
function syncInfo(){const el=$('#syncInfo');if(!el)return;const t=BL.contas.map(c=>c.ultimo_sync).filter(Boolean).sort().pop();el.textContent=BL.ocupado?'':t?'Bling: última sincronização '+dtBR(t):(BL.contas.some(c=>c.conectada)?'Bling conectado':'');$('#syncAll').hidden=document.body.classList.contains('ro')||(BL.carregado&&!BL.contas.some(c=>c.conectada))}
$('#syncAll').addEventListener('click',async e=>{const b=e.currentTarget;if(BL.ocupado)return;BL.ocupado=true;b.disabled=true;syncInfo();const passo=t=>{b.textContent=t};const res=[];
  try{passo('↻ Pedidos, propostas, estoque e preços… (1/4)');const r=await CIA_FN('bling-sync',{acao:'sincronizar'});(r.resultado||[]).forEach(x=>res.push(x));
    passo('↻ Notas fiscais de entrada… (2/4)');try{await CIA_FN('bling-sync',{acao:'nfeEntrada'})}catch(err){}
    passo('↻ Notas fiscais de saída… (3/4)');try{const r2=await CIA_FN('bling-sync',{acao:'nfeSaida'});(r2.resultado||[]).forEach(y=>{const x=res.find(z=>z.empresa===y.empresa);if(x){x.novasSaida=(x.novasSaida||0)+(y.novasSaida||0);x.faltamSaida=y.faltamSaida}})}catch(err){}
    passo('↻ Trazendo as notas para o painel… (4/4)');BLX.rodando=false;await puxarXmlsBling();
    const t=res.map(x=>(x.empresa==='we'?'We Premium':'Creative')+': '+(x.erro?'erro — '+x.erro:x.conectada===false?'não conectada':(x.pedidos||0)+' pedidos, '+(x.propostas||0)+' propostas'+(x.novasEntrada?', '+x.novasEntrada+' NF entrada':'')+(x.novasSaida?', '+x.novasSaida+' NF saída':'')+(x.faltamSaida?' (faltam '+x.faltamSaida+' NF de saída — continuam na próxima rodada)':''))).join(' · ');
    setSave('ok','Sincronizado com o Bling');const m=$('#blMsg');if(m)m.textContent='Sincronizado. '+t;b.title='Última: '+t}
  catch(err){setSave('warn','Bling: '+err.message);const m=$('#blMsg');if(m)m.textContent='Não sincronizou: '+err.message}
  b.textContent='↻ Sincronizar tudo com o Bling';b.disabled=false;BL.ocupado=false;await blStatus();renderAll()});
function renderBling(){const el=$('#blContas');if(!el)return;const gestor=['admin','master'].includes(window.CIA_PAPEL?CIA_PAPEL():'');
  if(BL.erro&&!BL.contas.length){el.innerHTML='<span class="note">'+(/Failed to send|fetch|404/i.test(BL.erro)?'A integração com o Bling ainda não foi publicada no Supabase.':esc(BL.erro))+'</span>';return}
  el.innerHTML=BL.contas.map(c=>{const r=c.resultado||{};const det=c.conectada?(r.erro?'<span class="pill bad">erro</span> '+esc(r.erro):(c.ultimo_sync?'última: '+dtBR(c.ultimo_sync)+(r.pedidos!=null?' · '+r.pedidos+' pedidos · '+(r.propostas||0)+' propostas':''):'aguardando a 1ª sincronização')):(c.segredos?'não conectada':'faltam as chaves no Supabase');
    return '<div class="box" style="min-width:240px;flex:1"><div class="eyebrow">'+esc(c.nome)+'</div><div style="margin:4px 0"><span class="pill '+(c.conectada?(r.erro?'warn':'ok'):'neu')+'">'+(c.conectada?'Conectada':'Desconectada')+'</span></div><div class="note">'+det+'</div>'+(gestor&&c.segredos?'<div class="row" style="margin-top:6px"><button type="button" class="btn'+(c.conectada?' ghost':'')+'" data-blcon="'+c.empresa+'">'+(c.conectada?'Reconectar':'Conectar ao Bling')+'</button></div>':'')+'</div>'}).join('')||'<span class="note">Sem contas.</span>';
}
$('#blContas').addEventListener('click',async e=>{const b=e.target.closest('[data-blcon]');if(!b)return;b.disabled=true;b.textContent='Abrindo o Bling…';
  try{const r=await CIA_FN('bling-sync',{acao:'autorizar',empresa:b.dataset.blcon});location.href=r.url}catch(err){$('#blMsg').textContent=err.message;b.disabled=false;b.textContent='Conectar ao Bling'}});
if(window.__BLING_RET){$('#blMsg').textContent=/^ok/.test(window.__BLING_RET)?'Bling conectado! Clique em "Sincronizar tudo com o Bling", no topo, para trazer os dados.':'O link de autorização expirou. Clique em Conectar de novo.';window.__BLING_RET=null}

/* ---------- painéis de configuração abertos pelo menu Configurações ---------- */
const CFGP={blingBox:['Integração Bling',()=>{if(!BL.pedindo){BL.pedindo=true;blStatus()}else{blStatus()}}],entPainel:['Origem das entradas',()=>renderEntradas()],vincPainel:['Cadastro de vínculos',()=>renderVinculos()]};
let CFGP_ATUAL=null;
function devolverPainelCfg(){if(!CFGP_ATUAL)return;const {el,pai,prox}=CFGP_ATUAL;if(prox&&prox.parentNode===pai)pai.insertBefore(el,prox);else pai.appendChild(el);CFGP_ATUAL=null}
function abrirPainelCfg(id){const el=document.getElementById(id),cfg=CFGP[id];if(!el||!cfg)return;devolverPainelCfg();
  CFGP_ATUAL={el,pai:el.parentNode,prox:el.nextSibling};document.querySelectorAll('.cmodal').forEach(m=>m.hidden=true);
  $('#cfgPTit').textContent=cfg[0];$('#cfgPCorpo').appendChild(el);el.hidden=false;$('#cfgPainel').hidden=false;try{cfg[1]()}catch(e){}}
function fecharPainelCfg(){$('#cfgPainel').hidden=true;devolverPainelCfg();renderAll()}
document.addEventListener('click',e=>{const b=e.target.closest('[data-cfgp]');if(b){abrirPainelCfg(b.dataset.cfgp);return}
  if(e.target.closest('#cfgPFechar')){fecharPainelCfg();return}
  if(e.target.closest('#cfgPVoltar')){fecharPainelCfg();const h=document.getElementById('btnCfg');if(h)h.click();return}
  if(e.target.id==='cfgPainel')fecharPainelCfg()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#cfgPainel').hidden)fecharPainelCfg()});
/* ---------- EXPORTAR RELATÓRIOS (.xlsx) ---------- */
const R2=x=>Math.round((+x||0)*100)/100,R4=x=>Math.round((+x||0)*10000)/10000;
const dBR=s=>s?String(s).split('-').reverse().join('/'):'';
const REL={
  entregas:()=>{const VC=vendasPorCod(),EC=estPorCod();return[['Coleção','Código','SKU','Fornecedor','1º Pedido','2º Pedido','Total','Recebido','% Recebido','Saldo a receber','Vendido','Estoque Stralog','Status','Origem do recebido']].concat(allProjects().map(p=>{const t=total(p),r=p.rec||0,k=normK(p.codigo);return[p.colecao,p.codigo||'',p.sku,p.forn||'',p.p1||0,p.p2||0,t,r,t?R2(r/t*100):0,Math.max(0,t-r),VC[k]?VC[k].q:'',EC[k]?EC[k].qtd:'',status(p)[1]+(p.est?' (estimado)':''),p.src||'']}))},
  estruturas:()=>{const L=[['Coleção','Código','Projeto','Qtd simulada','Insumo','Código insumo','Fornecedor','Origem','Qtd/un','Custo un. (R$)','Estoque insumo','Necessidade','Comprar','Desembolso (R$)','Observação']];
    allProjects().forEach(p=>{const c=calc(p);if(!c.linhas.length)L.push([p.colecao,p.codigo||'',p.sku,c.Q,'(sem estrutura)','','','','','','','','',0,'']);c.linhas.forEach(l=>L.push([p.colecao,p.codigo||'',p.sku,c.Q,l.c.nome,l.c.cod||'',l.c.forn||'',({NF:'NF',planilha:'Planilha',ref:'Referência','?':'Não encontrado',info:'Informado',orc:'A orçar'})[l.c.origem]||'',R4(l.c.coef),l.cu==null?'':R4(l.cu),R2((+l.c.saldo||0)+(XIN[l.c.cod]||0)),R2(l.nec),R2(l.comprar),R2(l.v),l.c.nota||'']))});return L},
  carteira:()=>{const L=[['Incluído','Coleção','Código','Projeto','Qtd','Custo unitário (R$)','Custo do lote (R$)','Necessidade de caixa (R$)','Situação da estrutura']];let T=0;
    cartRows().forEach(({p,c,inc})=>{if(inc)T+=c.desemb;L.push([inc?'Sim':'Não',p.colecao,p.codigo||'',p.sku,c.Q,R4(c.unit),R2(c.bruto),R2(c.desemb),c.semEstrutura?'Sem estrutura':c.falta?'Custo faltando':'Completo'])});
    L.push([]);L.push(['','','','Total da carteira','','','',R2(T),'']);
    const forn={};cartRows().filter(r=>r.inc).forEach(({c})=>c.linhas.forEach(l=>{const k=l.c.forn||'Sem fornecedor';forn[k]=(forn[k]||0)+l.v}));
    L.push([]);L.push(['A pagar por fornecedor']);Object.entries(forn).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>L.push([k,R2(v)]));return L},
  compras:()=>{const L=[['Compras por mês','Valor (R$)']];Object.entries(D.comprasMes).sort().forEach(([m,v])=>L.push([m.split('-').reverse().join('/'),R2(v)]));
    L.push([]);L.push(['Código','Descrição','Fornecedor','Qtd comprada','Último preço (R$)','Última NF']);D.catalogo.slice().sort((a,b)=>String(b[5]).localeCompare(String(a[5]))).forEach(r=>L.push([r[0],r[1],r[2],r[3],r[4],dBR(r[5])]));return L},
  notas:()=>{const L=[['Tipo','Chave','Número','Emissão','Emitente','CNPJ emitente','Destinatário','CNPJ destinatário','Natureza','Valor NF (R$)','Código','Descrição','Unid.','Qtd','Valor un.','Valor total','CFOP','Situação']];
    notasLista().forEach(n=>n.itens.forEach(i=>L.push([n.tipo==='entrada'?'Entrada':'Saída',n.chave,n.num,dBR(n.data),n.emit,n.emitDoc||'',n.dest,n.destDoc||'',n.natOp,R2(n.vNF),i[0],i[1],i[2],i[3],i[4],i[5],i[6],n.cancelada?'Cancelada':(BASE_CH.has(n.chave)?'Já na planilha':'')])));return L},
  vendas:()=>{const L=[['Data','Código','Descrição','Qtd','Valor (R$)','Canal','Empresa','Série']];vendasLinhas().filter(x=>(!EMP||x[6]===EMP)&&(!SERIE||(x[7]||'')===SERIE)).forEach(x=>L.push([dBR(x[0]),x[1],x[2],x[3],R2(x[4]),x[5],empNome(x[6]),x[7]||'']));return L},
  estoque:()=>{const V=vendasPorCod(),P=projPorCod(),EP=calcEmpenho().porCod;const L=[['Código','Produto','Coleção'].concat(LOCAIS.map(l=>'Estoque '+l.nome),['Estoque total','Empenhado','Disponível','Falta p/ pedidos','Venda média/mês','Cobertura (meses)','Lotes'])];
    (estoqueAtual&&estoqueAtual.itens||[]).forEach(i=>{const v=V[i.cod],m=v?mediaMensal(v):0,p=P[i.cod],e=EP[i.cod],emp=e?e.empPed+e.empProp:0,disp=i.qtd-emp;L.push([i.cod,p?p.sku:i.desc,p?p.colecao:''].concat(LOCAIS.map(l=>i.loc&&i.loc[l.id]!=null?i.loc[l.id]:''),[i.qtd,emp,disp,e?e.falta:0,R2(m),m?R2(Math.max(0,disp)/m):'',(i.lotes||[]).map(l=>l[0]+(l[2]?' val '+dBR(l[2]):'')).join(' | ')]))});return L},
  comercial:()=>{const{res}=calcEmpenho();const L=[['Fila','Tipo','Número','Cliente','Empresa','Data','Previsão','Situação','Atendimento','Código','Descrição','Qtd','Valor un. (R$)','Valor total (R$)','Empenhado','Falta','A receber (projetos)','Observação']];
    Object.entries(pedidos).filter(([,p])=>!EMP||p.emp===EMP).sort((a,b)=>(res[a[0]].ord||1e9)-(res[b[0]].ord||1e9)).forEach(([id,p])=>{const r=res[id];r.it.forEach(x=>L.push([r.ord||'',TIPO_NOME[p.tipo],p.numero,p.cliente,p.emp?empNome(p.emp):'',dBR(p.data),dBR(p.prev),SIT_NOME[p.status]||p.status,r.st[1],x.c,x.d,x.q,R2(x.v),R2(x.q*x.v),p.status==='aberto'?x.a:'',p.status==='aberto'?x.f:'',aReceber(x.c)||'',p.obs||'']))});return L},
  empenho:()=>{const{porCod}=calcEmpenho(),E=estPorCod(),P=projPorCod();const L=[['Código','Produto'].concat(LOCAIS.map(l=>'Estoque '+l.nome),['Estoque total','Em pedidos','Em propostas','Empenhado','Livre','Falta','A receber (projetos)'])];
    Object.entries(porCod).sort((a,b)=>b[1].falta-a[1].falta).forEach(([c,e])=>{const est=E[c]?E[c].qtd:0,p=P[c];L.push([c,p?p.colecao+' · '+p.sku:(E[c]&&E[c].desc)||e.desc].concat(LOCAIS.map(l=>E[c]&&E[c].loc[l.id]!=null?E[c].loc[l.id]:''),[est,e.ped,e.prop,e.empPed+e.empProp,Math.max(0,est-e.empPed-e.empProp),e.falta,aReceber(c)]))});return L},
  resumo:()=>{const ps=allProjects();const ped=ps.reduce((a,p)=>a+total(p),0),rec=ps.reduce((a,p)=>a+(p.rec||0),0);let des=0;cartRows().forEach(r=>{if(r.inc)des+=r.c.desemb});
    const cols={};ps.forEach(p=>{const c=cols[p.colecao]||(cols[p.colecao]=[0,0,0]);c[0]++;c[1]+=total(p);c[2]+=p.rec||0});
    const L=[['Painel de Projetos Cia Beauty'],['Gerado em',new Date().toLocaleString('pt-BR')],['Base','Planilha Geral 29.10 + NFs até '+D.atualizado],[],['Indicador','Valor'],['Projetos',ps.length],['Unidades pedidas',ped],['Unidades recebidas',rec],['% recebido',ped?R2(rec/ped*100):0],['A receber',ped-rec],['Necessidade de caixa da carteira (R$)',R2(des)],[],['Coleção','SKUs','Pedido','Recebido','% recebido']];
    Object.entries(cols).forEach(([k,c])=>L.push([k,c[0],c[1],c[2],c[1]?R2(c[2]/c[1]*100):0]));return L}
};
const ABA_NOME={resumo:'Resumo',entregas:'Entregas',estruturas:'Custos - Estruturas',carteira:'Carteira',compras:'Compras',notas:'Notas XML',vendas:'Vendas',estoque:'Estoque por local',comercial:'Comercial - Pedidos',empenho:'Comercial - Empenho'};
const TAB_REL={inicio:['resumo'],entregas:['entregas'],simulador:['estruturas'],produtos:['estruturas'],carteira:['carteira'],compras:['compras'],notas:['notas'],vendas:['vendas'],comercial:['comercial','empenho'],estoque:['estoque']};
function montarXlsx(chaves){const wb=XLSX.utils.book_new();chaves.forEach(k=>{const rows=REL[k]();const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=(rows.find(r=>r.length>3)||rows[0]||[]).map((_,i)=>({wch:Math.min(48,Math.max(10,...rows.slice(0,200).map(r=>String(r[i]==null?'':r[i]).length+2)))}));XLSX.utils.book_append_sheet(wb,ws,ABA_NOME[k].slice(0,31))});
  return new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})}
async function exportar(chaves,nome,btn){ULT_EXPORT=chaves;if(!window.XLSX){btn.textContent='Leitor de planilhas não carregou';return}const old=btn.textContent;btn.textContent='Gerando…';
  try{const blob=montarXlsx(chaves);btn.textContent=old;await baixar(nome,blob,btn)}catch(e){console.error(e);btn.textContent='Erro ao gerar o relatório';setTimeout(()=>btn.textContent=old,3000)}}
const hoje=()=>new Date().toISOString().slice(0,10);
$('#expTudo').addEventListener('click',e=>exportar(['resumo','entregas','estruturas','carteira','compras','notas','vendas','comercial','empenho','estoque'],'Relatorio_Cia_Beauty_'+hoje()+'.xlsx',e.currentTarget));
$('#expAba').addEventListener('click',e=>{const t=tabs.find(x=>!$('#tab-'+x).hidden)||'entregas';exportar(TAB_REL[t],ABA_NOME[TAB_REL[t][0]].replace(/\W+/g,'_')+'_'+hoje()+'.xlsx',e.currentTarget)});

$('#copyPerm').addEventListener('click',async()=>{try{const pm=await claude.use('permissions');if(pm)await pm.manage()}catch(e){$('#copyOk').textContent='Abra o menu Permissões do app (no topo da página) e libere Downloads.'}});
$('#copyClose').addEventListener('click',()=>{$('#copyModal').hidden=true;$('#copyOk').textContent=''});
$('#copyList').addEventListener('click',async e=>{const b=e.target.closest('[data-copy]');if(!b)return;const txt=tsv(REL[b.dataset.copy]());
  try{await navigator.clipboard.writeText(txt);$('#copyOk').textContent=ABA_NOME[b.dataset.copy]+' copiada. Abra o Excel e cole com Ctrl+V.'}
  catch(err){const ta=document.createElement('textarea');ta.value=txt;ta.style.cssText='width:100%;height:160px';$('#copyOk').innerHTML='';$('#copyOk').appendChild(document.createTextNode('A cópia automática foi bloqueada. Selecione o texto abaixo (Ctrl+A) e copie (Ctrl+C):'));$('#copyOk').appendChild(ta);ta.focus();ta.select()}});
/* ---------- INÍCIO ---------- */
const ICONS={};document.querySelectorAll('nav.tabs button').forEach(b=>{ICONS[b.dataset.tab]=b.querySelector('svg').innerHTML});
function renderInicio(){
  const ps=allProjects();const ped=ps.reduce((a,p)=>a+total(p),0),rec=ps.reduce((a,p)=>a+(p.rec||0),0);
  let des=0,sem=[],falta=[],orc=0;cartRows().forEach(({p,c,inc})=>{if(inc)des+=c.desemb;if(c.semEstrutura)sem.push(p);else if(c.falta)falta.push(p);comps(p).forEach(x=>{if(x.origem==='orc')orc++})});
  const ag=ps.filter(p=>status(p)[0]==='bad');
  const nN=Object.keys(notas).length,L=vendasLinhas(),fat=L.reduce((s,x)=>s+x[4],0);
  const E=estoqueAtual;let rup=0;if(E){const V=vendasPorCod();E.itens.forEach(i=>{const v=V[i.cod],m=v?mediaMensal(v):0;if(i.qtd<=0||(m&&i.qtd/m<1))rup++})}
  const cards=[
    ['entregas','Entregas',fmtI.format(rec)+' un.',Math.round(ped?rec/ped*100:0)+'% do pedido recebido · '+ag.length+' aguardando'],
    ['simulador','Custos',ps.filter(p=>!calc(p).semEstrutura&&!calc(p).falta).length+' completos','custo unitário e caixa por lote'],
    ['carteira','Carteira futura',fmtR0.format(des),'necessidade de caixa dos próximos lotes'],
    ['compras','Compras de insumos',fmtR0.format(Object.values(D.comprasMes).reduce((a,b)=>a+b,0)),D.catalogo.length+' insumos no catálogo'],
    ['notas','Notas XML',fmtI.format(nN)+' notas','importar e exportar NF-e'],
    ['vendas','Vendas',L.length?fmtR0.format(fat):'Sem dados',L.length?fmtI.format(L.reduce((s,x)=>s+x[3],0))+' unidades vendidas':'importe o relatório de vendas'],
    (()=>{const{res}=calcEmpenho();const ab=Object.entries(pedidos).filter(([,p])=>p.status==='aberto'&&p.tipo==='pedido');const ok=ab.filter(([id])=>res[id].st[1]==='Atende').length;return['comercial','Comercial',ab.length?ab.length+' pedidos':'Sem dados',ab.length?ok+' atendem 100% · '+(ab.length-ok)+' com falta':'importe pedidos e propostas do Bling']})(),
    ['estoque','Estoque',E?fmtI.format(E.itens.reduce((s,i)=>s+Math.max(0,i.qtd),0))+' un.':'Sem dados',E?(rup+' em ruptura · '+LOCAIS.filter(l=>estLocais[l.id]).length+' de '+LOCAIS.length+' locais'):'importe Stralog e Galpão Pedro Voss']];
  $('#homeCards').innerHTML=cards.map(c=>'<button class="hcard" data-go="'+c[0]+'"><span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true">'+ICONS[c[0]]+'</svg></span><b>'+c[1]+'</b><span class="big num">'+c[2]+'</span><span class="note">'+c[3]+'</span><span class="go">Abrir →</span></button>').join('');
  const P=[];
  if(sem.length)P.push(['bad',sem.length+' projeto(s) sem estrutura de custo',sem.slice(0,4).map(p=>p.sku).join(' · '),'simulador',sem[0].id]);
  if(falta.length)P.push(['warn',falta.length+' projeto(s) com custo faltando',falta.slice(0,4).map(p=>p.sku).join(' · '),'simulador',falta[0].id]);
  if(orc)P.push(['warn',orc+' insumo(s) a orçar','caixas, rótulos e envases marcados como "a orçar"','carteira']);
  if(ag.length)P.push(['neu',ag.length+' projeto(s) aguardando entrega',ag.slice(0,4).map(p=>p.sku).join(' · '),'entregas']);
  if(E&&rup)P.push(['bad',rup+' produto(s) em ruptura ou zerados','pela média de venda dos últimos 3 meses','estoque']);
  {const{res}=calcEmpenho();const f=Object.entries(pedidos).filter(([id,p])=>p.status==='aberto'&&p.tipo==='pedido'&&res[id].st[0]!=='ok');if(f.length)P.push(['bad',f.length+' pedido(s) de venda sem estoque suficiente',f.slice(0,4).map(([,p])=>p.numero+(p.cliente?' '+p.cliente:'')).join(' · '),'comercial'])}
  {const ns=sinaisAbertos().length;if(ns)P.push(['warn',ns+' insumo(s) sinalizado(s) como errado(s)','indicações de insumo correto para ajustar nas estruturas','compras'])}
  LOCAIS.filter(l=>!estLocais[l.id]).forEach(l=>P.push(['neu','Estoque '+l.nome+' ainda não alimentado','importe a planilha ou lance as quantidades na aba Estoque','estoque']));
  if(!L.length)P.push(['neu','Vendas ainda não importadas','relatório do Bling ou dos marketplaces','vendas']);
  $('#homePend').innerHTML=P.map(x=>'<button data-go="'+x[3]+'"'+(x[4]?' data-pid="'+esc(x[4])+'"':'')+'><span class="pill '+x[0]+'">'+({bad:'urgente',warn:'atenção',neu:'info'})[x[0]]+'</span><span><b style="font-weight:600">'+esc(x[1])+'</b><br><span class="note">'+esc(x[2])+'</span></span></button>').join('')||'<p class="note">Nada pendente.</p>';
  $('#homeBase').textContent='Base: planilha Geral 29.10 + NFs de entrada até '+D.atualizado+'.';
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b&&b.closest('#tab-inicio')){if(b.dataset.pid)cur=b.dataset.pid;showTab(b.dataset.go);return}
  const a=e.target.closest('[data-act]');if(a&&a.closest('#tab-inicio')){if(a.dataset.act==='novo')$('#btnNovo').click();if(a.dataset.act==='rel')$('#expTudo').click()}});
/* ---------- abas ---------- */
const tabs=['inicio','entregas','simulador','produtos','carteira','compras','notas','vendas','comercial','estoque'];
const LBL={"inicio": ["Início", "Cia Beauty · projetos licenciados"], "entregas": ["Entregas", "Status de recebimento por projeto"], "simulador": ["Custos", "Custo e necessidade de caixa por lote"], "produtos": ["Produtos", "Do que cada produto é feito: insumos, fornecedores e lote"], "carteira": ["Carteira", "Desembolso dos próximos lotes"], "compras": ["Compras", "Insumos comprados nas NFs de entrada"], "notas": ["Notas XML", "Importar e exportar NF-e de entrada e saída"], "vendas": ["Vendas", "Vendas por empresa, série, produto, canal e mês"], "comercial": ["Comercial", "Pedidos de venda e propostas: o que dá para atender com o estoque"], "estoque": ["Estoque", "Estoque por local: Stralog, Galpão Pedro Voss e outros"]};
function showTab(t){if(!tabs.includes(t))t='inicio';$('#kpis').hidden=t!=='inicio';$('#tabTitle').textContent=t==='inicio'?('Olá'+(window.__NOME?', '+window.__NOME:'')):LBL[t][0]==='Custos'?'Custos':LBL[t][0]==='Produtos'?'Produtos':LBL[t][0]==='Carteira'?'Carteira futura':LBL[t][0]==='Compras'?'Compras de insumos':LBL[t][0]==='Notas XML'?'Notas fiscais (XML)':LBL[t][0]==='Estoque'?'Estoque':LBL[t][0]==='Comercial'?'Comercial':LBL[t][0]==='Vendas'?'Vendas':'Entregas';$('#tabSub').textContent=LBL[t][1];window.scrollTo(0,0);document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));tabs.forEach(x=>$('#tab-'+x).hidden=x!==t);if(location.hash!=='#'+t)history.replaceState(null,'','#'+t);renderAll()}
document.querySelector('nav.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)showTab(b.dataset.tab)});
window.addEventListener('hashchange',()=>showTab(location.hash.slice(1)));
function renderAll(){EMPENHO=null;renderKpis();const t=tabs.find(x=>!$('#tab-'+x).hidden);if(t==='inicio')renderInicio();if(t==='entregas')renderEntregas();if(t==='simulador'){renderSim();renderSinaisSim()}if(t==='produtos')renderProdutos(true);if(t==='carteira')renderCarteira();if(t==='compras'){renderCompras();renderSinais();renderEmpInsumos();renderVinculos()}if(t==='notas'){renderNotas();renderEntradas()}if(t==='vendas')renderVendas();if(t==='comercial'){renderComercial();if(!BL.carregado&&!BL.pedindo){BL.pedindo=true;blStatus()}else renderBling()}if(t==='estoque')renderEstoque()}
document.addEventListener('click',e=>{if(!e.target.closest('.searchbox')){const s=$('#sugg');if(s)s.hidden=true}});


/* ---------- PRODUTOS: árvore produto → insumos → fornecedores (só leitura; usa calc() da aba Custos) ---------- */
const PD_TIPOS={
  frasco:['Frasco','--t-prim','<path d="M10 3h4v3l2 2v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8l2-2z"/><path d="M8 12h8"/>'],
  valvula:['Válvula','--t-prim','<path d="M9 9h6v12H9z"/><path d="M10 9V6h6l3 2"/><path d="M12 6V4"/>'],
  tampa:['Tampa','--t-prim','<rect x="6" y="9" width="12" height="11" rx="2"/><path d="M8 9V6h8v3M9 13v4M12 13v4M15 13v4"/>'],
  batoque:['Batoque','--t-prim','<path d="M8 6h8l-1 5H9z"/><path d="M10 11v7a2 2 0 0 0 4 0v-7"/>'],
  rotulo:['Rótulo','--t-deco','<path d="M3 12l9-9h8v8l-9 9z"/><circle cx="16" cy="8" r="1.5"/>'],
  envase:['Envase','--t-cont','<path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z"/>'],
  materia:['Matéria-prima','--t-cont','<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 14h9"/>'],
  caixa:['Caixa de embarque','--t-sec','<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'],
  cartucho:['Cartucho','--t-sec','<rect x="5" y="3" width="14" height="18" rx="1"/><rect x="8" y="7" width="8" height="7" rx="1"/>'],
  montagem:['Montagem','--t-serv','<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'],
  acessorio:['Acessório','--t-prim','<path d="M12 8c-2-4-8-4-8 0s6 4 8 0c2 4 8 4 8 0s-6-4-8 0z"/><path d="M12 8v12"/>'],
  outro:['Insumo','--t-serv','<circle cx="12" cy="12" r="8"/>']
};
const pdNorm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
function pdTipo(nome){const s=pdNorm(nome);for(const [k,t] of [['rotulo','rotulo'],['fita','rotulo'],['envase','envase'],['materia','materia'],['caixa','caixa'],['cartucho','cartucho'],['montagem','montagem'],['scrunchie','acessorio'],['frasco','frasco'],['valvula','valvula'],['gatilho','valvula'],['spray','valvula'],['pump','valvula'],['tampa','tampa'],['batoque','batoque']])if(s.includes(k))return PD_TIPOS[t];return PD_TIPOS.outro}
const pdPct=new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1});
const pdR3=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:3});
const pdDt=s=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(2,4):'—';
const pdNomeCurto=p=>String(p.sku||'').replace(/^(TWEETY X DEBORAH SECCO|MORANGUINHO X THAIS FERSOZA|BT21)\s+/i,'').replace(/\s+/g,' ').trim()||p.sku;
let PD={col:'',q:'',cur:null,sel:null,forn:null,fotos:{},site:[],gestor:false,ligado:false,trocar:false};
const PD_CAT={};(D.catalogo||[]).forEach(c=>{if(!PD_CAT[c[0]])PD_CAT[c[0]]=c});
async function pdLigar(){
  if(PD.ligado||!window.claude||!claude.use)return;PD.ligado=true;
  try{const u=await claude.use('user');if(u)PD.gestor=!!(await u.isOwner())}catch(e){}
  try{const d=await claude.use('db');if(!d)return;
    d.collection('fotos').onSnapshot(s=>{const f={};s.docs.forEach(x=>{f[x.id]=x.data()});PD.fotos=f;if(!$('#tab-produtos').hidden)renderProdutos(false)});
    d.doc('fotos_site/catalogo').onSnapshot(s=>{PD.site=(s.exists&&s.data().itens)||[]});
  }catch(e){}
}
function pdFoto(p,cls){const f=PD.fotos[p.id];return f&&f.url?'<img class="'+(cls||'')+'" src="'+esc(f.url)+'" alt="'+esc(p.sku)+'" loading="lazy">':'<span class="pd-semfoto">'+esc((p.colecao||'?').slice(0,2).toUpperCase())+'</span>'}
function pdHist(cod){if(!cod||cod==='?')return[];const h=[];Object.values(notas).forEach(n=>{(n.itens||[]).forEach(it=>{if(it[0]===cod)h.push({d:n.data,nf:n.num,f:n.emit,q:it[3],u:it[4]})})});return h.sort((a,b)=>a.d<b.d?1:-1).slice(0,8)}
function pdCalc(p){const k=calc(p);let unit=0;k.linhas.forEach(l=>{l.coef=+l.c.coef||0;l.un=l.coef*(l.cu||0);unit+=l.un});k.linhas.forEach(l=>{l.pct=unit?l.un/unit:0});return k}
function renderProdutos(animar){
  pdLigar();
  const todos=allProjects();const cols=[...new Set(todos.map(p=>p.colecao).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if(PD.col&&!cols.includes(PD.col))PD.col='';
  $('#pdCols').innerHTML=['<button class="chip" data-col="" aria-pressed="'+(!PD.col)+'">Todas</button>'].concat(cols.map(c=>'<button class="chip" data-col="'+esc(c)+'" aria-pressed="'+(PD.col===c)+'">'+esc(c)+' <span class="muted">'+todos.filter(p=>p.colecao===c).length+'</span></button>')).join('');
  const qq=pdNorm(PD.q).split(/\s+/).filter(Boolean);
  const lista=todos.filter(p=>(!PD.col||p.colecao===PD.col)&&(!qq.length||qq.every(t=>pdNorm([p.sku,p.id,p.codigo,p.colecao].concat(comps(p).map(c=>c.forn+' '+c.nome)).join(' ')).includes(t))));
  if(!PD.cur||!byId(PD.cur))PD.cur=(lista[0]||todos[0]||{}).id||null;
  $('#pdGrid').innerHTML=lista.length?lista.map(p=>{const k=pdCalc(p);let u=0;k.linhas.forEach(l=>u+=l.un);return '<button class="pd-card" data-p="'+esc(p.id)+'" aria-current="'+(p.id===PD.cur&&pdAberto())+'"><span class="pd-ph">'+pdFoto(p)+'</span><b>'+esc(pdNomeCurto(p))+'</b><span class="pd-meta"><span class="num">'+esc(p.id)+'</span><span class="num">'+(k.semEstrutura?'sem estrutura':pdR3.format(u)+'/un')+'</span></span></button>'}).join(''):'<p class="note">Nenhum produto encontrado.</p>';
  if(pdAberto()){pdMontar(!!animar);pdPainel()}
}
function pdAberto(){return !$('#pdModal').hidden}
function pdAbrir(id){PD.cur=id;PD.sel=null;PD.forn=null;PD.trocar=false;const p=byId(id);$('#pdMcol').textContent=(p.id||'')+' · '+(p.colecao||'');$('#pdMtit').textContent=pdNomeCurto(p);$('#pdModal').hidden=false;document.body.style.overflow='hidden';$('#pdModal').scrollTop=0;document.querySelectorAll('#pdGrid .pd-card').forEach(c=>c.setAttribute('aria-current',String(c.dataset.p===id)));requestAnimationFrame(()=>{pdMontar(true);pdPainel()})}
function pdFechar(){$('#pdModal').hidden=true;document.body.style.overflow='';PD.sel=null;PD.forn=null;PD.trocar=false}
function pdMontar(animar){
  const st=$('#pdStage');const p=byId(PD.cur);if(!p){st.innerHTML='';return}
  const k=pdCalc(p);let unit=0;k.linhas.forEach(l=>unit+=l.un);
  st.className='pd-stage';
  st.innerHTML='<svg class="pd-wires" aria-hidden="true"></svg><button class="pd-hub" id="pdHub" aria-label="Resumo do produto">'+pdFoto(p)+'</button><div class="pd-cap" id="pdCap">'+esc(pdNomeCurto(p))+'<span>'+(k.semEstrutura?'sem estrutura cadastrada':pdR3.format(unit)+' por unidade')+'</span></div>'+
    (k.semEstrutura?'<div class="pd-vazio">Este produto ainda não tem insumos cadastrados. Monte a estrutura na aba Custos.</div>':'')+
    k.linhas.map((l,i)=>{const t=pdTipo(l.c.nome);return '<button class="pd-node" data-i="'+i+'" style="--i:'+i+';--tc:var('+t[1]+')" aria-pressed="false"><span class="pd-hd"><span class="pd-ic"><svg viewBox="0 0 24 24">'+t[2]+'</svg></span><span class="pd-nm">'+esc(l.c.nome)+'</span></span><span class="pd-fo">'+esc(short(l.c.forn)||'Fornecedor não informado')+'</span><span class="pd-vl">'+(l.cu==null?'<span class="pill bad">custo faltando</span>':'<span class="num">'+pdR3.format(l.un)+'</span>')+'<span class="num muted">'+pdPct.format(l.pct)+'</span></span><span class="pd-bar"><i style="width:'+(l.pct*100).toFixed(1)+'%"></i></span></button>'}).join('');
  pdLayout();
  if(animar){st.classList.remove('anim');void st.offsetWidth;st.classList.add('anim')}
  pdMarcar();
}
function pdLayout(){
  const st=$('#pdStage');if(!st||!st.isConnected||$('#tab-produtos').hidden)return;const nodes=[...st.querySelectorAll('.pd-node')];const W=st.clientWidth;const hub=$('#pdHub'),cap=$('#pdCap');if(!hub)return;
  const lista=W<720||!nodes.length;st.classList.toggle('lista',lista);st.querySelectorAll('.pd-trilho').forEach(t=>t.remove());
  if(lista){st.style.height='';if(nodes.length){const z=nodes[nodes.length-1];const t=document.createElement('div');t.className='pd-trilho';const y0=hub.offsetTop+hub.offsetHeight;t.style.top=y0+'px';t.style.height=Math.max(0,z.offsetTop+z.offsetHeight/2-y0)+'px';st.prepend(t)}return}
  const n=nodes.length;const H=n>7?660:560;st.style.height=H+'px';const cx=W/2,cy=H/2;
  hub.style.left=(cx-95)+'px';hub.style.top=(cy-110)+'px';cap.style.left=(cx-110)+'px';cap.style.top=(cy+90)+'px';
  const rx=Math.min(W/2-100,420),ry=H/2-58,nw=168;const svg=st.querySelector('svg.pd-wires');svg.setAttribute('viewBox','0 0 '+W+' '+H);let paths='';
  nodes.forEach((el,i)=>{const ang=-Math.PI/2+(i+.5)*(2*Math.PI/n)-Math.PI/n*.5;const x=cx+rx*Math.cos(ang),y=cy+ry*Math.sin(ang);const h=el.offsetHeight;
    const L=Math.max(8,Math.min(W-nw-8,x-nw/2)),T=Math.max(8,Math.min(H-h-8,y-h/2));el.style.left=L+'px';el.style.top=T+'px';
    const ex=L+nw/2,ey=T+h/2;el.style.setProperty('--dx',(cx-ex)+'px');el.style.setProperty('--dy',(cy-20-ey)+'px');
    const mx=(cx+ex)/2+(ey-cy)*.15,my=(cy-20+ey)/2-(ex-cx)*.15;paths+='<path data-i="'+i+'" style="--i:'+i+';--len:'+(Math.hypot(ex-cx,ey-cy)*1.15).toFixed(0)+'" d="M'+cx+' '+(cy-20)+' Q'+mx.toFixed(1)+' '+my.toFixed(1)+' '+ex.toFixed(1)+' '+ey.toFixed(1)+'"/>'});
  svg.innerHTML=paths;
}
function pdMarcar(){const st=$('#pdStage');st.querySelectorAll('.pd-node').forEach(n=>n.setAttribute('aria-pressed',String(+n.dataset.i===PD.sel)));st.querySelectorAll('.pd-wires path').forEach(p=>p.classList.toggle('on',+p.dataset.i===PD.sel))}
function pdPainel(){
  const el=$('#pdPainel');const p=byId(PD.cur);if(!p){el.innerHTML='<p class="note">Escolha um produto.</p>';return}
  const k=pdCalc(p);let unit=0;k.linhas.forEach(l=>unit+=l.un);const site=PD.fotos[p.id]&&PD.fotos[p.id].site;
  if(PD.forn){
    const dep=[];allProjects().forEach(x=>{if(comps(x).some(c=>(c.forn||'').trim()===PD.forn))dep.push(x)});dep.sort((a,b)=>(a.colecao||'').localeCompare(b.colecao||'')||a.sku.localeCompare(b.sku));
    let g='';el.innerHTML='<div><div class="eyebrow">Fornecedor</div><h2>'+esc(short(PD.forn))+'</h2></div><div class="pd-kv"><div><small>Produtos que dependem dele</small><b>'+dep.length+'</b></div><div><small>Coleções</small><b>'+new Set(dep.map(x=>x.colecao)).size+'</b></div></div><p class="note">Se este fornecedor atrasar, estes projetos ficam sem o insumo. Toque num produto para abri-lo.</p><div class="pd-dep">'+dep.map(x=>{const cab=x.colecao!==g?'<div class="g">'+esc(x.colecao)+'</div>':'';g=x.colecao;return cab+'<button class="i'+(x.id===p.id?' here':'')+'" data-abrir="'+esc(x.id)+'">'+esc(pdNomeCurto(x))+' <span class="muted num">'+esc(x.id)+'</span></button>'}).join('')+'</div><button class="btn" data-pd="volta">← Voltar ao insumo</button>';return;
  }
  if(PD.trocar){
    const it=PD.site||[];el.innerHTML='<div><div class="eyebrow">Foto do produto</div><h2>'+esc(pdNomeCurto(p))+'</h2></div><input type="search" id="pdFotoBusca" placeholder="Buscar no site Cia Beauty" aria-label="Buscar foto no site"><div class="pd-fotos" id="pdFotos">'+pdFotosLista('')+'</div><div class="row"><button class="btn" data-pd="semfoto">Deixar sem foto</button><button class="btn" data-pd="cancelaFoto">Cancelar</button></div>'+(it.length?'':'<p class="note">Lista do site ainda não carregada.</p>');
    $('#pdFotoBusca').addEventListener('input',e=>{$('#pdFotos').innerHTML=pdFotosLista(e.target.value)});return;
  }
  if(PD.sel==null||!k.linhas[PD.sel]){
    const L=k.linhas.slice().sort((a,b)=>b.un-a.un);
    el.innerHTML='<div><div class="eyebrow">'+esc(p.id)+' · '+esc(p.colecao||'')+'</div><h2>'+esc(pdNomeCurto(p))+'</h2></div>'+
      '<div class="pd-kv"><div><small>Custo por unidade</small><b>'+pdR3.format(unit)+'</b></div><div><small>Insumos</small><b>'+k.linhas.length+(k.falta?' <span class="pill bad">'+k.falta+' sem custo</span>':'')+'</b></div><div><small>Lote a produzir</small><b>'+fmtI.format(k.Q)+' un</b></div><div><small>Desembolso do lote</small><b>'+fmtR0.format(k.desemb)+'</b></div></div>'+
      (L.length?'<div><h3 style="margin-bottom:8px">De onde vem o custo</h3><div class="pd-comp">'+L.filter(l=>l.un>0).map(l=>'<i style="--tc:var('+pdTipo(l.c.nome)[1]+');width:'+(l.pct*100).toFixed(2)+'%" title="'+esc(l.c.nome)+'"></i>').join('')+'</div></div><div class="pd-leg">'+L.map(l=>'<div style="--tc:var('+pdTipo(l.c.nome)[1]+')"><i class="sw"></i><span>'+esc(l.c.nome)+'</span><span class="num">'+(l.cu==null?'—':pdR3.format(l.un))+'</span><span class="num muted">'+pdPct.format(l.pct)+'</span></div>').join('')+'</div>':'')+
      pdRecebBlock(p)+pdPrecoBling(p,unit)+
      '<p class="note">Pedido '+fmtI.format(total(p))+' · recebido '+fmtI.format(p.rec||0)+'. Os números seguem a aba Custos (quantidade e abatimento de estoque definidos lá).</p>'+
      '<div class="row"><button class="btn pri" data-pd="custos">Editar em Custos</button>'+(site?'<a class="btn" href="'+esc(site)+'" target="_blank" rel="noopener">Ver no site</a>':'')+(PD.gestor?'<button class="btn" data-pd="trocarFoto">Trocar foto</button>':'')+'</div>';
    return;
  }
  const l=k.linhas[PD.sel],c=l.c,t=pdTipo(c.nome),cat=PD_CAT[c.cod],hist=pdHist(c.cod);
  el.innerHTML='<div class="pd-tit" style="--tc:var('+t[1]+')"><span class="pd-ic"><svg viewBox="0 0 24 24">'+t[2]+'</svg></span><div style="min-width:0"><div class="eyebrow">'+esc(t[0])+(c.cod&&c.cod!=='?'?' · <span class="num">'+esc(c.cod)+'</span>':'')+'</div><h2 style="font-size:1.1rem">'+esc(c.nome)+'</h2></div></div>'+
    (c.forn?'<div class="pd-forn"><div style="min-width:0"><div class="eyebrow">Fornecedor</div><b>'+esc(short(c.forn))+'</b></div><button class="btn" data-pd="forn">Quem depende dele</button></div>':'<div class="pd-forn"><b>Fornecedor não informado</b></div>')+
    '<div class="pd-kv"><div><small>Custo un.</small><b>'+(l.cu==null?'—':pdR3.format(l.cu))+'</b></div><div><small>Consumo por produto</small><b class="num">'+l.coef.toLocaleString('pt-BR',{maximumFractionDigits:4})+'</b></div><div><small>No custo do produto</small><b>'+(l.cu==null?'—':pdR3.format(l.un))+'</b></div><div><small>Participação</small><b>'+pdPct.format(l.pct)+'</b></div></div>'+
    '<div><h3 style="margin-bottom:8px">Lote de '+fmtI.format(k.Q)+' unidades</h3><div class="pd-kv"><div><small>Precisa</small><b>'+fmtI.format(l.nec)+'</b></div><div><small>Tem em estoque</small><b>'+fmtI.format(l.est)+'</b></div><div><small>Comprar</small><b>'+fmtI.format(l.comprar)+'</b></div><div><small>Desembolso</small><b>'+(l.cu==null?'—':fmtR0.format(l.v))+'</b></div></div></div>'+
    (cat?'<div><h3 style="margin-bottom:6px">Última compra</h3><p class="note" style="margin:0">'+pdDt(cat[5])+' · '+fmtI.format(cat[3])+' un a '+pdR3.format(cat[4])+'<br>'+esc(cat[1])+'</p></div>':'<p class="note">Sem compra registrada nas notas para este código.</p>')+
    (hist.length?'<div><h3 style="margin-bottom:6px">Notas fiscais (XML)</h3><div class="tbl-wrap"><table><thead><tr><th>Data</th><th>NF</th><th class="n">Qtd</th><th class="n">Preço</th></tr></thead><tbody>'+hist.map(h=>'<tr><td>'+pdDt(h.d)+'</td><td class="mono">'+esc(h.nf)+'</td><td class="n">'+fmtI.format(h.q)+'</td><td class="n">'+pdR3.format(h.u)+'</td></tr>').join('')+'</tbody></table></div></div>':'')+
    '<button class="btn" data-pd="resumo">← Resumo do produto</button>';
}
function pdFotosLista(q){const t=pdNorm(q).split(/\s+/).filter(Boolean);const it=(PD.site||[]).filter(s=>t.every(x=>pdNorm(s.nome).includes(x))).slice(0,60);return it.map((s,i)=>'<button class="pd-fpick" data-img="'+esc(s.img)+'" data-site="'+esc('https://ciabeauty.com.br/produtos/'+s.slug+'/')+'" data-nome="'+esc(s.nome)+'"><img src="'+esc(s.img)+'" alt="" loading="lazy"><span>'+esc(s.nome)+'</span></button>').join('')||'<p class="note">Nada encontrado.</p>'}
async function pdSalvarFoto(dados){try{const d=await claude.use('db');if(dados)await d.collection('fotos').doc(PD.cur).set(dados);else await d.collection('fotos').doc(PD.cur).delete();if(dados)PD.fotos[PD.cur]=dados;else delete PD.fotos[PD.cur];PD.trocar=false;renderProdutos(false);setSave('ok','Foto salva')}catch(e){setSave('warn','Não salvou a foto')}}
$('#pdCols').addEventListener('click',e=>{const b=e.target.closest('[data-col]');if(!b)return;PD.col=b.dataset.col;renderProdutos(false)});
$('#pdBusca').addEventListener('input',e=>{PD.q=e.target.value;renderProdutos(false)});
$('#pdGrid').addEventListener('click',e=>{const b=e.target.closest('[data-p]');if(!b)return;pdAbrir(b.dataset.p)});
$('#pdFechar').addEventListener('click',pdFechar);
$('#pdModal').addEventListener('click',e=>{if(e.target===$('#pdModal'))pdFechar()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pdAberto())pdFechar()});
window.addEventListener('hashchange',()=>{if(pdAberto()&&location.hash!=='#produtos')pdFechar()});
$('#pdStage').addEventListener('click',e=>{const n=e.target.closest('.pd-node');if(n){const i=+n.dataset.i;PD.sel=PD.sel===i?null:i;PD.forn=null;PD.trocar=false;pdMarcar();pdPainel();if(innerWidth<1100&&PD.sel!=null)$('#pdPainel').scrollIntoView({behavior:'smooth',block:'start'});return}
  if(e.target.closest('#pdHub')){PD.sel=null;PD.forn=null;PD.trocar=false;pdMontar(true);pdPainel()}});
$('#pdPainel').addEventListener('click',e=>{const a=e.target.closest('[data-pd],[data-abrir],.pd-fpick');if(!a)return;
  if(a.dataset.abrir){pdAbrir(a.dataset.abrir);return}
  if(a.classList.contains('pd-fpick')){pdSalvarFoto({url:a.dataset.img,site:a.dataset.site,nome_site:a.dataset.nome,origem:'manual'});return}
  const k=a.dataset.pd,p=byId(PD.cur),kk=pdCalc(p);
  if(k==='forn'){PD.forn=(kk.linhas[PD.sel].c.forn||'').trim();pdPainel()}
  if(k==='volta'){PD.forn=null;pdPainel()}
  if(k==='resumo'){PD.sel=null;pdMarcar();pdPainel()}
  if(k==='custos'){cur=PD.cur;pdFechar();showTab('simulador')}
  if(k==='trocarFoto'){PD.trocar=true;pdPainel()}
  if(k==='cancelaFoto'){PD.trocar=false;pdPainel()}
  if(k==='semfoto')pdSalvarFoto(null);
});
let pdRT;new ResizeObserver(()=>{clearTimeout(pdRT);pdRT=setTimeout(()=>{pdLayout();pdMarcar()},60)}).observe($('#pdStage'));

showTab(location.hash.slice(1)||'inicio');
setSave('warn','Salvo só neste navegador');

/* ---------- usuário, permissões e auditoria ---------- */

function auditLine(o){if(!o||!o._em)return '';const n=o._por?(NOMES[o._por]||''):'';if(o._por&&!(o._por in NOMES)&&USERNS){NOMES[o._por]='';USERNS.profiles([o._por]).then(ps=>{const p=ps&&ps[o._por];NOMES[o._por]=(p&&p.name)||'';renderAll()}).catch(()=>{})}
  const d=new Date(o._em);return '<div class="audit">Última alteração: '+esc(n||'alguém com acesso')+' · '+d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'</div>'}
(async()=>{try{
  if(!window.claude||!claude.use)return;const u=await claude.use('user');if(!u)return;USERNS=u;
  const me=await u.me();MYID=me.id||null;const nome=me.name||'você';
  let pode=await u.can('data.write');if(pode===null)pode=true;
  $('#whoami').innerHTML='<span class="av">'+esc((nome[0]||'?').toUpperCase())+'</span><span>'+esc(nome)+'<br><span style="color:var(--side-muted)">'+(pode?'pode editar':'somente leitura')+'</span></span>';
  if(!pode)document.body.classList.add('ro');
  if(MYID)NOMES[MYID]=me.name||'';
}catch(e){}})();
/* ---------- conectar ao banco ---------- */
(async()=>{try{
  if(!window.claude||!claude.use)return;
  const d=await claude.use('db');if(!d){setSave('warn','Salvo só neste navegador');return}
  db=d;setSave('ok','Salvo na nuvem · base única');
  db.collection('estoque').onSnapshot(snap=>{const L={};let lista=null;snap.docs.forEach(d=>{if(!d.exists)return;const x=JSON.parse(JSON.stringify(d.data()));if(d.id==='_locais')lista=x.lista;else L[d.id==='atual'?'stralog':d.id]=x});
    if(lista&&lista.length)LOCAIS=lista;Object.keys(L).forEach(id=>{if(!LOCAIS.some(l=>l.id===id))LOCAIS.push({id,nome:id})});estLocais=L;combinarEstoque();lsEst();renderAll()},()=>{});
  db.collection('sinais').onSnapshot(snap=>{const S={};snap.docs.forEach(d=>{if(d.exists)S[d.id]=JSON.parse(JSON.stringify(d.data()))});SINAIS=S;renderAll()},()=>{});
  db.doc('cfg/pagamento').onSnapshot(s=>{if(s.exists){CFG_PAG=Object.assign({forn:{}},JSON.parse(JSON.stringify(s.data())));try{localStorage.setItem('ciab-pag',JSON.stringify(CFG_PAG))}catch(x){}renderAll()}},()=>{});
  db.doc('cfg/entradas').onSnapshot(s=>{if(s.exists){const x=JSON.parse(JSON.stringify(s.data()));CFG_ENT=Object.assign({fonte:'planilha',ignorar:[]},x);applyNotas();renderAll()}},()=>{});
  setTimeout(()=>puxarXmlsBling(),4000);setTimeout(()=>blStatus(),2500);
  db.doc('bling/precos').onSnapshot(s=>{BL.precos=s.exists?JSON.parse(JSON.stringify(s.data())):null;if(!$('#tab-produtos').hidden&&PD.cur)pdPainel()},()=>{});
  db.collection('pedidos').onSnapshot(snap=>{const P={};snap.docs.forEach(d=>{if(d.exists)P[d.id]=JSON.parse(JSON.stringify(d.data()))});pedidos=P;EMPENHO=null;lsPed();renderAll()},()=>{});
  db.collection('vendas').onSnapshot(snap=>{const L={};snap.docs.forEach(d=>{if(!d.exists)return;const x=d.data();const l=L[x.lote]||(L[x.lote]={arquivo:x.arquivo,importado:x.importado,partes:x.partes,empresa:x.empresa||'',serie:x.serie||'',linhas:[],_p:{}});l._p[x.parte]=x.linhas});
    Object.values(L).forEach(l=>{Object.keys(l._p).sort((a,b)=>a-b).forEach(k=>l._p[k].forEach(r=>l.linhas.push(r)));delete l._p});
    if(snap.empty&&Object.keys(vendasLotes).length)return;vendasLotes=L;lsVE();renderAll()},()=>{});
  db.collection('notas').onSnapshot(snap=>{
    if(snap.empty){const ks=Object.keys(notas).filter(k=>userDoc(k)).concat([...REMOV]);if(ks.length){ks.forEach(k=>saveNota(k));return}}
    const user={};snap.docs.forEach(doc=>{if(doc.exists)user[doc.id]=JSON.parse(JSON.stringify(doc.data()))});
    qN.forEach(k=>{const d=userDoc(k);if(d)user[k]=d});
    const old=notas;notas=mergeNotas(user);Object.keys(notas).forEach(k=>{if(!notas[k].xml&&old[k]&&old[k].xml&&!notas[k].base)notas[k].xml=old[k].xml});
    lsNotas();applyNotas();renderAll();
  },()=>{});
  db.collection('projetos').onSnapshot(snap=>{
    const next={};snap.docs.forEach(doc=>{if(doc.exists)next[doc.id]=JSON.parse(JSON.stringify(doc.data()))});
    // mantém edições locais ainda não enviadas
    Object.keys(timers).concat(Object.keys(EDIT)).forEach(k=>{if(ov[k])next[k]=ov[k]});
    if(snap.empty&&Object.keys(ov).length){Object.keys(ov).forEach(k=>persist(k));return}
    ov=next;lsSave();
    const active=document.activeElement;if(active&&active.closest&&active.closest('#editor')&&active.tagName==='INPUT')return;
    renderAll();
  },()=>{setSave('warn','Sem conexão — salvo neste navegador');db=null});
}catch(e){}})();
})();
