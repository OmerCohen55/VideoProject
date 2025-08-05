package ws

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

var Connections = make(map[string]*websocket.Conn)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	email := r.URL.Query().Get("email")
	if email == "" {
		http.Error(w, "Missing email", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "WebSocket upgrade failed", http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	log.Println("📡 New WebSocket from:", email)
	Connections[email] = conn

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Println("📴 WS disconnected:", email)
			delete(Connections, email)
			break
		}

		// ננסה להבין מה הסוג של ההודעה שהתקבלה
		var base struct {
			Type string `json:"type"`
			To   string `json:"to"`
		}
		if err := json.Unmarshal(msg, &base); err != nil {
			log.Println("❌ Failed to parse JSON:", err)
			continue
		}

		// אם יש חיבור פתוח למי שצריך לשלוח לו, נעביר לו את ההודעה
		if destConn, ok := Connections[base.To]; ok {
			err := destConn.WriteMessage(websocket.TextMessage, msg)
			if err != nil {
				log.Println("❌ Failed to send message to", base.To, ":", err)
			}
		} else {
			log.Println("❌ No connection found for:", base.To)
		}
	}
}
