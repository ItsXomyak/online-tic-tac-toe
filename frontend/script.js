const backendUrl = 'http://localhost:8080'
const wsUrl = 'ws://localhost:8080/ws'
let ws = null
let playerID = null
let gameID = null
let currentTurn = 'X'
let mySymbol = 'X'
let board = Array(9).fill('')
let gameStatus = 'waiting'
let isOffline = false
let isMyTurn = false
let roleSelected = false
let roleSelectionTimeout = null
let opponentID = null
let rematchRequested = false
let rematchAccepted = false

const modeSelection = document.getElementById('mode-selection')
const gameContainer = document.getElementById('game-container')
const status = document.getElementById('status')
const boardElement = document.getElementById('board')
const playAgainBtn = document.getElementById('play-again')
const backToMenuBtn = document.getElementById('back-to-menu')
const winsElement = document.getElementById('wins')
const lossesElement = document.getElementById('losses')
const drawsElement = document.getElementById('draws')
const onlineCount = document.getElementById('online-count')
const activeGames = document.getElementById('active-games')
const totalGames = document.getElementById('total-games')
const rematchModal = document.getElementById('rematch-modal')
const acceptRematchBtn = document.getElementById('accept-rematch')
const declineRematchBtn = document.getElementById('decline-rematch')

document.getElementById('online-btn').addEventListener('click', startOnlineGame)
document
	.getElementById('offline-btn')
	.addEventListener('click', startOfflineGame)
playAgainBtn.addEventListener('click', requestRematch)
backToMenuBtn.addEventListener('click', showMainMenu)
acceptRematchBtn.addEventListener('click', acceptRematch)
declineRematchBtn.addEventListener('click', declineRematch)

async function startOnlineGame() {
	try {
		const response = await fetch(`${backendUrl}/quick-game`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
		})

		if (!response.ok) {
			throw new Error('Failed to start quick game')
		}

		const data = await response.json()
		playerID = data.playerID
		gameID = data.opponentID || null
		opponentID = data.opponentID || null

		status.textContent =
			data.status === 'waiting' ? 'Waiting for opponent...' : 'Game started!'
		status.classList.add('searching')

		if (data.status === 'started') {
			mySymbol = data.isFirstPlayer ? 'X' : 'O'
			isMyTurn = mySymbol === 'X'
			initGame()
		}

		initWebSocket()
		modeSelection.classList.add('hidden')
		gameContainer.classList.remove('hidden')
		startStatsPolling()
	} catch (error) {
		console.error('Error starting online game:', error)
		status.textContent = 'Failed to start game. Please try again.'
	}
}

async function startOfflineGame() {
	try {
		const response = await fetch(`${backendUrl}/offline-game`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
		})

		if (!response.ok) {
			throw new Error('Failed to start offline game')
		}

		const data = await response.json()
		playerID = data.playerID
		gameID = data.gameID
		isOffline = true
		mySymbol = 'X'
		isMyTurn = true

		initGame()
		initWebSocket()
		modeSelection.classList.add('hidden')
		gameContainer.classList.remove('hidden')
		startStatsPolling()
	} catch (error) {
		console.error('Error starting offline game:', error)
		status.textContent = 'Failed to start game. Please try again.'
		backToMenuBtn.classList.remove('hidden')
	}
}

function initGame() {
	board = [
		['', '', ''],
		['', '', ''],
		['', '', ''],
	]
	currentTurn = 'X'
	gameStatus = 'active'
	isMyTurn = mySymbol === currentTurn
	status.classList.remove('searching')
	rematchRequested = false
	rematchAccepted = false

	boardElement.innerHTML = ''
	for (let i = 0; i < 9; i++) {
		const cell = document.createElement('div')
		cell.className = 'cell'
		cell.dataset.index = i
		cell.addEventListener('click', () => makeMove(i))
		boardElement.appendChild(cell)
	}

	updateBoard()
	playAgainBtn.classList.add('hidden')
	backToMenuBtn.classList.add('hidden')
	rematchModal.classList.add('hidden')
	updateGameStatus()
}

function initWebSocket() {
	if (ws) {
		ws.close()
	}

	ws = new WebSocket(`${wsUrl}?playerID=${playerID}`)

	ws.onopen = () => {
		if (gameID) {
			ws.send(
				JSON.stringify({
					type: 'register',
					playerID: playerID,
					gameID: gameID,
				})
			)
		}
	}

	ws.onmessage = event => {
		try {
			const msg = JSON.parse(event.data)
			handleWebSocketMessage(msg)
		} catch (error) {
			console.error('Error parsing WebSocket message:', error)
			status.textContent = 'Error processing game update'
		}
	}

	ws.onclose = () => {
		if (gameStatus !== 'finished') {
			status.textContent = 'Connection lost. Please try again.'
			backToMenuBtn.classList.remove('hidden')
		}
		ws = null
	}

	ws.onerror = error => {
		console.error('WebSocket error:', error)
		status.textContent = 'Connection error. Please try again.'
		backToMenuBtn.classList.remove('hidden')
	}
}

function handleWebSocketMessage(msg) {
	if (msg.type === 'error') {
		console.error('Server error:', msg.message)
		status.textContent = `Error: ${msg.message}`
		return
	}

	switch (msg.type) {
		case 'game_start':
			gameID = msg.gameID
			board = msg.board
			mySymbol = msg.role || mySymbol
			currentTurn = 'X'
			opponentID = msg.player1 === playerID ? msg.player2 : msg.player1
			isMyTurn = mySymbol === currentTurn
			gameStatus = 'active'
			initGame()
			break

		case 'move':
			board = msg.board
			currentTurn = msg.turn
			gameStatus = msg.status
			isMyTurn = mySymbol === currentTurn
			updateBoard()
			updateGameStatus()
			if (gameStatus === 'finished') {
				handleGameEnd()
			}
			break

		case 'ai_move':
			board = msg.board
			currentTurn = msg.turn
			gameStatus = msg.status
			isMyTurn = mySymbol === currentTurn
			updateBoard()
			updateGameStatus()
			if (gameStatus === 'finished') {
				handleGameEnd()
			}
			break

		case 'opponent_left':
			status.textContent = 'Opponent disconnected'
			gameStatus = 'finished'
			handleGameEnd()
			break

		case 'invalid_move':
			status.textContent = 'Invalid move. Please try again.'
			isMyTurn = true
			updateBoard()
			break

		case 'rematch_request':
			if (rematchRequested) return
			rematchModal.classList.remove('hidden')
			break

		case 'rematch_response':
			if (msg.accepted) {
				rematchAccepted = true
				startRematch()
			} else {
				status.textContent = 'match cancelled'
				playAgainBtn.classList.add('hidden')
				backToMenuBtn.classList.remove('hidden')
				rematchRequested = false
				rematchAccepted = false
			}
			break

		default:
			console.warn('Unknown message type:', msg.type)
	}
}

function handleGameEnd() {
	disableBoard()
	const result = getGameResult()
	status.textContent = result
	if (!isOffline) {
		playAgainBtn.textContent = 'Request Rematch'
		playAgainBtn.classList.remove('hidden')
	} else {
		playAgainBtn.textContent = 'Play Again'
		playAgainBtn.classList.remove('hidden')
	}
	backToMenuBtn.classList.remove('hidden')
	updateStats()
}

function requestRematch() {
	if (isOffline) {
		resetGame()
		return
	}

	if (rematchRequested) return

	rematchRequested = true
	status.textContent = 'Waiting for opponent to accept rematch...'
	playAgainBtn.classList.add('hidden')
	backToMenuBtn.classList.remove('hidden')

	ws.send(
		JSON.stringify({
			type: 'rematch_request',
			gameID: gameID,
			playerID: playerID,
		})
	)
}

function acceptRematch() {
	rematchModal.classList.add('hidden')
	rematchAccepted = true

	ws.send(
		JSON.stringify({
			type: 'rematch_response',
			gameID: gameID,
			playerID: playerID,
			accepted: true,
		})
	)

	status.textContent = 'Starting rematch...'
}

function declineRematch() {
	rematchModal.classList.add('hidden')
	ws.send(
		JSON.stringify({
			type: 'rematch_response',
			gameID: gameID,
			playerID: playerID,
			accepted: false,
		})
	)
	status.textContent = 'You declined the rematch'
	playAgainBtn.classList.add('hidden')
	backToMenuBtn.classList.remove('hidden')
}

function startRematch() {
	if (!rematchAccepted) return

	ws.send(
		JSON.stringify({
			type: 'start_rematch',
			gameID: gameID,
			playerID: playerID,
			opponentID: opponentID,
		})
	)

	rematchRequested = false
	rematchAccepted = false
}

function getGameResult() {
	for (let i = 0; i < 3; i++) {
		if (
			board[i][0] &&
			board[i][0] === board[i][1] &&
			board[i][1] === board[i][2]
		) {
			return board[i][0] === mySymbol ? 'You win!' : 'Opponent wins!'
		}
		if (
			board[0][i] &&
			board[0][i] === board[1][i] &&
			board[1][i] === board[2][i]
		) {
			return board[0][i] === mySymbol ? 'You win!' : 'Opponent wins!'
		}
	}
	if (
		board[0][0] &&
		board[0][0] === board[1][1] &&
		board[1][1] === board[2][2]
	) {
		return board[0][0] === mySymbol ? 'You win!' : 'Opponent wins!'
	}
	if (
		board[0][2] &&
		board[0][2] === board[1][1] &&
		board[1][1] === board[2][0]
	) {
		return board[0][2] === mySymbol ? 'You win!' : 'Opponent wins!'
	}
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			if (board[i][j] === '') return ''
		}
	}
	return 'Draw!'
}

function makeMove(index) {
	if (!isMyTurn || gameStatus !== 'active') return

	try {
		const x = Math.floor(index / 3)
		const y = index % 3

		if (board[x][y] !== '') return

		if (!ws || ws.readyState !== WebSocket.OPEN) {
			console.warn('WebSocket connection lost, reconnecting...')
			initWebSocket()
			return
		}

		ws.send(
			JSON.stringify({
				type: 'move',
				gameID: gameID,
				playerID: playerID,
				x: x,
				y: y,
			})
		)

		if (isOffline && ws && ws.readyState === WebSocket.OPEN) {
			ws.send(
				JSON.stringify({
					type: 'ai_move',
					gameID: gameID,
				})
			)
		}
	} catch (error) {
		console.error('Error making move:', error)
		status.textContent = 'Connection lost. Please try again.'
		backToMenuBtn.classList.remove('hidden')
	}
}

function updateBoard() {
	const cells = boardElement.getElementsByClassName('cell')
	for (let i = 0; i < cells.length; i++) {
		const cell = cells[i]
		const row = Math.floor(i / 3)
		const col = i % 3

		cell.classList.remove('x', 'o', 'disabled')
		cell.textContent = ''

		if (board[row][col] === 'X') {
			cell.classList.add('x')
			cell.textContent = 'X'
		} else if (board[row][col] === 'O') {
			cell.classList.add('o')
			cell.textContent = 'O'
		}

		if (board[row][col] !== '' || !isMyTurn || gameStatus !== 'active') {
			cell.classList.add('disabled')
		}
	}
}

function updateGameStatus() {
	if (gameStatus === 'finished') {
		const result = getGameResult()
		status.textContent = result
	} else if (isMyTurn) {
		status.textContent = `Your turn (${mySymbol})`
	} else {
		const opponentSymbol = mySymbol === 'X' ? 'O' : 'X'
		status.textContent = isOffline
			? "AI's turn (O)"
			: `Opponent's turn (${opponentSymbol})`
	}
}

function disableBoard() {
	const cells = boardElement.getElementsByClassName('cell')
	for (let cell of cells) {
		cell.classList.add('disabled')
	}
}

function startStatsPolling() {
	const pollStats = async () => {
		try {
			const response = await fetch(`${backendUrl}/stats`)
			if (!response.ok) throw new Error('Failed to fetch stats')

			const text = await response.text()
			const jsonStrings = text.split('\n').filter(str => str.trim())
			const lastJson = jsonStrings[jsonStrings.length - 1]

			let stats
			try {
				stats = JSON.parse(lastJson)
			} catch (e) {
				console.error('Failed to parse stats:', lastJson)
				return
			}

			if (stats && typeof stats === 'object') {
				if (onlineCount) onlineCount.textContent = stats.online || '0'
				if (activeGames) activeGames.textContent = stats.games || '0'
				if (totalGames) totalGames.textContent = stats.totalGames || '0'
			}
		} catch (error) {
			console.error('Error fetching stats:', error)
		}
	}

	pollStats()
	const intervalId = setInterval(pollStats, 10000)
	window.addEventListener('beforeunload', () => clearInterval(intervalId))
}

async function updateStats() {
	if (!playerID) return

	try {
		const response = await fetch(
			`${backendUrl}/offline-stats?playerID=${playerID}`
		)
		if (!response.ok) throw new Error('Failed to fetch stats')

		const stats = await response.json()
		if (stats && typeof stats === 'object') {
			if (winsElement) winsElement.textContent = stats.wins || '0'
			if (lossesElement) lossesElement.textContent = stats.losses || '0'
			if (drawsElement) drawsElement.textContent = stats.draws || '0'
		}
	} catch (error) {
		console.error('Error updating stats:', error)
	}
}

async function resetGame() {
	try {
		playAgainBtn.classList.add('hidden')
		backToMenuBtn.classList.add('hidden')
		status.textContent = 'Starting new game...'

		board = [
			['', '', ''],
			['', '', ''],
			['', '', ''],
		]
		boardElement.innerHTML = ''
		for (let i = 0; i < 9; i++) {
			const cell = document.createElement('div')
			cell.className = 'cell'
			cell.dataset.index = i
			cell.addEventListener('click', () => makeMove(i))
			boardElement.appendChild(cell)
		}
		updateBoard()

		if (ws) {
			ws.close()
			ws = null
		}

		gameStatus = 'active'
		currentTurn = 'X'
		isMyTurn = true

		if (isOffline) {
			await startOfflineGame()
		} else {
			await startOnlineGame()
		}
	} catch (error) {
		console.error('Error resetting game:', error)
		status.textContent = 'Error starting new game. Please try again.'
		backToMenuBtn.classList.remove('hidden')
	}
}

function showMainMenu() {
	gameContainer.classList.add('hidden')
	modeSelection.classList.remove('hidden')
	status.textContent = ''
	status.classList.remove('searching')
	playAgainBtn.classList.add('hidden')
	backToMenuBtn.classList.add('hidden')
	rematchModal.classList.add('hidden')
	if (ws) {
		ws.close()
		ws = null
	}
	playerID = null
	gameID = null
	opponentID = null
	rematchRequested = false
	rematchAccepted = false
}

function showRoleSelection() {
	const modal = document.getElementById('role-selection-modal')
	modal.classList.remove('hidden')
	modal.classList.add('flex')

	roleSelectionTimeout = setTimeout(() => {
		if (!roleSelected) {
			const randomRole = Math.random() < 0.5 ? 'X' : 'O'
			selectRole(randomRole)
		}
	}, 10000)
}

function hideRoleSelection() {
	const modal = document.getElementById('role-selection-modal')
	modal.classList.add('hidden')
	modal.classList.remove('flex')
	if (roleSelectionTimeout) {
		clearTimeout(roleSelectionTimeout)
	}
}

function selectRole(role) {
	if (roleSelected) return

	roleSelected = true
	hideRoleSelection()

	ws.send(
		JSON.stringify({
			type: 'select_role',
			gameID: gameID,
			playerID: playerID,
			role: role,
		})
	)
}

document
	.getElementById('choose-x')
	?.addEventListener('click', () => selectRole('X'))
document
	.getElementById('choose-o')
	?.addEventListener('click', () => selectRole('O'))

function flattenBoard(board2d) {
	return board2d.flat()
}
