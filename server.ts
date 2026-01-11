import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.177.0/http/file_server.ts";

console.log("Sunucu baslatiliyor...");

serve((req) => {
  const url = new URL(req.url);
  console.log("İstek geldi:", url.pathname);

  // Dosyaları "build" klasöründen sun
  return serveDir(req, {
    fsRoot: "build",
    // Eğer dosya bulunamazsa (404), index.html'i dene (SPA desteği)
    showDirListing: true,
  });
});