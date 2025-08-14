import { useEffect, useRef, useState } from "react";
import VideoSelf from "./VideoSelf";
import VideoFriend from "./VideoFriend";
import "../styles/home.css";
import emoji from "../images/emoji.png";

/** ====== SERVER CONFIG (LAN) ======
 * Prefer configuring via .env:
 *  - Vite:  VITE_API_HOST, VITE_API_PORT
 *  - CRA:   REACT_APP_API_HOST, REACT_APP_API_PORT
 * Fallback defaults to your server machine IP + 8080
 */
const HOST =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_HOST) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_HOST) ||
  "192.168.1.178"; // ← fallback IP

const PORT =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_PORT) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_PORT) ||
  "8443"; // now using HTTPS default

const API_BASE = `https://${HOST}:${PORT}`;

const WS_URL = (email) =>
  `wss://${HOST}:${PORT}/ws?email=${encodeURIComponent(email)}`;

export default function Home({ email, name, id }) {
  const [messages, setMessages] = useState("");
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
  const [errorMsg, setErrorMsg] = useState("");
  const [isDialing, setIsDialing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isFriendVideoOff, setIsFriendVideoOff] = useState(false);
  const [isRemoteVideoOff, setIsRemoteVideoOff] = useState(false);
  const [peerEmail, setPeerEmail] = useState("");

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
    fetchWithTimeout(`${API_BASE}/keepalive?id=${id}`, {
      method: "POST",
    });

    const interval = setInterval(() => {
      fetchWithTimeout(`${API_BASE}/keepalive?id=${id}`, {
        method: "POST",
      });
    }, 20000);

    return () => clearInterval(interval);
  }, [id]);

  // --- 1) refs (ליד ה-state למעלה)
  const isInCallRef = useRef(false);
  const isDialingRef = useRef(false);
  const incomingCallRef = useRef(null);
  const onlineUsersRef = useRef([]);
  const peerEmailRef = useRef("");

  // --- 2) סנכרון refs עם state
  useEffect(() => {
    isInCallRef.current = isInCall;
  }, [isInCall]);
  useEffect(() => {
    isDialingRef.current = isDialing;
  }, [isDialing]);
  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);
  useEffect(() => {
    onlineUsersRef.current = onlineUsers;
  }, [onlineUsers]);
  useEffect(() => {
    peerEmailRef.current = peerEmail;
  }, [peerEmail]);

  // --- 3) WebSocket (החלפה מלאה של ה-useEffect הישן)
  useEffect(() => {
    console.log("🌐 Trying to open WebSocket with email:", email);
    const socket = new WebSocket(WS_URL(email));
    ws.current = socket;

    socket.onerror = (err) => {
      console.error("❌ WebSocket error:", err);
    };

    socket.onclose = (e) => {
      console.warn("⚠️ WebSocket closed:", e);
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log("📩 WebSocket message:", data);

      if (
        data.type !== "webrtc_offer" &&
        data.type !== "webrtc_answer" &&
        data.type !== "webrtc_ice_candidate"
      ) {
        setMessages("");
      }

      if (data.type === "incoming_call") {
        if (isInCallRef.current || isDialingRef.current) {
          try {
            await fetchWithTimeout(
              `${API_BASE}/reject`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ call_id: data.call_id }),
              },
              8000
            );
          } catch {}
          showError(`שיחה נכנסת מ-${data.from} נדחתה: אתה כבר בשיחה.`);
          return;
        }

        setIncomingCall({ from: data.from, callId: data.call_id });
        return;
      }

      if (data.type === "call_accepted") {
        setMessages(`✅ Your call was accepted by ${data.by}`);
        setIsInCall(true);
        setIsDialing(false);
        return;
      }

      if (data.type === "call_rejected") {
        setMessages(`❌ Your call was rejected by ${data.by}`);
        peerConnection.current?.close();
        peerConnection.current = null;
        setIsDialing(false);
        setRemoteStream(null);
        setIsInCall(false);
        setCurrentCallId(null);
        stopLocalMedia();
        setIsRemoteVideoOff(false);
        setPeerEmail("");
        return;
      }

      if (data.type === "call_ended") {
        setMessages("Call has ended");
        peerConnection.current?.close();
        peerConnection.current = null;
        stopLocalMedia();
        setRemoteStream(null);
        setIsInCall(false);
        setIncomingCall(null);
        setCurrentCallId(null);
        pendingCandidates.current = [];
        setIsDialing(false);
        incomingOffer.current = null;
        setTimeout(() => setMessages(null), 10000);
        setIsRemoteVideoOff(false);
        setPeerEmail("");
        return;
      }

      if (data.type === "webrtc_offer") {
        if (
          (incomingCallRef.current &&
            incomingCallRef.current.from !== data.from) ||
          isInCallRef.current ||
          isDialingRef.current
        ) {
          console.log("⚠️ Ignoring stray/late offer from", data.from);
          return;
        }
        incomingOffer.current = data;
        return;
      }

      if (data.type === "webrtc_answer") {
        await peerConnection.current?.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
        for (const c of pendingCandidates.current) {
          try {
            await peerConnection.current?.addIceCandidate(c);
          } catch {}
        }
        pendingCandidates.current = [];
        return;
      }

      if (data.type === "webrtc_ice_candidate" && data.candidate) {
        const candidate = new RTCIceCandidate(data.candidate);
        if (peerConnection.current?.remoteDescription?.type) {
          try {
            await peerConnection.current.addIceCandidate(candidate);
          } catch {}
        } else {
          pendingCandidates.current.push(candidate);
        }
        return;
      }

      if (data.type === "video-toggle") {
        setIsFriendVideoOff(data.off);
      }

      if (data.type === "mute-toggle") {
        setIsRemoteMuted(data.off); // true = הצד השני במיוט
        return;
      }
    };

    socket.onclose = () => {
      console.log("WebSocket closed");
    };

    return () => {
      try {
        socket.close();
      } catch {}
    };
  }, [email]);

  // טעינת משתמשים מחוברים
  useEffect(() => {
    const fetchOnlineUsers = async () => {
      const res = await fetchWithTimeout(`${API_BASE}/online`);
      const data = await res.json();
      setOnlineUsers(data);
    };

    fetchOnlineUsers();
    const interval = setInterval(fetchOnlineUsers, 5000);

    return () => clearInterval(interval);
  }, []);

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
        showError(
          "Access to camera/microphone blocked. Allow permissions and try again"
        );
      } else if (err?.name === "NotFoundError") {
        showError("No camera or microphone found on the device");
      } else if (err?.name === "NotReadableError") {
        showError(
          "Device is occupied by another app. Close camera/zoom apps and try again"
        );
      } else if (err?.name === "OverconstrainedError") {
        showError(
          "Camera/microphone settings are not supported. Try other settings."
        );
      } else {
        showError("Error activating camera/microphone");
      }
      throw err;
    }
  };

  const handleCall = async () => {
    console.log("🌐 API_BASE:", API_BASE);

    // בדיקה שהמשתמש מחובר
    if (!onlineUsers.some((user) => user.email === targetEmail)) {
      showError(`המשתמש ${targetEmail} אינו מחובר כרגע`);
      return;
    }
    setMessages("📞 Dialering");
    try {
      setPeerEmail(targetEmail);
      const res = await fetchWithTimeout(
        `${API_BASE}/call`,
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
      await fetchWithTimeout(
        `${API_BASE}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ call_id: incomingCall.callId }),
        },
        10000
      );

      setCurrentCallId(incomingCall.callId);
      setMessages("✅ You accepted the call");
      setIncomingCall(null);
      setIsInCall(true);
      setPeerEmail(incomingCall.from);

      await startLocalStream();
      await handleReceivedOffer(incomingOffer.current);
    } catch (e) {
      showError("שגיאה בקבלת השיחה. נסה שוב.");
    }
  };

  const handleReject = async () => {
    if (!incomingCall) return;

    const res = await fetchWithTimeout(`${API_BASE}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: incomingCall.callId }),
    });

    if (res.ok) {
      setMessages("🚫 You rejected the call");

      // ✅ נקה את כל מה שצריך כדי לא להראות End Call
      setIncomingCall(null);
      setRemoteStream(null); // 👈 מוסיף ניקוי וידאו
      setIsInCall(false); // 👈 מוודא שלא נראה כאילו אתה בשיחה
      setCurrentCallId(null);
      peerConnection.current?.close();
      peerConnection.current = null;

      incomingOffer.current = null;
      stopLocalMedia();
      setIsRemoteVideoOff(false);
      setPeerEmail("");
      setIsMuted(false);
      setIsRemoteMuted(false);
      pendingCandidates.current = [];
    } else {
      setMessages("❌ Failed to reject call");
    }
  };

  const endCall = async () => {
    console.log("📴 Ending call with ID:", currentCallId);

    // שלח לשרת לסיים במסד
    await fetchWithTimeout(`${API_BASE}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: currentCallId }),
    });

    // נקה את הצד שלך
    peerConnection.current?.close();
    peerConnection.current = null;
    stopLocalMedia();
    setRemoteStream(null);
    setIsInCall(false);
    setIncomingCall(null);
    setCurrentCallId(null);
    pendingCandidates.current = [];
    setIsRemoteVideoOff(false);
    setPeerEmail("");
    setIsMuted(false);
    setIsRemoteMuted(false);
  };

  const handleLogout = async () => {
    // 1) עדכן שרת (אם יש endpoint להתנתקות)
    try {
      await fetchWithTimeout(`${API_BASE}/logout`, {
        method: "POST",
        credentials: "include", // אם ה-JWT ב-cookie
      });
    } catch (_) {
      // לא קריטי אם נכשל
    }

    // 2) אם יש שיחה פעילה — סיים אותה בצורה מסודרת
    try {
      if (isInCall) {
        await endCall();
      }
    } catch (_) {}

    // 3) סגור WebSocket אם פתוח
    try {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.close(1000, "user logout");
      }
    } catch (_) {}

    // 4) ניקוי סטייט מקומי
    try {
      peerConnection.current?.close();
      peerConnection.current = null;
      stopLocalMedia();
      setRemoteStream(null);
      setIsInCall(false);
      setIncomingCall(null);
      setCurrentCallId(null);
      setTargetEmail("");
      setOnlineUsers([]);
      setMessages("");
      pendingCandidates.current = [];
      incomingOffer.current = null;
    } catch (_) {}

    // 5) הפניה למסך התחברות/בית
    window.location.href = "/";
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
      showError("שגיאה ביצירת חיבור. נסה שוב.");
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
    setIsRemoteVideoOff(false);
    setPeerEmail("");
    setIsMuted(false);
    setIsRemoteMuted(false);
  };

  const stopLocalMedia = () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach((t) => t.stop());
      localStream.current = null;
    }
  };

  // בתוך Home.jsx, למעלה בתוך הקומפוננטה
  const getPeer = () => peerEmail || incomingCall?.from || targetEmail;

  const handleMute = () => {
    const next = !isMuted;
    setIsMuted(next);

    // הפעלה/כיבוי של ה־audio track בפועל
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach((track) => {
        track.enabled = !next; // אם next=true → השתקה, אחרת → הפעלה
      });
    }

    // שליחת הודעה לצד השני (אם צריך להציג UI מתאים)
    const recipient = getPeer();
    if (recipient && ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: "mute-toggle",
          to: recipient,
          from: email,
          off: next,
        })
      );
    }
  };

  const handleVideo = () => {
    const next = !isVideoOff;
    setIsVideoOff(next);

    // הפעלה/כיבוי של ה־track המקומי בפועל
    if (localStream.current) {
      localStream.current.getVideoTracks().forEach((track) => {
        track.enabled = !next; // אם next=true → כיבוי, אחרת → הדלקה
      });
    }

    // שליחת הודעה לצד השני
    const recipient = getPeer();
    if (recipient && ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: "video-toggle",
          to: recipient,
          from: email,
          off: next,
        })
      );
    }
  };

  useEffect(() => {
    if (!isVideoOff && localStream.current && peerConnection.current) {
      localStream.current.getVideoTracks().forEach((track) => {
        const senders = peerConnection.current.getSenders();
        const sender = senders.find((s) => s.track && s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(track);
        } else {
          peerConnection.current.addTrack(track, localStream.current);
        }
      });
    }
  }, [isVideoOff]);

  return (
    <div>
      <header className="container-header">
        <h2>
          <em>Welcome {name}</em>
        </h2>
      </header>

      <div className="center">
        <main className="container-main">
          <div className="contain-videos">
            <div className="videoCam circle-left">
              {isInCall && (
                <VideoSelf
                  stream={localStream.current}
                  isVideoOff={isVideoOff}
                  isMuteOn={isMuted}
                />
              )}
            </div>
            <div className="videoCam circle-right">
              {isInCall && (
                <VideoFriend
                  remoteStream={remoteStream}
                  isVideoOff={isFriendVideoOff}
                  isMuteOn={isRemoteMuted}
                />
              )}
            </div>
          </div>
          <div className="names">
            <div className="name-order">
              <em>{name}</em>
            </div>
            <div className="name-order">
              <em>{peerEmail}</em>
            </div>
          </div>
        </main>
      </div>

      <footer className="container-footer">
        <div className="first left-container">
          <div className="nigga" style={{ alignItems: "center" }}>
            <select
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
            >
              <option value="">Select user to call</option>
              {onlineUsers
                .filter((u) => u.email !== email)
                .map((user) => (
                  <option key={user.id} value={user.email}>
                    {user.email}
                  </option>
                ))}
            </select>

            <button
              className="btn btn-left-container"
              onClick={handleCall}
              disabled={isDialing || isInCall || !targetEmail}
            >
              Call
            </button>
          </div>

          <div className="nigga">
            <h3>Online Users: {onlineUsers.length}</h3>
          </div>
        </div>

        {isInCall && (
          <div className="second">
            <button
              className="second-block-btn"
              onClick={handleMute}
              disabled={!localStream.current}
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <button
              className="second-block-btn"
              onClick={handleVideo}
              disabled={!localStream.current}
            >
              {isVideoOff ? "Open Video" : "Close Video"}
            </button>
          </div>
        )}

        <div className="three">
          <img src={emoji} alt="Camera emoji" className="emoji-style" />
        </div>

        <div className="four">
          {!isInCall && !isDialing && !incomingCall && (
            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          )}
        </div>

        <div className="last right-container">
          <div className="miki" style={{ paddingLeft: "5%" }}>
            <p>
              <h3>Message Box:</h3>
              <br />
              {messages || "There is no message yet"}
            </p>
          </div>

          <div className="miki" style={{ justifyContent: "center" }}>
            {incomingCall && (
              <div>
                <p className="p-container">
                  📞 Incoming call from {incomingCall.from}
                </p>
                <div className="center">
                  <button className="btn accept-btn" onClick={handleAccept}>
                    Accept
                  </button>
                  <button className="btn reject-btn" onClick={handleReject}>
                    Reject
                  </button>
                </div>
              </div>
            )}

            {isInCall && (
              <button className="btn btn-end-call" onClick={endCall}>
                End Call
              </button>
            )}

            {errorMsg && <div className="err-box">{errorMsg}</div>}
          </div>
        </div>
      </footer>
    </div>
  );
}
