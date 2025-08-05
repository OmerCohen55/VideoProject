import { useEffect, useRef, useState } from "react";

// Exports Home component, receiving email, name and id as props from the parent component
export default function Home({ email, name, id }) {
  const [messages, setMessages] = useState([]);
  const [targetEmail, setTargetEmail] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isInCall, setIsInCall] = useState(false);
  const ws = useRef(null);

  // שמירת משתמש בחיים
  useEffect(() => {
    fetch(`http://localhost:8080/keepalive?id=${id}`, { method: "POST" });
    const interval = setInterval(() => {
      fetch(`http://localhost:8080/keepalive?id=${id}`, { method: "POST" });
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  // התחברות ל-WebSocket
  useEffect(() => {
    ws.current = new WebSocket(`ws://localhost:8080/ws?email=${email}`);

    ws.current.onmessage = (event) => {
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
    };

    ws.current.onclose = () => {
      console.log("WebSocket closed");
    };

    return () => ws.current.close();
  }, []);

  // טעינת רשימת משתמשים אונליין
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

  // התחלת שיחה
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
      alert("Call request sent");
    } else {
      alert("Call failed");
    }
  };

  // קבלת שיחה
  const handleAccept = async () => {
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

  // דחיית שיחה
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
      <video
        id="my-video"
        autoPlay
        muted
        style={{ width: "300px", border: "1px solid gray" }}
      />
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
    </div>
  );
}
