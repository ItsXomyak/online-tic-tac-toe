let ws = null
let playerID = null
let gameID = null

function resetGameState() {
	if (ws && ws.readyState === WebSocket.OPEN) {
		console.log('Closing WebSocket for player', playerID)
		ws.close()
	}
	ws = null
	playerID = null
	gameID = null
	const gameBoard = document.getElementById('game-board')
	if (gameBoard) gameBoard.classList.add('hidden')
	const stats = document.getElementById('stats')
	if (stats) stats.textContent = 'Online: 0 | Games: 0'
	console.log('Game state reset')
}

function initWebSocket(playerID) {
	console.log('Initializing WebSocket for player', playerID)
	ws = new WebSocket(`ws://localhost:8080/ws?playerID=${playerID}`)
	ws.onopen = () => console.log('WebSocket opened for player', playerID)
	ws.onmessage = event => {
		let data
		try {
			data = JSON.parse(event.data)
		} catch (err) {
			console.error(
				`Failed to parse WebSocket message for player ${playerID}:`,
				err
			)
			return
		}
		console.log(`WebSocket message for player ${playerID}:`, data)

		if (data.type === 'connected') {
			console.log('Connected to WebSocket for player', playerID)
		} else if (data.type === 'game_start') {
			gameID = data.gameID
			console.log(
				`Game started for player ${playerID}, rendering board:`,
				data.board
			)
			renderBoard(data.board)
			updateTurn(data.turn)
		}
	}
	ws.onerror = err =>
		console.error(`WebSocket error for player ${playerID}:`, err)
	ws.onclose = () => {
		console.log(`WebSocket closed for player ${playerID}`)
		ws = null
	}
}

function renderBoard(board) {
	console.log('Rendering board:', board)
	const gameBoard = document.getElementById('game-board')
	if (!gameBoard) {
		console.error('Game board element not found')
		return
	}
	console.log('Game board element:', gameBoard)
	gameBoard.classList.remove('hidden')
	console.log('Game board classes after remove hidden:', gameBoard.classList)
	gameBoard.innerHTML = ''

	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			const cell = document.createElement('div')
			cell.classList.add('cell')
			cell.dataset.x = i
			cell.dataset.y = j
			cell.textContent = board[i][j] || ''
			cell.addEventListener('click', () => makeMove(i, j))
			gameBoard.appendChild(cell)
			console.log(
				`Added cell [${i}][${j}] for player ${playerID} with content:`,
				cell.textContent
			)
		}
	}
}

function updateTurn(turn) {
	const stats = document.getElementById('stats')
	if (stats) stats.textContent = `Turn: ${turn} (Player ${playerID})`
}

function makeMove(x, y) {
	if (ws && gameID && ws.readyState === WebSocket.OPEN) {
		console.log(`Sending move for player ${playerID}:`, { x, y })
		ws.send(
			JSON.stringify({
				type: 'move',
				gameID,
				playerID,
				x,
				y,
			})
		)
	} else {
		console.error(
			`Cannot make move for player ${playerID}: WebSocket not ready or gameID missing`
		)
	}
}

async function fetchStats() {
	try {
		const res = await fetch('http://localhost:8080/stats', {
			signal: AbortSignal.timeout(5000),
		})
		if (!res.ok) throw new Error(`Stats fetch failed: ${res.status}`)
		const stats = await res.json()
		if (!gameID) {
			const statsEl = document.getElementById('stats')
			if (statsEl)
				statsEl.textContent = `Online: ${stats.online} | Games: ${stats.games}`
		}
	} catch (err) {
		console.error('Stats fetch error:', err)
	}
	setTimeout(fetchStats, 1000)
}
fetchStats()

document.getElementById('quick-game').addEventListener('click', async () => {
	console.log('Quick Game clicked')
	const quickGameButton = document.getElementById('quick-game')
	quickGameButton.disabled = true
	try {
		resetGameState()
		console.log('Sending /quick-game request')
		const res = await fetch('http://localhost:8080/quick-game', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			signal: AbortSignal.timeout(5000), // Таймаут 5 секунд
		})
		console.log('Received /quick-game response:', res)
		if (!res.ok) {
			throw new Error(`HTTP error: ${res.status} ${res.statusText}`)
		}
		const data = await res.json()
		console.log('Quick game response data:', data)
		playerID = data.playerID
		if (data.status === 'started') {
			console.log(
				`Game started for player ${playerID} with opponent:`,
				data.opponentID
			)
		} else {
			console.log(`Waiting for opponent for player ${playerID}`)
		}
		setTimeout(() => initWebSocket(playerID), 1000)
	} catch (err) {
		console.error('Quick game error:', err)
	} finally {
		quickGameButton.disabled = false
	}
})

document.getElementById('offline-game').addEventListener('click', () => {
	console.log('Offline game clicked')
})
