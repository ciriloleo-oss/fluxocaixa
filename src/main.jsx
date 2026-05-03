import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import { ArrowDownCircle, ArrowUpCircle, BarChart3, Check, CreditCard, LogOut, Plus, RefreshCw, Search, Trash2, Wallet, X } from "lucide-react";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://snfgqvnbklhljgorkknx.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "COLE_SUA_ANON_KEY_NO_ENV";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function money(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
}
function today() { return new Date().toISOString().slice(0, 10); }
function emptyTx(user) {
  return { id: null, user_id: user?.id, description: "", amount: "", type: "expense", status: "confirmed", transaction_date: today(), account_id: "", category_id: "", notes: "" };
}
function guessCategory(categories, text) {
  const t = (text || "").toLowerCase();
  const map = [
    ["Transporte", /uber|99|posto|combust|shell|ipiranga|transporte/],
    ["Alimentação", /ifood|restaurante|mercado|padaria|aliment|supermercado/],
    ["Saúde", /farmacia|drogaria|saude|hospital/],
    ["Ferramentas", /netflix|spotify|amazon|assinatura|software|apple/],
  ];
  for (const [name, re] of map) if (re.test(t)) return categories.find(c => c.name === name)?.id || "";
  return categories.find(c => c.name === "Outros")?.id || "";
}
function parseAmount(text) {
  const m = String(text || "").match(/R\$\s*([0-9\.]+,[0-9]{2}|[0-9]+(?:\.[0-9]{2})?)/i);
  return m ? Number(m[1].replace(/\./g, "").replace(",", ".")) : "";
}

function Login() {
  const [email, setEmail] = useState("gestor@reservadaserra.com.br");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [msg, setMsg] = useState("");

  async function submit() {
    setMsg("");
    const fn = mode === "login" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await fn({ email, password });
    if (error) setMsg(error.message);
    else setMsg(mode === "login" ? "Login realizado." : "Conta criada. Verifique confirmação de email se estiver ativa.");
  }

  return <main className="screen login">
    <section className="card dark">
      <h1>Meu Caixa</h1>
      <p>Controle de fluxo de caixa pessoal com Supabase.</p>
    </section>
    <section className="card">
      <h2>{mode === "login" ? "Entrar" : "Criar conta"}</h2>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" />
      <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Senha" type="password" />
      {msg && <p className="msg">{msg}</p>}
      <button className="primary" onClick={submit}>{mode === "login" ? "Entrar" : "Criar conta"}</button>
      <button className="ghost" onClick={()=>setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "Criar nova conta" : "Já tenho conta"}
      </button>
    </section>
  </main>
}

function Modal({ title, children, onClose }) {
  return <div className="overlay"><div className="modal">
    <header><h2>{title}</h2><button onClick={onClose}><X size={18}/></button></header>
    {children}
  </div></div>
}

function App() {
  const [session, setSession] = useState(null);
  const user = session?.user;
  const [tab, setTab] = useState("dashboard");
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [imports, setImports] = useState([]);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("month");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyTx(user));
  const [importText, setImportText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadAll() {
    if (!user) return;
    setLoading(true);
    const [tx, ac, ca, im] = await Promise.all([
      supabase.from("transactions").select("*, accounts(name), categories(name)").eq("user_id", user.id).order("transaction_date", {ascending:false}).order("created_at", {ascending:false}),
      supabase.from("accounts").select("*").eq("user_id", user.id).eq("is_active", true).order("name"),
      supabase.from("categories").select("*").eq("user_id", user.id).eq("is_active", true).order("name"),
      supabase.from("bank_messages").select("*").eq("user_id", user.id).order("created_at", {ascending:false}).limit(50)
    ]);
    setTransactions(tx.data || []);
    setAccounts(ac.data || []);
    setCategories(ca.data || []);
    setImports(im.data || []);
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, [user?.id]);

  const visible = useMemo(() => {
    const now = new Date();
    return transactions.filter(t => {
      const d = new Date(t.transaction_date + "T12:00:00");
      const q = t.description.toLowerCase().includes(query.toLowerCase());
      if (!q) return false;
      if (period === "all") return true;
      if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (period === "year") return d.getFullYear() === now.getFullYear();
      if (period === "week") {
        const diff = (now - d) / 86400000;
        return diff >= 0 && diff <= 7;
      }
      return true;
    });
  }, [transactions, query, period]);

  const totals = useMemo(() => {
    const confirmed = visible.filter(t => t.status === "confirmed");
    const inc = confirmed.filter(t => t.type === "income").reduce((s,t)=>s+Number(t.amount),0);
    const exp = confirmed.filter(t => t.type === "expense").reduce((s,t)=>s+Number(t.amount),0);
    const projected = visible.reduce((s,t)=>s+(t.type==="income"?Number(t.amount):-Number(t.amount)),0);
    const byCat = {};
    const byAcc = {};
    visible.forEach(t => {
      if (t.type === "expense") byCat[t.categories?.name || "Sem categoria"] = (byCat[t.categories?.name || "Sem categoria"] || 0) + Number(t.amount);
      byAcc[t.accounts?.name || "Sem conta"] = (byAcc[t.accounts?.name || "Sem conta"] || 0) + (t.type==="income"?Number(t.amount):-Number(t.amount));
    });
    return { balance: inc-exp, inc, exp, projected, byCat, byAcc };
  }, [visible]);

  function openNew(prefill={}) {
    const f = { ...emptyTx(user), account_id: accounts[0]?.id || "", category_id: categories.find(c => c.type === "expense" || c.type === "both")?.id || "", ...prefill };
    setForm(f); setModal("tx");
  }
  function openEdit(t) { setForm({...t, amount: String(t.amount)}); setModal("tx"); }

  async function saveTx() {
    const payload = {...form, user_id: user.id, amount: Number(String(form.amount).replace(",", ".")), source: form.source || "manual"};
    if (payload.id) await supabase.from("transactions").update(payload).eq("id", payload.id).eq("user_id", user.id);
    else { delete payload.id; await supabase.from("transactions").insert([payload]); }
    setModal(null); await loadAll();
  }
  async function deleteTx(id) {
    if (!confirm("Excluir este lançamento?")) return;
    await supabase.from("transactions").delete().eq("id", id).eq("user_id", user.id);
    await loadAll();
  }
  async function saveImport() {
    const amount = parseAmount(importText);
    const desc = importText.slice(0, 120) || "Importação Wallet";
    await supabase.from("bank_messages").insert([{ user_id: user.id, raw_message: importText, bank_name: "Wallet", detected_amount: amount || null, detected_type: "expense", detected_description: desc, processed: false }]);
    setImportText(""); await loadAll();
  }
  async function confirmImport(item) {
    openNew({
      description: item.detected_description || item.raw_message.slice(0, 80),
      amount: item.detected_amount || "",
      type: item.detected_type || "expense",
      category_id: guessCategory(categories, item.raw_message),
      source: "wallet_import",
      _importId: item.id
    });
  }
  async function logout() { await supabase.auth.signOut(); }

  if (!session) return <Login />;

  return <main className="screen">
    <header className="top">
      <div><p>Fluxo de caixa</p><h1>Meu Caixa</h1></div>
      <div className="top-actions"><button onClick={loadAll}><RefreshCw size={18}/></button><button onClick={logout}><LogOut size={18}/></button></div>
    </header>

    {tab === "dashboard" && <>
      <section className="hero">
        <p>Saldo confirmado</p><h2>{money(totals.balance)}</h2>
        <div className="grid3"><span>Entradas<b>{money(totals.inc)}</b></span><span>Saídas<b>{money(totals.exp)}</b></span><span>Projetado<b>{money(totals.projected)}</b></span></div>
      </section>
      <section className="filters"><select value={period} onChange={e=>setPeriod(e.target.value)}><option value="month">Este mês</option><option value="week">7 dias</option><option value="year">Este ano</option><option value="all">Tudo</option></select><button onClick={()=>openNew()}><Plus size={18}/> Novo</button></section>
      <section className="card"><h2>Despesas por categoria</h2>{Object.entries(totals.byCat).map(([k,v])=><div className="row" key={k}><span>{k}</span><b>{money(v)}</b></div>)}</section>
      <section className="card"><h2>Saldo por conta</h2>{Object.entries(totals.byAcc).map(([k,v])=><div className="row" key={k}><span>{k}</span><b>{money(v)}</b></div>)}</section>
    </>}

    {tab === "transactions" && <>
      <section className="search"><Search size={16}/><input placeholder="Buscar" value={query} onChange={e=>setQuery(e.target.value)} /></section>
      <section className="list">{visible.map(t=><article className="tx" key={t.id}>
        <div className={t.type==="income" ? "icon income" : "icon expense"}>{t.type==="income"?<ArrowUpCircle/>:<ArrowDownCircle/>}</div>
        <div className="tx-main"><b>{t.description}</b><small>{t.transaction_date} · {t.categories?.name || "Sem categoria"} · {t.accounts?.name || "Sem conta"}</small></div>
        <strong className={t.type}>{t.type==="income"?"+":"-"}{money(t.amount)}</strong>
        <button onClick={()=>openEdit(t)}>Editar</button><button onClick={()=>deleteTx(t.id)}><Trash2 size={16}/></button>
      </article>)}</section>
    </>}

    {tab === "imports" && <>
      <section className="card"><h2>Importar Wallet / Atalhos</h2><textarea value={importText} onChange={e=>setImportText(e.target.value)} placeholder="Cole aqui o texto da transação ou teste do Atalho..." /><button className="primary" onClick={saveImport}>Salvar importação</button></section>
      <section className="list">{imports.map(i=><article className="tx" key={i.id}>
        <div className="icon"><CreditCard/></div><div className="tx-main"><b>{i.detected_description || "Importação"}</b><small>{i.raw_message}</small></div><strong>{i.detected_amount ? money(i.detected_amount) : "-"}</strong><button onClick={()=>confirmImport(i)}><Check size={16}/></button>
      </article>)}</section>
    </>}

    <nav className="nav"><button onClick={()=>setTab("dashboard")}><BarChart3/>Dashboard</button><button onClick={()=>setTab("transactions")}><Wallet/>Lançamentos</button><button onClick={()=>setTab("imports")}><CreditCard/>Importar</button></nav>

    {modal === "tx" && <Modal title={form.id ? "Editar lançamento" : "Novo lançamento"} onClose={()=>setModal(null)}>
      <input placeholder="Descrição" value={form.description} onChange={e=>setForm({...form, description:e.target.value})}/>
      <input placeholder="Valor" inputMode="decimal" value={form.amount} onChange={e=>setForm({...form, amount:e.target.value})}/>
      <input type="date" value={form.transaction_date} onChange={e=>setForm({...form, transaction_date:e.target.value})}/>
      <div className="seg"><button className={form.type==="expense"?"active expense":""} onClick={()=>setForm({...form,type:"expense"})}>Saída</button><button className={form.type==="income"?"active income":""} onClick={()=>setForm({...form,type:"income"})}>Entrada</button></div>
      <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="confirmed">Confirmado</option><option value="scheduled">Previsto</option></select>
      <select value={form.account_id || ""} onChange={e=>setForm({...form,account_id:e.target.value})}><option value="">Conta</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
      <select value={form.category_id || ""} onChange={e=>setForm({...form,category_id:e.target.value})}><option value="">Categoria</option>{categories.filter(c=>c.type===form.type||c.type==="both").map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <textarea placeholder="Notas" value={form.notes || ""} onChange={e=>setForm({...form,notes:e.target.value})}/>
      <button className="primary" onClick={saveTx}>Salvar</button>
    </Modal>}
  </main>
}

createRoot(document.getElementById("root")).render(<App />);
