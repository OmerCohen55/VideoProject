import { useEffect, useRef } from "react";

export default function VideoSelf({ stream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div>
      <h2>My Camera</h2>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "300px", height: "225px", border: "2px solid white" }}
      />
    </div>
  );
}
