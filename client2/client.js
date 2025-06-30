const net = require('net');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SERVER_HOST = 'server';
const SERVER_PORT = 1234;
const FILE_PORT = 1235;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Lê arquivos da pasta /public
function getPublicFiles() {
  if (!fs.existsSync(PUBLIC_DIR)) return [];
  return fs.readdirSync(PUBLIC_DIR).map(filename => {
    const filepath = path.join(PUBLIC_DIR, filename);
    const size = fs.statSync(filepath).size;
    return { filename, size };
  });
}

// Conecta-se ao servidor e envia arquivos públicos
function connectToServer(ip) {
  const client = new net.Socket();

  client.connect(SERVER_PORT, SERVER_HOST, () => {
    console.log('[+] Conectado ao servidor');
    client.write(`JOIN ${ip}\n`);

    const files = getPublicFiles();
    files.forEach(file => {
      client.write(`CREATEFILE ${file.filename} ${file.size}\n`);
    });

    promptUser(client);
  });

  client.on('data', (data) => {
    console.log('[Servidor] > ' + data.toString());
  });

  client.on('close', () => {
    console.log('[*] Conexão encerrada com o servidor.');
  });

  return client;
}

// Interface de linha de comando para interagir
function promptUser(client) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function ask() {
    rl.question('Comando (search/download/leave): ', async (cmd) => {
      if (cmd.startsWith('search')) {
        const pattern = cmd.split(' ')[1];
        client.write(`SEARCH ${pattern}\n`);
      } else if (cmd.startsWith('download')) {
        const [, filename, ip] = cmd.split(' ');
        await downloadFile(filename, ip);
      } else if (cmd === 'leave') {
        client.write('LEAVE\n');
        client.end();
        rl.close();
        process.exit(0);
      } else {
        console.log('Comando inválido.');
      }
      ask();
    });
  }

  ask();
}

// Cliente servidor P2P escutando porta 1235 para enviar arquivos
function startFileServer() {
  const server = net.createServer((socket) => {
    socket.on('data', (data) => {
      const [_, filename, startStr] = data.toString().trim().split(' ');
      const offset = parseInt(startStr || 0);
      const filepath = path.join(PUBLIC_DIR, filename);
      if (!fs.existsSync(filepath)) {
        console.log(`Arquivo não encontrado: ${filename}`);
        socket.end();
        return;
      }

      const stream = fs.createReadStream(filepath, { start: offset });
      stream.pipe(socket);
    });
  });

  server.listen(FILE_PORT, () => {
    console.log(`[*] File server rodando na porta ${FILE_PORT}`);
  });
}

// Baixa um arquivo de outro cliente
function downloadFile(filename, ip) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.connect(FILE_PORT, ip, () => {
      socket.write(`GET ${filename} 0\n`);
      const filepath = path.join(__dirname, 'downloads', filename);
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
      const fileStream = fs.createWriteStream(filepath);

      socket.pipe(fileStream);
      socket.on('end', () => {
        console.log(`[↓] Download completo: ${filename}`);
        resolve();
      });
    });

    socket.on('error', (err) => {
      console.error(`[!] Erro ao baixar: ${err.message}`);
      reject(err);
    });
  });
}

// Início do programa
function main() {
  const ip = '172.28.0.12';
  startFileServer();
  connectToServer(ip);
}

main();
