// Import useState from React to manage dynamic state in the component
import { useState } from "react";
// Import the components
import Login from "./components/Login";
import Register from "./components/Register";
import Home from "./components/Home";

// Main App component that controls which screen to show
function App() {
  // State to track which screen is currently shown ("login", "register", or "home")
  const [screen, setScreen] = useState("login");
  // State to store the logged-in user's email, name and id
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [id, setId] = useState(null);

  // Handles login by updating user state and switching to home screen
  const handleLogin = (userEmail, userName, userId) => {
    setEmail(userEmail);
    setName(userName);
    setId(userId);
    setScreen("home");
  };

  // Return the JSX UI based on the current screen

  return (
    <div>
      {screen === "login" && (
        <Login
          onLogin={handleLogin}
          goToRegister={() => setScreen("register")}
        />
      )}

      {screen === "register" && (
        <Register goToLogin={() => setScreen("login")} />
      )}

      {screen === "home" && <Home email={email} name={name} id={id} />}
    </div>
  );
}

export default App;
