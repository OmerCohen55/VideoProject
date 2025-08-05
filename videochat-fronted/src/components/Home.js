import { useEffect, useRef, useState } from "react";

// Exports Home component, receiving email, name and id as props from the parent component
export default function Home({ email, name, id }) {
  const [messages, setMessages] = useState([]);
  const [targetEmail, setTargetEmail] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isInCall, setIsInCall] = useState(false);
  const ws = useRef(null);
  const peerConnection = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);

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
      setMessages((prev) => [...prev, data]);

      if (data.type === "incoming_call") {
        console.log("📞 Incoming call from", data.from);
        setIncomingCall({ from: data.from, callId: data.call_id });
      }
      if (data.type === "call_accepted") {
        alert(`✅ Your call was accepted by ${data.by}`);
      }
      if (data.type === "call_rejected") {
        alert(`❌ Your call was rejected by ${data.by}`);
      }
      if (data.type === "call_ended") {
        alert("📴 Call has ended");
        setIsInCall(false);
      }

      if (data.type === "offer") {
        console.log("📨 Received offer");

        if (!peerConnection.current) {
          peerConnection.current = createPeerConnection();
          console.log("🎙️ Added local track to connection (on offer)");
          localStreamRef.current.getTracks().forEach((track) => {
            peerConnection.current.addTrack(track, localStreamRef.current);
          });
        }

        await peerConnection.current
          .setRemoteDescription(new RTCSessionDescription(data.offer))
          .catch((err) =>
            console.error("❌ Failed to set remote description (offer):", err)
          );

        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);

        console.log("📤 Sending answer to", data.from);
        ws.current.send(
          JSON.stringify({
            type: "answer",
            answer: answer,
            to: data.from,
          })
        );
      }

      if (data.type === "answer") {
        console.log("📨 Received answer");
        await peerConnection.current
          .setRemoteDescription(new RTCSessionDescription(data.answer))
          .catch((err) =>
            console.error("❌ Failed to set remote description (answer):", err)
          );
      }

      if (data.type === "ice_candidate") {
        console.log("🧊 Received ICE candidate:", data.candidate);
        if (peerConnection.current) {
          await peerConnection.current
            .addIceCandidate(data.candidate)
            .catch((err) =>
              console.error("❌ Failed to add ICE candidate:", err)
            );
        }
      }
    };

    ws.current.onclose = () => {
      console.log("WebSocket closed");
    };

    return () => ws.current.close();
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
    peerConnection.current = createPeerConnection();

    localStreamRef.current.getTracks().forEach((track) => {
      peerConnection.current.addTrack(track, localStreamRef.current);
      console.log("🎙️ Added local track to connection (handleCall)");
    });

    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);

    console.log("📤 Sending offer to", targetEmail);
    ws.current.send(
      JSON.stringify({
        type: "offer",
        offer: offer,
        to: targetEmail,
        from: email,
      })
    );

    const res = await fetch("http://localhost:8080/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caller_email: email,
        receiver_email: targetEmail,
      }),
    });

    if (res.ok) {
      alert("Call request sent");
    } else {
      alert("Call failed");
    }
  };

  const handleAccept = async () => {
    peerConnection.current = createPeerConnection();
    localStreamRef.current.getTracks().forEach((track) => {
      peerConnection.current.addTrack(track, localStreamRef.current);
      console.log("🎙️ Added local track to connection (handleAccept)");
    });

    const res = await fetch("http://localhost:8080/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: incomingCall.callId }),
    });

    if (res.ok) {
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
        localStreamRef.current = stream;
        console.log("🎦 Got local media stream");

        const videoElement = document.getElementById("my-video");
        if (videoElement) {
          videoElement.srcObject = stream;
          videoElement.play();
        }

        if (peerConnection.current) {
          stream.getTracks().forEach((track) => {
            peerConnection.current.addTrack(track, stream);
            console.log("🎙️ Added local track to existing connection (camera)");
          });
        }
      })
      .catch((err) => {
        console.error("Failed to access camera:", err);
      });
  }, []);

  function createPeerConnection() {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.ontrack = (event) => {
      console.log("🎥 Remote stream received");
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        remoteVideoRef.current.onloadedmetadata = () => {
          remoteVideoRef.current
            .play()
            .catch((e) => console.error("🔴 Failed to play remote video:", e));
        };
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(
          "📤 Sending ICE candidate to",
          isInCall ? targetEmail : incomingCall?.from
        );
        ws.current.send(
          JSON.stringify({
            type: "ice_candidate",
            candidate: event.candidate,
            to: isInCall ? targetEmail : incomingCall?.from,
          })
        );
      } else {
        console.log("🚫 No more ICE candidates");
      }
    };

    return pc;
  }

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
            <li key={index}>{JSON.stringify(msg)}</li>
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
      <div>
        <video
          id="my-video"
          autoPlay
          muted
          style={{ width: "300px", border: "1px solid gray" }}
        />
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{
            width: "300px",
            border: "1px solid blue",
            marginTop: "10px",
          }}
        />
      </div>
    </div>
  );
}
