package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/websocket"

	"tictactoe/db"
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
	if gm == nil {
		log.Println("Game manager not initialized")
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade failed:", err)
		return
	}

	playerIDStr := r.URL.Query().Get("playerID")
	playerID, err := strconv.Atoi(playerIDStr)
	if err != nil {
		log.Println("Invalid playerID:", err)
		sendError(conn, "Invalid playerID")
		return
	}

	gm.RegisterClient(playerID, conn)
	if err := conn.WriteJSON(map[string]string{"type": "connected", "message": "Connected to Tic-Tac-Toe!"}); err != nil {
		log.Println("Failed to send connection message:", err)
		return
	}

	defer func() {
		gm.HandleDisconnect(playerID)
		conn.Close()
	}()

	for {
		var msg map[string]interface{}
		err := conn.ReadJSON(&msg)
		if err != nil {
			log.Println("WebSocket read error for player", playerID, ":", err)
			break
		}
		log.Printf("Received message from player %d: %v", playerID, msg)

		msgType, ok := msg["type"].(string)
		if !ok {
			sendError(conn, "Invalid message type")
			continue
		}

		switch msgType {
		case "move":
			gameID, ok1 := msg["gameID"].(float64)
			x, ok2 := msg["x"].(float64)
			y, ok3 := msg["y"].(float64)
			if !ok1 || !ok2 || !ok3 {
				sendError(conn, "Invalid move coordinates or game ID")
				continue
			}
			gm.HandleMove(int(gameID), playerID, int(x), int(y))

		case "ai_move":
			gameID, ok := msg["gameID"].(float64)
			if !ok {
				sendError(conn, "Invalid game ID")
				continue
			}
			game, ok := gm.GetGame(int(gameID))
			if !ok || game.Player2ID != 0 {
				sendError(conn, "Invalid game or not offline mode")
				continue
			}
			x, y := game.MakeAIMove()
			if x == -1 && y == -1 {
				sendError(conn, "No available moves")
				continue
			}

			_, err := db.DB.Exec(
				"INSERT INTO moves (game_id, player_id, x, y, symbol) VALUES ($1, $2, $3, $4, $5)",
				int(gameID), nil, x, y, "O",
			)
			if err != nil {
				log.Printf("Failed to save AI move for game %d: %v", gameID, err)
			}

			winner := game.Board.CheckWinner()
			if winner != "" {
				game.Status = "finished"
				if winner == "X" {
					game.WinnerID = game.Player1ID
				}
				updateOfflineStats(playerID, winner, game)
			} else {
				isDraw := true
				for i := 0; i < 3; i++ {
					for j := 0; j < 3; j++ {
						if game.Board[i][j] == "" {
							isDraw = false
							break
						}
					}
					if !isDraw {
						break
					}
				}
				if isDraw {
					game.Status = "finished"
					updateOfflineStats(playerID, "", game)
				}
			}

			boardJSON, _ := json.Marshal(game.Board)
			var updateErr error
			if game.WinnerID != 0 {
				_, updateErr = db.DB.Exec(
					"UPDATE games SET status=$1, turn=$2, board=$3, winner_id=$4, updated_at=$5 WHERE id=$6",
					game.Status, game.Turn, boardJSON, game.WinnerID, time.Now(), int(gameID),
				)
			} else {
				_, updateErr = db.DB.Exec(
					"UPDATE games SET status=$1, turn=$2, board=$3, updated_at=$4 WHERE id=$5",
					game.Status, game.Turn, boardJSON, time.Now(), int(gameID),
				)
			}
			if updateErr != nil {
				log.Printf("Failed to update game %d: %v", gameID, updateErr)
			}

			state := map[string]interface{}{
				"type":   "ai_move",
				"x":      x,
				"y":      y,
				"board":  game.Board,
				"turn":   game.Turn,
				"status": game.Status,
			}
			if err := conn.WriteJSON(state); err != nil {
				log.Println("Failed to send AI move:", err)
			}

		case "rematch_request":
			gameID, ok := msg["gameID"].(float64)
			if !ok {
				sendError(conn, "Invalid game ID")
				continue
			}
			gm.HandleRematchRequest(int(gameID), playerID)

		case "rematch_response":
			gameID, ok1 := msg["gameID"].(float64)
			accepted, ok2 := msg["accepted"].(bool)
			if !ok1 || !ok2 {
				sendError(conn, "Invalid game ID or response")
				continue
			}
			gm.HandleRematchResponse(int(gameID), playerID, accepted)

		case "start_rematch":
			opponentIDFloat, ok := msg["opponentID"].(float64)
			if !ok {
				sendError(conn, "Invalid opponent ID")
				continue
			}
			opponentID := int(opponentIDFloat)
			newGameID := gm.CreateRematch(playerID, opponentID)
			game, ok := gm.GetGame(newGameID)
			if !ok {
				sendError(conn, "Failed to create rematch game")
				continue
			}
			gm.NotifyPlayers(game)

		default:
			sendError(conn, "Unknown message type")
		}
	}
}

func updateOfflineStats(playerID int, winner string, game *game.Game) {
	var query string
	if winner == "X" {
		query = "UPDATE offline_stats SET wins = wins + 1, updated_at = $2 WHERE player_id = $1"
		game.WinnerID = playerID
	} else if winner == "O" {
		query = "UPDATE offline_stats SET losses = losses + 1, updated_at = $2 WHERE player_id = $1"
	} else {
		query = "UPDATE offline_stats SET draws = draws + 1, updated_at = $2 WHERE player_id = $1"
	}

	_, err := db.DB.Exec(query, playerID, time.Now())
	if err != nil {
		log.Printf("Failed to update offline stats for player %d: %v", playerID, err)
		_, err = db.DB.Exec(
			"INSERT INTO offline_stats (player_id, wins, losses, draws) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
			playerID, 0, 0, 0,
		)
		if err != nil {
			log.Printf("Failed to create offline stats for player %d: %v", playerID, err)
		}
		_, err = db.DB.Exec(query, playerID, time.Now())
		if err != nil {
			log.Printf("Failed to update offline stats after creation for player %d: %v", playerID, err)
		}
	}
}

func sendError(conn *websocket.Conn, message string) {
	if err := conn.WriteJSON(map[string]string{"type": "warning", "message": message}); err != nil {
		log.Println("Failed to send error message:", err)
	}
}