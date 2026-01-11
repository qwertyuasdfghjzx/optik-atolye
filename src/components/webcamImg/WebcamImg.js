// Copyright 2023 MediaPipe & Malgorzata Pick
// FINAL "MONSTER" VERSION - EKSİKSİZ TAM SÜRÜM
// Özellikler: 4'lü Hesaplama Ortalaması + 3 Eksenli Slider + Tüm Çizimler + Mesafe Barı + DB

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
  // 1. REFERANSLAR VE HAFIZA
  // --------------------------------------------------------------------------
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  
  // Döngü içinde verilere erişmek için Ref kullanıyoruz (State yavaştır)
  const calibrationDataRef = useRef(null); 
  const boxSettingsRef = useRef({ w: 1.0, h: 1.0, y: 0 }); // w: Genişlik, h: Yükseklik, y: Konum

  // Veri Yumuşatma (Smoothing) için hafıza
  const latestDataRef = useRef({ pd: 0, left: 0, right: 0, hLeft: 0, hRight: 0 });
  const pdBufferRef = useRef([]); 
  const BUFFER_SIZE = 15; 

  // --------------------------------------------------------------------------
  // 2. STATE (ARAYÜZ DURUMLARI)
  // --------------------------------------------------------------------------
  const [appState, setAppState] = useState("home"); // home | info | camera | result
  const [imgSrc, setImgSrc] = useState(null);
  const [facingMode, setFacingMode] = useState("user"); 
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  // Ekranda Görünen Sayılar
  const [displayPD, setDisplayPD] = useState("--");     
  
  // Kullanıcı Arayüzü Elemanları
  const [calibrationData, setCalibrationData] = useState(null);
  const [boxSettings, setBoxSettings] = useState({ w: 1.0, h: 1.0, y: 0 });
  
  // Durum Bildirimleri
  const [uiStatus, setUiStatus] = useState({ message: "YÜZ ARANIYOR...", color: "red", isReady: false });
  const [distanceInfo, setDistanceInfo] = useState({ percent: 0, color: "red" }); // Mesafe Çubuğu için

  const [finalResult, setFinalResult] = useState({ pd: "--", left: "--", right: "--", hLeft: "--", hRight: "--" });

  // --------------------------------------------------------------------------
  // 3. HANDLERS (Kullanıcı Etkileşimleri)
  // --------------------------------------------------------------------------

  // Gözlük Seçimi Yapıldığında
  const handleFrameSelect = (data) => {
      setCalibrationData(data);
      calibrationDataRef.current = data;
      
      // Ayarları varsayılana döndür
      const def = { w: 1.0, h: 1.0, y: 0 };
      setBoxSettings(def);
      boxSettingsRef.current = def;
  };

  // Slider Oynatıldığında
  const updateBox = (key, value) => {
      const val = parseFloat(value);
      const newSettings = { ...boxSettingsRef.current, [key]: val };
      
      setBoxSettings(newSettings); // UI Güncelle
      boxSettingsRef.current = newSettings; // Ref Güncelle (Hesaplama için)
  };

  // Kamerayı Çevir
  const toggleCamera = useCallback(() => {
    pdBufferRef.current = [];
    setDisplayPD("--");
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
  }, []);

  const videoConstraints = {
    width: { ideal: 640 }, height: { ideal: 480 }, facingMode: facingMode
  };

  // --------------------------------------------------------------------------
  // 4. MATEMATİK VE MANTIK
  // --------------------------------------------------------------------------

  // İki nokta arası mesafe (Piksel)
  const getDistance = (p1, p2) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  // Veri Yumuşatma (Smoothing Algorithm)
  const updateSmoothedData = (newPD, newLeft, newRight, hLeft, hRight) => {
    if (!newPD || isNaN(newPD) || newPD < 40 || newPD > 80) return;
    
    // Ani sıçrama kontrolü
    if (latestDataRef.current.pd > 0 && Math.abs(newPD - latestDataRef.current.pd) > 10) return; 

    pdBufferRef.current.push({ pd: newPD, left: newLeft, right: newRight, hl: hLeft, hr: hRight });
    if (pdBufferRef.current.length > BUFFER_SIZE) pdBufferRef.current.shift();

    const count = pdBufferRef.current.length;
    if (count < 3) return;

    // Ortalama Al
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

  // Mesafe ve Pozisyon Kontrolü (Distance Bar Mantığı)
  const checkPosition = (pupilLeft, pupilRight, faceWidthPx, canvasWidth) => {
    const eyeYDiff = Math.abs(pupilLeft.y - pupilRight.y);
    const maxTilt = 15; 
    
    // Yüzün ekranda kapladığı oran
    const ratio = faceWidthPx / canvasWidth;
    
    let msg = "HAZIR", color = "#00FF00", distPercent = 0, isReady = false;

    // Mesafe Çubuğu Hesaplama (0.25 çok uzak, 0.65 çok yakın)
    if (ratio < 0.25) distPercent = 20;
    else if (ratio > 0.70) distPercent = 100;
    else {
        // 0.25 ile 0.70 arasını 0-100'e map et
        distPercent = ((ratio - 0.25) / (0.70 - 0.25)) * 100;
    }

    if (eyeYDiff > maxTilt) { 
        msg = "BAŞINIZI DİK TUTUN"; color = "red"; 
    } 
    else if (ratio < 0.35) { 
        msg = "YAKLAŞIN"; color = "#FFC107"; 
    } 
    else if (ratio > 0.65) { 
        msg = "UZAKLAŞIN"; color = "red"; 
    } 
    else { 
        msg = "MÜKEMMEL"; color = "#00FF00"; isReady = true; 
    }
    
    setUiStatus({ message: msg, color, isReady });
    setDistanceInfo({ percent: distPercent, color });
  };

  // --------------------------------------------------------------------------
  // 5. MEDIAPIPE DÖNGÜSÜ (CORE LOGIC)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (appState !== "camera") return;

    const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    
    faceMesh.setOptions({
        maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 
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

        // --- NOKTALAR ---
        const pupilLeft = toPx(landmarks[468]);
        const pupilRight = toPx(landmarks[473]);
        const lCheek = toPx(landmarks[234]);
        const rCheek = toPx(landmarks[454]);
        const lInner = toPx(landmarks[133]); 
        const rInner = toPx(landmarks[362]);
        const noseTip = toPx(landmarks[1]);
        const noseBridge = toPx(landmarks[168]);

        // İris Çapı (Yaklaşık)
        const lIrisDia = getDistance(toPx(landmarks[468]), toPx(landmarks[474])) * 2;
        const rIrisDia = getDistance(toPx(landmarks[473]), toPx(landmarks[479])) * 2;
        const avgIrisDiaPx = (lIrisDia + rIrisDia) / 2;

        // Pozisyon Kontrol
        const faceWidthPx = getDistance(lCheek, rCheek);
        checkPosition(pupilLeft, pupilRight, faceWidthPx, videoWidth);

        // --- 4'LÜ HESAPLAMA MOTORU (SENSOR FUSION) ---
        const calData = calibrationDataRef.current; 
        const settings = boxSettingsRef.current;
        let ratios = []; // Bulunan tüm oranları buraya atıp ortalamasını alacağız

        // 1. YÖNTEM: İRİS (Biyolojik Sabit - En Güvenilir)
        // Ortalama insan irisi 11.7mm
        if (avgIrisDiaPx > 0) {
            ratios.push(11.7 / avgIrisDiaPx);
        }

        // Kutu Değişkenleri (Çizim için de lazım)
        let boxW = 0, boxH = 0, centerX = 0, centerY = 0;

        if (calData && calData.width) {
            // Slider ile ayarlanan genişlik
            boxW = faceWidthPx * settings.w; 
            
            // 2. YÖNTEM: KUTU GENİŞLİĞİ (Veritabanı / Kutu)
            ratios.push(calData.width / boxW);

            // 3. YÖNTEM: KUTU YÜKSEKLİĞİ (Varsa)
            // Standart gözlük oranı 0.35 * slider
            boxH = boxW * 0.35 * settings.h; 
            if (calData.height) {
                // Eğer veritabanında lens yüksekliği varsa onu da hesaba kat
                ratios.push(calData.height / boxH);
            }

            // 4. YÖNTEM: KÖPRÜ (Bridge)
            if (calData.bridge) {
                const bridgePx = getDistance(lInner, rInner);
                // Göz pınarı mesafesi ~ Köprü + 2mm (Yaklaşık)
                const approxBridgeRatio = (calData.bridge + 2) / bridgePx;
                ratios.push(approxBridgeRatio);
            }

            // Kutu Merkezi (Çizim İçin)
            centerX = (pupilLeft.x + pupilRight.x) / 2;
            centerY = ((pupilLeft.y + pupilRight.y) / 2) + settings.y;
        }

        // --- ORTALAMA ALMA (SONUÇ HESABI) ---
        let mmPerPixel = 0;
        if (ratios.length > 0) {
            const sum = ratios.reduce((a, b) => a + b, 0);
            mmPerPixel = sum / ratios.length;
        }

        // Eğer sonuç geçerliyse hesapla
        if (mmPerPixel > 0) {
            const pdPx = getDistance(pupilLeft, pupilRight);
            const totalPD = pdPx * mmPerPixel;
            
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

        // --------------------------------------------------------------------
        // ÇİZİMLER (CANVAS RENDER)
        // --------------------------------------------------------------------
        
        // 1. MONTAJ YÜKSEKLİĞİ ÇİZGİLERİ (CYAN - MAVİ)
        canvasCtx.strokeStyle = "cyan";
        canvasCtx.lineWidth = 2;
        canvasCtx.setLineDash([4, 2]); // Kesik Çizgi
        canvasCtx.beginPath();
        // Sol Dikey
        canvasCtx.moveTo(pupilLeft.x, pupilLeft.y); canvasCtx.lineTo(pupilLeft.x, noseTip.y);
        // Sağ Dikey
        canvasCtx.moveTo(pupilRight.x, pupilRight.y); canvasCtx.lineTo(pupilRight.x, noseTip.y);
        // Burun Yatay
        canvasCtx.moveTo(pupilLeft.x - 20, noseTip.y); canvasCtx.lineTo(pupilRight.x + 20, noseTip.y);
        canvasCtx.stroke();
        canvasCtx.setLineDash([]); // Normale dön

        // 2. GÖZ BEBEKLERİ (YEŞİL ARTI)
        canvasCtx.strokeStyle = "#00FF00";
        canvasCtx.lineWidth = 3;
        [pupilLeft, pupilRight].forEach(p => {
            canvasCtx.beginPath();
            canvasCtx.moveTo(p.x - 10, p.y); canvasCtx.lineTo(p.x + 10, p.y);
            canvasCtx.moveTo(p.x, p.y - 10); canvasCtx.lineTo(p.x, p.y + 10);
            canvasCtx.stroke();
        });

        // 3. BURUN UCU (KIRMIZI NOKTA)
        canvasCtx.fillStyle = "red";
        canvasCtx.beginPath();
        canvasCtx.arc(noseTip.x, noseTip.y, 4, 0, 2 * Math.PI);
        canvasCtx.fill();

        // 4. KIRMIZI HİZALAMA KUTUSU (Varsa)
        if (calData && calData.width) {
            canvasCtx.strokeStyle = "rgba(255, 0, 0, 0.9)";
            canvasCtx.lineWidth = 3;
            
            canvasCtx.strokeRect(centerX - boxW/2, centerY - boxH/2, boxW, boxH);
            
            // Metin Yazısı
            canvasCtx.fillStyle = "red";
            canvasCtx.font = "bold 14px Arial";
            canvasCtx.textAlign = "center";
            canvasCtx.save();
            const textY = centerY - boxH/2 - 10;
            if(facingMode === "user") {
                 canvasCtx.translate(centerX, textY);
                 canvasCtx.scale(-1, 1);
                 canvasCtx.fillText(`${calData.width}mm`, 0, 0);
            } else {
                 canvasCtx.fillText(`${calData.width}mm`, centerX, textY);
            }
            canvasCtx.restore();
        }

      } else {
          setUiStatus({ message: "YÜZ ARANIYOR...", color: "red" });
          setDistanceInfo({ percent: 0, color: "red" });
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

  // --------------------------------------------------------------------------
  // 6. AKSİYONLAR
  // --------------------------------------------------------------------------
  const capturePhoto = () => {
    const frozenData = latestDataRef.current;
    
    // Veri kontrolü (Boşsa uyarma, yine de çek)
    if (!frozenData || frozenData.pd === 0 || frozenData.pd === "--") {
        console.warn("Veri tam oluşmadı ama çekiliyor.");
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

  // --------------------------------------------------------------------------
  // 7. CSS STİLLERİ (MOBİL UYUMLU)
  // --------------------------------------------------------------------------
  const fullScreen = { 
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
      backgroundColor: 'black', display: 'flex', flexDirection: 'column', overflow: 'hidden' 
  };
  const scrollable = { 
      ...fullScreen, overflowY: 'auto', justifyContent: 'flex-start' 
  };
  const videoContainer = { 
      position: 'relative', width: '100%', flex: 1, 
      display: 'flex', justifyContent: 'center', alignItems: 'center', 
      backgroundColor: '#000', overflow: 'hidden' 
  };
  const absFull = { 
      position: 'absolute', width: '100%', height: '100%', objectFit: 'contain' 
  };
  const sliderRow = { 
      display: 'flex', alignItems: 'center', marginBottom: '8px', color: 'white', fontSize: '0.8rem' 
  };
  const sliderInput = { 
      flex: 1, marginLeft: '10px', accentColor: '#D4AF37', cursor: 'pointer' 
  };
  const bigBtnStyle = { 
      padding: '15px 40px', fontSize: '1.2rem', backgroundColor: '#D4AF37', 
      border: 'none', borderRadius: '30px', fontWeight: 'bold', 
      marginTop: '20px', cursor: 'pointer' 
  };

  // --------------------------------------------------------------------------
  // 8. RENDER (GÖRÜNÜM)
  // --------------------------------------------------------------------------
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
                <button onClick={() => setAppState("camera")} style={{...bigBtnStyle, width: '100%', borderRadius: '10px'}}>KAMERAYI AÇ VE ÖLÇ</button>
             </div>
          </div>
        )}

        {appState === "camera" && (
          <div style={fullScreen}>
            <div style={videoContainer}>
              {!isModelLoaded && <div style={{position: 'absolute', zIndex: 100, color: '#D4AF37'}}><h3>Başlatılıyor...</h3></div>}

              {/* MESAFE ÇUBUĞU (ÜST) */}
              <div style={{position: 'absolute', top: 0, left: 0, width: '100%', padding: '5px', background: 'rgba(0,0,0,0.5)', zIndex: 60}}>
                  <div style={{color: distanceInfo.color, textAlign: 'center', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '2px'}}>
                      {uiStatus.message}
                  </div>
                  <div style={{width: '60%', margin: '0 auto', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden'}}>
                      <div style={{width: `${distanceInfo.percent}%`, height: '100%', background: distanceInfo.color, transition: 'all 0.3s'}}></div>
                  </div>
              </div>

              {/* Gözlük Seçimi */}
              <div style={{position: 'absolute', top: '40px', left: '50%', transform: 'translateX(-50%)', width: '95%', maxWidth: '400px', zIndex: 50}}>
                  <GlassesSelect onFrameSelect={handleFrameSelect} />
              </div>

              {/* SLIDER PANELI */}
              {calibrationData && calibrationData.width && (
                  <div style={{position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '400px', zIndex: 55, backgroundColor: 'rgba(0,0,0,0.7)', padding: '10px', borderRadius: '10px', border: '1px solid #444'}}>
                      <div style={{textAlign: 'center', color: '#D4AF37', fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '5px'}}>HASSAS AYAR</div>
                      <div style={sliderRow}>
                          <span style={{width: '60px'}}>↔ Genişlik</span>
                          <input type="range" min="0.8" max="1.4" step="0.005" value={boxSettings.w} onChange={(e) => updateBox('w', e.target.value)} style={sliderInput} />
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
              
            {/* ALT PANEL */}
            <div style={{ width: '100%', padding: '10px', background: '#111', zIndex: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', borderTop: '1px solid #333' }}>
                <div style={{ marginBottom: '5px', textAlign: 'center' }}>
                    <span style={{ fontSize: "1.8rem", fontWeight: "bold", color: uiStatus.color === "#00FF00" ? "#00FF00" : "#fff" }}>{displayPD}</span>
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