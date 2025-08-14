import { useRef, useEffect } from "react";
import "../styles/home.css";
import unVideo from "../images/unVideo.jpg";
import mute from "../images/mute-logo.jpg";

export default function VideoSelf({ stream, isVideoOff, isMuteOn }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !stream) return;
    if (v.srcObject !== stream) {
      v.srcObject = stream; // תמיד נשאר
    }
  }, [stream]);

  return (
    <div>
      {isMuteOn && <img src={mute} alt="Mute on" className="mute-img" />}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="video-left"
        style={{ visibility: isVideoOff ? "hidden" : "visible" }}
      />
      {isVideoOff && (
        <img src={unVideo} alt="Camera off" className="placeholder-img" />
      )}
    </div>
  );
}
