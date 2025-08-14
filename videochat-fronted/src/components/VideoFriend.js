import { useRef, useEffect } from "react";
import "../styles/home.css";
import unVideo from "../images/unVideo.jpg";
import mute from "../images/mute-logo.jpg";

export default function VideoFriend({ remoteStream, isVideoOff, isMuteOn }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !remoteStream) return;
    if (video.srcObject !== remoteStream) {
      video.srcObject = remoteStream; // לא מאפסים לעולם
    }
  }, [remoteStream]);

  return (
    <div className="video-container">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="video-right"
        style={{ visibility: isVideoOff ? "hidden" : "visible" }}
      />
      {isVideoOff && (
        <img src={unVideo} alt="Camera off" className="placeholder-img" />
      )}
      {isMuteOn && <img src={mute} alt="Mute on" className="mute-img" />}
    </div>
  );
}
