// Imports useState from React to handle dynamic state updates
import { useState } from "react";
import "../styles/index.css";
import loginLogo from "../images/login-logo.png";

/** ====== SERVER CONFIG (LAN) ======
 * Prefer configuring via .env:
 *  - Vite:  VITE_API_HOST, VITE_API_PORT
 *  - CRA:   REACT_APP_API_HOST, REACT_APP_API_PORT
 * Fallback defaults to your server machine IP + 8080
 */
const HOST =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_HOST) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_HOST) ||
  "192.168.1.178"; // ← fallback IP

const API_BASE = `https://${HOST}:8443`;

// Exports Login component; receives onLogin and goToRegister functions as props
export default function Login({ onLogin, goToRegister }) {
  // Declares state variables for email and password; updates via setEmail and setPassword
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e) => {
    // Prevents the page from reloading on form submit, so the app keeps its state and we can send the data via fetch without losing user input
    // We want to prevent the reloading because the connection to the server (WS) is closing
    e.preventDefault();

    try {
      // Sends a POST request to the server with the user's login details
      // API_BASE resolves to http://<SERVER_IP>:8080
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST", // send information to the server
        headers: { "Content-Type": "application/json" }, // request headers
        // what to send to the server (JSON)
        body: JSON.stringify({ email, password }),
        // credentials: "include", // ⟵ uncomment if your server sets an auth cookie
      });

      // If response is OK, parse JSON and call onLogin with user data; otherwise, show error alert
      if (res.ok) {
        const data = await res.json();
        onLogin(email, data.name, data.id);
      } else {
        const text = await res.text().catch(() => "");
        alert(`Login failed${text ? `: ${text}` : ""}`);
      }
    } catch (err) {
      alert("Network error. Check server IP/port and try again.");
      console.error(err);
    }
  };

  // Input fields + buttons
  return (
    <div className="location">
      <div className="container-forms">
        <img className="login" src={loginLogo} alt="login-logo" />
        <h1>Login</h1>
        <form onSubmit={handleSubmit}>
          <div className="div-form">
            <label htmlFor="email">Enter Email</label>
            <input
              className="input-forms"
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </div>

          <div className="div-form">
            <label htmlFor="password">Enter Password</label>
            <input
              className="input-forms"
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <div className="div-button">
            <button className="button-forms" type="submit">
              Login
            </button>
          </div>

          <div className="div-button">
            <button
              className="button-as-link"
              type="button"
              onClick={goToRegister}
            >
              Don't have an account? Register
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
