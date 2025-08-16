import { useEffect, useRef, useState } from "react";
import VideoSelf from "./VideoSelf";
import VideoFriend from "./VideoFriend";
import "../styles/home.css";
import emoji from "../images/emoji.png";

// ====== SERVER CONFIG (LAN) ======
// Defines a constant HOST to store the server address
const HOST =
  // (used in Vite projects)
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_HOST) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_HOST) ||
  "192.168.1.147"; // Uses default IP address 192.168.1.147 if no environment variable is found (when the server is running)

// Defines a constant PORT to store the API server port
const PORT =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_PORT) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_PORT) ||
  "8443"; // now using HTTPS default

// Builds the base API URL using HTTPS, the resolved HOST, and the resolved PORT
const API_BASE = `https://${HOST}:${PORT}`;

// Defines an arrow function WS_URL that takes an email and returns a WebSocket URL
const WS_URL = (email) =>
  `wss://${HOST}:${PORT}/ws?email=${encodeURIComponent(email)}`;

export default function Home({ email, name, id }) {
  // Stores the message text shown to the user
  const [messages, setMessages] = useState("");

  // Stores the email of the user you want to call
  const [targetEmail, setTargetEmail] = useState("");

  // Holds the list of online users fetched from the server
  const [onlineUsers, setOnlineUsers] = useState([]);

  // Reference to the active WebSocket connection
  // useRef creates a constant container (ws.current) that holds the active WebSocket instance without triggering re-renders when updated
  const ws = useRef(null);

  // Holds data about an incoming call (caller email and call ID)
  const [incomingCall, setIncomingCall] = useState(null);

  // Saya if the current user is in a call
  const [isInCall, setIsInCall] = useState(false);

  // Stores the MediaStream from the remote peer. triggers re-render to display it in the UI
  // remoteStream: the peer's media stream (camera + microphone) received by you
  const [remoteStream, setRemoteStream] = useState(null);

  // Reference to the local MediaStream (camera + microphone)
  // localStream: your media stream (camera + microphone) sent to the peer
  const localStream = useRef(null);

  // Reference to the RTCPeerConnection object used for WebRTC
  // WebRTC - Web Real-Time Communication (lives, games)
  const peerConnection = useRef(null);

  // Stores the current call's unique ID
  const [currentCallId, setCurrentCallId] = useState(null);

  // Holds ICE candidates received before peer connection is ready
  // Temporary storage for RTCIceCandidate objects (connection details like IP/port) received before the PeerConnection is ready to use them
  const pendingCandidates = useRef([]);

  // Stores the offer received from a remote peer before accepting
  const incomingOffer = useRef(null);

  // Stores the latest error message to display
  const [errorMsg, setErrorMsg] = useState("");

  // Says if the current user is dialing (calling)
  const [isDialing, setIsDialing] = useState(false);

  // Says if the local microphone is muted
  const [isMuted, setIsMuted] = useState(false);

  // Says if the remote peer's microphone is muted
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);

  // Says if the local video camera is turned off
  const [isVideoOff, setIsVideoOff] = useState(false);

  // Says if the remote peer's video camera is turned off
  const [isFriendVideoOff, setIsFriendVideoOff] = useState(false);

  // Stores the email of the peer currently connected in the call
  const [peerEmail, setPeerEmail] = useState("");

  // Holds a flag indicating if the user is currently in a call
  const isInCallRef = useRef(false);

  // Holds a flag indicating if the user is currently dialing someone
  const isDialingRef = useRef(false);

  // Stores details of the incoming call, or null if there is none
  const incomingCallRef = useRef(null);

  // Keeps the current list of online users without causing re-renders
  const onlineUsersRef = useRef([]);

  // Stores the email of the peer currently connected or being called
  const peerEmailRef = useRef("");

  // Helper function that receives an error message and shows it temporarily in the UI
  const showError = (msg) => {
    console.error(msg);
    setErrorMsg(msg);
    // Clears the error message after 10,000 ms (10 seconds) — note: comment says 5s but code uses 10s
    setTimeout(() => setErrorMsg(""), 10000);
  };

  // Async function that performs a fetch request with a timeout (default 8 seconds)
  const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
    // Creates an AbortController to cancel the request if timeout is reached
    const ctrl = new AbortController();
    // Sets a timer to abort the request if timeoutMs is exceeded
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      // Attempts to fetch the given URL with options, passing the abort signal for cancellation
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      // Clears the timeout if the request completes before the limit
      clearTimeout(id);
      // If response is not OK, read the text (if possible) and throw an error with status and details
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${text || url}`);
      }
      return res;
    } catch (e) {
      // On error (including timeout), clear the timer and rethrow the error
      clearTimeout(id);
      throw e;
    }
  };

  // Runs code to keep the server informed that the user is still connected by sending periodic keepalive requests
  useEffect(() => {
    // Sends a POST request to /keepalive with the user's ID when the component first mounts
    fetchWithTimeout(`${API_BASE}/keepalive?id=${id}`, {
      method: "POST",
    });

    // Sets an interval to send the same keepalive request every 20 seconds
    const interval = setInterval(() => {
      fetchWithTimeout(`${API_BASE}/keepalive?id=${id}`, {
        method: "POST",
      });
    }, 20000);

    // Cleanup function: stops the interval when the component unmounts or dependencies change
    return () => clearInterval(interval);
  }, [id]);

  // Syncs isInCall state into isInCallRef so async callbacks can read the latest value without triggering re-renders
  useEffect(() => {
    isInCallRef.current = isInCall;
  }, [isInCall]);

  // Updates isDialingRef whenever isDialing changes so listeners always see the latest dialing state
  useEffect(() => {
    isDialingRef.current = isDialing;
  }, [isDialing]);

  // Mirrors the latest incoming call object into a ref without causing re-renders
  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  // Keeps a ref copy of the online users list for use in timers/listeners without stale state
  useEffect(() => {
    onlineUsersRef.current = onlineUsers;
  }, [onlineUsers]);

  // Syncs the current peer email into a ref for immediate use in callbacks without re-rendering
  useEffect(() => {
    peerEmailRef.current = peerEmail;
  }, [peerEmail]);

  // useEffect to initialize WebSocket connection when 'email' changes
  useEffect(() => {
    // Log the attempt to open WebSocket
    console.log("Trying to open WebSocket with email:", email);

    // Create new WebSocket connection to server using user's email
    const socket = new WebSocket(WS_URL(email));
    ws.current = socket;

    // Handle WebSocket connection errors
    socket.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    // Log when WebSocket connection closes
    socket.onclose = (e) => {
      console.warn("WebSocket closed:", e);
    };

    // Handle incoming WebSocket messages
    socket.onmessage = async (event) => {
      // Parse incoming JSON message
      const data = JSON.parse(event.data);
      console.log("WebSocket message:", data);

      // Clear messages unless it's a WebRTC message
      if (
        data.type !== "webrtc_offer" &&
        data.type !== "webrtc_answer" &&
        data.type !== "webrtc_ice_candidate"
      ) {
        setMessages("");
      }

      // Handle incoming call request
      if (data.type === "incoming_call") {
        // If already in a call or dialing, reject the new call
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
          showError(
            `Incoming call from ${data.from} was rejected: you are already in a call.`
          );
          return;
        }

        // Store incoming call details
        setIncomingCall({ from: data.from, callId: data.call_id });
        return;
      }

      // Handle case when outgoing call is accepted
      if (data.type === "call_accepted") {
        setMessages(`Your call was accepted by ${data.by}`);
        setIsInCall(true);
        setIsDialing(false);
        return;
      }

      // Handle case when outgoing call is rejected
      if (data.type === "call_rejected") {
        setMessages(`Your call was rejected by ${data.by}`);
        peerConnection.current?.close();
        peerConnection.current = null;
        setIsDialing(false);
        setRemoteStream(null);
        setIsInCall(false);
        setCurrentCallId(null);
        stopLocalMedia();
        setPeerEmail("");
        return;
      }

      // Handle call ended by the other user
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
        setPeerEmail("");
        return;
      }

      // Handle incoming WebRTC offer
      if (data.type === "webrtc_offer") {
        // Ignore offer if user is busy or offer is from a different caller
        if (
          (incomingCallRef.current &&
            incomingCallRef.current.from !== data.from) ||
          isInCallRef.current ||
          isDialingRef.current
        ) {
          console.log("Ignoring stray/late offer from", data.from);
          return;
        }

        // Save offer for later use (when accepting call)
        incomingOffer.current = data;
        return;
      }

      // Handle WebRTC answer to a previously sent offer
      if (data.type === "webrtc_answer") {
        await peerConnection.current?.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );

        // Apply any buffered ICE candidates
        for (const c of pendingCandidates.current) {
          try {
            await peerConnection.current?.addIceCandidate(c);
          } catch {}
        }

        // Clear the candidate buffer
        pendingCandidates.current = [];
        return;
      }

      // Handle new incoming ICE candidate
      if (data.type === "webrtc_ice_candidate" && data.candidate) {
        const candidate = new RTCIceCandidate(data.candidate);

        // If remote description is set, apply candidate
        if (peerConnection.current?.remoteDescription?.type) {
          try {
            await peerConnection.current.addIceCandidate(candidate);
          } catch {}
        } else {
          // Otherwise, buffer it for later
          pendingCandidates.current.push(candidate);
        }
        return;
      }

      // Handle video on/off toggle from other user
      if (data.type === "video-toggle") {
        setIsFriendVideoOff(data.off);
      }

      // Handle mute/unmute toggle from other user
      if (data.type === "mute-toggle") {
        setIsRemoteMuted(data.off); // true = other side is muted
        return;
      }
    };

    // Handle WebSocket close (duplicate safeguard)
    socket.onclose = () => {
      console.log("WebSocket closed");
    };

    // Cleanup function: close socket when component unmounts
    return () => {
      try {
        socket.close();
      } catch {}
    };
  }, [email]); // Rerun effect if 'email' changes

  // useEffect to periodically fetch the list of online users from the server
  useEffect(() => {
    // Define async function to fetch current online users
    const fetchOnlineUsers = async () => {
      // Send GET request to /online endpoint with timeout
      const res = await fetchWithTimeout(`${API_BASE}/online`);

      // Parse JSON response
      const data = await res.json();

      // Update the state with the list of online users
      setOnlineUsers(data);
    };

    // Call the function immediately when component mounts
    fetchOnlineUsers();

    // Set interval to fetch online users every 5 seconds
    const interval = setInterval(fetchOnlineUsers, 5000);

    // Clear the interval when component unmounts
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
    console.log("API_BASE:", API_BASE);

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
      setPeerEmail("");
      setIsMuted(false);
      setIsRemoteMuted(false);
      pendingCandidates.current = [];
    } else {
      setMessages("❌ Failed to reject call");
    }
  };

  const endCall = async () => {
    console.log("Ending call with ID:", currentCallId);

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
      console.warn("peerConnection already exists, skipping re-init");
      return;
    }

    if (!localStream.current || localStream.current.getTracks().length === 0) {
      console.error(
        "Cannot initiate connection: local stream is missing or empty"
      );
      return;
    }

    console.log("Sending local tracks:", localStream.current.getTracks());

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
      console.log("Got remote track!", event.streams);
      setRemoteStream(event.streams[0]);
    };

    // שליחת מועמדי ICE
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        const recipient = targetEmail || incomingCall?.from;
        console.log("Sending ICE candidate", event.candidate);
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
      console.error("Error creating/sending offer:", err);
      cleanupConnection();
    }
  };

  const handleReceivedOffer = async (data) => {
    console.log("Received offer:", data.offer);

    await startLocalStream();

    if (peerConnection.current) {
      console.warn("peerConnection already exists, skipping re-init");
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
        console.log("Sending ICE candidate", event.candidate);
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
      console.log("Got remote track!", event.streams);
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
      console.error("Error handling received offer:", err);
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
