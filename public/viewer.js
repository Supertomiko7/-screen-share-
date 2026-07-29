(() => {
  const statusText = document.getElementById('status-text');
  const remoteVideo = document.getElementById('remote-video');
  const errorText = document.getElementById('error-text');
  const unmuteBtn = document.getElementById('unmute-btn');

  unmuteBtn.addEventListener('click', () => {
    remoteVideo.muted = false;
    remoteVideo.play().catch(() => {});
    unmuteBtn.classList.add('hidden');
  });

  const roomId = window.location.pathname.split('/').pop();
  const socket = io();
  let pc = null;
  let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  let pendingCandidates = [];

  function showError(message) {
    errorText.textContent = message;
    errorText.classList.remove('hidden');
  }

  function createPeerConnection() {
    const conn = new RTCPeerConnection({ iceServers });

    conn.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0];
      remoteVideo.play()
        .then(() => { unmuteBtn.classList.remove('hidden'); })
        .catch(() => { unmuteBtn.classList.remove('hidden'); });
    };

    conn.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', { type: 'ice-candidate', candidate: event.candidate });
      }
    };

    conn.onconnectionstatechange = () => {
      if (conn.connectionState === 'connected') {
        statusText.textContent = 'Connected.';
      } else if (conn.connectionState === 'failed' || conn.connectionState === 'disconnected') {
        statusText.textContent = 'Connection lost.';
      }
    };

    return conn;
  }

  fetch('/api/ice-servers')
    .then((r) => r.json())
    .then((cfg) => { iceServers = cfg.iceServers; })
    .catch(() => {})
    .finally(() => {
      socket.emit('viewer:join-room', roomId, (result) => {
        if (!result.ok) {
          statusText.textContent = 'Could not join.';
          const reason = result.reason === 'full'
            ? 'This share already has a viewer.'
            : 'This link is invalid or the share has ended.';
          showError(reason);
          return;
        }
        statusText.textContent = 'Waiting for the host to connect…';
      });
    });

  socket.on('signal', async (payload) => {
    if (payload.type === 'offer') {
      pendingCandidates = [];
      pc = createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      pendingCandidates.splice(0).forEach((c) => pc.addIceCandidate(c).catch((err) => console.error('Failed to add ICE candidate', err)));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { type: 'answer', sdp: answer });
    } else if (payload.type === 'ice-candidate') {
      if (!pc || !pc.remoteDescription) {
        pendingCandidates.push(payload.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(payload.candidate);
      } catch (err) {
        console.error('Failed to add ICE candidate', err);
      }
    }
  });

  socket.on('host:left', () => {
    statusText.textContent = 'The host stopped sharing.';
    if (pc) { pc.close(); pc = null; }
    remoteVideo.srcObject = null;
  });
})();
