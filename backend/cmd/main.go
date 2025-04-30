package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

	_ "github.com/lib/pq"

	"tictactoe/game"
	"tictactoe/ws"
)

type Stats struct {
    Online int `json:"online"`
    Games  int `json:"games"`
}

var db *sql.DB
var gm *game.GameManager

func main() {
    // Подключение к PostgreSQL
    var err error
    db, err = sql.Open("postgres", "postgres://user:password@db:5432/tictactoe?sslmode=disable")
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()

    // Проверка соединения
    if err = db.Ping(); err != nil {
        log.Fatal("Cannot connect to DB:", err)
    }

    // Инициализация GameManager
    gm = game.NewGameManager()

    // Создаем маршрутизатор
    mux := http.NewServeMux()
    mux.HandleFunc("/ws", ws.Handler)
    mux.HandleFunc("/stats", handleStats)
    mux.HandleFunc("/quick-game", handleQuickGame)

    // Оборачиваем маршруты в CORS middleware
    handler := corsMiddleware(mux)

    log.Println("Server started on :8080")
    log.Fatal(http.ListenAndServe(":8080", handler))
}

func corsMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Разрешаем доступ с фронтенда (Vite на порту 5173)
        w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
        w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

        // Обрабатываем предварительные запросы OPTIONS
        if r.Method == http.MethodOptions {
            w.WriteHeader(http.StatusOK)
            return
        }

        // Передаем запрос дальше
        next.ServeHTTP(w, r)
    })
}

func handleStats(w http.ResponseWriter, r *http.Request) {
    stats := Stats{Online: 0, Games: 0}
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(stats)
}

func handleQuickGame(w http.ResponseWriter, r *http.Request) {
    playerID := 1 // Заглушка
    opponentID := gm.FindOpponent(playerID)
    if opponentID == 0 {
        w.Write([]byte("Waiting for opponent..."))
    } else {
        w.Write([]byte("Opponent found! Game started."))
    }
}