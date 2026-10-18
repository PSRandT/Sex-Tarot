# 使用官方 Node 镜像，无需构建步骤
FROM node:20-alpine

WORKDIR /app

# 只装生产依赖
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

ENV PORT=8787
EXPOSE 8787

CMD ["node", "src/server.mjs"]
