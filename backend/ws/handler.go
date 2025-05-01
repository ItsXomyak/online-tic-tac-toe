package ws

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/websocket"

	"tictactoe/game"
)

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool {
        return r.Header.Get("Origin") == "http://localhost:5173"
    },
}

var gm *game.GameManager

func InitGameManager(manager *game.GameManager) {
    gm = manager
}

func Handler(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Println("WebSocket upgrade failed:", err)
        return
    }
    defer conn.Close()

    // Получаем playerID из query-параметра
    playerIDStr := r.URL.Query().Get("playerID")
    playerID, err := strconv.Atoi(playerIDStr)
    if err != nil {
        log.Println("Invalid playerID:", err)
        conn.WriteJSON(map[string]string{"error": "Invalid playerID"})
        return
    }

    // Регистрируем клиента
    log.Printf("Registering player %d for WebSocket", playerID)
    gm.RegisterClient(playerID, conn)

    // Отправляем подтверждение подключения
    err = conn.WriteJSON(map[string]string{"type": "connected", "message": "Connected to Tic-Tac-Toe!"})
    if err != nil {
        log.Println("WebSocket write error:", err)
        return
    }

    // Читаем сообщения
    for {
        var msg map[string]interface{}
        err := conn.ReadJSON(&msg)
        if err != nil {
            log.Println("WebSocket read error for player", playerID, ":", err)
            break
        }
        log.Printf("Received message from player %d: %v", playerID, msg)

        // Обработка хода
        if msg["type"] == "move" {
            x := int(msg["x"].(float64))
            y := int(msg["y"].(float64))
            gameID := int(msg["gameID"].(float64))
            gm.HandleMove(gameID, playerID, x, y)
        }
    }
}