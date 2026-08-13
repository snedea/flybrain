FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY agent/ ./agent/
ENV CARETAKER_PUBLIC=1 CARETAKER_PORT=7600 NODE_ENV=production
EXPOSE 7600
CMD ["node", "server/caretaker.js"]
