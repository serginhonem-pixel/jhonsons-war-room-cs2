# JHONSON'S War Room (CS2)

App de analise de demos CS2 com:
- Frontend React + Vite
- API Node/Express para parse e analise

## Rodar local

```bash
npm install
npm run dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3001`

## Deploy (GitHub + Vercel)

### 1) Publicar no GitHub

No terminal do projeto:

```bash
git init
git add .
git commit -m "feat: cs2 war room"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/cs2-stats.git
git push -u origin main
```

### 2) Deploy no Vercel (Frontend)

1. Importar o repo no Vercel.
2. Framework: `Vite`.
3. Build command: `npm run build`.
4. Output directory: `dist`.

## API em produção (importante)

`/api/parse` recebe `.dem` grandes e usa `@laihoe/demoparser2`.

Para produção, recomendo subir a API separada (Railway/Render/Fly) e configurar:

```bash
VITE_API_URL=https://sua-api.exemplo.com
```

O frontend já está preparado para usar esse `VITE_API_URL`.

Sem API externa, o site no Vercel abre, mas parse/análise não funcionarão.

