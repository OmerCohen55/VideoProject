// the main package - in this package the server is operating
package main

// importing external and internal packages
import (
	// external
	"net/http" // handles status code

	"github.com/gin-contrib/cors" // enable communication between the server and the front
	"github.com/gin-gonic/gin"    // this labriry runs the server

	// internal
	"videochat-server/controllers" // contains functions that handles requests like login or register
	"videochat-server/db"          // responsible for the connection to the database
	"videochat-server/ws"          // handles websockets
)

// The main function (this is where the program starts running when we execute it)
func main() {
	// Initializes the database connection (PostgreSQL) and runs AutoMigrate to create/update tables based on models.
	db.InitDB()

	// Creates the main Gin router that handles all incoming HTTP requests.
	// It maps requests to the correct routes (like /register, /login),
	// calls the matching controller functions, and returns responses.
	// `r` is the router object, initialized with default settings.
	r := gin.Default()

	// Enables CORS so the React frontend (on a different URL) can communicate with this server without browser blocking.
	r.Use(cors.Default())

	// Adds a test route at "/" that responds with a JSON message to confirm the server is running.
	r.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "Server is running!"})
	})

	// This is the API - the front (react) doesn't access to ths DB. He use this way for posting or getting information from the server 
	// Creates a POST route
	// POST route: updates user's last activity to keep them marked as online.
	r.POST("/keepalive", controllers.KeepAlive)

	// POST route: registers a new user (stores name, email, and password in the database).
	r.POST("/register", controllers.Register)

	// POST route: logs in a user by verifying email and password.
	r.POST("/login", controllers.LoginUser)

	// POST route: starts a new call (creates a call record with status "pending").
	r.POST("/call", controllers.StartCall)

	// POST route: accepts an incoming call (updates the call status to "accepted").
	r.POST("/accept", controllers.AcceptCall)

	// POST route: rejects an incoming call (updates the call status to "rejected").
	r.POST("/reject", controllers.RejectCall)

	// POST route: ends an active call (updates the call status to "ended").
	r.POST("/end", controllers.EndCall)

	// GET route: fetches all calls related to a specific email (from the database).
	r.GET("/calls/:email", controllers.GetCallsByEmail)

	r.GET("/ws", func(c *gin.Context) {
		ws.HandleWebSocket(c.Writer, c.Request)
	})

	r.GET("/online", controllers.GetOnlineUsers)

	// אחרי r.POST("/login", controllers.LoginUser)
	r.POST("/logout", controllers.Logout)


	r.Static("/dash", "./dash")

	// Starts the server and listens for incoming requests on port 8080, routing them to the defined endpoints.
	r.Run(":8080")
}
