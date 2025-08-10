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
  const [hasOffer, setHasOffer] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isDialing, setIsDialing] = useState(false);

  const showError = (msg) => {
    console.error(msg);
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 10000); // נעל אחרי 5 שניות
  };

  // fetch עם timeout בסיסי
  const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(id);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} – ${text || url}`);
      }
      return res;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  };

  // שמירה על חיבור מול השרת כל 20 שניות
  useEffect(() => {
    fetchWithTimeout(`http://localhost:8080/keepalive?id=${id}`, {
      method: "POST",
    });

    const interval = setInterval(() => {
      fetchWithTimeout(`http://localhost:8080/keepalive?id=${id}`, {
        method: "POST",
      });
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
        // אם כבר בשיחה או מחייג — דחה אוטומטית
        if (isInCall || isDialing) {
          try {
            await fetchWithTimeout(
              "http://localhost:8080/reject",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ call_id: data.call_id }),
              },
              8000
            );
          } catch (_) {}
          // אפשר גם להראות הודעה קטנה:
          showError(`שיחה נכנסת מ-${data.from} נדחתה: אתה כבר בשיחה.`);
          return; // לא נפתח מודאל קבלה
        }

        console.log("📞 Incoming call from", data.from);
        setIncomingCall({ from: data.from, callId: data.call_id });
      }

      if (data.type === "call_accepted") {
        alert(`✅ Your call was accepted by ${data.by}`);
        setIsInCall(true);
        setIsDialing(false);
        // await startLocalStream(); // ⬅️ כאן
        // initiateConnection();
      }

      if (data.type === "call_rejected") {
        alert(`❌ Your call was rejected by ${data.by}`);

        // נקה את כל מה שנשאר פתוח אצל היוזם
        peerConnection.current?.close();
        peerConnection.current = null;
        setIsDialing(false);
        setRemoteStream(null);
        setIsInCall(false);
        setCurrentCallId(null);
        stopLocalMedia();
      }

      if (data.type === "call_ended") {
        alert("📴 Call has ended");
        peerConnection.current?.close();
        peerConnection.current = null;
        stopLocalMedia();
        setRemoteStream(null);
        setIsInCall(false);
        setIncomingCall(null);
        setCurrentCallId(null); // ← חסר כרגע
        pendingCandidates.current = [];
        setIsDialing(false);
        incomingOffer.current = null;
        setHasOffer(false);
      }

      if (data.type === "webrtc_offer") {
        // קבל רק אם יש שיחה נכנסת תואמת או לא עסוקים
        if (
          (incomingCall && incomingCall.from !== data.from) ||
          isInCall ||
          isDialing
        ) {
          console.log("⚠️ Ignoring stray/late offer from", data.from);
          return;
        }
        incomingOffer.current = data;
        setHasOffer(true);
      }

      if (data.type === "webrtc_answer") {
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
        for (const c of pendingCandidates.current) {
          await peerConnection.current
            .addIceCandidate(c)
            .catch((err) => console.error("❌ Failed to add saved ICE:", err));
        }
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
      const res = await fetchWithTimeout("http://localhost:8080/online");
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
      // קודם סוגרים אם יש ישן
      if (localStream.current) {
        localStream.current.getTracks().forEach((t) => t.stop());
        localStream.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      localStream.current = stream;
    } catch (err) {
      // הודעות ידידותיות
      if (err?.name === "NotAllowedError") {
        showError("נחסמה גישה למצלמה/מיקרופון. אפשר הרשאות ונסה שוב.");
      } else if (err?.name === "NotFoundError") {
        showError("לא נמצאה מצלמה או מיקרופון במכשיר.");
      } else if (err?.name === "NotReadableError") {
        showError(
          "התקן תפוס ע״י אפליקציה אחרת. סגור אפליקציות מצלמה/זום ונסה שוב."
        );
      } else if (err?.name === "OverconstrainedError") {
        showError("הגדרות המצלמה/מיקרופון אינן נתמכות. נסה הגדרות אחרות.");
      } else {
        showError("שגיאה בהפעלת מצלמה/מיקרופון.");
      }
      throw err;
    }
  };

  const handleCall = async () => {
    if (targetEmail === email) {
      showError("אי אפשר להתקשר לעצמך");
      return;
    }
    // בדיקה שהמשתמש מחובר
    if (!onlineUsers.some((user) => user.email === targetEmail)) {
      showError(`המשתמש ${targetEmail} אינו מחובר כרגע`);
      return;
    }
    try {
      const res = await fetchWithTimeout(
        "http://localhost:8080/call",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caller_email: email,
            receiver_email: targetEmail,
          }),
        },
        10000
      );

      const data = await res.json();
      setCurrentCallId(data.call_id);
      setIsInCall(true);

      await startLocalStream();
      const tracks = localStream.current?.getTracks() || [];
      if (tracks.length === 0) await new Promise((r) => setTimeout(r, 300));
      setIsDialing(true);
      initiateConnection();
    } catch (e) {
      showError("שגיאה ביצירת שיחה. בדוק חיבור או נסה שוב מאוחר יותר.");
    }
  };

  const handleAccept = async () => {
    if (!incomingCall) return;
    try {
      const res = await fetchWithTimeout(
        "http://localhost:8080/accept",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ call_id: incomingCall.callId }),
        },
        10000
      );

      setCurrentCallId(incomingCall.callId);
      alert("✅ You accepted the call");
      setIncomingCall(null);
      setIsInCall(true);

      await startLocalStream();
      await handleReceivedOffer(incomingOffer.current);
    } catch (e) {
      showError("שגיאה בקבלת השיחה. נסה שוב.");
    }
  };

  const handleReject = async () => {
    if (!incomingCall) return;

    const res = await fetchWithTimeout("http://localhost:8080/reject", {
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

      incomingOffer.current = null;
      setHasOffer(false);
      stopLocalMedia();
      pendingCandidates.current = [];
    } else {
      alert("❌ Failed to reject call");
    }
  };

  const endCall = async () => {
    console.log("📴 Ending call with ID:", currentCallId);

    // שלח לשרת לסיים במסד
    await fetchWithTimeout("http://localhost:8080/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: currentCallId }),
    });

    // שלח לצד השני שצריך לסיים
    // ws.current.send(
    //   JSON.stringify({
    //     type: "call_ended",
    //   })
    // );

    // נקה את הצד שלך
    peerConnection.current?.close();
    peerConnection.current = null;
    stopLocalMedia();
    setRemoteStream(null);
    setIsInCall(false);
    setIncomingCall(null);
    setCurrentCallId(null);
    pendingCandidates.current = [];
  };

  const initiateConnection = async () => {
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

    peerConnection.current.onconnectionstatechange = () => {
      const st = peerConnection.current?.connectionState;
      if (st === "failed" || st === "disconnected" || st === "closed") {
        cleanupConnection();
      }
    };

    if (localStream.current?.getTracks().length > 0) {
      localStream.current.getTracks().forEach((track) => {
        peerConnection.current.addTrack(track, localStream.current);
      });
    }

    // קבלת stream מהצד השני
    peerConnection.current.ontrack = (event) => {
      console.log("🎥 Got remote track!", event.streams);
      setRemoteStream(event.streams[0]);
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

    // יצירת OFFER ושליחתו עם טיפול בשגיאות
    try {
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);

      ws.current.send(
        JSON.stringify({
          type: "webrtc_offer",
          to: targetEmail,
          from: email,
          offer: peerConnection.current.localDescription,
        })
      );
    } catch (err) {
      showError("שגיאה ביצירת חיבור. נסה שוב."); // ← זה החידוש
      console.error("❌ Error creating/sending offer:", err);
      cleanupConnection();
    }
  };

  const handleReceivedOffer = async (data) => {
    console.log("📡 Received offer:", data.offer);

    await startLocalStream();

    if (peerConnection.current) {
      console.warn("🛑 peerConnection already exists, skipping re-init");
      return;
    }

    peerConnection.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnection.current.onconnectionstatechange = () => {
      const st = peerConnection.current?.connectionState;
      if (st === "failed" || st === "disconnected" || st === "closed") {
        cleanupConnection();
      }
    };

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

    if (localStream.current?.getTracks().length > 0) {
      localStream.current.getTracks().forEach((track) => {
        peerConnection.current.addTrack(track, localStream.current);
      });
    }

    // קביעת תיאור מרוחק ויצירת תשובה עם טיפול בשגיאות
    try {
      await peerConnection.current.setRemoteDescription(
        new RTCSessionDescription(data.offer)
      );

      // עיבוד מועמדים מוקדמים
      for (const cand of pendingCandidates.current) {
        await peerConnection.current.addIceCandidate(cand);
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

      incomingOffer.current = null;
      setHasOffer(false);
    } catch (err) {
      console.error("❌ Error handling received offer:", err);
      cleanupConnection();
    }
  };

  // פונקציית ניקוי כללית לשימוש חוזר
  const cleanupConnection = () => {
    peerConnection.current?.close();
    peerConnection.current = null;
    stopLocalMedia();
    setRemoteStream(null);
    setIsInCall(false);
    setIncomingCall(null);
    setCurrentCallId(null);
    pendingCandidates.current = [];
    incomingOffer.current = null;
    setHasOffer(false);
  };

  const stopLocalMedia = () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach((t) => t.stop());
      localStream.current = null;
    }
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
        <button
          onClick={handleCall}
          disabled={isDialing || isInCall || !targetEmail}
        >
          Call
        </button>
      </div>

      <div>
        <h3>Online Users:</h3>
        <ul>
          {onlineUsers.map((user) => (
            <li key={user.id}>{user.email}</li>
          ))}
        </ul>
      </div>

      {errorMsg && (
        <div
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            padding: "8px 12px",
            border: "1px solid #fecaca",
            borderRadius: 6,
            marginBottom: 10,
          }}
        >
          {errorMsg}
        </div>
      )}

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
          <button onClick={handleAccept} disabled={!hasOffer}>
            Accept
          </button>
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
