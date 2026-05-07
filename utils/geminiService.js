const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini SDK. Wait until API key is available in env.
const initGemini = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined in the environment variables.");
  }
  return new GoogleGenerativeAI(apiKey);
};

// Helper function to extract JSON from markdown formatting
const parseJson = (responseStr) => {
  try {
    // Attempt direct parse
    return JSON.parse(responseStr);
  } catch (e) {
    // Attempt to remove markdown block formatting (e.g., ```json ... ```)
    const match = responseStr.match(/```(?:json)?([\s\S]*?)```/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch (e2) {
        throw new Error("Failed to parse JSON from AI response.");
      }
    }
    throw new Error("Failed to parse JSON from AI response.");
  }
};

/**
 * Execute a prompt with retries and JSON parsing
 * @param {string} modelName - e.g. "gemini-1.5-flash" or "gemini-1.5-pro"
 * @param {string} prompt - The text prompt
 * @param {number} retries - Number of times to retry on failure
 */
const executeWithRetry = async (modelName, prompt, retries = 2) => {
  const genAI = initGemini();
  const model = genAI.getGenerativeModel({ model: modelName });
  
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      return parseJson(text);
    } catch (error) {
      console.warn(`[Gemini API] Attempt ${i + 1} failed: ${error.message}`);
      lastError = error;
    }
  }
  throw lastError;
};

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

  return executeWithRetry("gemini-2.0-flash", prompt);
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

  return executeWithRetry("gemini-2.0-flash", prompt);
};


exports.generateLessonNoteWithAI = async (plan, lang) => {
  const prompt = `
You are an expert teacher. Write a detailed lesson note based on the following lesson plan.
The target language for the output is: ${lang === 'ar' ? 'Arabic' : 'English'}.

Lesson Plan:
${JSON.stringify(plan)}

Respond ONLY with a valid JSON object matching the following structure:
{
  "summary": "A 1-2 sentence summary of the entire note",
  "overview": "A detailed 2-3 paragraph explanation of the topic",
  "definitions": [
    { "term": "Term", "definition": "Definition" }
  ],
  "process": [
    { "step": 1, "instruction": "Instruction detail" }
  ]
}`;

  return executeWithRetry("gemini-2.0-flash", prompt);
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
    // Include this section ONLY IF MCQs were requested
    {
      "id": "sec_a",
      "title": "Section A: Multiple Choice",
      "description": "Answer all questions",
      "questions": [
        {
          "id": "unique_id_string_mcq_1",
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
    // Include this section ONLY IF Theory was requested
    {
      "id": "sec_b",
      "title": "Section B: Theory",
      "description": "Answer the required questions",
      "questions": [
        {
          "id": "unique_id_string_theory_1",
          "text": "Main theory question text",
          "subQuestions": ["Sub question 1", "Sub question 2"],
          "hasWorkspace": true,
          "image": null // or "DIAGRAM_PLACEHOLDER" if a diagram is needed
        }
      ]
    }
  ]
}
`;

  // We use gemini-2.0-flash for assessments as per user request (switched from pro due to rate limits)
  return executeWithRetry("gemini-2.0-flash", prompt);
};
