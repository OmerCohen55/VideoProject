import { useRef, useEffect } from "react";
import "../styles/home.css";

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
      <video ref={videoRef} autoPlay playsInline muted className="video-left" />
    </div>
  );
}
