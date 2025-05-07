package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	_ "github.com/lib/pq"

	"tictactoe/db"
	"tictactoe/game"
	"tictactoe/utils"
	"tictactoe/ws"
)

type Stats struct {
	Online int `json:"online"`
	Games  int `json:"games"`
}

type OfflineStats struct {
	Wins   int `json:"wins"`
	Losses int `json:"losses"`
	Draws  int `json:"draws"`
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

var gm *game.GameManager

func main() {
	err := db.Init()
	if err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	defer db.DB.Close()

	gm = game.NewGameManager()
	ws.InitGameManager(gm)

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", ws.Handler)
	mux.HandleFunc("/stats", handleStats)
	mux.HandleFunc("/quick-game", handleQuickGame)
	mux.HandleFunc("/offline-game", handleOfflineGame)
	mux.HandleFunc("/offline-stats", handleOfflineStats)

	handler := errorMiddleware(corsMiddleware(mux))
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

func errorMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Errorr: %v", r)
				sendError(w, http.StatusInternalServerError, "Internal server error", "Unexpected error occurred")
			}
		}()

		w.Header().Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}

func sendError(w http.ResponseWriter, status int, errorType, message string) {
	w.WriteHeader(status)
	response := ErrorResponse{Error: errorType, Message: message}
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Failed to encode error response: %v", err)
	}
}

func handleStats(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		sendError(w, http.StatusInternalServerError, "Streaming error", "Streaming not supported")
		return
	}

	lastStats := gm.GetStats()
	if err := json.NewEncoder(w).Encode(lastStats); err != nil {
		log.Println("Failed to encode stats:", err)
		return
	}
	flusher.Flush()

	ticker := time.NewTicker(10 * time.Second)
	timeout := time.After(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			currentStats := gm.GetStats()
			if currentStats != lastStats {
				if err := json.NewEncoder(w).Encode(currentStats); err != nil {
					log.Println("Failed to encode stats:", err)
					return
				}
				flusher.Flush()
				return
			}
		case <-timeout:
			return
		}
	}
}

func handleQuickGame(w http.ResponseWriter, r *http.Request) {
	nickname := utils.GenerateNickname()
	var playerID int
	err := db.DB.QueryRow("INSERT INTO users (nickname) VALUES ($1) ON CONFLICT (nickname) DO UPDATE SET nickname = EXCLUDED.nickname || '_' || (random() * 1000)::integer RETURNING id", nickname).Scan(&playerID)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Database error", "Failed to create user")
		log.Println("DB error:", err)
		return
	}

	opponentID := gm.FindOpponent(playerID)
	response := map[string]interface{}{
		"status":   "waiting",
		"playerID": playerID,
		"nickname": nickname,
	}
	if opponentID != 0 {
		response["status"] = "started"
		response["opponentID"] = opponentID
	}
	log.Printf("Quick game for player %d: %v", playerID, response)
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Println("Failed to encode response:", err)
	}
}

func handleOfflineGame(w http.ResponseWriter, r *http.Request) {
	nickname := utils.GenerateNickname()
	var playerID int
	err := db.DB.QueryRow("INSERT INTO users (nickname) VALUES ($1) ON CONFLICT (nickname) DO UPDATE SET nickname = EXCLUDED.nickname || '_' || (random() * 1000)::integer RETURNING id", nickname).Scan(&playerID)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Database error", "Failed to create user")
		log.Println("DB error:", err)
		return
	}

	gameID := gm.CreateOfflineGame(playerID)
	if err := json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "started",
		"playerID": playerID,
		"gameID":   gameID,
		"nickname": nickname,
	}); err != nil {
		log.Println("Failed to encode response:", err)
	}
}

func handleOfflineStats(w http.ResponseWriter, r *http.Request) {
	playerIDStr := r.URL.Query().Get("playerID")
	playerID, err := strconv.Atoi(playerIDStr)
	if err != nil {
		sendError(w, http.StatusBadRequest, "Invalid input", "Invalid playerID")
		log.Println("Invalid playerID:", err)
		return
	}

	var stats OfflineStats
	err = db.DB.QueryRow(
		"SELECT wins, losses, draws FROM offline_stats WHERE player_id = $1",
		playerID,
	).Scan(&stats.Wins, &stats.Losses, &stats.Draws)
	if err == sql.ErrNoRows {
		stats = OfflineStats{Wins: 0, Losses: 0, Draws: 0}
	} else if err != nil {
		sendError(w, http.StatusInternalServerError, "Database error", "Failed to fetch stats")
		log.Println("DB error:", err)
		return
	}

	if err := json.NewEncoder(w).Encode(stats); err != nil {
		log.Println("Failed to encode stats:", err)
	}
}