var STORE_PRODUCTS='estoque:products', STORE_LOTS='estoque:lots', STORE_MOV='estoque:movements', STORE_SETTINGS='estoque:settings';
var state={products:[],lots:[],movements:[],settings:{alertDays:[30,15,7,3,1],estoqueMinimoPadrao:5,tema:'claro',nomeUsuario:'',moeda:'BRL'}};
var currentView='dashboard';
var openLotProduct=null;
var searchQuery='';
var estoqueFilter='todos';

function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
function todayISO(){var d=new Date();return d.toISOString().slice(0,10);}
function daysUntil(dateStr){var t=new Date(todayISO()+'T00:00:00');var d=new Date(dateStr+'T00:00:00');return Math.round((d-t)/86400000);}
function fmtDate(dateStr){if(!dateStr)return '-';var p=dateStr.split('-');return p[2]+'/'+p[1]+'/'+p[0];}
function currSymbol(){return state.settings.moeda==='USD'?'US$':state.settings.moeda==='EUR'?'€':'R$';}
function fmtMoney(v){v=isFinite(v)?v:0;return currSymbol()+' '+v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function toast(msg){var t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.remove();},2200);}
function esc(s){return (s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

async function loadAll(){
  try{var p=await window.storage.get(STORE_PRODUCTS,false);state.products=p?JSON.parse(p.value):[];}catch(e){state.products=[];}
  try{var l=await window.storage.get(STORE_LOTS,false);state.lots=l?JSON.parse(l.value):[];}catch(e){state.lots=[];}
  try{var m=await window.storage.get(STORE_MOV,false);state.movements=m?JSON.parse(m.value):[];}catch(e){state.movements=[];}
  try{var s=await window.storage.get(STORE_SETTINGS,false);if(s)state.settings=Object.assign(state.settings,JSON.parse(s.value));}catch(e){}
  applyTheme();
  render();
}
async function saveProducts(){try{await window.storage.set(STORE_PRODUCTS,JSON.stringify(state.products),false);}catch(e){toast('Erro ao salvar produtos');}}
async function saveLots(){try{await window.storage.set(STORE_LOTS,JSON.stringify(state.lots),false);}catch(e){toast('Erro ao salvar lotes');}}
async function saveMovements(){try{await window.storage.set(STORE_MOV,JSON.stringify(state.movements),false);}catch(e){toast('Erro ao salvar histórico');}}
async function saveSettings(){try{await window.storage.set(STORE_SETTINGS,JSON.stringify(state.settings),false);}catch(e){toast('Erro ao salvar config');}}

function applyTheme(){
  document.body.setAttribute('data-theme', state.settings.tema==='escuro'?'dark':'light');
  document.getElementById('themeBtn').innerHTML = state.settings.tema==='escuro' ? '&#9728;' : '&#9789;';
  var nm=state.settings.nomeUsuario||'Meu Estoque';
  document.getElementById('appTitleH').textContent = state.settings.nomeUsuario ? state.settings.nomeUsuario+'s Estoque' : 'Meu Estoque';
  document.getElementById('brandMark').textContent = nm.slice(0,2).toUpperCase();
  document.getElementById('todayLabel').textContent = new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'});
}
function toggleTheme(){state.settings.tema = state.settings.tema==='escuro'?'claro':'escuro';applyTheme();saveSettings();}

function productLots(pid){return state.lots.filter(function(l){return l.productId===pid;});}
function activeLotsFEFO(pid){return productLots(pid).filter(function(l){return l.quantidade>0;}).sort(function(a,b){return a.dataValidade<b.dataValidade?-1:1;});}
function productQty(pid){return productLots(pid).reduce(function(s,l){return s+l.quantidade;},0);}
function nearestExpiry(pid){var lots=activeLotsFEFO(pid);return lots.length?lots[0].dataValidade:null;}
function expiryStatus(dateStr){if(!dateStr)return 'ok';var d=daysUntil(dateStr);if(d<0)return 'danger';if(d<=7)return 'warn';return 'ok';}
function statusLabel(dateStr){if(!dateStr)return 'Sem validade';var d=daysUntil(dateStr);if(d<0)return 'Vencido há '+Math.abs(d)+'d';if(d===0)return 'Vence hoje';return 'Vence em '+d+'d';}

function setView(v){currentView=v;document.querySelectorAll('.nav-item').forEach(function(n){n.classList.toggle('active',n.dataset.v===v);});document.getElementById('view').scrollTop=0;window.scrollTo(0,0);render();}

function render(){
  var v=document.getElementById('view');
  var fab=document.getElementById('fabBtn');
  fab.style.display='none';
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.toggle('active',n.dataset.v===currentView);});
  if(currentView==='dashboard'){v.innerHTML=renderDashboard();setTimeout(drawDashboardChart,30);}
  else if(currentView==='estoque'){v.innerHTML=renderEstoque();fab.style.display='flex';fab.onclick=function(){openProductForm();};}
  else if(currentView==='financeiro'){v.innerHTML=renderFinanceiro();setTimeout(drawFinanceCharts,30);}
  else if(currentView==='relatorios'){v.innerHTML=renderRelatorios();}
  else if(currentView==='config'){v.innerHTML=renderConfig();}
}

function renderDashboard(){
  var totalProdutos=state.products.length;
  var totalQtd=state.lots.reduce(function(s,l){return s+l.quantidade;},0);
  var proximos=[],vencidos=[],baixos=[];
  state.products.forEach(function(p){
    var q=productQty(p.id);
    if(q<=p.estoqueMinimo) baixos.push(p);
  });
  state.lots.forEach(function(l){
    if(l.quantidade<=0)return;
    var d=daysUntil(l.dataValidade);
    if(d<0) vencidos.push(l);
    else if(d<=7) proximos.push(l);
  });
  var valorInvestido=state.lots.reduce(function(s,l){return s+(l.quantidade*(l.valorCompra/(l.quantidadeInicial||1)));},0);
  var totVendido=state.movements.filter(function(m){return m.type==='saida'&&m.motivo==='venda';}).reduce(function(s,m){return s+m.valor;},0);
  var totGasto=state.lots.reduce(function(s,l){return s+l.valorCompra;},0);
  var valorPerdido=state.movements.filter(function(m){return m.type==='saida'&&m.motivo==='perda';}).reduce(function(s,m){return s+m.valor;},0);
  var lucro=totVendido-totGasto-valorPerdido;

  var alertsHtml='';
  var allAlerts=vencidos.map(function(l){return {lot:l,st:'danger'};}).concat(proximos.map(function(l){return {lot:l,st:'warn'};}));
  if(allAlerts.length===0 && baixos.length===0){
    alertsHtml='<div class="empty">Nenhum alerta no momento. Tudo em dia.</div>';
  }else{
    allAlerts.slice(0,6).forEach(function(a){
      var p=state.products.find(function(x){return x.id===a.lot.productId;});
      alertsHtml+='<div class="alert-row"><span class="dot '+a.st+'"></span><div class="txt"><div class="n">'+esc(p?p.nome:'?')+'</div><div class="s">Lote '+esc(a.lot.numero)+' &middot; '+statusLabel(a.lot.dataValidade)+'</div></div></div>';
    });
    baixos.slice(0,4).forEach(function(p){
      alertsHtml+='<div class="alert-row"><span class="dot warn"></span><div class="txt"><div class="n">'+esc(p.nome)+'</div><div class="s">Estoque baixo &middot; '+productQty(p.id)+' '+esc(p.unidade)+'</div></div></div>';
    });
  }

  return ''+
  '<div class="grid2 section-title" style="margin-top:8px;"></div>'+
  '<div class="grid2">'+
    metric('Produtos cadastrados',totalProdutos,'')+
    metric('Itens em estoque',totalQtd,'')+
    metric('Próx. do vencimento',proximos.length,proximos.length?'warn':'')+
    metric('Vencidos',vencidos.length,vencidos.length?'danger':'')+
    metric('Estoque baixo',baixos.length,baixos.length?'warn':'')+
    metric('Valor investido',fmtMoney(valorInvestido),'')+
  '</div>'+
  '<div class="section-title">Financeiro resumido</div>'+
  '<div class="grid2">'+
    metric('Total vendido',fmtMoney(totVendido),'ok')+
    metric('Lucro',fmtMoney(lucro),lucro>=0?'ok':'danger')+
    metric('Perdido por vencimento',fmtMoney(valorPerdido),valorPerdido>0?'danger':'')+
    metric('Total gasto',fmtMoney(totGasto),'')+
  '</div>'+
  '<div class="section-title">Movimentação (últimos 14 dias)</div>'+
  '<div class="card"><div class="chart-wrap"><canvas id="dashChart" role="img" aria-label="Gráfico de entradas e saídas de estoque nos últimos 14 dias">Movimentação recente de estoque.</canvas></div></div>'+
  '<div class="section-title">Alertas</div>'+
  '<div class="card">'+alertsHtml+'</div>';
}
function metric(label,value,cls){return '<div class="metric"><div class="label">'+label+'</div><div class="value '+(cls||'')+'">'+value+'</div></div>';}

function drawDashboardChart(){
  var el=document.getElementById('dashChart');if(!el||typeof Chart==='undefined')return;
  var days=[],entradas=[],saidas=[];
  for(var i=13;i>=0;i--){
    var d=new Date();d.setDate(d.getDate()-i);
    var iso=d.toISOString().slice(0,10);
    days.push(iso.slice(8,10)+'/'+iso.slice(5,7));
    var ent=state.movements.filter(function(m){return m.type==='entrada'&&m.data===iso;}).reduce(function(s,m){return s+m.quantidade;},0);
    var sai=state.movements.filter(function(m){return m.type==='saida'&&m.data===iso;}).reduce(function(s,m){return s+m.quantidade;},0);
    entradas.push(ent);saidas.push(sai);
  }
  if(window._dashChartObj)window._dashChartObj.destroy();
  window._dashChartObj=new Chart(el,{type:'bar',data:{labels:days,datasets:[
    {label:'Entradas',data:entradas,backgroundColor:'#1F6F5C',borderRadius:4},
    {label:'Saídas',data:saidas,backgroundColor:'#D64545',borderRadius:4}
  ]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{precision:0}}},plugins:{legend:{display:true,position:'top',labels:{boxWidth:10,font:{size:11}}}}}});
}

function renderEstoque(){
  var filtered=state.products.filter(function(p){
    var q=searchQuery.toLowerCase();
    var matchQ=!q || p.nome.toLowerCase().indexOf(q)>-1 || (p.categoria||'').toLowerCase().indexOf(q)>-1 || productLots(p.id).some(function(l){return l.numero.toLowerCase().indexOf(q)>-1;});
    if(!matchQ)return false;
    if(estoqueFilter==='baixo') return productQty(p.id)<=p.estoqueMinimo;
    if(estoqueFilter==='vencendo') return activeLotsFEFO(p.id).some(function(l){var d=daysUntil(l.dataValidade);return d<=7&&d>=0;});
    if(estoqueFilter==='vencido') return activeLotsFEFO(p.id).some(function(l){return daysUntil(l.dataValidade)<0;});
    return true;
  });
  var html='<div class="searchbar"><input id="estoqueSearch" placeholder="Buscar por nome, categoria, lote..." value="'+esc(searchQuery)+'" oninput="searchQuery=this.value;render();"></div>';
  html+='<div class="chip-row">'+
    chip('todos','Todos')+chip('baixo','Estoque baixo')+chip('vencendo','Vencendo')+chip('vencido','Vencidos')+
  '</div>';
  if(filtered.length===0){
    html+='<div class="card"><div class="empty">Nenhum produto encontrado.<br>Toque em + para cadastrar o primeiro.</div></div>';
  }else{
    filtered.forEach(function(p){html+=renderProductCard(p);});
  }
  return html;
}
function chip(val,label){return '<div class="chip '+(estoqueFilter===val?'active':'')+'" onclick="estoqueFilter=\''+val+'\';render();">'+label+'</div>';}

function renderProductCard(p){
  var q=productQty(p.id);
  var exp=nearestExpiry(p.id);
  var st=expiryStatus(exp);
  var isOpen=openLotProduct===p.id;
  var lotsArr=productLots(p.id).sort(function(a,b){return a.dataValidade<b.dataValidade?-1:1;});
  var badge=q<=p.estoqueMinimo?'<span class="badge warn">Estoque baixo</span>':(st==='danger'?'<span class="badge danger">Vencido</span>':(st==='warn'?'<span class="badge warn">Vence em breve</span>':'<span class="badge ok">Em dia</span>'));
  var html='<div class="product-card">';
  html+='<div class="product-head" onclick="openLotProduct=openLotProduct===\''+p.id+'\'?null:\''+p.id+'\';render();">';
  html+='<div class="thumb">'+(p.foto?'<img src="'+p.foto+'">':'&#128230;')+'</div>';
  html+='<div class="info"><div class="n">'+esc(p.nome)+'</div><div class="m">'+esc(p.categoria||'Sem categoria')+'</div>'+badge+'</div>';
  html+='<div class="qty"><div class="q">'+q+' '+esc(p.unidade)+'</div><div style="font-size:10.5px;color:var(--ink-soft);">'+(exp?statusLabel(exp):'sem lote')+'</div></div>';
  html+='</div>';
  html+='<div class="lots '+(isOpen?'open':'')+'">';
  if(lotsArr.length===0){html+='<div class="empty" style="padding:14px 0;">Nenhum lote cadastrado.</div>';}
  lotsArr.forEach(function(l){
    var lst=expiryStatus(l.dataValidade);
    html+='<div class="lot-tag '+lst+'"><div class="li"><div class="num">Lote '+esc(l.numero)+'</div><div class="exp">'+fmtDate(l.dataValidade)+' &middot; '+statusLabel(l.dataValidade)+'</div></div><div class="lq">'+l.quantidade+'</div></div>';
  });
  html+='<div class="lot-actions">';
  html+='<button class="btn btn-outline-accent" onclick="event.stopPropagation();openEntradaForm(\''+p.id+'\')">+ Entrada</button>';
  html+='<button class="btn" onclick="event.stopPropagation();openSaidaForm(\''+p.id+'\')">Saída</button>';
  html+='</div>';
  html+='<div class="lot-actions">';
  html+='<button class="btn" style="width:100%;" onclick="event.stopPropagation();openProductForm(\''+p.id+'\')">Editar produto</button>';
  html+='</div>';
  html+='</div>';
  html+='</div>';
  return html;
}

function openSearch(){setView('estoque');setTimeout(function(){var el=document.getElementById('estoqueSearch');if(el)el.focus();},50);}

function openModal(title,bodyHtml){
  var root=document.getElementById('modalRoot');
  root.innerHTML='<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal">'+
    '<div class="modal-head"><h2>'+title+'</h2><div class="close-x" onclick="closeModal()">&times;</div></div>'+
    bodyHtml+
  '</div></div>';
}
function closeModal(){document.getElementById('modalRoot').innerHTML='';}

function openProductForm(pid,prefill){
  var p=pid?state.products.find(function(x){return x.id===pid;}):null;
  var pf=prefill||{};
  var loteFields='';
  if(!p){
    loteFields=
    '<label>Número do lote *</label><input id="f_lote_num" placeholder="Ex: L-001, impresso na embalagem">'+
    '<div class="row2"><div><label>Quantidade inicial *</label><input id="f_lote_qtd" type="number" min="0" step="0.01" value="'+(pf.quantidade||'')+'"></div>'+
    '<div><label>Valor de compra (total do lote)</label><input id="f_lote_valor" type="number" min="0" step="0.01" value="'+(pf.valorTotalLote||'')+'"></div></div>'+
    '<div class="row2"><div><label>Data de fabricação *</label><input id="f_lote_fab" type="date"></div>'+
    '<div><label>Data de validade *</label><input id="f_lote_val" type="date"></div></div>';
  }
  var body='<div id="prodForm">'+
    (prefill?'<div class="help-note">Dados lidos da nota — confira antes de salvar e complete o que faltar.</div>':'')+
    '<label>Nome do produto *</label><input id="f_nome" value="'+esc(p?p.nome:(pf.nome||''))+'" placeholder="Ex: Arroz 5kg">'+
    '<div class="row2"><div><label>Categoria</label><input id="f_categoria" value="'+esc(p?p.categoria:(pf.categoria||''))+'" placeholder="Ex: Grãos"></div>'+
    '<div><label>Marca</label><input id="f_marca" value="'+esc(p?p.marca:(pf.marca||''))+'" placeholder="Opcional"></div></div>'+
    '<div class="row2"><div><label>Unidade de medida</label><input id="f_unidade" value="'+esc(p?p.unidade:(pf.unidade||'un'))+'" placeholder="un, kg, L..."></div>'+
    '<div><label>Estoque mínimo</label><input id="f_min" type="number" min="0" value="'+(p?p.estoqueMinimo:state.settings.estoqueMinimoPadrao)+'"></div></div>'+
    '<div class="row2"><div><label>Preço de compra (unitário)</label><input id="f_pcompra" type="number" min="0" step="0.01" value="'+(p?p.precoCompra:(pf.precoCompra||''))+'"></div>'+
    '<div><label>Preço de venda</label><input id="f_pvenda" type="number" min="0" step="0.01" value="'+(p?p.precoVenda:'')+'"></div></div>'+
    (p?'':'<div class="section-title" style="margin:16px 0 6px;">Primeiro lote deste produto</div>'+loteFields)+
    '<label>Foto do produto</label>'+
    '<div class="photo-input"><div class="photo-preview" id="photoPreview">'+(p&&p.foto?'<img src="'+p.foto+'">':'&#128247;')+'</div><input type="file" accept="image/*" id="f_foto" style="width:auto;flex:1;"></div>'+
    '<label>Observações</label><textarea id="f_obs" rows="2" placeholder="Opcional">'+esc(p?p.observacoes:'')+'</textarea>'+
    '<div class="btn-row" style="margin-top:16px;">'+
    (p?'<button class="btn btn-danger-o" onclick="deleteProduct(\''+p.id+'\')">Excluir</button>':'')+
    '<button class="btn btn-accent" onclick="saveProductForm('+(p?'\''+p.id+'\'':'null')+')">Salvar produto</button>'+
    '</div></div>';
  openModal(p?'Editar produto':'Novo produto',body);
  var photoData=p&&p.foto?p.foto:null;
  document.getElementById('f_foto').onchange=function(e){
    var file=e.target.files[0];if(!file)return;
    var reader=new FileReader();
    reader.onload=function(ev){photoData=ev.target.result;document.getElementById('photoPreview').innerHTML='<img src="'+photoData+'">';};
    reader.readAsDataURL(file);
  };
  window._pendingPhoto=function(){return photoData;};
}
async function saveProductForm(pid){
  var nome=document.getElementById('f_nome').value.trim();
  if(!nome){toast('Informe o nome do produto');return;}
  var data={
    nome:nome,
    categoria:document.getElementById('f_categoria').value.trim(),
    marca:document.getElementById('f_marca').value.trim(),
    unidade:document.getElementById('f_unidade').value.trim()||'un',
    estoqueMinimo:parseFloat(document.getElementById('f_min').value)||0,
    precoCompra:parseFloat(document.getElementById('f_pcompra').value)||0,
    precoVenda:parseFloat(document.getElementById('f_pvenda').value)||0,
    observacoes:document.getElementById('f_obs').value.trim(),
    foto:window._pendingPhoto?window._pendingPhoto():null
  };
  if(pid){
    var idx=state.products.findIndex(function(x){return x.id===pid;});
    state.products[idx]=Object.assign(state.products[idx],data);
    await saveProducts();
    closeModal();render();toast('Produto salvo');
    return;
  }
  var loteNum=document.getElementById('f_lote_num').value.trim();
  var loteQtd=parseFloat(document.getElementById('f_lote_qtd').value);
  var loteFab=document.getElementById('f_lote_fab').value;
  var loteVal=document.getElementById('f_lote_val').value;
  if(!loteNum||!loteQtd||loteQtd<=0){toast('Informe o número do lote e a quantidade inicial');return;}
  if(!loteFab){toast('Informe a data de fabricação');return;}
  if(!loteVal){toast('Informe a data de validade');return;}
  data.id=uid();
  state.products.push(data);
  var lot={id:uid(),productId:data.id,numero:loteNum,quantidade:loteQtd,quantidadeInicial:loteQtd,
    dataEntrada:todayISO(),dataFabricacao:loteFab,dataValidade:loteVal,
    valorCompra:parseFloat(document.getElementById('f_lote_valor').value)||0,observacoes:''};
  state.lots.push(lot);
  state.movements.push({id:uid(),type:'entrada',productId:data.id,lotId:lot.id,quantidade:loteQtd,valor:lot.valorCompra,data:todayISO(),timestamp:Date.now()});
  await saveProducts();await saveLots();await saveMovements();
  closeModal();render();toast('Produto e lote salvos');
}
async function deleteProduct(pid){
  if(!confirm('Excluir este produto e todos os seus lotes?'))return;
  state.products=state.products.filter(function(x){return x.id!==pid;});
  state.lots=state.lots.filter(function(x){return x.productId!==pid;});
  await saveProducts();await saveLots();
  closeModal();render();toast('Produto excluído');
}

function openEntradaForm(pid){
  var p=state.products.find(function(x){return x.id===pid;});
  var body='<div>'+
    '<div class="help-note">Produto: <strong>'+esc(p.nome)+'</strong></div>'+
    '<label>Número do lote *</label><input id="e_num" placeholder="Ex: L-001, impresso na embalagem">'+
    '<div class="row2"><div><label>Quantidade *</label><input id="e_qtd" type="number" min="0" step="0.01"></div>'+
    '<div><label>Valor pago (total)</label><input id="e_valor" type="number" min="0" step="0.01"></div></div>'+
    '<div class="row2"><div><label>Data de fabricação *</label><input id="e_fab" type="date"></div>'+
    '<div><label>Data de validade *</label><input id="e_val" type="date"></div></div>'+
    '<label>Data de entrada no estoque</label><input id="e_ent" type="date" value="'+todayISO()+'">'+
    '<label>Observações do lote</label><textarea id="e_obs" rows="2"></textarea>'+
    '<button class="btn btn-accent" style="margin-top:16px;" onclick="saveEntrada(\''+pid+'\')">Registrar entrada</button>'+
    '</div>';
  openModal('Entrada de estoque',body);
}
async function saveEntrada(pid){
  var numero=document.getElementById('e_num').value.trim();
  var qtd=parseFloat(document.getElementById('e_qtd').value);
  var fab=document.getElementById('e_fab').value;
  var val=document.getElementById('e_val').value;
  if(!numero||!qtd||qtd<=0){toast('Informe lote e quantidade válida');return;}
  if(!fab){toast('Informe a data de fabricação');return;}
  if(!val){toast('Informe a data de validade');return;}
  var lot={id:uid(),productId:pid,numero:numero,quantidade:qtd,quantidadeInicial:qtd,
    dataEntrada:document.getElementById('e_ent').value||todayISO(),
    dataFabricacao:fab,
    dataValidade:val,
    valorCompra:parseFloat(document.getElementById('e_valor').value)||0,
    observacoes:document.getElementById('e_obs').value.trim()};
  state.lots.push(lot);
  state.movements.push({id:uid(),type:'entrada',productId:pid,lotId:lot.id,quantidade:qtd,valor:lot.valorCompra,data:todayISO(),timestamp:Date.now()});
  await saveLots();await saveMovements();
  closeModal();render();toast('Entrada registrada');
}

function openSaidaForm(pid){
  var p=state.products.find(function(x){return x.id===pid;});
  var q=productQty(p.id);
  var body='<div>'+
    '<div class="help-note">Produto: <strong>'+esc(p.nome)+'</strong> &middot; disponível: '+q+' '+esc(p.unidade)+'<br>A saída usa primeiro o lote que vence mais cedo (FEFO).</div>'+
    '<label>Quantidade *</label><input id="s_qtd" type="number" min="0" step="0.01" max="'+q+'">'+
    '<label>Motivo</label><select id="s_motivo"><option value="venda">Venda</option><option value="uso">Uso próprio</option><option value="perda">Perda</option><option value="ajuste">Ajuste</option></select>'+
    '<button class="btn btn-accent" style="margin-top:16px;" onclick="saveSaida(\''+pid+'\')">Registrar saída</button>'+
    '</div>';
  openModal('Saída de estoque',body);
}
async function saveSaida(pid){
  var p=state.products.find(function(x){return x.id===pid;});
  var qtd=parseFloat(document.getElementById('s_qtd').value);
  var motivo=document.getElementById('s_motivo').value;
  var disponivel=productQty(pid);
  if(!qtd||qtd<=0){toast('Informe uma quantidade válida');return;}
  if(qtd>disponivel){toast('Quantidade maior que o estoque disponível');return;}
  var restante=qtd;
  var lots=activeLotsFEFO(pid);
  var valorTotal=0;
  for(var i=0;i<lots.length&&restante>0;i++){
    var l=state.lots.find(function(x){return x.id===lots[i].id;});
    var usar=Math.min(l.quantidade,restante);
    var custoUnit=l.valorCompra/(l.quantidadeInicial||1);
    if(motivo==='venda') valorTotal += usar*p.precoVenda;
    else if(motivo==='perda') valorTotal += usar*custoUnit;
    else valorTotal += usar*custoUnit;
    l.quantidade -= usar;
    restante -= usar;
  }
  state.movements.push({id:uid(),type:'saida',productId:pid,quantidade:qtd,motivo:motivo,valor:valorTotal,data:todayISO(),timestamp:Date.now()});
  await saveLots();await saveMovements();
  closeModal();render();toast('Saída registrada');
}

function renderFinanceiro(){
  var totVendido=state.movements.filter(function(m){return m.type==='saida'&&m.motivo==='venda';}).reduce(function(s,m){return s+m.valor;},0);
  var totGasto=state.lots.reduce(function(s,l){return s+l.valorCompra;},0);
  var valorPerdido=state.movements.filter(function(m){return m.type==='saida'&&m.motivo==='perda';}).reduce(function(s,m){return s+m.valor;},0);
  var lucro=totVendido-totGasto-valorPerdido;
  var perdas=state.movements.filter(function(m){return m.type==='saida'&&m.motivo==='perda';}).sort(function(a,b){return b.timestamp-a.timestamp;});

  var html='<div class="grid2">'+
    metric('Total vendido',fmtMoney(totVendido),'ok')+
    metric('Total gasto (compras)',fmtMoney(totGasto),'')+
    metric('Perdido por vencimento',fmtMoney(valorPerdido),valorPerdido>0?'danger':'')+
    metric('Lucro',fmtMoney(lucro),lucro>=0?'ok':'danger')+
  '</div>';
  html+='<div class="section-title">Receita por mês</div>';
  html+='<div class="card"><div class="chart-wrap"><canvas id="finChart1" role="img" aria-label="Gráfico de receita mensal">Receita mensal de vendas.</canvas></div></div>';
  html+='<div class="section-title">Gasto por categoria</div>';
  html+='<div class="card"><div class="chart-wrap"><canvas id="finChart2" role="img" aria-label="Gráfico de gastos por categoria de produto">Gastos de compra por categoria.</canvas></div></div>';
  html+='<div class="section-title">Relatório de perdas</div>';
  html+='<div class="card">';
  if(perdas.length===0){html+='<div class="empty">Nenhuma perda registrada.</div>';}
  else{
    perdas.slice(0,10).forEach(function(m){
      var p=state.products.find(function(x){return x.id===m.productId;});
      html+='<div class="alert-row"><span class="dot danger"></span><div class="txt"><div class="n">'+esc(p?p.nome:'?')+'</div><div class="s">'+m.quantidade+' '+esc(p?p.unidade:'')+' &middot; '+fmtDate(m.data)+'</div></div><div style="font-family:var(--font-mono);font-size:13px;color:var(--danger);">-'+fmtMoney(m.valor)+'</div></div>';
    });
    var totalEstoqueVal=state.lots.reduce(function(s,l){return s+l.valorCompra;},0)||1;
    var pct=(valorPerdido/totalEstoqueVal*100).toFixed(1);
    html+='<div style="margin-top:8px;font-size:12px;color:var(--ink-soft);">Percentual de perda sobre o valor total investido: <strong style="color:var(--ink);">'+pct+'%</strong></div>';
  }
  html+='</div>';
  return html;
}
function drawFinanceCharts(){
  if(typeof Chart==='undefined')return;
  var months=[],revenue=[];
  var now=new Date();
  for(var i=5;i>=0;i--){
    var d=new Date(now.getFullYear(),now.getMonth()-i,1);
    var key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    months.push(d.toLocaleDateString('pt-BR',{month:'short'}));
    var rev=state.movements.filter(function(m){return m.type==='saida'&&m.motivo==='venda'&&m.data.slice(0,7)===key;}).reduce(function(s,m){return s+m.valor;},0);
    revenue.push(Math.round(rev*100)/100);
  }
  var el1=document.getElementById('finChart1');
  if(el1){
    if(window._finChart1)window._finChart1.destroy();
    window._finChart1=new Chart(el1,{type:'line',data:{labels:months,datasets:[{label:'Receita',data:revenue,borderColor:'#1F6F5C',backgroundColor:'rgba(31,111,92,0.1)',fill:true,tension:0.3,pointRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
  }
  var catMap={};
  state.lots.forEach(function(l){
    var p=state.products.find(function(x){return x.id===l.productId;});
    var cat=(p&&p.categoria)?p.categoria:'Outros';
    catMap[cat]=(catMap[cat]||0)+l.valorCompra;
  });
  var catLabels=Object.keys(catMap);
  var catVals=catLabels.map(function(k){return Math.round(catMap[k]*100)/100;});
  var palette=['#1F6F5C','#D69A2D','#378ADD','#D85A30','#7F77DD','#639922'];
  var el2=document.getElementById('finChart2');
  if(el2){
    if(window._finChart2)window._finChart2.destroy();
    if(catLabels.length===0){el2.parentElement.innerHTML='<div class="empty">Sem dados de compra ainda.</div>';}
    else{
      window._finChart2=new Chart(el2,{type:'bar',data:{labels:catLabels,datasets:[{data:catVals,backgroundColor:catLabels.map(function(_,i){return palette[i%palette.length];}),borderRadius:4}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}}});
    }
  }
}

var relatorioTab='historico';
function renderRelatorios(){
  var html='<div class="tabs">'+
    tab('historico','Histórico')+tab('exportar','Exportar')+
  '</div>';
  if(relatorioTab==='historico'){
    var moves=state.movements.slice().sort(function(a,b){return b.timestamp-a.timestamp;});
    html+='<div class="card">';
    if(moves.length===0){html+='<div class="empty">Nenhuma movimentação registrada ainda.</div>';}
    moves.slice(0,60).forEach(function(m){
      var p=state.products.find(function(x){return x.id===m.productId;});
      var cls=m.type==='entrada'?'entrada':(m.motivo==='venda'?'venda':(m.motivo==='perda'?'perda':'ajuste'));
      var icon=m.type==='entrada'?'&#8595;':(m.motivo==='venda'?'&#128181;':(m.motivo==='perda'?'&#9888;':'&#8644;'));
      var label=m.type==='entrada'?'Entrada':(m.motivo==='venda'?'Venda':m.motivo==='perda'?'Perda':m.motivo==='uso'?'Uso próprio':'Ajuste');
      html+='<div class="hist-row"><div class="hist-icon '+cls+'">'+icon+'</div><div class="t"><div class="n">'+esc(p?p.nome:'?')+' &middot; '+label+'</div><div class="s">'+fmtDate(m.data)+' &middot; '+m.quantidade+' '+esc(p?p.unidade:'')+'</div></div><div class="v" style="color:'+(m.type==='entrada'?'var(--ink-soft)':(m.motivo==='venda'?'var(--ok)':'var(--danger)'))+'">'+(m.type==='entrada'?fmtMoney(m.valor):(m.motivo==='venda'?'+':'-')+fmtMoney(m.valor))+'</div></div>';
    });
    html+='</div>';
  }else{
    html+='<div class="card">'+
      '<div class="card-title">Exportar dados</div>'+
      '<p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 12px;">Gera uma planilha CSV (abre no Excel/Google Sheets) com todas as movimentações.</p>'+
      '<div class="btn-row"><button class="btn btn-accent" onclick="exportCSV()">Exportar CSV</button><button class="btn" onclick="window.print()">Gerar PDF</button></div>'+
      '<div class="help-note">"Gerar PDF" abre a janela de impressão do navegador — escolha "Salvar como PDF" no destino.</div>'+
    '</div>'+
    '<div class="card">'+
      '<div class="card-title">Relatório por período</div>'+
      '<div class="row2"><div><label>De</label><input type="date" id="rp_de"></div><div><label>Até</label><input type="date" id="rp_ate" value="'+todayISO()+'"></div></div>'+
      '<button class="btn btn-outline-accent" style="margin-top:10px;" onclick="showPeriodReport()">Gerar resumo</button>'+
      '<div id="periodResult"></div>'+
    '</div>';
  }
  return html;
}
function tab(v,label){return '<div class="tab '+(relatorioTab===v?'active':'')+'" onclick="relatorioTab=\''+v+'\';render();">'+label+'</div>';}
function showPeriodReport(){
  var de=document.getElementById('rp_de').value||'0000-01-01';
  var ate=document.getElementById('rp_ate').value||'9999-12-31';
  var moves=state.movements.filter(function(m){return m.data>=de&&m.data<=ate;});
  var entradas=moves.filter(function(m){return m.type==='entrada';});
  var vendas=moves.filter(function(m){return m.motivo==='venda';});
  var perdas=moves.filter(function(m){return m.motivo==='perda';});
  var gasto=entradas.reduce(function(s,m){return s+m.valor;},0);
  var receita=vendas.reduce(function(s,m){return s+m.valor;},0);
  var perda=perdas.reduce(function(s,m){return s+m.valor;},0);
  document.getElementById('periodResult').innerHTML='<div style="margin-top:12px;font-size:13px;">'+
    '<div class="settings-row"><span>Entradas</span><strong>'+entradas.length+' &middot; '+fmtMoney(gasto)+'</strong></div>'+
    '<div class="settings-row"><span>Vendas</span><strong>'+vendas.length+' &middot; '+fmtMoney(receita)+'</strong></div>'+
    '<div class="settings-row"><span>Perdas</span><strong>'+perdas.length+' &middot; '+fmtMoney(perda)+'</strong></div>'+
    '<div class="settings-row"><span>Lucro do período</span><strong>'+fmtMoney(receita-gasto-perda)+'</strong></div>'+
  '</div>';
}
function exportCSV(){
  var rows=[['Data','Tipo','Produto','Lote','Quantidade','Motivo','Valor']];
  state.movements.slice().sort(function(a,b){return a.timestamp-b.timestamp;}).forEach(function(m){
    var p=state.products.find(function(x){return x.id===m.productId;});
    rows.push([m.data,m.type,p?p.nome:'',m.lotId||'',m.quantidade,m.motivo||'',m.valor.toFixed(2)]);
  });
  var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"';}).join(',');}).join('\n');
  var blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='movimentacoes_estoque.csv';a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado');
}

function renderConfig(){
  var s=state.settings;
  var html='<div class="card">'+
    '<div class="card-title">Perfil</div>'+
    '<label>Nome do usuário</label><input id="c_nome" value="'+esc(s.nomeUsuario)+'" placeholder="Seu nome">'+
    '<label>Moeda</label><select id="c_moeda"><option value="BRL"'+(s.moeda==='BRL'?' selected':'')+'>Real (R$)</option><option value="USD"'+(s.moeda==='USD'?' selected':'')+'>Dólar (US$)</option><option value="EUR"'+(s.moeda==='EUR'?' selected':'')+'>Euro (€)</option></select>'+
  '</div>'+
  '<div class="card">'+
    '<div class="card-title">Estoque</div>'+
    '<label>Estoque mínimo padrão para novos produtos</label><input id="c_min" type="number" min="0" value="'+s.estoqueMinimoPadrao+'">'+
    '<label>Dias de alerta de validade (separados por vírgula)</label><input id="c_dias" value="'+s.alertDays.join(', ')+'">'+
  '</div>'+
  '<div class="card">'+
    '<div class="settings-row"><div class="l"><div class="t">Modo escuro</div><div class="d">Alterna o tema do aplicativo</div></div>'+
    '<label class="switch"><input type="checkbox" id="c_tema" '+(s.tema==='escuro'?'checked':'')+'><span class="slider-tg"></span></label></div>'+
  '</div>'+
  '<button class="btn btn-accent" onclick="saveConfig()">Salvar configurações</button>'+
  '<div class="section-title">Backup</div>'+
  '<div class="card">'+
    '<p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 12px;">Seus dados ficam salvos automaticamente neste dispositivo/conta. Use os botões abaixo para ter uma cópia extra ou mover os dados para outro lugar.</p>'+
    '<div class="btn-row"><button class="btn" onclick="exportBackup()">Exportar backup (.json)</button></div>'+
    '<label style="margin-top:12px;">Restaurar de um arquivo de backup</label>'+
    '<input type="file" accept="application/json" id="c_restore" style="width:auto;">'+
  '</div>'+
  '<div class="help-note">Este protótipo roda no navegador. Sincronização automática na nuvem, notificações push nativas e leitura de código de barras pela câmera exigem o app nativo (Flutter) — posso gerar esse código-fonte quando você quiser avançar para a versão nativa.</div>';
  return html;
}
async function saveConfig(){
  state.settings.nomeUsuario=document.getElementById('c_nome').value.trim();
  state.settings.moeda=document.getElementById('c_moeda').value;
  state.settings.estoqueMinimoPadrao=parseFloat(document.getElementById('c_min').value)||0;
  state.settings.alertDays=document.getElementById('c_dias').value.split(',').map(function(x){return parseInt(x.trim());}).filter(function(x){return !isNaN(x);});
  state.settings.tema=document.getElementById('c_tema').checked?'escuro':'claro';
  await saveSettings();
  applyTheme();
  toast('Configurações salvas');
}
function exportBackup(){
  var data={products:state.products,lots:state.lots,movements:state.movements,settings:state.settings};
  var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='backup_meu_estoque.json';a.click();
  URL.revokeObjectURL(url);
  toast('Backup exportado');
}
document.addEventListener('change',function(e){
  if(e.target && e.target.id==='c_restore'){
    var file=e.target.files[0];if(!file)return;
    var reader=new FileReader();
    reader.onload=async function(ev){
      try{
        var data=JSON.parse(ev.target.result);
        state.products=data.products||[];state.lots=data.lots||[];state.movements=data.movements||[];
        state.settings=Object.assign(state.settings,data.settings||{});
        await saveProducts();await saveLots();await saveMovements();await saveSettings();
        applyTheme();render();toast('Backup restaurado');
      }catch(err){toast('Arquivo de backup inválido');}
    };
    reader.readAsText(file);
  }
});

loadAll();
