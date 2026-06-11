# Compra Inteligente - Mercado

Este pacote já está preparado para publicar em:

```text
/mercado/
```

## Como subir no seu repositório atual

Copie a pasta `mercado` para dentro do repositório:

```text
fluxocaixa/
└── mercado/
```

Depois faça commit e push.

## Netlify

Como o app estará em uma subpasta do repositório, configure:

```text
Base directory: mercado
Build command: npm run build
Publish directory: dist
```

Configure as variáveis de ambiente:

```env
VITE_SUPABASE_URL=sua_url_supabase
VITE_SUPABASE_ANON_KEY=sua_anon_key
```

## Local

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Observação

O `vite.config.ts` já está com:

```ts
base: '/mercado/'
```

E o Netlify já está com redirect para SPA.
