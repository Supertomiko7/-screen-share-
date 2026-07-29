const path = require('path');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/watch/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

// ICE servers for WebRTC NAT traversal. STUN alone is enough on the same
// network; a TURN relay is what makes cross-country connections reliable
// when both sides are behind restrictive NATs/firewalls. Configure a TURN
// provider (e.g. Metered's free Open Relay tier) via env vars — see README.
app.get('/api/ice-servers', (req, res) => {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(',').map((u) => u.trim()),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  res.json({ iceServers });
});

// roomId -> { hostSocketId: string|null, viewerSocketId: string|null }
const rooms = new Map();

function destroyRoom(roomId) {
  rooms.delete(roomId);
}

io.on('connection', (socket) => {
  socket.on('host:create-room', (_, ack) => {
    const roomId = nanoid(10);
    rooms.set(roomId, { hostSocketId: socket.id, viewerSocketId: null });
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = 'host';
    ack({ roomId });
  });

  socket.on('viewer:join-room', (roomId, ack) => {
    const room = rooms.get(roomId);
    if (!room) {
      ack({ ok: false, reason: 'not-found' });
      return;
    }
    if (room.viewerSocketId) {
      ack({ ok: false, reason: 'full' });
      return;
    }
    room.viewerSocketId = socket.id;
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = 'viewer';
    ack({ ok: true });
    io.to(room.hostSocketId).emit('viewer:joined');
  });

  socket.on('signal', (payload) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const targetId = socket.data.role === 'host' ? room.viewerSocketId : room.hostSocketId;
    if (!targetId) return;
    io.to(targetId).emit('signal', payload);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (socket.data.role === 'host') {
      io.to(roomId).emit('host:left');
      destroyRoom(roomId);
    } else if (socket.data.role === 'viewer') {
      room.viewerSocketId = null;
      io.to(roomId).emit('viewer:left');
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`screen-share server listening on http://localhost:${PORT}`);
});
