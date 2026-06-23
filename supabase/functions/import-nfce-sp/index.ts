// Supabase Edge Function: import-nfce-sp
//
// Pasta correta:
// supabase/functions/import-nfce-sp/index.ts
//
// Deploy:
// supabase functions deploy import-nfce-sp
//
// Variáveis necessárias no Supabase Functions:
// SUPABASE_URL
// SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type ParsedItem = {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  grossUnitPrice: number;
  discountAmount: number;
  netUnitPrice: number;
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

function extractAccessKey(qrUrl: string) {
  const decoded = decodeURIComponent(qrUrl);
  const match = decoded.match(/[?&]p=(\d{44})/i) || decoded.match(/(\d{44})/);
  return match?.[1] || null;
}

function extractIssuerCnpj(qrUrl: string) {
  const accessKey = extractAccessKey(qrUrl);

  if (accessKey && accessKey.length === 44) {
    return accessKey.slice(6, 20);
  }

  const digits = qrUrl.replace(/\D/g, '');
  return digits.length >= 20 ? digits.slice(6, 20) : null;
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripTags(value: string) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function toNumber(value: string | null | undefined) {
  if (!value) return 0;
  const clean = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateNetPrices(quantity: number, unitPrice: number, totalPrice: number, discountAmount = 0) {
  const safeQuantity = quantity || 1;
  const grossTotal = totalPrice || unitPrice * safeQuantity;
  const safeDiscount = Math.max(0, discountAmount || 0);
  const netTotal = Math.max(0, grossTotal - safeDiscount);
  const netUnitPrice = safeQuantity ? netTotal / safeQuantity : netTotal;

  return {
    grossUnitPrice: unitPrice || (safeQuantity ? grossTotal / safeQuantity : grossTotal),
    discountAmount: safeDiscount,
    netUnitPrice: netUnitPrice || unitPrice || 0,
    netTotalPrice: netTotal || grossTotal,
  };
}

function extractDiscountAmount(text: string) {
  const patterns = [
    /(?:Desconto|Desc\.?|Valor\s+Desconto)\s*:?\s*R?\$?\s*([\d.,]+)/i,
    /(?:Valor\s+do\s+Desconto)\s*:?\s*R?\$?\s*([\d.,]+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = toNumber(match?.[1]);
    if (value > 0) return value;
  }

  return 0;
}

function normalizeProductName(name: string) {
  return stripTags(name)
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function cleanStoreName(value: string | null | undefined) {
  if (!value) return null;

  const cleaned = stripTags(value)
    .replace(/\s+/g, ' ')
    .replace(/\b(CNPJ|CPF|IE|IM|Endere[cç]o|Endereco|Telefone|Fone|NFC-e|DANFE|Documento Auxiliar).*$/i, '')
    .trim()
    .toUpperCase();

  return cleaned.length >= 3 ? cleaned : null;
}

function extractStoreName(html: string) {
  const decoded = decodeHtml(html);
  const text = stripTags(decoded);

  const htmlPatterns = [
    /<div[^>]+id=["']conteudo["'][\s\S]*?<div[^>]+class=["'][^"']*txtCenter[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class=["'][^"']*txtCenter[^"']*["'][^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i,
    /<h4[^>]*>([\s\S]*?)<\/h4>/i,
    /<h3[^>]*>([\s\S]*?)<\/h3>/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i
  ];

  for (const pattern of htmlPatterns) {
    const match = decoded.match(pattern);
    const storeName = cleanStoreName(match?.[1]);
    if (storeName && !/NFC|NOTA FISCAL|CUPOM|SEFAZ|SECRETARIA/.test(storeName)) {
      return storeName;
    }
  }

  const textPatterns = [
    /Raz[aã]o\s+Social[:\s]+(.+?)(?:CNPJ|CPF|IE|Inscri[cç][aã]o|Endere[cç]o|Endereco)/i,
    /Nome\s+Empresarial[:\s]+(.+?)(?:CNPJ|CPF|IE|Inscri[cç][aã]o|Endere[cç]o|Endereco)/i,
    /Emitente[:\s]+(.+?)(?:CNPJ|CPF|IE|Inscri[cç][aã]o|Endere[cç]o|Endereco)/i,
    /Dados\s+do\s+Emitente\s+(.+?)(?:CNPJ|CPF|IE|Inscri[cç][aã]o|Endere[cç]o|Endereco)/i
  ];

  for (const pattern of textPatterns) {
    const match = text.match(pattern);
    const storeName = cleanStoreName(match?.[1]);
    if (storeName && !/NFC|NOTA FISCAL|CUPOM|SEFAZ|SECRETARIA/.test(storeName)) {
      return storeName;
    }
  }

  const cnpjIndex = text.search(/CNPJ/i);
  if (cnpjIndex > 0) {
    const beforeCnpj = text.slice(Math.max(0, cnpjIndex - 220), cnpjIndex);
    const candidates = beforeCnpj
      .split(/\s{2,}| - | \| /)
      .map(cleanStoreName)
      .filter(Boolean) as string[];

    const likely = candidates
      .reverse()
      .find(candidate => candidate.length >= 4 && !/NFC|NOTA FISCAL|CUPOM|SEFAZ|SECRETARIA|DANFE/.test(candidate));

    if (likely) return likely;
  }

  return null;
}

function inferCategory(productName: string) {
  const name = productName.toUpperCase();

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

function parseItemsFromText(text: string): ParsedItem[] {
  const items: ParsedItem[] = [];

  // Tentativa para texto comum da página NFC-e:
  // PRODUTO Qtde.: 1 UN: UN Vl. Unit.: 10,99 Valor 10,99
  const itemRegex =
    /(.+?)\s+Qtde\.?\s*:?\s*([\d.,]+)\s+UN\s*:?\s*([A-Za-zÇÃÕÁÉÍÓÚçãõáéíóú]+)\s+Vl\.?\s*Unit\.?\s*:?\s*([\d.,]+)\s+Valor\s*:?\s*([\d.,]+)/gi;

  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(text)) !== null) {
    const name = normalizeProductName(match[1]);
    if (!name || name.length < 2) continue;

    const quantity = toNumber(match[2]) || 1;
    const unitPrice = toNumber(match[4]);
    const totalPrice = toNumber(match[5]);
    const discountAmount = extractDiscountAmount(match[0]);
    const prices = calculateNetPrices(quantity, unitPrice, totalPrice, discountAmount);

    items.push({
      name,
      quantity,
      unit: (match[3] || 'un').toLowerCase(),
      unitPrice,
      totalPrice: prices.netTotalPrice,
      grossUnitPrice: prices.grossUnitPrice,
      discountAmount: prices.discountAmount,
      netUnitPrice: prices.netUnitPrice,
    });
  }

  return items;
}

function parseItemsFromHtml(html: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const blocks = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  for (const block of blocks) {
    const text = stripTags(block);
    if (!/Qtde\.|Qtd\.|Vl\. Unit\.|Valor/i.test(text)) continue;

    const titleMatch =
      block.match(/class=["'][^"']*txtTit[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i) ||
      block.match(/<span[^>]*>([\s\S]*?)<\/span>/i);

    const name = normalizeProductName(titleMatch?.[1] || '');
    if (!name || name.length < 2) continue;

    const quantity = toNumber(text.match(/(?:Qtde\.|Qtd\.|Quantidade)\s*:?\s*([\d.,]+)/i)?.[1]) || 1;
    const unit = (text.match(/(?:UN|Unidade)\s*:?\s*([A-Za-zÇÃÕÁÉÍÓÚçãõáéíóú]+)/i)?.[1] || 'un').toLowerCase();
    const unitPrice = toNumber(text.match(/(?:Vl\.?\s*Unit\.?|Valor\s*Unitário)\s*:?\s*([\d.,]+)/i)?.[1]);
    const totalPrice = toNumber(text.match(/(?:Valor\s*Total|Valor)\s*:?\s*([\d.,]+)\s*$/i)?.[1]) || unitPrice * quantity;
    const grossUnitPrice = unitPrice || (quantity ? totalPrice / quantity : totalPrice);
    const discountAmount = extractDiscountAmount(text);
    const prices = calculateNetPrices(quantity, grossUnitPrice, totalPrice, discountAmount);

    items.push({
      name,
      quantity,
      unit,
      unitPrice: grossUnitPrice,
      totalPrice: prices.netTotalPrice,
      grossUnitPrice: prices.grossUnitPrice,
      discountAmount: prices.discountAmount,
      netUnitPrice: prices.netUnitPrice,
    });
  }

  if (items.length > 0) {
    return items;
  }

  return parseItemsFromText(stripTags(html));
}

async function fetchNfcePage(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });

  return {
    ok: response.ok,
    status: response.status,
    html: await response.text(),
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurada.' },
      500
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  let authenticatedUserId: string | null = null;
  let authenticatedHouseholdId: string | null = null;

  if (token) {
    const { data: authData } = await supabase.auth.getUser(token);
    authenticatedUserId = authData.user?.id || null;

    if (authenticatedUserId) {
      const { data: member } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', authenticatedUserId)
        .limit(1)
        .maybeSingle();

      authenticatedHouseholdId = member?.household_id || null;
    }
  }

  const body = await req.json().catch(() => ({}));

  const couponImportId = body.coupon_import_id as string | undefined;
  let qrUrl = body.qr_url as string | undefined;
  let couponRecord: any = null;

  if (couponImportId) {
    const { data, error } = await supabase
      .from('coupon_imports')
      .select('*')
      .eq('id', couponImportId)
      .single();

    if (error || !data) {
      return jsonResponse({ error: 'Cupom não encontrado.', details: error?.message }, 404);
    }

    couponRecord = data;
    qrUrl = data.qr_url;
  }

  if (!qrUrl) {
    return jsonResponse({ error: 'Informe coupon_import_id ou qr_url.' }, 400);
  }

  const accessKey = extractAccessKey(qrUrl);
  const issuerCnpj = extractIssuerCnpj(qrUrl);
  const effectiveHouseholdId = couponRecord?.household_id || authenticatedHouseholdId || null;
  const effectiveUserId = couponRecord?.user_id || authenticatedUserId || null;

  try {
    if (couponImportId) {
      await supabase
        .from('coupon_imports')
        .update({
          status: 'processing',
          error_message: null,
          access_key: accessKey,
        })
        .eq('id', couponImportId);
    }

    const fetched = await fetchNfcePage(qrUrl);

    if (!fetched.ok) {
      throw new Error(`SEFAZ retornou HTTP ${fetched.status}.`);
    }

    const rawDetectedStoreName =
      extractStoreName(fetched.html) ||
      cleanStoreName(couponRecord?.store_name) ||
      null;

    const { data: resolvedMarketName, error: marketError } = await supabase.rpc('resolve_market_name', {
      p_raw_name: rawDetectedStoreName,
      p_cnpj: issuerCnpj,
    });

    if (marketError) {
      throw new Error(`Erro ao resolver mercado: ${marketError.message}`);
    }

    const detectedStoreName = resolvedMarketName || rawDetectedStoreName || 'Mercado não identificado';

    const items = parseItemsFromHtml(fetched.html);

    if (items.length === 0) {
      const preview = stripTags(fetched.html).slice(0, 2000);

      if (couponImportId) {
        await supabase
          .from('coupon_imports')
          .update({
            status: 'failed',
            processed_at: new Date().toISOString(),
            imported_items: 0,
            raw_payload: {
              access_key: accessKey,
              issuer_cnpj: issuerCnpj,
              detected_store_name: detectedStoreName,
              raw_detected_store_name: rawDetectedStoreName,
              html_preview: preview,
            },
            error_message:
              'Não foi possível extrair itens do HTML da SEFAZ/SP. Pode haver captcha, bloqueio ou mudança de layout.',
          })
          .eq('id', couponImportId);
      }

      return jsonResponse(
        {
          ok: false,
          imported_items: 0,
          access_key: accessKey,
          error: 'Não foi possível extrair itens da NFC-e.',
          html_preview: preview,
        },
        422
      );
    }

    let importedCount = 0;

    for (const item of items) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .upsert(
          {
            name: item.name,
            default_unit: item.unit,
            category: inferCategory(item.name),
          },
          { onConflict: 'name' }
        )
        .select()
        .single();

      if (productError || !product) {
        throw new Error(`Erro ao salvar produto ${item.name}: ${productError?.message || 'sem retorno'}`);
      }

      const { error: purchaseError } = await supabase.from('purchase_items').insert({
        product_id: product.id,
        product_name: item.name,
        store_name: detectedStoreName,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.netUnitPrice || item.unitPrice,
        gross_unit_price: item.grossUnitPrice || item.unitPrice,
        discount_amount: item.discountAmount || 0,
        net_unit_price: item.netUnitPrice || item.unitPrice,
        total_price: item.totalPrice,
        purchase_date: new Date().toISOString().slice(0, 10),
        source: 'nfce-sp',
        coupon_import_id: couponImportId || null,
        household_id: effectiveHouseholdId,
        user_id: effectiveUserId,
      });

      if (purchaseError) {
        throw new Error(`Erro ao salvar item ${item.name}: ${purchaseError.message}`);
      }

      importedCount += 1;
    }

    if (couponImportId) {
      await supabase
        .from('coupon_imports')
        .update({
          status: 'imported',
          processed_at: new Date().toISOString(),
          imported_items: importedCount,
          store_name: detectedStoreName,
          raw_payload: {
            access_key: accessKey,
            issuer_cnpj: issuerCnpj,
            detected_store_name: detectedStoreName,
            raw_detected_store_name: rawDetectedStoreName,
            items,
          },
          error_message: null,
        })
        .eq('id', couponImportId);
    }

    return jsonResponse({
      ok: true,
      access_key: accessKey,
      issuer_cnpj: issuerCnpj,
      store_name: detectedStoreName,
      imported_items: importedCount,
      items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido.';

    if (couponImportId) {
      await supabase
        .from('coupon_imports')
        .update({
          status: 'failed',
          processed_at: new Date().toISOString(),
          error_message: message,
          access_key: accessKey,
        })
        .eq('id', couponImportId);
    }

    return jsonResponse(
      {
        ok: false,
        access_key: accessKey,
        error: message,
      },
      500
    );
  }
});
