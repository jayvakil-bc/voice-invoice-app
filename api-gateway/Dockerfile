FROM node:18-alpine

WORKDIR /app

# Copy package files from api-gateway
COPY api-gateway/package*.json ./

RUN npm install --production

# Copy api-gateway source code
COPY api-gateway/ .

# Copy the public folder from root
COPY public ./public

EXPOSE 3000

CMD ["npm", "start"]
