# ---- build: gera os arquivos estáticos com o Vite ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: nginx servindo o build e fazendo proxy de /api e /socket.io ----
FROM nginx:1.27-alpine
# PORT: porta de escuta (o Render injeta a dele). BACKEND_URL: onde está a API.
ENV PORT=80 \
    BACKEND_URL=http://backend:3333
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
