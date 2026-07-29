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

  // setParameters() bitrate alone isn't always honored by Opus without also
  // forcing stereo + a target bitrate in the SDP itself.
  function boostOpusAudio(sdp) {
    const lines = sdp.split('\r\n');
    const opusLine = lines.find((l) => /^a=rtpmap:\d+ opus\/48000/i.test(l));
    if (!opusLine) return sdp;
    const payload = opusLine.match(/^a=rtpmap:(\d+) /)[1];
    return lines.map((line) => {
      if (!line.startsWith(`a=fmtp:${payload}`)) return line;
      let next = line;
      if (!/stereo=/.test(next)) next += ';stereo=1;sprop-stereo=1';
      if (!/maxaveragebitrate=/.test(next)) next += ';maxaveragebitrate=160000';
      return next;
    }).join('\r\n');
  }

  function showError(message) {
    errorText.textContent = message;
    errorText.classList.remove('hidden');
  }

  function createPeerConnection() {
    const conn = new RTCPeerConnection({ iceServers });

    localStream.getTracks().forEach((track) => {
      const sender = conn.addTrack(track, localStream);
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      if (track.kind === 'video') {
        // These are ceilings, not guarantees — the encoder will never exceed
        // what the capture actually produces (itself capped by your monitor's
        // refresh rate), and WebRTC's congestion control will settle lower
        // than this if the network path can't sustain it.
        params.encodings[0].maxFramerate = 240;
        params.encodings[0].maxBitrate = 10_000_000; // 10 Mbps ceiling — headroom for high-refresh motion
        sender.setParameters(params).catch(() => {});
      } else if (track.kind === 'audio') {
        params.encodings[0].maxBitrate = 160_000; // well above default voice-call bitrate
        sender.setParameters(params).catch(() => {});
      }
    });

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

  const AUDIO_CONSTRAINTS = {
    // Mic-oriented processing mangles game/system audio — turn it off.
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 2,
    sampleRate: 48000,
  };

  async function captureScreen() {
    // getDisplayMedia has no way to guarantee a resolution/frame-rate floor —
    // it's the OS/display deciding what's capturable, not something the page
    // can force. Chrome rejects "min" outright for screen capture ("min not
    // allowed"), and a hard "max" can also throw on some capturers. "ideal"
    // is the only safe lever: aim for 1080p/240fps, and Chrome will settle
    // for whatever the display + capture pipeline can actually sustain
    // (typically 720p+/100fps+ on any modern high-refresh setup).
    try {
      return await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 240 },
        },
        audio: AUDIO_CONSTRAINTS,
      });
    } catch (err) {
      if (err.name !== 'OverconstrainedError') throw err;
      return navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 240 } },
        audio: AUDIO_CONSTRAINTS,
      });
    }
  }

  async function startSharing() {
    try {
      localStream = await captureScreen();
    } catch (err) {
      showError('Screen share was cancelled or is not permitted: ' + err.message);
      return;
    }

    // Default screen-capture tracks are hinted as "detail" (optimized for text
    // sharpness), which biases the encoder toward low frame rate. "motion"
    // tells it to prioritize smoothness instead — needed for fast gameplay.
    localStream.getVideoTracks()[0].contentHint = 'motion';

    window.dispatchEvent(new CustomEvent('stream-ready', { detail: localStream }));

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
    offer.sdp = boostOpusAudio(offer.sdp);
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
