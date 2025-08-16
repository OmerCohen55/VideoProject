package ws

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

// Global map storing active WebSocket connections by user email
var Connections = make(map[string]*websocket.Conn)

// Configures the WebSocket upgrader to accept all incoming connections regardless of origin
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Get the 'email' query parameter from the HTTP request URL
	email := r.URL.Query().Get("email")
	// Returns HTTP 400 Bad Request if no email is provided in the query
	if email == "" {
		http.Error(w, "Missing email", http.StatusBadRequest)
		return
	}

	// Upgrades the incoming HTTP request to a WebSocket connection
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "WebSocket upgrade failed", http.StatusInternalServerError)
		return
	}
	// Ensures the WebSocket connection is closed when the function exits
	defer conn.Close()

	// Stores the active WebSocket connection in the global map using the user's email as the key
	Connections[email] = conn

	for {
		// Reads the next message from the WebSocket connection
		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Println("WS disconnected:", email)
			delete(Connections, email)
			break
		}

		// Temporary struct to extract the message type and recipient from the incoming JSON
		var base struct {
			Type string `json:"type"`
			To   string `json:"to"`
		}
		// Parses the JSON message into the 'base' struct; logs an error if parsing fails
		if err := json.Unmarshal(msg, &base); err != nil {
			log.Println("Failed to parse JSON:", err)
			continue
		}

		// Forwards the received message to the intended recipient if connected; logs errors otherwise
		if destConn, ok := Connections[base.To]; ok {
			err := destConn.WriteMessage(websocket.TextMessage, msg)
			if err != nil {
				log.Println("Failed to send message to", base.To, ":", err)
			}
		} else {
			log.Println("No connection found for:", base.To)
		}
	}
}
