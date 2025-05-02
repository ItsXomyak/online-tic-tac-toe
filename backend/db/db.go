package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func Init() error {
	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"),
	)

	var err error
	DB, err = sql.Open("postgres", connStr)
	if err != nil {
		return fmt.Errorf("error opening database: %v", err)
	}

	if err = DB.Ping(); err != nil {
		return fmt.Errorf("error connecting to the database: %v", err)
	}

	createTables()
	return nil
}

func createTables() {
	_, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			nickname VARCHAR(50) UNIQUE NOT NULL
		)
	`)
	if err != nil {
		log.Fatal("Error creating users table:", err)
	}

	_, err = DB.Exec(`
		CREATE TABLE IF NOT EXISTS games (
			id SERIAL PRIMARY KEY,
			player1_id INT REFERENCES users(id),
			player2_id INT REFERENCES users(id),
			status VARCHAR(20) NOT NULL,
			turn VARCHAR(1) NOT NULL,
			board JSONB NOT NULL,
			winner_id INT REFERENCES users(id),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		log.Fatal("Error creating games table:", err)
	}

	_, err = DB.Exec(`
		CREATE TABLE IF NOT EXISTS moves (
			id SERIAL PRIMARY KEY,
			game_id INT REFERENCES games(id),
			player_id INT REFERENCES users(id),
			x INT NOT NULL,
			y INT NOT NULL,
			symbol VARCHAR(1) NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		log.Fatal("Error creating moves table:", err)
	}

	_, err = DB.Exec(`
		CREATE TABLE IF NOT EXISTS offline_stats (
			id SERIAL PRIMARY KEY,
			player_id INT REFERENCES users(id),
			wins INT DEFAULT 0,
			losses INT DEFAULT 0,
			draws INT DEFAULT 0,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		log.Fatal("Error creating offline_stats table:", err)
	}
}