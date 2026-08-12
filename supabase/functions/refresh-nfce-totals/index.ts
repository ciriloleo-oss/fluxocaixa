import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type CouponRow = {
  id: string;
  qr_url: string;
  access_key: string | null;
  gross_total: number | null;
  total_discount: number | null;
  paid_total: number | null;
  purchase_date: string | null;
  raw_payload: Record<string, unknown> | null;
};

type ParsedTotals = {
  grossTotal: number | null;
  totalDiscount: number | null;
  paidTotal: number | null;
  purchaseDate: string | null;
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
  if (!value) return null;
  const clean = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number | null) {
  return value == null ? null : Number(value.toFixed(2));
}

function extractAccessKey(qrUrl: string) {
  try {
    const decoded = decodeURIComponent(qrUrl);
    const match = decoded.match(/[?&]p=(\d{44})/i) || decoded.match(/(\d{44})/);
    return match?.[1] || null;
  } catch {
    return qrUrl.match(/(\d{44})/)?.[1] || null;
  }
}

function extractCouponTotals(html: string): ParsedTotals {
  const text = stripTags(html);

  const grossPatterns = [
    /Valor\s+total\s+R\$\s*:?[\s]*([\d.,]+)/i,
    /Valor\s+total\s*:?[\s]*R?\$?[\s]*([\d.,]+)/i,
    /Total\s+R\$\s*:?[\s]*([\d.,]+)/i,
  ];
  const discountPatterns = [
    /Descontos?\s+R\$\s*:?[\s]*([\d.,]+)/i,
    /Valor\s+(?:do\s+)?Desconto\s*:?[\s]*R?\$?[\s]*([\d.,]+)/i,
  ];
  const paidPatterns = [
    /Valor\s+a\s+pagar\s+R\$\s*:?[\s]*([\d.,]+)/i,
    /Valor\s+a\s+pagar\s*:?[\s]*R?\$?[\s]*([\d.,]+)/i,
    /Valor\s+pago\s*:?[\s]*R?\$?[\s]*([\d.,]+)/i,
  ];

  const firstMatch = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const value = toNumber(text.match(pattern)?.[1]);
      if (value != null) return value;
    }
    return null;
  };

  const gross = firstMatch(grossPatterns);
  let discount = firstMatch(discountPatterns);
  let paid = firstMatch(paidPatterns);

  if (paid == null && gross != null && discount != null) {
    paid = Math.max(0, gross - discount);
  }
  if (discount == null && gross != null && paid != null) {
    discount = Math.max(0, gross - paid);
  }

  const emission =
    text.match(/Emiss[aã]o\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i) ||
    text.match(/Data\s+de\s+Emiss[aã]o\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);

  return {
    grossTotal: roundMoney(gross),
    totalDiscount: roundMoney(discount),
    paidTotal: roundMoney(paid),
    purchaseDate: emission ? `${emission[3]}-${emission[2]}-${emission[1]}` : null,
  };
}

async function fetchNfcePage(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });
  return { ok: response.ok, status: response.status, html: await response.text() };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurada.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return jsonResponse({ error: 'Autenticação obrigatória.' }, 401);

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return jsonResponse({ error: 'Sessão inválida.' }, 401);

  const allowedEmail = (Deno.env.get('BACKFILL_ADMIN_EMAIL') || 'cirilo.leo@gmail.com').trim().toLowerCase();
  if ((authData.user.email || '').trim().toLowerCase() !== allowedEmail) {
    return jsonResponse({ error: 'Somente o administrador pode executar a atualização global.' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const onlyMissing = body.only_missing !== false;
  const requestedLimit = Number(body.limit || 30);
  const limit = Math.max(1, Math.min(50, Number.isFinite(requestedLimit) ? requestedLimit : 30));

  let query = admin
    .from('coupon_imports')
    .select('id, qr_url, access_key, gross_total, total_discount, paid_total, purchase_date, raw_payload')
    .eq('status', 'imported')
    .not('qr_url', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (onlyMissing) query = query.is('paid_total', null);

  const { data: rows, error: queryError } = await query;
  if (queryError) return jsonResponse({ error: `Erro ao buscar cupons: ${queryError.message}` }, 500);

  const coupons = (rows || []) as CouponRow[];
  const results: Array<{ id: string; ok: boolean; paid_total?: number; error?: string }> = [];

  async function processCoupon(coupon: CouponRow) {
    try {
      const fetched = await fetchNfcePage(coupon.qr_url);
      if (!fetched.ok) throw new Error(`SEFAZ retornou HTTP ${fetched.status}`);

      const parsed = extractCouponTotals(fetched.html);
      const grossTotal = parsed.grossTotal ?? (coupon.gross_total == null ? null : Number(coupon.gross_total));
      const paidTotal = parsed.paidTotal;
      let totalDiscount = parsed.totalDiscount;

      if (paidTotal == null) {
        throw new Error('Valor efetivamente pago não encontrado na página da NFC-e.');
      }
      if (totalDiscount == null && grossTotal != null) {
        totalDiscount = Math.max(0, grossTotal - paidTotal);
      }

      const accessKey = coupon.access_key || extractAccessKey(coupon.qr_url);
      const rawPayload = coupon.raw_payload && typeof coupon.raw_payload === 'object' ? coupon.raw_payload : {};

      const { error: updateError } = await admin
        .from('coupon_imports')
        .update({
          access_key: accessKey,
          gross_total: grossTotal,
          total_discount: roundMoney(totalDiscount),
          paid_total: roundMoney(paidTotal),
          purchase_date: parsed.purchaseDate || coupon.purchase_date,
          raw_payload: {
            ...rawPayload,
            gross_total: grossTotal,
            total_discount: roundMoney(totalDiscount),
            paid_total: roundMoney(paidTotal),
            purchase_date: parsed.purchaseDate || coupon.purchase_date,
            totals_backfilled_at: new Date().toISOString(),
          },
        })
        .eq('id', coupon.id);

      if (updateError) throw new Error(`Falha ao persistir: ${updateError.message}`);
      results.push({ id: coupon.id, ok: true, paid_total: roundMoney(paidTotal) || 0 });
    } catch (error) {
      results.push({ id: coupon.id, ok: false, error: error instanceof Error ? error.message : 'Erro desconhecido' });
    }
  }

  const concurrency = 8;
  for (let i = 0; i < coupons.length; i += concurrency) {
    await Promise.all(coupons.slice(i, i + concurrency).map(processCoupon));
  }

  const updated = results.filter(item => item.ok).length;
  const failed = results.length - updated;

  let remainingQuery = admin
    .from('coupon_imports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'imported');
  if (onlyMissing) remainingQuery = remainingQuery.is('paid_total', null);
  const { count: remainingCount } = await remainingQuery;

  return jsonResponse({
    ok: true,
    processed: results.length,
    updated,
    failed,
    remaining: remainingCount || 0,
    failures: results.filter(item => !item.ok).slice(0, 20),
  });
});
