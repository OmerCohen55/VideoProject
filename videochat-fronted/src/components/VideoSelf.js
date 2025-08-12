import { useRef, useEffect } from "react";
import "../styles/home.css";
import unVideo from "../images/unVideo.jpg";
import mute from "../images/mute-logo.jpg";

export default function VideoSelf({ stream, isVideoOff, isMuteOn }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      if (stream && !isVideoOff) {
        // מחזיר את הווידאו ומרענן את הזרם
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      } else if (isVideoOff) {
        // סוגר את הווידאו ומראה תמונה
        videoRef.current.srcObject = null;
      }
    }
  }, [stream, isVideoOff]);

  return (
    <div className="video-container">
      {isMuteOn && <img src={mute} alt="Mute on" className="mute-img" />}
      {isVideoOff ? (
        <img src={unVideo} alt="Camera off" className="placeholder-img" />
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="video-left"
        />
      )}
    </div>
  );
}
