FROM node:18-alpine

WORKDIR /usr/src/app

# Install nodemon for development
RUN npm install -g nodemon ts-node

COPY package*.json ./

RUN npm install

COPY . .

# Development command using nodemon
CMD ["sh", "-c", "cd /usr/src/app && npx ts-node src/deploy-commands.ts && nodemon -e ts --exec 'ts-node' src/index.ts"] 