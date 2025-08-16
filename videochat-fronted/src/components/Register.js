// Imports useState from React to handle dynamic state updates
import { useState } from "react";
import "../styles/index.css";
import regLogo from "../images/register-logo.jpg";

// ====== SERVER CONFIG (LAN) ======
// Defines a constant HOST to store the server address
const HOST =
  // (used in Vite projects)
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_HOST) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_HOST) ||
  "192.168.1.147"; // Uses default IP address 192.168.1.147 if no environment variable is found (when the server is running)

// Builds the base API URL using HTTPS, the HOST value, and port 8443
const API_BASE = `https://${HOST}:8443`;

// Defines the Register component, receiving goToLogin as a prop
export default function Register({ goToLogin }) {
  // Declares state variables for username, email and password with initial empty values
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  const handleSubmit = async (e) => {
    // Prevent form reload to keep SPA state (and active WS if any)
    e.preventDefault();

    try {
      // Sends a POST request to the server with the user's registration details
      const res = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // credentials: "include", // ⟵ uncomment if server sets auth cookie
        body: JSON.stringify({ name, email, password: pass }),
      });

      if (res.ok) {
        alert("Registered successfully");
        goToLogin(); // navigate back to login
      } else {
        const text = await res.text().catch(() => "");
        alert(`Registration failed${text ? `: ${text}` : ""}`);
      }
    } catch (err) {
      console.error(err);
      alert("Network error. Check server IP/port and try again.");
    }
  };

  return (
    <div className="location">
      <div className="container-forms">
        <img className="reg" src={regLogo} alt="reg-logo" />
        <h1>Register</h1>

        <form onSubmit={handleSubmit} noValidate>
          <div className="div-form">
            <label htmlFor="username">Enter Username</label>
            <input
              className="input-forms"
              type="text"
              id="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="username"
            />
          </div>

          <div className="div-form">
            <label htmlFor="email">Enter Email</label>
            <input
              className="input-forms"
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="div-form">
            <label htmlFor="pass">Enter Password</label>
            <input
              className="input-forms"
              type="password"
              id="pass"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              required
              autoComplete="new-password"
              minLength={6}
            />
          </div>

          <div className="div-button">
            <button className="button-forms" type="submit">
              Submit
            </button>
          </div>

          <div className="div-button">
            <button
              className="button-as-link"
              type="button"
              onClick={goToLogin}
            >
              Already have an account? Login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
