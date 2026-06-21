import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserQRCodeReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { supabase } from './lib/supabase';
import {
  BarChart3,
  Camera,
  Check,
  Circle,
  Copy,
  FileSearch,
  Home,
  ListChecks,
  ListPlus,
  Minus,
  PackageSearch,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShoppingCart,
  Store,
  Tag,
  Trash2
} from 'lucide-react';
import './styles.css';

type Product = {
  id: string;
  name: string;
  category: string | null;
  default_unit: string | null;
  last_price: number | null;
  gross_unit_price?: number | null;
  discount_amount?: number | null;
  avg_price: number | null;
};

type ShoppingList = {
  id: string;
  name: string;
  status: string;
  store_name?: string | null;
  market_name?: string | null;
  purchase_date?: string | null;
  predicted_total: number;
  actual_total: number;
  is_archived?: boolean | null;
  created_at?: string;
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


type ProductMarketPrice = {
  product_id: string;
  product_name: string;
  market_name: string;
  unit: string | null;
  last_price: number | null;
  gross_unit_price?: number | null;
  discount_amount?: number | null;
  avg_price: number | null;
  price_count: number | null;
  last_purchase_date: string | null;
};

type ListMarketComparison = {
  list_id: string;
  list_name: string;
  market_name: string;
  estimated_total: number;
  item_count: number;
  priced_item_count: number;
  coverage_pct: number;
};

type MonthlySummary = {
  month: string;
  total_spent: number;
  item_count: number;
  product_count: number;
  market_count: number;
};

type MarketSummary = {
  market_name: string;
  total_spent: number;
  item_count: number;
  product_count: number;
  last_purchase_date: string | null;
};

type PurchaseItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  store_name: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  purchase_date: string;
  source: string;
};

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const DEFAULT_MARKETS = [
  'Montserrat Jundiaí',
  'Boa Supermercados',
  'Tauste',
  'Covabra',
  'Carrefour',
  'Atacadão',
  'Assaí',
  'Outro'
];

function money(value?: number | null) {
  return brl.format(Number(value || 0));
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const CATEGORY_ORDER = [
  'Hortifruti',
  'Laticínios',
  'Mercearia',
  'Carnes e Frios',
  'Bebidas',
  'Limpeza',
  'Higiene',
  'Congelados',
  'Pet',
  'Outros'
];

function inferCategory(productName: string) {
  const name = normalizeName(productName);

  const rules: Array<[string, RegExp]> = [
    ['Hortifruti', /(ALFACE|RUCULA|RÚCULA|TOMATE|BATATA|CEBOLA|ALHO|CENOURA|BANANA|MACA|MAÇÃ|LARANJA|LIMAO|LIMÃO|UVA|MANGA|ABACATE|ABACAXI|MELANCIA|MELAO|MELÃO|VERDURA|LEGUME)/i],
    ['Laticínios', /(LEITE|IOGURTE|QUEIJO|MANTEIGA|REQUEIJAO|REQUEIJÃO|CREME DE LEITE|LEITE CONDENSADO|MUSSARELA|MOZZARELLA|PARMESAO|PARMESÃO)/i],
    ['Mercearia', /(ARROZ|FEIJAO|FEIJÃO|MACARRAO|MACARRÃO|MOLHO|OLEO|ÓLEO|AZEITE|FARINHA|ACUCAR|AÇUCAR|AÇÚCAR|CAFE|CAFÉ|SAL|TEMPERO|MILHO|ERVILHA|SARDINHA|ATUM|EXTRATO|BISCOITO|BOLACHA|PAO|PÃO|TORRADA|CEREAL|AVEIA|GRANOLA)/i],
    ['Carnes e Frios', /(CARNE|FRANGO|LINGUICA|LINGUIÇA|PEIXE|BACON|PRESUNTO|MORTADELA|SALSICHA|HAMBURGUER|HAMBÚRGUER|PICANHA|ACEM|ACÉM|COXAO|COXÃO|PATINHO)/i],
    ['Bebidas', /(CERVEJA|REFRIGERANTE|SUCO|AGUA|ÁGUA|ENERGETICO|ENERGÉTICO|VINHO|BEBIDA|CHA|CHÁ|COCA|GUARANA|GUARANÁ)/i],
    ['Limpeza', /(DETERGENTE|SABAO|SABÃO|AMACIANTE|DESINFETANTE|AGUA SANITARIA|ÁGUA SANITÁRIA|LIMPADOR|ESPONJA|VEJA|MULTIUSO|ALCOOL|ÁLCOOL|LAVA ROUPAS|LAVA-ROUPAS)/i],
    ['Higiene', /(PAPEL HIGIENICO|PAPEL HIGIÊNICO|SABONETE|SHAMPOO|CONDICIONADOR|CREME DENTAL|PASTA DENTAL|ESCOVA|DESODORANTE|ABSORVENTE|FRALDA|HIGIENE)/i],
    ['Pet', /(RACAO|RAÇÃO|PET|GATO|CAO|CÃO|CACHORRO|AREIA SANITARIA|AREIA SANITÁRIA)/i],
    ['Congelados', /(SORVETE|PIZZA|LASANHA|CONGELADO|BATATA FRITA|NUGGET|POLPA)/i]
  ];

  return rules.find(([, regex]) => regex.test(name))?.[0] || 'Outros';
}

function getProductCategory(productName: string, products: Product[]) {
  const product = products.find(item => item.name === productName);
  return product?.category || inferCategory(productName);
}

function groupItemsByCategory(items: ListItem[], products: Product[]) {
  const map = new Map<string, ListItem[]>();

  for (const item of items) {
    const category = getProductCategory(item.product_name, products);
    const current = map.get(category) || [];
    current.push(item);
    map.set(category, current);
  }

  return Array.from(map.entries()).sort(([a], [b]) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
  });
}

function getMarket(list?: ShoppingList | null) {
  return list?.market_name || list?.store_name || 'Montserrat Jundiaí';
}

function App() {
  const [page, setPage] = useState<'inicio' | 'compras' | 'produtos' | 'ondeComprar' | 'analises' | 'cupons'>('inicio');
  const [products, setProducts] = useState<Product[]>([]);
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeList, setActiveList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [coupons, setCoupons] = useState<CouponImport[]>([]);
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [marketPrices, setMarketPrices] = useState<ProductMarketPrice[]>([]);
  const [listMarketComparison, setListMarketComparison] = useState<ListMarketComparison[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([]);
  const [marketSummary, setMarketSummary] = useState<MarketSummary[]>([]);

  const [productName, setProductName] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('un');
  const [price, setPrice] = useState(0);

  const [newListName, setNewListName] = useState('Compra da Semana');
  const [newMarketName, setNewMarketName] = useState('Montserrat Jundiaí');
  const [customMarketName, setCustomMarketName] = useState('');
  const [newPurchaseDate, setNewPurchaseDate] = useState(todayISO());

  const [productSearch, setProductSearch] = useState('');
  const [priceSearch, setPriceSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todas');
  const [selectedMasterProductId, setSelectedMasterProductId] = useState('');
  const [selectedDuplicateProductId, setSelectedDuplicateProductId] = useState('');
  const [duplicateCandidates, setDuplicateCandidates] = useState<any[]>([]);
  const [purchaseProduct, setPurchaseProduct] = useState('');
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [purchaseUnit, setPurchaseUnit] = useState('un');
  const [purchaseMarket, setPurchaseMarket] = useState('Montserrat Jundiaí');

  const [qrUrl, setQrUrl] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
    loadDuplicateCandidates();
  }, []);

  useEffect(() => {
    if (activeList) {
      loadItems(activeList.id);
    } else {
      setItems([]);
    }
  }, [activeList?.id]);

  async function loadAll() {
    const [productsResponse, listsResponse, couponsResponse, purchasesResponse, marketPricesResponse, listMarketResponse, monthlyResponse, marketSummaryResponse] = await Promise.all([
      supabase.from('product_price_summary').select('*').order('name'),
      supabase.from('shopping_lists').select('*').order('created_at', { ascending: false }),
      supabase.from('coupon_imports').select('*').order('created_at', { ascending: false }),
      supabase.from('purchase_items').select('*').order('purchase_date', { ascending: false }).limit(500),
      supabase.from('product_market_prices').select('*').order('product_name'),
      supabase.from('shopping_list_market_comparison').select('*'),
      supabase.from('monthly_spending_summary').select('*').limit(12),
      supabase.from('market_spending_summary').select('*').limit(12)
    ]);

    if (!productsResponse.error) setProducts(productsResponse.data || []);
    if (!couponsResponse.error) setCoupons(couponsResponse.data || []);
    if (!purchasesResponse.error) setPurchases(purchasesResponse.data || []);
    if (!marketPricesResponse.error) setMarketPrices(marketPricesResponse.data || []);
    if (!listMarketResponse.error) setListMarketComparison(listMarketResponse.data || []);
    if (!monthlyResponse.error) setMonthlySummary(monthlyResponse.data || []);
    if (!marketSummaryResponse.error) setMarketSummary(marketSummaryResponse.data || []);

    if (!listsResponse.error) {
      const loadedLists = listsResponse.data || [];
      setLists(loadedLists);
      setActiveList(current => current || loadedLists.find(list => list.status !== 'done') || loadedLists[0] || null);
    }
  }

  async function loadItems(listId: string) {
    const { data } = await supabase
      .from('shopping_list_items')
      .select('*')
      .eq('list_id', listId)
      .order('checked')
      .order('created_at');

    setItems(data || []);
  }


  async function loadDuplicateCandidates() {
    const { data, error } = await supabase
      .from('product_duplicate_candidates')
      .select('*')
      .limit(30);

    if (!error) {
      setDuplicateCandidates(data || []);
    }
  }

  async function loadCoupons() {
    const { data } = await supabase
      .from('coupon_imports')
      .select('*')
      .order('created_at', { ascending: false });

    setCoupons(data || []);
  }

  async function createPurchase(name = newListName) {
    const market = newMarketName === 'Outro'
      ? (customMarketName.trim() || 'Outro')
      : newMarketName;

    const { data, error } = await supabase
      .from('shopping_lists')
      .insert({
        name: name || 'Nova compra',
        store_name: market,
        market_name: market,
        purchase_date: newPurchaseDate || todayISO(),
        status: 'open'
      })
      .select()
      .single();

    if (!error && data) {
      setLists([data, ...lists]);
      setActiveList(data);
      setItems([]);
      setNewListName('Compra da Semana');
      setCustomMarketName('');
      setNewPurchaseDate(todayISO());
      setPage('compras');
    } else if (error) {
      alert(`Erro ao criar compra: ${error.message}`);
    }
  }

  async function duplicateActiveList() {
    if (!activeList) return;

    const market = getMarket(activeList);

    const { data: newList, error } = await supabase
      .from('shopping_lists')
      .insert({
        name: `${activeList.name} - cópia`,
        store_name: market,
        market_name: market,
        purchase_date: todayISO(),
        status: 'open'
      })
      .select()
      .single();

    if (error || !newList) {
      alert(error?.message || 'Não consegui duplicar a compra.');
      return;
    }

    const duplicatedItems = items.map(item => ({
      list_id: newList.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit: item.unit,
      estimated_unit_price: item.estimated_unit_price,
      checked: false
    }));

    if (duplicatedItems.length > 0) {
      await supabase.from('shopping_list_items').insert(duplicatedItems);
      await supabase.rpc('recalculate_list_totals', { p_list_id: newList.id });
    }

    await loadAll();
    setActiveList(newList);
    setPage('compras');
  }

  async function finishActiveList() {
    if (!activeList) return;

    const totalItems = items.length;
    const boughtItems = items.filter(item => item.checked).length;
    const pendingItems = totalItems - boughtItems;

    const message = pendingItems > 0
      ? `Você marcou ${boughtItems} de ${totalItems} itens como pegos.\n\nAinda há ${pendingItems} item(ns) pendente(s). Finalizar mesmo assim?`
      : `Todos os ${totalItems} itens foram marcados como pegos. Finalizar compra?`;

    if (!confirm(message)) return;

    await supabase.from('shopping_lists').update({ status: 'done' }).eq('id', activeList.id);
    await loadAll();
  }

  async function reopenPurchase(list: ShoppingList) {
    await supabase.from('shopping_lists').update({ status: 'open' }).eq('id', list.id);
    await loadAll();
    setActiveList({ ...list, status: 'open' });
    setPage('compras');
  }

  async function duplicatePurchase(list: ShoppingList) {
    const previousActive = activeList;
    setActiveList(list);
    const { data } = await supabase
      .from('shopping_list_items')
      .select('*')
      .eq('list_id', list.id)
      .order('created_at');

    const market = getMarket(list);

    const { data: newList, error } = await supabase
      .from('shopping_lists')
      .insert({
        name: `${list.name} - nova`,
        store_name: market,
        market_name: market,
        purchase_date: todayISO(),
        status: 'open'
      })
      .select()
      .single();

    if (error || !newList) {
      alert(error?.message || 'Não consegui duplicar a compra.');
      if (previousActive) setActiveList(previousActive);
      return;
    }

    const sourceItems = data || [];
    const duplicatedItems = sourceItems.map(item => ({
      list_id: newList.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit: item.unit,
      estimated_unit_price: item.estimated_unit_price,
      checked: false
    }));

    if (duplicatedItems.length > 0) {
      await supabase.from('shopping_list_items').insert(duplicatedItems);
      await supabase.rpc('recalculate_list_totals', { p_list_id: newList.id });
    }

    await loadAll();
    setActiveList(newList);
    setPage('compras');
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
      await createPurchase('Compra da Semana');
      return;
    }

    const { error } = await supabase.from('shopping_list_items').insert({
      list_id: activeList.id,
      product_id: product.id,
      product_name: product.name,
      quantity: 1,
      unit: product.default_unit || 'un',
      estimated_unit_price: Number(product.last_price || product.avg_price || 0)
    });

    if (error) {
      alert(`Erro ao adicionar produto: ${error.message}`);
      return;
    }

    await loadItems(activeList.id);
    await refreshListTotals();
  }


  async function updateProductCategory(product: Product, category: string) {
    const { error } = await supabase
      .from('products')
      .update({ category })
      .eq('id', product.id);

    if (error) {
      alert(`Erro ao salvar categoria: ${error.message}`);
      return;
    }

    setProducts(current =>
      current.map(item => item.id === product.id ? { ...item, category } : item)
    );
  }

  async function autoCategorizeProduct(product: Product) {
    await updateProductCategory(product, inferCategory(product.name));
  }

  async function autoCategorizeAllVisible() {
    for (const product of filteredProducts) {
      await updateProductCategory(product, inferCategory(product.name));
    }
  }


  async function mergeSelectedProducts(masterId = selectedMasterProductId, duplicateId = selectedDuplicateProductId) {
    if (!masterId || !duplicateId || masterId === duplicateId) {
      alert('Selecione um produto principal e um produto duplicado diferente.');
      return;
    }

    const master = products.find(product => product.id === masterId);
    const duplicate = products.find(product => product.id === duplicateId);

    if (!master || !duplicate) {
      alert('Produto não encontrado.');
      return;
    }

    const ok = confirm(`Unificar "${duplicate.name}" dentro de "${master.name}"?\n\nO histórico e as listas passarão a usar o produto principal.`);
    if (!ok) return;

    const { error } = await supabase.rpc('merge_products', {
      p_master_product_id: masterId,
      p_duplicate_product_ids: [duplicateId]
    });

    if (error) {
      alert(`Erro ao unificar produtos: ${error.message}`);
      return;
    }

    setSelectedDuplicateProductId('');
    await loadAll();
    await loadDuplicateCandidates();
    alert('Produtos unificados com sucesso.');
  }

  async function archivePurchase(list: ShoppingList) {
    const ok = confirm(`Ocultar a compra "${list.name}" da tela de Compras?\n\nEla continuará no histórico e nas análises.`);
    if (!ok) return;

    const { error } = await supabase
      .from('shopping_lists')
      .update({ is_archived: true })
      .eq('id', list.id);

    if (error) {
      alert(`Erro ao ocultar compra: ${error.message}`);
      return;
    }

    if (activeList?.id === list.id) {
      setActiveList(null);
      setItems([]);
    }

    await loadAll();
  }

  async function toggleItem(item: ListItem) {
    await supabase
      .from('shopping_list_items')
      .update({ checked: !item.checked })
      .eq('id', item.id);

    await loadItems(item.list_id);
    await refreshListTotals();
  }

  async function updateItemQuantity(item: ListItem, newQuantity: number) {
    const quantity = Math.max(0.01, Number(newQuantity || 0.01));

    await supabase
      .from('shopping_list_items')
      .update({ quantity })
      .eq('id', item.id);

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
      .upsert({ name, default_unit: purchaseUnit, category: inferCategory(name) }, { onConflict: 'name' })
      .select()
      .single();

    if (productError || !product) return;

    await supabase.from('purchase_items').insert({
      product_id: product.id,
      product_name: name,
      store_name: purchaseMarket,
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
      setScanMessage('QR Code salvo. Vá em Cupons e clique em Importar.');
      await loadCoupons();
      setPage('cupons');
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

  const checkedCount = items.filter(item => item.checked).length;
  const progressPct = items.length ? Math.round((checkedCount / items.length) * 100) : 0;

  const availableCategories = useMemo(() => {
    const categories = new Set<string>();

    for (const product of products) {
      categories.add(product.category || inferCategory(product.name));
    }

    return ['Todas', ...CATEGORY_ORDER.filter(category => categories.has(category)), ...Array.from(categories).filter(category => !CATEGORY_ORDER.includes(category)).sort()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = normalizeName(productSearch);

    return products
      .filter(product => !query || product.name.includes(query))
      .filter(product => categoryFilter === 'Todas' || (product.category || inferCategory(product.name)) === categoryFilter)
      .slice(0, 120);
  }, [products, productSearch, categoryFilter]);

  const visibleLists = lists.filter(list => !list.is_archived);
  const openLists = visibleLists.filter(list => list.status !== 'done');
  const doneLists = visibleLists.filter(list => list.status === 'done');
  const importedCoupons = coupons.filter(coupon => coupon.status === 'imported');
  const pendingCoupons = coupons.filter(coupon => coupon.status !== 'imported');
  const totalPurchased = purchases.reduce((sum, purchase) => sum + Number(purchase.total_price || 0), 0);

  const marketTotals = useMemo(() => {
    const map = new Map<string, number>();

    for (const purchase of purchases) {
      const market = purchase.store_name || 'Sem mercado';
      map.set(market, (map.get(market) || 0) + Number(purchase.total_price || 0));
    }

    return Array.from(map.entries())
      .map(([market, total]) => ({ market, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [purchases]);

  const topPurchasedProducts = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();

    for (const purchase of purchases) {
      const current = map.get(purchase.product_name) || { name: purchase.product_name, total: 0, count: 0 };
      current.total += Number(purchase.total_price || 0);
      current.count += 1;
      map.set(purchase.product_name, current);
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [purchases]);


  const activeListMarketOptions = useMemo(() => {
    if (!activeList) return [];

    return listMarketComparison
      .filter(item => item.list_id === activeList.id)
      .sort((a, b) => Number(a.estimated_total || 0) - Number(b.estimated_total || 0))
      .slice(0, 6);
  }, [listMarketComparison, activeList?.id]);

  const bestActiveMarket = activeListMarketOptions[0] || null;

  const productPriceGroups = useMemo(() => {
    const map = new Map<string, ProductMarketPrice[]>();

    for (const price of marketPrices) {
      const current = map.get(price.product_id) || [];
      current.push(price);
      map.set(price.product_id, current);
    }

    for (const [productId, prices] of map.entries()) {
      map.set(productId, prices.sort((a, b) => Number(a.last_price || 0) - Number(b.last_price || 0)));
    }

    return map;
  }, [marketPrices]);

  const comparableProducts = useMemo(() => {
    const query = normalizeName(priceSearch);

    return Array.from(productPriceGroups.entries())
      .map(([productId, prices]) => {
        const product = products.find(item => item.id === productId);
        const validPrices = prices.filter(price => Number(price.last_price || 0) > 0);

        if (!product || validPrices.length < 2) return null;
        if (query && !product.name.includes(query)) return null;

        const sorted = [...validPrices].sort((a, b) => Number(a.last_price || 0) - Number(b.last_price || 0));
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];
        const saving = Number(worst.last_price || 0) - Number(best.last_price || 0);
        const savingPct = Number(worst.last_price || 0) > 0 ? (saving / Number(worst.last_price || 0)) * 100 : 0;
        const confidence = sorted.reduce((sum, price) => sum + Number(price.price_count || 0), 0);

        return {
          product,
          prices: sorted,
          best,
          worst,
          saving,
          savingPct,
          confidence
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.savingPct - a.savingPct)
      .slice(0, 80) as Array<{
        product: Product;
        prices: ProductMarketPrice[];
        best: ProductMarketPrice;
        worst: ProductMarketPrice;
        saving: number;
        savingPct: number;
        confidence: number;
      }>;
  }, [productPriceGroups, products, priceSearch]);

  const totalComparableSaving = comparableProducts.reduce((sum, item) => sum + Number(item.saving || 0), 0);
  const leadingMarket = useMemo(() => {
    const wins = new Map<string, number>();

    for (const item of comparableProducts) {
      wins.set(item.best.market_name, (wins.get(item.best.market_name) || 0) + 1);
    }

    return Array.from(wins.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
  }, [comparableProducts]);

  const risingProducts = useMemo(() => {
    return products
      .filter(product => product.last_price && product.avg_price && product.last_price > product.avg_price)
      .map(product => ({
        ...product,
        pct: product.avg_price ? ((Number(product.last_price) - Number(product.avg_price)) / Number(product.avg_price)) * 100 : 0
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8);
  }, [products]);

  return (
    <div className="appShell">
      <aside className="sideNav">
        <div className="brand">
          <span>CI</span>
          <div>
            <strong>Compra Inteligente</strong>
            <small>Comparador pessoal</small>
          </div>
        </div>

        <button className={page === 'inicio' ? 'active' : ''} onClick={() => setPage('inicio')}><Home size={18} /> Início</button>
        <button className={page === 'compras' ? 'active' : ''} onClick={() => setPage('compras')}><ListChecks size={18} /> Compras</button>
        <button className={page === 'produtos' ? 'active' : ''} onClick={() => setPage('produtos')}><PackageSearch size={18} /> Produtos</button>
        <button className={page === 'ondeComprar' ? 'active' : ''} onClick={() => setPage('ondeComprar')}><Store size={18} /> Onde Comprar</button>
        <button className={page === 'analises' ? 'active' : ''} onClick={() => setPage('analises')}><BarChart3 size={18} /> Análises</button>
        <button className={page === 'cupons' ? 'active' : ''} onClick={() => { setPage('cupons'); loadCoupons(); }}><FileSearch size={18} /> Cupons</button>
      </aside>

      <main className="workspace">
        <header className="pageHeader">
          <div>
            <p className="eyebrow">NFC-e SP • compras por supermercado</p>
            <h1>{pageTitle(page)}</h1>
          </div>
          <div className="pill">{money(predictedTotal)} previsto</div>
        </header>

        {page === 'inicio' && (
          <section className="pageGrid">
            <div className="heroCard">
              <p>Compra ativa</p>
              <h2>{activeList?.name || 'Nenhuma compra selecionada'}</h2>
              <div className="marketLine"><Store size={16} /> {getMarket(activeList)} {activeList?.purchase_date ? `• ${formatDate(activeList.purchase_date)}` : ''}</div>
              <ProgressBar value={progressPct} label={`${checkedCount} de ${items.length} itens pegos`} />
              <div className="heroStats">
                <span><small>Previsto</small><strong>{money(predictedTotal)}</strong></span>
                <span><small>No carrinho</small><strong>{money(checkedTotal)}</strong></span>
                <span><small>Restante</small><strong>{money(predictedTotal - checkedTotal)}</strong></span>
              </div>
              <button onClick={() => setPage('compras')}><ShoppingCart size={18} /> Continuar compra</button>
            </div>

            <Metric label="Produtos conhecidos" value={String(products.length)} note="Itens no histórico" />
            <Metric label="Cupons importados" value={String(importedCoupons.length)} note={`${pendingCoupons.length} pendentes`} />
            <Metric label="Gasto registrado" value={money(totalPurchased)} note="Baseado no histórico" />
            <Metric label="Melhor mercado da lista" value={bestActiveMarket?.market_name || '-'} note={bestActiveMarket ? `${money(bestActiveMarket.estimated_total)} • ${bestActiveMarket.coverage_pct}% coberto` : 'Sem dados suficientes'} />
            <Metric label="Produtos comparáveis" value={String(comparableProducts.length)} note={`Economia potencial ${money(totalComparableSaving)}`} />

            <section className="card wide">
              <h2>Adicionar produtos recorrentes</h2>
              <ProductPicker products={filteredProducts} search={productSearch} onSearch={setProductSearch} onAdd={addProductFromHistory} />
            </section>
          </section>
        )}

        {page === 'compras' && (
          <section className="pageGrid">
            <section className="card">
              <h2>Nova compra</h2>
              <input value={newListName} onChange={event => setNewListName(event.target.value)} placeholder="Nome da compra" />

              <label className="fieldLabel">Supermercado</label>
              <select value={newMarketName} onChange={event => setNewMarketName(event.target.value)}>
                {DEFAULT_MARKETS.map(market => <option key={market} value={market}>{market}</option>)}
              </select>

              {newMarketName === 'Outro' && (
                <input value={customMarketName} onChange={event => setCustomMarketName(event.target.value)} placeholder="Nome do supermercado" />
              )}

              <label className="fieldLabel">Data da compra</label>
              <input type="date" value={newPurchaseDate} onChange={event => setNewPurchaseDate(event.target.value)} />

              <button onClick={() => createPurchase()}><ListPlus size={18} /> Criar compra</button>

              <h2 className="sectionTitle">Compras abertas</h2>
              <div className="purchaseCards">
                {openLists.map(list => (
                  <PurchaseCard
                    key={list.id}
                    list={list}
                    selected={activeList?.id === list.id}
                    itemCount={activeList?.id === list.id ? items.length : undefined}
                    checkedCount={activeList?.id === list.id ? checkedCount : undefined}
                    onClick={() => setActiveList(list)}
                  />
                ))}
                {openLists.length === 0 && <p className="empty">Nenhuma compra aberta.</p>}
              </div>

              <h2 className="sectionTitle">Concluídas</h2>
              <div className="purchaseCards compactCards">
                {doneLists.slice(0, 8).map(list => (
                  <PurchaseCard
                    key={list.id}
                    list={list}
                    selected={activeList?.id === list.id}
                    onClick={() => setActiveList(list)}
                    onDuplicate={() => duplicatePurchase(list)}
                    onReopen={() => reopenPurchase(list)}
                    onArchive={() => archivePurchase(list)}
                  />
                ))}
              </div>
            </section>

            <section className="card wide marketMode">
              <div className="cardTop">
                <div>
                  <h2>{activeList?.name || 'Compra ativa'}</h2>
                  <p className="muted"><Store size={14} /> {getMarket(activeList)} {activeList?.purchase_date ? `• ${formatDate(activeList.purchase_date)}` : ''}</p>
                </div>
                <div className="actions">
                  <button onClick={duplicateActiveList} disabled={!activeList}><Copy size={16} /> Duplicar</button>
                  <button onClick={finishActiveList} disabled={!activeList}><Check size={16} /> Concluir</button>
                </div>
              </div>

              <ProgressBar value={progressPct} label={`${checkedCount} de ${items.length} itens pegos`} />
              <Summary predicted={predictedTotal} checked={checkedTotal} />

              {activeListMarketOptions.length > 0 && (
                <div className="marketComparisonBox">
                  <h3>Melhor mercado para esta compra</h3>
                  <div className="marketOptions">
                    {activeListMarketOptions.map((option, index) => (
                      <div className={`marketOption ${index === 0 ? 'best' : ''}`} key={option.market_name}>
                        <div>
                          <strong>{index === 0 ? '🏆 ' : ''}{option.market_name}</strong>
                          <span>{option.priced_item_count} de {option.item_count} itens com preço conhecido • {option.coverage_pct}%</span>
                        </div>
                        <b>{money(option.estimated_total)}</b>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="manualAdd">
                <h3>Adicionar item manual</h3>
                <input list="products" value={productName} onChange={event => setProductName(event.target.value)} placeholder="Produto" />
                <datalist id="products">
                  {products.map(product => (
                    <option key={product.id} value={product.name}>{product.name} • {money(product.last_price || product.avg_price)}</option>
                  ))}
                </datalist>
                <div className="threeFields">
                  <input type="number" min="0.01" step="0.01" value={qty} onChange={event => setQty(Number(event.target.value))} />
                  <input value={unit} onChange={event => setUnit(event.target.value)} />
                  <input type="number" min="0" step="0.01" value={price} onChange={event => setPrice(Number(event.target.value))} placeholder="Preço opcional" />
                </div>
                <button onClick={addItem}><Plus size={18} /> Adicionar</button>
              </div>

              <ItemList items={items} products={products} onToggle={toggleItem} onRemove={removeItem} onQuantityChange={updateItemQuantity} />
            </section>

            <section className="card wide">
              <h2>Produtos do histórico</h2>
              <ProductPicker products={filteredProducts} search={productSearch} onSearch={setProductSearch} onAdd={addProductFromHistory} />
            </section>
          </section>
        )}

        {page === 'produtos' && (
          <section className="pageGrid">
            <section className="card wide">
              <div className="cardTop">
                <div>
                  <h2>Catálogo de produtos</h2>
                  <p className="muted">Produtos importados de cupons e lançamentos manuais.</p>
                </div>
                <div className="actions">
                  <button onClick={loadAll}><RefreshCw size={18} /> Atualizar</button>
                  <button onClick={autoCategorizeAllVisible}>Recategorizar visíveis</button>
                </div>
              </div>

              <ProductPicker
                products={filteredProducts}
                search={productSearch}
                onSearch={setProductSearch}
                onAdd={addProductFromHistory}
                categoryFilter={categoryFilter}
                onCategoryFilter={setCategoryFilter}
                availableCategories={availableCategories}
                onUpdateCategory={updateProductCategory}
                onAutoCategorize={autoCategorizeProduct}
                showCategoryTools
                marketPricesByProduct={productPriceGroups}
              />
            </section>

            <section className="card wide">
              <div className="cardTop">
                <div>
                  <h2>Unificar produtos duplicados</h2>
                  <p className="muted">Escolha o produto principal e o nome duplicado que deve virar alias.</p>
                </div>
                <button onClick={loadDuplicateCandidates}><RefreshCw size={18} /> Buscar candidatos</button>
              </div>

              <div className="mergeBox">
                <label>
                  Produto principal
                  <select value={selectedMasterProductId} onChange={event => setSelectedMasterProductId(event.target.value)}>
                    <option value="">Selecione o produto principal</option>
                    {products.map(product => (
                      <option key={product.id} value={product.id}>{product.name}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Produto duplicado
                  <select value={selectedDuplicateProductId} onChange={event => setSelectedDuplicateProductId(event.target.value)}>
                    <option value="">Selecione o duplicado</option>
                    {products.filter(product => product.id !== selectedMasterProductId).map(product => (
                      <option key={product.id} value={product.id}>{product.name}</option>
                    ))}
                  </select>
                </label>

                <button onClick={() => mergeSelectedProducts()}>Unificar produtos</button>
              </div>

              <h3>Candidatos prováveis</h3>
              <div className="duplicateCandidates">
                {duplicateCandidates.map(candidate => (
                  <div className="duplicateCandidate" key={`${candidate.product_a_id}-${candidate.product_b_id}`}>
                    <div>
                      <strong>{candidate.product_a_name}</strong>
                      <span>{candidate.product_b_name}</span>
                      <small>Similaridade: {Math.round(Number(candidate.score || 0) * 100)}%</small>
                    </div>
                    <div className="duplicateActions">
                      <button onClick={() => mergeSelectedProducts(candidate.product_a_id, candidate.product_b_id)}>A é principal</button>
                      <button onClick={() => mergeSelectedProducts(candidate.product_b_id, candidate.product_a_id)}>B é principal</button>
                    </div>
                  </div>
                ))}
                {duplicateCandidates.length === 0 && <p className="empty">Nenhum candidato encontrado ainda.</p>}
              </div>
            </section>

            <section className="card">
              <h2>Registrar preço manual</h2>
              <input value={purchaseProduct} onChange={event => setPurchaseProduct(event.target.value)} placeholder="Produto comprado" />
              <label className="fieldLabel">Supermercado</label>
              <input value={purchaseMarket} onChange={event => setPurchaseMarket(event.target.value)} placeholder="Supermercado" />
              <div className="threeFields">
                <input type="number" min="0.01" step="0.01" value={purchaseQty} onChange={event => setPurchaseQty(Number(event.target.value))} />
                <input value={purchaseUnit} onChange={event => setPurchaseUnit(event.target.value)} />
                <input type="number" min="0" step="0.01" value={purchasePrice} onChange={event => setPurchasePrice(Number(event.target.value))} placeholder="Preço unitário" />
              </div>
              <button onClick={saveManualPurchase}><Save size={18} /> Salvar</button>
            </section>

            <section className="card">
              <h2>Produtos que subiram</h2>
              <MiniRows rows={risingProducts.map(product => ({ title: product.name, note: `${product.pct.toFixed(1)}% acima da média` }))} empty="Ainda não há variação suficiente." />
            </section>
          </section>
        )}

        {page === 'ondeComprar' && (
          <section className="pageGrid">
            <Metric label="Produtos comparáveis" value={String(comparableProducts.length)} note="Com preço em mais de um mercado" />
            <Metric label="Economia potencial" value={money(totalComparableSaving)} note="Diferença entre pior e melhor preço" />
            <Metric label="Mercado mais competitivo" value={leadingMarket} note="Mais vezes com menor preço" />

            <section className="card wide">
              <div className="cardTop">
                <div>
                  <h2>Comparação de preços</h2>
                  <p className="muted">Produtos com preço registrado em mais de um mercado.</p>
                </div>
                <button onClick={loadAll}><RefreshCw size={18} /> Atualizar</button>
              </div>

              <div className="searchBox">
                <Search size={18} />
                <input
                  value={priceSearch}
                  onChange={event => setPriceSearch(event.target.value)}
                  placeholder="Buscar produto para comparar..."
                />
              </div>

              <div className="priceComparisonList">
                {comparableProducts.map(item => (
                  <div className="priceComparisonCard" key={item.product.id}>
                    <div className="priceComparisonHeader">
                      <div>
                        <strong>{item.product.name}</strong>
                        <span>
                          Melhor: {item.best.market_name} • Economia até {money(item.saving)} ({item.savingPct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className={`confidenceBadge ${item.confidence >= 5 ? 'high' : 'low'}`}>
                        {item.confidence >= 5 ? 'Alta confiança' : 'Baixa confiança'}
                      </div>
                    </div>

                    <div className="priceRows">
                      {item.prices.map((price, index) => (
                        <div className={`priceRow ${index === 0 ? 'best' : ''}`} key={`${item.product.id}-${price.market_name}`}>
                          <span>{index === 0 ? '🥇 ' : ''}{price.market_name}</span>
                          <strong>{money(price.last_price)}</strong>
                          <small>{price.discount_amount ? `desc. ${money(price.discount_amount)}` : `${price.price_count || 0} registro(s)`}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {comparableProducts.length === 0 && (
                  <p className="empty">Ainda não há produtos com preço em mais de um mercado. Importe mais cupons para comparar.</p>
                )}
              </div>
            </section>
          </section>
        )}

        {page === 'analises' && (
          <section className="pageGrid">
            <Metric label="Total gasto registrado" value={money(totalPurchased)} note={`${purchases.length} itens comprados`} />
            <Metric label="Produtos monitorados" value={String(products.length)} note="Com preço médio/último preço" />
            <Metric label="Compras criadas" value={String(lists.length)} note={`${openLists.length} abertas`} />

            <section className="card wide">
              <h2>Gasto mensal</h2>
              <div className="analyticsGrid">
                {monthlySummary.slice(0, 6).map(month => (
                  <div className="analyticsCard" key={month.month}>
                    <span>{new Date(`${month.month}T00:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</span>
                    <strong>{money(month.total_spent)}</strong>
                    <small>{month.item_count} itens • {month.market_count} mercado(s)</small>
                  </div>
                ))}
                {monthlySummary.length === 0 && <p className="empty">Importe cupons para gerar o histórico mensal.</p>}
              </div>
            </section>

            <section className="card">
              <h2>Gastos por supermercado</h2>
              <MiniRows rows={marketTotals.map(item => ({ title: item.market, note: money(item.total) }))} empty="Importe cupons para comparar mercados." />
            </section>

            <section className="card">
              <h2>Produtos mais relevantes</h2>
              <MiniRows rows={topPurchasedProducts.map(product => ({ title: product.name, note: `${money(product.total)} • ${product.count} registros` }))} empty="Importe cupons para gerar análises." />
            </section>

            <section className="card">
              <h2>Maiores altas</h2>
              <MiniRows rows={risingProducts.map(product => ({ title: product.name, note: `${money(product.last_price)} vs média ${money(product.avg_price)}` }))} empty="Ainda não há histórico suficiente." />
            </section>
          </section>
        )}

        {page === 'cupons' && (
          <section className="pageGrid">
            <section className="card wide">
              <h2>Scanner NFC-e</h2>
              <p className="muted">Cole o link do QR Code ou use a câmera. Depois clique em Importar.</p>
              <QrScanner onDetected={value => { setQrUrl(value); saveQrLink(value); }} />
              <textarea value={qrUrl} onChange={event => setQrUrl(event.target.value)} placeholder="Cole aqui a URL do QR Code do cupom NFC-e" />
              <button onClick={() => saveQrLink(qrUrl)}><Save size={18} /> Salvar QR Code</button>
              {scanMessage && <p className="notice">{scanMessage}</p>}
            </section>

            <section className="card wide">
              <div className="cardTop">
                <div>
                  <h2>Cupons NFC-e</h2>
                  <p className="muted">{pendingCoupons.length} pendentes • {importedCoupons.length} importados</p>
                </div>
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
                      <span className="muted">{coupon.qr_url.slice(0, 120)}...</span>
                    </div>

                    <button onClick={() => importCoupon(coupon)} disabled={importingId === coupon.id || coupon.status === 'imported'}>
                      {importingId === coupon.id ? 'Importando...' : coupon.status === 'imported' ? 'Importado' : 'Importar'}
                    </button>
                  </div>
                ))}

                {coupons.length === 0 && <p className="empty">Nenhum cupom salvo ainda.</p>}
              </div>
            </section>
          </section>
        )}
      </main>
    </div>
  );
}

function pageTitle(page: string) {
  const titles: Record<string, string> = {
    inicio: 'Início',
    compras: 'Compras',
    produtos: 'Produtos',
    ondeComprar: 'Onde Comprar',
    analises: 'Análises',
    cupons: 'Cupons NFC-e'
  };

  return titles[page] || 'Compra Inteligente';
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metricCard"><small>{label}</small><strong>{value}</strong><span>{note}</span></div>;
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="progressBlock">
      <div className="progressInfo">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="progressTrack">
        <div className="progressFill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

function Summary({ predicted, checked }: { predicted: number; checked: number }) {
  return (
    <div className="summary">
      <div><span>Previsto</span><strong>{money(predicted)}</strong></div>
      <div><span>No carrinho</span><strong>{money(checked)}</strong></div>
      <div><span>Restante</span><strong>{money(predicted - checked)}</strong></div>
    </div>
  );
}

function PurchaseCard({
  list,
  selected,
  itemCount,
  checkedCount,
  onClick,
  onDuplicate,
  onReopen,
  onArchive
}: {
  list: ShoppingList;
  selected: boolean;
  itemCount?: number;
  checkedCount?: number;
  onClick: () => void;
  onDuplicate?: () => void;
  onReopen?: () => void;
  onArchive?: () => void;
}) {
  const progress = itemCount ? Math.round(((checkedCount || 0) / itemCount) * 100) : 0;

  return (
    <div className={`purchaseCard ${selected ? 'selected' : ''}`}>
      <button className="purchaseCardMain" onClick={onClick}>
        <div className="purchaseIcon"><ShoppingCart size={18} /></div>
        <div>
          <strong>{list.name}</strong>
          <span><Store size={13} /> {getMarket(list)}</span>
          <span>{list.purchase_date ? formatDate(list.purchase_date) : formatDate(list.created_at)} • {money(list.predicted_total)} previsto</span>
          {itemCount !== undefined && (
            <small>{checkedCount || 0} de {itemCount} itens • {progress}%</small>
          )}
        </div>
      </button>

      {(onDuplicate || onReopen || onArchive) && (
        <div className="purchaseCardActions">
          {onDuplicate && <button type="button" onClick={onDuplicate}><Copy size={14} /> Duplicar</button>}
          {onReopen && <button type="button" onClick={onReopen}><RefreshCw size={14} /> Reabrir</button>}
          {onArchive && <button type="button" onClick={onArchive}><Trash2 size={14} /> Ocultar</button>}
        </div>
      )}
    </div>
  );
}

function ItemList({
  items,
  products,
  onToggle,
  onRemove,
  onQuantityChange
}: {
  items: ListItem[];
  products: Product[];
  onToggle: (item: ListItem) => void;
  onRemove: (item: ListItem) => void;
  onQuantityChange: (item: ListItem, quantity: number) => void;
}) {
  const pendingItems = items.filter(item => !item.checked);
  const boughtItems = items.filter(item => item.checked);

  return (
    <div className="marketList">
      <CategorizedItemGroups
        title="Pendentes"
        subtitle={`${pendingItems.length} item(ns) para pegar`}
        items={pendingItems}
        products={products}
        onToggle={onToggle}
        onRemove={onRemove}
        onQuantityChange={onQuantityChange}
      />

      <CategorizedItemGroups
        title="Pegos"
        subtitle={`${boughtItems.length} item(ns) no carrinho`}
        items={boughtItems}
        products={products}
        onToggle={onToggle}
        onRemove={onRemove}
        onQuantityChange={onQuantityChange}
        done
      />

      {items.length === 0 && <p className="empty">Adicione produtos à compra.</p>}
    </div>
  );
}

function CategorizedItemGroups({
  title,
  subtitle,
  items,
  products,
  onToggle,
  onRemove,
  onQuantityChange,
  done = false
}: {
  title: string;
  subtitle: string;
  items: ListItem[];
  products: Product[];
  onToggle: (item: ListItem) => void;
  onRemove: (item: ListItem) => void;
  onQuantityChange: (item: ListItem, quantity: number) => void;
  done?: boolean;
}) {
  if (items.length === 0) return null;

  const grouped = groupItemsByCategory(items, products);

  return (
    <section className={`itemGroup ${done ? 'doneGroup' : ''}`}>
      <div className="itemGroupHeader">
        <h3>{title}</h3>
        <span>{subtitle}</span>
      </div>

      <div className="categoryGroups">
        {grouped.map(([category, categoryItems]) => (
          <div className="categoryGroup" key={`${title}-${category}`}>
            <div className="categoryHeader">
              <span><Tag size={14} /> {category}</span>
              <small>{categoryItems.length} item(ns)</small>
            </div>

            <div className="items marketItems">
              {categoryItems.map(item => (
                <div className={'item marketItem ' + (item.checked ? 'done' : '')} key={item.id}>
                  <button className="check bigCheck" onClick={() => onToggle(item)}>
                    {item.checked ? <Check size={22} /> : <Circle size={22} />}
                  </button>

                  <div className="itemMain">
                    <strong>{item.product_name}</strong>
                    <span>{item.quantity} {item.unit} × {money(item.estimated_unit_price)} = {money(item.quantity * item.estimated_unit_price)}</span>

                    <div className="qtyEditor">
                      <button type="button" onClick={() => onQuantityChange(item, Number(item.quantity) - 1)}><Minus size={14} /></button>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={item.quantity}
                        onChange={event => onQuantityChange(item, Number(event.target.value))}
                        aria-label={`Quantidade de ${item.product_name}`}
                      />
                      <button type="button" onClick={() => onQuantityChange(item, Number(item.quantity) + 1)}><Plus size={14} /></button>
                    </div>
                  </div>

                  <button className="icon" onClick={() => onRemove(item)}><Trash2 size={18} /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MiniRows({ rows, empty }: { rows: { title: string; note: string }[]; empty: string }) {
  return (
    <div className="stack">
      {rows.map(row => (
        <div className="miniRow" key={row.title}>
          <strong>{row.title}</strong>
          <span>{row.note}</span>
        </div>
      ))}
      {rows.length === 0 && <p className="empty">{empty}</p>}
    </div>
  );
}

function ProductPicker({
  products,
  search,
  onSearch,
  onAdd,
  categoryFilter = 'Todas',
  onCategoryFilter,
  availableCategories = [],
  onUpdateCategory,
  onAutoCategorize,
  showCategoryTools = false,
  marketPricesByProduct
}: {
  products: Product[];
  search: string;
  onSearch: (value: string) => void;
  onAdd: (product: Product) => void;
  categoryFilter?: string;
  onCategoryFilter?: (value: string) => void;
  availableCategories?: string[];
  onUpdateCategory?: (product: Product, category: string) => void;
  onAutoCategorize?: (product: Product) => void;
  showCategoryTools?: boolean;
  marketPricesByProduct?: Map<string, ProductMarketPrice[]>;
}) {
  return (
    <>
      <div className="searchBox">
        <Search size={18} />
        <input
          value={search}
          onChange={event => onSearch(event.target.value)}
          placeholder="Buscar produto já comprado..."
        />
      </div>

      {showCategoryTools && onCategoryFilter && (
        <div className="categoryToolbar">
          <label>
            Filtrar categoria
            <select value={categoryFilter} onChange={event => onCategoryFilter(event.target.value)}>
              {availableCategories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="productPicker">
        {products.map(product => {
          const category = product.category || inferCategory(product.name);

          return (
            <div className="productOption" key={product.id}>
              <div>
                <strong>{product.name}</strong>
                <span>
                  <span className="categoryChip">{category}</span>
                  Último: {money(product.last_price)} • Média: {money(product.avg_price)} • {product.default_unit || 'un'}
                </span>

                {showCategoryTools && marketPricesByProduct?.get(product.id)?.length ? (
                  <div className="marketPriceList">
                    {marketPricesByProduct.get(product.id)!.slice(0, 4).map(price => (
                      <div className="marketPriceRow" key={`${product.id}-${price.market_name}`}>
                        <span>{price.market_name}</span>
                        <strong>{money(price.last_price)}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}

                {showCategoryTools && onUpdateCategory && (
                  <div className="categoryEditor">
                    <select value={category} onChange={event => onUpdateCategory(product, event.target.value)}>
                      {CATEGORY_ORDER.map(item => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                    {onAutoCategorize && (
                      <button type="button" onClick={() => onAutoCategorize(product)}>
                        Auto
                      </button>
                    )}
                  </div>
                )}
              </div>

              <button onClick={() => onAdd(product)}><Plus size={16} /> Adicionar</button>
            </div>
          );
        })}

        {products.length === 0 && <p className="empty">Nenhum produto encontrado.</p>}
      </div>
    </>
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
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current!, result => {
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
