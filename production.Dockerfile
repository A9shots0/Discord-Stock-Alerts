FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

CMD ["sh", "-c", "cd /usr/src/app && node dist/deploy-commands.js && node dist/index.js"] 