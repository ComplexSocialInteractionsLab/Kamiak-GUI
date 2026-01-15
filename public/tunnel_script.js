const { Client } = require('ssh2');
const net = require('net');

// Get arguments
const [,, host, username, password, remoteHost, remotePort, localPort] = process.argv;

if (!host || !username || !password || !remoteHost || !remotePort || !localPort) {
    console.error('Usage: node tunnel_script.js <host> <username> <password> <remoteHost> <remotePort> <localPort>');
    process.exit(1);
}

const conn = new Client();

conn.on('ready', () => {
    console.log('SSH Connection Ready');

    const server = net.createServer((socket) => {
        conn.forwardOut('127.0.0.1', 12345, remoteHost, parseInt(remotePort), (err, stream) => {
            if (err) {
                console.error('Forwarding error:', err);
                socket.end();
                return;
            }
            socket.pipe(stream).pipe(socket);
        });
    });

    server.listen(parseInt(localPort), '127.0.0.1', () => {
        console.log(`Tunnel listening on 127.0.0.1:${localPort} -> ${remoteHost}:${remotePort}`);
    });

    server.on('error', (err) => {
        console.error('Tunnel server error:', err);
        conn.end();
    });

}).on('error', (err) => {
    console.error('SSH Connection Error:', err);
}).connect({
    host: host,
    port: 22,
    username: username,
    password: password
});
