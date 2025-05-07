package game

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"tictactoe/db"
)

type Stats struct {
    Online     int `json:"online"`
    Games      int `json:"games"`
    TotalGames int `json:"totalGames"`
}

type GameManager struct {
    games           map[int]*Game
    waiting         []int
    mu              sync.Mutex
    clients         map[int]*Client
    rematchRequests map[int]map[int]bool
}

type Client struct {
    Conn     *websocket.Conn
    PlayerID int
}

func NewGameManager() *GameManager {
    return &GameManager{
        games:           make(map[int]*Game),
        waiting:         make([]int, 0),
        clients:         make(map[int]*Client),
        rematchRequests: make(map[int]map[int]bool),
    }
}

func (gm *GameManager) RegisterClient(playerID int, conn *websocket.Conn) {
    gm.mu.Lock()
    defer gm.mu.Unlock()
    if oldClient, ok := gm.clients[playerID]; ok {
        oldClient.Conn.Close()
        log.Printf("Closed old connection for player %d", playerID)
    }
    gm.clients[playerID] = &Client{Conn: conn, PlayerID: playerID}
    log.Printf("Registered client for player %d, total clients: %d", playerID, len(gm.clients))
}

func (gm *GameManager) GetStats() Stats {
    gm.mu.Lock()
    defer gm.mu.Unlock()
    totalGames := 0
    row := db.DB.QueryRow("SELECT COUNT(*) FROM games")
    _ = row.Scan(&totalGames)
    return Stats{
        Online:     len(gm.clients),
        Games:      len(gm.games),
        TotalGames: totalGames,
    }
}

func (gm *GameManager) GetGame(gameID int) (*Game, bool) {
    gm.mu.Lock()
    defer gm.mu.Unlock()
    game, ok := gm.games[gameID]
    return game, ok
}

func (gm *GameManager) CreateOfflineGame(playerID int) int {
    gm.mu.Lock()
    defer gm.mu.Unlock()

    gameID := len(gm.games) + 1
    game := &Game{
        ID:        gameID,
        Player1ID: playerID,
        Player2ID: 0,
        Status:    "active",
        Turn:      "X",
        Board:     [3][3]string{},
    }
    gm.games[gameID] = game

    boardJSON, _ := json.Marshal(game.Board)
    _, err := db.DB.Exec(
        "INSERT INTO games (id, player1_id, player2_id, status, turn, board) VALUES ($1, $2, $3, $4, $5, $6)",
        gameID, playerID, nil, game.Status, game.Turn, boardJSON,
    )
    if err != nil {
        log.Printf("Failed to save offline game %d: %v", gameID, err)
    }

    log.Printf("Created offline game %d for player %d", gameID, playerID)
    return gameID
}

func (gm *GameManager) FindOpponent(playerID int) int {
    gm.mu.Lock()
    defer gm.mu.Unlock()

    log.Printf("Finding opponent for player %d, waiting list: %v", playerID, gm.waiting)
    if len(gm.waiting) > 0 {
        opponentID := gm.waiting[0]
        gm.waiting = gm.waiting[1:]

        gameID := len(gm.games) + 1
        game := &Game{
            ID:        gameID,
            Player1ID: playerID,
            Player2ID: opponentID,
            Status:    "active",
            Turn:      "X",
            Board:     [3][3]string{},
        }
        gm.games[gameID] = game

        boardJSON, _ := json.Marshal(game.Board)
        _, err := db.DB.Exec(
            "INSERT INTO games (id, player1_id, player2_id, status, turn, board) VALUES ($1, $2, $3, $4, $5, $6)",
            gameID, playerID, opponentID, game.Status, game.Turn, boardJSON,
        )
        if err != nil {
            log.Printf("Failed to save game %d: %v", gameID, err)
        }

        go func() {
            time.Sleep(1000 * time.Millisecond)
            gm.NotifyPlayers(game)
        }()
        return opponentID
    }

    gm.waiting = append(gm.waiting, playerID)
    log.Printf("Player %d added to waiting list", playerID)
    return 0
}

func (gm *GameManager) CreateRematch(player1ID, player2ID int) int {
    gm.mu.Lock()
    defer gm.mu.Unlock()

    gameID := len(gm.games) + 1
    game := &Game{
        ID:        gameID,
        Player1ID: player1ID,
        Player2ID: player2ID,
        Status:    "active",
        Turn:      "X",
        Board:     [3][3]string{},
    }
    gm.games[gameID] = game

    boardJSON, _ := json.Marshal(game.Board)
    _, err := db.DB.Exec(
        "INSERT INTO games (id, player1_id, player2_id, status, turn, board) VALUES ($1, $2, $3, $4, $5, $6)",
        gameID, player1ID, player2ID, game.Status, game.Turn, boardJSON,
    )
    if err != nil {
        log.Printf("Failed to save rematch game %d: %v", gameID, err)
    }

    log.Printf("Created rematch game %d for players %d and %d", gameID, player1ID, player2ID)
    return gameID
}

func (gm *GameManager) GetPlayerNickname(playerID int) string {
    var nickname string
    err := db.DB.QueryRow("SELECT nickname FROM users WHERE id = $1", playerID).Scan(&nickname)
    if err != nil {
        log.Printf("Failed to get nickname for player %d: %v", playerID, err)
        return "Unknown"
    }
    return nickname
}

func (gm *GameManager) NotifyPlayers(game *Game) {
    gm.mu.Lock()
    defer gm.mu.Unlock()

    log.Printf("Notifying players %d and %d for game %d", game.Player1ID, game.Player2ID, game.ID)
    if client1, ok := gm.clients[game.Player1ID]; ok {
        state1 := map[string]interface{}{
            "type":      "game_start",
            "gameID":    game.ID,
            "board":     game.Board,
            "turn":      game.Turn,
            "player1":   game.Player1ID,
            "player2":   game.Player2ID,
            "role":      "X",
            "nickname":  gm.GetPlayerNickname(game.Player1ID),
            "opponentNickname": gm.GetPlayerNickname(game.Player2ID),
        }
        err := client1.Conn.WriteJSON(state1)
        if err != nil {
            log.Printf("Failed to notify player %d: %v", game.Player1ID, err)
        } else {
            log.Printf("Notified player %d with game state", game.Player1ID)
        }
    } else {
        log.Printf("Player %d not found in clients", game.Player1ID)
    }

    if game.Player2ID != 0 {
        if client2, ok := gm.clients[game.Player2ID]; ok {
            state2 := map[string]interface{}{
                "type":      "game_start",
                "gameID":    game.ID,
                "board":     game.Board,
                "turn":      game.Turn,
                "player1":   game.Player1ID,
                "player2":   game.Player2ID,
                "role":      "O",
                "nickname":  gm.GetPlayerNickname(game.Player2ID),
                "opponentNickname": gm.GetPlayerNickname(game.Player1ID),
            }
            err := client2.Conn.WriteJSON(state2)
            if err != nil {
                log.Printf("Failed to notify player %d: %v", game.Player2ID, err)
            } else {
                log.Printf("Notified player %d with game state", game.Player2ID)
            }
        } else {
            log.Printf("Player %d not found in clients", game.Player2ID)
        }
    }
}

func (gm *GameManager) HandleMove(gameID, playerID, x, y int) {
    gm.mu.Lock()
    defer gm.mu.Unlock()

    game, ok := gm.games[gameID]
    if !ok {
        log.Printf("Game %d not found for player %d", gameID, playerID)
        if client, ok := gm.clients[playerID]; ok {
            client.Conn.WriteJSON(map[string]interface{}{
                "type":    "warning",
                "message": "Game not found",
            })
        }
        return
    }

    if game.Player1ID != playerID && game.Player2ID != playerID {
        log.Printf("Player %d is not part of game %d", playerID, gameID)
        if client, ok := gm.clients[playerID]; ok {
            client.Conn.WriteJSON(map[string]interface{}{
                "type":    "warning",
                "message": "You are not part of this game",
            })
        }
        return
    }

    playerSymbol := "X"
    if game.Player2ID == playerID {
        playerSymbol = "O"
    }

    if game.Turn != playerSymbol {
        log.Printf("Not player %d's turn (%s), current turn: %s", playerID, playerSymbol, game.Turn)
        if client, ok := gm.clients[playerID]; ok {
            client.Conn.WriteJSON(map[string]interface{}{
                "type":    "invalid_move",
                "message": "Not your turn",
            })
        }
        return
    }

    if x < 0 || x >= 3 || y < 0 || y >= 3 {
        log.Printf("Invalid coordinates from player %d: [%d,%d]", playerID, x, y)
        if client, ok := gm.clients[playerID]; ok {
            client.Conn.WriteJSON(map[string]interface{}{
                "type":    "invalid_move",
                "message": "Invalid coordinates",
            })
        }
        return
    }

    if game.Board[x][y] != "" {
        log.Printf("Cell [%d,%d] already occupied by %s", x, y, game.Board[x][y])
        if client, ok := gm.clients[playerID]; ok {
            client.Conn.WriteJSON(map[string]interface{}{
                "type":    "invalid_move",
                "message": "Cell already occupied",
            })
        }
        return
    }

    game.Board[x][y] = playerSymbol;
    game.Turn = map[string]string{"X": "O", "O": "X"}[game.Turn];

    _, err := db.DB.Exec(
        "INSERT INTO moves (game_id, player_id, x, y, symbol) VALUES ($1, $2, $3, $4, $5)",
        gameID, playerID, x, y, playerSymbol,
    )
    if err != nil {
        log.Printf("Failed to save move for game %d: %v", gameID, err)
    }

    winner := game.Board.CheckWinner();
    if winner != "" {
        game.Status = "finished";
        if winner == "X" {
            game.WinnerID = game.Player1ID;
        } else if (winner == "O" && game.Player2ID != 0) {
            game.WinnerID = game.Player2ID;
        }
        log.Printf("Game %d finished. Winner: %s", gameID, winner);
    } else {
        isDraw := true;
        for i := 0; i < 3; i++ {
            for j := 0; j < 3; j++ {
                if game.Board[i][j] == "" {
                    isDraw = false;
                    break;
                }
            }
            if !isDraw {
                break;
            }
        }
        if isDraw {
            game.Status = "finished";
            log.Printf("Game %d finished in a draw", gameID);
        }
    }

    if game.Status == "finished" && game.Player2ID != 0 {
        if winner == "X" {
            updatePlayerStats(game.Player1ID, "wins");
            updatePlayerStats(game.Player2ID, "losses");
        } else if winner == "O" {
            updatePlayerStats(game.Player1ID, "losses");
            updatePlayerStats(game.Player2ID, "wins");
        } else {
            updatePlayerStats(game.Player1ID, "draws");
            updatePlayerStats(game.Player2ID, "draws");
        }
    }

    boardJSON, _ := json.Marshal(game.Board);
    _, err = db.DB.Exec(
        "UPDATE games SET status=$1, turn=$2, board=$3, winner_id=$4, updated_at=$5 WHERE id=$6",
        game.Status, game.Turn, boardJSON, game.WinnerID, time.Now(), gameID,
    )
    if err != nil {
        log.Printf("Failed to update game %d: %v", gameID, err)
    }

    state := map[string]interface{}{
        "type":   "move",
        "board":  game.Board,
        "turn":   game.Turn,
        "status": game.Status,
    }
    if game.Status == "finished" {
        state["winner"] = winner;
    }

    if client1, ok := gm.clients[game.Player1ID]; ok {
        if err := client1.Conn.WriteJSON(state); err != nil {
            log.Printf("Failed to send update to player %d: %v", game.Player1ID, err)
        }
    }

    if game.Player2ID != 0 {
        if client2, ok := gm.clients[game.Player2ID]; ok {
            if err := client2.Conn.WriteJSON(state); err != nil {
                log.Printf("Failed to send update to player %d: %v", game.Player2ID, err)
            }
        }
    }
}

func (gm *GameManager) HandleRematchRequest(gameID, playerID int) {
    gm.mu.Lock()
    defer gm.mu.Unlock()

    game, ok := gm.games[gameID]
    if !ok {
        log.Printf("Game %d not found for rematch request from player %d", gameID, playerID)
        if client, ok := gm.clients[playerID]; ok {
            client.Conn.WriteJSON(map[string]interface{}{
                "type":    "warning",
                "message": "Game not found",
            })
        }
        return
    }

    if game.Player1ID != playerID && game.Player2ID != playerID {
        log.Printf("Player %d is not part of game %d", playerID, gameID)
        if client, ok := gm.clients[playerID]; ok {
            client.Conn.WriteJSON(map[string]interface{}{
                "type":    "warning",
                "message": "You are not part of this game",
            })
        }
        return
    }

    if game.Status != "finished" {
        log.Printf("Game %d is not finished, cannot request rematch", gameID)
        if client, ok := gm.clients[playerID]; ok {
            client.Conn.WriteJSON(map[string]interface{}{
                "type":    "warning",
                "message": "Game is not finished",
            })
        }
        return
    }

    if _, ok := gm.rematchRequests[gameID]; !ok {
        gm.rematchRequests[gameID] = make(map[int]bool)
    }
    gm.rematchRequests[gameID][playerID] = true

    opponentID := game.Player1ID
    if game.Player1ID == playerID {
        opponentID = game.Player2ID
    }

    if client, ok := gm.clients[opponentID]; ok {
        client.Conn.WriteJSON(map[string]interface{}{
            "type": "rematch_request",
            "gameID": gameID,
        })
        log.Printf("Sent rematch request to player %d for game %d", opponentID, gameID)
    } else {
        log.Printf("Opponent %d not found for rematch request in game %d", opponentID, gameID)
    }
}

func (gm *GameManager) HandleRematchResponse(gameID, playerID int, accepted bool) {
    gm.mu.Lock()
    defer gm.mu.Unlock()

    game, ok := gm.games[gameID]
    if !ok {
        log.Printf("Game %d not found for rematch response from player %d", gameID, playerID)
        if client, ok := gm.clients[playerID]; ok {
            client.Conn.WriteJSON(map[string]interface{}{
                "type":    "warning",
                "message": "Game not found",
            })
        }
        return
    }

    if game.Player1ID != playerID && game.Player2ID != playerID {
        log.Printf("Player %d is not part of game %d", playerID, gameID)
        if client, ok := gm.clients[playerID]; ok {
            client.Conn.WriteJSON(map[string]interface{}{
                "type":    "warning",
                "message": "You are not part of this game",
            })
        }
        return
    }

    opponentID := game.Player1ID
    if game.Player1ID == playerID {
        opponentID = game.Player2ID
    }

    response := map[string]interface{}{
        "type": "rematch_response",
        "gameID": gameID,
        "accepted": accepted,
    }

    // Уведомляем обоих игроков о решении
    if client1, ok := gm.clients[playerID]; ok {
        client1.Conn.WriteJSON(response)
        log.Printf("Sent rematch response to player %d for game %d: %v", playerID, gameID, accepted)
    }
    if client2, ok := gm.clients[opponentID]; ok {
        client2.Conn.WriteJSON(response)
        log.Printf("Sent rematch response to opponent %d for game %d: %v", opponentID, gameID, accepted)
    }

    if accepted {
        if requests, ok := gm.rematchRequests[gameID]; ok && requests[opponentID] {
            // Оба игрока согласились, инициируем start_rematch
            delete(gm.games, gameID)
            delete(gm.rematchRequests, gameID)

            // Отправляем start_rematch обоим игрокам
            startRematchMsg := map[string]interface{}{
                "type": "start_rematch",
                "gameID": gameID,
                "playerID": playerID,
                "opponentID": opponentID,
            }
            if client1, ok := gm.clients[playerID]; ok {
                client1.Conn.WriteJSON(startRematchMsg)
            }
            if client2, ok := gm.clients[opponentID]; ok {
                client2.Conn.WriteJSON(startRematchMsg)
            }
        }
    } else {
        delete(gm.rematchRequests, gameID)
    }
}

func (gm *GameManager) StartRematch(gameID, playerID, opponentID int) {
    gm.mu.Lock()
    defer gm.mu.Unlock()

    game, ok := gm.games[gameID]
    if !ok {
        log.Printf("Game %d not found for rematch start from player %d", gameID, playerID)
        if client, ok := gm.clients[playerID]; ok {
            client.Conn.WriteJSON(map[string]interface{}{
                "type":    "warning",
                "message": "Game not found",
            })
        }
        return
    }

    if (game.Player1ID != playerID || game.Player2ID != opponentID) && (game.Player2ID != playerID || game.Player1ID != opponentID) {
        log.Printf("Invalid player-opponent pair for rematch in game %d", gameID)
        if client, ok := gm.clients[playerID]; ok {
            client.Conn.WriteJSON(map[string]interface{}{
                "type":    "warning",
                "message": "Invalid rematch request",
            })
        }
        return
    }

    if requests, ok := gm.rematchRequests[gameID]; !ok || !requests[playerID] || !requests[opponentID] {
        log.Printf("Rematch not confirmed by both players for game %d", gameID)
        if client, ok := gm.clients[playerID]; ok {
            client.Conn.WriteJSON(map[string]interface{}{
                "type":    "warning",
                "message": "Rematch not confirmed by both players",
            })
        }
        return
    }

    delete(gm.games, gameID)
    delete(gm.rematchRequests, gameID)
    gm.CreateRematch(game.Player1ID, game.Player2ID)
}

func updatePlayerStats(playerID int, result string) {
    var query string;
    switch result {
    case "wins":
        query = "UPDATE offline_stats SET wins = wins + 1, updated_at = $2 WHERE player_id = $1"
    case "losses":
        query = "UPDATE offline_stats SET losses = losses + 1, updated_at = $2 WHERE player_id = $1"
    case "draws":
        query = "UPDATE offline_stats SET draws = draws + 1, updated_at = $2 WHERE player_id = $1"
    }

    _, err := db.DB.Exec(query, playerID, time.Now())
    if err != nil {
        log.Printf("Failed to update stats for player %d: %v", playerID, err)
        _, err = db.DB.Exec(
            "INSERT INTO offline_stats (player_id, wins, losses, draws) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
            playerID, 0, 0, 0,
        )
        if err != nil {
            log.Printf("Failed to create stats for player %d: %v", playerID, err)
        }
        _, err = db.DB.Exec(query, playerID, time.Now())
        if err != nil {
            log.Printf("Failed to update stats after creation for player %d: %v", playerID, err)
        }
    }
}

func (gm *GameManager) HandleDisconnect(playerID int) {
    gm.mu.Lock()
    defer gm.mu.Unlock()

    delete(gm.clients, playerID)
    for gameID, game := range gm.games {
        if game.Player1ID == playerID || game.Player2ID == playerID {
            game.Status = "finished"
            opponentID := game.Player1ID
            if game.Player1ID == playerID {
                opponentID = game.Player2ID
            }
            if client, ok := gm.clients[opponentID]; ok {
                client.Conn.WriteJSON(map[string]interface{}{
                    "type":    "opponent_left",
                    "message": "Opponent has disconnected",
                })
            }
            delete(gm.games, gameID)
            delete(gm.rematchRequests, gameID)

            _, err := db.DB.Exec(
                "UPDATE games SET status=$1, updated_at=$2 WHERE id=$3",
                game.Status, time.Now(), gameID,
            )
            if err != nil {
                log.Printf("Failed to update game %d on disconnect: %v", gameID, err)
            }
            break
        }
    }
}