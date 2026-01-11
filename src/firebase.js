import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // <--- BU EKSİK OLABİLİR

const firebaseConfig = {
  // Buradaki kodlar senin kendi kodların olacak, değiştirme
  apiKey: "AIzaSyArnoBvHhTHFO9zcNrkdqKeLM4O_KgeL_s",
  authDomain: "optik-atolye.firebaseapp.com",
  projectId: "optik-atolye",
  storageBucket: "optik-atolye.firebasestorage.app",
  messagingSenderId: "390554164646",
  appId: "1:390554164646:web:ac9c51e508b9cec3604367",
  measurementId: "G-430298VD2G"
};

const app = initializeApp(firebaseConfig);

// Dışarı aktarılanlar (App.js bunları kullanıyor)
export const auth = getAuth(app);
export const db = getFirestore(app); // <--- HATANIN SEBEBİ BU SATIRIN EKSİK OLMASI