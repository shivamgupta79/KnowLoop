FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=3000 DB_FILE=/data/knowloop.db
VOLUME /data
EXPOSE 3000
CMD ["sh","-c","node src/seed.js; node src/server.js"]
