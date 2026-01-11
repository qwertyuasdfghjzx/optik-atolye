import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, getDocs, addDoc } from "firebase/firestore";

const GlassesSelect = ({ onFrameSelect }) => {
  const [frames, setFrames] = useState([]);
  const [selectedFrame, setSelectedFrame] = useState(null);
  const [selectedMode, setSelectedMode] = useState("db"); 
  const [manualWidth, setManualWidth] = useState(142); 
  
  // --- YENİ EKLENEN KISIM: EKLEME FORMU ---
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFrame, setNewFrame] = useState({
      gozluk_kodu: "",
      gozluk_adi: "",
      gozluk_renk: "",
      Toplam_Genislik: "",
      Kopru: "",
      Lens_Yukseklik: ""
  });

  // Verileri Çekme Fonksiyonu
  const fetchFrames = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "frames"));
      const framesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFrames(framesList);
    } catch (error) {
      console.error("Veri çekilemedi:", error);
    }
  };

  useEffect(() => {
    fetchFrames();
  }, []);

  // --- YENİ GÖZLÜK KAYDETME ---
  const handleSaveToDB = async (e) => {
    e.preventDefault();
    if(!newFrame.gozluk_kodu || !newFrame.Toplam_Genislik) {
        alert("Lütfen en azından Kod ve Genişlik giriniz.");
        return;
    }

    try {
        await addDoc(collection(db, "frames"), {
            gozluk_kodu: newFrame.gozluk_kodu,
            gozluk_adi: newFrame.gozluk_adi,
            gozluk_renk: newFrame.gozluk_renk,
            Toplam_Genislik: Number(newFrame.Toplam_Genislik),
            Kopru: Number(newFrame.Kopru),
            Lens_Yukseklik: Number(newFrame.Lens_Yukseklik)
        });
        alert("✅ Yeni gözlük veritabanına eklendi!");
        setShowAddForm(false);
        setNewFrame({ gozluk_kodu: "", gozluk_adi: "", gozluk_renk: "", Toplam_Genislik: "", Kopru: "", Lens_Yukseklik: "" });
        fetchFrames(); // Listeyi yenile
    } catch (error) {
        console.error("Hata:", error);
        alert("Kaydedilemedi: " + error.message);
    }
  };

  // Listeden Seçim
  const handleSelect = (e) => {
    const selectedId = e.target.value;
    if (selectedId === "0") {
        setSelectedFrame(null);
        onFrameSelect(null);
        return;
    }
    const frame = frames.find(f => f.id === selectedId);
    if (frame) {
        setSelectedFrame(frame);
        onFrameSelect({
            width: Number(frame.Toplam_Genislik),
            bridge: Number(frame.Kopru),
            height: Number(frame.Lens_Yukseklik),
            isManual: false
        }); 
    }
  };

  // Manuel Giriş
  const handleManualChange = (e) => {
    const w = parseFloat(e.target.value);
    setManualWidth(w);
    onFrameSelect({ width: w, bridge: null, height: null, isManual: true });
  };

  return (
    <div style={{ backgroundColor: "rgba(20, 20, 20, 0.95)", padding: "15px", borderRadius: "15px", border: "1px solid #D4AF37", margin: "0 auto", maxWidth: "450px", color: "white", textAlign: "center", boxShadow: "0 8px 20px rgba(0,0,0,0.6)", position: "relative" }}>
      
      {/* BAŞLIK VE ADMIN BUTONU */}
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px"}}>
          <h3 style={{margin: 0, color: "#D4AF37", fontSize: "1rem", textTransform: "uppercase"}}>KALİBRASYON</h3>
          <button onClick={() => setShowAddForm(!showAddForm)} style={{background: "none", border: "1px solid #444", color: "#666", fontSize: "0.7rem", padding: "2px 5px", cursor: "pointer", borderRadius: "4px"}}>
              {showAddForm ? "Kapat" : "+ Yeni Ekle"}
          </button>
      </div>

      {/* --- YENİ EKLEME FORMU (GİZLİ/AÇIK) --- */}
      {showAddForm && (
          <div style={{backgroundColor: "#222", padding: "10px", borderRadius: "8px", marginBottom: "15px", border: "1px solid #555"}}>
              <h4 style={{margin: "0 0 10px 0", fontSize: "0.9rem", color: "#fff"}}>Veritabanına Kayıt</h4>
              <form onSubmit={handleSaveToDB} style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px"}}>
                  <input placeholder="Kod (Örn: RB-3447)" value={newFrame.gozluk_kodu} onChange={e => setNewFrame({...newFrame, gozluk_kodu: e.target.value})} style={inputStyle} />
                  <input placeholder="Ad (Örn: Metal Round)" value={newFrame.gozluk_adi} onChange={e => setNewFrame({...newFrame, gozluk_adi: e.target.value})} style={inputStyle} />
                  <input placeholder="Renk" value={newFrame.gozluk_renk} onChange={e => setNewFrame({...newFrame, gozluk_renk: e.target.value})} style={inputStyle} />
                  <input type="number" placeholder="Gen (mm)*" value={newFrame.Toplam_Genislik} onChange={e => setNewFrame({...newFrame, Toplam_Genislik: e.target.value})} style={{...inputStyle, borderColor: "red"}} required />
                  <input type="number" placeholder="Köprü (mm)" value={newFrame.Kopru} onChange={e => setNewFrame({...newFrame, Kopru: e.target.value})} style={inputStyle} />
                  <input type="number" placeholder="Yükseklik (mm)" value={newFrame.Lens_Yukseklik} onChange={e => setNewFrame({...newFrame, Lens_Yukseklik: e.target.value})} style={inputStyle} />
                  
                  <button type="submit" style={{gridColumn: "span 2", backgroundColor: "#D4AF37", color: "black", border: "none", padding: "8px", fontWeight: "bold", cursor: "pointer", borderRadius: "4px"}}>
                      KAYDET
                  </button>
              </form>
          </div>
      )}

      {/* MOD SEÇİMİ */}
      <div style={{display: "flex", justifyContent: "center", gap: "0", marginBottom: "15px", borderBottom: "1px solid #444"}}>
        <button onClick={() => setSelectedMode("db")} style={{ flex: 1, padding: "8px", backgroundColor: selectedMode === "db" ? "#D4AF37" : "transparent", color: selectedMode === "db" ? "black" : "#888", fontWeight: "bold", border: "none", borderTopLeftRadius: "10px", cursor: "pointer", fontSize: "0.9rem" }}>Kayıtlı Model</button>
        <button onClick={() => setSelectedMode("manual")} style={{ flex: 1, padding: "8px", backgroundColor: selectedMode === "manual" ? "#D4AF37" : "transparent", color: selectedMode === "manual" ? "black" : "#888", fontWeight: "bold", border: "none", borderTopRightRadius: "10px", cursor: "pointer", fontSize: "0.9rem" }}>Manuel</button>
      </div>

      {/* DB MODU */}
      {selectedMode === "db" && (
        <div style={{textAlign: "left"}}>
            <select onChange={handleSelect} style={{ width: "100%", padding: "10px", borderRadius: "8px", backgroundColor: "#333", color: "white", border: "1px solid #555", outline: "none", fontSize: "0.9rem", marginBottom: "10px" }}>
              <option value="0">Seçim Yok (İris Modu)</option>
              {frames.map(frame => (
                <option key={frame.id} value={frame.id}>[{frame.gozluk_kodu}] {frame.gozluk_adi}</option>
              ))}
            </select>
            {selectedFrame && (
                <div style={{ display: "flex", justifyContent: "space-between", backgroundColor: "#2a2a2a", padding: "10px", borderRadius: "8px", borderLeft: "4px solid #D4AF37", fontSize: "0.8rem", color: "#ccc" }}>
                    <span>Gen: <b style={{color:"white"}}>{selectedFrame.Toplam_Genislik}</b></span>
                    <span>Köprü: <b style={{color:"white"}}>{selectedFrame.Kopru || "-"}</b></span>
                    <span>Yük: <b style={{color:"white"}}>{selectedFrame.Lens_Yukseklik || "-"}</b></span>
                </div>
            )}
        </div>
      )}

      {/* MANUEL MOD */}
      {selectedMode === "manual" && (
        <div style={{display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", padding: "10px"}}>
           <input type="number" value={manualWidth} onChange={handleManualChange} style={{ padding: "8px", borderRadius: "5px", backgroundColor: "#222", color: "#D4AF37", border: "1px solid #D4AF37", width: "80px", textAlign: "center", fontWeight: "bold" }} />
           <span style={{fontSize: "0.8rem"}}>mm (Toplam Genişlik)</span>
        </div>
      )}
    </div>
  );
};

const inputStyle = {
    padding: "8px", borderRadius: "4px", border: "1px solid #444", backgroundColor: "#333", color: "white", fontSize: "0.8rem"
};

export default GlassesSelect;