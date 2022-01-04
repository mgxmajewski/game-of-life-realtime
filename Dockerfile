FROM node:16.13-alpine3.14

# Create app directory
WORKDIR /usr/src/app

COPY package*.json ./

RUN yarn install
COPY . .
EXPOSE 4000
CMD ["node", "server.js"]