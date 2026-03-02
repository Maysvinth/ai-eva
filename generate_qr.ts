import { GoogleGenAI } from "@google/genai";
import QRCode from 'qrcode';

async function generate() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Generate a random 6-digit number. Only output the number.",
    });
    
    const code = response.text?.trim().match(/\d{6}/)?.[0] || Math.floor(100000 + Math.random() * 900000).toString();
    const link = `https://ais-pre-kszg76n2cy7mrmze4ne6lf-71453289372.asia-east1.run.app/#/tablet?code=${code}`;
    
    QRCode.toDataURL(link, function (err, url) {
      if (err) throw err;
      console.log(`Pairing Code: ${code}`);
      console.log(`Connection URL: ${link}`);
      console.log(`QR Code: ${url}`);
    });
  } catch (e: any) {
    console.log(`Failed to generate code: ${e.message}`);
  }
}

generate();
