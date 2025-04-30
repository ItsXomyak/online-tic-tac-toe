package game

type Board [3][3]string

type Game struct {
	ID        int
	Player1ID int
	Player2ID int
	Board     Board
	Status    string // "waiting", "active", "finished"
	Turn      string // "X" или "O"
	WinnerID  int
}

func (b *Board) MakeMove(x, y int, player string) bool {
	if x < 0 || x > 2 || y < 0 || y > 2 || b[x][y] != "" {
		return false
	}
	b[x][y] = player
	return true
}

func (b *Board) CheckWinner() string {
	// rows check
	for i := 0; i < 3; i++ {
		if b[i][0] == b[i][1] && b[i][1] == b[i][2] && b[i][0] != "" {
			return b[i][0]
		}
	}

	// columns check
	for i := 0; i < 3; i++ {
		if b[0][i] == b[1][i] && b[1][i] == b[2][i] && b[0][i] != "" {
			return b[0][i]
		}
	}

	// diagonals check
	if b[0][0] == b[1][1] && b[1][1] == b[2][2] && b[0][0] != "" {
		return b[0][0]
	}
	if b[0][2] == b[1][1] && b[1][1] == b[2][0] && b[0][2] != "" {
		return b[0][2]
	}

	return ""

}