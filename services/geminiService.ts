import { GoogleGenAI, Schema, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { Voter, VoterRawData } from "../types";

// Define the response schema for Gemini
const VOTER_SCHEMA: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      sl_no: { type: Type.STRING, description: "Serial number of the voter" },
      epic_no: { type: Type.STRING, description: "EPIC (Voter ID) number, e.g., ABC1234567" },
      name_en: { type: Type.STRING, description: "Name of the voter in English" },
      name_te: { type: Type.STRING, description: "Name of the voter in Telugu" },
      relative_name: { type: Type.STRING, description: "Name of the Relative (Father, Husband, Mother, etc.)" },
      house_no: { type: Type.STRING, description: "House number" },
      age: { type: Type.STRING, description: "Age of the voter" },
      gender: { type: Type.STRING, description: "Gender (Male/Female/Other)" },
      assembly_name: { type: Type.STRING, description: "Assembly Constituency Name (found in page header)" },
      parliament_name: { type: Type.STRING, description: "Parliamentary Constituency Name (found in page header)" },
      polling_station_no: { type: Type.STRING, description: "Polling Station Number/Name (found in page header)" },
      photo_box_2d: {
        type: Type.ARRAY,
        items: { type: Type.NUMBER },
        description: "The bounding box of the voter's photo formatted as [ymin, xmin, ymax, xmax] normalized to 0-1000."
      }
    },
    required: ["name_en", "epic_no"]
  }
};

// List of models to rotate through, prioritizing Gemini 3 Pro
const FALLBACK_MODELS = [
  "gemini-3-pro-preview",     // Primary: High intelligence for complex layouts
  "gemini-2.5-flash",         // Secondary: Fast and reliable
  "gemini-2.0-flash"          // Backup
];

export const extractVotersFromImage = async (
  base64Image: string, 
  pageNumber: number,
  includePhotos: boolean
): Promise<Voter[]> => {
  // Use environment variable for API Key
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("API Key is missing. Please check your environment configuration.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const maxRetries = 6; 
  let attempt = 0;
  // Reduced base delay to keep parallel processing snappy
  let baseDelay = 1500; 

  while (attempt < maxRetries) {
    // Rotate model based on attempt number to bypass quota buckets
    const currentModel = FALLBACK_MODELS[attempt % FALLBACK_MODELS.length];

    try {
      // Prompt designed to handle the "chunk" of voters visible on one page
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Image
                }
              },
              {
                text: `Analyze this Electoral Roll page image. 
                Identify the grid of voter ID cards. Each card typically contains:
                - Name (English & Telugu)
                - Father's/Husband's Name
                - House Number
                - Age & Gender
                - EPIC Number (Top of the card)
                - Serial Number (Section/Part Number)

                Extract ALL voter records visible in the table/grid.
                Ignore general instructions or footers unless they contain Assembly/Polling station info.
                
                For each voter row, extract:
                - Name (English & Telugu)
                - Relative's Name (Father/Husband)
                - House No, Age, Gender, Serial No, and EPIC No.
                - Page Header Info (Assembly, Parliament, Polling Station) - repeat this for every voter.

                ${includePhotos ? 'Identify photo bounding boxes [ymin, xmin, ymax, xmax] (0-1000).' : 'Ignore photo bounding boxes.'}
                
                Return a JSON array of objects following the schema.`
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: VOTER_SCHEMA,
          // Removed temperature to let model decide best determinism for OCR
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ]
        }
      });

      let jsonString = response.text || "[]";
      
      // Robust JSON Extraction: Find outer brackets to strip markdown/conversational text
      const firstBracket = jsonString.indexOf('[');
      const lastBracket = jsonString.lastIndexOf(']');
      
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
          jsonString = jsonString.substring(firstBracket, lastBracket + 1);
      } else {
          // Fallback if structure is messy
          jsonString = jsonString.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      let rawData: VoterRawData[] = [];
      try {
          const parsed = JSON.parse(jsonString);
          if (Array.isArray(parsed)) {
            rawData = parsed;
          } else if (typeof parsed === 'object' && parsed !== null) {
             if (parsed.voters && Array.isArray(parsed.voters)) {
               rawData = parsed.voters;
             } else {
               // Single object return
               rawData = [parsed];
             }
          }
      } catch (e) {
          console.error(`JSON Parse Error on page ${pageNumber} (Model: ${currentModel})`);
          throw new Error("JSON Parse Failed");
      }

      // Map raw data to Voter interface
      const processedVoters: Voter[] = await Promise.all(rawData.map(async (raw) => {
        let photoBase64: string | undefined = undefined;

        if (includePhotos && raw.photo_box_2d && raw.photo_box_2d.length === 4) {
          photoBase64 = await cropImage(base64Image, raw.photo_box_2d);
        }

        return {
          sl_no: raw.sl_no || "",
          epic_no: raw.epic_no || "",
          name_en: raw.name_en || "",
          name_te: raw.name_te || "",
          relative_name: raw.relative_name || "",
          house_no: raw.house_no || "",
          age: raw.age || "",
          gender: raw.gender || "",
          assembly_name: raw.assembly_name || "",
          parliament_name: raw.parliament_name || "",
          polling_station_no: raw.polling_station_no || "",
          photoBase64: photoBase64,
          originalPage: pageNumber,
          isVoted: false,
          votedParty: null
        };
      }));
      
      return processedVoters;

    } catch (error: any) {
      attempt++;
      
      if (attempt >= maxRetries) {
          console.error(`Max retries reached for page ${pageNumber}. Skipping.`);
          return [];
      }
      
      const nextModel = FALLBACK_MODELS[attempt % FALLBACK_MODELS.length];
      
      // Use shorter delays when model switching to keep things fast
      const delay = baseDelay * attempt + (Math.random() * 500); 
      
      console.warn(`Attempt ${attempt} failed on ${currentModel}. Switching to ${nextModel} in ${Math.round(delay)}ms`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return [];
};

// Helper to crop face from the page using bounding box
const cropImage = (base64Source: string, box: number[]): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve("");
        return;
      }

      // Gemini returns 0-1000 normalized coordinates [ymin, xmin, ymax, xmax]
      const [ymin, xmin, ymax, xmax] = box;

      const width = img.width;
      const height = img.height;

      const x = (xmin / 1000) * width;
      const y = (ymin / 1000) * height;
      const w = ((xmax - xmin) / 1000) * width;
      const h = ((ymax - ymin) / 1000) * height;

      // Add a small padding
      const padding = 2;
      
      canvas.width = w + (padding * 2);
      canvas.height = h + (padding * 2);

      // Draw cropped region
      ctx.drawImage(img, x - padding, y - padding, w + (padding * 2), h + (padding * 2), 0, 0, canvas.width, canvas.height);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      resolve(dataUrl);
    };
    img.onerror = () => resolve("");
    img.src = `data:image/jpeg;base64,${base64Source}`; 
  });
};