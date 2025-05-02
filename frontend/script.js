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

document.getElementById('online-btn').addEventListener('click', startOnlineGame)
document
	.getElementById('offline-btn')
	.addEventListener('click', startOfflineGame)
playAgainBtn.addEventListener('click', resetGame)
backToMenuBtn.addEventListener('click', showMainMenu)

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
	}
}

function initGame() {
	board = Array(9).fill('')
	currentTurn = 'X'
	gameStatus = 'active'
	boardElement.innerHTML = ''
	status.classList.remove('searching')

	for (let i = 0; i < 9; i++) {
		const cell = document.createElement('div')
		cell.className = 'cell'
		cell.dataset.index = i
		cell.addEventListener('click', () => makeMove(i))
		boardElement.appendChild(cell)
	}

	updateBoard()
	playAgainBtn.classList.add('hidden')
	updateGameStatus()
}

function initWebSocket() {
	if (ws) {
		ws.close()
	}

	ws = new WebSocket(`${wsUrl}?playerID=${playerID}`)

	ws.onopen = () => {
		console.log('WebSocket connected')
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
			console.log('WebSocket message received:', msg)
			handleWebSocketMessage(msg)
		} catch (error) {
			console.error('Error parsing WebSocket message:', error)
			status.textContent = 'Error processing game update'
		}
	}

	ws.onclose = () => {
		console.log('WebSocket disconnected')
		status.textContent = 'Disconnected from server. Please refresh the page.'
		disableBoard()
		backToMenuBtn.classList.remove('hidden')
	}

	ws.onerror = error => {
		console.error('WebSocket error:', error)
		status.textContent = 'Connection error. Please try again.'
	}
}

function handleWebSocketMessage(msg) {
	if (msg.error) {
		console.error('Server error:', msg.message)
		status.textContent = `Error: ${msg.message}`
		return
	}

	console.log('Processing message:', msg.type)
	switch (msg.type) {
		case 'game_start':
			gameID = msg.gameID
			board = flattenBoard(
				msg.board || [
					['', '', ''],
					['', '', ''],
					['', '', ''],
				]
			)
			if (msg.role) {
				mySymbol = msg.role
			} else {
				status.textContent = 'Ошибка: не получена роль игрока от сервера'
				console.error('Не получена роль игрока от сервера!')
				disableBoard()
				return
			}
			currentTurn = 'X'
			isMyTurn = mySymbol === currentTurn
			gameStatus = 'active'
			console.log('Game started:', { gameID, mySymbol, isMyTurn })
			initGame()
			break

		case 'move':
			board = flattenBoard(msg.board)
			currentTurn = msg.turn
			gameStatus = msg.status
			isMyTurn = mySymbol === currentTurn
			console.log('Move processed:', { currentTurn, gameStatus, isMyTurn })
			updateBoard()

			if (gameStatus === 'finished') {
				const result = getGameResult()
				status.textContent = result
				console.log('Game finished:', result)
				disableBoard()
				playAgainBtn.classList.remove('hidden')
				updateStats()
			} else {
				updateGameStatus()
			}
			break

		case 'opponent_left':
			console.log('Opponent disconnected')
			status.textContent = 'Opponent disconnected'
			gameStatus = 'finished'
			disableBoard()
			playAgainBtn.classList.remove('hidden')
			break

		case 'invalid_move':
			console.log('Invalid move:', msg.message)
			status.textContent = 'Invalid move. Please try again.'
			isMyTurn = true
			updateBoard()
			break

		default:
			console.warn('Unknown message type:', msg.type)
	}
}

function makeMove(index) {
	if (!isMyTurn || gameStatus !== 'active' || board[index] !== '') {
		console.log('Invalid move attempt:', {
			isMyTurn,
			gameStatus,
			cell: board[index],
		})
		return
	}

	try {
		board[index] = mySymbol
		updateBoard()
		isMyTurn = false

		// Преобразуем индекс в координаты x и y
		const x = Math.floor(index / 3)
		const y = index % 3

		console.log('Sending move:', { gameID, playerID, x, y })
		ws.send(
			JSON.stringify({
				type: 'move',
				gameID: gameID,
				playerID: playerID,
				x: x,
				y: y,
			})
		)

		updateGameStatus()
	} catch (error) {
		console.error('Error making move:', error)
		status.textContent = 'Error making move. Please try again.'
		isMyTurn = true // Возвращаем ход игроку в случае ошибки
		updateBoard()
	}
}

function updateBoard() {
	const cells = boardElement.getElementsByClassName('cell')
	for (let i = 0; i < cells.length; i++) {
		const prev = cells[i].textContent
		cells[i].textContent = board[i] || ''
		cells[i].classList.remove('x', 'o', 'disabled', 'animate-pop')

		if (board[i] === 'X') {
			cells[i].classList.add('x')
		} else if (board[i] === 'O') {
			cells[i].classList.add('o')
		}
		// Анимация появления символа
		if (prev !== board[i] && board[i] !== '') {
			cells[i].classList.add('animate-pop')
		}

		const shouldDisable =
			board[i] !== '' ||
			gameStatus !== 'active' ||
			!isMyTurn ||
			(isOffline && board[i] === 'O')

		if (shouldDisable) {
			cells[i].classList.add('disabled')
		}
	}
}

function updateGameStatus() {
	if (gameStatus === 'finished') {
		const result = getGameResult()
		status.textContent = result
		console.log('Game finished:', result)
	} else if (isMyTurn) {
		status.textContent = `Your turn (${mySymbol})`
		console.log('Current turn: player', mySymbol)
	} else {
		const opponentSymbol = mySymbol === 'X' ? 'O' : 'X'
		status.textContent = isOffline
			? "AI's turn (O)"
			: `Opponent's turn (${opponentSymbol})`
		console.log('Current turn: opponent', opponentSymbol)
	}
}

function disableBoard() {
	const cells = boardElement.getElementsByClassName('cell')
	for (let cell of cells) {
		cell.classList.add('disabled')
	}
}

function getGameResult() {
	const winPatterns = [
		[0, 1, 2],
		[3, 4, 5],
		[6, 7, 8], // rows
		[0, 3, 6],
		[1, 4, 7],
		[2, 5, 8], // columns
		[0, 4, 8],
		[2, 4, 6], // diagonals
	]

	for (const pattern of winPatterns) {
		const [a, b, c] = pattern
		if (board[a] && board[a] === board[b] && board[a] === board[c]) {
			return board[a] === mySymbol ? 'You win!' : 'Opponent wins!'
		}
	}

	return board.every(cell => cell !== '') ? 'Draw!' : ''
}

function startStatsPolling() {
	const pollStats = async () => {
		try {
			const response = await fetch(`${backendUrl}/stats`)
			if (!response.ok) {
				throw new Error('Failed to fetch stats')
			}
			const contentType = response.headers.get('content-type') || ''
			if (!contentType.includes('application/json')) {
				throw new Error('Response is not JSON')
			}
			const stats = await response.json()
			onlineCount.textContent = stats.online
			activeGames.textContent = stats.games
			if (totalGames) totalGames.textContent = stats.totalGames
		} catch (error) {
			console.error('Error fetching stats:', error)
		}
	}

	pollStats()
	setInterval(pollStats, 10000)
}

async function updateStats() {
	if (!playerID) return

	try {
		const response = await fetch(
			`${backendUrl}/offline-stats?playerID=${playerID}`
		)
		if (!response.ok) {
			throw new Error('Failed to fetch stats')
		}
		const stats = await response.json()
		winsElement.textContent = stats.wins
		lossesElement.textContent = stats.losses
		drawsElement.textContent = stats.draws
	} catch (error) {
		console.error('Error updating stats:', error)
	}
}

function resetGame() {
	console.log('Resetting game')
	// Сброс всех переменных состояния
	playerID = null
	gameID = null
	currentTurn = 'X'
	mySymbol = 'X'
	board = Array(9).fill('')
	gameStatus = 'waiting'
	isOffline = false
	isMyTurn = false
	roleSelected = false
	if (ws) {
		ws.close()
		ws = null
	}
	if (isOffline) {
		startOfflineGame()
	} else {
		startOnlineGame()
	}
}

function showMainMenu() {
	console.log('Returning to main menu')
	gameContainer.classList.add('hidden')
	modeSelection.classList.remove('hidden')
	status.textContent = ''
	status.classList.remove('searching')
	if (ws) {
		ws.close()
		ws = null
	}
}

function showRoleSelection() {
	const modal = document.getElementById('role-selection-modal')
	modal.classList.remove('hidden')
	modal.classList.add('flex')

	// Устанавливаем таймер на 10 секунд для автоматического выбора
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

// Добавляем обработчики для кнопок выбора роли
document
	.getElementById('choose-x')
	.addEventListener('click', () => selectRole('X'))
document
	.getElementById('choose-o')
	.addEventListener('click', () => selectRole('O'))

// Преобразование двумерного массива board в одномерный
function flattenBoard(board2d) {
	return board2d.flat()
}
