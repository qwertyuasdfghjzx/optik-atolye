// Copyright 2023 MediaPipe & Malgorzata Pick
// Geliştirilmiş Versiyon - Optik Atölye (Görünür Uyarı Sistemi)
import React, { Fragment, useEffect, useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import {
  FaceMesh,
  FACEMESH_RIGHT_IRIS,
  FACEMESH_LEFT_IRIS,
} from "@mediapipe/face_mesh";
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

  const [imgSrc, setImgSrc] = useState(null);
  const [facingMode, setFacingMode] = useState("environment"); 
  const [displayPD, setDisplayPD] = useState("--");     
  const [displayLeft, setDisplayLeft] = useState("--"); 
  const [displayRight, setDisplayRight] = useState("--"); 

  // --- UI DURUMU (YENİ) ---
  // Uyarıları React state'i ile yöneteceğiz, canvas ile değil.
  const [uiStatus, setUiStatus] = useState({ 
    message: "YÜZ ARANIYOR...", 
    color: "red", 
    isReady: false 
  });

  const [finalResult, setFinalResult] = useState({
      pd: "--", left: "--", right: "--", hLeft: "--", hRight: "--"
  });

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

  const updateSmoothedData = (newPD, newLeft, newRight, hLeft, hRight) => {
    if (!newPD || newPD < 45 || newPD > 80 || isNaN(newPD)) return;
    if (latestDataRef.current.pd > 0 && Math.abs(newPD - latestDataRef.current.pd) > 5) return; 

    pdBufferRef.current.push({ pd: newPD, left: newLeft, right: newRight, hl: hLeft, hr: hRight });
    if (pdBufferRef.current.length > BUFFER_SIZE) pdBufferRef.current.shift();

    const sortedBuffer = [...pdBufferRef.current].sort((a, b) => a.pd - b.pd);
    let validData = sortedBuffer;
    if (sortedBuffer.length > 6) {
        validData = sortedBuffer.slice(2, -2);
    }
    const count = validData.length;
    if (count === 0) return;

    const total = validData.reduce((acc, curr) => ({
        pd: acc.pd + curr.pd,
        left: acc.left + curr.left,
        right: acc.right + curr.right,
        hl: acc.hl + curr.hl,
        hr: acc.hr + curr.hr
      }), { pd: 0, left: 0, right: 0, hl:0, hr:0 });

    latestDataRef.current = {
        pd: (total.pd / count).toFixed(1),
        left: (total.left / count).toFixed(1),
        right: (total.right / count).toFixed(1),
        heightLeft: (total.hl / count).toFixed(1),
        heightRight: (total.hr / count).toFixed(1)
    };
    setDisplayPD(latestDataRef.current.pd);
    setDisplayLeft(latestDataRef.current.left);
    setDisplayRight(latestDataRef.current.right);
  };

  // --- POZİSYON KONTROL MANTIĞI (GÜNCELLENDİ) ---
  const checkPosition = (pupilLeft, pupilRight, avgIrisWidthPx, canvasWidth) => {
    const eyeYDiff = Math.abs(pupilLeft.y - pupilRight.y);
    const maxTilt = 10; // Biraz tolerans tanıdık
    
    // EKRAN ORANINA GÖRE MESAFE AYARI
    // Mobilde ekran dar olduğu için oranlar farklıdır
    const isMobile = canvasWidth < 600;
    const minRatio = isMobile ? 0.05 : 0.025; 
    const maxRatio = isMobile ? 0.09 : 0.040;

    const minIrisSize = canvasWidth * minRatio; 
    const maxIrisSize = canvasWidth * maxRatio; 
    
    let msg = "", clr = "red", ready = false;

    if (eyeYDiff > maxTilt) { 
        msg = "BAŞINIZI DİK TUTUN"; 
        clr = "#FFC107"; // Sarı
    } 
    else if (avgIrisWidthPx < minIrisSize) { 
        msg = "ÇOK UZAKSINIZ -> YAKLAŞIN"; 
        clr = "#FFC107"; 
    } 
    else if (avgIrisWidthPx > maxIrisSize) { 
        msg = "ÇOK YAKINSINIZ -> UZAKLAŞIN"; 
        clr = "red"; 
    } 
    else { 
        msg = "MÜKEMMEL - SABİT DURUN"; 
        clr = "#00FF00"; // Yeşil
        ready = true; 
    }
    
    // UI State'ini güncelle
    setUiStatus({ message: msg, color: clr, isReady: ready });
  };

  useEffect(() => {
    const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
    
    faceMesh.onResults((results) => {
      const canvasElement = canvasRef.current;
      const videoElement = webcamRef.current?.video;
      if (!canvasElement || !videoElement) return;

      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      const width = canvasElement.width;
      const height = canvasElement.height;
      const canvasCtx = canvasElement.getContext("2d");
      
      canvasCtx.save(); 
      canvasCtx.clearRect(0, 0, width, height);
      if (facingMode === "user") {
        canvasCtx.translate(width, 0);
        canvasCtx.scale(-1, 1);
      }
      
      // SADECE YÜZ ÇİZİMLERİ (Yazıları HTML'e taşıdık)
      if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
        const landmarks = results.multiFaceLandmarks[0];
        const toPx = (lm) => ({ x: lm.x * width, y: lm.y * height });

        const lIris1 = toPx(landmarks[FACEMESH_LEFT_IRIS[0][0]]);
        const lIris2 = toPx(landmarks[FACEMESH_LEFT_IRIS[2][0]]);
        const rIris1 = toPx(landmarks[FACEMESH_RIGHT_IRIS[0][0]]);
        const rIris2 = toPx(landmarks[FACEMESH_RIGHT_IRIS[2][0]]);

        const pupilLeft = { x: (lIris1.x + lIris2.x)/2, y: (lIris1.y + lIris2.y)/2 };
        const pupilRight = { x: (rIris1.x + rIris2.x)/2, y: (rIris1.y + rIris2.y)/2 };

        const leftIrisWidthPx = getDistance(lIris1, lIris2);
        const rightIrisWidthPx = getDistance(rIris1, rIris2);
        const avgIrisWidthPx = (leftIrisWidthPx + rightIrisWidthPx) / 2;
        
        // POZİSYON KONTROLÜ
        checkPosition(pupilLeft, pupilRight, avgIrisWidthPx, width);

        // HESAPLAMA MOTORU (Aynı kaldı)
        const calData = calibrationDataRef.current; 
        let weightedRatios = []; 

        if (avgIrisWidthPx > 0) {
            weightedRatios.push({ ratio: 11.7 / avgIrisWidthPx, weight: 3 });
        }
        if (calData) {
            const lCheek = toPx(landmarks[234]);
            const rCheek = toPx(landmarks[454]);
            const faceWidthPx = getDistance(lCheek, rCheek);
            if (calData.width && faceWidthPx > 0) {
                const correctedFaceWidth = faceWidthPx * 1.02; 
                weightedRatios.push({ ratio: calData.width / correctedFaceWidth, weight: 1 });
            }
            if (calData.bridge && !calData.isManual) {
                const lInner = toPx(landmarks[133]);
                const rInner = toPx(landmarks[362]);
                const bridgePx = getDistance(lInner, rInner);
                if (bridgePx > 0) {
                     const ratioBridge = calData.bridge / bridgePx;
                     if(ratioBridge > 0.1 && ratioBridge < 0.5) {
                         weightedRatios.push({ ratio: ratioBridge, weight: 1 });
                     }
                }
            }
        }

        let mmPerPixel = 0;
        if (weightedRatios.length > 0) {
            let totalVal = 0, totalWeight = 0;
            weightedRatios.forEach(item => { totalVal += item.ratio * item.weight; totalWeight += item.weight; });
            mmPerPixel = totalVal / totalWeight;
        } else {
            mmPerPixel = 11.7 / avgIrisWidthPx;
        }

        const totalDistancePx = getDistance(pupilLeft, pupilRight);
        const totalPD = totalDistancePx * mmPerPixel;
        const noseBridge = toPx(landmarks[168]);
        const distLeftPx = getDistance(pupilLeft, noseBridge);
        const distRightPx = getDistance(pupilRight, noseBridge);
        const totalNosePx = distLeftPx + distRightPx;
        const pdLeft = totalPD * (distLeftPx / totalNosePx);
        const pdRight = totalPD * (distRightPx / totalNosePx);
        const noseTip = toPx(landmarks[1]); 
        const hLeftPx = Math.abs(noseTip.y - pupilLeft.y);
        const hRightPx = Math.abs(noseTip.y - pupilRight.y);
        const hLeftMM = hLeftPx * mmPerPixel;
        const hRightMM = hRightPx * mmPerPixel;

        updateSmoothedData(totalPD, pdLeft, pdRight, hLeftMM, hRightMM);

        // KILAVUZ ÇİZİMLERİ (Yeşil Çizgiler)
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = uiStatus.color; // Rengi duruma göre değişsin
        
        // Göz Bebekleri
        const drawCross = (x, y) => {
            canvasCtx.beginPath();
            canvasCtx.moveTo(x - 10, y); canvasCtx.lineTo(x + 10, y);
            canvasCtx.moveTo(x, y - 10); canvasCtx.lineTo(x, y + 10);
            canvasCtx.stroke();
        };
        drawCross(pupilLeft.x, pupilLeft.y);
        drawCross(pupilRight.x, pupilRight.y);

        // Çerçeve (Kullanıcının yüzünü ortalaması için)
        canvasCtx.strokeStyle = uiStatus.color;
        canvasCtx.lineWidth = 4;
        const boxW = width * 0.5;
        const boxH = height * 0.6;
        canvasCtx.strokeRect((width - boxW)/2, (height - boxH)/2, boxW, boxH);

      } else {
          // Yüz Yoksa
          setUiStatus({ isReady: false, message: "YÜZ ARANIYOR...", color: "red" });
      }

      canvasCtx.restore(); 
    });

    const runDetection = async () => {
      if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
        try { await faceMesh.send({ image: webcamRef.current.video }); } catch (e) {}
      }
      requestRef.current = requestAnimationFrame(runDetection);
    };
    requestRef.current = requestAnimationFrame(runDetection);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      faceMesh.close();
    };
  }, [facingMode]);

  const capturePhoto = () => {
    const frozenData = latestDataRef.current;
    setFinalResult({
        pd: frozenData.pd, left: frozenData.left, right: frozenData.right,
        hLeft: frozenData.heightLeft, hRight: frozenData.heightRight
    });
    const canvas = document.querySelector("#output-canvas");
    if(canvas) {
        const data = canvas.toDataURL("image/png");
        setImgSrc(data);
        document.querySelector(".container-display").style.display = "none";
        document.querySelector(".container-img").style.display = "flex";
    }
  };

  const resetPhoto = () => {
    setImgSrc(null);
    document.querySelector(".container-img").style.display = "none";
    document.querySelector(".container-display").style.display = "flex";
  };

  const showInfo = () => { document.querySelector("#card-1").style.display = "none"; document.querySelector("#card-2").style.display = "flex"; };
  const openApp = () => { document.querySelector("#card-2").style.display = "none"; document.querySelector(".container-display").style.display = "flex"; };

  const fullScreenStyle = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'black', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
  const videoCanvasStyle = { position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' };

  return (
    <Fragment>
      <div className="container-app" style={fullScreenStyle}>
        
        {/* BAŞLANGIÇ EKRANLARI */}
        <div className="container-card" id="card-1" style={{zIndex: 20}}>
          <img src={process.env.PUBLIC_URL + "/images/logo.png"} alt="Logo" style={{ width: '150px', height: '150px', objectFit: 'contain', marginBottom: '20px' }} />
          <p>Dijital Optik Ölçüm</p>
          <button id="show-info-btn" onClick={(ev) => { showInfo(); ev.preventDefault(); }}>Başla</button>
        </div>
        <div className="container-card" id="card-2" style={{ display: "none", zIndex: 20 }}>
          <div className="container-info"><Info /></div>
          <button id="open-app-btn" onClick={(ev) => { openApp(); ev.preventDefault(); }}>Ölçüm Yap</button>
        </div>

        {/* KAMERA EKRANI */}
        <div className="container-display" style={{ display: "none", ...fullScreenStyle }}>
          <div style={{position: 'relative', flex: 1, width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#111'}}>
             
             {/* 🔥 UYARI BAR'I (En üstte sabit) 🔥 */}
             <div style={{
                 position: 'absolute', top: 0, left: 0, width: '100%', 
                 backgroundColor: 'rgba(0,0,0,0.6)', padding: '15px', 
                 zIndex: 60, textAlign: 'center', pointerEvents: 'none'
             }}>
                 <h2 style={{
                     color: uiStatus.color, margin: 0, fontSize: '1.5rem', 
                     textShadow: '0 2px 4px black', fontWeight: 'bold'
                 }}>
                     {uiStatus.message}
                 </h2>
             </div>

             {/* Gözlük Seçimi (Uyarının hemen altında) */}
             <div style={{position: 'absolute', top: '70px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '400px', zIndex: 50}}>
                <GlassesSelect onFrameSelect={(data) => { calibrationDataRef.current = data; }} />
             </div>

             <Webcam key={facingMode} ref={webcamRef} videoConstraints={videoConstraints} audio={false} mirrored={facingMode === "user"} screenshotFormat="image/jpeg" style={videoCanvasStyle} />
             <canvas ref={canvasRef} id="output-canvas" style={videoCanvasStyle}></canvas>
          </div>
            
          {/* ALT KONTROL PANELI */}
          <div className="controls-footer" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', padding: '15px 10px', background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ marginBottom: '15px', textAlign: 'center' }}>
                  <span style={{ fontSize: "2.5rem", fontWeight: "bold", color: uiStatus.isReady ? "#00FF00" : "#555", textShadow: "0px 0px 5px black" }}>{displayPD}</span>
                  <span style={{ fontSize: "1rem", color: "white" }}> mm</span>
                  <div style={{ display: "flex", gap: "20px", marginTop: "5px", fontSize: "0.9rem", color: "#ccc", textShadow: "1px 1px 2px black" }}>
                    <span>Sol: {displayLeft}</span>
                    <span>Sağ: {displayRight}</span>
                  </div>
              </div>
              <div style={{display: 'flex', gap: '15px', width: '100%', maxWidth: '400px'}}>
                  <button onClick={(ev) => { capturePhoto(); ev.preventDefault(); }} disabled={!uiStatus.isReady} style={{ flex: 2, height: '50px', backgroundColor: uiStatus.isReady ? '#FFC107' : '#555', color: uiStatus.isReady ? 'black' : '#aaa', border: 'none', fontSize: '1.1rem', fontWeight: 'bold', borderRadius: '12px', cursor: 'pointer' }}>FOTOĞRAF ÇEK</button>
                  <button onClick={(ev) => { toggleCamera(); ev.preventDefault(); }} style={{ flex: 1, height: '50px', backgroundColor: "rgba(255,255,255,0.2)", color: "white", border: "1px solid white", borderRadius: "12px", fontSize: '0.9rem', cursor: 'pointer' }}>ÇEVİR</button>
              </div>
          </div>
        </div>

        {/* SONUÇ EKRANI (Aynı) */}
        <div className="container-img" style={{ display: 'none', ...fullScreenStyle, backgroundColor: '#111', justifyContent: 'flex-start' }}>
          <div style={{ flex: '1', position: 'relative', width: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'black' }}>
             <img src={imgSrc} id="photo" alt="screenshot" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
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
            <button onClick={(ev) => { resetPhoto(); ev.preventDefault(); }} style={{ width: '100%', height: '50px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '12px', fontSize: '1.1rem', cursor: 'pointer' }}>YENİ ÖLÇÜM</button>
          </div>
        </div>
      </div>
    </Fragment>
  );
};

export default WebcamImg;