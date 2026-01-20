FROM node:20-bookworm-slim

WORKDIR /app

# System deps (sharp uses prebuilt binaries in most cases, but ca-certificates helps HTTPS)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "start"]
