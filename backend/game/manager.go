package game

import "sync"

type GameManager struct {
    games      map[int]*Game
    waiting    []int // Очередь ожидающих игроков
    mu         sync.Mutex
}

func NewGameManager() *GameManager {
    return &GameManager{
        games:   make(map[int]*Game),
        waiting: make([]int, 0),
    }
}

func (gm *GameManager) FindOpponent(playerID int) int {
    gm.mu.Lock()
    defer gm.mu.Unlock()

    // Если есть ожидающий игрок, создаем игру
    if len(gm.waiting) > 0 {
        opponentID := gm.waiting[0]
        gm.waiting = gm.waiting[1:]

        // Создаем новую игру
        gameID := len(gm.games) + 1
        game := &Game{
            ID:        gameID,
            Player1ID: playerID,
            Player2ID: opponentID,
            Status:    "active",
            Turn:      "X",
        }
        gm.games[gameID] = game
        return opponentID
    }

    // Если нет ожидающих, добавляем игрока в очередь
    gm.waiting = append(gm.waiting, playerID)
    return 0
}