import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, onSnapshot, serverTimestamp, query, where, getDocs, collection } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);
const ORS_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjZhZDRiNjExMDU1YjQ5MmRhOGUwNTZkYzQ0NmY3OTM2IiwiaCI6Im11cm11cjY0In0=';
const urlParams = new URLSearchParams(window.location.search);
let rideId = urlParams.get('id');

let map, carMarker, pickupMarker, dropMarker;
let redRouteLayer = null, blueRouteLayer = null;
let currentUser = null, isDriver = false, bookingData = null;
let watchId = null, rideDocRef = null, rideOTP = null;

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

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        if (!rideId) { alert("No Ride ID."); window.location.href = "index.html"; return; }
        rideDocRef = doc(db, "rides", rideId);
        await initPage();
        document.body.classList.add('loaded');
    } else window.location.href = "login.html";
});

function generateOTP() { return Math.floor(1000 + Math.random() * 9000).toString(); }

async function initPage() {
    try {
        const docSnap = await getDoc(rideDocRef);
        if (!docSnap.exists()) { alert("Ride not found."); window.location.href = "index.html"; return; }
        const data = docSnap.data();
        isDriver = (data.driver_id === currentUser.uid);

        document.getElementById('disp-dest').innerText = data.destination;
        document.getElementById('disp-driver').innerText = data.driver_name;
        document.getElementById('disp-car').innerText = data.car_model + " (" + data.car_plate + ")";

        if (!data.ride_otp) { rideOTP = generateOTP(); await updateDoc(rideDocRef, { ride_otp: rideOTP }); }
        else rideOTP = data.ride_otp;

        let q;
        if (isDriver) q = query(collection(db, "bookings"), where("ride_id", "==", rideId), where("status", "==", "accepted"));
        else q = query(collection(db, "bookings"), where("ride_id", "==", rideId), where("passenger_id", "==", currentUser.uid));
        const bookingSnap = await getDocs(q);
        if (!bookingSnap.empty) bookingData = bookingSnap.docs[0].data();

        if (isDriver) {
            document.getElementById('status-text').innerText = "Ready to Drive";
            document.getElementById('sub-text').innerText = "Verify OTP to start ride";
            document.getElementById('driver-controls').style.display = 'block';
            if (data.is_started) toggleStartButton();
        } else {
            document.getElementById('passenger-otp-card').style.display = 'block';
            document.getElementById('passenger-otp-display').innerText = rideOTP;
            document.getElementById('status-text').innerText = "Waiting for Driver";
            document.getElementById('sub-text').innerText = "Share your OTP with the driver";
            document.getElementById('passenger-msg').style.display = 'block';
        }
        await initMap(data);
        startRideListener();
    } catch (error) { console.error("Init Error:", error); }
}

async function initMap(data) {
    map = L.map('map', { zoomControl: false }).setView([20.5937, 78.9629], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OSM &copy; CARTO', maxZoom: 19
    }).addTo(map);

    if (bookingData) {
        const pickupPos = [bookingData.pickup_lat, bookingData.pickup_lng];
        const dropPos = [bookingData.drop_lat, bookingData.drop_lng];

        // Blue route: pickup to drop
        try {
            const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
                method: 'POST',
                headers: { 'Authorization': ORS_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ coordinates: [[pickupPos[1], pickupPos[0]], [dropPos[1], dropPos[0]]] })
            });
            const d = await res.json();
            if (d.routes && d.routes.length > 0) {
                blueRouteLayer = L.polyline(decodePolyline(d.routes[0].geometry), { color: '#60a5fa', weight: 5 }).addTo(map);
            }
        } catch (e) { console.error(e); }

        pickupMarker = L.circleMarker(pickupPos, { radius: 6, fillColor: '#60a5fa', fillOpacity: 1, color: 'white', weight: 2 }).addTo(map);
        dropMarker = L.circleMarker(dropPos, { radius: 6, fillColor: '#f87171', fillOpacity: 1, color: 'white', weight: 2 }).addTo(map);
    }

    let initialPos = [20.5937, 78.9629];
    if (data.current_lat && data.current_lng) initialPos = [data.current_lat, data.current_lng];
    else if (data.route_polyline) { const p = decodePolyline(data.route_polyline); if (p.length > 0) initialPos = p[0]; }

    const carIcon = L.divIcon({
        html: '<div style="color:#4ade80;font-size:24px;text-shadow:0 0 6px rgba(74,222,128,0.5);">▲</div>',
        iconSize: [24, 24], iconAnchor: [12, 12], className: ''
    });
    carMarker = L.marker(initialPos, { icon: carIcon }).addTo(map);
    map.setView(initialPos, 15);

    if (bookingData) updateRedRoute(initialPos);
}

let lastRedCalcTime = 0;
async function updateRedRoute(driverPos) {
    if (!bookingData) return;
    const now = Date.now();
    if (now - lastRedCalcTime < 10000) return;
    lastRedCalcTime = now;
    const dp = Array.isArray(driverPos) ? driverPos : [driverPos.lat, driverPos.lng];
    const pickupPos = [bookingData.pickup_lat, bookingData.pickup_lng];
    try {
        const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
            method: 'POST',
            headers: { 'Authorization': ORS_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ coordinates: [[dp[1], dp[0]], [pickupPos[1], pickupPos[0]]] })
        });
        const d = await res.json();
        if (d.routes && d.routes.length > 0) {
            if (redRouteLayer) map.removeLayer(redRouteLayer);
            redRouteLayer = L.polyline(decodePolyline(d.routes[0].geometry), { color: '#f87171', weight: 5 }).addTo(map);
            if (!isDriver) {
                const dur = Math.round(d.routes[0].summary.duration / 60);
                document.getElementById('passenger-msg').innerHTML = `Driver is <b>${dur} min</b> away`;
            }
        }
    } catch (e) { console.error(e); }
}

// OTP logic
window.showOTPPopup = function() {
    document.getElementById('otp-overlay').classList.add('active');
    document.getElementById('otp1').focus();
    clearOTPInputs();
};
window.closeOTPPopup = function() {
    document.getElementById('otp-overlay').classList.remove('active');
    clearOTPInputs();
    document.getElementById('otp-error').style.display = 'none';
};
function clearOTPInputs() { for (let i = 1; i <= 4; i++) document.getElementById('otp' + i).value = ''; }
window.moveToNext = function(cur, nextId) { if (cur.value.length === 1 && nextId) document.getElementById(nextId).focus(); };
window.moveToPrev = function(e, cur, prevId) { if (e.key === 'Backspace' && cur.value.length === 0 && prevId) document.getElementById(prevId).focus(); };
window.verifyOTPAuto = function() { const otp = getEnteredOTP(); if (otp.length === 4) setTimeout(() => verifyOTP(), 300); };
function getEnteredOTP() { return ['otp1','otp2','otp3','otp4'].map(id => document.getElementById(id).value).join(''); }

window.verifyOTP = function() {
    const entered = getEnteredOTP();
    if (entered.length !== 4) { document.getElementById('otp-error').style.display = 'block'; document.getElementById('otp-error').innerText = 'Enter all 4 digits'; return; }
    if (entered === rideOTP) { document.getElementById('otp-error').style.display = 'none'; closeOTPPopup(); startRide(); }
    else { document.getElementById('otp-error').style.display = 'block'; document.getElementById('otp-error').innerText = 'Invalid OTP.'; clearOTPInputs(); document.getElementById('otp1').focus(); }
};

function startRide() {
    if (!navigator.geolocation) { alert("Geolocation not supported"); return; }
    toggleStartButton();
    updateDoc(rideDocRef, { is_started: true });
    watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const lat = pos.coords.latitude, lng = pos.coords.longitude, heading = pos.coords.heading || 0;
            updateMarkerPosition(lat, lng, heading);
            updateRedRoute([lat, lng]);
            updateDoc(rideDocRef, { current_lat: lat, current_lng: lng, current_heading: heading, last_updated: serverTimestamp() }).catch(console.error);
        },
        (err) => console.warn(err),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
}

function toggleStartButton() {
    document.getElementById('btn-start').style.display = 'none';
    document.getElementById('btn-complete').style.display = 'block';
    document.getElementById('status-text').innerText = "You are Driving";
    document.getElementById('sub-text').innerText = "Live tracking active";
}

window.completeRide = async () => {
    if (!confirm("Complete this ride?")) return;
    try {
        if (watchId) navigator.geolocation.clearWatch(watchId);
        await updateDoc(rideDocRef, { status: "completed", completed_at: serverTimestamp() });
        alert("Ride Completed!"); window.location.href = "my-rides.html";
    } catch (error) { console.error(error); }
};

function startRideListener() {
    onSnapshot(rideDocRef, (docSnap) => {
        if (!docSnap.exists()) { alert("Ride cancelled."); window.location.href = "my-rides.html"; return; }
        const data = docSnap.data();
        if (data.status === "completed") { alert("Ride ended."); window.location.href = "my-rides.html"; return; }
        if (data.current_lat && data.current_lng && !isDriver) {
            updateMarkerPosition(data.current_lat, data.current_lng, data.current_heading || 0);
            updateRedRoute([data.current_lat, data.current_lng]);
            if (data.is_started) {
                document.getElementById('passenger-otp-card').style.display = 'none';
                document.getElementById('status-text').innerText = "Ride in Progress";
                document.getElementById('sub-text').innerText = "Driver is on the way";
            }
        }
    });
}

function updateMarkerPosition(lat, lng, heading) {
    if (!carMarker || !map) return;
    carMarker.setLatLng([lat, lng]);
}

// Panel
const handle = document.getElementById('drag-handle');
const panel = document.getElementById('status-panel');
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
