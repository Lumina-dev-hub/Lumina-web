const axios = require('axios');

// Helper function to extract JSON from markdown formatting
const parseJson = (responseStr) => {
  if (!responseStr || typeof responseStr !== 'string') {
    throw new Error("AI response is empty or not a string.");
  }

  try {
    // Attempt direct parse
    return JSON.parse(responseStr.trim());
  } catch (e) {
    // Attempt to remove markdown block formatting (e.g., ```json ... ```)
    const match = responseStr.match(/```(?:json)?([\s\S]*?)```/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch (e2) {
        // Fall through
      }
    }
    
    // If no markdown blocks, try to find the first '{' and last '}'
    const firstBrace = responseStr.indexOf('{');
    const lastBrace = responseStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        return JSON.parse(responseStr.substring(firstBrace, lastBrace + 1));
      } catch (e3) {
        // Fall through
      }
    }

    console.error("[AI Service] Failed to parse raw response:", responseStr);
    throw new Error("Failed to parse JSON from AI response.");
  }
};

/**
 * Execute a prompt with OpenRouter using axios
 * @param {string} model - OpenRouter model ID
 * @param {string} prompt - The text prompt
 */
const executePrompt = async (model, prompt) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not defined in the environment variables.");
  }

  try {
    const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
      model: model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" }
    }, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://lumina-ai.com",
        "X-OpenRouter-Title": "Lumina AI",
        "Content-Type": "application/json",
      }
    });

    const data = response.data;
    
    if (data.error) {
      throw new Error(`OpenRouter Error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const content = data.choices[0].message.content;
    return parseJson(content);
  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    console.error(`[OpenRouter API] Error:`, errorMsg);
    throw new Error(errorMsg);
  }
};

// Default models
const DEFAULT_MODEL = "openai/gpt-4o-mini"; // Extremely reliable for JSON
const PRO_MODEL = "google/gemini-2.0-pro-exp-02-05:free"; // High quality

exports.generateLessonPlanWithAI = async (params, preferences, lang) => {
  const prompt = `
You are an expert curriculum designer and teacher. Create a structured lesson plan.
The target language for the output is: ${lang === 'ar' ? 'Arabic' : 'English'}.
${lang === 'ar' ? '(Please translate all output values to Arabic, keeping the JSON keys in English as specified below)' : ''}

Context:
- Subject: ${params.subjectName}
- Topic: ${params.topic}
- Week: ${params.weekNumber}
- Student Learning Level: ${preferences.studentLevel}
- Teaching Philosophy: ${params.philosophy || preferences.teachingPhilosophy}
- Plan Style: ${params.planStyle || preferences.planStyle}

Respond ONLY with a valid JSON object matching the following structure:
{
  "topic": "Refined topic name",
  "duration": "e.g., 45 mins",
  "objectives": ["Objective 1", "Objective 2"],
  "introduction": "A brief introduction script or hook",
  "steps": [
    { "number": 1, "title": "Step title", "description": "Step details" }
  ],
  "evaluation": "How to evaluate understanding"${params.includeAssessment !== false ? `,
  "assessment": {
    "type": "e.g., Classwork or Quiz",
    "tasks": ["Task 1", "Task 2"]
  }` : ''}
}`;

  return executePrompt(DEFAULT_MODEL, prompt);
};

exports.regenerateLessonPlanWithAI = async (existingPlan, lang) => {
  const prompt = `
You are an expert curriculum designer. Improve or create a variation of the following lesson plan.
The target language for the output is: ${lang === 'ar' ? 'Arabic' : 'English'}.
Make it better, clearer, or take a slightly different approach.

Existing Plan:
${JSON.stringify(existingPlan)}

Respond ONLY with a valid JSON object matching the exact structure as the input above. DO NOT include the existing database fields like _id, createdAt, teacher, classroom, etc. Just the content fields (topic, duration, objectives, introduction, steps, evaluation, assessment).
`;

  return executePrompt(DEFAULT_MODEL, prompt);
};

exports.generateLessonNoteWithAI = async (plan, lang) => {
  const prompt = `
You are an expert teacher. Write a detailed, student-facing LESSON NOTE based on the following lesson plan.
The target language for the output is: ${lang === 'ar' ? 'Arabic' : 'English'}.

IMPORTANT: This is NOT a guide for the teacher. This is the actual content the teacher will write on the chalkboard for students to copy or read aloud to the class. It should be educational, easy to understand, and structured for students to learn from.

Lesson Plan:
${JSON.stringify(plan)}

Respond ONLY with a valid JSON object matching the following structure:
{
  "summary": "A 1-2 sentence high-level summary of what students will learn",
  "overview": "A detailed 2-3 paragraph explanation of the topic suitable for students to copy into their notebooks",
  "definitions": [
    { "term": "Term Name", "def": "A clear, student-friendly definition", "icon": "book-outline" }
  ],
  "process": [
    { "title": "Step/Concept Title", "desc": "Detailed explanation of the step or sub-topic for students to write down", "image": "DIAGRAM_PLACEHOLDER" }
  ]
}
(Note: Ensure the tone is educational and student-facing)
`;

  return executePrompt(DEFAULT_MODEL, prompt);
};

exports.generateAssessmentWithAI = async (params, preferences, lang) => {
  const isMCQ = params.format === 'mcq' || params.format === 'mixed';
  const isTheory = params.format === 'theory' || params.format === 'mixed';
  
  const mcqCount = isMCQ ? (params.format === 'mcq' ? params.questionCount : Math.floor(params.questionCount / 2)) : 0;
  const theoryCount = isTheory ? (params.format === 'theory' ? Math.ceil(params.questionCount / 5) : 3) : 0;

  const prompt = `
You are an expert examiner. Generate a rigorous assessment paper.
The target language for the output is: ${lang === 'ar' ? 'Arabic' : 'English'}.

Context:
- Subject: ${params.subjectName}
- Title: ${params.title || 'Assessment'}
- Term: ${params.term}
- Type: ${params.type}
- Topics to cover: ${params.topics.join(", ")}
- Assessment Intensity: ${params.intensity || 'Standard'}
- Student Learning Level: ${preferences.studentLevel}

Requirements:
${isMCQ ? `- Create exactly ${mcqCount} Multiple Choice Questions (Section A). Each question MUST have exactly 4 options (A, B, C, D).` : ''}
${isTheory ? `- Create exactly ${theoryCount} Theory Questions (Section B). Each theory question should have 2 or 3 sub-questions.` : ''}

Respond ONLY with a valid JSON object matching this structure:
{
  "title": "Generated or original title",
  "sections": [
    {
      "id": "sec_a",
      "title": "Section A: Multiple Choice",
      "description": "Answer all questions",
      "questions": [
        {
          "id": "unique_id_mcq_1",
          "text": "Question text",
          "options": [
            { "label": "A", "text": "Option A" },
            { "label": "B", "text": "Option B" },
            { "label": "C", "text": "Option C" },
            { "label": "D", "text": "Option D" }
          ],
          "hasWorkspace": false
        }
      ]
    },
    {
      "id": "sec_b",
      "title": "Section B: Theory",
      "description": "Answer the required questions",
      "questions": [
        {
          "id": "unique_id_theory_1",
          "text": "Main theory question text",
          "subQuestions": ["Sub question 1", "Sub question 2"],
          "hasWorkspace": true,
          "image": null
        }
      ]
    }
  ]
}
`;

  return executePrompt(DEFAULT_MODEL, prompt);
};

exports.regenerateAssessmentWithAI = async (existingAssessment, lang) => {
  const prompt = `
You are an expert examiner. Improve, refine, or create a variation of the following assessment paper.
The target language for the output is: ${lang === 'ar' ? 'Arabic' : 'English'}.
Make it better, clearer, or take a slightly different approach while retaining the user's edits if they made any.

Existing Assessment:
${JSON.stringify(existingAssessment)}

Respond ONLY with a valid JSON object containing the "title" and "sections" matching the exact structure as the input above. DO NOT include the existing database fields like _id, createdAt, teacher, classroom, etc.
`;

  return executePrompt(DEFAULT_MODEL, prompt);
};

exports.regenerateLessonNoteWithAI = async (existingNote, lang) => {
  const prompt = `
You are an expert teacher. Improve, refine, or create a variation of the following student-facing lesson note.
The target language for the output is: ${lang === 'ar' ? 'Arabic' : 'English'}.
Make it better, clearer, or take a slightly different approach while retaining the user's edits if they made any.

IMPORTANT: This is NOT a guide for the teacher. This is the actual content the teacher will write on the chalkboard for students to copy or read aloud to the class. It should be educational, easy to understand, and structured for students to learn from.

Existing Note:
${JSON.stringify(existingNote)}

Respond ONLY with a valid JSON object matching the exact structure as the input above (summary, overview, definitions, process). DO NOT include the existing database fields like _id, createdAt, teacher, classroom, etc.
`;

  return executePrompt(DEFAULT_MODEL, prompt);
};
