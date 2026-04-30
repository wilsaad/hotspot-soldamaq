FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

RUN mkdir -p /app/logs && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "src/server.js"]
