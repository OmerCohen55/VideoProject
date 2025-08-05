import React, { useEffect, useRef } from "react";
import * as dashjs from "dashjs";

export default function DashPlayer() {
  const videoRef = useRef(null);

  useEffect(() => {
    const player = dashjs.MediaPlayer().create();
    player.initialize(
      videoRef.current,
      "http://localhost:8080/dash/output.mpd",
      true
    );
  }, []);

  return (
    <div>
      <h3>🎥 DASH Video Player</h3>
      <video
        ref={videoRef}
        controls
        autoPlay
        style={{ width: "500px", border: "1px solid black" }}
      />
    </div>
  );
}
