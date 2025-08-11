import { useRef, useEffect } from "react";
import "../styles/home.css";

export default function VideoFriend({ remoteStream }) {
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

  return (
    <div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        className="video-right"
      />
    </div>
  );
}
