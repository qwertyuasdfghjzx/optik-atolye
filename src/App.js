import React, { Fragment, useEffect, useState } from "react";
import WebcamImg from "./components/webcamImg/WebcamImg";
import Login from "./components/Login";
import { auth, db } from "./firebase"; // db'yi de çağırdık
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore"; // Veritabanı okuma fonksiyonları

const App = () => {
  const [user, setUser] = useState(null);
  const [isApproved, setIsApproved] = useState(false); // Onay durumu (Varsayılan: Kapalı)
  const [loading, setLoading] = useState(true);

  // Veritabanından "isApproved" durumunu kontrol eden fonksiyon
  const checkUserApproval = async (uid) => {
    try {
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists() && docSnap.data().isApproved === true) {
        // Kullanıcı onaylıysa içeri al
        setIsApproved(true);
      } else {
        // Onaysızsa kapıda beklet
        setIsApproved(false);
      }
    } catch (error) {
      console.log("Kontrol hatası:", error);
      setIsApproved(false);
    }
    setLoading(false);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Kullanıcı giriş yaptıysa, hemen veritabanına sor: ONAYLI MI?
        checkUserApproval(currentUser.uid);
      } else {
        setUser(null);
        setIsApproved(false);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div style={{backgroundColor: "black", height: "100vh", color: "gold", display: "flex", justifyContent: "center", alignItems: "center"}}>Yükleniyor...</div>;

  // 1. Durum: Kullanıcı giriş yapmamışsa -> Login Ekranı
  if (!user) {
    return <Login />;
  }

  // 2. Durum: Giriş yapmış ama ONAYSIZ ise -> Ödeme Ekranı (SENDE EKSİK OLAN KISIM BURASIYDI)
  if (!isApproved) {
    return (
      <div style={{ height: "100vh", backgroundColor: "#0d0d0d", color: "#D4AF37", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "20px", textAlign: "center" }}>
        <h1 style={{fontSize: "2rem"}}>Üyelik Onayı Bekleniyor</h1>
        <p style={{color: "white", marginTop: "20px", fontSize: "1.1rem"}}>
            Uygulamayı kullanmak için abonelik onayı gerekmektedir.
        </p>
        
        <div style={{backgroundColor: "#1a1a1a", padding: "20px", borderRadius: "10px", margin: "20px 0", border: "1px solid #333"}}>
            <p style={{color: "#aaa", fontSize: "0.9rem"}}>Durum:</p>
            <p style={{color: "red", fontWeight: "bold", fontSize: "1.2rem"}}>Ödeme Bekleniyor / Onaylanmadı</p>
        </div>

        <p style={{color: "#ccc", fontSize: "0.9rem"}}>Ödeme yaptıktan sonra yönetici onayı bekleyin.</p>
        
        <button 
            onClick={() => window.location.reload()} 
            style={{ marginTop: "20px", padding: "10px 20px", backgroundColor: "#D4AF37", border: "none", borderRadius: "5px", fontWeight: "bold", cursor: "pointer" }}>
            Durumu Kontrol Et
        </button>

        <button 
            onClick={() => signOut(auth)}
            style={{ marginTop: "10px", backgroundColor: "transparent", color: "#888", border: "none", textDecoration: "underline", cursor: "pointer" }}>
            Çıkış Yap
        </button>
      </div>
    );
  }

  // 3. Durum: Giriş yapmış ve ONAYLI ise -> Kamera Ekranı
  return (
    <Fragment>
      <header
        style={{
          backgroundColor: "#0d0d0d",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 4px 10px rgba(0,0,0,0.5)",
          borderBottom: "2px solid #D4AF37",
          position: "relative",
          zIndex: 10,
        }}
      >
        <div style={{display: "flex", alignItems: "center"}}>
            <img src={process.env.PUBLIC_URL + "/images/logo.png"} alt="App Logo" style={{ width: "45px", height: "45px", objectFit: "contain", marginRight: "15px", backgroundColor: "#fff", borderRadius: "50%", border: "2px solid #D4AF37", padding: "2px" }} />
            <h1 style={{ color: "#D4AF37", margin: 0, fontSize: "1.3rem", fontWeight: "bold", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "1px" }}>
            Optik Atölye
            </h1>
        </div>
        
        <button 
            onClick={() => signOut(auth)}
            style={{ backgroundColor: "transparent", color: "white", border: "1px solid #555", padding: "5px 10px", borderRadius: "5px", fontSize: "0.8rem", cursor: "pointer" }}
        >
            Çıkış
        </button>
      </header>

      <main>
        <WebcamImg />
      </main>
    </Fragment>
  );
};

export default App;