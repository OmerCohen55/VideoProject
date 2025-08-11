import "../styles/index.css";
import videoLogo from "../images/video-logo.jpg";

export default function FirstPage({ goToLogin, goToRegister }) {
  return (
    <div className="location location-first-page">
      <div className="container-firstPage">
        <h1>Video Chat Website</h1>
        <div className="div-buttons">
          <button className="firstPageBTN" type="button" onClick={goToRegister}>
            Register
          </button>
          <button className="firstPageBTN" type="button" onClick={goToLogin}>
            Login
          </button>
        </div>
      </div>
      <img className="video-img" src={videoLogo} alt="video-logo" />
    </div>
  );
}
