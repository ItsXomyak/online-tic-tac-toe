package utils

type GameState struct {
	Board  [3][3]string `json:"board"`
	Turn   string       `json:"turn"`
	Status string       `json:"status"`
}