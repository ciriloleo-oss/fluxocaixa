# Meu Caixa - versão produção para Netlify

## 1. Supabase

No Supabase, rode:

1. `supabase/00_base.sql`
2. Crie o usuário no Authentication
3. Ajuste o email dentro de `supabase/01_seed_for_user.sql`
4. Rode `supabase/01_seed_for_user.sql`

## 2. Variáveis locais

Crie um arquivo `.env` baseado em `.env.example`:

```env
VITE_SUPABASE_URL=https://snfgqvnbklhljgorkknx.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_URL=https://snfgqvnbklhljgorkknx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
```

A `SERVICE_ROLE_KEY` não deve ir para o frontend. Use apenas no Netlify Functions.

## 3. Rodar local

```bash
npm install
npm run dev
```

## 4. Publicar no Netlify

Opção simples:

1. Crie um repositório no GitHub
2. Suba estes arquivos
3. No Netlify: Add new site > Import from Git
4. Build command: `npm run build`
5. Publish directory: `dist`

Variáveis no Netlify:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 5. Compartilhar com seu pai

Crie um usuário para ele no Supabase Auth.

Depois rode o `supabase/01_seed_for_user.sql` trocando o email pelo email dele, para criar contas e categorias iniciais.

Cada usuário vê apenas os próprios dados por causa das políticas RLS.

## 6. Endpoint para Atalhos iPhone / Android companion

Depois de publicado, o webhook será:

```text
https://SEU-SITE.netlify.app/.netlify/functions/import-wallet
```

Exemplo de POST:

```json
{
  "user_id": "UUID_DO_USUARIO",
  "raw_message": "Compra de R$ 45,90 no cartão em Uber",
  "bank_name": "Wallet"
}
```

No app, a transação aparecerá na aba **Importar**.
