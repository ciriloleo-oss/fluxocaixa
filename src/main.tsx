import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserQRCodeReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { supabase } from './lib/supabase';
import {
  BarChart3,
  Camera,
  Image,
  SwitchCamera,
  Check,
  Circle,
  Copy,
  ListChecks,
  ListPlus,
  LogOut,
  Minus,
  PackageSearch,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShoppingCart,
  Store,
  Tag,
  Trash2,
  UserPlus,
  Users,
  Edit3,
  ShieldCheck,
  Ban,
  GitMerge,
  Scale
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


type ProductAlias = {
  id: string;
  product_id: string;
  alias_name: string;
  normalized_alias: string | null;
};

type CatalogSearchResult = {
  name: string;
  brand?: string | null;
  category?: string | null;
  unit?: string | null;
  barcode?: string | null;
  source?: string | null;
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
  coupon_import_id?: string | null;
  canonical_product_id?: string | null;
  canonical_product_name?: string | null;
};

type RecurringProductInsight = {
  product_name: string;
  unit: string | null;
  purchase_count: number;
  total_quantity: number;
  avg_unit_price: number;
  last_purchase_date: string | null;
};

type ProductPriceTrend = {
  product_id: string | null;
  product_name: string;
  market_name: string | null;
  unit: string | null;
  first_price: number | null;
  last_price: number | null;
  variation_pct: number | null;
  purchase_count: number;
  first_purchase_date: string | null;
  last_purchase_date: string | null;
};

type FavoriteProduct = {
  product_id: string;
  product_name: string;
  category: string | null;
  is_favorite: boolean;
  desired_price: number | null;
  created_at: string;
};

type HouseholdInfo = {
  household_id: string;
  household_name: string;
  role: string;
};

type HouseholdMember = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  created_at: string | null;
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
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\bENERG\b/g, 'ENERGETICO')
    .replace(/\bREFRI\b/g, 'REFRIGERANTE')
    .replace(/\bQJO\b/g, 'QUEIJO')
    .replace(/\bMUSS\b/g, 'MUSSARELA')
    .replace(/\bINT\b/g, 'INTEGRAL')
    .replace(/\bTRAD\b/g, 'TRADICIONAL')
    .replace(/(\d+)\s*(ML|L|G|KG)\b/g, '$1$2')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  const [page, setPage] = useState<'inicio' | 'compras' | 'produtos' | 'ondeComprar' | 'analises' | 'cupons'>('compras');
  const [shoppingMode, setShoppingMode] = useState<'planejar' | 'mercado'>('planejar');
  const [products, setProducts] = useState<Product[]>([]);
  const [productAliases, setProductAliases] = useState<ProductAlias[]>([]);
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeList, setActiveList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [coupons, setCoupons] = useState<CouponImport[]>([]);
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [marketPrices, setMarketPrices] = useState<ProductMarketPrice[]>([]);
  const [listMarketComparison, setListMarketComparison] = useState<ListMarketComparison[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([]);
  const [marketSummary, setMarketSummary] = useState<MarketSummary[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [onlineResults, setOnlineResults] = useState<CatalogSearchResult[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  const [recurringInsights, setRecurringInsights] = useState<RecurringProductInsight[]>([]);
  const [priceTrends, setPriceTrends] = useState<ProductPriceTrend[]>([]);
  const [favoriteProducts, setFavoriteProducts] = useState<FavoriteProduct[]>([]);

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

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('cirilo.leo@gmail.com');
  const [authPassword, setAuthPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [memberEmail, setMemberEmail] = useState('');
  const [householdNameDraft, setHouseholdNameDraft] = useState('');
  const [renamingHousehold, setRenamingHousehold] = useState(false);
  const [householdMessage, setHouseholdMessage] = useState('');

  const [insightPeriod, setInsightPeriod] = useState<'currentMonth' | 'previousMonth' | 'threeMonths' | 'sixMonths' | 'year' | 'custom' | 'all'>('currentMonth');
  const [insightProduct, setInsightProduct] = useState('');
  const [insightMarket, setInsightMarket] = useState('Todos');
  const [insightCategory, setInsightCategory] = useState('Todas');
  const [insightSource, setInsightSource] = useState('Todas');
  const [insightStartDate, setInsightStartDate] = useState('');
  const [insightEndDate, setInsightEndDate] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
      setAuthReady(true);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setAuthReady(true);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;

    if (user) {
      bootstrapUserWorkspace();
    } else {
      setProducts([]);
      setLists([]);
      setActiveList(null);
      setItems([]);
      setCoupons([]);
      setPurchases([]);
      setHousehold(null);
      setHouseholdMembers([]);
    }
  }, [authReady, user?.id]);

  useEffect(() => {
    if (activeList) {
      loadItems(activeList.id);
    } else {
      setItems([]);
    }
  }, [activeList?.id]);

  async function bootstrapUserWorkspace() {
    const { error: ensureError } = await supabase.rpc('ensure_user_household');
    if (ensureError) {
      setHouseholdMessage(`Erro ao preparar usuário: ${ensureError.message}`);
      return;
    }

    await supabase.rpc('claim_unassigned_household_data');
    await loadHousehold();
    await loadAll();
    await loadDuplicateCandidates();
  }

  async function loadHousehold() {
    const { data, error } = await supabase.rpc('get_my_household');

    if (!error && data && data.length > 0) {
      setHousehold(data[0]);
      setHouseholdNameDraft(data[0].household_name || 'Minha casa');

      const { data: members, error: membersError } = await supabase.rpc('get_household_members');

      if (!membersError) {
        setHouseholdMembers((members || []) as HouseholdMember[]);
      } else {
        setHouseholdMembers([]);
        setHouseholdMessage(`Não consegui carregar membros: ${membersError.message}`);
      }
    } else {
      setHousehold(null);
      setHouseholdMembers([]);
      setHouseholdNameDraft('');
    }
  }

  async function handleAuthSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthMessage('');

    const credentials = {
      email: authEmail.trim().toLowerCase(),
      password: authPassword,
    };

    const { error } = authMode === 'login'
      ? await supabase.auth.signInWithPassword(credentials)
      : await supabase.auth.signUp(credentials);

    setAuthLoading(false);

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    setAuthMessage(authMode === 'login' ? 'Login realizado.' : 'Cadastro criado. Verifique seu e-mail se a confirmação estiver ativa.');
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function addMemberToHousehold() {
    const email = memberEmail.trim().toLowerCase();
    if (!email) return;

    setHouseholdMessage('Adicionando usuário ao grupo...');
    const { error } = await supabase.rpc('add_household_member_by_email', {
      p_email: email,
    });

    if (error) {
      setHouseholdMessage(error.message);
      return;
    }

    setMemberEmail('');
    setHouseholdMessage('Usuário adicionado ao grupo. Se ele ainda não tiver cadastro, crie o login primeiro e repita este passo.');
    await loadHousehold();
  }


  async function renameCurrentHousehold() {
    const name = householdNameDraft.trim();
    if (!name) {
      setHouseholdMessage('Informe um nome para a casa.');
      return;
    }

    setRenamingHousehold(true);
    setHouseholdMessage('Renomeando casa...');

    const { error } = await supabase.rpc('update_my_household_name', {
      p_name: name,
    });

    setRenamingHousehold(false);

    if (error) {
      setHouseholdMessage(error.message);
      return;
    }

    setHouseholdMessage('Nome da casa atualizado.');
    await loadHousehold();
  }

  async function loadAll() {
    if (!user) return;

    const [productsResponse, aliasesResponse, listsResponse, couponsResponse, purchasesResponse, marketPricesResponse, listMarketResponse, monthlyResponse, marketSummaryResponse, recurringResponse, trendsResponse, favoritesResponse] = await Promise.all([
      supabase.from('product_price_summary').select('*').order('name'),
      supabase.from('product_aliases').select('id, product_id, alias_name, normalized_alias').limit(5000),
      supabase.from('shopping_lists').select('*').order('created_at', { ascending: false }),
      supabase.from('coupon_imports').select('*').order('created_at', { ascending: false }),
      supabase.from('purchase_items').select('*').order('purchase_date', { ascending: false }).limit(500),
      supabase.from('product_market_prices').select('*').order('product_name'),
      supabase.from('shopping_list_market_comparison').select('*'),
      supabase.from('monthly_spending_summary').select('*').limit(12),
      supabase.from('market_spending_summary').select('*').limit(12),
      supabase.from('recurring_product_insights').select('*').limit(20),
      supabase.from('product_price_trends').select('*').limit(40),
      supabase.from('favorite_products').select('*').eq('is_favorite', true).limit(100)
    ]);

    if (!productsResponse.error) setProducts(productsResponse.data || []);
    if (!aliasesResponse.error) setProductAliases(aliasesResponse.data || []);
    if (!couponsResponse.error) setCoupons(couponsResponse.data || []);
    if (!purchasesResponse.error) setPurchases(purchasesResponse.data || []);
    if (!marketPricesResponse.error) setMarketPrices(marketPricesResponse.data || []);
    if (!listMarketResponse.error) setListMarketComparison(listMarketResponse.data || []);
    if (!monthlyResponse.error) setMonthlySummary(monthlyResponse.data || []);
    if (!marketSummaryResponse.error) setMarketSummary(marketSummaryResponse.data || []);
    if (!recurringResponse.error) setRecurringInsights(recurringResponse.data || []);
    if (!trendsResponse.error) setPriceTrends(trendsResponse.data || []);
    if (!favoritesResponse.error) setFavoriteProducts(favoritesResponse.data || []);

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

  async function getOrCreateActiveList() {
    if (activeList?.status !== 'done') return activeList;

    const { data, error } = await supabase
      .from('shopping_lists')
      .insert({
        name: 'Lista atual',
        store_name: newMarketName === 'Outro' ? (customMarketName.trim() || 'Outro') : newMarketName,
        market_name: newMarketName === 'Outro' ? (customMarketName.trim() || 'Outro') : newMarketName,
        purchase_date: todayISO(),
        status: 'open',
        is_archived: false
      })
      .select()
      .single();

    if (error || !data) {
      alert(error?.message || 'Não consegui criar a lista atual.');
      return null;
    }

    setLists(current => [data, ...current]);
    setActiveList(data);
    setItems([]);
    return data as ShoppingList;
  }

  async function clearActiveList() {
    const list = await getOrCreateActiveList();
    if (!list) return;

    if (items.length > 0) {
      const ok = confirm('Limpar todos os itens da lista atual?');
      if (!ok) return;
    }

    await supabase.from('shopping_list_items').delete().eq('list_id', list.id);
    await supabase.rpc('recalculate_list_totals', { p_list_id: list.id });
    setItems([]);
    await loadAll();
  }

  async function finishAndArchiveActiveList() {
    if (!activeList) return;

    const ok = confirm('Concluir esta lista e tirar ela da tela principal? O histórico continuará nas análises.');
    if (!ok) return;

    const { error } = await supabase
      .from('shopping_lists')
      .update({ status: 'done', is_archived: true })
      .eq('id', activeList.id);

    if (error) {
      alert(`Erro ao concluir lista: ${error.message}`);
      return;
    }

    setActiveList(null);
    setItems([]);
    await loadAll();
  }

  async function searchProductsOnline() {
    const query = catalogSearch.trim();
    if (query.length < 2) return;

    setSearchingProducts(true);
    const { data, error } = await supabase.functions.invoke('search-products', {
      body: { query }
    });
    setSearchingProducts(false);

    if (error) {
      alert(`Erro na busca online: ${error.message}`);
      return;
    }

    setOnlineResults(data?.results || []);
  }

  async function addCatalogResultToList(result: CatalogSearchResult, quantity = 1, silent = false) {
    const list = await getOrCreateActiveList();
    if (!list) return;

    const name = normalizeName(result.name);
    const unitValue = result.unit || 'un';

    const { data: product } = await supabase
      .from('products')
      .upsert({ name, default_unit: unitValue, category: result.category || inferCategory(name) }, { onConflict: 'name' })
      .select()
      .single();

    await supabase.from('product_catalog').upsert({
      name,
      brand: result.brand || null,
      category: result.category || inferCategory(name),
      default_unit: unitValue,
      barcode: result.barcode || null,
      source: result.source || 'manual',
      product_id: product?.id || null
    }, { onConflict: 'name' });

    const existingItem = items.find(item => item.product_name === name && item.unit === unitValue && !item.checked);

    let error = null;

    if (existingItem) {
      const response = await supabase
        .from('shopping_list_items')
        .update({ quantity: Number(existingItem.quantity || 0) + Number(quantity || 1) })
        .eq('id', existingItem.id);
      error = response.error;
    } else {
      const response = await supabase.from('shopping_list_items').insert({
        list_id: list.id,
        product_id: product?.id || null,
        product_name: name,
        quantity: Number(quantity || 1),
        unit: unitValue,
        estimated_unit_price: Number(product?.last_price || product?.avg_price || 0),
        checked: false
      });
      error = response.error;
    }

    if (error) {
      alert(`Erro ao adicionar produto: ${error.message}`);
      return;
    }

    if (!silent) {
      setCatalogSearch('');
      setProductName('');
    }

    await loadItems(list.id);
    await refreshListTotals();
  }

  async function addManyCatalogResults(results: CatalogSearchResult[]) {
    if (results.length === 0) return;

    for (const result of results) {
      await addCatalogResultToList(result, 1, true);
    }

    setCatalogSearch('');
    setProductName('');
  }

  async function buyAgain(group: { label: string; items: PurchaseItem[] }) {
    if (group.items.length === 0) return;

    const ok = items.length > 0
      ? confirm(`Adicionar os ${group.items.length} item(ns) de "${group.label}" à lista atual?`)
      : true;

    if (!ok) return;

    const uniqueItems = Array.from(
      group.items.reduce((map, purchase) => {
        const key = `${purchase.product_name}|${purchase.unit || 'un'}`;
        const current = map.get(key) || {
          name: purchase.product_name,
          unit: purchase.unit || 'un',
          quantity: 0,
          category: inferCategory(purchase.product_name),
          source: 'comprar-novamente'
        } as CatalogSearchResult & { quantity: number };

        current.quantity += Number(purchase.quantity || 1);
        map.set(key, current);
        return map;
      }, new Map<string, CatalogSearchResult & { quantity: number }>()).values()
    );

    for (const item of uniqueItems) {
      await addCatalogResultToList(item, item.quantity || 1, true);
    }

    setShoppingMode('planejar');
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

  async function finishAllOpenLists() {
    const openCount = openLists.length;
    if (openCount === 0) return;

    const ok = confirm(`Concluir todas as ${openCount} compra(s) abertas?`);
    if (!ok) return;

    const { error } = await supabase
      .from('shopping_lists')
      .update({ status: 'done' })
      .neq('status', 'done');

    if (error) {
      alert(`Erro ao concluir compras: ${error.message}`);
      return;
    }

    await loadAll();
  }

  async function archiveAllDoneLists() {
    const doneCount = doneLists.length;
    if (doneCount === 0) return;

    const ok = confirm(`Ocultar todas as ${doneCount} compra(s) concluídas da tela? Elas continuarão no histórico e nas análises.`);
    if (!ok) return;

    const { error } = await supabase
      .from('shopping_lists')
      .update({ is_archived: true })
      .eq('status', 'done');

    if (error) {
      alert(`Erro ao ocultar compras concluídas: ${error.message}`);
      return;
    }

    if (activeList?.status === 'done') {
      setActiveList(null);
      setItems([]);
    }

    await loadAll();
  }

  async function deletePurchase(list: ShoppingList) {
    const ok = confirm(`Remover definitivamente a compra "${list.name}"?\n\nOs itens desta lista serão removidos, mas o histórico de compras importado dos cupons não será apagado.`);
    if (!ok) return;

    await supabase.from('shopping_list_items').delete().eq('list_id', list.id);
    const { error } = await supabase.from('shopping_lists').delete().eq('id', list.id);

    if (error) {
      alert(`Erro ao remover compra: ${error.message}`);
      return;
    }

    if (activeList?.id === list.id) {
      setActiveList(null);
      setItems([]);
    }

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
    if (!productName.trim()) return;
    const list = await getOrCreateActiveList();
    if (!list) return;

    const name = normalizeName(productName);
    const existing = products.find(product => product.name === name);
    const estimated = price || existing?.last_price || existing?.avg_price || 0;

    const { error } = await supabase.from('shopping_list_items').insert({
      list_id: list.id,
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
      await loadItems(list.id);
      await refreshListTotals();
    }
  }

  async function addProductFromHistory(product: Product) {
    await addCatalogResultToList({
      name: product.name,
      category: product.category || inferCategory(product.name),
      unit: product.default_unit || 'un',
      source: 'historico'
    });
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


  async function rejectDuplicateCandidate(candidate: any) {
    const ok = confirm(`Marcar "${candidate.product_a_name}" e "${candidate.product_b_name}" como produtos diferentes?\n\nEsse par não será sugerido novamente.`);
    if (!ok) return;

    const { error } = await supabase.rpc('reject_product_match', {
      p_product_a_id: candidate.product_a_id,
      p_product_b_id: candidate.product_b_id,
      p_reason: candidate.decision_reason || 'rejeitado na revisão do catálogo'
    });

    if (error) {
      alert(`Erro ao rejeitar sugestão: ${error.message}`);
      return;
    }

    setDuplicateCandidates(current => current.filter(item =>
      !(item.product_a_id === candidate.product_a_id && item.product_b_id === candidate.product_b_id)
    ));
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


  async function removeCoupon(coupon: CouponImport) {
    const importedCount = Number(coupon.imported_items || 0);
    const warning = importedCount > 0
      ? `Este cupom possui ${importedCount} item(ns) importado(s). Remover o cupom também apagará esses lançamentos do histórico. Deseja continuar?`
      : 'Remover este cupom pendente?';

    if (!confirm(warning)) return;

    const { data, error } = await supabase.rpc('delete_coupon_import', {
      p_coupon_id: coupon.id
    });

    if (error) {
      alert(`Erro ao remover cupom: ${error.message}`);
      return;
    }

    const deletedItems = Number(data?.deleted_items || 0);
    alert(deletedItems > 0
      ? `Cupom removido. ${deletedItems} lançamento(s) vinculado(s) também foram apagados.`
      : 'Cupom removido com sucesso.');

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

  const aliasProductIdsByQuery = useMemo(() => {
    const query = normalizeName(productSearch);
    if (!query) return new Set<string>();
    return new Set(
      productAliases
        .filter(alias => normalizeName(alias.alias_name).includes(query))
        .map(alias => alias.product_id)
    );
  }, [productAliases, productSearch]);

  const filteredProducts = useMemo(() => {
    const query = normalizeName(productSearch);

    return products
      .filter(product => !query || normalizeName(product.name).includes(query) || aliasProductIdsByQuery.has(product.id))
      .filter(product => categoryFilter === 'Todas' || (product.category || inferCategory(product.name)) === categoryFilter)
      .slice(0, 120);
  }, [products, productSearch, categoryFilter, aliasProductIdsByQuery]);

  const productById = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const aliasToProductId = useMemo(() => {
    const map = new Map<string, string>();
    for (const alias of productAliases) map.set(normalizeName(alias.alias_name), alias.product_id);
    for (const product of products) map.set(normalizeName(product.name), product.id);
    return map;
  }, [productAliases, products]);

  function canonicalPurchase(purchase: PurchaseItem) {
    const productId = purchase.product_id || aliasToProductId.get(normalizeName(purchase.product_name)) || null;
    const product = productId ? productById.get(productId) : undefined;
    return {
      productId,
      productName: product?.name || purchase.canonical_product_name || purchase.product_name,
      normalizedName: normalizeName(product?.name || purchase.canonical_product_name || purchase.product_name)
    };
  }

  const visibleLists = lists.filter(list => !list.is_archived);
  const openLists = visibleLists.filter(list => list.status !== 'done');
  const doneLists = visibleLists.filter(list => list.status === 'done');
  const importedCoupons = coupons.filter(coupon => coupon.status === 'imported');
  const pendingCoupons = coupons.filter(coupon => coupon.status !== 'imported');
  const insightMarkets = useMemo(() => {
    return ['Todos', ...Array.from(new Set(purchases.map(item => item.store_name || 'Sem mercado'))).sort()];
  }, [purchases]);

  const insightSources = useMemo(() => {
    return ['Todas', ...Array.from(new Set(purchases.map(item => item.source || 'Não informada'))).sort()];
  }, [purchases]);

  const insightDateRange = useMemo(() => {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let start: Date | null = null;
    let rangeEnd: Date | null = end;

    if (insightPeriod === 'currentMonth') start = new Date(today.getFullYear(), today.getMonth(), 1);
    if (insightPeriod === 'previousMonth') {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      rangeEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    }
    if (insightPeriod === 'threeMonths') start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    if (insightPeriod === 'sixMonths') start = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    if (insightPeriod === 'year') start = new Date(today.getFullYear(), 0, 1);
    if (insightPeriod === 'custom') {
      start = insightStartDate ? new Date(`${insightStartDate}T00:00:00`) : null;
      rangeEnd = insightEndDate ? new Date(`${insightEndDate}T23:59:59`) : null;
    }
    if (insightPeriod === 'all') return { start: null, end: null };

    return { start, end: rangeEnd };
  }, [insightPeriod, insightStartDate, insightEndDate]);

  const filteredInsightPurchases = useMemo(() => {
    const productQuery = normalizeName(insightProduct);

    return purchases.filter(purchase => {
      const purchaseDate = new Date(`${purchase.purchase_date}T12:00:00`);
      if (insightDateRange.start && purchaseDate < insightDateRange.start) return false;
      if (insightDateRange.end && purchaseDate > insightDateRange.end) return false;
      const canonical = canonicalPurchase(purchase);
      const aliasMatches = purchase.product_id
        ? productAliases.some(alias => alias.product_id === purchase.product_id && normalizeName(alias.alias_name).includes(productQuery))
        : false;
      if (productQuery && !canonical.normalizedName.includes(productQuery) && !normalizeName(purchase.product_name).includes(productQuery) && !aliasMatches) return false;
      if (insightMarket !== 'Todos' && (purchase.store_name || 'Sem mercado') !== insightMarket) return false;
      if (insightSource !== 'Todas' && (purchase.source || 'Não informada') !== insightSource) return false;
      if (insightCategory !== 'Todas' && getProductCategory(canonical.productName, products) !== insightCategory) return false;
      return true;
    });
  }, [purchases, products, productAliases, aliasToProductId, productById, insightDateRange, insightProduct, insightMarket, insightSource, insightCategory]);

  const totalPurchased = purchases.reduce((sum, purchase) => sum + Number(purchase.total_price || 0), 0);
  const insightTotalPurchased = filteredInsightPurchases.reduce((sum, purchase) => sum + Number(purchase.total_price || 0), 0);
  const insightProductCount = new Set(filteredInsightPurchases.map(item => canonicalPurchase(item).productId || canonicalPurchase(item).normalizedName)).size;
  const insightMarketCount = new Set(filteredInsightPurchases.map(item => item.store_name || 'Sem mercado')).size;
  const insightPurchaseCount = new Set(filteredInsightPurchases.map(item => item.coupon_import_id || `${item.purchase_date}-${item.store_name || 'manual'}`)).size;
  const insightAverageTicket = insightPurchaseCount ? insightTotalPurchased / insightPurchaseCount : 0;
  const insightAverageItem = filteredInsightPurchases.length ? insightTotalPurchased / filteredInsightPurchases.length : 0;

  const marketTotals = useMemo(() => {
    const map = new Map<string, number>();

    for (const purchase of filteredInsightPurchases) {
      const market = purchase.store_name || 'Sem mercado';
      map.set(market, (map.get(market) || 0) + Number(purchase.total_price || 0));
    }

    return Array.from(map.entries())
      .map(([market, total]) => ({ market, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [filteredInsightPurchases]);

  const topPurchasedProducts = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number; quantity: number }>();

    for (const purchase of filteredInsightPurchases) {
      const canonical = canonicalPurchase(purchase);
      const key = canonical.productId || canonical.normalizedName;
      const current = map.get(key) || { name: canonical.productName, total: 0, count: 0, quantity: 0 };
      current.total += Number(purchase.total_price || 0);
      current.count += 1;
      current.quantity += Number(purchase.quantity || 0);
      map.set(key, current);
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [filteredInsightPurchases, aliasToProductId, productById]);

  const insightMonthlyTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const purchase of filteredInsightPurchases) {
      const month = purchase.purchase_date.slice(0, 7);
      map.set(month, (map.get(month) || 0) + Number(purchase.total_price || 0));
    }
    return Array.from(map.entries())
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 12);
  }, [filteredInsightPurchases]);

  function clearInsightFilters() {
    setInsightPeriod('currentMonth');
    setInsightProduct('');
    setInsightMarket('Todos');
    setInsightCategory('Todas');
    setInsightSource('Todas');
    setInsightStartDate('');
    setInsightEndDate('');
  }


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

  const recurringSuggestionTotal = recurringInsights
    .slice(0, 12)
    .reduce((sum, item) => sum + Number(item.avg_unit_price || 0), 0);

  const favoritesWithAlert = favoriteProducts.filter(favorite => {
    if (!favorite.desired_price) return false;
    const product = products.find(item => item.id === favorite.product_id);
    return Number(product?.last_price || 0) > 0 && Number(product?.last_price || 0) <= Number(favorite.desired_price);
  });

  const biggestInflation = priceTrends
    .filter(item => Number(item.variation_pct || 0) > 0)
    .sort((a, b) => Number(b.variation_pct || 0) - Number(a.variation_pct || 0))
    .slice(0, 8);

  const localCatalogMatches = useMemo(() => {
    const query = normalizeName(catalogSearch);
    if (!query) return filteredProducts.slice(0, 12).map(product => ({
      name: product.name,
      category: product.category || inferCategory(product.name),
      unit: product.default_unit || 'un',
      source: 'historico'
    }));

    return products
      .filter(product => product.name.includes(query))
      .slice(0, 12)
      .map(product => ({
        name: product.name,
        category: product.category || inferCategory(product.name),
        unit: product.default_unit || 'un',
        source: 'historico'
      }));
  }, [catalogSearch, products, filteredProducts]);

  const mergedCatalogResults = useMemo(() => {
    const map = new Map<string, CatalogSearchResult>();
    for (const item of localCatalogMatches) map.set(normalizeName(item.name), item);
    for (const item of onlineResults) map.set(normalizeName(item.name), item);
    return Array.from(map.values()).slice(0, 24);
  }, [localCatalogMatches, onlineResults]);

  const favoriteQuickAdds = useMemo(() => {
    const favoriteIds = new Set(favoriteProducts.map(favorite => favorite.product_id));

    const fromFavorites = products
      .filter(product => favoriteIds.has(product.id))
      .slice(0, 12)
      .map(product => ({
        name: product.name,
        category: product.category || inferCategory(product.name),
        unit: product.default_unit || 'un',
        source: 'favorito'
      }));

    if (fromFavorites.length > 0) return fromFavorites;

    return recurringInsights.slice(0, 12).map(item => ({
      name: item.product_name,
      category: inferCategory(item.product_name),
      unit: item.unit || 'un',
      source: 'mais-comprado'
    }));
  }, [favoriteProducts, products, recurringInsights]);

  const recentQuickAdds = useMemo(() => {
    const map = new Map<string, CatalogSearchResult>();

    for (const purchase of purchases) {
      const name = normalizeName(purchase.product_name);
      if (!name || map.has(name)) continue;

      map.set(name, {
        name,
        category: inferCategory(name),
        unit: purchase.unit || 'un',
        source: 'recente'
      });

      if (map.size >= 12) break;
    }

    return Array.from(map.values());
  }, [purchases]);

  const weeklySuggestions = useMemo(() => {
    return recurringInsights.slice(0, 8).map(item => ({
      name: item.product_name,
      category: inferCategory(item.product_name),
      unit: item.unit || 'un',
      source: 'sugestao-semana'
    }));
  }, [recurringInsights]);

  const buyAgainGroups = useMemo(() => {
    const map = new Map<string, { label: string; date: string; items: PurchaseItem[] }>();

    for (const purchase of purchases) {
      const key = `${purchase.purchase_date}|${purchase.store_name || 'Mercado'}`;
      const dateLabel = formatDate(purchase.purchase_date);
      const label = `${purchase.store_name || 'Mercado'} • ${dateLabel}`;
      const current = map.get(key) || { label, date: purchase.purchase_date, items: [] };
      current.items.push(purchase);
      map.set(key, current);
    }

    return Array.from(map.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [purchases]);

  if (!authReady) {
    return (
      <div className="authShell">
        <div className="authCard">
          <div className="appLogo authLogo">CI</div>
          <h1>Carregando...</h1>
          <p>Preparando sua sessão.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        authMode={authMode}
        setAuthMode={setAuthMode}
        email={authEmail}
        setEmail={setAuthEmail}
        password={authPassword}
        setPassword={setAuthPassword}
        message={authMessage}
        loading={authLoading}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  return (
    <div className="mobileAppShell">
      <header className="appTopBar">
        <div className="appLogo">CI</div>
        <div>
          <strong>Compra Inteligente</strong>
          <span>{household?.household_name || 'Minha casa'} • {items.length} item(ns) • {money(predictedTotal)} previsto</span>
        </div>
      </header>

      <main className="mobileWorkspace">
        <header className="pageHeader appPageHeader">
          <div>
            <p className="eyebrow">{pageEyebrow(page, shoppingMode)}</p>
            <h1>{mobilePageTitle(page, shoppingMode)}</h1>
          </div>
          {page === 'compras' && (
            <button
              type="button"
              className="pill actionPill"
              onClick={() => setShoppingMode(shoppingMode === 'planejar' ? 'mercado' : 'planejar')}
              disabled={items.length === 0 && shoppingMode === 'planejar'}
            >
              {shoppingMode === 'planejar' ? 'Ir ao mercado' : 'Editar lista'}
            </button>
          )}
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
          <section className="shoppingFlow">
            <section className="card wide shoppingModeHeader">
              <div>
                <p className="eyebrow">Lista ativa</p>
                <h2>{activeList?.name || 'Lista atual'}</h2>
                <p className="muted">Planeje em casa. No mercado, use uma tela limpa só para marcar o que pegou.</p>
              </div>

              <div className="modeSwitch" role="tablist" aria-label="Modo da lista de compras">
                <button
                  type="button"
                  className={shoppingMode === 'planejar' ? 'active' : ''}
                  onClick={() => setShoppingMode('planejar')}
                >
                  Planejar
                </button>
                <button
                  type="button"
                  className={shoppingMode === 'mercado' ? 'active' : ''}
                  onClick={() => setShoppingMode('mercado')}
                >
                  No mercado
                </button>
              </div>
            </section>

            {shoppingMode === 'planejar' && (
              <>
                <section className="card wide plannerHero">
                  <div className="cardTop">
                    <div>
                      <h2>Montar lista</h2>
                      <p className="muted">Adicione produtos, ajuste quantidades e deixe tudo pronto antes de sair.</p>
                    </div>
                    <div className="actions">
                      <button type="button" onClick={clearActiveList}><Trash2 size={16} /> Limpar lista</button>
                      <button type="button" onClick={() => setShoppingMode('mercado')} disabled={items.length === 0}><ShoppingCart size={16} /> Ir para mercado</button>
                    </div>
                  </div>

                  <div className="plannerStats">
                    <Metric label="Itens na lista" value={String(items.length)} note={`${checkedCount} já marcados`} />
                    <Metric label="Estimativa" value={money(predictedTotal)} note="Com preços conhecidos" />
                    <Metric label="Melhor mercado" value={bestActiveMarket?.market_name || '-'} note={bestActiveMarket ? `${money(bestActiveMarket.estimated_total)} • ${bestActiveMarket.coverage_pct}% coberto` : 'Sem dados suficientes'} />
                  </div>
                </section>

                <section className="card wide quickShoppingCard">
                  <div className="quickShoppingHeader">
                    <div>
                      <p className="eyebrow">Compra rápida</p>
                      <h2>Monte a lista em poucos toques</h2>
                      <p className="muted">Use sugestões, favoritos e produtos recentes antes de pesquisar manualmente.</p>
                    </div>
                    {weeklySuggestions.length > 0 && (
                      <button type="button" onClick={() => addManyCatalogResults(weeklySuggestions)}>
                        <Plus size={16} /> Adicionar sugestão
                      </button>
                    )}
                  </div>

                  {weeklySuggestions.length > 0 && (
                    <QuickShelf
                      title="Sugestão da semana"
                      note="Baseada nos produtos mais recorrentes do seu histórico."
                      items={weeklySuggestions}
                      onAdd={item => addCatalogResultToList(item)}
                    />
                  )}

                  <QuickShelf
                    title={favoriteProducts.length > 0 ? 'Favoritos' : 'Mais comprados'}
                    note={favoriteProducts.length > 0 ? 'Produtos marcados como favoritos.' : 'Enquanto você não marca favoritos, uso os mais recorrentes.'}
                    items={favoriteQuickAdds}
                    onAdd={item => addCatalogResultToList(item)}
                  />

                  <QuickShelf
                    title="Comprados recentemente"
                    note="Atalhos gerados pelas últimas NFC-e e registros manuais."
                    items={recentQuickAdds}
                    onAdd={item => addCatalogResultToList(item)}
                  />

                  {buyAgainGroups.length > 0 && (
                    <div className="buyAgainBlock">
                      <div className="quickShelfTitle">
                        <strong>Comprar novamente</strong>
                        <span>Repete itens de uma compra anterior na lista atual.</span>
                      </div>
                      <div className="buyAgainList">
                        {buyAgainGroups.map(group => (
                          <button type="button" key={group.label} onClick={() => buyAgain(group)}>
                            <strong>{group.label}</strong>
                            <span>{group.items.length} item(ns)</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section className="card wide quickAddCard">
                  <h2>Adicionar produto</h2>
                  <p className="muted">A busca mostra primeiro seus produtos e histórico. Se precisar, consulta o catálogo Brasil para cadastrar produto sem preço.</p>

                  <div className="quickAddRow">
                    <input
                      value={catalogSearch}
                      onChange={event => {
                        setCatalogSearch(event.target.value);
                        setProductName(event.target.value);
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter') addItem();
                      }}
                      placeholder="Digite: leite, pão, monster, arroz..."
                    />
                    <button type="button" onClick={addItem}><Plus size={18} /> Adicionar texto</button>
                    <button type="button" onClick={searchProductsOnline} disabled={searchingProducts || catalogSearch.trim().length < 2}>
                      <Search size={18} /> {searchingProducts ? 'Buscando...' : 'Buscar catálogo BR'}
                    </button>
                  </div>

                  <div className="catalogResults">
                    {mergedCatalogResults.map(result => (
                      <button className="catalogResult" key={`${result.source}-${result.barcode || result.name}`} onClick={() => addCatalogResultToList(result)}>
                        <strong>{result.name}</strong>
                        <span>{result.brand ? `${result.brand} • ` : ''}{result.category || 'Produto'} • {result.unit || 'un'} • {sourceLabel(result.source)}</span>
                      </button>
                    ))}
                    {catalogSearch.trim() && mergedCatalogResults.length === 0 && !searchingProducts && (
                      <p className="empty">Nenhum produto encontrado ainda. Use “Adicionar texto” para criar mesmo assim.</p>
                    )}
                  </div>
                </section>

                <section className="card wide plannerListCard">
                  <div className="cardTop">
                    <div>
                      <h2>Lista em preparação</h2>
                      <p className="muted">Aqui você pode editar quantidade, remover itens e organizar antes da compra.</p>
                    </div>
                  </div>
                  <ItemList items={items} products={products} onToggle={toggleItem} onRemove={removeItem} onQuantityChange={updateItemQuantity} />
                </section>
              </>
            )}

            {shoppingMode === 'mercado' && (
              <section className="card wide marketRunCard">
                <div className="marketRunTop">
                  <div>
                    <p className="eyebrow">Modo mercado</p>
                    <h2>{items.filter(item => !item.checked).length} item(ns) pendente(s)</h2>
                    <p className="muted">Tela simplificada para usar no celular dentro do supermercado.</p>
                  </div>
                  <div className="actions">
                    <button type="button" onClick={() => setShoppingMode('planejar')}><ListPlus size={16} /> Editar lista</button>
                    <button type="button" onClick={finishAndArchiveActiveList} disabled={!activeList || items.length === 0}><Check size={16} /> Finalizar</button>
                  </div>
                </div>

                <ProgressBar value={progressPct} label={`${checkedCount} de ${items.length} itens pegos`} />

                <MarketRunList
                  items={items}
                  products={products}
                  onToggle={toggleItem}
                />
              </section>
            )}

            <details className="card wide oldListsPanel">
              <summary>Compras antigas e manutenção</summary>
              <div className="oldListsActions">
                <button type="button" onClick={finishAllOpenLists} disabled={openLists.length === 0}><Check size={16} /> Concluir abertas</button>
                <button type="button" onClick={archiveAllDoneLists} disabled={doneLists.length === 0}><Trash2 size={16} /> Ocultar concluídas</button>
              </div>
              <div className="purchaseCards compactCards">
                {[...openLists, ...doneLists].slice(0, 12).map(list => (
                  <PurchaseCard
                    key={list.id}
                    list={list}
                    selected={activeList?.id === list.id}
                    onClick={() => setActiveList(list)}
                    onDuplicate={() => duplicatePurchase(list)}
                    onReopen={() => reopenPurchase(list)}
                    onArchive={() => archivePurchase(list)}
                    onDelete={() => deletePurchase(list)}
                  />
                ))}
              </div>
            </details>
          </section>
        )}

        {page === 'produtos' && (
          <section className="pageGrid">
            <section className="card wide accountCard">
              <div className="cardTop appConfigTop">
                <div>
                  <p className="eyebrow">Conta e casa compartilhada</p>
                  <h2>{household?.household_name || 'Minha casa'}</h2>
                  <p className="muted">Logado como {user.email}. Listas, cupons e histórico ficam disponíveis para todos os membros desta casa.</p>
                </div>
                <button type="button" onClick={signOut}><LogOut size={16} /> Sair</button>
              </div>

              <div className="householdSummary">
                <div className="householdStat">
                  <Users size={20} />
                  <div>
                    <strong>{householdMembers.length}</strong>
                    <span>membro(s)</span>
                  </div>
                </div>
                <div className="householdStat">
                  <ShieldCheck size={20} />
                  <div>
                    <strong>{household?.role === 'owner' ? 'Administrador' : household?.role || 'membro'}</strong>
                    <span>seu perfil</span>
                  </div>
                </div>
              </div>

              <div className="householdGrid">
                <div className="householdPanel">
                  <h3>Nome da casa</h3>
                  <p className="muted">Use um nome fácil de reconhecer para quem compartilhar a lista.</p>
                  <div className="quickAddRow householdInvite">
                    <input value={householdNameDraft} onChange={event => setHouseholdNameDraft(event.target.value)} placeholder="Ex.: Casa Cirilo" />
                    <button type="button" onClick={renameCurrentHousehold} disabled={renamingHousehold}><Edit3 size={16} /> Salvar</button>
                  </div>
                </div>

                <div className="householdPanel">
                  <h3>Convidar membro</h3>
                  <p className="muted">A pessoa precisa ter um login criado no app. Depois, adicione o e-mail aqui para compartilhar listas e histórico.</p>
                  <div className="quickAddRow householdInvite">
                    <input value={memberEmail} onChange={event => setMemberEmail(event.target.value)} placeholder="email da pessoa" />
                    <button type="button" onClick={addMemberToHousehold}><UserPlus size={16} /> Adicionar</button>
                  </div>
                </div>
              </div>

              <div className="memberSection">
                <div className="sectionHeaderInline">
                  <h3>Membros da casa</h3>
                  <button type="button" onClick={loadHousehold}><RefreshCw size={16} /> Atualizar</button>
                </div>

                <div className="memberList">
                  {householdMembers.map(member => (
                    <div className="memberRow" key={member.user_id}>
                      <div className="memberAvatar">{(member.full_name || member.email || '?').slice(0, 1).toUpperCase()}</div>
                      <div>
                        <strong>{member.full_name || member.email || 'Usuário'}</strong>
                        <span>{member.email || 'sem e-mail'} • {member.role === 'owner' ? 'administrador' : member.role}</span>
                      </div>
                    </div>
                  ))}
                  {householdMembers.length === 0 && <p className="empty">Nenhum membro carregado ainda.</p>}
                </div>
              </div>

              {householdMessage && <p className="notice">{householdMessage}</p>}
            </section>
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
                  <p className="eyebrow">V10 • Catálogo Inteligente</p>
                  <h2>Revisar produtos semelhantes</h2>
                  <p className="muted">O sistema sugere pares com embalagem compatível. Você decide se são o mesmo produto ou se nunca mais devem aparecer juntos.</p>
                </div>
                <button onClick={loadDuplicateCandidates}><RefreshCw size={18} /> Atualizar sugestões</button>
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

              <div className="catalogReviewHeader">
                <div>
                  <h3>Sugestões para revisar</h3>
                  <p className="muted">Pesos e volumes diferentes são bloqueados automaticamente. Confira principalmente marca, sabor e tipo.</p>
                </div>
                <span className="reviewCount">{duplicateCandidates.length} pendente(s)</span>
              </div>

              <div className="duplicateCandidates smartCatalogCandidates">
                {duplicateCandidates.map(candidate => (
                  <div className={`duplicateCandidate smartCandidate ${candidate.decision || 'review'}`} key={`${candidate.product_a_id}-${candidate.product_b_id}`}>
                    <div className="candidateComparison">
                      <div className="candidateProduct">
                        <span className="candidateLabel">Produto A</span>
                        <strong>{candidate.product_a_name}</strong>
                        {candidate.measure_a && <small><Scale size={13} /> {candidate.measure_a}</small>}
                      </div>
                      <div className="candidateLink"><GitMerge size={20} /></div>
                      <div className="candidateProduct">
                        <span className="candidateLabel">Produto B</span>
                        <strong>{candidate.product_b_name}</strong>
                        {candidate.measure_b && <small><Scale size={13} /> {candidate.measure_b}</small>}
                      </div>
                    </div>

                    <div className="candidateDecision">
                      <span className={`decisionBadge ${candidate.decision || 'review'}`}>
                        {candidate.decision === 'strong' ? 'Alta chance de ser o mesmo' : 'Revisão necessária'}
                      </span>
                      <small>Similaridade: {Math.round(Number(candidate.score || 0) * 100)}% • {candidate.decision_reason || 'Confira os detalhes'}</small>
                    </div>

                    <div className="duplicateActions smartActions">
                      <button className="primaryMerge" onClick={() => mergeSelectedProducts(candidate.product_a_id, candidate.product_b_id)}><GitMerge size={15} /> Usar A como principal</button>
                      <button className="primaryMerge" onClick={() => mergeSelectedProducts(candidate.product_b_id, candidate.product_a_id)}><GitMerge size={15} /> Usar B como principal</button>
                      <button className="rejectMatch" onClick={() => rejectDuplicateCandidate(candidate)}><Ban size={15} /> Não são iguais</button>
                    </div>
                  </div>
                ))}
                {duplicateCandidates.length === 0 && (
                  <div className="catalogEmptyState">
                    <ShieldCheck size={32} />
                    <strong>Catálogo revisado</strong>
                    <span>Não há sugestões pendentes com embalagem compatível.</span>
                  </div>
                )}
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
          <section className="pageGrid insightPage">
            <section className="card wide insightFiltersCard">
              <div className="cardTop">
                <div>
                  <h2>Filtros dos insights</h2>
                  <p className="muted">Os valores abaixo consideram apenas os filtros selecionados.</p>
                </div>
                <button type="button" onClick={clearInsightFilters}><RefreshCw size={16} /> Limpar</button>
              </div>

              <div className="insightFilterGrid">
                <label>
                  <span>Período</span>
                  <select value={insightPeriod} onChange={event => setInsightPeriod(event.target.value as any)}>
                    <option value="currentMonth">Mês atual</option>
                    <option value="previousMonth">Mês anterior</option>
                    <option value="threeMonths">Últimos 3 meses</option>
                    <option value="sixMonths">Últimos 6 meses</option>
                    <option value="year">Ano atual</option>
                    <option value="custom">Período personalizado</option>
                    <option value="all">Todo o histórico</option>
                  </select>
                </label>

                <label>
                  <span>Produto</span>
                  <input list="insight-products" value={insightProduct} onChange={event => setInsightProduct(event.target.value)} placeholder="Todos os produtos" />
                  <datalist id="insight-products">
                    {products.map(product => <option key={product.id} value={product.name} />)}
                    {productAliases.slice(0, 1000).map(alias => <option key={`alias-${alias.id}`} value={alias.alias_name} />)}
                  </datalist>
                </label>

                <label>
                  <span>Mercado</span>
                  <select value={insightMarket} onChange={event => setInsightMarket(event.target.value)}>
                    {insightMarkets.map(market => <option key={market} value={market}>{market}</option>)}
                  </select>
                </label>

                <label>
                  <span>Categoria</span>
                  <select value={insightCategory} onChange={event => setInsightCategory(event.target.value)}>
                    {availableCategories.map(category => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>

                <label>
                  <span>Origem</span>
                  <select value={insightSource} onChange={event => setInsightSource(event.target.value)}>
                    {insightSources.map(source => <option key={source} value={source}>{source}</option>)}
                  </select>
                </label>
              </div>

              {insightPeriod === 'custom' && (
                <div className="customDateRange">
                  <label><span>De</span><input type="date" value={insightStartDate} onChange={event => setInsightStartDate(event.target.value)} /></label>
                  <label><span>Até</span><input type="date" value={insightEndDate} onChange={event => setInsightEndDate(event.target.value)} /></label>
                </div>
              )}
            </section>

            <section className="insightMetricGrid wide">
              <div className="insightMetric primary"><small>Total gasto</small><strong>{money(insightTotalPurchased)}</strong><span>{insightPurchaseCount} compra(s) no período</span></div>
              <div className="insightMetric"><small>Ticket médio</small><strong>{money(insightAverageTicket)}</strong><span>Média por compra</span></div>
              <div className="insightMetric"><small>Itens registrados</small><strong>{filteredInsightPurchases.length}</strong><span>{insightProductCount} produto(s) diferente(s)</span></div>
              <div className="insightMetric"><small>Mercados</small><strong>{insightMarketCount}</strong><span>{marketTotals[0] ? `Maior gasto: ${marketTotals[0].market}` : 'Sem registros'}</span></div>
              <div className="insightMetric"><small>Média por item</small><strong>{money(insightAverageItem)}</strong><span>Valor médio das linhas compradas</span></div>
            </section>

            <section className="card wide">
              <h2>Evolução por mês</h2>
              <div className="monthlyInsightList">
                {insightMonthlyTotals.map(item => (
                  <div className="monthlyInsightRow" key={item.month}>
                    <span>{new Date(`${item.month}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
                    <strong>{money(item.total)}</strong>
                  </div>
                ))}
                {insightMonthlyTotals.length === 0 && <p className="empty">Nenhum lançamento encontrado para os filtros selecionados.</p>}
              </div>
            </section>

            <section className="card">
              <h2>Gastos por mercado</h2>
              <MiniRows rows={marketTotals.map(item => ({ title: item.market, note: money(item.total) }))} empty="Nenhum mercado no período." />
            </section>

            <section className="card">
              <h2>Produtos com maior gasto</h2>
              <MiniRows rows={topPurchasedProducts.map(product => ({ title: product.name, note: `${money(product.total)} • ${product.count} registro(s)` }))} empty="Nenhum produto no período." />
            </section>

            <section className="card wide">
              <div className="cardTop">
                <div>
                  <h2>Resumo do filtro</h2>
                  <p className="muted">Uma leitura rápida do conjunto selecionado.</p>
                </div>
              </div>
              <div className="insightSummaryText">
                <p><strong>{filteredInsightPurchases.length}</strong> itens somaram <strong>{money(insightTotalPurchased)}</strong> em <strong>{insightPurchaseCount}</strong> compra(s).</p>
                <p>{marketTotals[0] ? <>O maior gasto ocorreu no <strong>{marketTotals[0].market}</strong>, com <strong>{money(marketTotals[0].total)}</strong>.</> : 'Não há mercado para destacar.'}</p>
                <p>{topPurchasedProducts[0] ? <>O produto com maior impacto foi <strong>{topPurchasedProducts[0].name}</strong>, somando <strong>{money(topPurchasedProducts[0].total)}</strong>.</> : 'Não há produto para destacar.'}</p>
              </div>
            </section>
          </section>
        )}

        {page === 'cupons' && (
          <section className="pageGrid">
            <section className="card wide">
              <h2>Scanner NFC-e</h2>
              <p className="muted">Aponte a câmera traseira para o QR Code. Se o foco não funcionar, use uma foto do cupom ou cole o link manualmente.</p>
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

              <div className="couponList">
                {coupons.map(coupon => (
                  <div className="couponCard" key={coupon.id}>
                    <div className="itemMain">
                      <strong>Status: {coupon.status}</strong>
                      <span>{coupon.store_name || 'Mercado'} • {new Date(coupon.created_at).toLocaleString('pt-BR')}</span>
                      <span>Itens importados: {coupon.imported_items || 0}</span>
                      {coupon.error_message && <span className="muted">Erro: {coupon.error_message}</span>}
                      <span className="couponUrl" title={coupon.qr_url}>{coupon.qr_url}</span>
                    </div>

                    <div className="couponActions">
                      <button onClick={() => importCoupon(coupon)} disabled={importingId === coupon.id || coupon.status === 'imported'}>
                        {importingId === coupon.id ? 'Importando...' : coupon.status === 'imported' ? 'Importado' : 'Importar'}
                      </button>
                      <button type="button" className="dangerButton" onClick={() => removeCoupon(coupon)} disabled={importingId === coupon.id}>
                        <Trash2 size={16} /> Remover
                      </button>
                    </div>
                  </div>
                ))}

                {coupons.length === 0 && <p className="empty">Nenhum cupom salvo ainda.</p>}
              </div>
            </section>
          </section>
        )}
      </main>

      <nav className="bottomNav" aria-label="Navegação principal">
        <button
          type="button"
          className={page === 'compras' && shoppingMode === 'planejar' ? 'active' : ''}
          onClick={() => { setPage('compras'); setShoppingMode('planejar'); }}
        >
          <ListChecks size={20} />
          <span>Lista</span>
        </button>
        <button
          type="button"
          className={page === 'compras' && shoppingMode === 'mercado' ? 'active' : ''}
          onClick={() => { setPage('compras'); setShoppingMode('mercado'); }}
        >
          <ShoppingCart size={20} />
          <span>Mercado</span>
        </button>
        <button
          type="button"
          className={page === 'cupons' ? 'active' : ''}
          onClick={() => { setPage('cupons'); loadCoupons(); }}
        >
          <Camera size={20} />
          <span>Cupom</span>
        </button>
        <button
          type="button"
          className={page === 'analises' || page === 'ondeComprar' ? 'active' : ''}
          onClick={() => setPage('analises')}
        >
          <BarChart3 size={20} />
          <span>Insights</span>
        </button>
        <button
          type="button"
          className={page === 'produtos' ? 'active' : ''}
          onClick={() => setPage('produtos')}
        >
          <PackageSearch size={20} />
          <span>Config</span>
        </button>
      </nav>
    </div>
  );
}


function AuthScreen({
  authMode,
  setAuthMode,
  email,
  setEmail,
  password,
  setPassword,
  message,
  loading,
  onSubmit
}: {
  authMode: 'login' | 'signup';
  setAuthMode: (value: 'login' | 'signup') => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  message: string;
  loading: boolean;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <div className="authShell">
      <form className="authCard" onSubmit={onSubmit}>
        <div className="appLogo authLogo">CI</div>
        <p className="eyebrow">Compra Inteligente</p>
        <h1>{authMode === 'login' ? 'Entrar na sua lista' : 'Criar acesso'}</h1>
        <p className="muted">Use seu e-mail para separar seus dados e compartilhar a casa com outra pessoa depois.</p>

        <label className="fieldLabel">E-mail</label>
        <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="seu@email.com" required />

        <label className="fieldLabel">Senha</label>
        <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Sua senha" required minLength={6} />

        <button type="submit" disabled={loading}>{loading ? 'Aguarde...' : authMode === 'login' ? 'Entrar' : 'Criar conta'}</button>

        <button
          type="button"
          className="ghostButton"
          onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
        >
          {authMode === 'login' ? 'Criar uma conta' : 'Já tenho conta'}
        </button>

        {message && <p className="notice">{message}</p>}
      </form>
    </div>
  );
}

function sourceLabel(source?: string | null) {
  const labels: Record<string, string> = {
    historico: 'histórico',
    'catalogo-local': 'catálogo local',
    'catalogo-brasil': 'catálogo Brasil',
    'open-food-facts-br': 'Open Food Facts BR',
    manual: 'manual'
  };

  return labels[source || ''] || source || 'catálogo';
}

function mobilePageTitle(page: string, shoppingMode: string) {
  if (page === 'compras') return shoppingMode === 'mercado' ? 'No Mercado' : 'Minha Lista';
  if (page === 'analises') return 'Insights';
  if (page === 'produtos') return 'Configurações';
  if (page === 'cupons') return 'Cupom';
  return pageTitle(page);
}

function pageEyebrow(page: string, shoppingMode: string) {
  if (page === 'compras') return shoppingMode === 'mercado' ? 'Checklist de compra' : 'Planejamento da compra';
  if (page === 'cupons') return 'NFC-e e histórico';
  if (page === 'analises') return 'Inteligência de preços';
  if (page === 'produtos') return 'Produtos e catálogo';
  return 'Compra Inteligente';
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
  onArchive,
  onDelete
}: {
  list: ShoppingList;
  selected: boolean;
  itemCount?: number;
  checkedCount?: number;
  onClick: () => void;
  onDuplicate?: () => void;
  onReopen?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
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

      {(onDuplicate || onReopen || onArchive || onDelete) && (
        <div className="purchaseCardActions">
          {onDuplicate && <button type="button" onClick={onDuplicate}><Copy size={14} /> Duplicar</button>}
          {onReopen && <button type="button" onClick={onReopen}><RefreshCw size={14} /> Reabrir</button>}
          {onArchive && <button type="button" onClick={onArchive}><Trash2 size={14} /> Ocultar</button>}
          {onDelete && <button type="button" className="dangerButton" onClick={onDelete}><Trash2 size={14} /> Remover</button>}
        </div>
      )}
    </div>
  );
}


function MarketRunList({
  items,
  products,
  onToggle
}: {
  items: ListItem[];
  products: Product[];
  onToggle: (item: ListItem) => void;
}) {
  const pendingItems = items.filter(item => !item.checked);
  const boughtItems = items.filter(item => item.checked);

  return (
    <div className="marketRunList">
      {pendingItems.length > 0 ? (
        groupItemsByCategory(pendingItems, products).map(([category, categoryItems]) => (
          <section className="marketRunCategory" key={`mercado-${category}`}>
            <div className="categoryHeader">
              <span><Tag size={14} /> {category}</span>
              <small>{categoryItems.length} item(ns)</small>
            </div>

            <div className="marketRunItems">
              {categoryItems.map(item => (
                <button className="marketRunItem" key={item.id} onClick={() => onToggle(item)}>
                  <Circle size={26} />
                  <div>
                    <strong>{item.product_name}</strong>
                    <span>{item.quantity} {item.unit}{item.estimated_unit_price ? ` • ${money(item.quantity * item.estimated_unit_price)}` : ''}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="allDoneBox">
          <Check size={34} />
          <strong>Todos os itens foram marcados.</strong>
          <span>Revise os itens pegos abaixo ou finalize a compra.</span>
        </div>
      )}

      {boughtItems.length > 0 && (
        <details className="boughtItemsBox">
          <summary>Itens já pegos ({boughtItems.length})</summary>
          <div className="marketRunItems bought">
            {boughtItems.map(item => (
              <button className="marketRunItem checked" key={item.id} onClick={() => onToggle(item)}>
                <Check size={24} />
                <div>
                  <strong>{item.product_name}</strong>
                  <span>{item.quantity} {item.unit}</span>
                </div>
              </button>
            ))}
          </div>
        </details>
      )}

      {items.length === 0 && <p className="empty">Monte sua lista na aba Planejar antes de ir ao mercado.</p>}
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


function QuickShelf({
  title,
  note,
  items,
  onAdd
}: {
  title: string;
  note: string;
  items: CatalogSearchResult[];
  onAdd: (item: CatalogSearchResult) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="quickShelf">
      <div className="quickShelfTitle">
        <strong>{title}</strong>
        <span>{note}</span>
      </div>
      <div className="quickChipScroller">
        {items.map(item => (
          <button
            type="button"
            className="quickProductChip"
            key={`${title}-${item.source}-${item.barcode || item.name}`}
            onClick={() => onAdd(item)}
          >
            <Plus size={14} />
            <span>{item.name}</span>
          </button>
        ))}
      </div>
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
  const fileRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const [running, setRunning] = useState(false);
  const [readingImage, setReadingImage] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [scannerMessage, setScannerMessage] = useState('Posicione o QR Code dentro do quadro.');

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  function stop() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setRunning(false);
  }

  async function listCameras() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];

    const allDevices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
    setDevices(videoDevices);
    return videoDevices;
  }

  function chooseRearCamera(videoDevices: MediaDeviceInfo[]) {
    const rearPattern = /(back|rear|environment|traseira|camera 0|câmera 0)/i;
    return videoDevices.find(device => rearPattern.test(device.label)) || videoDevices[videoDevices.length - 1] || null;
  }

  async function start(preferredDeviceId?: string | null) {
    stop();
    setScannerMessage('Abrindo a câmera traseira...');

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('A câmera exige acesso por HTTPS ou localhost.');
      }

      // Uma solicitação inicial libera os rótulos das câmeras em muitos Androids.
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      permissionStream.getTracks().forEach(track => track.stop());

      const videoDevices = await listCameras();
      const selected = preferredDeviceId
        ? videoDevices.find(device => device.deviceId === preferredDeviceId) || null
        : chooseRearCamera(videoDevices);

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: selected?.deviceId
          ? {
              deviceId: { exact: selected.deviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              facingMode: { ideal: 'environment' }
            }
          : {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            }
      };

      const reader = new BrowserQRCodeReader();
      readerRef.current = reader;
      setActiveDeviceId(selected?.deviceId || null);
      setRunning(true);
      setScannerMessage('Aproxime devagar até o QR ficar nítido.');

      controlsRef.current = await reader.decodeFromConstraints(
        constraints,
        videoRef.current!,
        result => {
          if (!result) return;
          const text = result.getText();
          stop();
          setScannerMessage('QR Code identificado com sucesso.');
          onDetected(text);
        }
      );
    } catch (error) {
      stop();
      const message = error instanceof Error ? error.message : 'Não consegui abrir a câmera.';
      setScannerMessage(
        /permission|notallowed|denied/i.test(message)
          ? 'Permissão da câmera bloqueada. Libere a câmera nas configurações do navegador.'
          : message
      );
    }
  }

  async function switchCamera() {
    const videoDevices = devices.length ? devices : await listCameras();
    if (videoDevices.length < 2) {
      setScannerMessage('Este aparelho informou apenas uma câmera disponível.');
      return;
    }

    const currentIndex = videoDevices.findIndex(device => device.deviceId === activeDeviceId);
    const next = videoDevices[(currentIndex + 1 + videoDevices.length) % videoDevices.length];
    await start(next.deviceId);
  }

  async function readImage(file?: File) {
    if (!file) return;

    stop();
    setReadingImage(true);
    setScannerMessage('Analisando a foto...');
    const objectUrl = URL.createObjectURL(file);

    try {
      const reader = new BrowserQRCodeReader();
      const result = await reader.decodeFromImageUrl(objectUrl);
      setScannerMessage('QR Code identificado na foto.');
      onDetected(result.getText());
    } catch {
      setScannerMessage('Não encontrei um QR Code legível nessa imagem. Tente uma foto mais próxima e sem reflexo.');
    } finally {
      URL.revokeObjectURL(objectUrl);
      setReadingImage(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="scanner scannerAndroid">
      <div className={`scannerViewport ${running ? 'isRunning' : ''}`}>
        <video ref={videoRef} muted playsInline />
        <div className="scannerGuide" aria-hidden="true">
          <span />
        </div>
      </div>

      <p className="scannerMessage">{scannerMessage}</p>

      <div className="scannerActions">
        <button type="button" className="scannerPrimary" onClick={() => running ? stop() : start()}>
          <Camera size={19} /> {running ? 'Parar câmera' : 'Abrir câmera'}
        </button>

        <button type="button" onClick={switchCamera} disabled={!running || devices.length < 2}>
          <SwitchCamera size={19} /> Trocar câmera
        </button>

        <button type="button" onClick={() => fileRef.current?.click()} disabled={readingImage}>
          <Image size={19} /> {readingImage ? 'Lendo foto...' : 'Ler pela foto'}
        </button>
      </div>

      <input
        ref={fileRef}
        className="scannerFileInput"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={event => readImage(event.target.files?.[0])}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
