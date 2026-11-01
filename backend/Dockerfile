# ---- build: compila o TypeScript ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: só dependências de produção + JS compilado + migrações ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist dist
COPY migrations migrations
USER node
EXPOSE 3333
CMD ["node", "dist/index.js"]
