# Meu Caixa - versão sem segredos no repositório

Esta versão remove valores reais de `.env.example`, `README_NETLIFY.md`, `src/main.jsx` e impede que `dist`/`.env` subam para o GitHub.

## 1. Atualizar seu repositório

Copie estes arquivos para a pasta do seu projeto substituindo os antigos.

Depois rode:

```bash
rmdir /s /q dist
git add .
git commit -m "Remove secrets and prepare Netlify deploy"
git push
```

Se `dist` não existir, ignore o erro do `rmdir`.

## 2. Variáveis no Netlify

No Netlify, vá em:

Site configuration > Environment variables

Crie estas variáveis com os valores reais somente no Netlify:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

## 3. Redeploy

Depois das variáveis:

Deploys > Trigger deploy > Deploy site

## 4. Importante sobre segurança

- `.env` não deve ir para o GitHub.
- `.env.example` pode ir, mas sem valores.
- `dist` não deve ir para o GitHub.
- `SUPABASE_SERVICE_ROLE_KEY` nunca deve aparecer no frontend nem no GitHub.

## 5. Se o Netlify ainda bloquear

Use esta variável no Netlify:

```text
SECRETS_SCAN_OMIT_KEYS
```

Valor:

```text
VITE_SUPABASE_URL,VITE_SUPABASE_ANON_KEY,SUPABASE_URL
```

Não adicione `SUPABASE_SERVICE_ROLE_KEY` nessa lista se ela estiver aparecendo no código. Nesse caso, remova a chave do repo e gere uma nova no Supabase.
