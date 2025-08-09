import axios from "axios";
import fs from "fs/promises";
import fetch from "node-fetch";
import OpenAI from "openai";
import sharp from "sharp";
import { encoding_for_model } from "tiktoken";
import { Promt } from "../model/promt.model.js";

const API_KEY = "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";
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3000";

const openai = new OpenAI({
  apiKey: API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:5173",
    "X-Title": "stock-buddy",
  },
});

async function listModels() {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    const data = await response.json();
    console.log("\n✅ Available Models on OpenRouter:\n");
    data.data.forEach((model, i) => console.log(`${i + 1}. ${model.id}`));
  } catch (err) {
    console.error("❌ Failed to fetch models:", err.message);
  }
}

async function verifyImageUrl(url) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "StockBuddy/1.0" },
      redirect: "follow",
    });
    const contentType = response.headers.get("content-type");
    const isAccessible = response.ok && contentType && contentType.startsWith("image/");
    console.log(`verifyImageUrl: ${url} - Status: ${response.status}, Content-Type: ${contentType}, Accessible: ${isAccessible}`);
    return isAccessible;
  } catch (error) {
    console.error(`❌ Image URL verification failed for ${url}:`, error.message);
    return false;
  }
}
const uploadToImgBB = async (buffer, fileName) => {
        const formData = new FormData();
        formData.append("image", buffer.toString("base64"));
        formData.append("key", process.env.IMGBB_API_KEY);
        const response = await axios.post("https://api.imgbb.com/1/upload", formData);
        return response.data.data.url;
      };





export const sendPromt = async (req, res) => {
  await listModels();

  const { content = "" } = req.body;
  const userId = req.userId;

  if (!content.trim()) {
    return res.status(400).json({ errors: "Prompt content is required" });
  }
  if (content.length > 1000) {
    return res.status(400).json({ errors: "Text prompt too long, max 1000 characters" });
  }

  console.log("Controller - Received file:", req.file);

  try {
    await Promt.create({ userId, role: "user", content });
  } catch (error) {
    console.error("❌ Error saving user prompt:", error);
    return res.status(500).json({ error: "Failed to save prompt", detail: error.message });
  }

  let imageUrl = null;
  if (req.file) {
    try {
      if (req.file.size > 15 * 1024 * 1024) {
        await fs.unlink(req.file.path).catch(() => { });
        return res.status(400).json({ errors: "Image too large, max 15 MB" });
      }


      

      const fileName = `uploads/${Date.now()}-${req.file.filename}`;
      const buffer = await sharp(req.file.path)
        .resize({ width: 256 })
        .png({ quality: 50 })
        .toBuffer();
      imageUrl = await uploadToImgBB(buffer, fileName);
      console.log(`Image uploaded to ImgBB: ${fileName}, URL: ${imageUrl}`);
      try {
        await fs.access(`./public/${fileName}`);
        console.log(`File exists: ./public/${fileName}`);
      } catch (error) {
        console.error(`File not found: ./public/${fileName}`, error);
        await fs.unlink(req.file.path).catch(() => { });
        return res.status(500).json({ error: "Image save failed", detail: "Could not verify saved image file." });
      }

      const isImageAccessible = await verifyImageUrl(imageUrl);
      if (!isImageAccessible) {
        // await fs.unlink(`./public/${fileName}`).catch(() => {});
        await fs.unlink(req.file.path).catch(() => { });
        return res.status(400).json({
          error: "Image URL inaccessible",
          detail: `The image URL (${imageUrl}) cannot be accessed by the AI service. Use a publicly hosted image (e.g., via cloud storage or LocalTunnel).`,
          imageUrl,
        });
      }

      await fs.unlink(req.file.path).catch(() => { });
    } catch (error) {
      console.error("❌ Image processing error:", error);
      await fs.unlink(req.file.path).catch(() => { });
      return res.status(500).json({ error: "Image processing failed", detail: error.message });
    }
  }

  const encoder = encoding_for_model("gpt-4");
  const textTokenCount = encoder.encode(content).length;
  const imageTokenEstimate = imageUrl ? Math.ceil(imageUrl.length / 4) : 0;
  const totalTokens = textTokenCount + imageTokenEstimate;
  console.log(`Text tokens: ${textTokenCount}, Image tokens (est.): ${imageTokenEstimate}, Total: ${totalTokens}`);

  if (totalTokens > 1239) {
    return res.status(400).json({
      error: `Prompt too large: ${totalTokens} tokens, limit is 1239`,
    });
  }

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: content },
        ...(imageUrl
          ? [{ type: "image_url", image_url: { url: imageUrl } }]
          : []),
      ],
    },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: "qwen/qwen2.5-vl-32b-instruct:free",
      messages,
      max_tokens: 300,
    });

    const aiContent = completion.choices?.[0]?.message?.content;
    if (!aiContent) throw new Error("AI returned no content");

    await Promt.create({ userId, role: "assistant", content: aiContent });
    return res.status(200).json({ reply: aiContent, imageUrl });
  } catch (error) {
    console.error("❌ sendPromt error:", error);
    if (error.message.includes("Failed to extract 1 image(s)")) {
      return res.status(400).json({
        error: "Image extraction failed",
        detail: "Ensure the image URL is publicly accessible and valid.",
        imageUrl,
      });
    }
    if (error.status === 402 && error.message.includes("Prompt tokens limit exceeded")) {
      return res.status(400).json({
        error: "Prompt too large",
        detail: "Reduce prompt size or upgrade at https://openrouter.ai/settings/credits",
        imageUrl,
      });
    }
    return res.status(500).json({
      error: "AI response failed",
      detail: error.message,
      imageUrl,
    });
  }
};