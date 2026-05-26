FROM node:20-alpine

WORKDIR /app

# Install dependencies first for better caching.
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source.
COPY src ./src

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Drop privileges.
USER node

CMD ["node", "src/index.js"]
