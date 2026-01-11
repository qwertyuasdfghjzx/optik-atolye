// Copyright 2023 MediaPipe & Malgorzata Pick
import React, { Fragment, useEffect, useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import {
  FaceMesh,
  FACEMESH_RIGHT_IRIS,
  FACEMESH_LEFT_IRIS,
} from "@mediapipe/face_mesh";
import Info from "../../components/info/Info";

const WebcamImg = () => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  
  // Veri Havuzları
  const latestDataRef = useRef({ pd: 0, left: 0, right: 0, hLeft: 0, hRight: 0 });
  const pdBufferRef = useRef([]); 
  const BUFFER_SIZE = 30; // Stabiliteyi ölçmek için havuzu biraz büyüttük

  const [imgSrc, setImgSrc] = useState(null);
  
  // --- KAMERA AYARLARI ---
  const [facingMode, setFacingMode] = useState("environment"); 

  const [displayPD, setDisplayPD] = useState("--");     
  const [displayLeft, setDisplayLeft] = useState("--"); 
  const [displayRight, setDisplayRight] = useState("--"); 

  const [finalResult, setFinalResult] = useState({
      pd: "--", left: "--", right: "--", hLeft: "--", hRight: "--"
  });

  // Durum Referansı
  const statusRef = useRef({ 
    isReady: false, 
    message: "YÜZ ARANIYOR...", 
    color: "red" 
  });

  // --- KAMERA DEĞİŞTİRME ---
  const toggleCamera = useCallback(() => {
    pdBufferRef.current = [];
    setDisplayPD("--");
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
  }, []);

  const videoConstraints = {
    facingMode: facingMode === "user" ? "user" : { exact: "environment" }
  };

  // --- MATEMATİK ---
  const getDistance = (p1, p2) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  // Standart Sapma Hesaplama (Stabilite için)
  const calculateStandardDeviation = (arr) => {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  };

  const updateSmoothedData = (newPD, newLeft, newRight, hLeft, hRight) => {
    if (!newPD || newPD <= 0 || isNaN(newPD)) return;

    pdBufferRef.current.push({ pd: newPD, left: newLeft, right: newRight, hl: hLeft, hr: hRight });
    if (pdBufferRef.current.length > BUFFER_SIZE) pdBufferRef.current.shift();

    const total = pdBufferRef.current.reduce((acc, curr) => ({
        pd: acc.pd + curr.pd,
        left: acc.left + curr.left,
        right: acc.right + curr.right,
        hl: acc.hl + curr.hl,
        hr: acc.hr + curr.hr
      }), { pd: 0, left: 0, right: 0, hl:0, hr:0 });

    const count = pdBufferRef.current.length;
    
    // Ortalamalar
    const avgPD = (total.pd / count).toFixed(1);
    
    // Stabilite Kontrolü (Son veriler arasındaki sapma)
    // Sadece PD değerlerini bir diziye çıkaralım
    const pdValues = pdBufferRef.current.map(d => d.pd);
    const deviation = calculateStandardDeviation(pdValues);

    latestDataRef.current = {
        pd: avgPD,
        left: (total.left / count).toFixed(1),
        right: (total.right / count).toFixed(1),
        heightLeft: (total.hl / count).toFixed(1),
        heightRight: (total.hr / count).toFixed(1),
        deviation: deviation // Sapmayı da kaydediyoruz
    };

    setDisplayPD(latestDataRef.current.pd);
    setDisplayLeft(latestDataRef.current.left);
    setDisplayRight(latestDataRef.current.right);
  };

  // --- YENİ POZİSYON KONTROL MANTIĞI (DEVİASYON BAZLI) ---
  const checkPosition = (pupilLeft, pupilRight, avgIrisWidthPx, canvasWidth, currentDeviation) => {
    
    // 1. AÇI KONTROLÜ (Hafif toleranslı)
    const eyeYDiff = Math.abs(pupilLeft.y - pupilRight.y);
    const maxTilt = 12; 

    // 2. KABA MESAFE KONTROLÜ (Sadece çok uç durumları engellemek için)
    // Çok uzak (pikselleşme olur) veya çok yakın (balıkgözü efekti olur) değilse karışma.
    const minIrisSize = canvasWidth * 0.020; // Çok uzak
    const maxIrisSize = canvasWidth * 0.15;  // Çok çok yakın

    let msg = "";
    let clr = "red";
    let ready = false;

    // Buffer henüz dolmadıysa (ilk açılış)
    if (pdBufferRef.current.length < 10) {
        msg = "ÖLÇÜLÜYOR...";
        clr = "#FFC107"; // Sarı
    } 
    else if (eyeYDiff > maxTilt) {
        msg = "BAŞINIZI DÜZELTİN";
        clr = "#FFC107"; 
    } 
    else if (avgIrisWidthPx < minIrisSize) {
        msg = "BİRAZ YAKLAŞIN";
        clr = "#FFC107";
    } 
    else if (avgIrisWidthPx > maxIrisSize) {
        msg = "UZAKLAŞIN";
        clr = "red";
    } 
    // EN ÖNEMLİ KISIM: STABİLİTE KONTROLÜ
    // Sapma 0.5mm'den fazlaysa kullanıcı hareket ediyor demektir.
    else if (currentDeviation > 0.6) {
        msg = "SABİT DURUN...";
        clr = "#FFC107"; // Sarı (Beklemede)
    } 
    else {
        // Sapma düşükse, ölçüm stabildir.
        msg = "MÜKEMMEL - ÇEK";
        clr = "#00FF00"; // Yeşil
        ready = true;
    }

    statusRef.current = { isReady: ready, message: msg, color: clr };
  };

  // --- MEDIAPIPE ---
  useEffect(() => {
    const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    
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
      
      canvasCtx.drawImage(results.image, 0, 0, width, height);

      let hasFace = false;

      if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
        hasFace = true;
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
        
        // HESAPLAMALAR
        const mmPerPixel = 11.7 / avgIrisWidthPx;
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

        // ÖNCE VERİYİ GÜNCELLE (Ki sapma hesaplansın)
        updateSmoothedData(totalPD, pdLeft, pdRight, hLeftMM, hRightMM);
        
        // SONRA KONTROLÜ ÇAĞIR (Hesaplanan sapmayı kullan)
        const currentDeviation = latestDataRef.current.deviation || 999;
        checkPosition(pupilLeft, pupilRight, avgIrisWidthPx, width, currentDeviation);

        // ÇİZİMLER
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = "#00FF00";
        const drawCross = (x, y) => {
            canvasCtx.beginPath();
            canvasCtx.moveTo(x - 10, y); canvasCtx.lineTo(x + 10, y);
            canvasCtx.moveTo(x, y - 10); canvasCtx.lineTo(x, y + 10);
            canvasCtx.stroke();
        };
        drawCross(pupilLeft.x, pupilLeft.y);
        drawCross(pupilRight.x, pupilRight.y);

        canvasCtx.beginPath();
        canvasCtx.moveTo(pupilLeft.x - 40, pupilLeft.y);
        canvasCtx.lineTo(pupilRight.x + 40, pupilRight.y);
        canvasCtx.stroke();

        canvasCtx.strokeStyle = "#FFC107";
        canvasCtx.beginPath();
        canvasCtx.moveTo(pupilLeft.x - 30, noseTip.y);
        canvasCtx.lineTo(pupilRight.x + 30, noseTip.y);
        canvasCtx.stroke();

        canvasCtx.setLineDash([5, 5]);
        canvasCtx.beginPath();
        canvasCtx.moveTo(pupilLeft.x, pupilLeft.y); canvasCtx.lineTo(pupilLeft.x, noseTip.y);
        canvasCtx.moveTo(pupilRight.x, pupilRight.y); canvasCtx.lineTo(pupilRight.x, noseTip.y);
        canvasCtx.stroke();
        canvasCtx.setLineDash([]);
        
        canvasCtx.fillStyle = "red";
        canvasCtx.beginPath();
        canvasCtx.arc(noseTip.x, noseTip.y, 4, 0, 2 * Math.PI);
        canvasCtx.fill();

      } else {
          statusRef.current = { isReady: false, message: "YÜZ ARANIYOR...", color: "red" };
      }

      // --- ARAYÜZ ÇİZİMLERİ ---
      const status = statusRef.current;
      
      // 1. Ana Çerçeve
      canvasCtx.strokeStyle = status.color;
      canvasCtx.lineWidth = status.isReady ? 8 : 4; 
      canvasCtx.strokeRect(20, 20, width - 40, height - 40);

      // 2. Durum Mesajı
      canvasCtx.save(); 
      if (facingMode === "user") {
           canvasCtx.scale(-1, 1);
           canvasCtx.translate(-width, 0);
      }
      canvasCtx.font = "bold 36px Arial";
      canvasCtx.fillStyle = status.color;
      canvasCtx.textAlign = "center";
      
      // Yazıya siyah gölge ekle (daha iyi okunur)
      canvasCtx.shadowColor = "black";
      canvasCtx.shadowBlur = 4;
      canvasCtx.shadowOffsetX = 2;
      canvasCtx.shadowOffsetY = 2;

      const textY = hasFace ? height * 0.15 : height / 2;
      canvasCtx.fillText(status.message, width / 2, textY);
      
      // Eğer ölçülüyorsa altına küçük not düş (Opsiyonel debug için)
      if(status.color === "#FFC107" && hasFace) {
           canvasCtx.font = "16px Arial";
           canvasCtx.fillStyle = "#FFF";
          //  canvasCtx.fillText(`Sapma: ${latestDataRef.current.deviation?.toFixed(2)}`, width/2, textY + 30);
      }

      canvasCtx.restore(); 

      canvasCtx.restore(); 
    });

    const runDetection = async () => {
      if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
        try {
          await faceMesh.send({ image: webcamRef.current.video });
        } catch (e) { console.log(e); }
      }
      requestRef.current = requestAnimationFrame(runDetection);
    };
    requestRef.current = requestAnimationFrame(runDetection);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      faceMesh.close();
    };
  }, [facingMode]);

  // --- AKSİYONLAR ---
  const capturePhoto = () => {
    const frozenData = latestDataRef.current;
    setFinalResult({
        pd: frozenData.pd,
        left: frozenData.left,
        right: frozenData.right,
        hLeft: frozenData.heightLeft,
        hRight: frozenData.heightRight
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

  const showInfo = () => {
    document.querySelector("#card-1").style.display = "none";
    document.querySelector("#card-2").style.display = "flex";
  };
  const openApp = () => {
    document.querySelector("#card-2").style.display = "none";
    document.querySelector(".container-display").style.display = "flex";
  };

  const fullScreenStyle = {
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      backgroundColor: 'black', display: 'flex', flexDirection: 'column', overflow: 'hidden'
  };
  const videoCanvasStyle = {
      position: 'absolute', width: '100%', height: '100%', objectFit: 'cover'
  };

  return (
    <Fragment>
      <div className="container-app" style={fullScreenStyle}>
        
        {/* LOGO */}
        <div className="container-card" id="card-1" style={{zIndex: 20}}>
          <img src={process.env.PUBLIC_URL + "/images/logo.png"} alt="Logo" style={{ width: '150px', height: '150px', objectFit: 'contain', marginBottom: '20px' }} />
          <p>Dijital Optik Ölçüm</p>
          <button id="show-info-btn" onClick={(ev) => { showInfo(); ev.preventDefault(); }}>Başla</button>
        </div>

        {/* TALİMATLAR */}
        <div className="container-card" id="card-2" style={{ display: "none", zIndex: 20 }}>
          <div className="container-info"><Info /></div>
          <button id="open-app-btn" onClick={(ev) => { openApp(); ev.preventDefault(); }}>Ölçüm Yap</button>
        </div>

        {/* KAMERA EKRANI */}
        <div className="container-display" style={{ display: "none", ...fullScreenStyle }}>
          <div style={{position: 'relative', flex: 1, width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#111'}}>
             <Webcam 
                key={facingMode} 
                ref={webcamRef} 
                videoConstraints={videoConstraints} 
                audio={false} 
                mirrored={facingMode === "user"} 
                screenshotFormat="image/jpeg" 
                style={videoCanvasStyle} 
             />
             <canvas ref={canvasRef} id="output-canvas" style={videoCanvasStyle}></canvas>
          </div>
            
          <div className="controls-footer" style={{ 
              position: 'absolute', bottom: 0, left: 0, width: '100%', 
              padding: '15px 10px', 
              background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)',
              zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center'
          }}>
              <div style={{ marginBottom: '15px', textAlign: 'center' }}>
                  <span style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#FFC107", textShadow: "0px 0px 5px black" }}>{displayPD}</span>
                  <span style={{ fontSize: "1rem", color: "white" }}> mm</span>
                  <div style={{ display: "flex", gap: "20px", marginTop: "5px", fontSize: "0.9rem", color: "#ccc", textShadow: "1px 1px 2px black" }}>
                    <span>Sol: {displayLeft}</span>
                    <span>Sağ: {displayRight}</span>
                  </div>
              </div>
              
              <div style={{display: 'flex', gap: '15px', width: '100%', maxWidth: '400px'}}>
                  <button onClick={(ev) => { capturePhoto(); ev.preventDefault(); }} style={{ flex: 2, height: '50px', backgroundColor: '#FFC107', color: 'black', border: 'none', fontSize: '1.1rem', fontWeight: 'bold', borderRadius: '12px' }}>FOTOĞRAF ÇEK</button>
                  <button onClick={(ev) => { toggleCamera(); ev.preventDefault(); }} style={{ flex: 1, height: '50px', backgroundColor: "rgba(255,255,255,0.2)", color: "white", border: "1px solid white", borderRadius: "12px", fontSize: '0.9rem' }}>ÇEVİR</button>
              </div>
          </div>
        </div>

        {/* SONUÇ EKRANI */}
        <div className="container-img" style={{ display: 'none', ...fullScreenStyle, backgroundColor: '#111', justifyContent: 'flex-start' }}>
          <div style={{ flex: '1', position: 'relative', width: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'black' }}>
             <img src={imgSrc} id="photo" alt="screenshot" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          
          <div style={{ 
              width: '100%', padding: '20px', 
              backgroundColor: '#1a1a1a', 
              borderTopLeftRadius: '20px', borderTopRightRadius: '20px',
              boxShadow: '0px -5px 15px rgba(0,0,0,0.5)', zIndex: 30
          }}>
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
          
            <button onClick={(ev) => { resetPhoto(); ev.preventDefault(); }} style={{ width: '100%', height: '50px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '12px', fontSize: '1.1rem' }}>
               YENİ ÖLÇÜM
            </button>
          </div>
        </div>

      </div>
    </Fragment>
  );
};

export default WebcamImg;