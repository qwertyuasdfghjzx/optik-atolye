// Copyright 2023 MediaPipe & Malgorzata Pick
// FINAL "UNCOMPRESSED" VERSION - FULL FEATURE SET
// Features: 4-Way Sensor Fusion, 3-Axis Slider, Distance Bar, Canvas Drawing, Fixed CSS

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
  // 1. GLOBAL REFERANSLAR (Performance Memory)
  // --------------------------------------------------------------------------
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  
  // Hesaplama verilerini burada tutuyoruz (State kullanırsak donar)
  const calibrationDataRef = useRef(null); 
  const boxSettingsRef = useRef({ w: 1.0, h: 1.0, y: 0 }); // Slider Değerleri
  
  // Veri Yumuşatma Havuzu
  const latestDataRef = useRef({ pd: 0, left: 0, right: 0, hLeft: 0, hRight: 0 });
  const pdBufferRef = useRef([]); 
  const BUFFER_SIZE = 15; // Son 15 kareyi hafızada tut

  // --------------------------------------------------------------------------
  // 2. UI STATE (Sadece Arayüz Güncellemeleri)
  // --------------------------------------------------------------------------
  const [appState, setAppState] = useState("home"); // home, info, camera, result
  const [imgSrc, setImgSrc] = useState(null);
  const [facingMode, setFacingMode] = useState("user"); 
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  // Slider'ın UI'da görünmesi için State (Döngüden bağımsız)
  const [showSliders, setShowSliders] = useState(false);
  const [sliderUI, setSliderUI] = useState({ w: 1.0, h: 1.0, y: 0 });

  // Sonuç Ekranı Verisi
  const [finalResult, setFinalResult] = useState({ 
      pd: "--", left: "--", right: "--", hLeft: "--", hRight: "--" 
  });

  // --------------------------------------------------------------------------
  // 3. YARDIMCI MATEMATİK FONKSİYONLARI
  // --------------------------------------------------------------------------
  
  // İki nokta arası mesafe (Piksel)
  const getDistance = (p1, p2) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  // Veri Yumuşatma Algoritması (Titremeyi Önler)
  const updateSmoothedData = (newPD, newLeft, newRight, hLeft, hRight) => {
    // Filtre 1: İmkansız değerleri at
    if (!newPD || isNaN(newPD) || newPD < 35 || newPD > 85) return;
    
    // Filtre 2: Ani sıçramaları at (Önceki değerden çok farklıysa)
    if (latestDataRef.current.pd > 0 && Math.abs(newPD - latestDataRef.current.pd) > 10) return; 

    // Veriyi havuza ekle
    pdBufferRef.current.push({ pd: newPD, left: newLeft, right: newRight, hl: hLeft, hr: hRight });
    
    // Havuz dolduysa en eskiyi sil
    if (pdBufferRef.current.length > BUFFER_SIZE) pdBufferRef.current.shift();

    const count = pdBufferRef.current.length;
    if (count < 3) return; // Yeterli veri yoksa bekle

    // Ortalamayı Hesapla
    const total = pdBufferRef.current.reduce((acc, curr) => ({
        pd: acc.pd + curr.pd,
        left: acc.left + curr.left,
        right: acc.right + curr.right,
        hl: acc.hl + curr.hl,
        hr: acc.hr + curr.hr
    }), { pd: 0, left: 0, right: 0, hl:0, hr:0 });

    // Global Referansı Güncelle
    latestDataRef.current = {
        pd: (total.pd / count).toFixed(1),
        left: (total.left / count).toFixed(1),
        right: (total.right / count).toFixed(1),
        heightLeft: (total.hl / count).toFixed(1),
        heightRight: (total.hr / count).toFixed(1)
    };
  };

  // --------------------------------------------------------------------------
  // 4. HANDLERS (KULLANICI ETKİLEŞİMLERİ)
  // --------------------------------------------------------------------------

  // Gözlük Seçimi Yapıldığında
  const handleFrameSelect = (data) => {
      calibrationDataRef.current = data;
      
      if (data && data.width) {
          setShowSliders(true);
          // Varsayılan ayarlar
          const def = { w: 1.0, h: 1.0, y: 0 };
          boxSettingsRef.current = def;
          setSliderUI(def);
      } else {
          setShowSliders(false);
      }
  };

  // Slider Oynatıldığında
  const handleSliderChange = (key, value) => {
      const val = parseFloat(value);
      // 1. Ref'i güncelle (Hesaplama motoru buradan okur - HIZLI)
      boxSettingsRef.current = { ...boxSettingsRef.current, [key]: val };
      // 2. State'i güncelle (Slider çubuğu hareket etsin - UI)
      setSliderUI(prev => ({ ...prev, [key]: val }));
  };

  // Kamerayı Çevir (Ön/Arka)
  const toggleCamera = useCallback(() => {
    pdBufferRef.current = []; // Bufferı temizle ki eski veri kalmasın
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
  }, []);

  const videoConstraints = {
    width: { ideal: 640 },
    height: { ideal: 480 },
    facingMode: facingMode
  };

  // --------------------------------------------------------------------------
  // 5. ANA DÖNGÜ (FACE MESH & CANVAS DRAWING)
  // --------------------------------------------------------------------------
  useEffect(() => {
    // Sadece kamera ekranındaysak çalıştır
    if (appState !== "camera") return;

    const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    
    // Model Ayarları (Hassas Mod)
    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7 
    });
    
    // SONUÇLAR GELDİĞİNDE ÇALIŞACAK FONKSİYON (HER KAREDE)
    faceMesh.onResults((results) => {
      if (!isModelLoaded) setIsModelLoaded(true);
      if (appState !== "camera") return;

      const canvas = canvasRef.current;
      const video = webcamRef.current?.video;
      
      if (!canvas || !video) return;

      const vW = video.videoWidth;
      const vH = video.videoHeight;
      
      // Video hazır değilse çık
      if (vW === 0 || vH === 0) return;

      canvas.width = vW;
      canvas.height = vH;
      const ctx = canvas.getContext("2d");
      
      // --- A. ARKA PLAN VE VİDEO ÇİZİMİ ---
      ctx.save(); 
      ctx.clearRect(0, 0, vW, vH);
      
      // Ön kamerada aynalama yap
      if (facingMode === "user") {
        ctx.translate(vW, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(results.image, 0, 0, vW, vH);
      ctx.restore(); 

      // --- B. YÜZ BULUNDUYSA İŞLEMLER ---
      if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
        const landmarks = results.multiFaceLandmarks[0];
        const toPx = (lm) => ({ x: lm.x * vW, y: lm.y * vH });

        // Önemli Noktalar (Landmarks)
        const pupilLeft = toPx(landmarks[468]);
        const pupilRight = toPx(landmarks[473]);
        const lCheek = toPx(landmarks[234]);
        const rCheek = toPx(landmarks[454]);
        const noseTip = toPx(landmarks[1]);
        const noseBridge = toPx(landmarks[168]);
        const lInner = toPx(landmarks[133]);
        const rInner = toPx(landmarks[362]);

        // Yüz Genişliği (Piksel)
        const faceWidthPx = getDistance(lCheek, rCheek);
        
        // --- C. HESAPLAMA MOTORU (4 FAKTÖRLÜ SENSOR FUSION) ---
        const calData = calibrationDataRef.current;
        const settings = boxSettingsRef.current;
        
        // İris Çapı Ortalaması (Piksel)
        const lIrisD = getDistance(toPx(landmarks[468]), toPx(landmarks[474])) * 2;
        const rIrisD = getDistance(toPx(landmarks[473]), toPx(landmarks[479])) * 2;
        const avgIrisDia = (lIrisD + rIrisD) / 2;

        let ratios = []; // Tüm oranları burada toplayacağız
        let mmPerPixel = 0;

        // 1. FAKTÖR: İRİS (Her zaman çalışır, biyolojik sabit 11.7mm)
        if (avgIrisDia > 0) ratios.push(11.7 / avgIrisDia);

        // Kutu Değişkenleri (Çizim için)
        let boxW = 0, boxH = 0, centerX = 0, centerY = 0;

        if (calData && calData.width) {
            // Slider ile ayarlanan genişlik
            boxW = faceWidthPx * settings.w; 
            
            // 2. FAKTÖR: KUTU GENİŞLİĞİ (Veritabanı / Kutu)
            ratios.push(calData.width / boxW);

            // 3. FAKTÖR: KUTU YÜKSEKLİĞİ (Varsa)
            boxH = boxW * 0.35 * settings.h;
            if (calData.height) {
                ratios.push(calData.height / boxH);
            }

            // 4. FAKTÖR: KÖPRÜ (Bridge)
            if (calData.bridge) {
                const bridgePx = getDistance(lInner, rInner);
                // Göz pınarı arası ~ Köprü + 2mm (tahmini)
                ratios.push((calData.bridge + 2) / bridgePx);
            }

            // Kutu Merkezi (Pupil Orta Noktası + Y Offset)
            // Çizim için koordinat düzeltmesi
            ctx.save();
            if (facingMode === "user") {
                ctx.translate(vW, 0);
                ctx.scale(-1, 1);
            }

            centerX = (pupilLeft.x + pupilRight.x) / 2;
            centerY = ((pupilLeft.y + pupilRight.y) / 2) + settings.y;

            // KUTUYU ÇİZ
            ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
            ctx.lineWidth = 3;
            ctx.strokeRect(centerX - boxW/2, centerY - boxH/2, boxW, boxH);
            
            // KUTU METNİ
            ctx.scale(facingMode === "user" ? -1 : 1, 1); // Yazıyı düzelt
            ctx.fillStyle = "red";
            ctx.font = "bold 14px Arial";
            ctx.textAlign = "center";
            const textX = facingMode === "user" ? -centerX : centerX;
            ctx.fillText(`${calData.width}mm`, textX, centerY - boxH/2 - 10);
            
            ctx.restore(); // Ayna modu kapat
        }

        // ORTALAMA AL
        if (ratios.length > 0) {
            const sum = ratios.reduce((a, b) => a + b, 0);
            mmPerPixel = sum / ratios.length;
        }

        // SONUÇLARI HESAPLA VE KAYDET
        if (mmPerPixel > 0) {
            const pdPx = getDistance(pupilLeft, pupilRight);
            const totalPD = pdPx * mmPerPixel;
            
            const distLeft = getDistance(pupilLeft, noseBridge);
            const distRight = getDistance(pupilRight, noseBridge);
            const totalDist = distLeft + distRight;
            
            const hLeftPx = Math.abs(noseTip.y - pupilLeft.y);
            const hRightPx = Math.abs(noseTip.y - pupilRight.y);

            updateSmoothedData(
                totalPD, 
                totalPD * (distLeft / totalDist), 
                totalPD * (distRight / totalDist), 
                hLeftPx * mmPerPixel, 
                hRightPx * mmPerPixel
            );
        }

        // --- D. DİĞER ÇİZİMLER (CANVAS ÜZERİNE) ---
        ctx.save();
        if (facingMode === "user") { ctx.translate(vW, 0); ctx.scale(-1, 1); }

        // 1. Montaj Çizgileri (Cyan)
        ctx.strokeStyle = "cyan"; ctx.lineWidth = 2; ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(pupilLeft.x, pupilLeft.y); ctx.lineTo(pupilLeft.x, noseTip.y);
        ctx.moveTo(pupilRight.x, pupilRight.y); ctx.lineTo(pupilRight.x, noseTip.y);
        ctx.moveTo(pupilLeft.x - 20, noseTip.y); ctx.lineTo(pupilRight.x + 20, noseTip.y);
        ctx.stroke(); ctx.setLineDash([]);

        // 2. Göz Bebekleri
        ctx.strokeStyle = "#00FF00"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pupilLeft.x, pupilLeft.y, 4, 0, 2*Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.arc(pupilRight.x, pupilRight.y, 4, 0, 2*Math.PI); ctx.stroke();

        ctx.restore();

        // --- E. BİLGİ EKRANI (CANVAS ÜZERİNE YAZI - DONMAYI ENGELLER) ---
        
        // Üst Bar (Arka Plan)
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, vW, 60);

        // PD Değeri
        const currentVal = latestDataRef.current.pd > 0 ? latestDataRef.current.pd : "--";
        ctx.fillStyle = "#00FF00";
        ctx.font = "bold 30px Arial";
        ctx.textAlign = "center";
        ctx.fillText(`${currentVal} mm`, vW / 2, 40);

        // Mesafe Kontrolü (Alt Bar)
        const screenRatio = faceWidthPx / vW;
        let msg = "HAZIR";
        let color = "#00FF00";
        if (Math.abs(pupilLeft.y - pupilRight.y) > 15) { msg = "BAŞINIZI DİK TUTUN"; color = "red"; }
        else if (screenRatio < 0.35) { msg = "YAKLAŞIN"; color = "yellow"; }
        else if (screenRatio > 0.75) { msg = "UZAKLAŞIN"; color = "red"; }

        ctx.fillStyle = color;
        ctx.font = "bold 18px Arial";
        ctx.fillText(msg, vW / 2, vH - 25);

        // Mesafe Barı (Görsel)
        const barW = 200;
        const barH = 8;
        ctx.fillStyle = "#333";
        ctx.fillRect((vW - barW)/2, vH - 50, barW, barH);
        
        let fillPct = (screenRatio - 0.25) / (0.75 - 0.25);
        if(fillPct<0) fillPct=0; if(fillPct>1) fillPct=1;
        
        ctx.fillStyle = color;
        ctx.fillRect((vW - barW)/2, vH - 50, barW * fillPct, barH);

      } else {
          // YÜZ YOKSA
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.fillRect(0, 0, vW, vH);
          ctx.fillStyle = "white";
          ctx.font = "bold 20px Arial";
          ctx.textAlign = "center";
          ctx.fillText("YÜZ ARANIYOR...", vW / 2, vH / 2);
      }
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
  // 6. BUTON VE EKRAN FONKSİYONLARI
  // --------------------------------------------------------------------------
  
  const capturePhoto = () => {
    const data = latestDataRef.current;
    
    setFinalResult({
        pd: data.pd || "--", 
        left: data.left || "--", 
        right: data.right || "--",
        hLeft: data.heightLeft || "--", 
        hRight: data.heightRight || "--"
    });

    if(canvasRef.current) {
        const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.9);
        setImgSrc(dataUrl);
        setAppState("result");
    }
  };

  const resetPhoto = () => {
    setImgSrc(null);
    setAppState("camera");
  };

  // --------------------------------------------------------------------------
  // 7. CSS STİLLERİ (FIXED POSITION - KAYMA ÖNLEME)
  // --------------------------------------------------------------------------
  const styles = {
      // Ana Konteyner
      overlay: { 
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100dvh', 
          backgroundColor: 'black', zIndex: 1000, display: 'flex', flexDirection: 'column', 
          overflow: 'hidden' 
      },
      // İçerik Alanı
      scrollContent: { 
          flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', 
          flexDirection: 'column', alignItems: 'center' 
      },
      // Kamera Konteyner
      camContainer: { 
          flex: 1, position: 'relative', background: '#000', 
          display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' 
      },
      // Tam Ekran Ögeler
      abs: { 
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
          objectFit: 'contain' 
      },
      // Alt Kontroller
      controls: { 
          height: '80px', padding: '10px', background: '#111', 
          display: 'flex', gap: '10px', justifyContent: 'center', alignItems: 'center',
          borderTop: '1px solid #333', flexShrink: 0 
      },
      btn: { 
          flex: 1, height: '50px', borderRadius: '10px', border: 'none', 
          fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', color: 'black' 
      },
      // Slider Kutusu
      sliderBox: { 
          position: 'absolute', bottom: '10px', left: '5%', width: '90%', 
          padding: '10px', background: 'rgba(0,0,0,0.7)', borderRadius: '10px', zIndex: 50,
          border: '1px solid #444'
      },
      row: { display: 'flex', color: 'white', marginBottom: '8px', alignItems: 'center', fontSize: '12px' },
      range: { flex: 1, marginLeft: '10px' }
  };

  // --------------------------------------------------------------------------
  // 8. RENDER (GÖRÜNÜM)
  // --------------------------------------------------------------------------
  return (
    <Fragment>
        {/* --- 1. HOME --- */}
        {appState === "home" && (
            <div style={{...styles.overlay, justifyContent: 'center', alignItems: 'center'}}>
                <img src={process.env.PUBLIC_URL + "/images/logo.png"} alt="Logo" style={{width: 150, marginBottom: 20, objectFit: 'contain'}} />
                <h2 style={{color: '#D4AF37', marginBottom: 30}}>Dijital Optik Ölçüm</h2>
                <button onClick={() => setAppState("info")} style={{...styles.btn, flex: 'none', width: '200px', background: '#D4AF37'}}>BAŞLA</button>
            </div>
        )}

        {/* --- 2. INFO --- */}
        {appState === "info" && (
            <div style={styles.overlay}>
                <div style={styles.scrollContent}>
                    <Info />
                    <button onClick={() => setAppState("camera")} style={{...styles.btn, flex: 'none', width: '100%', marginTop: 20, background: '#D4AF37'}}>KAMERAYI AÇ</button>
                </div>
            </div>
        )}

        {/* --- 3. CAMERA --- */}
        {appState === "camera" && (
            <div style={styles.overlay}>
                <div style={styles.camContainer}>
                    {!isModelLoaded && <h3 style={{color: '#D4AF37', zIndex: 10}}>Yükleniyor...</h3>}
                    
                    {/* Gözlük Seçimi (Üstte) */}
                    <div style={{position: 'absolute', top: 60, width: '90%', zIndex: 40}}>
                        <GlassesSelect onFrameSelect={handleFrameSelect} />
                    </div>

                    {/* Sliderlar (Sadece Gözlük Seçiliyse) */}
                    {showSliders && (
                        <div style={styles.sliderBox}>
                             <div style={{textAlign:'center', color:'#D4AF37', fontSize:'10px', marginBottom:'5px'}}>HASSAS AYAR</div>
                             <div style={styles.row}>
                                 <span>↔ Genişlik</span> 
                                 <input type="range" min="0.8" max="1.4" step="0.005" value={sliderUI.w} onChange={(e)=>handleSliderChange('w', e.target.value)} style={styles.range}/>
                             </div>
                             <div style={styles.row}>
                                 <span>↕ Yükseklik</span> 
                                 <input type="range" min="0.5" max="1.5" step="0.01" value={sliderUI.h} onChange={(e)=>handleSliderChange('h', e.target.value)} style={styles.range}/>
                             </div>
                             <div style={styles.row}>
                                 <span>↨ Konum</span> 
                                 <input type="range" min="-100" max="100" step="1" value={sliderUI.y} onChange={(e)=>handleSliderChange('y', e.target.value)} style={styles.range}/>
                             </div>
                        </div>
                    )}

                    <Webcam ref={webcamRef} audio={false} mirrored={facingMode==="user"} videoConstraints={videoConstraints} style={styles.abs} />
                    <canvas ref={canvasRef} style={styles.abs} />
                </div>
                
                {/* Alt Kontrol Paneli */}
                <div style={styles.controls}>
                    <button onClick={capturePhoto} style={{...styles.btn, background: '#FFC107'}}>FOTO ÇEK</button>
                    <button onClick={toggleCamera} style={{...styles.btn, background: '#333', color: 'white'}}>ÇEVİR</button>
                </div>
            </div>
        )}

        {/* --- 4. RESULT --- */}
        {appState === "result" && imgSrc && (
            <div style={styles.overlay}>
                <div style={styles.scrollContent}>
                    <img src={imgSrc} style={{width: '100%', maxHeight: '50vh', objectFit: 'contain', border: '1px solid #333'}} alt="Result" />
                    
                    <div style={{width: '100%', background: '#222', padding: 20, borderRadius: 10, marginTop: 20}}>
                        <h3 style={{color: '#FFC107', textAlign: 'center', margin: '0 0 15px 0'}}>SONUÇLAR</h3>
                        
                        <div style={{display: 'flex', justifyContent: 'space-between', color: 'white', marginBottom: '15px'}}>
                            <div style={{textAlign: 'center', background: '#333', padding: '10px', borderRadius: '8px', width: '48%'}}>
                                <small style={{color:'#aaa'}}>SOL GÖZ</small> <br/> 
                                <span style={{fontSize:'1.2rem', fontWeight:'bold'}}>{finalResult.left}</span> <br/> 
                                <small style={{color:'#FFC107'}}>Yük: {finalResult.hLeft}</small>
                            </div>
                            <div style={{textAlign: 'center', background: '#333', padding: '10px', borderRadius: '8px', width: '48%'}}>
                                <small style={{color:'#aaa'}}>SAĞ GÖZ</small> <br/> 
                                <span style={{fontSize:'1.2rem', fontWeight:'bold'}}>{finalResult.right}</span> <br/> 
                                <small style={{color:'#FFC107'}}>Yük: {finalResult.hRight}</small>
                            </div>
                        </div>
                        
                        <div style={{textAlign: 'center'}}>
                            <span style={{color:'#aaa', fontSize:'0.9rem'}}>TOPLAM PD</span><br/>
                            <span style={{color: 'white', fontSize: '2.5rem', fontWeight: 'bold'}}>{finalResult.pd}</span>
                            <span style={{color: '#aaa', marginLeft: '5px'}}>mm</span>
                        </div>
                    </div>
                    
                    <button onClick={resetPhoto} style={{...styles.btn, flex: 'none', width: '100%', marginTop: 20, background: '#333', color: 'white'}}>YENİ ÖLÇÜM</button>
                </div>
            </div>
        )}
    </Fragment>
  );
};

export default WebcamImg;