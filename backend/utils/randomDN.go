package utils

import (
	"math/rand"
	"strconv"
	"time"
)

var adjectives = []string{
	"Crazy", "Happy", "Silent", "Brave", "Wild", "Lazy", "Fast", "Sneaky",
}

var nouns = []string{
	"Tiger", "Panda", "Wizard", "Ninja", "Pirate", "Robot", "Dragon", "Ghost",
}

func GenerateNickname() string {
	rand.Seed(time.Now().UnixNano())

	adjective := adjectives[rand.Intn(len(adjectives))]
	noun := nouns[rand.Intn(len(nouns))]
	number := strconv.Itoa(rand.Intn(1000)) 

	return adjective + noun + number
}