package controllers // used for handling routes and logic

import (
	"net/http" // handles status code
	"strconv"  // Provides functions to convert strings to numbers (int, float) and numbers to strings

	"time" // Used for working with dates and time
	"videochat-server/db"
	"videochat-server/models"
	"videochat-server/ws" // for WebSocket handling (real-time features)

	"github.com/gin-gonic/gin" // Gin for routing and building the web API
)

// 'c' is the Gin context, used to access request data (query, body, params) and send responses

// Handles the KeepAlive request to update if the user is still active
func KeepAlive(c *gin.Context) {
	idParam := c.Query("id") // Gets the 'id' parameter from the query string

	// Converts idParam to integer 
	id, err := strconv.Atoi(idParam)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Creates a User variable to hold the incoming user data
	var user models.User
	// search for user id (the first user id its found)
	if err := db.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Updates the user's LastKeepAlive field to the current time
	user.LastKeepAlive = time.Now() 
	// Saves the updated user record in the database
	db.DB.Save(&user)

	// Responds with 200 OK and a confirmation message
	c.JSON(http.StatusOK, gin.H{"message": "KeepAlive updated"})
}

// Handles user registration when a POST /register request is received
func Register(c *gin.Context) {
	// Creates a User variable to hold the incoming user data
	var user models.User

	// Tries to read the JSON body from the request to the 'user' object; returns 400 if invalid
	// c.ShouldBindJSON(&user) - read what sent to the var 'user'
	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	// Inserts the new user into the database; returns 500 if saving fails
	if err := db.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	// Responds with 201 Created, confirming registration and returning the created user data
	c.JSON(http.StatusCreated, gin.H{"message": "User registered successfully", "user": user})
}

// Handles user login when a POST /login request is received
func LoginUser(c *gin.Context) {
	// 'input' holds the login data from the client, 
	var input models.User
	// 'user' will store the matched user from the database
	var user models.User

	// Reads the JSON request body (email & password) to 'input'; returns 400 if binding fails
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Looks up a user by email in the database; returns 401 if no match is found
	result := db.DB.Where("email = ?", input.Email).First(&user)
	if result.Error != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	// Compares the provided password with the stored password; returns 401 if they don't match
	if user.Password != input.Password {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Incorrect password"})
		return
	}

	// Returns 200 OK with a success message, the user's ID, and their name
	c.JSON(http.StatusOK, gin.H{
		"message": "Login successful",
		"id":      user.ID, 
		"name":    user.Name,
	})
}

// Handles starting a new call when a POST /call request is received
func StartCall(c *gin.Context) {
	// Creates a Call variable to hold the call details sent from the client
	var call models.Call

	// Reads the JSON request body (caller and receiver details) into 'call'; returns 400 if reading fails
	if err := c.ShouldBindJSON(&call); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Sets the call status to "pending" (waiting for receiver to respond)
	call.Status = "pending"

	// Saves the new call record in the database; returns 500 if saving fails
	if result := db.DB.Create(&call); result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start call"})
		return
	}

	// If the receiver is connected via WebSocket, send them an "incoming_call" notification with the caller's email
	if conn, ok := ws.Connections[call.ReceiverEmail]; ok {
		conn.WriteJSON(map[string]interface{}{ 
			"type":    "incoming_call",
			"from":    call.CallerEmail,
			"call_id": call.ID, // ✅ זה מה שחשוב
		})
	}

	// Responds to the client with 200 OK and a confirmation message that the call was initiated
	c.JSON(http.StatusOK, gin.H{
		"message": "Call initiated",
		"call_id": call.ID, // ⬅️ זה מה שחסר!
	})
}

// Handles accepting a call when a POST /accept request is received
func AcceptCall(c *gin.Context) {
	// Defines a struct to capture the call ID sent in the request body
	type AcceptInput struct {
		CallID uint `json:"call_id"`
	}

	var input AcceptInput
	// Reads the JSON request body into 'input'; returns 400 if the body is invalid
	// ShouldBindJSON must get a struct
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Finds the call in the database by its ID and stores the result in 'call'
	// returns 404 if not found
	var call models.Call
	if err := db.DB.First(&call, input.CallID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Call not found"})
		return
	}
	
	// Updates the call status to "accepted" and saves it in the database
	call.Status = "accepted"
	db.DB.Save(&call)
	
	// If the caller is connected via WebSocket, notify them that the call was accepted (include receiver email)
	if conn, ok := ws.Connections[call.CallerEmail]; ok {
		conn.WriteJSON(map[string]string{
			"type": "call_accepted",
			"by":   call.ReceiverEmail,
		})
	}

	// Responds to the client with 200 OK and a confirmation message
	c.JSON(http.StatusOK, gin.H{"message": "Call accepted"})
}

// Handles rejecting a call when a POST /reject request is received
func RejectCall(c *gin.Context) {
	// Defines a struct to capture the call ID sent in the request body
	type RejectInput struct {
		CallID uint `json:"call_id"`
	}

	// Creates a variable to hold the parsed call ID from the request
	var input RejectInput
	// Reads the JSON request body into 'input'
	// returns 400 if the body is invalid
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}
	
	// Prepares a variable to hold the call record from the database
	var call models.Call
	// Looks up the call by ID in the database
	// returns 404 if not found
	if err := db.DB.First(&call, input.CallID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Call not found"})
		return
	}
	
	// Updates the call status to "rejected" and saves it in the database
	call.Status = "rejected"
	db.DB.Save(&call)

	// If the caller is connected via WebSocket, notify them that the call was rejected (include receiver email)
	if conn, ok := ws.Connections[call.CallerEmail]; ok {
		conn.WriteJSON(map[string]string{
			"type": "call_rejected",
			"by":   call.ReceiverEmail,
		})
	}

	// Responds to the client with 200 OK and a confirmation message
	c.JSON(http.StatusOK, gin.H{"message": "Call rejected"})
}

// Handles ending a call when a POST /end request is received
func EndCall(c *gin.Context) {
	// Defines a struct to capture the call ID sent in the request body
	type EndInput struct {
		CallID uint `json:"call_id"`
	}

	// Creates a variable to hold the parsed call ID from the request
	var input EndInput
	// Reads the JSON request body into 'input'
	// returns 400 if the body is invalid
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Prepares a variable to hold the call record from the database
	var call models.Call
	// Looks up the call by ID in the database; returns 404 if not found
	if err := db.DB.First(&call, input.CallID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Call not found"})
		return
	}

	// Updates the call status to "ended" and saves it in the database
	call.Status = "ended"
	db.DB.Save(&call)

	// If the caller is connected via WebSocket, notify them that the call has ended
	if conn, ok := ws.Connections[call.CallerEmail]; ok {
		conn.WriteJSON(map[string]string{
			"type": "call_ended",
		})
	}

	// If the receiver is connected via WebSocket, notify them that the call has ended
	if conn, ok := ws.Connections[call.ReceiverEmail]; ok {
		conn.WriteJSON(map[string]string{
			"type": "call_ended",
		})
	}

	// Responds to the client with 200 OK and a confirmation message
	c.JSON(http.StatusOK, gin.H{"message": "Call ended"})
}

// Handles fetching all calls for a given email (caller or receiver)
func GetCallsByEmail(c *gin.Context) {
	// Retrieves the 'email' parameter from the URL path
	email := c.Param("email")

	// Prepares a slice to hold all call records from the database
	var calls []models.Call
	// Fetch the database for all calls where the given email is either caller or receiver
	err := db.DB.Where("caller_email = ? OR receiver_email = ?", email, email).Find(&calls).Error

	// Returns 500 if there was an error while fetching calls from the database
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch calls"})
		return
	}

	// Responds with 200 OK and the list of calls as JSON
	c.JSON(http.StatusOK, calls)
}

// Handles fetching all users who are currently online (active within 30 seconds)
func GetOnlineUsers(c *gin.Context) {
	// Prepares a slice to hold all online users from the database
	var users []models.User
	// Calculates the timestamp threshold for users active within the last 30 seconds
	threshold := time.Now().Add(-30 * time.Second) 
	// Search on the database for all users whose last_keep_alive is within the threshold
	db.DB.Where("last_keep_alive > ?", threshold).Find(&users)
	// Responds with 200 OK and the list of online users as JSON
	c.JSON(http.StatusOK, users)
}

// Logout - מסיר את המשתמש מרשימת המחוברים
func Logout(c *gin.Context) {
	type LogoutInput struct {
		ID uint `json:"id"`
	}

	var input LogoutInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// כאן אתה יכול למחוק אותו מטבלת המחוברים או לעדכן שדה "מחובר" ל-false
	err := db.DB.Exec("DELETE FROM online_users WHERE id = ?", input.ID).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to log out"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}