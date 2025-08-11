// Imports useState from React to handle dynamic state updates
import { useState } from "react";
import "../styles/index.css";
import regLogo from "../images/register-logo.jpg";

// Defines the Register component, receiving goToLogin as a prop
export default function Register({ goToLogin }) {
  // Declares state variables for username, email and password with initial empty values
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  const handleSubmit = async (e) => {
    // Prevents the page from reloading on form submit, so the app keeps its state and we can send the data via fetch without losing user input
    // We want to prevent the reloading because the connection to the server (WS) is closing
    e.preventDefault();

    // We must use await because the rest of the code coudn't run without the request return a response to the server
    // Sends a POST request to the server with the user's registration details
    // http://localhost:8080/register - the server adress
    // In to the res var enter the response from the server
    const res = await fetch("http://localhost:8080/register", {
      method: "POST", // send an information to the server
      headers: { "Content-Type": "application/json" }, // the header request
      // what send to the server (and its parse to json format)
      body: JSON.stringify({ name, email, password: pass }),
    });

    // Checks if the server response say success (status 200–299)
    if (res.ok) {
      // Calls the goToLogin function (prop) to navigate back to the login screen
      goToLogin();
      // Shows a popup message confirming successful registration
      alert("Registered successfully");
    } else {
      // If the response is not successful, shows an error message to the user
      alert("Registration failed");
    }
  };

  return (
    <div className="location">
      <div className="container-forms">
        <img className="reg" src={regLogo} alt="reg-logo" />
        <h1>Register</h1>
        <form onSubmit={handleSubmit}>
          <div className="div-form">
            <label htmlFor="username">Enter Username</label>
            <input
              className="input-forms"
              type="text"
              id="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
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
