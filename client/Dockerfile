# Frontend image: React + Vite dev server.
FROM node:22-bookworm-slim

WORKDIR /app

# Install dependencies first so Docker can cache this layer.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the frontend source.
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]
