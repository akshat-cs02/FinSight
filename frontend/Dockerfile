# =============== Build ===============
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Build-time env (use ARG so docker-compose can override)
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# =============== Runtime (nginx) ===============
FROM nginx:1.27-alpine AS runtime

# Static assets
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
