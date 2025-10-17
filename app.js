// ========== EDIT THIS: Your Firebase config ==========
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
// =====================================================

/* ---------------- Language strings ------------------ */
const STRINGS = {
  en: {
    host_create_room: "Create a Room",
    btn_create_room: "Create Room",
    label_room_code: "Room Code:",
    hint_share_qr: "Share this QR / link so players can join from their phones:",
    label_join_link: "Join link:",
    title_lobby: "Lobby",
    btn_start_game: "Start Game",
    btn_clear_players: "Clear Players",
    title_game: "Game",
    label_current_player: "Current Player",
    label_punishment: "Punishment",
    btn_next: "Next",
    btn_toggle_active: "Toggle Active",
    btn_end: "End",
    summary_history: "History",
    disclaimer: "Please drink responsibly. You can run a zero-alcohol variant by swapping “drink” tasks.",
    join_title: "Join a Room",
    join_room_code: "Room Code",
    join_your_name: "Your name",
    btn_join: "Join",
    joined_heading: "You’re in! 🎉",
    joined_wait: "Wait for the host to start the game.",
    err_missing_fields: "Enter room code and name.",
    err_room_not_found: "Room not found.",
    joined_ok: "Joined! Hang tight.",
    rounds_n: (n)=>`For ${n} rounds`,
  },
  sv: {
    host_create_room: "Skapa ett rum",
    btn_create_room: "Skapa rum",
    label_room_code: "Rums-kod:",
    hint_share_qr: "Dela denna QR / länk så kan alla ansluta via mobilen:",
    label_join_link: "Länken för att ansluta:",
    title_lobby: "Lobby",
    btn_start_game: "Starta spelet",
    btn_clear_players: "Rensa spelare",
    title_game: "Spel",
    label_current_player: "Spelare",
    label_punishment: "Straff",
    btn_next: "Nästa",
    btn_toggle_active: "Aktiv / Paus",
    btn_end: "Avsluta",
    summary_history: "Historik",
    disclaimer: "Drick ansvarsfullt. Du kan köra alkoholfria varianter genom att byta ut uppgifterna.",
    join_title: "Gå med i ett rum",
    join_room_code: "Rums-kod",
    join_your_name: "Ditt namn",
    btn_join: "Gå med",
    joined_heading: "Du är med! 🎉",
    joined_wait: "Vänta tills värden startar spelet.",
    err_missing_fields: "Fyll i rums-kod och namn.",
    err_room_not_found: "Rummet hittades inte.",
    joined_ok: "Inne! Vänta lite.",
    rounds_n: (n)=>`I ${n} rundor`,
  }
};

/* --------- Punishments / Challenges (EN + SV) ------- */
const PUNISHMENTS = {
  en: [
    "Take 2 sips",
    "Swap seats with someone",
    "Truth: tell an embarrassing story",
    "Dare: speak in rhyme until your next turn",
    "Choose someone to take 1 sip",
    "No names: if you say any name, take a sip",
    "Compliment the person on your left",
    "Paper crown: wear an imaginary crown for 2 rounds",
    "Rock–paper–scissors with the host: loser drinks",
    "Switch your drink hand for 3 rounds",
    "Group votes a tongue twister for you",
    "You’re the DJ: pick the next song",
  ],
  sv: [
    "Ta 2 klunkar",
    "Byt plats med någon",
    "Sanning: berätta en pinsam historia",
    "Utmana: prata på rim tills din nästa tur",
    "Välj någon som tar 1 klunk",
    "Inga namn: säger du ett namn, ta en klunk",
    "Ge en komplimang till personen till vänster",
    "Papperskrona: bär en låtsaskrona i 2 rundor",
    "Sten–sax–påse mot värden: förloraren dricker",
    "Byt drickhand i 3 rundor",
    "Gruppen väljer en tungvrickare åt dig",
    "Du är DJ: välj nästa låt",
  ]
};

/* ----------------- Helpers & State ------------------- */
let app, db;
let state = {
  lang: 'en',
  role: null,         // 'host' | 'join'
  roomCode: null,
  playerId: null,     // for joiners
  playerName: null,
  activeOnly: true,
  lastPicks: [],      // to avoid repeating players too often
  history: [],
};

function $(sel){ return document.querySelector(sel); }
function applyI18N(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n');
    const s = STRINGS[state.lang];
    if (!s[key]) return;
    el.textContent = typeof s[key] === 'function' ? s[key]() : s[key];
  });
}

/* ----------------- Firebase init --------------------- */
function initFirebase(){
  if (!app){ app = firebase.initializeApp(firebaseConfig); }
  if (!db){ db = firebase.database(); }
}

/* ---------------- Room code generator ---------------- */
function genRoomCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i=0;i<6;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

/* --------------- DB helpers ------------------------- */
function roomRef(code){ return db.ref(`rooms/${code}`); }

/* ----------------- Host Flow ------------------------- */
async function hostCreateRoom(){
  state.roomCode = genRoomCode();
  const ref = roomRef(state.roomCode);
  await ref.set({
    createdAt: Date.now(),
    status: 'lobby',
    lang: state.lang,
    players: {}, // id -> {name, active:true}
    history: [],
  });
  // Show QR + link
  $('#roomInfo').classList.remove('hidden');
  $('#roomCode').textContent = state.roomCode;
  const joinUrl = new URL(location.origin + location.pathname.replace('index.html','') + 'join.html');
  joinUrl.searchParams.set('room', state.roomCode);
  joinUrl.searchParams.set('lang', state.lang);
  $('#joinLink').href = joinUrl.toString();
  $('#joinLink').textContent = joinUrl.toString();
  const qrDiv = $('#qr');
  qrDiv.innerHTML = '';
  QRCode.toCanvas(joinUrl.toString(), { width: 190 }, (err, canvas)=>{
    if (!err) qrDiv.appendChild(canvas);
  });
  // Listen lobby
  roomRef(state.roomCode).child('players').on('value', snap=>{
    const players = snap.val()||{};
    const list = $('#playersList');
    list.innerHTML = '';
    Object.entries(players).forEach(([id, p])=>{
      const li = document.createElement('li');
      li.className = 'pill' + (p.active===false ? ' inactive' : '');
      li.textContent = p.name + (p.active===false ? ' (⏸)' : '');
      list.appendChild(li);
    });
    $('#lobby').classList.remove('hidden');
  });
}

async function hostStartGame(){
  if (!state.roomCode) return;
  await roomRef(state.roomCode).update({ status: 'running' });
  $('#game').classList.remove('hidden');
}

async function hostClearPlayers(){
  if (!state.roomCode) return;
  await roomRef(state.roomCode).child('players').set({});
}

function pickRandomPlayer(players){
  const ids = Object.keys(players).filter(id => players[id].active !== false);
  if (ids.length === 0) return null;
  const recent = new Set(state.lastPicks.slice(-3));
  const pool = ids.filter(id => !recent.has(id));
  const pickFrom = pool.length ? pool : ids;
  const choice = pickFrom[Math.floor(Math.random()*pickFrom.length)];
  state.lastPicks.push(choice);
  return { id: choice, ...players[choice] };
}

function randomPunishment(){
  const list = PUNISHMENTS[state.lang] || PUNISHMENTS.en;
  const text = list[Math.floor(Math.random()*list.length)];
  const rounds = Math.floor(Math.random()*3)+1; // 1–3
  return { text, rounds };
}

async function hostNext(){
  const snap = await roomRef(state.roomCode).child('players').get();
  const players = snap.val()||{};
  const pick = pickRandomPlayer(players);
  if (!pick){ return; }
  const punish = randomPunishment();
  $('#currentPlayer').textContent = pick.name;
  $('#currentPunishment').textContent = punish.text;
  $('#roundsNote').textContent = STRINGS[state.lang].rounds_n(punish.rounds);
  const entry = {
    t: Date.now(),
    name: pick.name,
    punishment: punish.text,
    rounds: punish.rounds
  };
  state.history.push(entry);
  const li = document.createElement('li');
  li.textContent = `${pick.name} → ${punish.text} (${punish.rounds})`;
  $('#historyList').prepend(li);
  await roomRef(state.roomCode).child('history').push(entry);
}

async function hostToggleActive(){
  const name = $('#currentPlayer').textContent.trim();
  if (!name) return;
  const playersSnap = await roomRef(state.roomCode).child('players').get();
  const players = playersSnap.val()||{};
  const entry = Object.entries(players).find(([,p])=>p.name===name);
  if (!entry) return;
  const [id, p] = entry;
  await roomRef(state.roomCode).child('players').child(id).update({ active: !(p.active!==false) });
}

async function hostEnd(){
  await roomRef(state.roomCode).update({ status:'ended' });
  alert('Game ended. You can create a new room if you like.');
  location.reload();
}

/* ----------------- Join Flow ------------------------- */
async function joinRoom(roomCode, name){
  const ref = roomRef(roomCode);
  const exists = (await ref.get()).exists();
  if (!exists){ return { ok:false, msg: STRINGS[state.lang].err_room_not_found }; }
  const newRef = ref.child('players').push();
  state.playerId = newRef.key;
  state.playerName = name;
  await newRef.set({ name, active:true });
  return { ok:true, msg: STRINGS[state.lang].joined_ok };
}

async function joinToggleActive(){
  if (!state.roomCode || !state.playerId) return;
  const pRef = roomRef(state.roomCode).child('players').child(state.playerId);
  const snap = await pRef.get();
  const p = snap.val();
  await pRef.update({ active: !(p && p.active!==false) });
}

/* -------------- Language toggle -------------------- */
function initLang(){
  const sel = document.querySelector('#langSel');
  if (sel){
    const urlLang = new URLSearchParams(location.search).get('lang');
    state.lang = urlLang || localStorage.getItem('mmm_lang') || 'en';
    sel.value = state.lang;
    applyI18N();
    sel.addEventListener('change', ()=>{
      state.lang = sel.value;
      localStorage.setItem('mmm_lang', state.lang);
      applyI18N();
      if (state.role==='host' && state.roomCode){
        roomRef(state.roomCode).update({ lang: state.lang });
        // Update join link + QR
        const joinLink = document.querySelector('#joinLink');
        if (joinLink){
          const joinUrl = new URL(joinLink.href);
          joinUrl.searchParams.set('lang', state.lang);
          joinLink.href = joinUrl.toString();
          joinLink.textContent = joinUrl.toString();
          const qrDiv = document.querySelector('#qr'); if (qrDiv){ qrDiv.innerHTML = ''; }
          QRCode.toCanvas(joinUrl.toString(), { width: 190 }, (err, canvas)=>{
            if (!err && qrDiv) qrDiv.appendChild(canvas);
          });
        }
      }
    });
  }
}

/* -------------- Wire Host / Join -------------------- */
function wireHost(){
  document.querySelector('#createRoomBtn').addEventListener('click', hostCreateRoom);
  document.querySelector('#startBtn').addEventListener('click', hostStartGame);
  document.querySelector('#clearPlayersBtn').addEventListener('click', hostClearPlayers);
  document.querySelector('#nextBtn').addEventListener('click', hostNext);
  document.querySelector('#toggleActiveBtn').addEventListener('click', hostToggleActive);
  document.querySelector('#endBtn').addEventListener('click', hostEnd);
}

function wireJoin(){
  const params = new URLSearchParams(location.search);
  const preRoom = params.get('room');
  const preLang = params.get('lang');
  if (preRoom) document.querySelector('#roomCodeInput').value = preRoom;
  if (preLang) { state.lang = preLang; const sel = document.querySelector('#langSel'); if (sel){ sel.value = preLang; } applyI18N(); }

  document.querySelector('#joinBtn').addEventListener('click', async ()=>{
    const roomCode = document.querySelector('#roomCodeInput').value.trim().toUpperCase();
    const name = document.querySelector('#playerNameInput').value.trim();
    const joinMsg = document.querySelector('#joinMsg');
    if (!roomCode || !name){
      joinMsg.textContent = STRINGS[state.lang].err_missing_fields; return;
    }
    state.roomCode = roomCode;
    const res = await joinRoom(roomCode, name);
    joinMsg.textContent = res.msg;
    if (res.ok){
      document.querySelector('#joinedCard').classList.remove('hidden');
      document.querySelector('#youName').textContent = name;
    }
  });

  document.querySelector('#toggleActiveBtn').addEventListener('click', joinToggleActive);
}

/* ------------------ Bootstrapping ------------------- */
window.MMM_INIT = function(role){
  state.role = role;
  initLang();
  initFirebase();

  if (role === 'host'){
    wireHost();
    document.querySelector('#hostSetup').classList.remove('hidden');
    // Reflect room status changes
    setInterval(async ()=>{
      if (!state.roomCode) return;
      const snap = await roomRef(state.roomCode).child('status').get();
      const status = snap.val();
      if (status === 'running'){ document.querySelector('#game').classList.remove('hidden'); }
    }, 1000);
  }
  if (role === 'join'){
    wireJoin();
  }
};
