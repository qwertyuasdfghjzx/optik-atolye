// Copyright 2023 MediaPipe & Malgorzata Pick
// ULTRA FULL "UNCOMPRESSED" VERSION
// Tüm özellikler açık, kısaltma yok.

import React, { Fragment, useEffect, useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import {
  FaceMesh,
  FACEMESH_LEFT_IRIS,
  FACEMESH_RIGHT_IRIS,
} from "@mediapipe/face_mesh";
import Info from "../../components/info/Info";
import GlassesSelect from "../GlassesSelect"; 

const WebcamImg = () => {
  // --------------------------------------------------------------------------
  // 1. DEĞİŞKENLER VE REFERANSLAR
  // --------------------------------------------------------------------------
  
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  
  // Döngü (Loop) içinde verilere anlık erişmek için Ref kullanıyoruz
  const calibrationDataRef = useRef(null); 
  
  // 3 Eksenli Ayar İçin Ref (Genişlik, Yükseklik, Y-Konum)
  const boxSettingsRef = useRef({ w: 1.0, h: 1.0, y: 0 });

  // Veri Yumuşatma (Smoothing) için hafıza
  const latestDataRef = useRef({ pd: 0, left: 0, right: 0, hLeft: 0, hRight: 0 });
  const pdBufferRef = useRef([]); 
  const BUFFER_SIZE = 30; 

  // --- STATE (ARAYÜZ DURUMLARI) ---
  
  // Uygulama hangi ekranda? 'home' | 'info' | 'camera' | 'result'
  const [appState, setAppState] = useState("home");

  const [imgSrc, setImgSrc] = useState(null);
  const [facingMode, setFacingMode] = useState("user"); 
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  // Ekranda gösterilen sayılar
  const [displayPD, setDisplayPD] = useState("--");     
  const [displayLeft, setDisplayLeft] = useState("--"); 
  const [displayRight, setDisplayRight] = useState("--"); 
  
  // Gözlük Verisi (UI için)
  const [calibrationData, setCalibrationData] = useState(null);

  // 3 Slider Değerleri (UI için)
  const [boxSettings, setBoxSettings] = useState({ w: 1.0, h: 1.0, y: 0 });

  // Uyarı Mesajları
  const [uiStatus, setUiStatus] = useState({ 
    message: "YÜZ ARANIYOR...", 
    color: "red", 
    isReady: false 
  });

  // Sonuç Ekranı Verileri
  const [finalResult, setFinalResult] = useState({ 
    pd: "--", left: "--", right: "--", hLeft: "--", hRight: "--" 
  });

  // --------------------------------------------------------------------------
  // 2. YARDIMCI FONKSİYONLAR
  // --------------------------------------------------------------------------

  // Gözlük seçildiğinde çalışır
  const handleFrameSelect = (data) => {
      setCalibrationData(data); // State güncelle (UI görsün)
      calibrationDataRef.current = data; // Ref güncelle (Hesaplama görsün)
      
      // Ayarları sıfırla (Yeni gözlük seçince varsayılana dön)
      const defaultSettings = { w: 1.0, h: 1.0, y: 0 };
      setBoxSettings(defaultSettings);
      boxSettingsRef.current = defaultSettings;
  };

  // Slider değiştiğinde çalışır
  const updateBox = (key, value) => {
      const val = parseFloat(value);
      const newSettings = { ...boxSettingsRef.current, [key]: val };
      
      setBoxSettings(newSettings); // UI güncelle
      boxSettingsRef.current = newSettings; // Ref güncelle (Anlık çizim için)
  };

  // Kamerayı Çevir (Ön/Arka)
  const toggleCamera = useCallback(() => {
    pdBufferRef.current = [];
    setDisplayPD("--");
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
  }, []);

  const videoConstraints = {
    width: { ideal: 640 },
    height: { ideal: 480 },
    facingMode: facingMode
  };

  // İki nokta arası mesafe formülü
  const getDistance = (p1, p2) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  // Veri Yumuşatma (Smoothing Algorithm)
  const updateSmoothedData = (newPD, newLeft, newRight, hLeft, hRight) => {
    // Filtre 1: Mantıksız değerleri at
    if (!newPD || newPD < 40 || newPD > 80 || isNaN(newPD)) return;
    
    // Filtre 2: Ani sıçramaları at
    if (latestDataRef.current.pd > 0 && Math.abs(newPD - latestDataRef.current.pd) > 5) return; 

    // Buffer'a ekle
    pdBufferRef.current.push({ pd: newPD, left: newLeft, right: newRight, hl: hLeft, hr: hRight });
    
    // Buffer dolduysa en eskiyi sil
    if (pdBufferRef.current.length > BUFFER_SIZE) pdBufferRef.current.shift();

    // Outlier temizliği (En uç değerleri at)
    const sortedBuffer = [...pdBufferRef.current].sort((a, b) => a.pd - b.pd);
    let validData = sortedBuffer;
    if (sortedBuffer.length > 6) {
        validData = sortedBuffer.slice(2, -2);
    }
    
    const count = validData.length;
    if (count === 0) return;

    // Ortalamayı al
    const total = validData.reduce((acc, curr) => ({
        pd: acc.pd + curr.pd,
        left: acc.left + curr.left,
        right: acc.right + curr.right,
        hl: acc.hl + curr.hl,
        hr: acc.hr + curr.hr
      }), { pd: 0, left: 0, right: 0, hl:0, hr:0 });

    // Referansı güncelle
    latestDataRef.current = {
        pd: (total.pd / count).toFixed(1),
        left: (total.left / count).toFixed(1),
        right: (total.right / count).toFixed(1),
        heightLeft: (total.hl / count).toFixed(1),
        heightRight: (total.hr / count).toFixed(1)
    };

    // Ekrana bas
    setDisplayPD(latestDataRef.current.pd);
    setDisplayLeft(latestDataRef.current.left);
    setDisplayRight(latestDataRef.current.right);
  };

  // Pozisyon Kontrolü (Uzaklaş / Yaklaş)
  const checkPosition = (pupilLeft, pupilRight, avgIrisWidthPx, canvasWidth) => {
    const eyeYDiff = Math.abs(pupilLeft.y - pupilRight.y);
    const maxTilt = 15; // Tolerans
    
    // Mobil ekran kontrolü
    const isMobile = canvasWidth < 600;
    const minRatio = isMobile ? 0.04 : 0.025; 
    const maxRatio = isMobile ? 0.12 : 0.045;
    
    const minIrisSize = canvasWidth * minRatio; 
    const maxIrisSize = canvasWidth * maxRatio; 
    
    let msg = "", clr = "red", ready = false;

    if (eyeYDiff > maxTilt) { 
        msg = "DİK TUTUN"; 
        clr = "#FFC107"; // Sarı
    } 
    else if (avgIrisWidthPx < minIrisSize) { 
        msg = "YAKLAŞIN"; 
        clr = "#FFC107"; 
    } 
    else if (avgIrisWidthPx > maxIrisSize) { 
        msg = "UZAKLAŞIN"; 
        clr = "red"; 
    } 
    else { 
        msg = "HAZIR"; 
        clr = "#00FF00"; // Yeşil
        ready = true; 
    }
    
    setUiStatus({ message: msg, color: clr, isReady: ready });
  };

  // --------------------------------------------------------------------------
  // 3. MEDIAPIPE FACE MESH DÖNGÜSÜ
  // --------------------------------------------------------------------------
  useEffect(() => {
    // Eğer kamera ekranında değilsek modeli çalıştırma
    if (appState !== "camera") return;

    const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    
    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5 
    });
    
    faceMesh.onResults((results) => {
      setIsModelLoaded(true);

      // Ekran değiştiyse çizimi durdur
      if (appState !== "camera") return;

      const canvasElement = canvasRef.current;
      const videoElement = webcamRef.current?.video;
      
      if (!canvasElement || !videoElement) return;

      // Boyutları Eşitle
      const videoWidth = videoElement.videoWidth;
      const videoHeight = videoElement.videoHeight;
      canvasElement.width = videoWidth;
      canvasElement.height = videoHeight;
      
      const canvasCtx = canvasElement.getContext("2d");
      
      // Temizle
      canvasCtx.save(); 
      canvasCtx.clearRect(0, 0, videoWidth, videoHeight);
      
      // Aynalama (Mirror)
      if (facingMode === "user") {
        canvasCtx.translate(videoWidth, 0);
        canvasCtx.scale(-1, 1);
      }
      
      // A) Videoyu Çiz
      canvasCtx.drawImage(results.image, 0, 0, videoWidth, videoHeight);

      // B) Yüz Bulunduysa Çizimleri Yap
      if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
        const landmarks = results.multiFaceLandmarks[0];
        const toPx = (lm) => ({ x: lm.x * videoWidth, y: lm.y * videoHeight });

        // Göz Noktaları
        const lIris1 = toPx(landmarks[FACEMESH_LEFT_IRIS[0][0]]);
        const lIris2 = toPx(landmarks[FACEMESH_LEFT_IRIS[2][0]]);
        const rIris1 = toPx(landmarks[FACEMESH_RIGHT_IRIS[0][0]]);
        const rIris2 = toPx(landmarks[FACEMESH_RIGHT_IRIS[2][0]]);

        const pupilLeft = { x: (lIris1.x + lIris2.x)/2, y: (lIris1.y + lIris2.y)/2 };
        const pupilRight = { x: (rIris1.x + rIris2.x)/2, y: (rIris1.y + rIris2.y)/2 };
        
        const avgIrisWidthPx = (getDistance(lIris1, lIris2) + getDistance(rIris1, rIris2)) / 2;
        
        // Mesafe Kontrolü
        checkPosition(pupilLeft, pupilRight, avgIrisWidthPx, videoWidth);

        // --- HESAPLAMA MOTORU ---
        const calData = calibrationDataRef.current; 
        const settings = boxSettingsRef.current; // Slider ayarlarını oku

        let mmPerPixel = 0;
        
        // Yüz Genişliği Referans Noktaları (Şakaklar)
        const lCheek = toPx(landmarks[234]);
        const rCheek = toPx(landmarks[454]);
        
        // Slider W (Genişlik) çarpanını burada kullanıyoruz
        const visualFrameWidthPx = getDistance(lCheek, rCheek) * settings.w;

        // Senaryo 1: Gözlük Seçili (Kutu Modu)
        if (calData && calData.width) {
            mmPerPixel = calData.width / visualFrameWidthPx;
        } 
        // Senaryo 2: Gözlük Yok (İris Modu)
        else {
            mmPerPixel = 11.7 / avgIrisWidthPx;
        }

        // PD Hesapla
        const totalDistancePx = getDistance(pupilLeft, pupilRight);
        const totalPD = totalDistancePx * mmPerPixel;
        
        // Burun ve Köprü Hesapla
        const noseBridge = toPx(landmarks[168]);
        const distLeftPx = getDistance(pupilLeft, noseBridge);
        const distRightPx = getDistance(pupilRight, noseBridge);
        const totalNosePx = distLeftPx + distRightPx;
        
        const noseTip = toPx(landmarks[1]); 
        
        updateSmoothedData(
            totalPD, 
            totalPD * (distLeftPx / totalNosePx), 
            totalPD * (distRightPx / totalNosePx), 
            Math.abs(noseTip.y - pupilLeft.y) * mmPerPixel, 
            Math.abs(noseTip.y - pupilRight.y) * mmPerPixel
        );

        // --- ÇİZİMLER (CANVAS) ---

        // 1. Göz Bebekleri (Yeşil Artı)
        canvasCtx.strokeStyle = "#00FF00";
        canvasCtx.lineWidth = 3;
        [pupilLeft, pupilRight].forEach(p => {
            canvasCtx.beginPath();
            canvasCtx.moveTo(p.x - 15, p.y); canvasCtx.lineTo(p.x + 15, p.y);
            canvasCtx.moveTo(p.x, p.y - 15); canvasCtx.lineTo(p.x, p.y + 15);
            canvasCtx.stroke();
        });

        // 2. Burun Ucu (Kırmızı Nokta)
        canvasCtx.fillStyle = "red";
        canvasCtx.beginPath();
        canvasCtx.arc(noseTip.x, noseTip.y, 5, 0, 2 * Math.PI);
        canvasCtx.fill();

        // 3. KIRMIZI HİZALAMA KUTUSU (Slider ile kontrol edilen)
        if (calData && calData.width) {
            canvasCtx.strokeStyle = "rgba(255, 0, 0, 0.9)";
            canvasCtx.lineWidth = 4;
            
            // Merkez: Gözlerin ortası + Kullanıcının Y ayarı
            const centerX = (pupilLeft.x + pupilRight.x) / 2;
            const centerY = ((pupilLeft.y + pupilRight.y) / 2) + settings.y;
            
            // Boyutlar: Slider W ve H ayarları
            const boxW = visualFrameWidthPx;
            const boxH = boxW * 0.35 * settings.h; 

            // Kutuyu Çiz
            canvasCtx.strokeRect(centerX - boxW/2, centerY - boxH/2, boxW, boxH);
            
            // "ÇERÇEVE" Yazısı
            canvasCtx.fillStyle = "red";
            canvasCtx.font = "bold 16px Arial";
            canvasCtx.textAlign = "center";
            
            canvasCtx.save();
            const textY = centerY - boxH/2 - 10;
            if(facingMode === "user") {
                 canvasCtx.translate(centerX, textY);
                 canvasCtx.scale(-1, 1);
                 canvasCtx.fillText("ÇERÇEVE", 0, 0);
            } else {
                 canvasCtx.fillText("ÇERÇEVE", centerX, textY);
            }
            canvasCtx.restore();
        }

      } else {
          // Yüz yoksa durumu bildir
          setUiStatus({ isReady: false, message: "YÜZ ARANIYOR...", color: "red" });
      }

      canvasCtx.restore(); 
    });

    const runDetection = async () => {
      if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
        try { await faceMesh.send({ image: webcamRef.current.video }); } catch (e) {}
      }
      if (appState === "camera") {
         requestRef.current = requestAnimationFrame(runDetection);
      }
    };
    requestRef.current = requestAnimationFrame(runDetection);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      faceMesh.close();
    };
  }, [facingMode, appState]);


  // --------------------------------------------------------------------------
  // 4. BUTON AKSİYONLARI
  // --------------------------------------------------------------------------

  const capturePhoto = () => {
    // Sonuçları dondur
    const frozenData = latestDataRef.current;
    setFinalResult({
        pd: frozenData.pd, left: frozenData.left, right: frozenData.right,
        hLeft: frozenData.heightLeft, hRight: frozenData.heightRight
    });
    
    // Canvas görüntüsünü al
    if(canvasRef.current) {
        const data = canvasRef.current.toDataURL("image/jpeg", 0.9);
        setImgSrc(data);
        setAppState("result"); // Sonuç ekranına geç
    }
  };

  const resetPhoto = () => {
    setImgSrc(null);
    setAppState("camera"); // Kameraya dön
  };

  // --------------------------------------------------------------------------
  // 5. STİLLER (CSS Objects)
  // --------------------------------------------------------------------------
  
  const fullScreenContainer = { 
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
      backgroundColor: 'black', display: 'flex', flexDirection: 'column', 
      overflow: 'hidden' 
  };
  
  const scrollableContainer = { 
      ...fullScreenContainer, 
      overflowY: 'auto', 
      justifyContent: 'flex-start' 
  };
  
  const videoContainerStyle = { 
      position: 'relative', width: '100%', flex: 1, 
      display: 'flex', justifyContent: 'center', alignItems: 'center', 
      backgroundColor: '#000', overflow: 'hidden' 
  };
  
  const videoCanvasStyle = { 
      position: 'absolute', width: '100%', height: '100%', 
      objectFit: 'contain' 
  };

  const sliderContainerStyle = {
      position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', 
      width: '90%', maxWidth: '400px', zIndex: 55, 
      backgroundColor: 'rgba(0,0,0,0.8)', padding: '10px', borderRadius: '10px',
      border: '1px solid #444'
  };

  const sliderRowStyle = {
      display: 'flex', alignItems: 'center', marginBottom: '5px', color: 'white', fontSize: '0.8rem'
  };

  const sliderInputStyle = {
      flex: 1, marginLeft: '10px', accentColor: '#D4AF37', cursor: 'pointer'
  };

  // --------------------------------------------------------------------------
  // 6. RENDER (GÖRÜNÜM)
  // --------------------------------------------------------------------------
  return (
    <Fragment>
      <div className="app-root">
        
        {/* --- EKRAN 1: HOME --- */}
        {appState === "home" && (
          <div style={{...fullScreenContainer, justifyContent: 'center', alignItems: 'center'}}>
            <img src={process.env.PUBLIC_URL + "/images/logo.png"} alt="Logo" style={{ width: '150px', height: '150px', objectFit: 'contain', marginBottom: '20px' }} />
            <h2 style={{color: '#D4AF37'}}>Dijital Optik Ölçüm</h2>
            <button onClick={() => setAppState("info")} style={{padding: '15px 40px', fontSize: '1.2rem', backgroundColor: '#D4AF37', border: 'none', borderRadius: '30px', fontWeight: 'bold', marginTop: '20px', cursor: 'pointer'}}>
                BAŞLA
            </button>
          </div>
        )}

        {/* --- EKRAN 2: INFO --- */}
        {appState === "info" && (
          <div style={scrollableContainer}>
             <div style={{padding: '20px', paddingBottom: '100px'}}>
                <Info />
                <button onClick={() => setAppState("camera")} style={{width: '100%', padding: '20px', fontSize: '1.2rem', backgroundColor: '#D4AF37', border: 'none', borderRadius: '10px', fontWeight: 'bold', marginTop: '20px', cursor: 'pointer', boxShadow: '0 0 15px rgba(212, 175, 55, 0.5)'}}>
                    KAMERAYI AÇ VE ÖLÇ
                </button>
             </div>
          </div>
        )}

        {/* --- EKRAN 3: CAMERA --- */}
        {appState === "camera" && (
          <div style={fullScreenContainer}>
            <div style={videoContainerStyle}>
              
              {/* Yapay Zeka Yükleniyor Mesajı */}
              {!isModelLoaded && (
                  <div style={{position: 'absolute', zIndex: 100, color: '#D4AF37', textAlign: 'center'}}>
                      <h3>Yapay Zeka Başlatılıyor...</h3>
                      <p>Lütfen bekleyin</p>
                  </div>
              )}

              {/* Üst Uyarı Bandı */}
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', backgroundColor: 'rgba(0,0,0,0.6)', padding: '10px', zIndex: 60, textAlign: 'center' }}>
                  <h2 style={{ color: uiStatus.color, margin: 0, fontSize: '1.2rem', textShadow: '0 2px 4px black', fontWeight: 'bold' }}>{uiStatus.message}</h2>
              </div>

              {/* Gözlük Seçim Componenti */}
              <div style={{position: 'absolute', top: '50px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '400px', zIndex: 50}}>
                  <GlassesSelect onFrameSelect={handleFrameSelect} />
              </div>

              {/* --- 3 EKSENLİ SLIDER PANELI (Sadece Gözlük Seçiliyse Görünür) --- */}
              {calibrationData && calibrationData.width && (
                  <div style={sliderContainerStyle}>
                      <div style={{textAlign: 'center', color: '#D4AF37', fontWeight: 'bold', marginBottom: '5px', fontSize: '0.9rem'}}>HASSAS AYAR</div>
                      
                      {/* Genişlik Slider */}
                      <div style={sliderRowStyle}>
                          <span style={{width: '70px'}}>↔ Genişlik</span>
                          <input type="range" min="0.8" max="1.3" step="0.005" 
                             value={boxSettings.w} onChange={(e) => updateBox('w', e.target.value)} style={sliderInputStyle} />
                      </div>

                      {/* Yükseklik Slider */}
                      <div style={sliderRowStyle}>
                          <span style={{width: '70px'}}>↕ Yükseklik</span>
                          <input type="range" min="0.5" max="1.5" step="0.01" 
                             value={boxSettings.h} onChange={(e) => updateBox('h', e.target.value)} style={sliderInputStyle} />
                      </div>

                      {/* Konum (Y) Slider */}
                      <div style={sliderRowStyle}>
                          <span style={{width: '70px'}}>↨ Konum</span>
                          <input type="range" min="-100" max="100" step="1" 
                             value={boxSettings.y} onChange={(e) => updateBox('y', e.target.value)} style={sliderInputStyle} />
                      </div>
                  </div>
              )}

              {/* Kamera ve Canvas */}
              <Webcam key={facingMode} ref={webcamRef} videoConstraints={videoConstraints} audio={false} mirrored={facingMode === "user"} screenshotFormat="image/jpeg" style={videoCanvasStyle} />
              <canvas ref={canvasRef} style={videoCanvasStyle}></canvas>
            </div>
              
            {/* Alt Kontrol Paneli */}
            <div style={{ width: '100%', padding: '10px', background: '#111', zIndex: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', borderTop: '1px solid #333' }}>
                <div style={{ marginBottom: '5px', textAlign: 'center' }}>
                    <span style={{ fontSize: "1.8rem", fontWeight: "bold", color: uiStatus.isReady ? "#00FF00" : "#555" }}>{displayPD}</span>
                    <span style={{ fontSize: "0.9rem", color: "white" }}> mm</span>
                </div>
                <div style={{display: 'flex', gap: '10px', width: '100%', maxWidth: '400px'}}>
                    <button onClick={capturePhoto} disabled={!uiStatus.isReady} style={{ flex: 2, height: '45px', backgroundColor: uiStatus.isReady ? '#FFC107' : '#333', color: uiStatus.isReady ? 'black' : '#666', border: 'none', fontSize: '1rem', fontWeight: 'bold', borderRadius: '10px' }}>
                        ÇEK
                    </button>
                    <button onClick={toggleCamera} style={{ flex: 1, height: '45px', backgroundColor: "#333", color: "white", border: "1px solid #555", borderRadius: "10px", fontSize: '0.8rem' }}>
                        ÇEVİR
                    </button>
                </div>
            </div>
          </div>
        )}

        {/* --- EKRAN 4: RESULT (SONUÇ) --- */}
        {appState === "result" && imgSrc && (
          <div style={{...fullScreenContainer, overflowY: 'auto', justifyContent: 'flex-start'}}>
            <div style={{ width: '100%', height: '50vh', backgroundColor: 'black', display: 'flex', justifyContent: 'center' }}>
              <img src={imgSrc} alt="screenshot" style={{ height: '100%', objectFit: 'contain' }} />
            </div>
            
            <div style={{ width: '100%', padding: '20px', backgroundColor: '#1a1a1a', minHeight: '50vh' }}>
              <h3 style={{color: '#FFC107', textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: '10px'}}>ÖLÇÜM SONUÇLARI</h3>
              
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px'}}>
                  <div style={{backgroundColor: '#222', padding: '15px', borderRadius: '8px', textAlign: 'center'}}>
                      <div style={{color: '#aaa', fontSize: '0.8rem'}}>SOL GÖZ</div>
                      <div style={{color: 'white', fontSize: '1.2rem', margin: '5px 0'}}>PD: <b>{finalResult.left}</b></div>
                      <div style={{color: '#FFC107', fontSize: '0.9rem'}}>Yük: <b>{finalResult.hLeft}</b></div>
                  </div>
                  <div style={{backgroundColor: '#222', padding: '15px', borderRadius: '8px', textAlign: 'center'}}>
                      <div style={{color: '#aaa', fontSize: '0.8rem'}}>SAĞ GÖZ</div>
                      <div style={{color: 'white', fontSize: '1.2rem', margin: '5px 0'}}>PD: <b>{finalResult.right}</b></div>
                      <div style={{color: '#FFC107', fontSize: '0.9rem'}}>Yük: <b>{finalResult.hRight}</b></div>
                  </div>
              </div>

              <div style={{textAlign: 'center', marginBottom: '30px'}}>
                  <span style={{color: '#aaa', marginRight: '10px'}}>Toplam PD:</span>
                  <span style={{color: 'white', fontSize: '2rem', fontWeight: 'bold'}}>{finalResult.pd} mm</span>
              </div>
              
              <button onClick={resetPhoto} style={{ width: '100%', padding: '15px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '12px', fontSize: '1.1rem', cursor: 'pointer' }}>
                  YENİ ÖLÇÜM
              </button>
            </div>
          </div>
        )}

      </div>
    </Fragment>
  );
};

export default WebcamImg;