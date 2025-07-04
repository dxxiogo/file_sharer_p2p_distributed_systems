FROM node:18

WORKDIR /app

COPY . .

RUN npm install

RUN npm install chokidar

CMD ["tail", "-f", "/dev/null"]

# CMD ["node", "client.js"]
