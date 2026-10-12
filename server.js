import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 3000;
const TOTAL_ROUNDS = 5;
const MAX_PLAYERS = 8;

const QUESTIONS = [
  ['What animal has three hearts?', 'Octopus'],
  ['What is the national animal of Scotland?', 'Unicorn'],
  ['What is the dot above a lowercase i called?', 'Tittle'],
  ['What is the fear of long words called?', 'Hippopotomonstrosesquippedaliophobia'],
  ['What is the only mammal capable of true flight?', 'Bat'],
];

const rooms = new Map();

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      code,
      players: [],
      clients: new Map(),
      round: 0,
      phase: 'waiting', // waiting -> write -> vote -> reveal -> ... -> finished
      answers: {},
      options: [], // shuffled [{ text, owner }] where owner === null is the truth
      votes: {},
      scores: {},
    });
  }
  return rooms.get(code);
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startVoting(room) {
  const [, truth] = QUESTIONS[room.round];
  const options = room.players.map((p) => ({ text: room.answers[p], owner: p }));
  options.push({ text: truth, owner: null });
  room.options = shuffle(options);
  room.phase = 'vote';
}

function scoreRound(room) {
  for (const [voter, index] of Object.entries(room.votes)) {
    const owner = room.options[index].owner;
    if (owner === null) room.scores[voter] += 100; // found the truth
    else room.scores[owner] += 150; // fooled someone
  }
  room.phase = 'reveal';
}

function stateFor(room, id) {
  const [question, truth] = QUESTIONS[Math.min(room.round, TOTAL_ROUNDS - 1)];
  const showOptions = ['vote', 'reveal', 'finished'].includes(room.phase);
  const revealed = room.phase === 'reveal' || room.phase === 'finished';
  return {
    type: 'state',
    room: room.code,
    players: room.players,
    round: room.round + 1,
    totalRounds: TOTAL_ROUNDS,
    phase: room.phase,
    question,
    truth: revealed ? truth : null,
    options: showOptions ? room.options.map((o) => o.text) : null,
    yourOption: showOptions ? room.options.findIndex((o) => o.owner === id) : -1,
    truthIndex: revealed ? room.options.findIndex((o) => o.owner === null) : -1,
    voteCounts: room.phase === 'reveal'
      ? room.options.map((_, i) => Object.values(room.votes).filter((v) => v === i).length)
      : null,
    submitted: Object.keys(room.answers).length,
    voted: Object.keys(room.votes).length,
    scores: room.scores,
    you: id,
    yourAnswer: room.answers[id] || null,
    yourVote: room.votes[id] ?? null,
  };
}

function broadcast(room) {
  for (const [ws, id] of room.clients) {
    if (ws.readyState === 1) ws.send(JSON.stringify(stateFor(room, id)));
  }
}

function handleAction(room, id, action) {
  if (!room.players.includes(id)) throw new Error('You are not a player in this room');

  if (room.phase === 'write') {
    const text = typeof action.text === 'string' ? action.text.trim() : '';
    if (action.type !== 'submit' || room.answers[id] || text.length < 2 || text.length > 120) {
      throw new Error('Enter one bluff (2–120 characters)');
    }
    const [, truth] = QUESTIONS[room.round];
    if (text.toLowerCase() === truth.toLowerCase()) {
      throw new Error("That's the real answer! Write a bluff instead.");
    }
    room.answers[id] = text;
    if (Object.keys(room.answers).length === room.players.length) startVoting(room);
    return;
  }

  if (room.phase === 'vote') {
    const index = action.index;
    const ownIndex = room.options.findIndex((o) => o.owner === id);
    if (
      action.type !== 'vote' ||
      room.votes[id] !== undefined ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= room.options.length ||
      index === ownIndex
    ) {
      throw new Error('Invalid vote');
    }
    room.votes[id] = index;
    if (Object.keys(room.votes).length === room.players.length) scoreRound(room);
    return;
  }

  if (room.phase === 'reveal' && action.type === 'next') {
    if (room.round === TOTAL_ROUNDS - 1) {
      room.phase = 'finished';
    } else {
      room.round++;
      room.phase = 'write';
      room.answers = {};
      room.votes = {};
      room.options = [];
    }
    return;
  }

  throw new Error('That action is not available right now');
}

function resetRoom(room) {
  room.round = 0;
  room.phase = 'waiting'; // back to the lobby so new friends can join
  room.answers = {};
  room.votes = {};
  room.options = [];
  room.scores = Object.fromEntries(room.players.map((p) => [p, 0]));
}

const STATIC_FILES = {
  'index.html': 'text/html; charset=utf-8',
  'client.js': 'text/javascript; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = path === '/' ? 'index.html' : path.slice(1);
    if (!STATIC_FILES[file]) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const data = await readFile(new URL('./public/' + file, import.meta.url));
    res.writeHead(200, { 'Content-Type': STATIC_FILES[file], 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(500);
    res.end('Server error');
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const code = (new URL(req.url, 'http://localhost').searchParams.get('room') || 'MAIN')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 24);
  const room = getRoom(code);
  let id = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'join') {
        id = String(msg.playerId || '').slice(0, 80) || randomUUID();
        if (!room.players.includes(id)) {
          if (room.phase !== 'waiting' || room.players.length >= MAX_PLAYERS) {
            throw new Error('Game already started or room is full');
          }
          room.players.push(id);
          room.scores[id] = 0;
        }
        room.clients.set(ws, id);
      } else if (msg.type === 'start') {
        if (!id || !room.players.includes(id)) throw new Error('Join the room first');
        if (room.phase !== 'waiting') throw new Error('The game has already started');
        if (room.players.length < 2) throw new Error('You need at least 2 players to start');
        room.phase = 'write';
      } else if (msg.type === 'action') {
        if (!id) throw new Error('Join the room first');
        handleAction(room, id, msg.action || {});
      } else if (msg.type === 'reset') {
        if (!id || !room.players.includes(id)) throw new Error('Not allowed');
        resetRoom(room);
      } else {
        return;
      }
      broadcast(room);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => {
    room.clients.delete(ws);
    broadcast(room);
  });
});

server.listen(PORT, () => console.log(`Bluff Battle running at http://localhost:${PORT}`));
