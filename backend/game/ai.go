package game

import (
	"math/rand"
	"time"
)

// MakeAIMove делает ход ИИ и возвращает координаты хода
func (g *Game) MakeAIMove() (int, int) {
	// Проверяем, не закончилась ли уже игра
	if checkWinner(g.Board) != "" || isDraw(g.Board) {
		return -1, -1
	}

	// 1. Проверяем, может ли ИИ выиграть следующим ходом
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			if g.Board[i][j] == "" {
				g.Board[i][j] = "O"
				if checkWinner(g.Board) == "O" {
					g.Turn = "X"
					return i, j
				}
				g.Board[i][j] = ""
			}
		}
	}

	// 2. Проверяем, может ли игрок выиграть следующим ходом, и блокируем его
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			if g.Board[i][j] == "" {
				g.Board[i][j] = "X"
				if checkWinner(g.Board) == "X" {
					g.Board[i][j] = "O" // Блокируем выигрышный ход
					g.Turn = "X"
					return i, j
				}
				g.Board[i][j] = ""
			}
		}
	}

	// 3. Если центр свободен, занимаем его
	if g.Board[1][1] == "" {
		g.Board[1][1] = "O"
		g.Turn = "X"
		return 1, 1
	}

	// 4. Если углы свободны, занимаем случайный угол
	corners := [][2]int{{0, 0}, {0, 2}, {2, 0}, {2, 2}}
	availableCorners := make([][2]int, 0)
	for _, corner := range corners {
		if g.Board[corner[0]][corner[1]] == "" {
			availableCorners = append(availableCorners, corner)
		}
	}
	if len(availableCorners) > 0 {
		rand.Seed(time.Now().UnixNano())
		corner := availableCorners[rand.Intn(len(availableCorners))]
		g.Board[corner[0]][corner[1]] = "O"
		g.Turn = "X"
		return corner[0], corner[1]
	}

	// 5. Занимаем любую свободную клетку
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			if g.Board[i][j] == "" {
				g.Board[i][j] = "O"
				g.Turn = "X"
				return i, j
			}
		}
	}

	return -1, -1
}

// checkWinner проверяет, есть ли победитель
func checkWinner(board Board) string {
	// Проверка строк
	for i := 0; i < 3; i++ {
		if board[i][0] != "" && board[i][0] == board[i][1] && board[i][1] == board[i][2] {
			return board[i][0]
		}
	}

	// Проверка столбцов
	for i := 0; i < 3; i++ {
		if board[0][i] != "" && board[0][i] == board[1][i] && board[1][i] == board[2][i] {
			return board[0][i]
		}
	}

	// Проверка диагоналей
	if board[0][0] != "" && board[0][0] == board[1][1] && board[1][1] == board[2][2] {
		return board[0][0]
	}
	if board[0][2] != "" && board[0][2] == board[1][1] && board[1][1] == board[2][0] {
		return board[0][2]
	}

	return ""
}

// isDraw проверяет, есть ли ничья
func isDraw(board Board) bool {
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			if board[i][j] == "" {
				return false
			}
		}
	}
	return true
}