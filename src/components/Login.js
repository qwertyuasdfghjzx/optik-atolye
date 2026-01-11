import React, { useState } from "react";
import { auth, db } from "../firebase"; // db'nin geldiğinden emin oluyoruz
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore"; 

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");

  const handleAuth = async (e) => {
    e.preventDefault();
    setError("");
    
    try {
      if (isRegistering) {
        // --- KAYIT OLMA ---
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        console.log("Kullanıcı oluştu, DB'ye yazılıyor...", user.uid);

        // Veritabanına yazma işlemi
        try {
            await setDoc(doc(db, "users", user.uid), {
                email: user.email,
                isApproved: false, // Varsayılan: ONAYSIZ
                createdAt: new Date().toISOString()
            });
            console.log("DB'ye başarıyla yazıldı!");
        } catch (dbError) {
            console.error("Veritabanı yazma hatası:", dbError);
            alert("Kullanıcı oluştu ama veritabanı hatası: " + dbError.message);
        }

        // Kayıt bitince formu sıfırla ama giriş yapmış sayılır
        // App.js otomatik yakalayıp ödeme ekranına atacak.

      } else {
        // --- GİRİŞ YAPMA ---
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      console.error("Auth hatası:", err);
      setError(err.message);
    }
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", backgroundColor: "#0d0d0d", color: "#D4AF37" }}>
      <div style={{ border: "2px solid #D4AF37", padding: "30px", borderRadius: "15px", width: "80%", maxWidth: "350px", backgroundColor: "#1a1a1a", textAlign: "center" }}>
        <h2 style={{marginTop: 0}}>{isRegistering ? "Kayıt Ol" : "Giriş Yap"}</h2>
        {error && <p style={{color: "red", fontSize: "0.9rem"}}>{error}</p>}
        <form onSubmit={handleAuth} style={{display: "flex", flexDirection: "column", gap: "15px"}}>
          <input type="email" placeholder="E-Posta" value={email} onChange={(e) => setEmail(e.target.value)} required style={{padding: "10px", borderRadius: "5px", border: "1px solid #333", backgroundColor: "#333", color: "white"}} />
          <input type="password" placeholder="Şifre" value={password} onChange={(e) => setPassword(e.target.value)} required style={{padding: "10px", borderRadius: "5px", border: "1px solid #333", backgroundColor: "#333", color: "white"}} />
          <button type="submit" style={{ padding: "12px", borderRadius: "5px", border: "none", backgroundColor: "#D4AF37", color: "black", fontWeight: "bold", cursor: "pointer" }}>
            {isRegistering ? "KAYIT OL" : "GİRİŞ YAP"}
          </button>
        </form>
        <p onClick={() => setIsRegistering(!isRegistering)} style={{marginTop: "20px", fontSize: "0.9rem", cursor: "pointer", textDecoration: "underline"}}>
          {isRegistering ? "Giriş Yap" : "Hesap Oluştur"}
        </p>
      </div>
    </div>
  );
};

export default Login;