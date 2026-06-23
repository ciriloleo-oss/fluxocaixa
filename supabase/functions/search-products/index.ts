// Supabase Edge Function: search-products
// Pasta correta:
// supabase/functions/search-products/index.ts
// Deploy:
// supabase functions deploy search-products
//
// Busca produtos no catalogo local e complementa com Open Food Facts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type ProductResult = {
  name: string;
  brand?: string | null;
  category?: string | null;
  unit?: string | null;
  barcode?: string | null;
  source?: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

function inferUnit(name: string) {
  const upper = name.toUpperCase();
  const match = upper.match(/(\d+[,.]?\d*)\s*(ML|L|G|KG|UN|UND|UNIDADE)/i);
  return match ? match[0].toLowerCase().replace(',', '.') : 'un';
}

function inferCategory(name: string, rawCategory?: string | null) {
  const text = `${name} ${rawCategory || ''}`.toUpperCase();
  const rules: Array<[string, RegExp]> = [
    ['Hortifruti', /(ALFACE|RUCULA|RÚCULA|TOMATE|BATATA|CEBOLA|ALHO|CENOURA|BANANA|MACA|MAÇÃ|LARANJA|LIMAO|LIMÃO|UVA|MANGA|ABACATE|ABACAXI|MELANCIA|VERDURA|LEGUME)/i],
    ['Laticínios', /(LEITE|IOGURTE|QUEIJO|MANTEIGA|REQUEIJAO|REQUEIJÃO|CREME DE LEITE|MUSSARELA|MOZZARELLA)/i],
    ['Mercearia', /(ARROZ|FEIJAO|FEIJÃO|MACARRAO|MACARRÃO|MOLHO|OLEO|ÓLEO|AZEITE|FARINHA|ACUCAR|AÇUCAR|CAF[EÉ]|SAL|TEMPERO|BISCOITO|BOLACHA|PAO|PÃO|CEREAL|AVEIA)/i],
    ['Carnes e Frios', /(CARNE|FRANGO|LINGUICA|LINGUIÇA|PEIXE|BACON|PRESUNTO|MORTADELA|SALSICHA|HAMBURGUER|HAMBÚRGUER)/i],
    ['Bebidas', /(CERVEJA|REFRIGERANTE|SUCO|AGUA|ÁGUA|ENERGETICO|ENERGÉTICO|VINHO|BEBIDA|CHA|CHÁ|COCA|GUARANA|GUARANÁ)/i],
    ['Limpeza', /(DETERGENTE|SABAO|SABÃO|AMACIANTE|DESINFETANTE|LIMPADOR|ESPONJA|MULTIUSO|ALCOOL|ÁLCOOL)/i],
    ['Higiene', /(PAPEL HIGIENICO|PAPEL HIGIÊNICO|SABONETE|SHAMPOO|CONDICIONADOR|CREME DENTAL|DESODORANTE|ABSORVENTE|FRALDA)/i],
    ['Pet', /(RACAO|RAÇÃO|PET|GATO|CAO|CÃO|CACHORRO|AREIA SANITARIA)/i],
    ['Congelados', /(SORVETE|PIZZA|LASANHA|CONGELADO|BATATA FRITA|NUGGET|POLPA)/i],
  ];

  return rules.find(([, regex]) => regex.test(text))?.[0] || 'Outros';
}

async function searchOpenFoodFacts(query: string): Promise<ProductResult[]> {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', query);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '12');
  url.searchParams.set('fields', 'code,product_name,brands,quantity,categories_tags,categories');

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'CompraInteligente/1.0 (personal grocery list app)',
      Accept: 'application/json',
    },
  });

  if (!response.ok) return [];

  const data = await response.json().catch(() => null);
  const products = Array.isArray(data?.products) ? data.products : [];

  return products
    .map((item: any) => {
      const rawName = String(item.product_name || '').trim();
      if (!rawName || rawName.length < 2) return null;

      const name = normalize(rawName);
      const category = inferCategory(name, item.categories);

      return {
        name,
        brand: item.brands ? String(item.brands).split(',')[0].trim() : null,
        category,
        unit: item.quantity ? String(item.quantity).trim().toLowerCase() : inferUnit(name),
        barcode: item.code ? String(item.code) : null,
        source: 'open-food-facts',
      } as ProductResult;
    })
    .filter(Boolean) as ProductResult[];
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405);

  const body = await req.json().catch(() => ({}));
  const query = String(body.query || '').trim();

  if (query.length < 2) {
    return jsonResponse({ ok: true, results: [] });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurada.' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: localData } = await supabase.rpc('search_product_catalog', {
    p_query: query,
    p_limit: 16,
  });

  const localResults: ProductResult[] = (localData || []).map((item: any) => ({
    name: item.name,
    brand: item.brand,
    category: item.category,
    unit: item.default_unit || 'un',
    barcode: item.barcode,
    source: item.source || 'catalogo-local',
  }));

  const onlineResults = await searchOpenFoodFacts(query).catch(() => []);

  const byName = new Map<string, ProductResult>();
  for (const item of localResults) byName.set(normalize(item.name), item);
  for (const item of onlineResults) {
    if (!byName.has(normalize(item.name))) byName.set(normalize(item.name), item);
  }

  return jsonResponse({
    ok: true,
    query,
    results: Array.from(byName.values()).slice(0, 24),
  });
});
