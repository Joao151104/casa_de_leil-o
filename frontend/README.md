# Arremate — Frontend

SPA em React 19 + Vite + TypeScript com componentes do [shadcn/ui](https://ui.shadcn.com) (Radix + Tailwind CSS 4).

```bash
npm install
npm run dev     # http://localhost:5173 (proxy de /api e /socket.io para http://localhost:3333)
npm test
npm run build   # gera dist/
```

Novos componentes do shadcn: `npx shadcn@latest add <componente>` (configuração em `components.json`).

Docker: `docker build -t arremate-frontend .`. A imagem usa nginx para servir o build e faz proxy de `/api` e `/socket.io` para `BACKEND_URL` (padrão `http://backend:3333`).

Documentação completa: [README principal](../README.md).
