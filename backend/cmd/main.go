package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

	_ "github.com/lib/pq"

	"tictactoe/game"
	"tictactoe/utils"
	"tictactoe/ws"
)

type Stats struct {
    Online int `json:"online"`
    Games  int `json:"games"`
}

var db *sql.DB
var gm *game.GameManager

func main() {
    var err error
    db, err = sql.Open("postgres", "postgres://user:password@db:5432/tictactoe?sslmode=disable")
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()

    if err = db.Ping(); err != nil {
        log.Fatal("Cannot connect to DB:", err)
    }

    gm = game.NewGameManager()
    ws.InitGameManager(gm) // Передаем GameManager в ws

    mux := http.NewServeMux()
    mux.HandleFunc("/ws", ws.Handler)
    mux.HandleFunc("/stats", handleStats)
    mux.HandleFunc("/quick-game", handleQuickGame)

    handler := corsMiddleware(mux)
    log.Println("Server started on :8080")
    log.Fatal(http.ListenAndServe(":8080", handler))
}

func corsMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
        w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
        if r.Method == http.MethodOptions {
            w.WriteHeader(http.StatusOK)
            return
        }
        next.ServeHTTP(w, r)
    })
}

func handleStats(w http.ResponseWriter, r *http.Request) {
    stats := Stats{Online: 0, Games: 0}
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(stats)
}

func handleQuickGame(w http.ResponseWriter, r *http.Request) {
    nickname := utils.GenerateNickname()
    var playerID int
    err := db.QueryRow("INSERT INTO users (nickname) VALUES ($1) ON CONFLICT (nickname) DO UPDATE SET nickname = EXCLUDED.nickname || '_' || (random() * 1000)::integer RETURNING id", nickname).Scan(&playerID)
    if err != nil {
        http.Error(w, "Failed to create user", http.StatusInternalServerError)
        log.Println("DB error:", err)
        return
    }

    opponentID := gm.FindOpponent(playerID)
    w.Header().Set("Content-Type", "application/json")
    response := map[string]interface{}{"status": "waiting", "playerID": playerID}
    if opponentID != 0 {
        response["status"] = "started"
        response["opponentID"] = opponentID
    }
    log.Printf("Quick game for player %d: %v", playerID, response)
    if err := json.NewEncoder(w).Encode(response); err != nil {
        log.Println("Failed to encode response:", err)
    }
}
