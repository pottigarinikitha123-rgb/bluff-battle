const params = new URLSearchParams(location.search);
let room = params.get('room');
if (!room) {
  room = Math.random().toString(36).slice(2, 8).toUpperCase();
  location.replace('?room=' + room);
}

const storageKey = 'bluff-id-' + room;
let playerId = sessionStorage.getItem(storageKey);
if (!playerId) {
  playerId = crypto.randomUUID();
  sessionStorage.setItem(storageKey, playerId);
}

const gameEl = document.querySelector('#game');
const statusEl = document.querySelector('#connection');
let ws;

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const send = (msg) => {
  if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
};
const act = (action) => send({ type: 'action', action });

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/?room=${encodeURIComponent(room)}`);
  ws.onopen = () => send({ type: 'join', playerId });
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'error') {
      statusEl.textContent = '⚠ ' + msg.message;
      return;
    }
    render(msg);
  };
  ws.onclose = () => {
    statusEl.textContent = 'Reconnecting…';
    setTimeout(connect, 1500);
  };
}

function playerName(s, id) {
  return id === s.you ? 'You' : 'Player ' + (s.players.indexOf(id) + 1);
}

function render(s) {
  const round = Math.min(s.round, s.totalRounds);
  statusEl.textContent = `Room ${room} • ${s.players.length}/8 players • Round ${round}/${s.totalRounds}`;

  let html = '<button id="copy">Copy invite link</button>';

  if (s.phase === 'waiting') {
    html += `<h2>Lobby: ${s.players.length} player${s.players.length === 1 ? '' : 's'} joined</h2>`;
    html += '<p>Share the invite link with up to 8 friends, then start when everyone is in.</p>';
    html += s.players.length >= 2
      ? '<button id="start">Start game</button>'
      : '<p class="muted">Waiting for at least one more player…</p>';
  } else {
    html += '<h2>' + escapeHtml(s.question) + '</h2>';

    if (s.phase === 'write') {
      html += `<p>${s.submitted}/${s.players.length} bluffs submitted</p>`;
      html += s.yourAnswer
        ? '<p>Submitted: ' + escapeHtml(s.yourAnswer) + '. Waiting for others…</p>'
        : '<form id="answer"><input id="bluff" minlength="2" maxlength="120" required placeholder="Your most convincing fake answer"><button>Submit bluff</button></form>';
    }

    if (s.phase === 'vote') {
      html += `<p>${s.voted}/${s.players.length} votes in. Which answer is real?</p>`;
      s.options.forEach((option, i) => {
        const isOwn = i === s.yourOption;
        const disabled = s.yourVote !== null || isOwn ? 'disabled' : '';
        const picked = s.yourVote === i ? ' ✓' : '';
        html += `<button class="choice" data-vote="${i}" ${disabled}>${escapeHtml(option)}${isOwn ? ' (your bluff)' : ''}${picked}</button>`;
      });
    }

    if (s.phase === 'reveal' || s.phase === 'finished') {
      html += '<h2 class="highlight">The truth: ' + escapeHtml(s.truth) + '</h2>';
      if (s.phase === 'reveal') {
        s.options.forEach((option, i) => {
          const label = i === s.truthIndex ? ' ✅' : '';
          html += `<div class="score"><span>${escapeHtml(option)}${label}</span><b>${s.voteCounts[i]} votes</b></div>`;
        });
        html += `<button id="next">${s.round === s.totalRounds ? 'See champion' : 'Next round →'}</button>`;
      }
    }

    html += '<h2>🏆 Leaderboard</h2>';
    Object.entries(s.scores)
      .sort((a, b) => b[1] - a[1])
      .forEach(([id, points], i) => {
        html += `<div class="score"><span>${i === 0 ? '👑 ' : ''}${playerName(s, id)}</span><b>${points} pts</b></div>`;
      });

    if (s.phase === 'finished') {
      const best = Math.max(...Object.values(s.scores));
      html += `<h2 class="highlight">${s.scores[s.you] === best ? '🎉 You win!' : '🎉 Game over!'}</h2>`;
    }
  }

  gameEl.innerHTML = html;

  document.querySelector('#copy')?.addEventListener('click', () => navigator.clipboard.writeText(location.href));
  document.querySelector('#answer')?.addEventListener('submit', (e) => {
    e.preventDefault();
    act({ type: 'submit', text: document.querySelector('#bluff').value });
  });
  document.querySelectorAll('[data-vote]').forEach((btn) => {
    btn.onclick = () => act({ type: 'vote', index: Number(btn.dataset.vote) });
  });
  document.querySelector('#start')?.addEventListener('click', () => send({ type: 'start' }));
  document.querySelector('#next')?.addEventListener('click', () => act({ type: 'next' }));
}

document.querySelector('#restart').onclick = () => {
  if (confirm('Restart the game for everyone? Scores reset and everyone returns to the lobby.')) send({ type: 'reset' });
};

connect();
