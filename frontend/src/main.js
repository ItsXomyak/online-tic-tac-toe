const ws = new WebSocket('ws://localhost:8080/ws')

ws.onmessage = event => {
	console.log('WebSocket message:', JSON.parse(event.data))
}

// Long Polling с задержкой
async function fetchStats() {
	try {
		const res = await fetch('http://localhost:8080/stats')
		const stats = await res.json()
		document.getElementById(
			'stats'
		).innerText = `Online: ${stats.online} | Games: ${stats.games}`
	} catch (err) {
		console.error('Stats fetch error:', err)
	}
	setTimeout(fetchStats, 1000) // Задержка 1 сек
}
fetchStats()

document.getElementById('quick-game').addEventListener('click', async () => {
	const res = await fetch('http://localhost:8080/quick-game', {
		method: 'POST',
	})
	console.log(await res.text())
})

document.getElementById('offline-game').addEventListener('click', () => {
	console.log('Offline game clicked')
})
