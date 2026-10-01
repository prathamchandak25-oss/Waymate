// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

const firebaseConfig = {
    apiKey: "AIzaSyAT_fMHzNocimPK-J_tg1o17DJhsOHvkmI",
    authDomain: "waymate-lite.firebaseapp.com",
    projectId: "waymate-lite",
    storageBucket: "waymate-lite.firebasestorage.app",
    messagingSenderId: "1042384720469",
    appId: "1:1042384720469:web:2d08663d062e615d5c3adc"
};

// EXPORT the app so login.html can use it
export const app = initializeApp(firebaseConfig);