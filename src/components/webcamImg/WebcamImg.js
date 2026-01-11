// Copyright 2023 MediaPipe & Malgorzata Pick
// OPTIMIZED FINAL VERSION - NO FREEZE, NO CSS BUGS
// State güncellemeleri döngüden çıkarıldı, sadece Ref kullanıldı.

import React, { Fragment, useEffect, useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { FaceMesh, FACEMESH_LEFT_IRIS, FACEMESH_RIGHT_IRIS } from "@mediapipe/face_mesh";
import Info from "../../components/info/Info";
import GlassesSelect from "../GlassesSelect"; 

const WebcamImg = () => {
  // --- REFERANSLAR (PERFORMANS İÇİN) ---
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  
  // Döngü içinde State yerine bunları kullanacağız (Donmayı engeller)
  const calibrationDataRef = useRef(null); 
  const boxSettingsRef = useRef({ w: 1.0, h: 1.0, y: 0 }); 
  const uiStatusRef = useRef({ msg: "YÜZ ARANIYOR...", color: "red", isReady: false });

  const latestDataRef = useRef({ pd: 0, left: 0, right: 0, hLeft: 0, hRight: 0 });
  const pdBufferRef = useRef([]); 
  const BUFFER_SIZE = 15; 

  // --- UI STATE (Sadece kullanıcı etkileşimi için) ---
  const [appState, setAppState] = useState("home"); // home | info | camera | result
  const [imgSrc, setImgSrc] = useState(null);
  const [facingMode, setFacingMode] = useState("user"); 
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  // Ekranda SADECE nihai sayıları göstermek için state
  const [displayPD, setDisplayPD] = useState("--");     
  
  // Slider ve Gözlük UI kontrolü
  const [showSliders, setShowSliders] = useState(false); // Gözlük seçilince true olur
  const [sliderValues, setSliderValues] = useState({ w: 1.0, h: 1.0, y: 0 });

  // Sonuç Ekranı
  const [finalResult, setFinalResult] = useState({ pd: "--", left: "--", right: "--", hLeft: "--", hRight: "--" });

  // --- HANDLERS ---

  const handleFrameSelect = (data) => {
      // Hem Ref'i (Hız için) hem State'i (UI için) güncelle
      calibrationDataRef.current = data;
      
      if (data && data.width) {
          setShowSliders(true);
          const def = { w: 1.0, h: 1.0, y: 0 };
          boxSettingsRef.current = def;
          setSliderValues(def);
      } else {
          setShowSliders(false);
      }
  };

  const updateBox = (key, value) => {
      const val = parseFloat(value);
      // Önce Ref'i güncelle (Anlık çizim için şart)
      boxSettingsRef.current = { ...boxSettingsRef.current, [key]: val };
      // State'i güncelle (Slider çubuğunun hareket etmesi için)
      setSliderValues(prev => ({ ...prev, [key]: val }));
  };

  const toggleCamera = useCallback(() => {
    pdBufferRef.current = [];
    setDisplayPD("--");
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
  }, []);

  const videoConstraints = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: facingMode };

  const getDistance = (p1, p2) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  // --- SMOOTHING ---
  const updateSmoothedData = (newPD, newLeft, newRight, hLeft, hRight) => {
    if (!newPD || isNaN(newPD) || newPD < 40 || newPD > 80) return;
    
    // Ani sıçrama kontrolü
    if (latestDataRef.current.pd > 0 && Math.abs(newPD - latestDataRef.current.pd) > 10) return; 

    pdBufferRef.current.push({ pd: newPD, left: newLeft, right: newRight, hl: hLeft, hr: hRight });
    if (pdBufferRef.current.length > BUFFER_SIZE) pdBufferRef.current.shift();

    const count = pdBufferRef.current.length;
    if (count < 3) return;

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
    
    // Performans için: State'i her karede güncelleme, sadece değişim varsa veya belirli aralıklarla
    // Ancak PD değeri anlık lazım olduğu için burası kalabilir, React text update'i hızlı yapar.
    setDisplayPD(latestDataRef.current.pd);
  };

  // --- POZİSYON KONTROL (REF KULLANIMI) ---
  const checkPosition = (pupilLeft, pupilRight, faceWidthPx, canvasWidth) => {
    const eyeYDiff = Math.abs(pupilLeft.y - pupilRight.y);
    const ratio = faceWidthPx / canvasWidth;
    
    let msg = "HAZIR", color = "#00FF00", isReady = true;

    if (eyeYDiff > 15) { msg = "BAŞINIZI DİK TUTUN"; color = "red"; isReady = false; } 
    else if (ratio < 0.35) { msg = "YAKLAŞIN"; color = "#FFC107"; isReady = false; } 
    else if (ratio > 0.75) { msg = "UZAKLAŞIN"; color = "red"; isReady = false; } 
    
    // UI Status Ref'e yazılır, state güncellenmez (Donmayı önler)
    // Sadece çizim döngüsünde canvas üzerine yazacağız.
    uiStatusRef.current = { msg, color, isReady };
  };

  // --- MEDIAPIPE DÖNGÜSÜ ---
  useEffect(() => {
    if (appState !== "camera") return;

    const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    
    faceMesh.setOptions({
        maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 
    });
    
    faceMesh.onResults((results) => {
      // State update'i burada yaparsak donar. Sadece bir kere true yapıyoruz.
      if (!isModelLoaded) setIsModelLoaded(true);
      
      if (appState !== "camera") return;

      const canvasElement = canvasRef.current;
      const videoElement = webcamRef.current?.video;
      if (!canvasElement || !videoElement) return;

      const videoWidth = videoElement.videoWidth;
      const videoHeight = videoElement.videoHeight;
      
      // Canvas boyutunu sadece değişirse ayarla (Performans)
      if (canvasElement.width !== videoWidth) {
          canvasElement.width = videoWidth;
          canvasElement.height = videoHeight;
      }
      
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

        // Noktalar
        const pupilLeft = toPx(landmarks[468]);
        const pupilRight = toPx(landmarks[473]);
        const lCheek = toPx(landmarks[234]);
        const rCheek = toPx(landmarks[454]);
        const lInner = toPx(landmarks[133]);
        const rInner = toPx(landmarks[362]);
        const noseTip = toPx(landmarks[1]);
        const noseBridge = toPx(landmarks[168]);

        // İris Çapı
        const lIrisDia = getDistance(toPx(landmarks[468]), toPx(landmarks[474])) * 2;
        const rIrisDia = getDistance(toPx(landmarks[473]), toPx(landmarks[479])) * 2;
        const avgIrisDiaPx = (lIrisDia + rIrisDia) / 2;

        // Kontrol
        const faceWidthPx = getDistance(lCheek, rCheek);
        checkPosition(pupilLeft, pupilRight, faceWidthPx, videoWidth);

        // --- 4'LÜ HESAPLAMA (Ref'lerden oku) ---
        const calData = calibrationDataRef.current; 
        const settings = boxSettingsRef.current;
        let ratios = []; 

        if (avgIrisDiaPx > 0) ratios.push(11.7 / avgIrisDiaPx); // 1. İris

        let boxW = 0, boxH = 0, centerX = 0, centerY = 0;

        if (calData && calData.width) {
            boxW = faceWidthPx * settings.w; 
            ratios.push(calData.width / boxW); // 2. Genişlik

            boxH = boxW * 0.35 * settings.h; 
            if (calData.height) ratios.push(calData.height / boxH); // 3. Yükseklik

            if (calData.bridge) {
                const bridgePx = getDistance(lInner, rInner);
                ratios.push((calData.bridge + 2) / bridgePx); // 4. Köprü
            }
            
            centerX = (pupilLeft.x + pupilRight.x) / 2;
            centerY = ((pupilLeft.y + pupilRight.y) / 2) + settings.y;
        }

        // Ortalama
        let mmPerPixel = 0;
        if (ratios.length > 0) {
            const sum = ratios.reduce((a, b) => a + b, 0);
            mmPerPixel = sum / ratios.length;
        }

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

        // --- ÇİZİMLER (CANVAS) ---
        
        // 1. Montaj Çizgileri (Cyan)
        canvasCtx.strokeStyle = "cyan"; canvasCtx.lineWidth = 2; canvasCtx.setLineDash([4, 2]);
        canvasCtx.beginPath();
        canvasCtx.moveTo(pupilLeft.x, pupilLeft.y); canvasCtx.lineTo(pupilLeft.x, noseTip.y);
        canvasCtx.moveTo(pupilRight.x, pupilRight.y); canvasCtx.lineTo(pupilRight.x, noseTip.y);
        canvasCtx.moveTo(pupilLeft.x - 20, noseTip.y); canvasCtx.lineTo(pupilRight.x + 20, noseTip.y);
        canvasCtx.stroke(); canvasCtx.setLineDash([]);

        // 2. Gözler (Yeşil)
        canvasCtx.strokeStyle = "#00FF00"; canvasCtx.lineWidth = 3;
        [pupilLeft, pupilRight].forEach(p => {
            canvasCtx.beginPath(); canvasCtx.moveTo(p.x-10, p.y); canvasCtx.lineTo(p.x+10, p.y);
            canvasCtx.moveTo(p.x, p.y-10); canvasCtx.lineTo(p.x, p.y+10); canvasCtx.stroke();
        });

        // 3. Burun (Kırmızı)
        canvasCtx.fillStyle = "red"; canvasCtx.beginPath();
        canvasCtx.arc(noseTip.x, noseTip.y, 4, 0, 2 * Math.PI); canvasCtx.fill();

        // 4. Kutu (Hizalama)
        if (calData && calData.width) {
            canvasCtx.strokeStyle = "rgba(255, 0, 0, 0.9)"; canvasCtx.lineWidth = 3;
            canvasCtx.strokeRect(centerX - boxW/2, centerY - boxH/2, boxW, boxH);
            
            // Kutu Metni
            canvasCtx.fillStyle = "red"; canvasCtx.font = "bold 14px Arial"; canvasCtx.textAlign = "center";
            canvasCtx.save();
            const textY = centerY - boxH/2 - 10;
            if(facingMode === "user") {
                 canvasCtx.translate(centerX, textY); canvasCtx.scale(-1, 1); canvasCtx.fillText(`${calData.width}mm`, 0, 0);
            } else {
                 canvasCtx.fillText(`${calData.width}mm`, centerX, textY);
            }
            canvasCtx.restore();
        }

      } else {
          // Yüz Yoksa
          uiStatusRef.current = { msg: "YÜZ ARANIYOR...", color: "red", isReady: false };
      }
      
      // DURUM METNİNİ CANVAS'A YAZDIR (State kullanmadan, performans için)
      // Bu sayede React render döngüsüne girmeden ekrana yazı basarız.
      const status = uiStatusRef.current;
      canvasCtx.save();
      if(facingMode === "user") { canvasCtx.translate(videoWidth, 0); canvasCtx.scale(-1, 1); } // Aynalama düzeltmesi
      
      // Üst Bar Arka Plan
      canvasCtx.fillStyle = "rgba(0, 0, 0, 0.5)";
      canvasCtx.fillRect(0, 0, videoWidth, 40);
      
      // Metin
      canvasCtx.fillStyle = status.color;
      canvasCtx.font = "bold 20px Arial";
      canvasCtx.textAlign = "center";
      canvasCtx.fillText(status.msg, videoWidth / 2, 28);
      canvasCtx.restore();

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

  // --- ACTIONS ---
  const capturePhoto = () => {
    const frozenData = latestDataRef.current;
    if (!frozenData || frozenData.pd === 0) {
        // Uyarı vermeden geçiyoruz, boş olsa da çeksin
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

  // --- CSS STYLES (Fixed for Mobile) ---
  const styles = {
      root: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'black', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
      scrollable: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100dvh', backgroundColor: 'black', display: 'flex', flexDirection: 'column', overflowY: 'auto', WebkitOverflowScrolling: 'touch' },
      videoContainer: { position: 'relative', width: '100%', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', overflow: 'hidden' },
      absFull: { position: 'absolute', width: '100%', height: '100%', objectFit: 'contain' },
      sliderRow: { display: 'flex', alignItems: 'center', marginBottom: '8px', color: 'white', fontSize: '0.8rem' },
      sliderInput: { flex: 1, marginLeft: '10px', accentColor: '#D4AF37', cursor: 'pointer' },
      btn: { padding: '15px 40px', fontSize: '1.2rem', backgroundColor: '#D4AF37', border: 'none', borderRadius: '30px', fontWeight: 'bold', marginTop: '20px', cursor: 'pointer' }
  };

  return (
    <Fragment>
      <div style={styles.root}>
        
        {/* HOME */}
        {appState === "home" && (
          <div style={{...styles.root, justifyContent: 'center', alignItems: 'center'}}>
            <img src={process.env.PUBLIC_URL + "/images/logo.png"} alt="Logo" style={{ width: '150px', height: '150px', objectFit: 'contain', marginBottom: '20px' }} />
            <h2 style={{color: '#D4AF37'}}>Dijital Optik Ölçüm</h2>
            <button onClick={() => setAppState("info")} style={styles.btn}>BAŞLA</button>
          </div>
        )}

        {/* INFO (Scrollable Fix) */}
        {appState === "info" && (
          <div style={styles.scrollable}>
             <div style={{padding: '20px', paddingBottom: '100px'}}>
                <Info />
                <button onClick={() => setAppState("camera")} style={{...styles.btn, width: '100%', borderRadius: '10px'}}>KAMERAYI AÇ VE ÖLÇ</button>
             </div>
          </div>
        )}

        {/* CAMERA */}
        {appState === "camera" && (
          <div style={styles.root}>
            <div style={styles.videoContainer}>
              {!isModelLoaded && <div style={{position: 'absolute', zIndex: 100, color: '#D4AF37'}}><h3>Başlatılıyor...</h3></div>}

              {/* Gözlük Seçimi */}
              <div style={{position: 'absolute', top: '50px', left: '50%', transform: 'translateX(-50%)', width: '95%', maxWidth: '400px', zIndex: 50}}>
                  <GlassesSelect onFrameSelect={handleFrameSelect} />
              </div>

              {/* Sliders */}
              {showSliders && (
                  <div style={{position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '400px', zIndex: 55, backgroundColor: 'rgba(0,0,0,0.6)', padding: '5px', borderRadius: '8px', border: '1px solid #444'}}>
                      <div style={styles.sliderRow}>
                          <span style={{width: '60px'}}>↔ Genişlik</span>
                          <input type="range" min="0.8" max="1.4" step="0.005" value={sliderValues.w} onChange={(e) => updateBox('w', e.target.value)} style={styles.sliderInput} />
                      </div>
                      <div style={styles.sliderRow}>
                          <span style={{width: '60px'}}>↕ Yükseklik</span>
                          <input type="range" min="0.5" max="1.5" step="0.01" value={sliderValues.h} onChange={(e) => updateBox('h', e.target.value)} style={styles.sliderInput} />
                      </div>
                      <div style={styles.sliderRow}>
                          <span style={{width: '60px'}}>↨ Konum</span>
                          <input type="range" min="-100" max="100" step="1" value={sliderValues.y} onChange={(e) => updateBox('y', e.target.value)} style={styles.sliderInput} />
                      </div>
                  </div>
              )}

              <Webcam key={facingMode} ref={webcamRef} videoConstraints={videoConstraints} audio={false} mirrored={facingMode === "user"} screenshotFormat="image/jpeg" style={styles.absFull} />
              <canvas ref={canvasRef} style={styles.absFull}></canvas>
            </div>
              
            {/* Footer */}
            <div style={{ width: '100%', padding: '10px', background: '#111', zIndex: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', borderTop: '1px solid #333' }}>
                <div style={{ marginBottom: '5px', textAlign: 'center' }}>
                    <span style={{ fontSize: "1.8rem", fontWeight: "bold", color: "#00FF00" }}>{displayPD}</span>
                    <span style={{ fontSize: "0.9rem", color: "white" }}> mm</span>
                </div>
                <div style={{display: 'flex', gap: '10px', width: '100%', maxWidth: '400px'}}>
                    <button onClick={capturePhoto} style={{ flex: 2, height: '50px', backgroundColor: '#FFC107', color: 'black', border: 'none', fontSize: '1rem', fontWeight: 'bold', borderRadius: '10px' }}>ÇEK</button>
                    <button onClick={toggleCamera} style={{ flex: 1, height: '50px', backgroundColor: "#333", color: "white", border: "1px solid #555", borderRadius: "10px", fontSize: '0.8rem' }}>ÇEVİR</button>
                </div>
            </div>
          </div>
        )}

        {/* RESULT */}
        {appState === "result" && imgSrc && (
          <div style={styles.scrollable}>
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