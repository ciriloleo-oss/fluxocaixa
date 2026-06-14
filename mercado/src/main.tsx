import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserQRCodeReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { supabase } from './lib/supabase';
import { Camera, Check, Circle, FileSearch, History, ListPlus, Plus, QrCode, RefreshCw, Save, Search, ShoppingCart, Trash2 } from 'lucide-react';
import './styles.css';

type Product = {
  id: string;
  name: string;
  category: string | null;
  default_unit: string | null;
  last_price: number | null;
  avg_price: number | null;
};

type ShoppingList = {
  id: string;
  name: string;
  status: string;
  predicted_total: number;
  actual_total: number;
};

type ListItem = {
  id: string;
  list_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit: string;
  estimated_unit_price: number;
  actual_unit_price: number | null;
  checked: boolean;
};

type CouponImport = {
  id: string;
  qr_url: string;
  uf: string | null;
  store_name: string | null;
  status: string;
  imported_items: number | null;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
};

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function money(value?: number | null) {
  return brl.format(Number(value || 0));
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

function App() {
  const [tab, setTab] = useState<'lista' | 'historico' | 'scanner' | 'cupons'>('lista');
  const [products, setProducts] = useState<Product[]>([]);
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeList, setActiveList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [coupons, setCoupons] = useState<CouponImport[]>([]);

  const [productName, setProductName] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('un');
  const [price, setPrice] = useState(0);
  const [newListName, setNewListName] = useState('Compra Montserrat');
  const [productSearch, setProductSearch] = useState('');

  const [purchaseProduct, setPurchaseProduct] = useState('');
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [purchaseUnit, setPurchaseUnit] = useState('un');

  const [qrUrl, setQrUrl] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (activeList) {
      loadItems(activeList.id);
    }
  }, [activeList?.id]);

  async function loadAll() {
    const [productsResponse, listsResponse, couponsResponse] = await Promise.all([
      supabase.from('product_price_summary').select('*').order('name'),
      supabase.from('shopping_lists').select('*').order('created_at', { ascending: false }),
      supabase.from('coupon_imports').select('*').order('created_at', { ascending: false })
    ]);

    if (!productsResponse.error) setProducts(productsResponse.data || []);
    if (!couponsResponse.error) setCoupons(couponsResponse.data || []);

    if (!listsResponse.error) {
      const loadedLists = listsResponse.data || [];
      setLists(loadedLists);
      setActiveList(current => current || loadedLists[0] || null);
    }
  }

  async function loadItems(listId: string) {
    const { data } = await supabase
      .from('shopping_list_items')
      .select('*')
      .eq('list_id', listId)
      .order('created_at');

    setItems(data || []);
  }

  async function loadCoupons() {
    const { data } = await supabase
      .from('coupon_imports')
      .select('*')
      .order('created_at', { ascending: false });

    setCoupons(data || []);
  }

  async function createList() {
    const { data, error } = await supabase
      .from('shopping_lists')
      .insert({ name: newListName || 'Nova compra', store_name: 'Montserrat Jundiaí', status: 'open' })
      .select()
      .single();

    if (!error && data) {
      setLists([data, ...lists]);
      setActiveList(data);
      setNewListName('Compra Montserrat');
      setItems([]);
    }
  }

  async function addItem() {
    if (!activeList || !productName.trim()) return;

    const name = normalizeName(productName);
    const existing = products.find(product => product.name === name);
    const estimated = price || existing?.last_price || existing?.avg_price || 0;

    const { error } = await supabase.from('shopping_list_items').insert({
      list_id: activeList.id,
      product_id: existing?.id || null,
      product_name: name,
      quantity: Number(qty || 1),
      unit,
      estimated_unit_price: Number(estimated || 0)
    });

    if (!error) {
      setProductName('');
      setQty(1);
      setPrice(0);
      await loadItems(activeList.id);
      await refreshListTotals();
    }
  }


  async function addProductFromHistory(product: Product) {
    if (!activeList) {
      alert('Crie ou selecione uma lista antes de adicionar produtos.');
      return;
    }

    const estimated = Number(product.last_price || product.avg_price || 0);

    const { error } = await supabase.from('shopping_list_items').insert({
      list_id: activeList.id,
      product_id: product.id,
      product_name: product.name,
      quantity: 1,
      unit: product.default_unit || 'un',
      estimated_unit_price: estimated
    });

    if (error) {
      alert(`Erro ao adicionar produto: ${error.message}`);
      return;
    }

    await loadItems(activeList.id);
    await refreshListTotals();
  }

  async function toggleItem(item: ListItem) {
    await supabase.from('shopping_list_items').update({ checked: !item.checked }).eq('id', item.id);
    await loadItems(item.list_id);
    await refreshListTotals();
  }

  async function removeItem(item: ListItem) {
    await supabase.from('shopping_list_items').delete().eq('id', item.id);
    await loadItems(item.list_id);
    await refreshListTotals();
  }

  async function refreshListTotals() {
    if (!activeList) return;
    await supabase.rpc('recalculate_list_totals', { p_list_id: activeList.id });

    const { data } = await supabase
      .from('shopping_lists')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) {
      setLists(data);
      setActiveList(data.find(list => list.id === activeList.id) || activeList);
    }
  }

  async function saveManualPurchase() {
    if (!purchaseProduct.trim() || !purchasePrice) return;

    const name = normalizeName(purchaseProduct);
    const { data: product, error: productError } = await supabase
      .from('products')
      .upsert({ name, default_unit: purchaseUnit, category: null }, { onConflict: 'name' })
      .select()
      .single();

    if (productError || !product) return;

    await supabase.from('purchase_items').insert({
      product_id: product.id,
      product_name: name,
      store_name: 'Montserrat Jundiaí',
      quantity: purchaseQty,
      unit: purchaseUnit,
      unit_price: purchasePrice,
      total_price: Number(purchaseQty) * Number(purchasePrice),
      purchase_date: new Date().toISOString().slice(0, 10),
      source: 'manual'
    });

    setPurchaseProduct('');
    setPurchasePrice(0);
    setPurchaseQty(1);
    await loadAll();
  }

  async function saveQrLink(url: string) {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;

    setScanMessage('Salvando QR Code...');

    const { error } = await supabase.from('coupon_imports').insert({
      qr_url: cleanUrl,
      store_name: 'Montserrat Jundiaí',
      uf: 'SP',
      status: 'captured'
    });

    if (!error) {
      setQrUrl('');
      setScanMessage('QR Code salvo. Vá em "Cupons" e clique em "Importar".');
      await loadCoupons();
    } else {
      setScanMessage(error.message);
    }
  }

  async function importCoupon(coupon: CouponImport) {
    setImportingId(coupon.id);

    const { data, error } = await supabase.functions.invoke('import-nfce-sp', {
      body: { coupon_import_id: coupon.id }
    });

    if (error) {
      alert(`Erro ao importar cupom: ${error.message}`);
    } else if (data?.ok) {
      alert(`Cupom importado com sucesso. Itens importados: ${data.imported_items}`);
    } else {
      alert(data?.error || 'Não foi possível importar o cupom.');
    }

    setImportingId(null);
    await loadAll();
  }

  const predictedTotal = useMemo(() => {
    return items.reduce((total, item) => total + Number(item.quantity || 0) * Number(item.estimated_unit_price || 0), 0);
  }, [items]);

  const checkedTotal = useMemo(() => {
    return items
      .filter(item => item.checked)
      .reduce((total, item) => total + Number(item.quantity || 0) * Number(item.estimated_unit_price || 0), 0);
  }, [items]);


  const filteredProducts = useMemo(() => {
    const query = normalizeName(productSearch);
    return products
      .filter(product => !query || product.name.includes(query))
      .slice(0, 80);
  }, [products, productSearch]);

  return (
    <div className="app">
      <header>
        <div>
          <p className="eyebrow">Montserrat Jundiaí • NFC-e SP</p>
          <h1>Compra Inteligente</h1>
        </div>
        <div className="pill">{money(predictedTotal)} previsto</div>
      </header>

      <nav>
        <button className={tab === 'lista' ? 'active' : ''} onClick={() => setTab('lista')}><ShoppingCart size={18} /> Lista</button>
        <button className={tab === 'historico' ? 'active' : ''} onClick={() => setTab('historico')}><History size={18} /> Histórico</button>
        <button className={tab === 'scanner' ? 'active' : ''} onClick={() => setTab('scanner')}><QrCode size={18} /> Scanner</button>
        <button className={tab === 'cupons' ? 'active' : ''} onClick={() => { setTab('cupons'); loadCoupons(); }}><FileSearch size={18} /> Cupons</button>
      </nav>

      {tab === 'lista' && (
        <main className="grid">
          <section className="card">
            <h2>Nova lista</h2>
            <div className="row">
              <input value={newListName} onChange={event => setNewListName(event.target.value)} placeholder="Nome da lista" />
              <button onClick={createList}><ListPlus size={18} /> Criar</button>
            </div>
            <select value={activeList?.id || ''} onChange={event => setActiveList(lists.find(list => list.id === event.target.value) || null)}>
              <option value="">Selecione uma lista</option>
              {lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}
            </select>
          </section>

          <section className="card">
            <h2>Adicionar item manual</h2>
            <input list="products" value={productName} onChange={event => setProductName(event.target.value)} placeholder="Produto" />
            <datalist id="products">
              {products.map(product => (
                <option key={product.id} value={product.name}>{product.name} • {money(product.last_price || product.avg_price)}</option>
              ))}
            </datalist>
            <div className="row compact">
              <input type="number" min="0.01" step="0.01" value={qty} onChange={event => setQty(Number(event.target.value))} />
              <input value={unit} onChange={event => setUnit(event.target.value)} />
              <input type="number" min="0" step="0.01" value={price} onChange={event => setPrice(Number(event.target.value))} placeholder="Preço opcional" />
            </div>
            <button onClick={addItem}><Plus size={18} /> Adicionar à lista</button>
          </section>


          <section className="card wide">
            <h2>Produtos do histórico</h2>
            <div className="searchBox">
              <Search size={18} />
              <input
                value={productSearch}
                onChange={event => setProductSearch(event.target.value)}
                placeholder="Buscar produto já comprado..."
              />
            </div>

            <div className="productPicker">
              {filteredProducts.map(product => (
                <div className="productOption" key={product.id}>
                  <div>
                    <strong>{product.name}</strong>
                    <span>
                      Último: {money(product.last_price)} • Média: {money(product.avg_price)} • {product.default_unit || 'un'}
                    </span>
                  </div>
                  <button onClick={() => addProductFromHistory(product)}>
                    <Plus size={16} /> Adicionar
                  </button>
                </div>
              ))}

              {filteredProducts.length === 0 && (
                <p className="empty">Nenhum produto encontrado no histórico ainda.</p>
              )}
            </div>
          </section>

          <section className="card wide">
            <div className="summary">
              <div><span>Previsto</span><strong>{money(predictedTotal)}</strong></div>
              <div><span>Já pego</span><strong>{money(checkedTotal)}</strong></div>
              <div><span>Restante</span><strong>{money(predictedTotal - checkedTotal)}</strong></div>
            </div>

            <div className="items">
              {items.map(item => (
                <div className={'item ' + (item.checked ? 'done' : '')} key={item.id}>
                  <button className="check" onClick={() => toggleItem(item)}>{item.checked ? <Check size={18} /> : <Circle size={18} />}</button>
                  <div className="itemMain">
                    <strong>{item.product_name}</strong>
                    <span>{item.quantity} {item.unit} × {money(item.estimated_unit_price)} = {money(item.quantity * item.estimated_unit_price)}</span>
                  </div>
                  <button className="icon" onClick={() => removeItem(item)}><Trash2 size={18} /></button>
                </div>
              ))}
              {items.length === 0 && <p className="empty">Crie uma lista e adicione os primeiros itens.</p>}
            </div>
          </section>
        </main>
      )}

      {tab === 'historico' && (
        <main className="grid">
          <section className="card">
            <h2>Registrar preço manual</h2>
            <input value={purchaseProduct} onChange={event => setPurchaseProduct(event.target.value)} placeholder="Produto comprado" />
            <div className="row compact">
              <input type="number" min="0.01" step="0.01" value={purchaseQty} onChange={event => setPurchaseQty(Number(event.target.value))} />
              <input value={purchaseUnit} onChange={event => setPurchaseUnit(event.target.value)} />
              <input type="number" min="0" step="0.01" value={purchasePrice} onChange={event => setPurchasePrice(Number(event.target.value))} placeholder="Preço unitário" />
            </div>
            <button onClick={saveManualPurchase}><Save size={18} /> Salvar no histórico</button>
          </section>

          <section className="card wide">
            <h2>Produtos conhecidos</h2>
            <div className="table">
              {products.map(product => (
                <div className="tableRow" key={product.id}>
                  <strong>{product.name}</strong>
                  <span>Último: {money(product.last_price)}</span>
                  <span>Média: {money(product.avg_price)}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}

      {tab === 'scanner' && (
        <main className="grid">
          <section className="card wide">
            <h2>Scanner NFC-e</h2>
            <p className="muted">Cole o link do QR Code ou use a câmera. Depois vá em "Cupons" para importar os itens.</p>
            <QrScanner onDetected={value => { setQrUrl(value); saveQrLink(value); }} />
            <textarea value={qrUrl} onChange={event => setQrUrl(event.target.value)} placeholder="Cole aqui a URL do QR Code do cupom NFC-e" />
            <button onClick={() => saveQrLink(qrUrl)}><Save size={18} /> Salvar QR Code</button>
            {scanMessage && <p className="notice">{scanMessage}</p>}
          </section>
        </main>
      )}

      {tab === 'cupons' && (
        <main className="grid">
          <section className="card wide">
            <div className="row">
              <h2>Cupons NFC-e</h2>
              <button onClick={loadCoupons}><RefreshCw size={18} /> Atualizar</button>
            </div>

            <div className="items">
              {coupons.map(coupon => (
                <div className="item" key={coupon.id}>
                  <div className="itemMain">
                    <strong>Status: {coupon.status}</strong>
                    <span>{coupon.store_name || 'Mercado'} • {new Date(coupon.created_at).toLocaleString('pt-BR')}</span>
                    <span>Itens importados: {coupon.imported_items || 0}</span>
                    {coupon.error_message && <span className="muted">Erro: {coupon.error_message}</span>}
                    <span className="muted">{coupon.qr_url.slice(0, 110)}...</span>
                  </div>

                  <button onClick={() => importCoupon(coupon)} disabled={importingId === coupon.id || coupon.status === 'imported'}>
                    {importingId === coupon.id ? 'Importando...' : coupon.status === 'imported' ? 'Importado' : 'Importar'}
                  </button>
                </div>
              ))}

              {coupons.length === 0 && <p className="empty">Nenhum cupom salvo ainda.</p>}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

function QrScanner({ onDetected }: { onDetected: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [running, setRunning] = useState(false);

  async function start() {
    const reader = new BrowserQRCodeReader();

    try {
      setRunning(true);
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result) {
          onDetected(result.getText());
          controlsRef.current?.stop();
          setRunning(false);
        }
      });
    } catch {
      setRunning(false);
      alert('Não consegui abrir a câmera. Verifique as permissões do navegador.');
    }
  }

  function stop() {
    controlsRef.current?.stop();
    setRunning(false);
  }

  return (
    <div className="scanner">
      <video ref={videoRef} />
      <button onClick={running ? stop : start}>
        <Camera size={18} /> {running ? 'Parar câmera' : 'Ler QR Code'}
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
