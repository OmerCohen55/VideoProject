import { useEffect, useRef, useState } from "react";
import VideoSelf from "./VideoSelf";
import VideoFriend from "./VideoFriend";

export default function Home({ email, name, id }) {
  const [messages, setMessages] = useState([]);
  const [targetEmail, setTargetEmail] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const ws = useRef(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isInCall, setIsInCall] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);
  const localStream = useRef(null);
  const peerConnection = useRef(null);
  const [currentCallId, setCurrentCallId] = useState(null);
  const pendingCandidates = useRef([]);

  useEffect(() => {
    fetch(`http://localhost:8080/keepalive?id=${id}`, { method: "POST" });
    const interval = setInterval(() => {
      fetch(`http://localhost:8080/keepalive?id=${id}`, { method: "POST" });
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    ws.current = new WebSocket(`ws://localhost:8080/ws?email=${email}`);

    ws.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log("📩 WebSocket message:", data);

      if (
        data.type !== "webrtc_offer" &&
        data.type !== "webrtc_answer" &&
        data.type !== "webrtc_ice_candidate"
      ) {
        setMessages((prev) => [...prev, data]);
      }

      if (data.type === "incoming_call") {
        console.log("📞 Incoming call from", data.from);
        setIncomingCall({ from: data.from, callId: data.call_id });
      }

      if (data.type === "call_accepted") {
        alert(`✅ Your call was accepted by ${data.by}`);
        setIsInCall(true);

        const interval = setInterval(() => {
          if (localStream.current) {
            clearInterval(interval);
            if (email === data.to) {
              console.log("🚀 I am the caller, starting connection");
              initiateConnection();
            }
          }
        }, 100);
      }

      if (data.type === "call_rejected") {
        alert(`❌ Your call was rejected by ${data.by}`);
      }

      if (data.type === "call_ended") {
        alert("📴 Call has ended");
        peerConnection.current?.close();
        peerConnection.current = null;
        setRemoteStream(null);
        setIsInCall(false);
        setIncomingCall(null);
      }

      if (data.type === "webrtc_offer") {
        const interval = setInterval(() => {
          if (localStream.current) {
            clearInterval(interval);
            console.log("📞 handleReceivedOffer delayed trigger");
            handleReceivedOffer(data);
          }
        }, 100);
      }

      if (data.type === "webrtc_answer") {
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
        for (const candidate of pendingCandidates.current) {
          try {
            await peerConnection.current.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          } catch (err) {
            console.error("⚠️ Error adding delayed ICE:", err);
          }
        }
        pendingCandidates.current = [];
      }

      if (data.type === "webrtc_ice_candidate" && data.candidate) {
        if (
          peerConnection.current &&
          peerConnection.current.remoteDescription
        ) {
          try {
            await peerConnection.current.addIceCandidate(
              new RTCIceCandidate(data.candidate)
            );
          } catch (err) {
            console.error("⚠️ Error adding ICE:", err);
          }
        } else {
          console.log("💤 ICE candidate arrived early, saving...");
          pendingCandidates.current.push(data.candidate);
        }
      }
    };

    ws.current.onclose = () => {
      console.log("WebSocket closed");
    };

    return () => {
      ws.current.close();
    };
  }, []);

  useEffect(() => {
    const fetchOnlineUsers = async () => {
      const res = await fetch("http://localhost:8080/online");
      const data = await res.json();
      setOnlineUsers(data);
    };

    fetchOnlineUsers();
    const interval = setInterval(fetchOnlineUsers, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCall = async () => {
    console.log("📤 Outgoing call from", email, "to", targetEmail);

    const res = await fetch("http://localhost:8080/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caller_email: email,
        receiver_email: targetEmail,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setCurrentCallId(data.call_id);
      alert(`✅ Your call was accepted`);
    } else {
      alert("Call failed");
    }
  };

  const handleAccept = async () => {
    const res = await fetch("http://localhost:8080/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: incomingCall.callId }),
    });

    if (res.ok) {
      const data = await res.json();
      setCurrentCallId(data.call_id);
      alert("✅ You accepted the call");
      setIncomingCall(null);
      setIsInCall(true);
    } else {
      alert("❌ Failed to accept call");
    }
  };

  const handleReject = async () => {
    const res = await fetch("http://localhost:8080/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: incomingCall.callId }),
    });

    if (res.ok) {
      alert("🚫 You rejected the call");
      setIncomingCall(null);
    } else {
      alert("❌ Failed to reject call");
    }
  };

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStream.current = stream;
        const video = document.getElementById("my-video");
        if (video) {
          video.srcObject = stream;
        }
      });
  }, []);

  const initiateConnection = () => {
    peerConnection.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    localStream.current.getTracks().forEach((track) => {
      peerConnection.current.addTrack(track, localStream.current);
    });

    peerConnection.current.ontrack = (event) => {
      console.log("🎥 ontrack fired, stream:", event.streams[0]);
      setRemoteStream(event.streams[0]);
    };

    peerConnection.current
      .createOffer()
      .then((offer) => {
        return peerConnection.current.setLocalDescription(offer);
      })
      .then(() => {
        const offerMessage = {
          type: "webrtc_offer",
          to: targetEmail.toLowerCase(),
          from: email.toLowerCase(),
          offer: peerConnection.current.localDescription,
        };
        ws.current.send(JSON.stringify(offerMessage));
      });

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        const recipient = targetEmail || incomingCall?.from;
        ws.current.send(
          JSON.stringify({
            type: "webrtc_ice_candidate",
            to: recipient,
            from: email,
            candidate: event.candidate,
          })
        );
      }
    };
  };

  const handleReceivedOffer = async (data) => {
    console.log("📞 handleReceivedOffer called", data);

    peerConnection.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        const recipient =
          data.from || incomingCall?.from || targetEmail.toLowerCase();
        ws.current.send(
          JSON.stringify({
            type: "webrtc_ice_candidate",
            to: recipient,
            from: email.toLowerCase(),
            candidate: event.candidate,
          })
        );
      }
    };

    peerConnection.current.ontrack = (event) => {
      console.log("🎥 ontrack fired (answer side), stream:", event.streams[0]);
      setRemoteStream(event.streams[0]);
    };

    localStream.current.getTracks().forEach((track) => {
      peerConnection.current.addTrack(track, localStream.current);
    });

    await peerConnection.current.setRemoteDescription(
      new RTCSessionDescription(data.offer)
    );

    for (const candidate of pendingCandidates.current) {
      try {
        await peerConnection.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (err) {
        console.error("⚠️ Failed to add pending ICE:", err);
      }
    }
    pendingCandidates.current = [];

    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);

    ws.current.send(
      JSON.stringify({
        type: "webrtc_answer",
        to: data.from,
        from: email,
        answer: peerConnection.current.localDescription,
      })
    );
  };

  const endCall = async () => {
    await fetch("http://localhost:8080/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: currentCallId }),
    });

    peerConnection.current?.close();
    peerConnection.current = null;
    setRemoteStream(null);
    setIsInCall(false);
    setIncomingCall(null);
    setCurrentCallId(null);
  };

  return (
    <div>
      <h2>Welcome, {name}</h2>

      <div>
        <input
          type="email"
          placeholder="Enter email to call"
          value={targetEmail}
          onChange={(e) => setTargetEmail(e.target.value)}
        />
        <button onClick={handleCall}>Call</button>
      </div>

      <div>
        <h3>Online Users:</h3>
        <ul>
          {onlineUsers.map((user) => (
            <li key={user.id}>{user.email}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3>Messages:</h3>
        <ul>
          {messages.map((msg, index) => (
            <li key={index + JSON.stringify(msg)}>{JSON.stringify(msg)}</li>
          ))}
        </ul>
      </div>

      {incomingCall && (
        <div
          style={{ border: "1px solid black", padding: "10px", margin: "10px" }}
        >
          <p>
            📞 Incoming call from <strong>{incomingCall.from}</strong>
          </p>
          <button onClick={handleAccept}>Accept</button>
          <button onClick={handleReject}>Reject</button>
        </div>
      )}

      {remoteStream && (
        <button
          onClick={endCall}
          style={{ backgroundColor: "red", color: "white" }}
        >
          End Call
        </button>
      )}

      <VideoSelf stream={localStream.current} />
      <VideoFriend remoteStream={remoteStream} />
    </div>
  );
}
