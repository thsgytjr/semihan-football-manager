// src/utils/avatar.js
export function randomAvatarDataUrl(seed = "", size = 128) {
    const s = String(seed || Math.random());
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  
    const hue = hash % 360;
    const bg = `hsl(${hue},70%,60%)`;
    const fg = "rgba(255,255,255,0.9)";
    const ch = s.trim()[0]?.toUpperCase() || "🙂";
  
    const fontSize = 0.5 * size;
    const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg}"/>
        <stop offset="100%" stop-color="hsl(${(hue + 30) % 360},70%,55%)"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" rx="${size/2}" ry="${size/2}" fill="url(#g)"/>
    <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
          font-family="system-ui, -apple-system, Segoe UI, Roboto, Inter, Helvetica, Arial"
          font-weight="700" font-size="${fontSize}" fill="${fg}">
      ${escapeXml(ch)}
    </text>
  </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
  
  function escapeXml(s) {
    return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");
  }
  