import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API Key not found");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const generateChristmasLetter = async (): Promise<string> => {
  const ai = getClient();
  if (!ai) return "Merry Christmas! (API Key missing)";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Write a very short, heartwarming letter from Santa or a magical winter spirit to the player who has just rescued 4 lost animals (a blue cat, a ragdoll cat, a black cat, and a teddy dog) and climbed to the top of the snowy peak. 
      
      Constraints:
      - Max 60 words.
      - Tone: Warm, cozy, magical, pixel-game nostalgic.
      - Mention the joy of reunion.
      - End with "Merry Christmas!".`,
    });
    
    return response.text || "Merry Christmas! Great job rescuing the pets!";
  } catch (error) {
    console.error("Error generating letter:", error);
    return "The stars twinkle brightly above you. The little animals nuzzle against your legs, safe at last. Merry Christmas!";
  }
};