import React from 'react';
import GameCanvas from './components/GameCanvas';

function App() {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center font-pixel">
      <GameCanvas />
    </div>
  );
}

export default App;