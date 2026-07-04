FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p storage
EXPOSE 5000
ENV PORT=5000
CMD ["node", "src/index.js"]
