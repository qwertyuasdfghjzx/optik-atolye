// Copyright 2023 MediaPipe & Malgorzata Pick
// FINAL PRO: 3 Eksenli Hassas Ayar (Genişlik, Yükseklik, Konum)

import React, { Fragment, useEffect, useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { FaceMesh, FACEMESH_LEFT_IRIS, FACEMESH_RIGHT_IRIS } from "@mediapipe/face_mesh";
import Info from "../../components/info/Info";
import GlassesSelect from "../GlassesSelect"; 

const WebcamImg = () => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  
  // --- REFLER (Hafıza) ---
  const calibrationDataRef = useRef(null); 
  const latestDataRef = useRef({ pd: 0, left: 0, right: 0, hLeft: 0, hRight: 0 });
  const pdBufferRef = useRef([]); 
  const BUFFER_SIZE = 30; 

  // --- AYAR STATE'LERİ (Ref ile senkronize) ---
  // w: Genişlik Çarpanı, h: Yükseklik Çarpanı, y: Dikey Kaydırma (Piksel)
  const [boxSettings, setBoxSettings] = useState({ w: 1.0, h: 1.0, y: 0 });
  const boxSettingsRef = useRef({ w: 1.0, h: 1.0, y: 0 });

  // Ayar değişince hem State (UI) hem Ref (Loop) güncellenir
  const updateBox = (key, value) => {
      const val = parseFloat(value);
      const newSettings = { ...boxSettingsRef.current, [key]: val };
      setBoxSettings(newSettings);
      boxSettingsRef.current = newSettings;
  };

  const [appState, setAppState] = useState("home");
  const [imgSrc, setImgSrc] = useState(null);
  const [facingMode, setFacingMode] = useState("user"); 
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  const [displayPD, setDisplayPD] = useState("--");     
  const [displayLeft, setDisplayLeft] = useState("--"); 
  const [displayRight, setDisplayRight] = useState("--"); 
  const [calibrationData, setCalibrationData] = useState(null);

  const [uiStatus, setUiStatus] = useState({ message: "YÜZ ARANIYOR...", color: "red", isReady: false });
  const [finalResult, setFinalResult] = useState({ pd: "--", left: "--", right: "--", hLeft: "--", hRight: "--" });

  const handleFrameSelect = (data) => {
      setCalibrationData(data);
      calibrationDataRef.current = data;
      // Yeni gözlük seçince ayarları sıfırla (veya varsayılan yap)
      updateBox('w', 1.0);
      updateBox('h', 1.0);
      updateBox('y', 0);
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

  // Smoothing (Veri Yumuşatma)
  const updateSmoothedData = (newPD, newLeft, newRight, hLeft, hRight) => {
    if (!newPD || newPD < 40 || newPD > 80 || isNaN(newPD)) return;
    if (latestDataRef.current.pd > 0 && Math.abs(newPD - latestDataRef.current.pd) > 5) return; 

    pdBufferRef.current.push({ pd: newPD, left: newLeft, right: newRight, hl: hLeft, hr: hRight });
    if (pdBufferRef.current.length > BUFFER_SIZE) pdBufferRef.current.shift();

    const sortedBuffer = [...pdBufferRef.current].sort((a, b) => a.pd - b.pd);
    let validData = sortedBuffer;
    if (sortedBuffer.length > 6) validData = sortedBuffer.slice(2, -2);
    
    const count = validData.length;
    if (count === 0) return;

    const total = validData.reduce((acc, curr) => ({
        pd: acc.pd + curr.pd, left: acc.left + curr.left, right: acc.right + curr.right,
        hl: acc.hl + curr.hl, hr: acc.hr + curr.hr
      }), { pd: 0, left: 0, right: 0, hl:0, hr:0 });

    latestDataRef.current = {
        pd: (total.pd / count).toFixed(1), left: (total.left / count).toFixed(1),
        right: (total.right / count).toFixed(1), heightLeft: (total.hl / count).toFixed(1),
        heightRight: (total.hr / count).toFixed(1)
    };
    setDisplayPD(latestDataRef.current.pd);
    setDisplayLeft(latestDataRef.current.left);
    setDisplayRight(latestDataRef.current.right);
  };

  const checkPosition = (pupilLeft, pupilRight, avgIrisWidthPx, canvasWidth) => {
    const eyeYDiff = Math.abs(pupilLeft.y - pupilRight.y);
    const maxTilt = 15; 
    const isMobile = canvasWidth < 600;
    const minRatio = isMobile ? 0.04 : 0.025; 
    const maxRatio = isMobile ? 0.12 : 0.045;
    const minIrisSize = canvasWidth * minRatio; 
    const maxIrisSize = canvasWidth * maxRatio; 
    
    let msg = "", clr = "red", ready = false;
    if (eyeYDiff > maxTilt) { msg = "DİK TUTUN"; clr = "#FFC107"; } 
    else if (avgIrisWidthPx < minIrisSize) { msg = "YAKLAŞIN"; clr = "#FFC107"; } 
    else if (avgIrisWidthPx > maxIrisSize) { msg = "UZAKLAŞIN"; clr = "red"; } 
    else { msg = "HAZIR"; clr = "#00FF00"; ready = true; }
    setUiStatus({ message: msg, color: clr, isReady: ready });
  };

  // --- MEDIAPIPE ---
  useEffect(() => {
    if (appState !== "camera") return;

    const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    
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

        const lIris1 = toPx(landmarks[FACEMESH_LEFT_IRIS[0][0]]);
        const lIris2 = toPx(landmarks[FACEMESH_LEFT_IRIS[2][0]]);
        const rIris1 = toPx(landmarks[FACEMESH_RIGHT_IRIS[0][0]]);
        const rIris2 = toPx(landmarks[FACEMESH_RIGHT_IRIS[2][0]]);

        const pupilLeft = { x: (lIris1.x + lIris2.x)/2, y: (lIris1.y + lIris2.y)/2 };
        const pupilRight = { x: (rIris1.x + rIris2.x)/2, y: (rIris1.y + rIris2.y)/2 };
        
        const avgIrisWidthPx = (getDistance(lIris1, lIris2) + getDistance(rIris1, rIris2)) / 2;
        checkPosition(pupilLeft, pupilRight, avgIrisWidthPx, videoWidth);

        // --- HESAPLAMA VE AYARLAR ---
        const calData = calibrationDataRef.current; 
        const settings = boxSettingsRef.current; // Güncel ayarları al

        let mmPerPixel = 0;
        const lCheek = toPx(landmarks[234]);
        const rCheek = toPx(landmarks[454]);
        
        // 1. Ayarlanan genişliği hesapla
        // (Şakak mesafesi * Kullanıcının Genişlik Çarpanı)
        const visualFrameWidthPx = getDistance(lCheek, rCheek) * settings.w;

        if (calData && calData.width) {
            mmPerPixel = calData.width / visualFrameWidthPx;
        } else {
            mmPerPixel = 11.7 / avgIrisWidthPx;
        }

        const totalPD = getDistance(pupilLeft, pupilRight) * mmPerPixel;
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

        // --- ÇİZİMLER ---
        
        canvasCtx.strokeStyle = "#00FF00";
        canvasCtx.lineWidth = 3;
        [pupilLeft, pupilRight].forEach(p => {
            canvasCtx.beginPath();
            canvasCtx.moveTo(p.x - 15, p.y); canvasCtx.lineTo(p.x + 15, p.y);
            canvasCtx.moveTo(p.x, p.y - 15); canvasCtx.lineTo(p.x, p.y + 15);
            canvasCtx.stroke();
        });

        canvasCtx.fillStyle = "red";
        canvasCtx.beginPath();
        canvasCtx.arc(noseTip.x, noseTip.y, 5, 0, 2 * Math.PI);
        canvasCtx.fill();

        // 🔥 AYARLANABİLİR KIRMIZI KUTU 🔥
        if (calData && calData.width) {
            canvasCtx.strokeStyle = "rgba(255, 0, 0, 0.9)";
            canvasCtx.lineWidth = 4;
            
            // Merkez Noktası (Gözlerin ortası + Kullanıcının Y Ayarı)
            const centerX = (pupilLeft.x + pupilRight.x) / 2;
            const centerY = ((pupilLeft.y + pupilRight.y) / 2) + settings.y; // Y ekseninde kaydırma
            
            // Boyutlar (Genişlik ve Yükseklik Ayarları)
            const boxW = visualFrameWidthPx;
            // Standart oran 0.35, kullanıcı 'h' ile bunu çarpıyor
            const boxH = boxW * 0.35 * settings.h; 

            canvasCtx.strokeRect(centerX - boxW/2, centerY - boxH/2, boxW, boxH);
            
            // Kılavuz yazısı
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


  // Actions
  const capturePhoto = () => {
    const frozenData = latestDataRef.current;
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

  const resetPhoto = () => {
    setImgSrc(null);
    setAppState("camera");
  };

  // Styles
  const fullScreenContainer = { 
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
      backgroundColor: 'black', display: 'flex', flexDirection: 'column', 
      overflow: 'hidden' 
  };
  const scrollableContainer = { ...fullScreenContainer, overflowY: 'auto', justifyContent: 'flex-start' };
  const videoContainerStyle = { position: 'relative', width: '100%', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', overflow: 'hidden' };
  const videoCanvasStyle = { position: 'absolute', width: '100%', height: '100%', objectFit: 'contain' };

  // Slider Stil
  const sliderStyle = {
      width: '100%', accentColor: '#D4AF37', cursor: 'pointer', margin: '5px 0'
  };
  const labelStyle = {
      color: 'white', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between'
  };

  return (
    <Fragment>
      <div className="app-root">
        
        {/* 1. HOME */}
        {appState === "home" && (
          <div style={{...fullScreenContainer, justifyContent: 'center', alignItems: 'center'}}>
            <img src={process.env.PUBLIC_URL + "/images/logo.png"} alt="Logo" style={{ width: '150px', height: '150px', objectFit: 'contain', marginBottom: '20px' }} />
            <h2 style={{color: '#D4AF37'}}>Dijital Optik Ölçüm</h2>
            <button onClick={() => setAppState("info")} style={{padding: '15px 40px', fontSize: '1.2rem', backgroundColor: '#D4AF37', border: 'none', borderRadius: '30px', fontWeight: 'bold', marginTop: '20px', cursor: 'pointer'}}>BAŞLA</button>
          </div>
        )}

        {/* 2. INFO */}
        {appState === "info" && (
          <div style={scrollableContainer}>
             <div style={{padding: '20px', paddingBottom: '100px'}}>
                <Info />
                <button onClick={() => setAppState("camera")} style={{width: '100%', padding: '20px', fontSize: '1.2rem', backgroundColor: '#D4AF37', border: 'none', borderRadius: '10px', fontWeight: 'bold', marginTop: '20px', cursor: 'pointer', boxShadow: '0 0 15px rgba(212, 175, 55, 0.5)'}}>KAMERAYI AÇ VE ÖLÇ</button>
             </div>
          </div>
        )}

        {/* 3. CAMERA */}
        {appState === "camera" && (
          <div style={fullScreenContainer}>
            <div style={videoContainerStyle}>
              {!isModelLoaded && (
                  <div style={{position: 'absolute', zIndex: 100, color: '#D4AF37', textAlign: 'center'}}>
                      <h3>Yapay Zeka Başlatılıyor...</h3>
                  </div>
              )}

              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', backgroundColor: 'rgba(0,0,0,0.6)', padding: '10px', zIndex: 60, textAlign: 'center' }}>
                  <h2 style={{ color: uiStatus.color, margin: 0, fontSize: '1.2rem', textShadow: '0 2px 4px black', fontWeight: 'bold' }}>{uiStatus.message}</h2>
              </div>

              {/* GÖZLÜK SEÇİMİ */}
              <div style={{position: 'absolute', top: '50px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '400px', zIndex: 50}}>
                  <GlassesSelect onFrameSelect={handleFrameSelect} />
              </div>

              {/* 🔥 3 EKSENLİ HASSAS AYAR PANELİ 🔥 */}
              {calibrationData && calibrationData.width && (
                  <div style={{
                      position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', 
                      width: '90%', maxWidth: '400px', zIndex: 55, 
                      backgroundColor: 'rgba(0,0,0,0.8)', padding: '10px', borderRadius: '10px',
                      border: '1px solid #444'
                  }}>
                      <div style={{textAlign: 'center', color: '#D4AF37', fontWeight: 'bold', marginBottom: '5px', fontSize: '0.9rem'}}>HASSAS AYAR</div>
                      
                      {/* Genişlik */}
                      <div style={labelStyle}><span>↔ Genişlik</span></div>
                      <input type="range" min="0.8" max="1.3" step="0.005" 
                         value={boxSettings.w} onChange={(e) => updateBox('w', e.target.value)} style={sliderStyle} />

                      {/* Yükseklik */}
                      <div style={labelStyle}><span>↕ Yükseklik</span></div>
                      <input type="range" min="0.5" max="1.5" step="0.01" 
                         value={boxSettings.h} onChange={(e) => updateBox('h', e.target.value)} style={sliderStyle} />

                      {/* Konum (Y) */}
                      <div style={labelStyle}><span>↨ Konum</span></div>
                      <input type="range" min="-100" max="100" step="1" 
                         value={boxSettings.y} onChange={(e) => updateBox('y', e.target.value)} style={sliderStyle} />
                  </div>
              )}

              <Webcam key={facingMode} ref={webcamRef} videoConstraints={videoConstraints} audio={false} mirrored={facingMode === "user"} screenshotFormat="image/jpeg" style={videoCanvasStyle} />
              <canvas ref={canvasRef} style={videoCanvasStyle}></canvas>
            </div>
              
            {/* FOOTER */}
            <div style={{ width: '100%', padding: '10px', background: '#111', zIndex: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', borderTop: '1px solid #333' }}>
                <div style={{ marginBottom: '5px', textAlign: 'center' }}>
                    <span style={{ fontSize: "1.8rem", fontWeight: "bold", color: uiStatus.isReady ? "#00FF00" : "#555" }}>{displayPD}</span>
                    <span style={{ fontSize: "0.9rem", color: "white" }}> mm</span>
                </div>
                <div style={{display: 'flex', gap: '10px', width: '100%', maxWidth: '400px'}}>
                    <button onClick={capturePhoto} disabled={!uiStatus.isReady} style={{ flex: 2, height: '45px', backgroundColor: uiStatus.isReady ? '#FFC107' : '#333', color: uiStatus.isReady ? 'black' : '#666', border: 'none', fontSize: '1rem', fontWeight: 'bold', borderRadius: '10px' }}>ÇEK</button>
                    <button onClick={toggleCamera} style={{ flex: 1, height: '45px', backgroundColor: "#333", color: "white", border: "1px solid #555", borderRadius: "10px", fontSize: '0.8rem' }}>ÇEVİR</button>
                </div>
            </div>
          </div>
        )}

        {/* 4. RESULT */}
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
              <button onClick={() => { setImgSrc(null); setAppState("camera"); }} style={{ width: '100%', padding: '15px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '12px', fontSize: '1.1rem' }}>YENİ ÖLÇÜM</button>
            </div>
          </div>
        )}

      </div>
    </Fragment>
  );
};

export default WebcamImg;