import { useEffect } from "react";

export function useExposeIframeText(iframeSelector = "iframe[id^='epubjs-view']") {
  useEffect(() => {
    const iframe = document.querySelector<HTMLIFrameElement>(iframeSelector);
    if (!iframe) return;

    const mirrorId = "migaku-readable-layer";

    // Create mirror layer if it doesn't exist
    let mirror = document.getElementById(mirrorId);
    if (!mirror) {
      mirror = document.createElement("div");
      mirror.id = mirrorId;

      Object.assign(mirror.style, {
        position: "absolute",
        inset: "0",
        padding: "50px",
        pointerEvents: "none",   // important – do NOT block viewer interactions
        color: "transparent",
        userSelect: "text",
        whiteSpace: "pre-wrap",
        zIndex: 1,               // below UI overlays, above background
        fontSize: "16px",
      });

      document.body.appendChild(mirror);
    }

    function syncText() {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;

        // Extract all text from inside the iframe body
        let text = "";
        doc.querySelectorAll("p, h1, h2, h3, h4, span").forEach((el) => {
          text += el.innerText + "\n";
        });

        mirror!.textContent = text;
      } catch (e) {
        console.warn("Unable to access iframe text:", e);
      }
    }

    // Sync initially
    syncText();

    // Sync whenever iframe loads a new chapter
    iframe.addEventListener("load", syncText);

    return () => iframe.removeEventListener("load", syncText);
  }, [iframeSelector]);
}
