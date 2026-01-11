// Copyright 2023 MediaPipe & Malgorzata Pick
import React, { Fragment } from "react";
import WebcamImg from "./components/webcamImg/WebcamImg";

const App = () => {
  return (
    <Fragment>
      {/* --- SİYAH & ALTIN HEADER BAŞLANGICI --- */}
      <header
        style={{
          backgroundColor: "#0d0d0d", // Mavi yerine SİYAH
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          boxShadow: "0 4px 10px rgba(0,0,0,0.5)",
          borderBottom: "2px solid #D4AF37", // Altına ALTIN çizgi
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* Sol Üstteki Logo */}
        <img
          src={process.env.PUBLIC_URL + "/images/logo.png"}
          alt="App Logo"
          style={{
            width: "45px",
            height: "45px",
            objectFit: "contain",
            marginRight: "15px",
            backgroundColor: "#fff", // Logo net görünsün diye arkası beyaz
            borderRadius: "50%",
            border: "2px solid #D4AF37", // Logonun etrafına altın halka
            padding: "2px"
          }}
        />

        {/* Uygulama Adı */}
        <h1
          style={{
            color: "#D4AF37", // Yazı rengi ALTIN
            margin: 0,
            fontSize: "1.3rem",
            fontWeight: "bold",
            fontFamily: "sans-serif",
            textTransform: "uppercase", // Havalı dursun diye büyük harf
            letterSpacing: "1px"
          }}
        >
          Optik Atölye
        </h1>
      </header>
      {/* --- HEADER BİTİŞİ --- */}

      <main>
        <WebcamImg />
      </main>
    </Fragment>
  );
};

export default App;