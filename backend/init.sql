CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    nickname VARCHAR(50) UNIQUE NOT NULL
);
CREATE TABLE games (
    id SERIAL PRIMARY KEY,
    player1_id INT REFERENCES users(id),
    player2_id INT REFERENCES users(id),
    status VARCHAR(20),
    board TEXT,
    winner_id INT REFERENCES users(id)
);