(() => {
  const startBtn = document.getElementById('start-btn');
  const linkPanel = document.getElementById('link-panel');
  const linkInput = document.getElementById('link-input');
  const copyBtn = document.getElementById('copy-btn');
  const statusText = document.getElementById('status-text');
  const preview = document.getElementById('preview');
  const errorText = document.getElementById('error-text');

  const socket = io();
  let pc = null;
  let localStream = null;
  let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  let pendingCandidates = [];

  fetch('/api/ice-servers')
    .then((r) => r.json())
    .then((cfg) => { iceServers = cfg.iceServers; })
    .catch(() => {});

  function showError(message) {
    errorText.textContent = message;
    errorText.classList.remove('hidden');
  }

  function createPeerConnection() {
    const conn = new RTCPeerConnection({ iceServers });

    localStream.getTracks().forEach((track) => conn.addTrack(track, localStream));

    conn.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', { type: 'ice-candidate', candidate: event.candidate });
      }
    };

    conn.onconnectionstatechange = () => {
      if (conn.connectionState === 'connected') {
        statusText.textContent = 'Connected — your friend is watching.';
      } else if (conn.connectionState === 'failed' || conn.connectionState === 'disconnected') {
        statusText.textContent = 'Connection lost. Waiting for your friend to reconnect…';
      }
    };

    return conn;
  }

  async function startSharing() {
    try {
      localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch (err) {
      showError('Screen share was cancelled or is not permitted: ' + err.message);
      return;
    }

    preview.srcObject = localStream;
    preview.classList.remove('hidden');
    startBtn.classList.add('hidden');

    localStream.getVideoTracks()[0].addEventListener('ended', () => {
      statusText.textContent = 'You stopped sharing.';
      if (pc) { pc.close(); pc = null; }
      socket.disconnect();
    });

    socket.emit('host:create-room', null, ({ roomId }) => {
      const link = `${window.location.origin}/watch/${roomId}`;
      linkInput.value = link;
      linkPanel.classList.remove('hidden');
    });
  }

  socket.on('viewer:joined', async () => {
    statusText.textContent = 'Friend joined — connecting…';
    pendingCandidates = [];
    pc = createPeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { type: 'offer', sdp: offer });
  });

  socket.on('signal', async (payload) => {
    if (!pc) return;
    if (payload.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      pendingCandidates.splice(0).forEach((c) => pc.addIceCandidate(c).catch((err) => console.error('Failed to add ICE candidate', err)));
    } else if (payload.type === 'ice-candidate') {
      if (!pc.remoteDescription) {
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

  socket.on('viewer:left', () => {
    statusText.textContent = 'Your friend left. Waiting for your friend to open the link…';
    if (pc) { pc.close(); pc = null; }
  });

  startBtn.addEventListener('click', startSharing);

  copyBtn.addEventListener('click', () => {
    linkInput.select();
    navigator.clipboard.writeText(linkInput.value).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    });
  });
})();
