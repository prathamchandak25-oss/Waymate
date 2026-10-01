import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);
const ORS_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjZhZDRiNjExMDU1YjQ5MmRhOGUwNTZkYzQ0NmY3OTM2IiwiaCI6Im11cm11cjY0In0=';

let currentUser = null;
let map, routeLayer = null;
let originCoords = null, destCoords = null;
let pickupMarker = null, dropMarker = null;

function decodePolyline(encoded) {
    const pts = []; let i = 0, lat = 0, lng = 0;
    while (i < encoded.length) {
        let s = 0, r = 0, b;
        do { b = encoded.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
        lat += (r & 1) ? ~(r >> 1) : (r >> 1); s = 0; r = 0;
        do { b = encoded.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
        lng += (r & 1) ? ~(r >> 1) : (r >> 1);
        pts.push([lat / 1e5, lng / 1e5]);
    }
    return pts;
}

function setupAutocomplete(inputId, onSelect) {
    const input = document.getElementById(inputId);
    const dd = document.createElement('div');
    dd.className = 'autocomplete-dropdown';
    input.parentElement.style.position = 'relative';
    input.parentElement.appendChild(dd);
    let timer;
    input.addEventListener('input', () => {
        clearTimeout(timer);
        const q = input.value.trim();
        if (q.length < 3) { dd.style.display = 'none'; return; }
        timer = setTimeout(async () => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=in&limit=5`);
                const data = await res.json();
                if (data.length > 0) {
                    dd.innerHTML = data.map(r => `<div class="autocomplete-item" data-lat="${r.lat}" data-lon="${r.lon}">${r.display_name}</div>`).join('');
                    dd.style.display = 'block';
                    dd.querySelectorAll('.autocomplete-item').forEach(item => {
                        item.addEventListener('click', () => {
                            input.value = item.textContent;
                            dd.style.display = 'none';
                            onSelect({ lat: parseFloat(item.dataset.lat), lng: parseFloat(item.dataset.lon) });
                        });
                    });
                } else dd.style.display = 'none';
            } catch (e) { console.error(e); }
        }, 350);
    });
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dd.contains(e.target)) dd.style.display = 'none';
    });
}

function updateMapMarkers(loc, type) {
    if (type === 'origin') {
        if (pickupMarker) map.removeLayer(pickupMarker);
        pickupMarker = L.circleMarker([loc.lat, loc.lng], { radius: 7, fillColor: '#4ade80', fillOpacity: 1, color: 'white', weight: 2 }).addTo(map);
        map.setView([loc.lat, loc.lng], 13);
    } else {
        if (dropMarker) map.removeLayer(dropMarker);
        dropMarker = L.circleMarker([loc.lat, loc.lng], { radius: 7, fillColor: '#f87171', fillOpacity: 1, color: 'white', weight: 2 }).addTo(map);
        if (originCoords) {
            map.fitBounds([[originCoords.lat, originCoords.lng], [loc.lat, loc.lng]], { padding: [50, 50] });
        }
    }
}

async function calcPassengerRoute() {
    if (!originCoords || !destCoords) return;
    try {
        const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
            method: 'POST',
            headers: { 'Authorization': ORS_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ coordinates: [[originCoords.lng, originCoords.lat], [destCoords.lng, destCoords.lat]] })
        });
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
            const path = decodePolyline(data.routes[0].geometry);
            if (routeLayer) map.removeLayer(routeLayer);
            routeLayer = L.polyline(path, { color: '#ffffff', weight: 5, opacity: 0.9 }).addTo(map);
            map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
        }
    } catch (e) { console.error('Route error:', e); }
}

// Geometry helpers
function pointToSegmentDist(p, a, b) {
    const lp = L.latLng(p[0], p[1]), la = L.latLng(a[0], a[1]), lb = L.latLng(b[0], b[1]);
    const lenSq = la.distanceTo(lb) ** 2;
    if (lenSq === 0) return lp.distanceTo(la);
    let t = ((p[0]-a[0])*(b[0]-a[0]) + (p[1]-a[1])*(b[1]-a[1])) / ((b[0]-a[0])**2 + (b[1]-a[1])**2);
    t = Math.max(0, Math.min(1, t));
    const proj = L.latLng(a[0] + t*(b[0]-a[0]), a[1] + t*(b[1]-a[1]));
    return lp.distanceTo(proj);
}

function getDistanceFromPath(point, path) {
    let min = Infinity;
    const p = [point.lat, point.lng];
    for (let i = 0; i < path.length - 1; i++) {
        const d = pointToSegmentDist(p, path[i], path[i+1]);
        if (d < min) min = d;
    }
    return min / 1000;
}

function isNearPath(point, path, toleranceKm) {
    return getDistanceFromPath(point, path) <= toleranceKm;
}

function getClosestVertexIndex(point, path) {
    const p = L.latLng(point.lat, point.lng);
    let minD = Infinity, idx = -1;
    for (let i = 0; i < path.length; i++) {
        const d = p.distanceTo(L.latLng(path[i][0], path[i][1]));
        if (d < minD) { minD = d; idx = i; }
    }
    return idx;
}

function getDistanceBadge(distKm) {
    if (distKm < 1.5) return `<div class="dist-badge dist-green">⚡ < 1 km walk</div>`;
    if (distKm < 5) return `<div class="dist-badge dist-yellow">🚶 ~${distKm.toFixed(1)} km walk</div>`;
    return `<div class="dist-badge dist-red">🚗 ~${distKm.toFixed(1)} km off</div>`;
}

// Auth & init
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        try {
            const q = query(collection(db, "rides"), where("driver_id", "==", user.uid), where("status", "==", "scheduled"));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                document.body.classList.add('loaded');
                document.getElementById('driver-restriction-modal').style.display = 'flex';
                return;
            }
        } catch (e) { console.error(e); }
        document.body.classList.add('loaded');
        initMapLogic();
    } else {
        window.location.href = "login.html";
    }
});

function initMapLogic() {
    map = L.map('map', { zoomControl: false }).setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OSM &copy; CARTO', maxZoom: 19
    }).addTo(map);

    setupAutocomplete('origin', (coords) => {
        originCoords = coords;
        updateMapMarkers(coords, 'origin');
        calcPassengerRoute();
    });
    setupAutocomplete('destination', (coords) => {
        destCoords = coords;
        updateMapMarkers(coords, 'dest');
        calcPassengerRoute();
    });
}

window.getCurrentLocation = async function() {
    if (!navigator.geolocation) return;
    const input = document.getElementById('origin');
    input.value = "Locating...";
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        originCoords = { lat, lng };
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
            const data = await res.json();
            input.value = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        } catch (e) { input.value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
        updateMapMarkers(originCoords, 'origin');
        calcPassengerRoute();
    });
};

// Search logic
document.getElementById('search-btn').addEventListener('click', async () => {
    const originTxt = document.getElementById('origin').value;
    const destTxt = document.getElementById('destination').value;
    const timeVal = document.getElementById('pickup-time').value;
    const flexMinutes = parseInt(document.getElementById('time-flexibility').value);
    const radiusKm = parseInt(document.getElementById('search-radius').value);
    const container = document.getElementById('rides-list');

    if (!originTxt || !destTxt) { alert("Please enter both locations."); return; }
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;">Searching...</div>';
    setPanelState('full');

    try {
        if (!originCoords || !destCoords) {
            // Geocode text inputs via Nominatim
            const gc = async (text) => {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&countrycodes=in&limit=1`);
                const data = await res.json();
                return data.length > 0 ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null;
            };
            if (!originCoords) originCoords = await gc(originTxt);
            if (!destCoords) destCoords = await gc(destTxt);
            if (!originCoords || !destCoords) {
                container.innerHTML = '<div class="empty-state">Location error. Select valid locations.</div>';
                return;
            }
        }

        const q = query(collection(db, "rides"), where("status", "==", "scheduled"));
        const snapshot = await getDocs(q);
        const rides = [];

        let userTargetTime = new Date();
        if (timeVal) { const [h, m] = timeVal.split(':'); userTargetTime.setHours(h, m, 0, 0); }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.driver_id === currentUser.uid) return;
            if (data.seats_available <= 0) return;

            const rideDate = new Date(data.date_time.seconds * 1000);
            if (flexMinutes < 9999) {
                const diffMins = Math.abs(rideDate - userTargetTime) / 60000;
                if (diffMins > flexMinutes) return;
            }

            if (!data.route_polyline) return;
            const path = decodePolyline(data.route_polyline);

            const isOriginNear = isNearPath(originCoords, path, radiusKm);
            const isDestNear = isNearPath(destCoords, path, radiusKm);

            if (isOriginNear && isDestNear) {
                const pickupIdx = getClosestVertexIndex(originCoords, path);
                const dropIdx = getClosestVertexIndex(destCoords, path);
                if (pickupIdx < dropIdx) {
                    const distFromPickup = getDistanceFromPath(originCoords, path);
                    const distFromDrop = getDistanceFromPath(destCoords, path);
                    rides.push({ id: docSnap.id, ...data, distFromPickup, distFromDrop });
                }
            }
        });

        container.innerHTML = '';
        if (rides.length === 0) {
            container.innerHTML = `<div class="empty-state"><div style="font-size:3rem; margin-bottom:10px;">😕</div>No rides found within ${radiusKm}km.<br><small>Try increasing the radius.</small></div>`;
        } else {
            rides.sort((a, b) => a.date_time.seconds - b.date_time.seconds);
            rides.forEach(ride => {
                const dateObj = new Date(ride.date_time.seconds * 1000);
                const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const dateStr = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                const avatarSrc = ride.driver_photo || `https://ui-avatars.com/api/?name=${ride.driver_name}&background=333&color=fff`;
                container.innerHTML += `
                    <div class="ride-card" onclick="
                        const params = new URLSearchParams({ id:'${ride.id}', olat:${originCoords.lat}, olng:${originCoords.lng}, dlat:${destCoords.lat}, dlng:${destCoords.lng} });
                        window.location.href='ride-details.html?'+params.toString();
                    ">
                        <div class="ride-time-row">
                            <div><div class="time-val">${timeStr} <span style="font-size:0.8rem;color:#888;">(${dateStr})</span></div>${getDistanceBadge(ride.distFromPickup)}</div>
                            <div style="color:#666">➜</div>
                            <div style="text-align:right"><div class="time-val">~${Math.round(ride.duration_seconds/3600)}h</div>${getDistanceBadge(ride.distFromDrop)}</div>
                        </div>
                        <div class="driver-row">
                            <div class="driver-info">
                                <img src="${avatarSrc}" class="driver-avatar">
                                <div><div style="font-weight:600;font-size:0.9rem;">${ride.driver_name}</div><div style="font-size:0.75rem;color:#888;">${ride.car_model}</div></div>
                            </div>
                            <div style="text-align:right;"><div class="price-tag">₹${ride.price_per_seat}</div><button class="btn-details">View Details</button></div>
                        </div>
                    </div>`;
            });
        }
    } catch (error) {
        console.error("Search failed:", error);
        container.innerHTML = '<div class="empty-state">Error searching rides. Try again.</div>';
    }
});

// Panel logic
const handle = document.getElementById('drag-handle');
const panel = document.getElementById('results-container');
let stateIndex = 1;
const states = ['min', 'half', 'full'];

function setPanelState(s) {
    panel.classList.remove('h-min', 'h-half', 'h-full');
    if (s === 'min') { stateIndex = 0; panel.classList.add('h-min'); }
    else if (s === 'half') { stateIndex = 1; panel.classList.add('h-half'); }
    else { stateIndex = 2; panel.classList.add('h-full'); }
}

handle.addEventListener('click', () => {
    if (stateIndex === 1) setPanelState('full');
    else if (stateIndex === 2) setPanelState('half');
    else setPanelState('half');
});

let startY;
handle.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, {passive: true});
handle.addEventListener('touchend', (e) => {
    const diff = startY - e.changedTouches[0].clientY;
    if (diff > 50 && stateIndex < 2) setPanelState(states[stateIndex + 1]);
    else if (diff < -50 && stateIndex > 0) setPanelState(states[stateIndex - 1]);
}, {passive: true});
