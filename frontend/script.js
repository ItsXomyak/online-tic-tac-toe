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
let playerNickname = localStorage.getItem('playerNickname') || ''

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
			status.textContent = 'Не удалось начать игру. Попробуйте еще раз.'
			return
		}

		const data = await response.json()
		if (data.status === 'error') {
			status.textContent = data.message
			return
		}
		playerID = data.playerID
		gameID = data.opponentID || null
		opponentID = data.opponentID || null
		isOffline = false

		status.textContent =
			data.status === 'waiting' ? 'Waiting for opponent...' : 'Game started!'
		status.classList.add('searching')

		if (data.status === 'started') {
			mySymbol = data.isFirstPlayer ? 'X' : 'O'
			isMyTurn = mySymbol === 'X'
			initGame()
		}

		if (data.nickname) {
			updatePlayerNickname(data.nickname)
		}

		initWebSocket()
		modeSelection.classList.add('hidden')
		gameContainer.classList.remove('hidden')
		startStatsPolling()
	} catch (error) {
		status.textContent = 'Не удалось начать игру. Попробуйте еще раз.'
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
			status.textContent = 'Не удалось начать игру. Попробуйте еще раз.'
			backToMenuBtn.classList.remove('hidden')
			return
		}

		const data = await response.json()
		if (data.status === 'error') {
			status.textContent = data.message
			backToMenuBtn.classList.remove('hidden')
			return
		}
		playerID = data.playerID
		gameID = data.gameID
		isOffline = true
		mySymbol = 'X'
		isMyTurn = true

		if (data.nickname) {
			updatePlayerNickname(data.nickname)
		}

		initGame()
		modeSelection.classList.add('hidden')
		gameContainer.classList.remove('hidden')
		startStatsPolling()
	} catch (error) {
		status.textContent = 'Не удалось начать игру. Попробуйте еще раз.'
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
		if (gameID && ws && ws.readyState === WebSocket.OPEN) {
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
			status.textContent = 'Ошибка обработки обновления игры'
		}
	}

	ws.onclose = () => {
		if (gameStatus !== 'finished') {
			status.textContent = 'Соединение потеряно. Попробуйте еще раз.'
			backToMenuBtn.classList.remove('hidden')
		}
		ws = null
	}

	ws.onerror = () => {
		status.textContent = 'Ошибка соединения. Попробуйте еще раз.'
		backToMenuBtn.classList.remove('hidden')
	}
}

function handleWebSocketMessage(msg) {
	if (msg.type === 'error') {
		status.textContent = `Ошибка: ${msg.message}`
		return
	}

	switch (msg.type) {
		case 'connected':
			return

		case 'warning':
			return

		case 'game_start':
			gameID = msg.gameID
			board = msg.board
			mySymbol = msg.role || mySymbol
			currentTurn = 'X'
			opponentID = msg.player1 === playerID ? msg.player2 : msg.player1
			isMyTurn = mySymbol === currentTurn
			gameStatus = 'active'
			initGame()
			if (msg.nickname) {
				updatePlayerNickname(msg.nickname)
			}
			if (msg.opponentNickname) {
				const opponentNicknameElement =
					document.getElementById('opponent-nickname')
				if (opponentNicknameElement) {
					opponentNicknameElement.textContent = msg.opponentNickname
				}
			}
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
			status.textContent = 'Соперник отключился'
			gameStatus = 'finished'
			handleGameEnd()
			break

		case 'invalid_move':
			status.textContent = 'Неверный ход. Попробуйте еще раз.'
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
				status.textContent = 'Реванш отклонен'
				playAgainBtn.classList.add('hidden')
				backToMenuBtn.classList.remove('hidden')
				rematchRequested = false
				rematchAccepted = false
			}
			break

		default:
			return
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
	if (isOffline) {
		board = [
			['', '', ''],
			['', '', ''],
			['', '', ''],
		]
		currentTurn = 'X'
		gameStatus = 'active'
		isMyTurn = true
		updateBoard()
		playAgainBtn.classList.add('hidden')
		backToMenuBtn.classList.add('hidden')
		status.textContent = `Your turn (${mySymbol})`
		return
	}

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

	const x = Math.floor(index / 3)
	const y = index % 3

	if (board[x][y] !== '') return

	if (isOffline) {
		board[x][y] = mySymbol
		currentTurn = 'O'
		isMyTurn = false
		updateBoard()
		checkGameEnd()

		if (gameStatus === 'active') {
			setTimeout(makeAIMove, 500)
		}
	} else {
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			status.textContent = 'Соединение потеряно. Попробуйте еще раз.'
			backToMenuBtn.classList.remove('hidden')
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
			if (!response.ok) {
				console.warn('Не удалось получить статистику:', response.statusText)
				return
			}

			const text = await response.text()
			const jsonStrings = text.split('\n').filter(str => str.trim())
			const lastJson = jsonStrings[jsonStrings.length - 1]

			let stats
			try {
				stats = JSON.parse(lastJson)
			} catch (e) {
				console.warn('Не удалось разобрать статистику:', lastJson)
				return
			}

			if (stats && typeof stats === 'object') {
				if (onlineCount) onlineCount.textContent = stats.online || '0'
				if (activeGames) activeGames.textContent = stats.games || '0'
				if (totalGames) totalGames.textContent = stats.totalGames || '0'
			}
		} catch (error) {
			console.warn('Проблема с получением статистики:', error.message)
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
		status.textContent = 'Начало новой игры...'

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

		await new Promise(resolve => setTimeout(resolve, 100))

		if (isOffline) {
			await startOfflineGame()
		} else {
			await startOnlineGame()
		}
	} catch (error) {
		status.textContent = 'Ошибка начала новой игры. Попробуйте еще раз.'
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

	// Скрываем никнеймы при возврате в меню
	const nicknameElement = document.getElementById('player-nickname')
	const opponentNicknameElement = document.getElementById('opponent-nickname')
	if (nicknameElement) nicknameElement.style.display = 'none'
	if (opponentNicknameElement) opponentNicknameElement.style.display = 'none'

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

// Добавляем функции для ИИ
function makeAIMove() {
	if (gameStatus !== 'active' || isMyTurn) return

	// 1. Проверяем, может ли ИИ выиграть следующим ходом
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			if (board[i][j] === '') {
				board[i][j] = 'O'
				if (checkWinner(board) === 'O') {
					currentTurn = 'X'
					isMyTurn = true
					updateBoard()
					checkGameEnd()
					return
				}
				board[i][j] = ''
			}
		}
	}

	// 2. Проверяем, может ли игрок выиграть следующим ходом, и блокируем его
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			if (board[i][j] === '') {
				board[i][j] = 'X'
				if (checkWinner(board) === 'X') {
					board[i][j] = 'O' // Блокируем выигрышный ход
					currentTurn = 'X'
					isMyTurn = true
					updateBoard()
					checkGameEnd()
					return
				}
				board[i][j] = ''
			}
		}
	}

	// 3. Если центр свободен, занимаем его
	if (board[1][1] === '') {
		board[1][1] = 'O'
		currentTurn = 'X'
		isMyTurn = true
		updateBoard()
		checkGameEnd()
		return
	}

	// 4. Если углы свободны, занимаем случайный угол
	const corners = [
		[0, 0],
		[0, 2],
		[2, 0],
		[2, 2],
	]
	const availableCorners = corners.filter(([i, j]) => board[i][j] === '')
	if (availableCorners.length > 0) {
		const [i, j] =
			availableCorners[Math.floor(Math.random() * availableCorners.length)]
		board[i][j] = 'O'
		currentTurn = 'X'
		isMyTurn = true
		updateBoard()
		checkGameEnd()
		return
	}

	// 5. Занимаем любую свободную клетку
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			if (board[i][j] === '') {
				board[i][j] = 'O'
				currentTurn = 'X'
				isMyTurn = true
				updateBoard()
				checkGameEnd()
				return
			}
		}
	}
}

function checkWinner(board) {
	// Проверка строк
	for (let i = 0; i < 3; i++) {
		if (
			board[i][0] !== '' &&
			board[i][0] === board[i][1] &&
			board[i][1] === board[i][2]
		) {
			return board[i][0]
		}
	}

	// Проверка столбцов
	for (let i = 0; i < 3; i++) {
		if (
			board[0][i] !== '' &&
			board[0][i] === board[1][i] &&
			board[1][i] === board[2][i]
		) {
			return board[0][i]
		}
	}

	// Проверка диагоналей
	if (
		board[0][0] !== '' &&
		board[0][0] === board[1][1] &&
		board[1][1] === board[2][2]
	) {
		return board[0][0]
	}
	if (
		board[0][2] !== '' &&
		board[0][2] === board[1][1] &&
		board[1][1] === board[2][0]
	) {
		return board[0][2]
	}

	return ''
}

function isDraw(board) {
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			if (board[i][j] === '') {
				return false
			}
		}
	}
	return true
}

function checkGameEnd() {
	const winner = checkWinner(board)
	if (winner) {
		gameStatus = 'finished'
		status.textContent = winner === mySymbol ? 'You win!' : 'AI wins!'
		handleGameEnd()
		return
	}

	if (isDraw(board)) {
		gameStatus = 'finished'
		status.textContent = 'Draw!'
		handleGameEnd()
		return
	}
}

function updatePlayerNickname(nickname) {
	playerNickname = nickname
	localStorage.setItem('playerNickname', nickname)
	const nicknameElement = document.getElementById('player-nickname')
	const opponentNicknameElement = document.getElementById('opponent-nickname')

	if (nicknameElement) {
		nicknameElement.textContent = nickname
		nicknameElement.style.display = isOffline ? 'none' : 'block'
	}
	if (opponentNicknameElement) {
		opponentNicknameElement.style.display = isOffline ? 'none' : 'block'
	}
}
