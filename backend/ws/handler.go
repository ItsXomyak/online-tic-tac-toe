package ws

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool { return true },
}

func Handler(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Println("WebSocket upgrade failed:", err)
        return
    }
    defer conn.Close()

    // Отправляем приветствие
    err = conn.WriteJSON(map[string]string{"message": "Connected to Tic-Tac-Toe!"})
    if err != nil {
        log.Println("WebSocket write error:", err)
        return
    }

    // Читаем сообщения
    for {
        _, _, err := conn.ReadMessage()
        if err != nil {
            log.Println("WebSocket read error:", err)
            break
        }
    }
}