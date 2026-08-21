const STORAGE_KEY = "familyLocatorPrototype.v1";
const DEFAULT_CENTER = { lat: 43.238, lng: 76.945 }; // Алматы, демо-центр

function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function defaultState() {
  return {
    zones: [
      { id: "z1", name: "Школа", lat: 43.238, lng: 76.945, radius: 150 },
      { id: "z2", name: "Дом", lat: 43.244, lng: 76.951, radius: 120 },
    ],
    events: [],
    childBirthDate: "",
    coPresence: false,
    consentGiven: false,
    ageCutoffLogged: false,
    childPos: { lat: 43.2382, lng: 76.9453 },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

let state = loadState();
let zoneMembership = {};
let pickMode = false;
let pickName = "";
let pickRadius = 150;
let simulating = false;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- Map setup ----------
const map = L.map("map").setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 15);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap",
}).addTo(map);

const zonesLayer = L.layerGroup().addTo(map);

const childIcon = L.divIcon({
  className: "",
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#4f46e5;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const childMarker = L.marker([state.childPos.lat, state.childPos.lng], {
  icon: childIcon,
  draggable: true,
  title: "Ребёнок",
}).addTo(map);
childMarker.bindTooltip("Ребёнок", { permanent: false });

childMarker.on("dragend", () => {
  const p = childMarker.getLatLng();
  state.childPos = { lat: p.lat, lng: p.lng };
  saveState();
  checkGeofences();
});

map.on("click", (e) => {
  if (!pickMode) return;
  addZone(pickName, pickRadius, e.latlng.lat, e.latlng.lng);
  exitPickMode();
});

// ---------- Zones ----------
function addZone(name, radius, lat, lng) {
  const zone = {
    id: "z" + Date.now() + Math.random().toString(36).slice(2, 6),
    name: name || "Новая зона",
    lat,
    lng,
    radius: Math.max(20, Number(radius) || 150),
  };
  state.zones.push(zone);
  zoneMembership[zone.id] = haversine(state.childPos, zone) <= zone.radius;
  saveState();
  renderZones();
  renderZoneLists();
}

function deleteZone(id) {
  state.zones = state.zones.filter((z) => z.id !== id);
  delete zoneMembership[id];
  saveState();
  renderZones();
  renderZoneLists();
}

function renderZones() {
  zonesLayer.clearLayers();
  state.zones.forEach((z) => {
    const circle = L.circle([z.lat, z.lng], {
      radius: z.radius,
      color: "#4f46e5",
      weight: 2,
      fillColor: "#4f46e5",
      fillOpacity: 0.12,
    }).addTo(zonesLayer);
    circle.bindTooltip(`${z.name} (${z.radius} м)`, { permanent: true, direction: "top", offset: [0, -6] });
    circle.on("click", () => map.setView([z.lat, z.lng], 16));
  });
}

function renderZoneLists() {
  for (const [ulId, readOnly] of [["zoneList", false], ["zoneListChild", true]]) {
    const ul = document.getElementById(ulId);
    ul.innerHTML = "";
    if (state.zones.length === 0) {
      ul.innerHTML = '<li class="empty">Зон пока нет</li>';
      continue;
    }
    state.zones.forEach((z) => {
      const li = document.createElement("li");
      li.className = "zone-item";
      const inside = zoneMembership[z.id];
      li.innerHTML = `
        <div>
          <div class="zi-name">${inside ? "📍 " : ""}${escapeHtml(z.name)}</div>
          <div class="zi-meta">радиус ${z.radius} м${inside ? " · ребёнок внутри" : ""}</div>
        </div>
        ${readOnly ? "" : '<button class="zi-del" title="Удалить">✕</button>'}
      `;
      li.addEventListener("click", (e) => {
        if (e.target.classList.contains("zi-del")) return;
        map.setView([z.lat, z.lng], 16);
      });
      if (!readOnly) {
        li.querySelector(".zi-del").addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm(`Удалить зону «${z.name}»?`)) deleteZone(z.id);
        });
      }
      ul.appendChild(li);
    });
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Pick-on-map mode ----------
const btnPickOnMap = document.getElementById("btnPickOnMap");
const pickHint = document.getElementById("pickHint");
const pickHintName = document.getElementById("pickHintName");

btnPickOnMap.addEventListener("click", () => {
  const name = document.getElementById("zoneName").value.trim();
  if (!name) {
    alert("Сначала укажите название зоны.");
    return;
  }
  pickMode = true;
  pickName = name;
  pickRadius = Number(document.getElementById("zoneRadius").value) || 150;
  pickHintName.textContent = name;
  pickHint.classList.remove("hidden");
  document.getElementById("map").style.cursor = "crosshair";
});

document.getElementById("btnCancelPick").addEventListener("click", exitPickMode);

function exitPickMode() {
  pickMode = false;
  pickHint.classList.add("hidden");
  document.getElementById("map").style.cursor = "";
  document.getElementById("zoneName").value = "";
}

document.getElementById("btnUseCurrentLocation").addEventListener("click", () => {
  const name = document.getElementById("zoneName").value.trim();
  if (!name) {
    alert("Сначала укажите название зоны.");
    return;
  }
  const radius = Number(document.getElementById("zoneRadius").value) || 150;
  if (!navigator.geolocation) {
    alert("Геолокация недоступна в этом браузере, зона будет добавлена в центре карты.");
    const c = map.getCenter();
    addZone(name, radius, c.lat, c.lng);
    document.getElementById("zoneName").value = "";
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      addZone(name, radius, pos.coords.latitude, pos.coords.longitude);
      map.setView([pos.coords.latitude, pos.coords.longitude], 16);
      document.getElementById("zoneName").value = "";
    },
    () => {
      alert("Не удалось получить геопозицию, зона будет добавлена в центре карты.");
      const c = map.getCenter();
      addZone(name, radius, c.lat, c.lng);
      document.getElementById("zoneName").value = "";
    }
  );
});

// ---------- Geofencing ----------
function checkGeofences() {
  state.zones.forEach((z) => {
    const dist = haversine(state.childPos, z);
    const inside = dist <= z.radius;
    const wasInside = !!zoneMembership[z.id];
    if (inside && !wasInside) logEvent("enter", `Вошёл(а) в зону «${z.name}»`);
    if (!inside && wasInside) logEvent("exit", `Вышел(а) из зоны «${z.name}»`);
    zoneMembership[z.id] = inside;
  });
  renderZoneLists();
}

// ---------- Events log ----------
function logEvent(type, text) {
  state.events.unshift({ id: Date.now() + Math.random(), type, text, ts: Date.now() });
  state.events = state.events.slice(0, 50);
  saveState();
  renderEventLogs();
}

function renderEventLogs() {
  for (const id of ["eventLog", "eventLogChild"]) {
    const ul = document.getElementById(id);
    ul.innerHTML = "";
    if (state.events.length === 0) {
      ul.innerHTML = '<li class="empty">Событий пока нет</li>';
      continue;
    }
    state.events.forEach((ev) => {
      const li = document.createElement("li");
      li.className = "event-item " + (ev.type === "enter" ? "enter" : ev.type === "exit" ? "exit" : ev.type === "age" ? "age" : "copresence");
      const time = new Date(ev.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      li.innerHTML = `${escapeHtml(ev.text)}<span class="ts">${time}</span>`;
      ul.appendChild(li);
    });
  }
}

// ---------- Co-presence ----------
const coPresenceToggle = document.getElementById("coPresenceToggle");
coPresenceToggle.checked = state.coPresence;

coPresenceToggle.addEventListener("change", () => {
  state.coPresence = coPresenceToggle.checked;
  saveState();
  if (state.coPresence) logEvent("copresence", "👥 Родитель рядом — точечный трекинг пути приостановлен");
  else logEvent("copresence", "▶️ Родитель ушёл — обычный режим трекинга возобновлён");
  renderCoPresenceStatus();
});

function renderCoPresenceStatus() {
  const el = document.getElementById("coPresenceStatus");
  const note = document.getElementById("coPresenceChildNote");
  if (state.coPresence) {
    el.textContent = "⏸ Активный трекинг пути приостановлен. События входа/выхода из зон по-прежнему фиксируются.";
    el.className = "status-line warn";
    note.classList.remove("hidden");
  } else {
    el.textContent = "▶️ Обычный режим трекинга.";
    el.className = "status-line";
    note.classList.add("hidden");
  }
}

// ---------- Age auto-cutoff ----------
const birthInput = document.getElementById("childBirthDate");
birthInput.value = state.childBirthDate;

function computeAge(dateStr) {
  const bd = new Date(dateStr);
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--;
  return age;
}

function trackingActive() {
  if (!state.childBirthDate) return true;
  return computeAge(state.childBirthDate) < 15;
}

function updateAgeStatus() {
  const el = document.getElementById("ageStatus");
  if (!state.childBirthDate) {
    el.textContent = "Дата рождения не указана — автоотключение не активно.";
    el.className = "status-line warn";
  } else {
    const age = computeAge(state.childBirthDate);
    if (age >= 15) {
      el.textContent = `Трекинг отключён — ребёнку ${age} лет.`;
      el.className = "status-line off";
      if (!state.ageCutoffLogged) {
        logEvent("age", "🎂 Автоотключение трекинга — ребёнку исполнилось 15 лет");
        state.ageCutoffLogged = true;
        saveState();
      }
    } else {
      el.textContent = `Трекинг активен — ребёнку ${age} лет, автоотключение в 15.`;
      el.className = "status-line";
    }
  }
  renderTrackingBadge();
}

birthInput.addEventListener("change", () => {
  state.childBirthDate = birthInput.value;
  state.ageCutoffLogged = false;
  saveState();
  updateAgeStatus();
});

document.getElementById("btnSimulateBirthday").addEventListener("click", () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 15);
  const iso = d.toISOString().slice(0, 10);
  birthInput.value = iso;
  state.childBirthDate = iso;
  state.ageCutoffLogged = false;
  saveState();
  updateAgeStatus();
});

function renderTrackingBadge() {
  const badge = document.getElementById("trackingBadge");
  const title = document.getElementById("trackingBadgeTitle");
  const sub = document.getElementById("trackingBadgeSub");
  if (trackingActive()) {
    badge.className = "tracking-badge tracking-on";
    title.textContent = "Трекинг активен";
    sub.textContent = "Родитель видит твоё местоположение";
  } else {
    badge.className = "tracking-badge tracking-off";
    title.textContent = "Трекинг отключён";
    sub.textContent = "Тебе исполнилось 15 лет — передача геоданных остановлена";
  }
}

// ---------- Movement simulation ----------
document.getElementById("btnSimulateWalk").addEventListener("click", () => {
  if (simulating) return;
  if (state.zones.length < 2) {
    alert("Добавьте хотя бы 2 зоны, чтобы проиграть маршрут между ними.");
    return;
  }
  if (state.coPresence) {
    alert("Точечный трекинг пути приостановлен — родитель рядом с ребёнком. Симуляция маршрута недоступна.");
    return;
  }
  if (!trackingActive()) {
    alert("Трекинг отключён (ребёнку 15 лет или больше) — передача геоданных недоступна.");
    return;
  }
  runWalkSimulation(state.zones[0], state.zones[1]);
});

function runWalkSimulation(from, to) {
  simulating = true;
  const btn = document.getElementById("btnSimulateWalk");
  btn.disabled = true;
  btn.textContent = "⏳ В пути…";

  const badge = document.getElementById("activityBadge");
  const activity = Math.random() < 0.5 ? "walking" : "vehicle";
  const busMatch = activity === "vehicle" && Math.random() < 0.5;
  const label =
    activity === "walking" ? "🚶 Пешком" : busMatch ? "🚌 В транспорте — похоже на автобус" : "🚗 В транспорте";
  badge.textContent = label;
  badge.classList.remove("hidden");

  const steps = 30;
  let i = 0;
  const start = { lat: from.lat, lng: from.lng };
  const end = { lat: to.lat, lng: to.lng };
  childMarker.setLatLng([start.lat, start.lng]);

  const interval = setInterval(() => {
    i++;
    const t = i / steps;
    const lat = start.lat + (end.lat - start.lat) * t;
    const lng = start.lng + (end.lng - start.lng) * t;
    state.childPos = { lat, lng };
    childMarker.setLatLng([lat, lng]);
    checkGeofences();
    if (i >= steps) {
      clearInterval(interval);
      saveState();
      simulating = false;
      btn.disabled = false;
      btn.textContent = "▶️ Проиграть маршрут между зонами";
      badge.textContent = label + " · маршрут завершён";
      setTimeout(() => badge.classList.add("hidden"), 3000);
    }
  }, 180);
}

// ---------- Role switching ----------
const roleBtns = document.querySelectorAll(".role-btn");
const consentModal = document.getElementById("consentModal");

roleBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    roleBtns.forEach((b) => {
      b.classList.toggle("active", b === btn);
      b.setAttribute("aria-selected", b === btn ? "true" : "false");
    });
    const role = btn.dataset.role;
    document.body.className = "role-" + role;
    if (role === "child" && !state.consentGiven) {
      consentModal.classList.remove("hidden");
    }
  });
});

document.getElementById("btnConsentAccept").addEventListener("click", () => {
  state.consentGiven = true;
  saveState();
  consentModal.classList.add("hidden");
});

// ---------- Init ----------
renderZones();
renderZoneLists();
renderEventLogs();
renderCoPresenceStatus();
updateAgeStatus();
checkGeofences();
