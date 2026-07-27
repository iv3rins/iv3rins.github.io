import WebSocket from 'ws';

const url = process.env.WS_URL ?? 'ws://127.0.0.1:8080/ws';
const socket = new WebSocket(url);
const timeout = setTimeout(() => {
  console.error('WebSocket smoke test timed out');
  process.exit(1);
}, 5_000);

socket.once('open', () => {
  socket.send(JSON.stringify({
    type: 'PING',
    requestId: crypto.randomUUID(),
  }));
});

socket.once('message', (data) => {
  const message = JSON.parse(data.toString());
  if (message.type !== 'PONG') {
    console.error('Unexpected response', message);
    process.exit(1);
  }
  clearTimeout(timeout);
  console.log('WebSocket smoke test passed');
  socket.close();
});
