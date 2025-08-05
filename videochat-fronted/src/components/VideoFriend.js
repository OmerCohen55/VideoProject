import { useRef, useEffect } from "react";

export default function VideoFriend({ remoteStream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    console.log("🧩 remoteStream updated", remoteStream);

    if (videoRef.current) {
      if (remoteStream) {
        videoRef.current.srcObject = remoteStream;
        console.log("🎬 VideoFriend got stream:", remoteStream); // ✅ הוספה חשובה
      } else {
        videoRef.current.srcObject = null;
        console.log("🧼 VideoFriend cleared stream");
      }
    }
  }, [remoteStream]);

  return (
    <div>
      <h2>Friend's Camera</h2>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        style={{
          width: "300px",
          height: "225px",
          border: "2px solid lightblue",
        }}
      />
    </div>
  );
}
