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

function normalizeProductName(name: string) {
  return stripTags(name)
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
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

    items.push({
      name,
      quantity: toNumber(match[2]) || 1,
      unit: (match[3] || 'un').toLowerCase(),
      unitPrice: toNumber(match[4]),
      totalPrice: toNumber(match[5]),
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

    items.push({
      name,
      quantity,
      unit,
      unitPrice: unitPrice || (quantity ? totalPrice / quantity : totalPrice),
      totalPrice,
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
        store_name: couponRecord?.store_name || 'Montserrat Jundiaí',
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        purchase_date: new Date().toISOString().slice(0, 10),
        source: 'nfce-sp',
        coupon_import_id: couponImportId || null,
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
          raw_payload: {
            access_key: accessKey,
            items,
          },
          error_message: null,
        })
        .eq('id', couponImportId);
    }

    return jsonResponse({
      ok: true,
      access_key: accessKey,
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
