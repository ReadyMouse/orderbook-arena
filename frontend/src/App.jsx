import { useWebSocket } from './hooks/useWebSocket'
import './App.css'

function App() {
  const { orderbookState, error, isConnected } = useWebSocket();

  return (
    <div className="min-h-screen bg-arcade-bg text-arcade-white">
      {/* Header */}
      <header className="p-4 border-b-2 border-arcade-white">
        <h1 className="text-3xl font-arcade uppercase text-center">
          Orderbook Arena
        </h1>
        <div className="flex justify-center items-center gap-4 mt-2">
          <div className={`text-sm ${isConnected ? 'text-arcade-green' : 'text-arcade-red'}`}>
            {isConnected ? '● LIVE' : '○ OFFLINE'}
          </div>
          {error && (
            <div className="text-sm text-arcade-red">
              Error: {error}
            </div>
          )}
        </div>
      </header>

      {/* Main visualization area */}
      <main className="flex-1 p-4">
        <div className="w-full h-[calc(100vh-200px)] border-2 border-arcade-white bg-arcade-dark">
          {/* Orderbook visualization will go here */}
          {orderbookState ? (
            <div className="p-4">
              <p className="text-arcade-gray">Orderbook data received</p>
              <p className="text-sm">Last Price: {orderbookState.lastPrice || 'N/A'}</p>
              <p className="text-sm">Bids: {orderbookState.bids?.length || 0}</p>
              <p className="text-sm">Asks: {orderbookState.asks?.length || 0}</p>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-arcade-gray">Waiting for orderbook data...</p>
            </div>
          )}
        </div>
      </main>

      {/* Controls section */}
      <footer className="p-4 border-t-2 border-arcade-white">
        <div className="max-w-4xl mx-auto">
          {/* Time-travel controls will go here */}
          <div className="text-center text-arcade-gray text-sm">
            Controls coming soon...
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
