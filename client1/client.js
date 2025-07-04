const net = require('net');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chokidar = require('chokidar');

const SERVER_HOST = 'server';
const SERVER_PORT = 1234;
const FILE_PORT = 1235;
const PUBLIC_DIR = path.join(__dirname, 'public');


let serverSocket;

function getPublicFiles() {
  if (!fs.existsSync(PUBLIC_DIR)) return [];
  return fs.readdirSync(PUBLIC_DIR).map(filename => {
    const filepath = path.join(PUBLIC_DIR, filename);
    const size = fs.statSync(filepath).size;
    return { filename, size };
  });
}

function connectToServer(ip) {
  const client = new net.Socket();

  client.connect(SERVER_PORT, SERVER_HOST, () => {
    console.log('[+] Connected to server');
    client.write(`JOIN ${ip}\n`);
  });

  client.on('data', (data) => {
    const message = data.toString().trim();
    console.log('[Server] > ' + message);

    if (message.startsWith('CONFIRMJOIN')) {
      getPublicFiles().forEach(file => {
        client.write(`CREATEFILE ${file.filename} ${file.size}\n`);
      });
      watchFiles(client);

      promptUser(client);
    }
  });

  client.on('close', () => {
    console.log('[*] Disconnected from server.');
  });

  serverSocket = client;
}


function promptUser(client) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  async function ask() {
    rl.question('Command (search/download/leave): ', async (cmd) => {
      if (cmd.startsWith('search')) {
        const pattern = cmd.split(' ')[1];
        client.write(`SEARCH ${pattern}\n`);
      } else if (cmd.startsWith('download')) {
        const [, filename, targetIP] = cmd.split(' ');
        if (filename && targetIP) {
          await downloadFile(filename, targetIP);
        } else {
          console.log('[!] Usage: download <filename> <ip>');
        }
      } else if (cmd === 'leave') {
        client.write('LEAVE\n');
        client.end();
        rl.close();
        process.exit(0);
      } else {
        console.log('[!] Invalid command.');
      }

      ask(); 
    });
  }

  ask();
}

function watchFiles(client) {
  if (!fs.existsSync(PUBLIC_DIR)) return;

  const watcher = chokidar.watch(PUBLIC_DIR, {
    ignoreInitial: true,
    persistent: true
  });

  watcher
    .on('add', (filepath) => {
      const filename = path.basename(filepath);
      const size = fs.statSync(filepath).size;
      console.log(`[+] Detected new file: ${filename}`);
      client.write(`CREATEFILE ${filename} ${size}\n`);
    })
    .on('unlink', (filepath) => {
      const filename = path.basename(filepath);
      console.log(`[-] Detected file deletion: ${filename}`);
      client.write(`DELETEFILE ${filename}\n`);
    });
}

function startFileServer() {
  const server = net.createServer((socket) => {
    socket.on('data', (data) => {
      const [_, filename, startStr] = data.toString().trim().split(' ');
      const offset = parseInt(startStr || 0);
      const filepath = path.join(PUBLIC_DIR, filename);
      if (!fs.existsSync(filepath)) {
        console.log(`[!] File not found: ${filename}`);
        socket.end();
        return;
      }

      const stream = fs.createReadStream(filepath, { start: offset });
      stream.pipe(socket);
    });
  });

  server.listen(FILE_PORT, () => {
    console.log(`[*] File server running on port ${FILE_PORT}`);
  });
}

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
        console.log(`[↓] Download complete: ${filename}`);
        resolve();
      });
    });

    socket.on('error', (err) => {
      console.error(`[!] Download error: ${err.message}`);
      reject(err);
    });
  });
}

function main() {
  const ip = '172.28.0.11';
  startFileServer();
  connectToServer(ip);
}

main();
