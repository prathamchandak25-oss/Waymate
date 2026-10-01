import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);
const ORS_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjZhZDRiNjExMDU1YjQ5MmRhOGUwNTZkYzQ0NmY3OTM2IiwiaCI6Im11cm11cjY0In0=';
const urlParams = new URLSearchParams(window.location.search);
const rideId = urlParams.get('id');
const pOLat = parseFloat(urlParams.get('olat'));
const pOLng = parseFloat(urlParams.get('olng'));
const pDLat = parseFloat(urlParams.get('dlat'));
const pDLng = parseFloat(urlParams.get('dlng'));

let currentUser = null;
let rideData = null;

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

function showError(msg) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'none';
    document.getElementById('error-msg').style.display = 'block';
    document.getElementById('error-text').innerText = msg;
}

onAuthStateChanged(auth, (user) => {
    if (user) { currentUser = user; if (rideId) loadRideDetails(); else showError("Invalid Ride Link"); }
    else window.location.href = "login.html";
});

async function loadRideDetails() {
    try {
        const docRef = doc(db, "rides", rideId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) { rideData = docSnap.data(); renderData(rideData); initMap(rideData); }
        else showError("Ride not found.");
    } catch (error) { console.error(error); showError("Permission Denied."); }
}

function renderData(data) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'flex';
    document.getElementById('d-price').innerText = data.price_per_seat || "--";
    document.getElementById('d-seats').innerText = data.seats_available || "0";
    document.getElementById('d-car-model').innerText = data.car_model || "Car";
    const driverName = data.driver_name || "Waymate User";
    document.getElementById('d-photo').src = data.driver_photo || `https://ui-avatars.com/api/?name=${driverName}&background=333&color=fff`;
    if (data.date_time && data.date_time.seconds) {
        document.getElementById('d-date').innerText = new Date(data.date_time.seconds * 1000).toLocaleDateString();
    }
}

// Modal logic
window.openJoinModal = function() {
    if (!rideData) return;
    document.getElementById('m-car').innerText = rideData.car_model;
    document.getElementById('m-note').innerText = rideData.description || "No description provided.";
    const seatSelect = document.getElementById('m-seats');
    seatSelect.innerHTML = '';
    for (let i = 1; i <= (rideData.seats_available || 1); i++) {
        const opt = document.createElement('option'); opt.value = i; opt.text = i; seatSelect.appendChild(opt);
    }
    const pps = parseInt(rideData.price_per_seat);
    const updatePrice = () => { document.getElementById('m-total').innerText = parseInt(seatSelect.value) * pps; };
    seatSelect.onchange = updatePrice; updatePrice();
    document.getElementById('join-modal').style.display = 'flex';
};

window.closeJoinModal = function() { document.getElementById('join-modal').style.display = 'none'; };

document.getElementById('btn-confirm-join').addEventListener('click', async () => {
    if (!currentUser || !rideData) return;
    const btn = document.getElementById('btn-confirm-join');
    btn.innerText = "Sending..."; btn.disabled = true;
    const seatsReq = parseInt(document.getElementById('m-seats').value);
    const priceTotal = seatsReq * parseInt(rideData.price_per_seat);
    try {
        await addDoc(collection(db, "bookings"), {
            ride_id: rideId, driver_id: rideData.driver_id,
            passenger_id: currentUser.uid, passenger_name: currentUser.displayName || "Passenger",
            passenger_photo: currentUser.photoURL, seats_requested: seatsReq, total_price: priceTotal,
            status: "pending", pickup_lat: pOLat, pickup_lng: pOLng, drop_lat: pDLat, drop_lng: pDLng,
            created_at: serverTimestamp()
        });
        alert("Request Sent!"); window.location.href = "my-rides.html";
    } catch (error) {
        console.error(error); alert("Error sending request.");
        btn.innerText = "Send Request"; btn.disabled = false;
    }
});

let totalDurationSecs = 0;
function updateDuration(secs) {
    totalDurationSecs += secs;
    const h = Math.floor(totalDurationSecs / 3600), m = Math.floor((totalDurationSecs % 3600) / 60);
    document.getElementById('d-duration').innerText = (h > 0 ? `${h} hr ` : '') + `${m} min`;
}

async function getOrsRoute(start, end, profile = 'driving-car') {
    const res = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}`, {
        method: 'POST',
        headers: { 'Authorization': ORS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: [[start.lng, start.lat], [end.lng, end.lat]] })
    });
    return await res.json();
}

async function initMap(data) {
    const map = L.map('map', { zoomControl: false }).setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OSM &copy; CARTO', maxZoom: 19
    }).addTo(map);

    if (!data.route_polyline || isNaN(pOLat)) return;

    const fullPath = decodePolyline(data.route_polyline);
    const pOrigin = { lat: pOLat, lng: pOLng };
    const pDest = { lat: pDLat, lng: pDLng };

    // Passenger request route (dashed white)
    try {
        const pRes = await getOrsRoute(pOrigin, pDest);
        if (pRes.routes && pRes.routes.length > 0) {
            const pPath = decodePolyline(pRes.routes[0].geometry);
            L.polyline(pPath, { color: '#ffffff', weight: 5, opacity: 0.4, dashArray: '10 10' }).addTo(map);
        }
    } catch (e) { console.error(e); }

    // Find closest vertices
    let startIdx = 0, endIdx = fullPath.length - 1;
    let minDS = Infinity, minDE = Infinity;
    const pO = L.latLng(pOLat, pOLng), pD = L.latLng(pDLat, pDLng);

    for (let i = 0; i < fullPath.length; i++) {
        const pt = L.latLng(fullPath[i][0], fullPath[i][1]);
        const ds = pO.distanceTo(pt), de = pD.distanceTo(pt);
        if (ds < minDS) { minDS = ds; startIdx = i; }
        if (de < minDE) { minDE = de; endIdx = i; }
    }
    if (startIdx > endIdx) { startIdx = 0; endIdx = fullPath.length - 1; }

    const matchedPath = fullPath.slice(startIdx, endIdx + 1);
    const startPt = fullPath[startIdx], endPt = fullPath[endIdx];

    // Match percentage
    let matchDist = 0;
    for (let i = 0; i < matchedPath.length - 1; i++) {
        matchDist += L.latLng(matchedPath[i][0], matchedPath[i][1]).distanceTo(L.latLng(matchedPath[i+1][0], matchedPath[i+1][1]));
    }
    const gap1Dist = pO.distanceTo(L.latLng(startPt[0], startPt[1]));
    const gap2Dist = L.latLng(endPt[0], endPt[1]).distanceTo(pD);
    const totalDist = matchDist + gap1Dist + gap2Dist;
    const pct = totalDist > 0 ? Math.round((matchDist / totalDist) * 100) : 0;

    const badgeEl = document.getElementById('d-match-score');
    badgeEl.innerText = `${pct}% Route Match`;
    badgeEl.className = 'match-badge';
    badgeEl.classList.add(pct >= 90 ? 'match-high' : pct >= 70 ? 'match-med' : 'match-low');

    // Duration
    const driverTotal = data.duration_seconds || 0;
    let fullLen = 0;
    for (let i = 0; i < fullPath.length - 1; i++) {
        fullLen += L.latLng(fullPath[i][0], fullPath[i][1]).distanceTo(L.latLng(fullPath[i+1][0], fullPath[i+1][1]));
    }
    const rideDur = (driverTotal > 0 && fullLen > 0) ? (matchDist / fullLen) * driverTotal : (matchDist / 1000) * 90;
    updateDuration(Math.round(rideDur));

    // Gap routes
    try {
        const g1 = await getOrsRoute({ lat: pOLat, lng: pOLng }, { lat: startPt[0], lng: startPt[1] }, 'foot-walking');
        if (g1.routes && g1.routes.length > 0) {
            const gPath = decodePolyline(g1.routes[0].geometry);
            L.polyline(gPath, { color: '#f87171', weight: 4 }).addTo(map);
            const dist = (g1.routes[0].summary.distance / 1000).toFixed(1);
            document.getElementById('pickup-gap-text').innerHTML = `<b>${dist} km</b> to route`;
            updateDuration(Math.round(g1.routes[0].summary.duration));
        }
    } catch (e) { console.error(e); }

    try {
        const g2 = await getOrsRoute({ lat: endPt[0], lng: endPt[1] }, { lat: pDLat, lng: pDLng }, 'foot-walking');
        if (g2.routes && g2.routes.length > 0) {
            const gPath = decodePolyline(g2.routes[0].geometry);
            L.polyline(gPath, { color: '#f87171', weight: 4 }).addTo(map);
            const dist = (g2.routes[0].summary.distance / 1000).toFixed(1);
            document.getElementById('drop-gap-text').innerHTML = `<b>${dist} km</b> from route`;
            updateDuration(Math.round(g2.routes[0].summary.duration));
        }
    } catch (e) { console.error(e); }

    // Matched path (green)
    L.polyline(matchedPath, { color: '#4ade80', weight: 6 }).addTo(map);

    // Markers
    L.circleMarker([pOLat, pOLng], { radius: 6, fillColor: '#fff', fillOpacity: 1, color: 'black', weight: 2 }).addTo(map);
    L.circleMarker([pDLat, pDLng], { radius: 6, fillColor: '#fff', fillOpacity: 1, color: 'black', weight: 2 }).addTo(map);

    // Fit bounds
    const bounds = L.latLngBounds([[pOLat, pOLng], [pDLat, pDLng]]);
    matchedPath.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, { padding: [50, 50] });
}

// Panel
const handle = document.getElementById('drag-handle');
const panel = document.getElementById('details-container');
let stateIndex = 1; const states = ['min', 'half', 'full'];
function setPanelState(s) {
    panel.classList.remove('h-min', 'h-half', 'h-full');
    if (s === 'min') { stateIndex = 0; panel.classList.add('h-min'); }
    else if (s === 'half') { stateIndex = 1; panel.classList.add('h-half'); }
    else { stateIndex = 2; panel.classList.add('h-full'); }
}
handle.addEventListener('click', () => { if (stateIndex === 1) setPanelState('full'); else if (stateIndex === 2) setPanelState('half'); else setPanelState('half'); });
let startY;
handle.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, {passive: true});
handle.addEventListener('touchend', (e) => {
    const d = startY - e.changedTouches[0].clientY;
    if (d > 50 && stateIndex < 2) setPanelState(states[stateIndex + 1]);
    else if (d < -50 && stateIndex > 0) setPanelState(states[stateIndex - 1]);
}, {passive: true});
