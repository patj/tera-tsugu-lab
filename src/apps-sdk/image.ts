// AI に送る画像を、ブラウザで縮めて JPEG にする（長辺 1568px 以下）。spec.md §7「AI」
// このファイルは、本体と開発キットで共通（npm run kit:build でコピーする）
import { APP_AI_LIMITS } from "./types";

/** 画像を縮めて、JPEG の base64（data URL の頭は除く）にする */
export async function imageToBase64Jpeg(blob: Blob): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, APP_AI_LIMITS.imageMaxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を縮められませんでした");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を縮められませんでした"))), "image/jpeg", 0.85),
  );
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("画像を読み込めませんでした"));
    fr.readAsDataURL(jpeg);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
