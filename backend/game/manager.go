package game

import (
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type GameManager struct {
    games      map[int]*Game
    waiting    []int
    mu         sync.Mutex
    clients    map[int]*Client
}

type Client struct {
    Conn     *websocket.Conn
    PlayerID int
}

func NewGameManager() *GameManager {
    return &GameManager{
        games:   make(map[int]*Game),
        waiting: make([]int, 0),
        clients: make(map[int]*Client),
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
        log.Printf("Created game %d with players %d vs %d", gameID, playerID, opponentID)

        // Даем время для регистрации WebSocket
        go func() {
            time.Sleep(1000 * time.Millisecond)
            gm.mu.Lock()
            log.Printf("Clients before notify: %v", gm.clients)
            gm.mu.Unlock()
            gm.notifyPlayers(game)
        }()
        return opponentID
    }

    gm.waiting = append(gm.waiting, playerID)
    log.Printf("Player %d added to waiting list", playerID)
    return 0
}

func (gm *GameManager) notifyPlayers(game *Game) {
    state := map[string]interface{}{
        "type":    "game_start",
        "gameID":  game.ID,
        "board":   game.Board,
        "turn":    game.Turn,
        "player1": game.Player1ID,
        "player2": game.Player2ID,
    }

    gm.mu.Lock()
    defer gm.mu.Unlock()

    log.Printf("Notifying players %d and %d for game %d", game.Player1ID, game.Player2ID, game.ID)
    if client1, ok := gm.clients[game.Player1ID]; ok {
        err := client1.Conn.WriteJSON(state)
        if err != nil {
            log.Printf("Failed to notify player %d: %v", game.Player1ID, err)
        } else {
            log.Printf("Notified player %d with game state", game.Player1ID)
        }
    } else {
        log.Printf("Player %d not found in clients", game.Player1ID)
    }

    if client2, ok := gm.clients[game.Player2ID]; ok {
        err := client2.Conn.WriteJSON(state)
        if err != nil {
            log.Printf("Failed to notify player %d: %v", game.Player2ID, err)
        } else {
            log.Printf("Notified player %d with game state", game.Player2ID)
        }
    } else {
        log.Printf("Player %d not found in clients", game.Player2ID)
    }
}

func (gm *GameManager) HandleMove(gameID, playerID, x, y int) {
    gm.mu.Lock()
    defer gm.mu.Unlock()

    game, ok := gm.games[gameID]
    if !ok {
        log.Printf("Game %d not found", gameID)
        return
    }

    playerSymbol := "X"
    if game.Player2ID == playerID {
        playerSymbol = "O"
    }
    if game.Turn != playerSymbol {
        log.Printf("Not player %d's turn (%s), current turn: %s", playerID, playerSymbol, game.Turn)
        return
    }

    if x >= 0 && x < 3 && y >= 0 && y < 3 && game.Board[x][y] == "" {
        game.Board[x][y] = playerSymbol
        game.Turn = map[string]string{"X": "O", "O": "X"}[game.Turn]
        winner := checkWinner(game.Board)
        if winner != "" {
            game.Status = "finished"
            game.WinnerID = playerID
            log.Printf("Game %d finished, winner: %d", gameID, playerID)
        }
        gm.notifyPlayers(game)
    } else {
        log.Printf("Invalid move by player %d at [%d,%d]", playerID, x, y)
    }
}

func checkWinner(board [3][3]string) string {
    for i := 0; i < 3; i++ {
        if board[i][0] != "" && board[i][0] == board[i][1] && board[i][1] == board[i][2] {
            return board[i][0]
        }
        if board[0][i] != "" && board[0][i] == board[1][i] && board[1][i] == board[2][i] {
            return board[0][i]
        }
    }
    if board[0][0] != "" && board[0][0] == board[1][1] && board[1][1] == board[2][2] {
        return board[0][0]
    }
    if board[0][2] != "" && board[0][2] == board[1][1] && board[1][1] == board[2][0] {
        return board[0][2]
    }
    return ""
}