// Copyright 2023 MediaPipe & Malgorzata Pick
// Profesyonel Sürüm - Çizimli Fotoğraf + React State Yönetimi
import React, { Fragment, useEffect, useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { FaceMesh, FACEMESH_LEFT_IRIS, FACEMESH_RIGHT_IRIS } from "@mediapipe/face_mesh";
import Info from "../../components/info/Info";
import GlassesSelect from "../GlassesSelect"; 

const WebcamImg = () => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const calibrationDataRef = useRef(null); 
  
  // Veri Havuzları
  const latestDataRef = useRef({ pd: 0, left: 0, right: 0, hLeft: 0, hRight: 0 });
  const pdBufferRef = useRef([]); 
  const BUFFER_SIZE = 30; 

  // --- EKRAN YÖNETİMİ (STATE) ---
  // 'home' | 'info' | 'camera' | 'result'
  const [appState, setAppState] = useState("home");

  const [imgSrc, setImgSrc] = useState(null);
  const [facingMode, setFacingMode] = useState("environment"); 
  const [displayPD, setDisplayPD] = useState("--");     
  const [displayLeft, setDisplayLeft] = useState("--"); 
  const [displayRight, setDisplayRight] = useState("--"); 
  const [frameScale, setFrameScale] = useState(1.0); // Slider Değeri

  const [uiStatus, setUiStatus] = useState({ message: "YÜZ ARANIYOR...", color: "red", isReady: false });
  const [finalResult, setFinalResult] = useState({ pd: "--", left: "--", right: "--", hLeft: "--", hRight: "--" });

  const toggleCamera = useCallback(() => {
    pdBufferRef.current = [];
    setDisplayPD("--");
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
  }, []);

  const videoConstraints = {
    width: { ideal: 1280 }, height: { ideal: 720 },
    facingMode: facingMode === "user" ? "user" : { exact: "environment" }
  };

  const getDistance = (p1, p2) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  // --- VERİ YUMUŞATMA (Smoothing) ---
  const updateSmoothedData = (newPD, newLeft, newRight, hLeft, hRight) => {
    if (!newPD || newPD < 45 || newPD > 80 || isNaN(newPD)) return;
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

  // --- POZİSYON KONTROL ---
  const checkPosition = (pupilLeft, pupilRight, avgIrisWidthPx, canvasWidth) => {
    const eyeYDiff = Math.abs(pupilLeft.y - pupilRight.y);
    const maxTilt = 10; 
    const isMobile = canvasWidth < 600;
    const minRatio = isMobile ? 0.05 : 0.025; 
    const maxRatio = isMobile ? 0.09 : 0.040;
    const minIrisSize = canvasWidth * minRatio; 
    const maxIrisSize = canvasWidth * maxRatio; 
    
    let msg = "", clr = "red", ready = false;
    if (eyeYDiff > maxTilt) { msg = "BAŞINIZI DİK TUTUN"; clr = "#FFC107"; } 
    else if (avgIrisWidthPx < minIrisSize) { msg = "BİRAZ YAKLAŞIN"; clr = "#FFC107"; } 
    else if (avgIrisWidthPx > maxIrisSize) { msg = "UZAKLAŞIN"; clr = "red"; } 
    else { msg = "MÜKEMMEL - SABİT DURUN"; clr = "#00FF00"; ready = true; }
    setUiStatus({ message: msg, color: clr, isReady: ready });
  };

  // --- MEDIAPIPE BAŞLATMA ---
  useEffect(() => {
    // Eğer kamera modunda değilsek faceMesh çalıştırma (Performans ve Hata Önleme)
    if (appState !== "camera") return;

    const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
    
    faceMesh.onResults((results) => {
      // Eğer kamera ekranından çıktıysak çizimi durdur
      if (appState !== "camera") return;

      const canvasElement = canvasRef.current;
      const videoElement = webcamRef.current?.video;
      if (!canvasElement || !videoElement) return;

      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      const width = canvasElement.width;
      const height = canvasElement.height;
      const canvasCtx = canvasElement.getContext("2d");
      
      // Temizle ve Hazırla
      canvasCtx.save(); 
      canvasCtx.clearRect(0, 0, width, height);
      if (facingMode === "user") {
        canvasCtx.translate(width, 0);
        canvasCtx.scale(-1, 1);
      }
      
      // 1. VİDEOYU ÇİZ (Fotoğrafın temeli burası)
      canvasCtx.drawImage(results.image, 0, 0, width, height);

      if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
        const landmarks = results.multiFaceLandmarks[0];
        const toPx = (lm) => ({ x: lm.x * width, y: lm.y * height });

        const lIris1 = toPx(landmarks[FACEMESH_LEFT_IRIS[0][0]]);
        const lIris2 = toPx(landmarks[FACEMESH_LEFT_IRIS[2][0]]);
        const rIris1 = toPx(landmarks[FACEMESH_RIGHT_IRIS[0][0]]);
        const rIris2 = toPx(landmarks[FACEMESH_RIGHT_IRIS[2][0]]);

        const pupilLeft = { x: (lIris1.x + lIris2.x)/2, y: (lIris1.y + lIris2.y)/2 };
        const pupilRight = { x: (rIris1.x + rIris2.x)/2, y: (rIris1.y + rIris2.y)/2 };
        const avgIrisWidthPx = (getDistance(lIris1, lIris2) + getDistance(rIris1, rIris2)) / 2;
        
        checkPosition(pupilLeft, pupilRight, avgIrisWidthPx, width);

        // --- HESAPLAMA ---
        const calData = calibrationDataRef.current; 
        let mmPerPixel = 0;
        const lCheek = toPx(landmarks[234]);
        const rCheek = toPx(landmarks[454]);
        
        // Slider değerini global değişkenden okuma hack'i (Kritik)
        const currentScale = window.currentFrameScale || 1.0; 
        const visualFrameWidthPx = getDistance(lCheek, rCheek) * currentScale;

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

        // --- 2. ÇİZİMLER (Bunlar artık fotoğrafta görünecek) ---
        
        // Burun Ucu
        canvasCtx.fillStyle = "red";
        canvasCtx.beginPath();
        canvasCtx.arc(noseTip.x, noseTip.y, 4, 0, 2 * Math.PI);
        canvasCtx.fill();

        // Göz Bebekleri (Yeşil Artı)
        canvasCtx.strokeStyle = "#00FF00";
        canvasCtx.lineWidth = 2;
        [pupilLeft, pupilRight].forEach(p => {
            canvasCtx.beginPath();
            canvasCtx.moveTo(p.x - 10, p.y); canvasCtx.lineTo(p.x + 10, p.y);
            canvasCtx.moveTo(p.x, p.y - 10); canvasCtx.lineTo(p.x, p.y + 10);
            canvasCtx.stroke();
        });

        // Göz Hizası Çizgisi
        canvasCtx.setLineDash([5, 5]);
        canvasCtx.beginPath();
        canvasCtx.moveTo(pupilLeft.x - 30, pupilLeft.y);
        canvasCtx.lineTo(pupilRight.x + 30, pupilRight.y);
        canvasCtx.stroke();
        canvasCtx.setLineDash([]);

        // KIRMIZI LAZER KUTUSU (Gözlük Seçiliyse)
        if (calData && calData.width) {
            canvasCtx.strokeStyle = "rgba(255, 0, 0, 0.8)";
            canvasCtx.lineWidth = 4;
            canvasCtx.shadowBlur = 0;
            
            const centerX = (pupilLeft.x + pupilRight.x) / 2;
            const centerY = (pupilLeft.y + pupilRight.y) / 2;
            const boxW = visualFrameWidthPx;
            const boxH = boxW * 0.35; 

            canvasCtx.strokeRect(centerX - boxW/2, centerY - boxH/2, boxW, boxH);
            
            // "Kutu" yazısı
            canvasCtx.fillStyle = "red";
            canvasCtx.font = "bold 16px Arial";
            canvasCtx.textAlign = "center";
            // Yazıyı ters çevirme sorunu için kontrol
            canvasCtx.save();
            if(facingMode === "user") {
                 canvasCtx.translate(centerX, centerY - boxH/2 - 15);
                 canvasCtx.scale(-1, 1); // Yazıyı düzelt
                 canvasCtx.fillText("◄ ÇERÇEVE ►", 0, 0);
            } else {
                 canvasCtx.fillText("◄ ÇERÇEVE ►", centerX, centerY - boxH/2 - 15);
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
      // Sadece kamera modundaysak döngüyü sürdür
      if (appState === "camera") {
         requestRef.current = requestAnimationFrame(runDetection);
      }
    };
    requestRef.current = requestAnimationFrame(runDetection);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      faceMesh.close();
    };
  }, [facingMode, appState]); // appState değişince useEffect yeniden çalışır/durur

  // --- FOTOĞRAF ÇEKME (CANVAS'TAN ALIYORUZ) ---
  const capturePhoto = () => {
    // 1. Sonuçları kaydet
    const frozenData = latestDataRef.current;
    setFinalResult({
        pd: frozenData.pd, left: frozenData.left, right: frozenData.right,
        hLeft: frozenData.heightLeft, hRight: frozenData.heightRight
    });

    // 2. Canvas'taki görüntüyü (çizimlerle birlikte) al
    if(canvasRef.current) {
        // Resmi JPEG olarak al (DataURL)
        const data = canvasRef.current.toDataURL("image/jpeg", 0.9);
        setImgSrc(data);
        
        // 3. Ekranı değiştir (State ile)
        setAppState("result");
    }
  };

  const resetPhoto = () => {
    setImgSrc(null);
    setAppState("camera"); // Kameraya geri dön
  };

  const fullScreenStyle = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'black', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
  const videoCanvasStyle = { position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' };

  return (
    <Fragment>
      <div className="container-app" style={fullScreenStyle}>
        
        {/* --- 1. GİRİŞ EKRANI --- */}
        {appState === "home" && (
          <div className="container-card" style={{zIndex: 20}}>
            <img src={process.env.PUBLIC_URL + "/images/logo.png"} alt="Logo" style={{ width: '150px', height: '150px', objectFit: 'contain', marginBottom: '20px' }} />
            <p>Dijital Optik Ölçüm</p>
            <button onClick={() => setAppState("info")}>Başla</button>
          </div>
        )}

        {/* --- 2. BİLGİ EKRANI --- */}
        {appState === "info" && (
          <div className="container-card" style={{zIndex: 20}}>
            <div className="container-info"><Info /></div>
            <button onClick={() => setAppState("camera")}>Ölçüm Yap</button>
          </div>
        )}

        {/* --- 3. KAMERA EKRANI --- */}
        {appState === "camera" && (
          <div className="container-display" style={fullScreenStyle}>
            <div style={{position: 'relative', flex: 1, width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#111'}}>
              
              {/* UYARI MESAJI */}
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', backgroundColor: 'rgba(0,0,0,0.6)', padding: '15px', zIndex: 60, textAlign: 'center', pointerEvents: 'none' }}>
                  <h2 style={{ color: uiStatus.color, margin: 0, fontSize: '1.5rem', textShadow: '0 2px 4px black', fontWeight: 'bold' }}>{uiStatus.message}</h2>
              </div>

              {/* GÖZLÜK SEÇİMİ */}
              <div style={{position: 'absolute', top: '70px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '400px', zIndex: 50}}>
                  <GlassesSelect onFrameSelect={(data) => { calibrationDataRef.current = data; }} />
              </div>

              {/* HİZALAMA SLIDER */}
              <div style={{
                  position: 'absolute', bottom: '160px', left: '50%', transform: 'translateX(-50%)', 
                  width: '80%', maxWidth: '400px', zIndex: 55, 
                  backgroundColor: 'rgba(0,0,0,0.7)', padding: '10px', borderRadius: '10px',
                  display: (calibrationDataRef.current?.width) ? 'block' : 'none'
              }}>
                  <label style={{color: 'red', fontWeight: 'bold', display: 'block', textAlign: 'center', marginBottom: '5px'}}>KIRMIZI KUTUYU GÖZLÜĞE OTURT</label>
                  <input type="range" min="0.8" max="1.3" step="0.01" value={frameScale} 
                     onChange={(e) => {
                         const val = parseFloat(e.target.value);
                         setFrameScale(val);
                         window.currentFrameScale = val; 
                     }}
                     style={{width: '100%', cursor: 'pointer', accentColor: 'red'}} 
                  />
              </div>

              <Webcam key={facingMode} ref={webcamRef} videoConstraints={videoConstraints} audio={false} mirrored={facingMode === "user"} screenshotFormat="image/jpeg" style={videoCanvasStyle} />
              <canvas ref={canvasRef} style={videoCanvasStyle}></canvas>
            </div>
              
            {/* ALT KONTROL */}
            <div className="controls-footer" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', padding: '15px 10px', background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ marginBottom: '15px', textAlign: 'center' }}>
                    <span style={{ fontSize: "2.5rem", fontWeight: "bold", color: uiStatus.isReady ? "#00FF00" : "#555", textShadow: "0px 0px 5px black" }}>{displayPD}</span>
                    <span style={{ fontSize: "1rem", color: "white" }}> mm</span>
                </div>
                <div style={{display: 'flex', gap: '15px', width: '100%', maxWidth: '400px'}}>
                    <button onClick={capturePhoto} disabled={!uiStatus.isReady} style={{ flex: 2, height: '50px', backgroundColor: uiStatus.isReady ? '#FFC107' : '#555', color: uiStatus.isReady ? 'black' : '#aaa', border: 'none', fontSize: '1.1rem', fontWeight: 'bold', borderRadius: '12px', cursor: 'pointer' }}>FOTOĞRAF ÇEK</button>
                    <button onClick={toggleCamera} style={{ flex: 1, height: '50px', backgroundColor: "rgba(255,255,255,0.2)", color: "white", border: "1px solid white", borderRadius: "12px", fontSize: '0.9rem', cursor: 'pointer' }}>ÇEVİR</button>
                </div>
            </div>
          </div>
        )}

        {/* --- 4. SONUÇ EKRANI --- */}
        {appState === "result" && imgSrc && (
          <div className="container-img" style={{ ...fullScreenStyle, backgroundColor: '#111', justifyContent: 'flex-start' }}>
            <div style={{ flex: '1', position: 'relative', width: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'black' }}>
              <img src={imgSrc} alt="screenshot" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ width: '100%', padding: '20px', backgroundColor: '#1a1a1a', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', boxShadow: '0px -5px 15px rgba(0,0,0,0.5)', zIndex: 30 }}>
              <h3 style={{color: '#FFC107', textAlign: 'center', margin: '0 0 20px 0', borderBottom: '1px solid #333', paddingBottom: '10px'}}>ÖLÇÜM SONUÇLARI</h3>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px'}}>
                  <div style={{backgroundColor: '#222', padding: '10px', borderRadius: '8px', textAlign: 'center'}}>
                      <div style={{color: '#aaa', fontSize: '0.8rem'}}>SOL GÖZ</div>
                      <div style={{color: 'white', fontSize: '1.1rem', margin: '5px 0'}}>PD: <b>{finalResult.left}</b></div>
                      <div style={{color: '#FFC107', fontSize: '1rem', marginTop: '5px'}}>Yük: <b>{finalResult.hLeft}</b></div>
                  </div>
                  <div style={{backgroundColor: '#222', padding: '10px', borderRadius: '8px', textAlign: 'center'}}>
                      <div style={{color: '#aaa', fontSize: '0.8rem'}}>SAĞ GÖZ</div>
                      <div style={{color: 'white', fontSize: '1.1rem', margin: '5px 0'}}>PD: <b>{finalResult.right}</b></div>
                      <div style={{color: '#FFC107', fontSize: '1rem', marginTop: '5px'}}>Yük: <b>{finalResult.hRight}</b></div>
                  </div>
              </div>
              <div style={{textAlign: 'center', marginBottom: '20px'}}>
                  <span style={{color: '#aaa', marginRight: '10px'}}>Toplam PD:</span>
                  <span style={{color: 'white', fontSize: '1.5rem', fontWeight: 'bold'}}>{finalResult.pd} mm</span>
              </div>
              <button onClick={resetPhoto} style={{ width: '100%', height: '50px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '12px', fontSize: '1.1rem', cursor: 'pointer' }}>YENİ ÖLÇÜM</button>
            </div>
          </div>
        )}

      </div>
    </Fragment>
  );
};

export default WebcamImg;