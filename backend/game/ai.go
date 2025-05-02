package game

import (
	"math/rand"
	"time"
)

func (g *Game) MakeAIMove() (int, int) {
    rand.Seed(time.Now().UnixNano())
    var moves [][2]int
    for i := 0; i < 3; i++ {
        for j := 0; j < 3; j++ {
            if g.Board[i][j] == "" {
                moves = append(moves, [2]int{i, j})
            }
        }
    }
    if len(moves) == 0 {
        return -1, -1
    }
    move := moves[rand.Intn(len(moves))]
    g.Board[move[0]][move[1]] = "O"
    g.Turn = "X"
    return move[0], move[1]
}