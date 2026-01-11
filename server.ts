import { serve } from "https://deno.land/std@0.140.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.140.0/http/file_server.ts";

serve((req) => {
  return serveDir(req, {
    fsRoot: "build", // React'in oluşturduğu klasör
    urlRoot: "",
    showDirListing: false,
    enableCors: true,
  });
});

console.log("Listening on http://localhost:8000");