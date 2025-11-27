import { Voter } from '../types';

// Declare Tesseract on window
declare const Tesseract: any;

/**
 * Regex Patterns - Ported from Python Script
 * These patterns are designed to work on flattened text blobs.
 */
const PATTERNS = {
    // Looks for Name followed by next field keywords
    NAME: /Name[:\s\-\.]+(.+?)(?:Father|Husband|Mother|Guardian|House|Age|Gender|Sex|Elector|Photo|$)/i,
    
    // Looks for Relative Name
    RELATIVE: /(?:Father|Husband|Mother|Guardian)['’\s]*Name[:\s\-\.]+(.+?)(?:House|Age|Gender|Sex|Elector|Photo|$)/i,
    
    // House Number (Captures digits, dashes, slashes, letters)
    HOUSE: /(?:House|No|H\.No|Ho)[\s\-\.:]+([0-9\-\/A-Za-z\s]+?)(?:Age|Gender|Sex|$)/i,
    
    // Age and Gender combo
    AGE_GENDER: /(?:Age|Aqe)[:\s-]*(\d+)[\s\t]*(?:Gender|Sex)[:\s-]*([A-Za-z]+)/i,
    
    // EPIC / Reg No
    EPIC: /([A-Z]{3}[O0-9]{7}|[A-Z]{3,}\d{5,}[A-Z0-9]*)/
};

/**
 * STRATEGY 1: Digital Text Extraction
 * Extracts data directly from PDF text layer using coordinates.
 */
export const extractVotersFromDigitalText = async (
    textItems: any[], 
    pageNum: number
): Promise<Voter[]> => {
    // 1. Group items by Y coordinate (Rows)
    const items = textItems.map(item => ({
        text: decodeURIComponent(item.str),
        x: item.transform[4],
        y: item.transform[5],
        w: item.width,
        h: item.height
    }));

    const voters: Voter[] = [];
    
    // Find Header Info
    const pageHeight = Math.max(...items.map(i => i.y));
    const headerItems = items.filter(i => i.y > pageHeight * 0.9);
    const headerText = headerItems.map(i => i.text).join(' ');

    let assembly = "";
    let pollingStation = "";

    const asmMatch = headerText.match(/Assembly.*?Constituency[:\s-]*([A-Za-z\s]+)/i);
    if (asmMatch) assembly = asmMatch[1].trim();
    
    const psMatch = headerText.match(/Polling.*?Station[:\s-]*([0-9A-Za-z\s\-\.]+)/i);
    if (psMatch) pollingStation = psMatch[1].trim();

    // Find EPICs to act as anchors
    const epicItems = items.filter(i => PATTERNS.EPIC.test(i.text));

    for (const epicItem of epicItems) {
        // Search window: X: -200 to +200, Y: -100 to +80
        const region = {
            xMin: epicItem.x - 200,
            xMax: epicItem.x + 200,
            yMin: epicItem.y - 120, 
            yMax: epicItem.y + 60
        };

        const cardItems = items.filter(i => 
            i.x >= region.xMin && i.x <= region.xMax &&
            i.y >= region.yMin && i.y <= region.yMax
        );

        // Sort by Y (descending) then X
        cardItems.sort((a, b) => {
            if (Math.abs(a.y - b.y) > 5) return b.y - a.y;
            return a.x - b.x;
        });

        // Flatten text for Regex (Mimic Python ' '.join(text.split()))
        const fullCardText = cardItems.map(i => i.text).join(' ').replace(/\s+/g, ' ');
        
        const epicMatch = epicItem.text.match(PATTERNS.EPIC);
        const epic = epicMatch ? epicMatch[0].replace(/O/g, '0') : "";

        // Regex Extraction
        const nameMatch = fullCardText.match(PATTERNS.NAME);
        const relativeMatch = fullCardText.match(PATTERNS.RELATIVE);
        const houseMatch = fullCardText.match(PATTERNS.HOUSE);
        const ageGenderMatch = fullCardText.match(PATTERNS.AGE_GENDER);
        
        // Fallback for Sl No (Start of text usually)
        const slNoMatch = fullCardText.match(/^(\d+)/);

        voters.push({
            sl_no: slNoMatch ? slNoMatch[1] : "",
            epic_no: epic,
            name_en: nameMatch ? nameMatch[1].trim() : "Unknown",
            name_te: "",
            relative_name: relativeMatch ? relativeMatch[1].trim() : "",
            house_no: houseMatch ? houseMatch[1].trim() : "",
            age: ageGenderMatch ? ageGenderMatch[1] : "",
            gender: ageGenderMatch ? ageGenderMatch[2] : "",
            assembly_name: assembly,
            parliament_name: "",
            polling_station_no: pollingStation,
            photoBase64: undefined,
            originalPage: pageNum,
            isVoted: false,
            votedParty: null
        });
    }

    return voters;
};


/**
 * STRATEGY 2: Enhanced OCR Extraction
 * Mimics Python Logic: Binarization -> Tesseract -> Regex on Block
 */

// Image Enhancement: Binarization
const preprocessImage = async (base64Image: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(base64Image); return; }

            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // Thresholding at 128 (Matching Python cv2.threshold)
            const threshold = 128; 
            
            for (let i = 0; i < data.length; i += 4) {
                // Grayscale
                const v = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
                // Binarize
                const bin = v >= threshold ? 255 : 0;
                data[i] = data[i + 1] = data[i + 2] = bin;
            }
            
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        img.onerror = () => resolve(base64Image);
        img.src = `data:image/jpeg;base64,${base64Image}`;
    });
};

export const extractVotersFromImage = async (
  base64Image: string, 
  pageNumber: number,
  includePhotos: boolean
): Promise<Voter[]> => {
  try {
    const enhancedImageBase64 = await preprocessImage(base64Image);
    const finalImage = enhancedImageBase64.split(',')[1]; 

    const worker = await Tesseract.createWorker('eng', 1, {
      logger: (m: any) => {} 
    });
    
    // PSM 6 assumes a single uniform block of text - good for line reading
    await worker.setParameters({
        tessedit_pageseg_mode: '6', 
    });

    const { data } = await worker.recognize(`data:image/jpeg;base64,${finalImage}`);
    await worker.terminate();

    const words = data.words;
    const voters: Voter[] = [];
    
    // Header Info
    const headerLimit = 150;
    const topWords = words.filter((w: any) => w.bbox.y1 < headerLimit);
    const fullPageText = topWords.map((w: any) => w.text).join(' ');
    
    let assembly = "";
    let pollingStation = "";
    const asmMatch = fullPageText.match(/Assembly.*?Constituency[:\s-]*([A-Za-z\s]+)/i);
    if (asmMatch) assembly = asmMatch[1].trim();
    const psMatch = fullPageText.match(/Polling.*?Station[:\s-]*([0-9A-Za-z\s\-\.]+)/i);
    if (psMatch) pollingStation = psMatch[1].trim();

    // Identify Card Blocks using EPIC anchors
    const epics = words.filter((w: any) => PATTERNS.EPIC.test(w.text));

    for (const epicWord of epics) {
      const rawEpic = epicWord.text.match(PATTERNS.EPIC)?.[0] || "";
      const epicNo = rawEpic.replace(/O/g, '0');
      if (!epicNo) continue;

      const bbox = epicWord.bbox;
      // Define Card Region relative to EPIC
      // Assuming EPIC is at the top/top-right of the card
      const cardRegion = {
        x0: bbox.x0 - 250, 
        x1: bbox.x1 + 100,
        y0: bbox.y0 - 20,
        y1: bbox.y1 + 140 
      };

      // Extract words in this region
      const cardWords = words.filter((w: any) => 
        w.bbox.x0 >= cardRegion.x0 && 
        w.bbox.x1 <= cardRegion.x1 &&
        w.bbox.y0 >= cardRegion.y0 && 
        w.bbox.y1 <= cardRegion.y1
      );

      // Sort Top-to-Bottom, Left-to-Right
      cardWords.sort((a: any, b: any) => {
          if (Math.abs(a.bbox.y0 - b.bbox.y0) > 10) return a.bbox.y0 - b.bbox.y0;
          return a.bbox.x0 - b.bbox.x0;
      });

      // Flatten to String (Mimic Python ' '.join)
      const fullCardText = cardWords.map((w: any) => w.text).join(' ');

      // Regex Extraction on Flattened Text
      const nameMatch = fullCardText.match(PATTERNS.NAME);
      const relativeMatch = fullCardText.match(PATTERNS.RELATIVE);
      const houseMatch = fullCardText.match(PATTERNS.HOUSE);
      const ageGenderMatch = fullCardText.match(PATTERNS.AGE_GENDER);
      const slNoMatch = fullCardText.match(/^(\d+)/); // Usually first number in block

      let photoBase64: string | undefined = undefined;
      if (includePhotos) {
          const cardWidth = cardRegion.x1 - cardRegion.x0;
          const pX = cardRegion.x1 - (cardWidth * 0.35);
          photoBase64 = await cropImage(base64Image, [cardRegion.y0 + 30, pX, cardRegion.y1 - 10, cardRegion.x1]);
      }

      voters.push({
        sl_no: slNoMatch ? slNoMatch[1] : "",
        epic_no: epicNo,
        name_en: nameMatch ? nameMatch[1].trim() : "Unknown",
        name_te: "",
        relative_name: relativeMatch ? relativeMatch[1].trim() : "",
        house_no: houseMatch ? houseMatch[1].trim() : "",
        age: ageGenderMatch ? ageGenderMatch[1] : "",
        gender: ageGenderMatch ? ageGenderMatch[2] : "",
        assembly_name: assembly,
        parliament_name: "",
        polling_station_no: pollingStation,
        photoBase64: photoBase64,
        originalPage: pageNumber,
        isVoted: false,
        votedParty: null
      });
    }

    return voters;

  } catch (error) {
    console.error(`OCR Error on page ${pageNumber}`, error);
    return [];
  }
};

const cropImage = (base64Source: string, box: number[]): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(""); return; }

      const [ymin, xmin, ymax, xmax] = box;
      const w = xmax - xmin;
      const h = ymax - ymin;

      if (w <= 0 || h <= 0) { resolve(""); return; }

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, xmin, ymin, w, h, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve("");
    img.src = `data:image/jpeg;base64,${base64Source}`; 
  });
};
