const net = require('net');

const PORT = 1234;
const allFiles = {};

const server = net.createServer((socket) => {
  const ip = socket.remoteAddress.replace(/^.*:/, ''); 
  console.log(`[+] Nova conexão de ${ip}`);

  socket.on('data', (data) => {
    const msg = data.toString().trim();
    console.log(`[${ip}] > ${msg}`);
    const parts = msg.split(' ');

    switch (parts[0]) {
      case 'JOIN':
        socket.write('CONFIRMJOIN\n');
        break;

      case 'CREATEFILE': {
        const filename = parts[1];
        const size = parseInt(parts[2]);
        if (!allFiles[ip]) allFiles[ip] = [];
        allFiles[ip].push({ filename, size });
        socket.write(`CONFIRMCREATEFILE ${filename}\n`);
        break;
      }

      case 'DELETEFILE': {
        const filename = parts[1];
        if (allFiles[ip]) {
          allFiles[ip] = allFiles[ip].filter(f => f.filename !== filename);
        }
        socket.write(`CONFIRMDELETEFILE ${filename}\n`);
        break;
      }

      case 'SEARCH': {
        const pattern = parts[1];
        let results = '';
        for (const clientIP in allFiles) {
          for (const file of allFiles[clientIP]) {
            if (file.filename.includes(pattern)) {
              results += `FILE ${file.filename} ${clientIP} ${file.size}\n`;
            }
          }
        }
        socket.write(results);
        break;
      }

      case 'LEAVE':
        delete allFiles[ip];
        socket.write('CONFIRMLEAVE\n');
        socket.end();
        break;

      default:
        socket.write('ERROR Unknown command\n');
    }
  });

  socket.on('end', () => {
    console.log(`[-] Cliente ${ip} desconectado`);
    delete allFiles[ip];
  });

  socket.on('error', (err) => {
    console.error(`[!] Erro: ${err}`);
    delete allFiles[ip];
  });
});

server.listen(PORT, () => {
  console.log(`[*] Servidor TCP ouvindo na porta ${PORT}`);
});
