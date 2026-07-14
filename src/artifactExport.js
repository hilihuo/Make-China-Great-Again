const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let k = 0; k < 8; k++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const toBytes = async (value) => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  return new TextEncoder().encode(String(value));
};

const writeUint16 = (target, offset, value) => new DataView(target.buffer).setUint16(offset, value, true);
const writeUint32 = (target, offset, value) => new DataView(target.buffer).setUint32(offset, value >>> 0, true);

export async function createZipBlob(files) {
  const normalized = [];
  for (const file of files) {
    normalized.push({
      name: new TextEncoder().encode(file.name.replace(/\\/g, '/')),
      data: await toBytes(file.data)
    });
  }

  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const file of normalized) {
    const checksum = crc32(file.data);
    const localHeader = new Uint8Array(30 + file.name.length);
    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, 0x0800);
    writeUint16(localHeader, 8, 0);
    writeUint32(localHeader, 14, checksum);
    writeUint32(localHeader, 18, file.data.length);
    writeUint32(localHeader, 22, file.data.length);
    writeUint16(localHeader, 26, file.name.length);
    localHeader.set(file.name, 30);
    localParts.push(localHeader, file.data);

    const centralHeader = new Uint8Array(46 + file.name.length);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 8, 0x0800);
    writeUint16(centralHeader, 10, 0);
    writeUint32(centralHeader, 16, checksum);
    writeUint32(centralHeader, 20, file.data.length);
    writeUint32(centralHeader, 24, file.data.length);
    writeUint16(centralHeader, 28, file.name.length);
    writeUint32(centralHeader, 42, localOffset);
    centralHeader.set(file.name, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + file.data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, normalized.length);
  writeUint16(end, 10, normalized.length);
  writeUint32(end, 12, centralSize);
  writeUint32(end, 16, localOffset);
  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createModelViewerHtml({ title, modelFile }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} · 三维模型</title>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
  <style>
    html,body{width:100%;height:100%;margin:0;background:#111;color:#eee;font-family:system-ui,"Microsoft YaHei",sans-serif}
    model-viewer{width:100%;height:100%;background:radial-gradient(circle at 50% 36%,#40382e,#121212 66%)}
    .title{position:fixed;left:20px;top:16px;z-index:2;padding:9px 12px;background:#111b;border:1px solid #a98948;border-radius:4px}
  </style>
</head>
<body>
  <div class="title">${title} · 左键旋转 / 滚轮缩放 / 右键平移</div>
  <model-viewer src="./${modelFile}" camera-controls touch-action="pan-y" shadow-intensity="1" exposure="1.05" interaction-prompt="none"></model-viewer>
</body>
</html>`;
}

export function createChineseReadme({ title, modelFile, viewerFile }) {
  return `${title} 三维模型包

文件说明：
- ${modelFile}：GLB 二进制三维模型，可导入 Blender、Unity、Unreal、Three.js 和 Windows 3D Viewer。
- ${viewerFile}：独立旋转查看器。首次打开需要联网加载 model-viewer 组件。
- front.png：模型正面预览。
- side.png：模型侧面预览。

查看操作：
- 鼠标左键：旋转
- 鼠标滚轮：缩放
- 鼠标右键：平移

模型依据项目中的多角度参考图、器物文字说明及程序化网格生成。`;
}
