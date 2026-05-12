const axios = require("axios");

// Helper function to extract JSON from markdown formatting
const parseJson = (responseStr) => {
  if (!responseStr || typeof responseStr !== "string") {
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
    const firstBrace = responseStr.indexOf("{");
    const lastBrace = responseStr.lastIndexOf("}");
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
    throw new Error(
      "OPENROUTER_API_KEY is not defined in the environment variables.",
    );
  }

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://lumina-ai.com",
          "X-OpenRouter-Title": "Lumina AI",
          "Content-Type": "application/json",
        },
      },
    );

    const data = response.data;

    if (data.error) {
      throw new Error(
        `OpenRouter Error: ${data.error.message || JSON.stringify(data.error)}`,
      );
    }

    const content = data.choices[0].message.content;
    return parseJson(content);
  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    console.error(`[OpenRouter API] Error:`, errorMsg);
    throw new Error(errorMsg);
  }
};

// AI Models Configuration
const MODELS = {
  // DeepSeek / Gemini Flash - Excellent for structured, long-form content generation
  LESSON_PLAN: "deepseek/deepseek-v4-flash",

  // GPT / Claude - Excellent for natural, student-friendly writing and formatting
  LESSON_NOTE: "anthropic/claude-3-haiku",

  // Mid-level model - Strong logical reasoning for generating rigorous, varied questions
  ASSESSMENT: "google/gemma-2-9b-it",

  // Cheap fast model - Perfect for quick refinements and maintaining JSON structure
  REGENERATION: "openai/gpt-4o",
};
exports.generateLessonPlanWithAI = async (params, preferences, lang) => {
  const prompt = `
You are a highly experienced school teacher and curriculum planner with deep knowledge of classroom teaching methodologies and lesson planning.

Generate a professional, curriculum-aligned LESSON PLAN for a teacher.

The output language must be: ${lang === "ar" ? "Arabic" : "English"}.
${lang === "ar" ? "Translate ALL values to Arabic while keeping JSON keys in English." : ""}

IMPORTANT INSTRUCTIONS:
- The lesson plan must feel realistic and classroom-ready.
- Adapt explanations and activities to the student learning level.
- Use simple, practical, teacher-friendly language.
- Ensure the lesson flows naturally from introduction to evaluation.
- Include both teacher activities and student activities.
- Make the lesson interactive and engaging.
- Do NOT return markdown.
- Return ONLY valid JSON.

CLASSROOM CONTEXT:
- Subject: ${params.subjectName}
- Topic: ${params.topic}
- Week: ${params.weekNumber}
- Student Learning Level: ${preferences.studentLevel}
- Teaching Philosophy: ${params.philosophy || preferences.teachingPhilosophy}
- Lesson Plan Style: ${params.planStyle || preferences.planStyle}

JSON STRUCTURE:
{
  "topic": "Refined topic title",
  "duration": "40 Minutes",
  "classActivity": "Short classroom activity or warm-up",
  "behavioralObjectives": [
    "Objective 1",
    "Objective 2",
    "Objective 3"
  ],
  "instructionalMaterials": [
    "Material 1",
    "Material 2"
  ],
  "previousKnowledge": "What students already know before this lesson",
  "introduction": "Teacher introduction or lesson hook",

  "presentation": [
    {
      "step": 1,
      "title": "Step title",
      "teacherActivity": "What the teacher does",
      "studentActivity": "What the students do",
      "content": "Detailed teaching content"
    }
  ],

  "evaluation": [
    "Question 1",
    "Question 2",
    "Question 3"
  ],

  "assignment": "Take-home assignment for students"

  ${
    params.includeAssessment !== false
      ? `,
  "assessment": {
    "type": "Classwork",
    "questions": [
      "Question 1",
      "Question 2"
    ]
  }`
      : ""
  }
}

Ensure all fields are educational, realistic, and detailed enough for actual classroom teaching.
`;

  return executePrompt(MODELS.LESSON_PLAN, prompt);
};

exports.regenerateLessonPlanWithAI = async (existingPlan, lang) => {
  const prompt = `
You are an expert educator and instructional designer.

Your task is to improve and regenerate the following lesson plan while preserving its educational purpose and structure.

The output language must be: ${lang === "ar" ? "Arabic" : "English"}.

IMPORTANT:
- Improve clarity, engagement, and teaching quality.
- Make classroom activities more interactive.
- Improve behavioral objectives where necessary.
- Make explanations more natural and teacher-friendly.
- Keep the same JSON structure.
- Return ONLY valid JSON.
- Do NOT include database fields or markdown.

Existing Lesson Plan:
${JSON.stringify(existingPlan)}

Return the improved version with the exact same structure and keys.
`;

  return executePrompt(MODELS.REGENERATION, prompt);
};

exports.generateLessonNoteWithAI = async (plan, lang) => {
  const prompt = `
You are an experienced classroom teacher writing a professional LESSON NOTE for students.

The output language must be: ${lang === "ar" ? "Arabic" : "English"}.

IMPORTANT:
- This is NOT a lesson plan.
- This is the actual classroom note students will copy into their notebooks.
- Use clear, educational, student-friendly language.
- Explanations should be detailed but simple enough for the class level.
- Include examples where appropriate.
- Structure the content like a real school lesson note.
- Avoid robotic or repetitive wording.
- Return ONLY valid JSON.
- Do NOT use markdown formatting.

LESSON PLAN:
${JSON.stringify(plan)}

JSON STRUCTURE:
{
  "topic": "Topic title",

  "summary": "1-2 sentence summary of the lesson",

  "introduction": "A simple introductory explanation of the topic",

  "mainContent": [
    {
      "heading": "Sub-topic heading",
      "content": "Detailed explanation suitable for students to write in their notebooks",
      "examples": [
        "Example 1",
        "Example 2"
      ]
    }
  ],

  "keyPoints": [
    "Important point 1",
    "Important point 2"
  ],

  "conclusion": "Short concluding explanation",

  "evaluationQuestions": [
    "Question 1",
    "Question 2",
    "Question 3"
  ],

  "assignment": "Student assignment"
}

Ensure the note is realistic, educational, classroom-ready, and properly detailed.
`;

  return executePrompt(MODELS.LESSON_NOTE, prompt);
};

exports.generateAssessmentWithAI = async (params, preferences, lang) => {
  const isMCQ = params.format === "mcq" || params.format === "mixed";
  const isTheory = params.format === "theory" || params.format === "mixed";

  const mcqCount = isMCQ
    ? params.format === "mcq"
      ? params.questionCount
      : Math.floor(params.questionCount / 2)
    : 0;
  const theoryCount = isTheory
    ? params.format === "theory"
      ? Math.ceil(params.questionCount / 5)
      : 3
    : 0;

  const prompt = `
You are an expert examiner. Generate a rigorous assessment paper.
The target language for the output is: ${lang === "ar" ? "Arabic" : "English"}.

Context:
- Subject: ${params.subjectName}
- Title: ${params.title || "Assessment"}
- Term: ${params.term}
- Type: ${params.type}
- Topics to cover: ${params.topics.join(", ")}
- Assessment Intensity: ${params.intensity || "Standard"}
- Student Learning Level: ${preferences.studentLevel}

Requirements:
${isMCQ ? `- Create exactly ${mcqCount} Multiple Choice Questions (Section A). Each question MUST have exactly 4 options (A, B, C, D).` : ""}
${isTheory ? `- Create exactly ${theoryCount} Theory Questions (Section B). Each theory question should have 2 or 3 sub-questions.` : ""}

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

  return executePrompt(MODELS.ASSESSMENT, prompt);
};

exports.regenerateAssessmentWithAI = async (existingAssessment, lang) => {
  const prompt = `
You are an expert examiner. Improve, refine, or create a variation of the following assessment paper.
The target language for the output is: ${lang === "ar" ? "Arabic" : "English"}.
Make it better, clearer, or take a slightly different approach while retaining the user's edits if they made any.

Existing Assessment:
${JSON.stringify(existingAssessment)}

Respond ONLY with a valid JSON object containing the "title" and "sections" matching the exact structure as the input above. DO NOT include the existing database fields like _id, createdAt, teacher, classroom, etc.
`;

  return executePrompt(MODELS.REGENERATION, prompt);
};

exports.regenerateLessonNoteWithAI = async (existingNote, lang) => {
  const prompt = `
You are an expert teacher. Improve, refine, or create a variation of the following student-facing lesson note.
The target language for the output is: ${lang === "ar" ? "Arabic" : "English"}.
Make it better, clearer, or take a slightly different approach while retaining the user's edits if they made any.

IMPORTANT: This is NOT a guide for the teacher. This is the actual content the teacher will write on the chalkboard for students to copy or read aloud to the class. It should be educational, easy to understand, and structured for students to learn from.

Existing Note:
${JSON.stringify(existingNote)}

Respond ONLY with a valid JSON object matching the exact structure as the input above (summary, overview, definitions, process). DO NOT include the existing database fields like _id, createdAt, teacher, classroom, etc.
`;

  return executePrompt(MODELS.REGENERATION, prompt);
};
