FROM node:lts-alpine

RUN apk add python3 make gcc g++
# RUN apt-get update && apt-get install -y nodejs npm make opus-tools python3 gcc g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package*.json /app
RUN npm install --production

COPY . /app
CMD ["node", "index.js"]
