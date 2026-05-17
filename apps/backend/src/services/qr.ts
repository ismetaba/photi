import QRCode from "qrcode";

export async function makeQrPng(
  text: string,
  opts: { size?: number } = {},
): Promise<Buffer> {
  const size = opts.size ?? 512;
  return QRCode.toBuffer(text, {
    type: "png",
    margin: 2,
    width: size,
    errorCorrectionLevel: "M",
  });
}
