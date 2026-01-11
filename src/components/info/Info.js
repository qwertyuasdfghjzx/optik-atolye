import React from 'react';

const Info = () => {
  return (
    <div style={{ padding: '0 10px', color: '#eee', fontSize: '0.95rem' }}>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, textAlign: 'left' }}>
        
        <li style={{ marginBottom: '12px' }}>
          📏 <b>Mesafe:</b> En iyi sonuç için yüzünüz kameradan yaklaşık <b>40 cm</b> uzakta olmalıdır.
        </li>

        <li style={{ marginBottom: '12px' }}>
          💡 <b>Ortam:</b> Işığın yeterli olduğundan ve kamera lensinin temiz olduğundan emin olun.
        </li>

        <li style={{ marginBottom: '12px' }}>
          🗿 <b>Duruş:</b> Başınızı dik ve sabit tutun, hareket etmeyin.
        </li>

        <li style={{ marginBottom: '12px' }}>
          👀 <b>Odak:</b> Doğrudan kameraya (veya ekrandaki referans noktasına) bakın ve fotoğrafı çekin.
        </li>

        <li style={{ marginBottom: '12px' }}>
          📊 <b>Sonuçlar:</b> 
          <br/>• <b>PD:</b> İki göz bebeği arası mesafe.
          <br/>• <b>Montaj Yük.:</b> Göz bebeğinden burun ucuna olan dikey mesafe.
        </li>

        <li style={{ marginBottom: '5px' }}>
          🔄 <b>Tekrar:</b> Sonuçtan emin olmak için dilediğiniz kadar tekrar çekim yapabilirsiniz.
        </li>

      </ul>
    </div>
  );
};

export default Info;