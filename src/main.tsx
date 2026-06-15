import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserQRCodeReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { supabase } from './lib/supabase';
import { BarChart3, Camera, Check, Circle, Copy, FileSearch, Home, ListChecks, ListPlus, PackageSearch, Plus, RefreshCw, Save, Search, ShoppingCart, Trash2 } from 'lucide-react';
import './styles.css';

type Product = { id:string; name:string; category:string|null; default_unit:string|null; last_price:number|null; avg_price:number|null };
type ShoppingList = { id:string; name:string; status:string; store_name?:string|null; predicted_total:number; actual_total:number; created_at?:string };
type ListItem = { id:string; list_id:string; product_id:string|null; product_name:string; quantity:number; unit:string; estimated_unit_price:number; actual_unit_price:number|null; checked:boolean };
type CouponImport = { id:string; qr_url:string; uf:string|null; store_name:string|null; status:string; imported_items:number|null; processed_at:string|null; error_message:string|null; created_at:string };
type PurchaseItem = { id:string; product_id:string|null; product_name:string; store_name:string|null; quantity:number; unit:string; unit_price:number; total_price:number; purchase_date:string; source:string };

const brl = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
const money = (v?:number|null) => brl.format(Number(v || 0));
const norm = (v:string) => v.trim().replace(/\s+/g,' ').toUpperCase();
const fmt = (v?:string|null) => v ? new Date(v).toLocaleDateString('pt-BR') : '';

function App(){
  const [page,setPage] = useState<'inicio'|'listas'|'produtos'|'analises'|'cupons'>('inicio');
  const [products,setProducts] = useState<Product[]>([]);
  const [lists,setLists] = useState<ShoppingList[]>([]);
  const [activeList,setActiveList] = useState<ShoppingList|null>(null);
  const [items,setItems] = useState<ListItem[]>([]);
  const [coupons,setCoupons] = useState<CouponImport[]>([]);
  const [purchases,setPurchases] = useState<PurchaseItem[]>([]);
  const [productSearch,setProductSearch] = useState('');
  const [newListName,setNewListName] = useState('Compra Montserrat');
  const [productName,setProductName] = useState('');
  const [qty,setQty] = useState(1);
  const [unit,setUnit] = useState('un');
  const [price,setPrice] = useState(0);
  const [purchaseProduct,setPurchaseProduct] = useState('');
  const [purchaseQty,setPurchaseQty] = useState(1);
  const [purchaseUnit,setPurchaseUnit] = useState('un');
  const [purchasePrice,setPurchasePrice] = useState(0);
  const [qrUrl,setQrUrl] = useState('');
  const [scanMessage,setScanMessage] = useState('');
  const [importingId,setImportingId] = useState<string|null>(null);

  useEffect(()=>{ loadAll(); },[]);
  useEffect(()=>{ activeList ? loadItems(activeList.id) : setItems([]); },[activeList?.id]);

  async function loadAll(){
    const [p,l,c,pi] = await Promise.all([
      supabase.from('product_price_summary').select('*').order('name'),
      supabase.from('shopping_lists').select('*').order('created_at',{ascending:false}),
      supabase.from('coupon_imports').select('*').order('created_at',{ascending:false}),
      supabase.from('purchase_items').select('*').order('purchase_date',{ascending:false}).limit(500)
    ]);
    if(!p.error) setProducts(p.data || []);
    if(!c.error) setCoupons(c.data || []);
    if(!pi.error) setPurchases(pi.data || []);
    if(!l.error){ const loaded = l.data || []; setLists(loaded); setActiveList(cur => cur || loaded[0] || null); }
  }
  async function loadItems(listId:string){ const {data}=await supabase.from('shopping_list_items').select('*').eq('list_id',listId).order('created_at'); setItems(data||[]); }
  async function loadCoupons(){ const {data}=await supabase.from('coupon_imports').select('*').order('created_at',{ascending:false}); setCoupons(data||[]); }
  async function createList(name = newListName){
    const {data,error}=await supabase.from('shopping_lists').insert({name:name||'Nova compra',store_name:'Montserrat Jundiaí',status:'open'}).select().single();
    if(!error && data){ setLists([data,...lists]); setActiveList(data); setItems([]); setNewListName('Compra Montserrat'); setPage('listas'); }
  }
  async function refreshListTotals(){
    if(!activeList) return;
    await supabase.rpc('recalculate_list_totals',{p_list_id:activeList.id});
    const {data}=await supabase.from('shopping_lists').select('*').order('created_at',{ascending:false});
    if(data){ setLists(data); setActiveList(data.find(x=>x.id===activeList.id)||activeList); }
  }
  async function addItem(){
    if(!activeList || !productName.trim()) return;
    const name=norm(productName); const existing=products.find(p=>p.name===name); const estimated=price||existing?.last_price||existing?.avg_price||0;
    const {error}=await supabase.from('shopping_list_items').insert({list_id:activeList.id,product_id:existing?.id||null,product_name:name,quantity:Number(qty||1),unit,estimated_unit_price:Number(estimated||0)});
    if(!error){ setProductName(''); setQty(1); setPrice(0); await loadItems(activeList.id); await refreshListTotals(); }
  }
  async function addProductFromHistory(product:Product){
    if(!activeList){ alert('Crie ou selecione uma lista antes de adicionar produtos.'); return; }
    const {error}=await supabase.from('shopping_list_items').insert({list_id:activeList.id,product_id:product.id,product_name:product.name,quantity:1,unit:product.default_unit||'un',estimated_unit_price:Number(product.last_price||product.avg_price||0)});
    if(error){ alert(error.message); return; }
    await loadItems(activeList.id); await refreshListTotals();
  }
  async function toggleItem(item:ListItem){ await supabase.from('shopping_list_items').update({checked:!item.checked}).eq('id',item.id); await loadItems(item.list_id); await refreshListTotals(); }
  async function removeItem(item:ListItem){ await supabase.from('shopping_list_items').delete().eq('id',item.id); await loadItems(item.list_id); await refreshListTotals(); }
  async function duplicateActiveList(){
    if(!activeList) return;
    const {data:newList,error}=await supabase.from('shopping_lists').insert({name:`${activeList.name} - cópia`,store_name:'Montserrat Jundiaí',status:'open'}).select().single();
    if(error||!newList){ alert(error?.message||'Não consegui duplicar.'); return; }
    const newItems=items.map(i=>({list_id:newList.id,product_id:i.product_id,product_name:i.product_name,quantity:i.quantity,unit:i.unit,estimated_unit_price:i.estimated_unit_price,checked:false}));
    if(newItems.length){ await supabase.from('shopping_list_items').insert(newItems); await supabase.rpc('recalculate_list_totals',{p_list_id:newList.id}); }
    await loadAll(); setActiveList(newList);
  }
  async function finishActiveList(){ if(!activeList) return; await supabase.from('shopping_lists').update({status:'done'}).eq('id',activeList.id); await loadAll(); }
  async function saveManualPurchase(){
    if(!purchaseProduct.trim() || !purchasePrice) return;
    const name=norm(purchaseProduct);
    const {data:product,error}=await supabase.from('products').upsert({name,default_unit:purchaseUnit,category:null},{onConflict:'name'}).select().single();
    if(error||!product) return;
    await supabase.from('purchase_items').insert({product_id:product.id,product_name:name,store_name:'Montserrat Jundiaí',quantity:purchaseQty,unit:purchaseUnit,unit_price:purchasePrice,total_price:Number(purchaseQty)*Number(purchasePrice),purchase_date:new Date().toISOString().slice(0,10),source:'manual'});
    setPurchaseProduct(''); setPurchasePrice(0); setPurchaseQty(1); await loadAll();
  }
  async function saveQrLink(url:string){
    const clean=url.trim(); if(!clean) return; setScanMessage('Salvando QR Code...');
    const {error}=await supabase.from('coupon_imports').insert({qr_url:clean,store_name:'Montserrat Jundiaí',uf:'SP',status:'captured'});
    if(error) setScanMessage(error.message); else { setQrUrl(''); setScanMessage('QR Code salvo. Clique em Importar.'); await loadCoupons(); }
  }
  async function importCoupon(coupon:CouponImport){
    setImportingId(coupon.id);
    const {data,error}=await supabase.functions.invoke('import-nfce-sp',{body:{coupon_import_id:coupon.id}});
    if(error) alert(`Erro ao importar cupom: ${error.message}`); else if(data?.ok) alert(`Cupom importado com sucesso. Itens importados: ${data.imported_items}`); else alert(data?.error||'Não foi possível importar o cupom.');
    setImportingId(null); await loadAll();
  }

  const predictedTotal=items.reduce((t,i)=>t+Number(i.quantity||0)*Number(i.estimated_unit_price||0),0);
  const checkedTotal=items.filter(i=>i.checked).reduce((t,i)=>t+Number(i.quantity||0)*Number(i.estimated_unit_price||0),0);
  const filteredProducts=useMemo(()=>{ const q=norm(productSearch); return products.filter(p=>!q||p.name.includes(q)).slice(0,100); },[products,productSearch]);
  const openLists=lists.filter(l=>l.status!=='done'); const doneLists=lists.filter(l=>l.status==='done');
  const importedCoupons=coupons.filter(c=>c.status==='imported'); const pendingCoupons=coupons.filter(c=>c.status!=='imported');
  const totalPurchased=purchases.reduce((s,p)=>s+Number(p.total_price||0),0);
  const topPurchasedProducts=useMemo(()=>{ const m=new Map<string,{name:string,total:number,count:number}>(); purchases.forEach(p=>{const cur=m.get(p.product_name)||{name:p.product_name,total:0,count:0}; cur.total+=Number(p.total_price||0); cur.count+=1; m.set(p.product_name,cur);}); return Array.from(m.values()).sort((a,b)=>b.total-a.total).slice(0,8); },[purchases]);
  const risingProducts=products.filter(p=>p.last_price&&p.avg_price&&p.last_price>p.avg_price).map(p=>({...p,pct:p.avg_price?((Number(p.last_price)-Number(p.avg_price))/Number(p.avg_price))*100:0})).sort((a,b)=>b.pct-a.pct).slice(0,8);

  return <div className="appShell">
    <aside className="sideNav"><div className="brand"><span>CI</span><div><strong>Compra Inteligente</strong><small>Montserrat Jundiaí</small></div></div>
      <button className={page==='inicio'?'active':''} onClick={()=>setPage('inicio')}><Home size={18}/>Início</button>
      <button className={page==='listas'?'active':''} onClick={()=>setPage('listas')}><ListChecks size={18}/>Listas</button>
      <button className={page==='produtos'?'active':''} onClick={()=>setPage('produtos')}><PackageSearch size={18}/>Produtos</button>
      <button className={page==='analises'?'active':''} onClick={()=>setPage('analises')}><BarChart3 size={18}/>Análises</button>
      <button className={page==='cupons'?'active':''} onClick={()=>{setPage('cupons');loadCoupons();}}><FileSearch size={18}/>Cupons</button>
    </aside>
    <main className="workspace"><header className="pageHeader"><div><p className="eyebrow">NFC-e SP • Histórico inteligente de preços</p><h1>{title(page)}</h1></div><div className="pill">{money(predictedTotal)} previsto</div></header>

      {page==='inicio'&&<section className="pageGrid"><div className="heroCard"><p>Lista ativa</p><h2>{activeList?.name||'Nenhuma lista selecionada'}</h2><div className="heroStats"><span><small>Previsto</small><strong>{money(predictedTotal)}</strong></span><span><small>Já pego</small><strong>{money(checkedTotal)}</strong></span><span><small>Restante</small><strong>{money(predictedTotal-checkedTotal)}</strong></span></div><button onClick={()=>setPage('listas')}><ShoppingCart size={18}/>Abrir lista</button></div><Metric label="Produtos conhecidos" value={String(products.length)} sub="Itens no histórico"/><Metric label="Cupons importados" value={String(importedCoupons.length)} sub={`${pendingCoupons.length} pendentes`}/><Metric label="Gasto registrado" value={money(totalPurchased)} sub="Baseado nos cupons"/><section className="card wide"><h2>Adicionar produtos recorrentes</h2><ProductPicker products={filteredProducts} search={productSearch} onSearch={setProductSearch} onAdd={addProductFromHistory}/></section></section>}

      {page==='listas'&&<section className="pageGrid"><section className="card"><h2>Criar lista</h2><div className="inlineForm"><input value={newListName} onChange={e=>setNewListName(e.target.value)} placeholder="Nome da lista"/><button onClick={()=>createList()}><ListPlus size={18}/>Criar</button></div><h2 className="sectionTitle">Listas abertas</h2><div className="stack">{openLists.map(l=><button className={`listCard ${activeList?.id===l.id?'selected':''}`} key={l.id} onClick={()=>setActiveList(l)}><strong>{l.name}</strong><span>{money(l.predicted_total)} previsto • {fmt(l.created_at)}</span></button>)}{!openLists.length&&<p className="empty">Nenhuma lista aberta.</p>}</div><h2 className="sectionTitle">Concluídas</h2><div className="stack">{doneLists.slice(0,8).map(l=><button className="listCard" key={l.id} onClick={()=>setActiveList(l)}><strong>{l.name}</strong><span>{money(l.predicted_total)} • {fmt(l.created_at)}</span></button>)}</div></section><section className="card wide"><div className="cardTop"><div><h2>{activeList?.name||'Lista ativa'}</h2><p className="muted">Marque os itens como pegos durante a compra.</p></div><div className="actions"><button onClick={duplicateActiveList} disabled={!activeList}><Copy size={16}/>Duplicar</button><button onClick={finishActiveList} disabled={!activeList}><Check size={16}/>Concluir</button></div></div><div className="summary"><div><span>Previsto</span><strong>{money(predictedTotal)}</strong></div><div><span>Já pego</span><strong>{money(checkedTotal)}</strong></div><div><span>Restante</span><strong>{money(predictedTotal-checkedTotal)}</strong></div></div><div className="manualAdd"><h3>Adicionar item manual</h3><input list="products" value={productName} onChange={e=>setProductName(e.target.value)} placeholder="Produto"/><datalist id="products">{products.map(p=><option key={p.id} value={p.name}>{p.name} • {money(p.last_price||p.avg_price)}</option>)}</datalist><div className="threeFields"><input type="number" min="0.01" step="0.01" value={qty} onChange={e=>setQty(Number(e.target.value))}/><input value={unit} onChange={e=>setUnit(e.target.value)}/><input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(Number(e.target.value))} placeholder="Preço opcional"/></div><button onClick={addItem}><Plus size={18}/>Adicionar</button></div><ItemList items={items} onToggle={toggleItem} onRemove={removeItem}/></section><section className="card wide"><h2>Produtos do histórico</h2><ProductPicker products={filteredProducts} search={productSearch} onSearch={setProductSearch} onAdd={addProductFromHistory}/></section></section>}

      {page==='produtos'&&<section className="pageGrid"><section className="card wide"><div className="cardTop"><div><h2>Catálogo de produtos</h2><p className="muted">Produtos importados de cupons e lançamentos manuais.</p></div><button onClick={loadAll}><RefreshCw size={18}/>Atualizar</button></div><ProductPicker products={filteredProducts} search={productSearch} onSearch={setProductSearch} onAdd={addProductFromHistory}/></section><section className="card"><h2>Registrar preço manual</h2><input value={purchaseProduct} onChange={e=>setPurchaseProduct(e.target.value)} placeholder="Produto comprado"/><div className="threeFields"><input type="number" min="0.01" step="0.01" value={purchaseQty} onChange={e=>setPurchaseQty(Number(e.target.value))}/><input value={purchaseUnit} onChange={e=>setPurchaseUnit(e.target.value)}/><input type="number" min="0" step="0.01" value={purchasePrice} onChange={e=>setPurchasePrice(Number(e.target.value))} placeholder="Preço unitário"/></div><button onClick={saveManualPurchase}><Save size={18}/>Salvar</button></section><section className="card"><h2>Produtos que subiram</h2><Rows rows={risingProducts.map(p=>({title:p.name,sub:`${p.pct.toFixed(1)}% acima da média`}))}/></section></section>}

      {page==='analises'&&<section className="pageGrid"><Metric label="Total gasto registrado" value={money(totalPurchased)} sub={`${purchases.length} itens comprados`}/><Metric label="Produtos monitorados" value={String(products.length)} sub="Com preço médio"/><Metric label="Listas criadas" value={String(lists.length)} sub={`${openLists.length} abertas`}/><section className="card"><h2>Produtos mais relevantes</h2><Rows rows={topPurchasedProducts.map(p=>({title:p.name,sub:`${money(p.total)} • ${p.count} registros`}))}/></section><section className="card"><h2>Maiores altas</h2><Rows rows={risingProducts.map(p=>({title:p.name,sub:`${money(p.last_price)} vs média ${money(p.avg_price)}`}))}/></section></section>}

      {page==='cupons'&&<section className="pageGrid"><section className="card wide"><h2>Scanner NFC-e</h2><p className="muted">Cole o link do QR Code ou use a câmera. Depois clique em Importar.</p><QrScanner onDetected={v=>{setQrUrl(v);saveQrLink(v);}}/><textarea value={qrUrl} onChange={e=>setQrUrl(e.target.value)} placeholder="Cole aqui a URL do QR Code do cupom NFC-e"/><button onClick={()=>saveQrLink(qrUrl)}><Save size={18}/>Salvar QR Code</button>{scanMessage&&<p className="notice">{scanMessage}</p>}</section><section className="card wide"><div className="cardTop"><div><h2>Cupons NFC-e</h2><p className="muted">{pendingCoupons.length} pendentes • {importedCoupons.length} importados</p></div><button onClick={loadCoupons}><RefreshCw size={18}/>Atualizar</button></div><div className="items">{coupons.map(c=><div className="item" key={c.id}><div className="itemMain"><strong>Status: {c.status}</strong><span>{c.store_name||'Mercado'} • {new Date(c.created_at).toLocaleString('pt-BR')}</span><span>Itens importados: {c.imported_items||0}</span>{c.error_message&&<span className="muted">Erro: {c.error_message}</span>}<span className="muted">{c.qr_url.slice(0,120)}...</span></div><button onClick={()=>importCoupon(c)} disabled={importingId===c.id||c.status==='imported'}>{importingId===c.id?'Importando...':c.status==='imported'?'Importado':'Importar'}</button></div>)}{!coupons.length&&<p className="empty">Nenhum cupom salvo ainda.</p>}</div></section></section>}
    </main>
  </div>;
}
function title(page:string){return ({inicio:'Início',listas:'Listas de compras',produtos:'Produtos',analises:'Análises',cupons:'Cupons NFC-e'} as Record<string,string>)[page]||'Compra Inteligente'}
function Metric({label,value,sub}:{label:string;value:string;sub:string}){return <div className="metricCard"><small>{label}</small><strong>{value}</strong><span>{sub}</span></div>}
function Rows({rows}:{rows:{title:string;sub:string}[]}){return <div className="stack">{rows.map(r=><div className="miniRow" key={r.title}><strong>{r.title}</strong><span>{r.sub}</span></div>)}{!rows.length&&<p className="empty">Ainda não há dados suficientes.</p>}</div>}
function ItemList({items,onToggle,onRemove}:{items:ListItem[];onToggle:(i:ListItem)=>void;onRemove:(i:ListItem)=>void}){return <div className="items">{items.map(i=><div className={'item '+(i.checked?'done':'')} key={i.id}><button className="check" onClick={()=>onToggle(i)}>{i.checked?<Check size={18}/>:<Circle size={18}/>}</button><div className="itemMain"><strong>{i.product_name}</strong><span>{i.quantity} {i.unit} × {money(i.estimated_unit_price)} = {money(i.quantity*i.estimated_unit_price)}</span></div><button className="icon" onClick={()=>onRemove(i)}><Trash2 size={18}/></button></div>)}{!items.length&&<p className="empty">Adicione produtos à lista.</p>}</div>}
function ProductPicker({products,search,onSearch,onAdd}:{products:Product[];search:string;onSearch:(v:string)=>void;onAdd:(p:Product)=>void}){return <><div className="searchBox"><Search size={18}/><input value={search} onChange={e=>onSearch(e.target.value)} placeholder="Buscar produto já comprado..."/></div><div className="productPicker">{products.map(p=><div className="productOption" key={p.id}><div><strong>{p.name}</strong><span>Último: {money(p.last_price)} • Média: {money(p.avg_price)} • {p.default_unit||'un'}</span></div><button onClick={()=>onAdd(p)}><Plus size={16}/>Adicionar</button></div>)}{!products.length&&<p className="empty">Nenhum produto encontrado no histórico ainda.</p>}</div></>}
function QrScanner({onDetected}:{onDetected:(v:string)=>void}){const videoRef=useRef<HTMLVideoElement>(null);const controlsRef=useRef<IScannerControls|null>(null);const [running,setRunning]=useState(false);async function start(){const reader=new BrowserQRCodeReader();try{setRunning(true);controlsRef.current=await reader.decodeFromVideoDevice(undefined,videoRef.current!,(result)=>{if(result){onDetected(result.getText());controlsRef.current?.stop();setRunning(false);}})}catch{setRunning(false);alert('Não consegui abrir a câmera. Verifique as permissões do navegador.')}}function stop(){controlsRef.current?.stop();setRunning(false)}return <div className="scanner"><video ref={videoRef}/><button onClick={running?stop:start}><Camera size={18}/>{running?'Parar câmera':'Ler QR Code'}</button></div>}
createRoot(document.getElementById('root')!).render(<App/>);
