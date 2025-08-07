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
  const pendingCandidates = useRef([]); // חדש
  const incomingOffer = useRef(null);

  // שמירה על חיבור מול השרת כל 20 שניות
  useEffect(() => {
    fetch(`http://localhost:8080/keepalive?id=${id}`, { method: "POST" });

    const interval = setInterval(() => {
      fetch(`http://localhost:8080/keepalive?id=${id}`, { method: "POST" });
    }, 20000);

    return () => clearInterval(interval);
  }, []);

  // התחברות ל־WebSocket
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

        await startLocalStream(); // ⬅️ כאן
        initiateConnection();
      }

      if (data.type === "call_rejected") {
        alert(`❌ Your call was rejected by ${data.by}`);

        // נקה את כל מה שנשאר פתוח אצל היוזם
        peerConnection.current?.close();
        peerConnection.current = null;
        localStream.current?.getTracks().forEach((track) => track.stop());
        setRemoteStream(null);
        setIsInCall(false);
        setCurrentCallId(null);
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
        incomingOffer.current = data;
      }

      if (data.type === "webrtc_answer") {
        console.log("📡 Received answer:", data.answer);
        peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
        pendingCandidates.current.forEach((candidate) => {
          peerConnection.current
            .addIceCandidate(candidate)
            .catch((err) => console.error("❌ Failed to add saved ICE:", err));
        });
        pendingCandidates.current = [];
      }

      if (data.type === "webrtc_ice_candidate" && data.candidate) {
        console.log("❄️ Received ICE candidate:", data.candidate);
        const candidate = new RTCIceCandidate(data.candidate);

        if (
          peerConnection.current &&
          peerConnection.current.remoteDescription &&
          peerConnection.current.remoteDescription.type
        ) {
          peerConnection.current
            .addIceCandidate(candidate)
            .catch((err) =>
              console.error("❌ Failed to add ICE candidate:", err)
            );
        } else {
          console.log("💤 ICE candidate arrived early, saving...");
          pendingCandidates.current.push(candidate);
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

  // טעינת משתמשים מחוברים
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

  // קבלת הווידאו מהמיקרופון והמצלמה
  // useEffect(() => {
  //   navigator.mediaDevices
  //     .getUserMedia({ video: true, audio: true })
  //     .then((stream) => {
  //       localStream.current = stream;

  //       const video = document.getElementById("my-video");
  //       if (video) {
  //         video.srcObject = stream;
  //       }
  //     });
  // }, []);

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      localStream.current = stream;

      const video = document.getElementById("my-video");
      if (video) {
        video.srcObject = stream;
      }
    } catch (err) {
      console.error("🎥 Failed to get local stream:", err);
    }
  };

  const handleCall = async () => {
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
      setIsInCall(true);

      await startLocalStream();

      // ✅ המתנה קצרה לוודא שה־stream נטען לפני החיבור
      const tracks = localStream.current?.getTracks() || [];
      if (tracks.length === 0) {
        console.warn("⛔ Local tracks not ready, waiting...");
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      initiateConnection();
    } else {
      alert("Call failed");
    }
  };

  const handleAccept = async () => {
    if (!incomingCall) return;

    const res = await fetch("http://localhost:8080/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: incomingCall.callId }),
    });

    if (res.ok) {
      setCurrentCallId(incomingCall.callId);
      alert("✅ You accepted the call");
      setIncomingCall(null);
      setIsInCall(true);

      await startLocalStream(); // ⬅️ הפעל מצלמה

      await handleReceivedOffer(incomingOffer.current); // ⬅️ עכשיו מותר להפעיל את ההצעה
    }
  };

  const handleReject = async () => {
    if (!incomingCall) return;

    const res = await fetch("http://localhost:8080/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: incomingCall.callId }),
    });

    if (res.ok) {
      alert("🚫 You rejected the call");

      // ✅ נקה את כל מה שצריך כדי לא להראות End Call
      setIncomingCall(null);
      setRemoteStream(null); // 👈 מוסיף ניקוי וידאו
      setIsInCall(false); // 👈 מוודא שלא נראה כאילו אתה בשיחה
      setCurrentCallId(null);
      peerConnection.current?.close();
      peerConnection.current = null;
    } else {
      alert("❌ Failed to reject call");
    }
  };

  const endCall = async () => {
    console.log("📴 Ending call with ID:", currentCallId);

    // שלח לשרת לסיים במסד
    await fetch("http://localhost:8080/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: currentCallId }),
    });

    // שלח לצד השני שצריך לסיים
    ws.current.send(
      JSON.stringify({
        type: "call_ended",
      })
    );

    // נקה את הצד שלך
    peerConnection.current?.close();
    peerConnection.current = null;
    setRemoteStream(null);
    setIsInCall(false);
    setIncomingCall(null);
    setCurrentCallId(null);
  };

  const initiateConnection = () => {
    if (peerConnection.current) {
      console.warn("🛑 peerConnection already exists, skipping re-init");
      return;
    }

    // 🛡 בדיקה קריטית: האם ה־stream קיים ומוכן?
    if (!localStream.current || localStream.current.getTracks().length === 0) {
      console.error(
        "⛔ Cannot initiate connection: local stream is missing or empty"
      );
      return;
    }

    console.log("📡 Sending local tracks:", localStream.current.getTracks());

    // יצירת החיבור
    peerConnection.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    if (!localStream.current || localStream.current.getTracks().length === 0) {
      console.warn("🛑 No local stream available, skipping addTrack");
    } else {
      localStream.current.getTracks().forEach((track) => {
        peerConnection.current.addTrack(track, localStream.current);
      });
    }

    // קבלת stream מהצד השני
    peerConnection.current.ontrack = (event) => {
      console.log("🎥 Got remote track!", event.streams);
      const incomingStream = event.streams[0];
      setRemoteStream(incomingStream);
    };

    // שליחת מועמדי ICE
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        const recipient = targetEmail || incomingCall?.from;
        console.log("📤 Sending ICE candidate", event.candidate);
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

    // יצירת OFFER ושליחתו
    peerConnection.current
      .createOffer()
      .then((offer) => {
        return peerConnection.current.setLocalDescription(offer);
      })
      .then(() => {
        const offerMessage = {
          type: "webrtc_offer",
          to: targetEmail,
          from: email,
          offer: peerConnection.current.localDescription,
        };
        ws.current.send(JSON.stringify(offerMessage));
      });
  };

  const handleReceivedOffer = async (data) => {
    console.log("📡 Received offer:", data.offer);

    await startLocalStream();

    // 🛡️ הגנה: אם כבר יש peerConnection, לא נמשיך
    if (peerConnection.current) {
      console.warn("🛑 peerConnection already exists, skipping re-init");
      return;
    }

    peerConnection.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        const recipient = data.from || incomingCall?.from || targetEmail;
        console.log("📤 Sending ICE candidate", event.candidate);
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

    peerConnection.current.ontrack = (event) => {
      console.log("🎥 Got remote track!", event.streams);
      setRemoteStream(event.streams[0]);
    };

    // ✅ בדיקה שה־stream מוכן באמת
    const tracks = localStream.current?.getTracks() || [];
    if (tracks.length === 0) {
      console.warn("⛔ No local tracks available, delaying addTrack...");
      await new Promise((resolve) => setTimeout(resolve, 300)); // השהייה קטנה
    }

    // ✅ הוספת ה־tracks המקומיים
    localStream.current.getTracks().forEach((track) => {
      peerConnection.current.addTrack(track, localStream.current);
    });

    // ✅ קביעת התיאור מהצד השני
    await peerConnection.current.setRemoteDescription(
      new RTCSessionDescription(data.offer)
    );

    // ✅ עיבוד מועמדים מוקדמים
    pendingCandidates.current.forEach((candidate) => {
      peerConnection.current
        .addIceCandidate(candidate)
        .catch((err) => console.error("❌ Failed to add saved ICE:", err));
    });
    pendingCandidates.current = [];

    // ✅ יצירת תשובה ושליחתה
    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);

    const answerMessage = {
      type: "webrtc_answer",
      to: data.from,
      from: email,
      answer: peerConnection.current.localDescription,
    };

    ws.current.send(JSON.stringify(answerMessage));
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

      {isInCall && (
        <button
          onClick={endCall}
          style={{ backgroundColor: "red", color: "white" }}
        >
          End Call
        </button>
      )}

      {isInCall && <VideoSelf stream={localStream.current} />}
      {isInCall && <VideoFriend remoteStream={remoteStream} />}
    </div>
  );
}
