// Copyright 2023 MediaPipe & Malgorzata Pick
// ENGINEERING MODE: %100 Referans Nesne Tabanlı Ölçüm
// Formül: (Veritabanı MM / Kutu Piksel) * PD Piksel

import React, { Fragment, useEffect, useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { FaceMesh, FACEMESH_LEFT_IRIS, FACEMESH_RIGHT_IRIS } from "@mediapipe/face_mesh";
import Info from "../../components/info/Info";
import GlassesSelect from "../GlassesSelect"; 

const WebcamImg = () => {
  // --- TEMEL REFERANSLAR ---
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  
  // Döngü içinde anlık erişim için
  const calibrationDataRef = useRef(null); 
  const boxSettingsRef = useRef({ w: 1.1, h: 1.0, y: 0 }); // w: Genişlik, h: Yükseklik, y: Konum

  // Veri Stabilizasyonu
  const latestDataRef = useRef({ pd: 0, left: 0, right: 0, hLeft: 0, hRight: 0 });
  const pdBufferRef = useRef([]); 
  const BUFFER_SIZE = 15; 

  // --- STATE (GÖRÜNÜM) ---
  const [appState, setAppState] = useState("home");
  const [imgSrc, setImgSrc] = useState(null);
  const [facingMode, setFacingMode] = useState("user"); 
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  // Ekranda Görünenler
  const [displayPD, setDisplayPD] = useState("--");     
  const [calibrationData, setCalibrationData] = useState(null);
  const [boxSettings, setBoxSettings] = useState({ w: 1.1, h: 1.0, y: 0 });

  const [uiStatus, setUiStatus] = useState({ message: "YÜZ ARANIYOR...", color: "red", isReady: false });
  const [finalResult, setFinalResult] = useState({ pd: "--", left: "--", right: "--", hLeft: "--", hRight: "--" });

  // --- FONKSİYONLAR ---

  const handleFrameSelect = (data) => {
      setCalibrationData(data);
      calibrationDataRef.current = data;
      // Gözlük seçilince ayarları sıfırla
      const def = { w: 1.1, h: 1.0, y: 0 };
      setBoxSettings(def);
      boxSettingsRef.current = def;
  };

  const updateBox = (key, value) => {
      const val = parseFloat(value);
      const newSettings = { ...boxSettingsRef.current, [key]: val };
      setBoxSettings(newSettings);
      boxSettingsRef.current = newSettings;
  };

  const toggleCamera = useCallback(() => {
    pdBufferRef.current = [];
    setDisplayPD("--");
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
  }, []);

  const videoConstraints = {
    width: { ideal: 640 }, height: { ideal: 480 },
    facingMode: facingMode
  };

  const getDistance = (p1, p2) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  // Smoothing (Sonuç titremesin diye ortalama alma)
  const updateSmoothedData = (newPD, newLeft, newRight, hLeft, hRight) => {
    if (!newPD || isNaN(newPD) || newPD < 40 || newPD > 80) return;
    
    // Ani sıçrama filtresi
    if (latestDataRef.current.pd > 0 && Math.abs(newPD - latestDataRef.current.pd) > 10) return; 

    pdBufferRef.current.push({ pd: newPD, left: newLeft, right: newRight, hl: hLeft, hr: hRight });
    if (pdBufferRef.current.length > BUFFER_SIZE) pdBufferRef.current.shift();

    const count = pdBufferRef.current.length;
    if (count < 5) return; 

    const total = pdBufferRef.current.reduce((acc, curr) => ({
        pd: acc.pd + curr.pd, left: acc.left + curr.left, right: acc.right + curr.right,
        hl: acc.hl + curr.hl, hr: acc.hr + curr.hr
    }), { pd: 0, left: 0, right: 0, hl:0, hr:0 });

    latestDataRef.current = {
        pd: (total.pd / count).toFixed(1),
        left: (total.left / count).toFixed(1),
        right: (total.right / count).toFixed(1),
        heightLeft: (total.hl / count).toFixed(1),
        heightRight: (total.hr / count).toFixed(1)
    };
    setDisplayPD(latestDataRef.current.pd);
  };

  // Mesafe ve Açı Kontrolü
  const checkPosition = (pupilLeft, pupilRight, faceWidthPx, canvasWidth) => {
    const eyeYDiff = Math.abs(pupilLeft.y - pupilRight.y);
    const maxTilt = 15; 
    
    // Yüzün ekranda kapladığı alan (Mobilde %35-70 arası ideal)
    const ratio = faceWidthPx / canvasWidth;
    
    let msg = "", clr = "red", ready = false;

    if (eyeYDiff > maxTilt) { 
        msg = "Kafayı Düz Tut"; 
        clr = "#FFC107"; 
    } 
    else if (ratio < 0.35) { 
        msg = "Yaklaş"; 
        clr = "#FFC107"; 
    } 
    else if (ratio > 0.70) { 
        msg = "Uzaklaş"; 
        clr = "red"; 
    } 
    else { 
        msg = "Mükemmel"; 
        clr = "#00FF00"; 
        ready = true; 
    }
    
    setUiStatus({ message: msg, color: clr, isReady: ready });
  };

  // --- MEDIAPIPE CORE ---
  useEffect(() => {
    if (appState !== "camera") return;

    const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    
    faceMesh.setOptions({
        maxNumFaces: 1, refineLandmarks: true, 
        minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 
    });
    
    faceMesh.onResults((results) => {
      setIsModelLoaded(true);
      if (appState !== "camera") return;

      const canvasElement = canvasRef.current;
      const videoElement = webcamRef.current?.video;
      if (!canvasElement || !videoElement) return;

      const videoWidth = videoElement.videoWidth;
      const videoHeight = videoElement.videoHeight;
      canvasElement.width = videoWidth;
      canvasElement.height = videoHeight;
      const canvasCtx = canvasElement.getContext("2d");
      
      canvasCtx.save(); 
      canvasCtx.clearRect(0, 0, videoWidth, videoHeight);
      if (facingMode === "user") {
        canvasCtx.translate(videoWidth, 0);
        canvasCtx.scale(-1, 1);
      }
      canvasCtx.drawImage(results.image, 0, 0, videoWidth, videoHeight);

      if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
        const landmarks = results.multiFaceLandmarks[0];
        const toPx = (lm) => ({ x: lm.x * videoWidth, y: lm.y * videoHeight });

        // Temel Noktalar
        const pupilLeft = toPx(landmarks[468]);
        const pupilRight = toPx(landmarks[473]);
        const lCheek = toPx(landmarks[234]);
        const rCheek = toPx(landmarks[454]);
        
        // Ham Yüz Genişliği (Piksel)
        const rawFaceWidthPx = getDistance(lCheek, rCheek);
        checkPosition(pupilLeft, pupilRight, rawFaceWidthPx, videoWidth);

        // --- HESAPLAMA MANTIĞI (SENİN İSTEDİĞİN MÜHENDİSLİK KISMI) ---
        const calData = calibrationDataRef.current; 
        const settings = boxSettingsRef.current;
        let mmPerPixel = 0;
        
        // 1. Kırmızı Kutunun Ekranda Kapladığı Piksel (Kullanıcı Ayarladı)
        // rawFaceWidthPx sadece kutunun kafayla beraber hareket etmesini sağlar.
        // Asıl boyut 'settings.w' (Slider) ile belirlenir.
        const boxPixelWidth = rawFaceWidthPx * settings.w; 

        if (calData && calData.width) {
            // MÜHENDİSLİK FORMÜLÜ:
            // Gerçek MM / Ekran Pikseli = Ölçek
            mmPerPixel = calData.width / boxPixelWidth;
        }

        if (mmPerPixel > 0) {
            // PD Hesapla
            const pdPx = getDistance(pupilLeft, pupilRight);
            const totalPD = pdPx * mmPerPixel;
            
            // Diğer Ölçümler
            const noseTip = toPx(landmarks[1]);
            const noseBridge = toPx(landmarks[168]);
            const distLeftPx = getDistance(pupilLeft, noseBridge);
            const distRightPx = getDistance(pupilRight, noseBridge);
            const totalNosePx = distLeftPx + distRightPx;
            
            const hLeftPx = Math.abs(noseTip.y - pupilLeft.y);
            const hRightPx = Math.abs(noseTip.y - pupilRight.y);

            updateSmoothedData(
                totalPD, 
                totalPD * (distLeftPx / totalNosePx), 
                totalPD * (distRightPx / totalNosePx), 
                hLeftPx * mmPerPixel, 
                hRightPx * mmPerPixel
            );
        }

        // --- ÇİZİMLER ---
        
        // 1. KIRMIZI KUTU (Referans)
        if (calData && calData.width) {
            canvasCtx.strokeStyle = "rgba(255, 0, 0, 0.9)";
            canvasCtx.lineWidth = 3;
            
            // Kutunun Merkezi = İki gözün ortası + Y Kaydırma
            const centerX = (pupilLeft.x + pupilRight.x) / 2;
            const centerY = ((pupilLeft.y + pupilRight.y) / 2) + settings.y;
            
            const boxW = boxPixelWidth;
            const boxH = boxW * 0.35 * settings.h; // Gözlük oranı

            canvasCtx.strokeRect(centerX - boxW/2, centerY - boxH/2, boxW, boxH);
            
            // Genişlik Bilgisi (Kullanıcıya Doğru Yaptığını Göstermek İçin)
            canvasCtx.fillStyle = "red";
            canvasCtx.font = "bold 14px Arial";
            canvasCtx.textAlign = "center";
            canvasCtx.save();
            const textY = centerY - boxH/2 - 10;
            const label = `Gözlük: ${calData.width}mm`;
            if(facingMode === "user") {
                 canvasCtx.translate(centerX, textY);
                 canvasCtx.scale(-1, 1);
                 canvasCtx.fillText(label, 0, 0);
            } else {
                 canvasCtx.fillText(label, centerX, textY);
            }
            canvasCtx.restore();
        }

        // 2. Göz Bebekleri
        canvasCtx.strokeStyle = "#00FF00";
        canvasCtx.lineWidth = 2;
        [pupilLeft, pupilRight].forEach(p => {
            canvasCtx.beginPath();
            canvasCtx.arc(p.x, p.y, 4, 0, 2*Math.PI);
            canvasCtx.stroke();
        });

        // 3. Montaj Yüksekliği Çizgileri (Cyan)
        const noseTip = toPx(landmarks[1]); 
        canvasCtx.strokeStyle = "cyan";
        canvasCtx.lineWidth = 2;
        canvasCtx.beginPath();
        // Sol Dikey
        canvasCtx.moveTo(pupilLeft.x, pupilLeft.y); canvasCtx.lineTo(pupilLeft.x, noseTip.y);
        // Sağ Dikey
        canvasCtx.moveTo(pupilRight.x, pupilRight.y); canvasCtx.lineTo(pupilRight.x, noseTip.y);
        // Yatay
        canvasCtx.moveTo(pupilLeft.x - 20, noseTip.y); canvasCtx.lineTo(pupilRight.x + 20, noseTip.y);
        canvasCtx.stroke();

      } else {
          setUiStatus({ isReady: false, message: "YÜZ ARANIYOR...", color: "red" });
      }
      canvasCtx.restore(); 
    });

    const runDetection = async () => {
      if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
        try { await faceMesh.send({ image: webcamRef.current.video }); } catch (e) {}
      }
      if (appState === "camera") requestRef.current = requestAnimationFrame(runDetection);
    };
    requestRef.current = requestAnimationFrame(runDetection);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      faceMesh.close();
    };
  }, [facingMode, appState]);

  // --- AKSİYONLAR ---
  const capturePhoto = () => {
    const frozenData = latestDataRef.current;
    if (!frozenData || frozenData.pd === 0 || frozenData.pd === "--") {
        alert("Lütfen önce yüzünüzü tanıtın.");
        return;
    }
    setFinalResult({
        pd: frozenData.pd, left: frozenData.left, right: frozenData.right,
        hLeft: frozenData.heightLeft, hRight: frozenData.heightRight
    });
    if(canvasRef.current) {
        const data = canvasRef.current.toDataURL("image/jpeg", 0.9);
        setImgSrc(data);
        setAppState("result");
    }
  };

  const resetPhoto = () => { setImgSrc(null); setAppState("camera"); };

  // --- STYLES ---
  const fullScreen = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'black', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
  const scrollable = { ...fullScreen, overflowY: 'auto', justifyContent: 'flex-start' };
  const videoContainer = { position: 'relative', width: '100%', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', overflow: 'hidden' };
  const absFull = { position: 'absolute', width: '100%', height: '100%', objectFit: 'contain' };
  const sliderRow = { display: 'flex', alignItems: 'center', marginBottom: '5px', color: 'white', fontSize: '0.75rem' };
  const sliderInput = { flex: 1, marginLeft: '5px', accentColor: '#D4AF37', cursor: 'pointer' };
  const bigBtnStyle = { padding: '15px 40px', fontSize: '1.2rem', backgroundColor: '#D4AF37', border: 'none', borderRadius: '30px', fontWeight: 'bold', marginTop: '20px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' };

  return (
    <Fragment>
      <div className="app-root">
        {appState === "home" && (
          <div style={{...fullScreen, justifyContent: 'center', alignItems: 'center'}}>
            <img src={process.env.PUBLIC_URL + "/images/logo.png"} alt="Logo" style={{ width: '150px', height: '150px', objectFit: 'contain', marginBottom: '20px' }} />
            <h2 style={{color: '#D4AF37'}}>Dijital Optik Ölçüm</h2>
            <button onClick={() => setAppState("info")} style={bigBtnStyle}>BAŞLA</button>
          </div>
        )}

        {appState === "info" && (
          <div style={scrollable}>
             <div style={{padding: '20px', paddingBottom: '100px', minHeight: '100%'}}>
                <Info />
                <button onClick={() => setAppState("camera")} style={{...bigBtnStyle, width: '100%', borderRadius: '10px', boxShadow: '0 0 15px rgba(212, 175, 55, 0.5)'}}>KAMERAYI AÇ VE ÖLÇ</button>
             </div>
          </div>
        )}

        {appState === "camera" && (
          <div style={fullScreen}>
            <div style={videoContainer}>
              {!isModelLoaded && <div style={{position: 'absolute', zIndex: 100, color: '#D4AF37'}}><h3>Başlatılıyor...</h3></div>}

              {/* Üst Uyarı */}
              <div style={{position: 'absolute', top: 0, left: 0, width: '100%', padding: '5px', background: 'rgba(0,0,0,0.6)', zIndex: 60, textAlign: 'center'}}>
                  <span style={{color: uiStatus.color, fontWeight: 'bold', fontSize: '1rem'}}>{uiStatus.message}</span>
              </div>

              {/* Gözlük Seçimi */}
              <div style={{position: 'absolute', top: '40px', left: '50%', transform: 'translateX(-50%)', width: '95%', maxWidth: '400px', zIndex: 50}}>
                  <GlassesSelect onFrameSelect={handleFrameSelect} />
              </div>

              {/* HASSAS AYAR PANELI (Sliderlar) */}
              {calibrationData && calibrationData.width && (
                  <div style={{position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '400px', zIndex: 55, backgroundColor: 'rgba(0,0,0,0.6)', padding: '5px', borderRadius: '8px', border: '1px solid #444'}}>
                      <div style={sliderRow}>
                          <span style={{width: '60px'}}>↔ Genişlik</span>
                          <input type="range" min="0.8" max="1.4" step="0.002" value={boxSettings.w} onChange={(e) => updateBox('w', e.target.value)} style={sliderInput} />
                      </div>
                      <div style={sliderRow}>
                          <span style={{width: '60px'}}>↕ Yükseklik</span>
                          <input type="range" min="0.5" max="1.5" step="0.01" value={boxSettings.h} onChange={(e) => updateBox('h', e.target.value)} style={sliderInput} />
                      </div>
                      <div style={sliderRow}>
                          <span style={{width: '60px'}}>↨ Konum</span>
                          <input type="range" min="-100" max="100" step="1" value={boxSettings.y} onChange={(e) => updateBox('y', e.target.value)} style={sliderInput} />
                      </div>
                  </div>
              )}

              <Webcam key={facingMode} ref={webcamRef} videoConstraints={videoConstraints} audio={false} mirrored={facingMode === "user"} screenshotFormat="image/jpeg" style={absFull} />
              <canvas ref={canvasRef} style={absFull}></canvas>
            </div>
              
            {/* Alt Panel */}
            <div style={{ width: '100%', padding: '10px', background: '#111', zIndex: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', borderTop: '1px solid #333' }}>
                <div style={{ marginBottom: '5px', textAlign: 'center' }}>
                    <span style={{ fontSize: "1.8rem", fontWeight: "bold", color: uiStatus.isReady ? "#00FF00" : "#555" }}>{displayPD}</span>
                    <span style={{ fontSize: "0.9rem", color: "white" }}> mm</span>
                </div>
                <div style={{display: 'flex', gap: '10px', width: '100%', maxWidth: '400px'}}>
                    <button onClick={capturePhoto} style={{ flex: 2, height: '50px', backgroundColor: '#FFC107', color: 'black', border: 'none', fontSize: '1rem', fontWeight: 'bold', borderRadius: '10px' }}>ÇEK</button>
                    <button onClick={toggleCamera} style={{ flex: 1, height: '50px', backgroundColor: "#333", color: "white", border: "1px solid #555", borderRadius: "10px", fontSize: '0.8rem' }}>ÇEVİR</button>
                </div>
            </div>
          </div>
        )}

        {appState === "result" && imgSrc && (
          <div style={{...fullScreen, overflowY: 'auto', justifyContent: 'flex-start'}}>
            <div style={{ width: '100%', height: '50vh', backgroundColor: 'black', display: 'flex', justifyContent: 'center' }}>
              <img src={imgSrc} alt="screenshot" style={{ height: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ width: '100%', padding: '20px', backgroundColor: '#1a1a1a', minHeight: '50vh' }}>
              <h3 style={{color: '#FFC107', textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: '10px'}}>SONUÇLAR</h3>
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
              <button onClick={resetPhoto} style={{ width: '100%', padding: '15px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '12px', fontSize: '1.1rem' }}>YENİ ÖLÇÜM</button>
            </div>
          </div>
        )}
      </div>
    </Fragment>
  );
};

export default WebcamImg;