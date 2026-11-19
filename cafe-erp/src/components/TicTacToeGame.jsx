import React, { useState } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function checkWinner(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(Boolean) ? 'Draw' : null;
}

function pickBotMove(board) {
  const empty = board.map((v, i) => (v ? null : i)).filter((v) => v !== null);
  if (empty.length === 0) return null;

  // Win if possible, else block player, else center, else random
  for (const mark of ['O', 'X']) {
    for (const idx of empty) {
      const test = [...board];
      test[idx] = mark;
      if (checkWinner(test) === mark) return idx;
    }
  }
  if (empty.includes(4)) return 4;
  return empty[Math.floor(Math.random() * empty.length)];
}

export default function TicTacToeGame() {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [mode, setMode] = useState('bot'); // 'bot' | '2p'
  const [xTurn, setXTurn] = useState(true);

  const winner = checkWinner(board);

  const handleCell = (idx) => {
    if (board[idx] || winner) return;
    const next = [...board];

    if (mode === 'bot') {
      next[idx] = 'X';
      if (!checkWinner(next)) {
        const botIdx = pickBotMove(next);
        if (botIdx !== null) next[botIdx] = 'O';
      }
      setBoard(next);
    } else {
      next[idx] = xTurn ? 'X' : 'O';
      setBoard(next);
      setXTurn(!xTurn);
    }
  };

  const reset = () => {
    setBoard(Array(9).fill(null));
    setXTurn(true);
  };

  return (
    <div className="m-3 p-4 rounded-2xl bg-slate-900 text-white shadow space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <div>
            <h4 className="font-extrabold text-xs uppercase tracking-wide">
              Table Waiting Game
            </h4>
            <p className="text-[11px] text-slate-400">Play while the kitchen prepares your order</p>
          </div>
        </div>
        <div className="flex gap-1 bg-slate-800 p-0.5 rounded-lg text-[10px] font-bold">
          <button
            onClick={() => { setMode('bot'); reset(); }}
            className={`px-2 py-1 rounded ${mode === 'bot' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
          >
            vs Bot
          </button>
          <button
            onClick={() => { setMode('2p'); reset(); }}
            className={`px-2 py-1 rounded ${mode === '2p' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
          >
            2-Player
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
        {board.map((cell, idx) => (
          <button
            key={idx}
            onClick={() => handleCell(idx)}
            className="h-14 rounded-xl bg-slate-800 hover:bg-slate-700 font-extrabold text-xl flex items-center justify-center transition"
          >
            <span className={cell === 'X' ? 'text-indigo-400' : 'text-emerald-400'}>{cell}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs pt-1">
        <span className="font-bold text-amber-300">
          {winner === 'Draw'
            ? "It's a Draw!"
            : winner
            ? winner === 'X'
              ? mode === 'bot' ? 'You Win! 🎉' : 'Player X Wins!'
              : mode === 'bot' ? 'Cafe Bot Wins!' : 'Player O Wins!'
            : mode === 'bot'
            ? 'Your turn (X)'
            : `Player ${xTurn ? 'X' : 'O'}'s turn`}
        </span>
        <button
          onClick={reset}
          className="inline-flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-bold"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>
    </div>
  );
}