// ===============================
//  CONFIG
// ===============================
const SIGNAL_URL = "https://webrtc-signal.a-villa232925.workers.dev/"; // <-- change this
const selfId = crypto.randomUUID(); // or your stable ID system

console.log("Self ID:", selfId);

// ===============================
//  SIGNALING CLIENT
// ===============================
class SignalingClient {
  constructor(baseUrl, selfId) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.selfId = selfId;
  }

  async send(to, type, data) {
    await fetch(`${this.baseUrl}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: this.selfId, to, type, data }),
    });
  }

  async recv() {
    const res = await fetch(`${this.baseUrl}/recv`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ for: this.selfId }),
    });
    return res.json();
  }
}

const signaling = new SignalingClient(SIGNAL_URL, selfId);

// ===============================
//  PEER CONNECTION STATE
// ===============================
const peers = new Map(); // peerId -> { pc, dc }

// ===============================
//  CREATE PEER CONNECTION
// ===============================
function createPC(peerId) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  pc.onicecandidate = async (ev) => {
    if (ev.candidate) {
      await signaling.send(peerId, "ice", ev.candidate);
    }
  };

  pc.ondatachannel = (ev) => {
    const dc = ev.channel;
    dc.onopen = () => console.log("DataChannel open with", peerId);
    dc.onmessage = (e) => console.log("Message from", peerId, e.data);

    peers.get(peerId).dc = dc;
  };

  return pc;
}

// ===============================
//  INITIATE CONNECTION (CALLER)
// ===============================
async function connectToPeer(peerId) {
  let entry = peers.get(peerId);
  if (!entry) {
    entry = { pc: createPC(peerId), dc: null };
    peers.set(peerId, entry);
  }

  const { pc } = entry;

  const dc = pc.createDataChannel("mesh");
  entry.dc = dc;

  dc.onopen = () => console.log("DataChannel open with", peerId);
  dc.onmessage = (e) => console.log("Message from", peerId, e.data);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await signaling.send(peerId, "offer", offer);
}

// ===============================
//  HANDLE INCOMING SIGNALS
// ===============================
async function handleSignals() {
  const { messages } = await signaling.recv();

  for (const msg of messages) {
    const peerId = msg.from;

    if (!peers.has(peerId)) {
      peers.set(peerId, { pc: createPC(peerId), dc: null });
    }

    const entry = peers.get(peerId);
    const pc = entry.pc;

    if (msg.type === "offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await signaling.send(peerId, "answer", answer);
    }

    else if (msg.type === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
    }

    else if (msg.type === "ice") {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(msg.data));
      } catch (e) {
        console.warn("ICE error:", e);
      }
    }
  }
}

// ===============================
//  POLLING LOOP
// ===============================
setInterval(handleSignals, 1000);

// ===============================
//  PUBLIC API
// ===============================
window.mesh = {
  selfId,
  connectToPeer,
  peers,
};
