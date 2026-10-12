# 🎭 Bluff Battle: Real-Time Multiplayer Party Game

A browser-based bluffing game for 2–8 players. Friends join the same room link from their own phones or laptops, write convincing fake answers to weird trivia questions, then vote for the one they think is real. Fool your friends to score big.

**▶ Play the live version:** https://bluff-battle-party-2026.higgsfield.app

## How to play

1. Open the game. You get a private room with a shareable invite link.
2. Friends join with the link (2–8 players), then anyone presses **Start game**.
3. Each round shows a real trivia question. Everyone secretly writes a believable **fake** answer.
4. All the bluffs and the real answer are shuffled together. Everyone votes for the answer they think is true. You can't vote for your own bluff.
5. After 5 rounds, the highest score wins.

| Action | Points |
|---|---|
| Someone votes for your bluff | **+150** per player fooled |
| You vote for the real answer | **+100** |

## Features

- Private rooms with shareable invite links
- Live multiplayer over WebSockets, with every screen updating instantly
- Lobby so players can gather before the game starts
- Answers shuffled every round, so the real one can't be guessed by its position
- Blocks submitting the real answer as a bluff
- Live leaderboard, final champion screen, and restart
- Automatic reconnect if a player's connection drops
- Mobile-friendly design, with user input escaped to prevent HTML injection

## Tech stack

- **Backend:** Node.js, `http` module, [`ws`](https://github.com/websockets/ws) WebSocket server
- **Frontend:** Plain HTML, CSS, and JavaScript (no framework)
- **Architecture:** The server holds the game state for each room and broadcasts a personalized view to each player, so players never see other people's hidden answers or which option is the truth before the reveal.

## Project structure

```
├── server.js          # HTTP + WebSocket server and all game logic
├── public/
│   ├── index.html     # Page layout and styles
│   └── client.js      # Connects to the server and renders each game phase
├── package.json
└── LICENSE
```

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000. To test multiplayer on one computer, copy the invite link into a second browser window (or a private window).

## Deployment

Deploy to any Node.js host that supports long-lived WebSocket connections, such as Render or Railway. Set the start command to `npm start`; the server uses the host's `PORT` environment variable. This app needs a running server, so it can't be deployed as a static-only site (like GitHub Pages).

## Limitations and next steps

- Rooms are stored in server memory, so restarting the server ends active games. Adding Redis or a database would make games survive restarts and allow multiple servers.
- If a player leaves mid-round, the others can't advance until that player returns. A round timer or host "skip" button would fix this.
- The game uses a fixed set of 5 questions. A larger question bank with random selection would add replay value.

## About

Built by **Nikhitha Pottigari** · [LinkedIn](https://www.linkedin.com/in/nikhitha-p-abb311256) · [GitHub](https://github.com/pottigarinikitha123-rgb)

The live version runs on Higgsfield. This repository is a standalone Node.js implementation of the same game that you can run and host anywhere.

## License

MIT (see [LICENSE](LICENSE)).
