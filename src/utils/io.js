// src/utils/io.js
import { v4 as uuidv4 } from 'uuid'

export function handleImportFile(e, onImport){
  const file = e.target.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const arr = JSON.parse(reader.result);
      if(Array.isArray(arr)){
        const cleaned = arr.map((x)=> ({...x, id: x.id || uuidv4()}));
        onImport(cleaned);
      }
    }catch(err){
      alert('JSON 파싱 오류');
    }
  };
  reader.readAsText(file);
}

export function downloadJSON(data, filename){
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function exportDB(db){
  downloadJSON(db, `semihan-football-manager-backup-${new Date().toISOString().slice(0,10)}.json`)
}

export function importDBFile(e, onLoad){
  const file = e.target.files?.[0]
  if(!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try{
      const db = JSON.parse(reader.result)
      onLoad(db)
    }catch(e){ alert('백업 파일을 읽지 못했습니다.') }
  }
  reader.readAsText(file)
}

// 이미지 파일을 DataURL로 읽고 (정사각형) 리사이즈
export function readImageAsDataURL(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const size = Math.max(64, Math.min(maxSize, Math.max(img.width, img.height)))
        const canvas = document.createElement('canvas')
        canvas.width = size; canvas.height = size
        const ctx = canvas.getContext('2d')
        const side = Math.min(img.width, img.height)
        const sx = (img.width - side)/2
        const sy = (img.height - side)/2
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
