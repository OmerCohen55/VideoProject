// Imports useState from React to handle dynamic state updates
import { useState } from "react";

// Exports Login component; receives onLogin and goToRegister functions as props
export default function Login({ onLogin, goToRegister }) {
  // Declares state variables for email and password; updates via setEmail and setPassword
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e) => {
    // Prevents the page from reloading on form submit, so the app keeps its state and we can send the data via fetch without losing user input
    // We want to prevent the reloading because the connection to the server (WS) is closing
    e.preventDefault();

    // We must use await because the rest of the code coudn't run without the request return a response to the server
    // Sends a POST request to the server with the user's login details
    // http://localhost:8080/login - the server adress
    // In to the res var enter the response from the server
    const res = await fetch("http://localhost:8080/login", {
      method: "POST", // send an information to the server
      headers: { "Content-Type": "application/json" }, // the header request
      // what send to the server (and its parse to json format)
      body: JSON.stringify({ email, password }),
    });

    // If response is OK, parse JSON and call onLogin with user data; otherwise, show error alert
    if (res.ok) {
      const data = await res.json();
      onLogin(email, data.name, data.id);
    } else {
      alert("Login failed");
    }
  };

  // Input field for email; updates 'email' state on change
  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">Enter Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="password">Enter Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div>
          <button type="submit">Login</button>
        </div>

        <div>
          <button type="button" onClick={goToRegister}>
            Don't have an account? Register
          </button>
        </div>
      </form>
    </div>
  );
}
