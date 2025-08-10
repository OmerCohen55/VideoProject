import { useRef, useEffect } from "react";

export default function VideoSelf({ stream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (stream) {
      videoRef.current.srcObject = stream;
    } else {
      // חשוב: מנתק את הזרם מהווידאו, סוגר את האייקון בדפדפן
      videoRef.current.srcObject = null;
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
        style={{ width: 300, height: 225, border: "2px solid white" }}
      />
    </div>
  );
}
