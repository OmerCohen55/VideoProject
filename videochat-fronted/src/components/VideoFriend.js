import { useRef, useEffect } from "react";
import "../styles/home.css";
import unVideo from "../images/unVideo.jpg";
import mute from "../images/mute-logo.jpg";

export default function VideoFriend({ remoteStream, isVideoOff, isMuteOn }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (remoteStream) {
      video.srcObject = remoteStream;
      console.log("🎬 VideoFriend got stream:", remoteStream);

      const handleLoadedMetadata = () => {
        video.play().catch((err) => {
          console.error("❌ Video play error:", err);
        });
      };

      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      return () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      };
    }
  }, [remoteStream]);

  useEffect(() => {
    if (!isVideoOff && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [isVideoOff]);

  useEffect(() => {
    if (!isVideoOff && remoteStream && videoRef.current) {
      videoRef.current.srcObject = remoteStream; // ריענון חיבור
      videoRef.current.play().catch(() => {});
    }
  }, [isVideoOff, remoteStream]);

  return (
    <div>
      {isMuteOn && <img src={mute} alt="Mute on" className="mute-img" />}
      {isVideoOff ? (
        <img src={unVideo} alt="Camera off" className="placeholder-img" />
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={false}
          className="video-right"
        />
      )}
    </div>
  );
}
