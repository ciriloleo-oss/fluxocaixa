import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function parseAmount(text = "") {
  const match = text.match(/R\$\s*([0-9\.]+,[0-9]{2}|[0-9]+(?:\.[0-9]{2})?)/i);
  if (!match) return null;
  return Number(match[1].replace(/\./g, "").replace(",", "."));
}

function guessCategory(text = "") {
  const lower = text.toLowerCase();
  if (/uber|99|posto|combust|shell|ipiranga|transporte/.test(lower)) return "Transporte";
  if (/ifood|restaurante|mercado|padaria|aliment|supermercado/.test(lower)) return "Alimentação";
  if (/farmacia|drogaria|saude|hospital/.test(lower)) return "Saúde";
  if (/netflix|spotify|amazon|assinatura|software|apple/.test(lower)) return "Ferramentas";
  return "Outros";
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Variáveis do Supabase ausentes no Netlify" });

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  const user_id = payload.user_id;
  const raw_message = payload.raw_message || payload.text || "";
  const detected_amount = payload.amount ? Number(payload.amount) : parseAmount(raw_message);
  const detected_description = payload.description || payload.merchant || raw_message.slice(0, 120);
  const bank_name = payload.bank_name || payload.card || "Wallet";
  const detected_type = payload.type || "expense";
  const suggested_category = payload.category || guessCategory(raw_message || detected_description);

  if (!user_id) return json(400, { error: "Informe user_id" });
  if (!raw_message && !detected_description) return json(400, { error: "Informe raw_message, text, merchant ou description" });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from("bank_messages")
    .insert([{
      user_id,
      raw_message: raw_message || detected_description,
      bank_name,
      detected_amount,
      detected_type,
      detected_description,
      processed: false
    }])
    .select()
    .single();

  if (error) return json(500, { error: error.message });

  return json(200, {
    ok: true,
    import: data,
    suggestion: {
      amount: detected_amount,
      description: detected_description,
      type: detected_type,
      category: suggested_category
    }
  });
}
