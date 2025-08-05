package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
)

// Maps each email address to its active WebSocket connection
var Connections = make(map[string]*websocket.Conn)

// Configures the WebSocket upgrader to allow all origins/sources (including localhost)
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func extractToFieldFromMessage(data []byte) string {
	var msg map[string]interface{}
	if err := json.Unmarshal(data, &msg); err != nil {
		return ""
	}
	to, ok := msg["to"].(string)
	if !ok {
		return ""
	}
	return to
}

// Handles a new incoming WebSocket connection from a client
func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// מקבל את ה־email מה-URL
	email := strings.ToLower(r.URL.Query().Get("email"))

	// אם לא התקבל אימייל – החזר שגיאה
	if email == "" {
		http.Error(w, "Missing email", http.StatusBadRequest)
		return
	}

	// משדרג את החיבור מ-HTTP ל-WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "WebSocket upgrade failed", http.StatusInternalServerError)
		return
	}

	log.Println("📡 New WebSocket from:", email)

	// שומר את החיבור במפה הגלובלית לפי אימייל
	Connections[email] = conn

	// מאזין להודעות WebSocket
	for {
		messageType, data, err := conn.ReadMessage()
		if err != nil {
			log.Println("📴 WebSocket closed:", err)
			delete(Connections, email)
			break
		}

		if messageType == websocket.TextMessage {
			log.Println("📝 Received signaling message:", string(data))

			// שלב 1: מצא את מי צריך לקבל את ההודעה
			targetEmail := extractToFieldFromMessage(data)
			if targetEmail == "" {
				log.Println("❌ Missing 'to' field in message")
				continue
			}

			log.Println("🔍 Looking for target:", targetEmail)
			log.Println("📚 Current connections map:")
			for e := range Connections {
				log.Println("   -", e)
			}

			// שלב 2: מצא את החיבור של אותו משתמש
			targetConn, ok := Connections[targetEmail]
			if !ok {
				log.Println("🚫 Target user not connected:", targetEmail)
				continue
			}

			// שלב 3: שלח לו את ההודעה
			err = targetConn.WriteMessage(websocket.TextMessage, data)
			if err != nil {
				log.Println("❌ Failed to send message to", targetEmail, ":", err)
			}
		}
	}
}
