# 🚗 Waymate - Connect. Ride. Save.

[![Render Deployment](https://img.shields.io/badge/Render-Deployed-brightgreen?logo=render&logoColor=white)](https://render.com)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%26%20Firestore-orange?logo=firebase&logoColor=white)](https://firebase.google.com)
[![Leaflet](https://img.shields.io/badge/Leaflet-Interactive%20Maps-199900?logo=leaflet&logoColor=white)](https://leafletjs.com)
[![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-Nominatim-7EBC6F?logo=openstreetmap&logoColor=white)](https://www.openstreetmap.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A modern, high-performance urban carpooling and ride-sharing web platform. Waymate connects daily commuters heading in the same direction, reducing traffic congestion, carbon footprints, and travel expenses through intelligent geospatial routing and instant ride coordination.

---

## ✨ Key Features

- 🗺️ **Intelligent Route Matching**: Interactive geospatial routing powered by **Leaflet**, **OpenStreetMap (Nominatim)** autocomplete search, and **OpenRouteService** polyline decoders.
- 🔐 **Firebase Authentication**: One-click Google OAuth sign-in and session persistence with Firebase Auth.
- ⚡ **Real-time Firestore Database**: Instant ride updates, dynamic seat counts, driver offers, and passenger booking confirmations.
- 🚗 **Offer a Ride**: Drivers can set origin, destination, intermediate checkpoints, departure timestamps, seat capacity, and price per seat.
- 🔍 **Find a Ride**: Passengers can search for rides based on pickup and drop-off coordinates with radius filtering.
- 🟢 **Live Ride Tracking**: Dedicated ongoing ride dashboard with live route status and passenger verification.
- 💎 **Ultra-Modern Glassmorphism UI**: High-end dark aesthetic with responsive layouts, micro-animations, animated gradient blobs, and mobile optimization.
- ☁️ **Cloud-Ready for Render**: Preconfigured for instant deployment on **Render.com** (as a high-speed **Static Site** or a **Python Web Service**).

---

## 📁 Project Structure

```text
Waymate/
├── index.html            # Landing page with active ride detection & hero navigation
├── login.html            # Glassmorphic Google OAuth login portal
├── find-ride.html        # Ride discovery interface
├── find-ride-map.js      # Map engine, route matching & geocoding for search
├── offer-ride.html       # Ride publishing form for drivers
├── my-rides.html         # User dashboard (upcoming, offered & booked rides)
├── ongoing-ride.html     # Active in-transit ride tracking
├── ongoing-ride-map.js   # Live route mapping engine
├── ride-details.html     # Ride inspection & booking confirmation modal
├── ride-details-map.js   # Individual route preview map
├── profile.html          # User profile & account details
├── about-us.html         # Mission, vision, and team overview
├── contact-us.html       # Contact form & communication channels
├── support.html          # Help center & FAQ
├── firebase-config.js    # Firebase app initialization configuration
├── server.py             # Zero-dependency Python HTTP server with MIME detection & healthcheck
├── render.yaml           # Render Infrastructure Blueprint configuration
├── Procfile              # Render Web Service process runner
├── requirements.txt      # Python environment specification
├── package.json          # Node/NPM runner scripts
└── .gitignore            # Git exclusion rules
```

---

## 🚀 Running Locally

### Option 1: Python (Recommended - No dependencies)
```bash
python server.py
```
Open your browser at **[http://localhost:8080](http://localhost:8080)**.

### Option 2: Node.js / NPX
```bash
npx serve -s . -l 8080
```

### Option 3: VS Code Live Server
Right-click on `index.html` and choose **"Open with Live Server"**.

---

## 🌐 Deploying to Render.com

You can deploy Waymate to Render in two ways:

### Method A: Deploy as a Static Site (Recommended — 100% Free & Fast)

1. Push your repository to GitHub:
   ```bash
   git push -u origin main
   ```
2. Log in to **[dashboard.render.com](https://dashboard.render.com)**.
3. Click **New +** ➔ **Static Site**.
4. Connect your **`Waymate`** GitHub repository.
5. Set the following fields:
   - **Name**: `waymate` (or your choice)
   - **Branch**: `main`
   - **Build Command**: *(leave blank)*
   - **Publish Directory**: `.`
6. Click **Create Static Site**. Your site will be live within seconds on a free `https://<app-name>.onrender.com` domain with global CDN and SSL!

### Method B: Deploy as a Web Service (Python)

If you prefer a Web Service container:
1. On **[dashboard.render.com](https://dashboard.render.com)**, click **New +** ➔ **Web Service**.
2. Connect your **`Waymate`** repository.
3. Render will automatically detect the **`Procfile`** and **`server.py`**:
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python server.py`
4. Click **Deploy Web Service**.

---

## 🔑 Firebase Configuration Note

When deploying to Render (or any custom domain):
1. Navigate to the **[Firebase Console](https://console.firebase.google.com)**.
2. Select your project: **`waymate-lite`**.
3. Go to **Authentication** ➔ **Settings** ➔ **Authorized domains**.
4. Click **Add domain** and enter your Render URL (e.g. `waymate.onrender.com`).
5. This ensures Google Sign-In popups work seamlessly on your live hosted domain.

---

## 📄 License

This project is licensed under the MIT License.
