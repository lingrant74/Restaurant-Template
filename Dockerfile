# Backend image: Node.js + Express API server backed by DynamoDB.
FROM node:22-bookworm-slim

WORKDIR /app

# Install dependencies first so Docker can cache this layer.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the backend source.
COPY . .

RUN chmod +x scripts/docker-entrypoint.sh

EXPOSE 3000

# The entrypoint creates DynamoDB tables and seeds before starting the process.
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
