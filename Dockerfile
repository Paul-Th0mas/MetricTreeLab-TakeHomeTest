FROM node:20-alpine

RUN apk add --no-cache netcat-openbsd bind-tools

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["sh", "-c", "\
  echo 'Resolving db...'; \
  i=0; \
  until getent hosts db >/dev/null 2>&1; do \
    i=$((i+1)); \
    if [ $i -ge 30 ]; then echo 'DNS resolution for db failed after 30 tries'; exit 1; fi; \
    echo \"DNS not ready, retry $i...\"; sleep 2; \
  done; \
  echo 'db resolved, waiting for port 5432...'; \
  until nc -z db 5432; do echo 'Waiting for database port...'; sleep 1; done; \
  npx prisma db push && npm run start \
"]