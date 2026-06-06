// Comprehension levels and the prompt templates for each analysis tab.
// Shared between the client (level picker) and the explain request builder.

export const LEVELS = [
  {
    id: "highschool",
    label: "High School",
    blurb: "Plain language, heavy analogies, no assumed math background.",
    sys: "Explain to a curious high-school student. Use everyday analogies. Avoid jargon; when a technical term is unavoidable, define it immediately in one short clause. Do not assume calculus or linear algebra.",
  },
  {
    id: "undergrad",
    label: "Undergraduate",
    blurb: "Assumes calculus, basic linear algebra, intro ML vocabulary.",
    sys: "Explain to a CS/engineering undergraduate. Assume comfort with calculus, basic linear algebra, and introductory ML vocabulary. Show the intuition first, then the precise statement. Define advanced terms briefly.",
  },
  {
    id: "grad",
    label: "Grad / Researcher",
    blurb: "Full rigor, derivations, comparisons to prior work, no hand-holding.",
    sys: "Explain to a graduate researcher in machine learning. Use full mathematical rigor with derivations where relevant. Reference standard prior work where appropriate. Do not oversimplify; assume fluency with optimization, probability, and deep learning architectures.",
  },
];

export const SUMMARIZATION_MODES = [
  { id: "eli5", label: "ELI5", desc: "Explain like I'm 5 — pure analogies, no jargon." },
  { id: "twitter", label: "Tweet thread", desc: "Six punchy tweets summarizing the paper." },
  { id: "abstract", label: "Conference abstract", desc: "200-word formal abstract suitable for submission." },
  { id: "executive", label: "Executive brief", desc: "One paragraph for a non-technical decision maker." },
  { id: "critique", label: "Critique", desc: "Strengths, weaknesses, and methodological concerns." },
];

export const SUMMARY_MODE_SYS = {
  eli5: "Explain like the reader is 5 years old. Use stories, toys, and friendly analogies. Never use technical words without a simple explanation. Maximum 200 words.",
  twitter: "Write a 6-tweet thread explaining this paper. Each tweet must be under 240 characters. Number them 1/ 2/ 3/ 4/ 5/ 6. Make each one standalone and add a tiny hook. Do not use hashtags.",
  abstract: "Write a 200-word formal academic abstract in the style of a top ML conference (NeurIPS / ICML). It should follow the structure: (1) background and gap, (2) proposed method, (3) main results, (4) significance. Use precise language. No bullet points.",
  executive: "Write a single tight paragraph (90–140 words) for a non-technical executive. Cover: what they did, why it matters for a product/business, and the headline result. Avoid jargon; if a technical term is unavoidable, define it inline.",
  critique: "Write a thoughtful peer-review-style critique. Cover: (1) the strongest 2–3 contributions, (2) the most significant weaknesses or unstated assumptions, (3) the methodological concerns, (4) one concrete suggestion for improvement. Be honest and specific, not vague.",
};

export function levelById(id) {
  return LEVELS.find((l) => l.id === id) || LEVELS[1];
}

export function summaryModeById(id) {
  return SUMMARIZATION_MODES.find((m) => m.id === id) || SUMMARIZATION_MODES[0];
}

// Builds {system, user, max} for a given analysis tab. `fullText` is the
// extracted paper text supplied by the client.
export function buildPrompt(which, levelId, fullText, fileName = "the paper", opts = {}) {
  const lvl = levelById(levelId);
  switch (which) {
    case "tldr":
      return {
        system: lvl.sys + " Output 3 to 5 markdown bullet points, each one sentence. No heading, no preamble.",
        user: `Give the key takeaways (TL;DR) of this paper as a few tight bullets: what it does, why it matters, and the headline result. Paper text follows:\n\n${fullText.slice(0, 9000)}`,
        max: 500,
      };
    case "overview":
      return {
        system: lvl.sys + " Output well-structured markdown with ## headings.",
        user: `Give a structured overview of this paper. Cover: the problem and motivation, the core contribution, the method in brief, the key results, and the limitations. Paper text follows:\n\n${fullText.slice(0, 12000)}`,
        max: 1600,
      };
    case "sections":
      return {
        system: lvl.sys + " Output markdown. Use a ## heading per logical section, then 2 to 4 sentences each.",
        user: `Break this paper into its logical sections (e.g. Introduction, Related Work, Method, Experiments, Results, Conclusion) and explain each in turn. Paper text follows:\n\n${fullText.slice(0, 13000)}`,
        max: 1800,
      };
    case "diagram": {
      const req = (opts.request || "").trim();
      const target = req
        ? `Produce a Mermaid diagram of the following, grounded in this paper: "${req}".`
        : "Produce a Mermaid flowchart of the core method/architecture/pipeline of this paper.";
      return {
        system:
          lvl.sys +
          " You output ONE mermaid diagram inside a ```mermaid fenced block. Prefer 'flowchart TD' unless another diagram type clearly fits the request better. Keep node labels short and quoted. After the diagram, add 3 to 5 sentences explaining it. Do not output any other code fences.",
        user: `${target} Then explain it. Paper text follows:\n\n${fullText.slice(0, 11000)}`,
        max: 1300,
      };
    }
    case "glossary":
      return {
        system: lvl.sys + " Output markdown. Format each entry as **Term** then a one or two sentence definition grounded in how the paper uses it.",
        user: `Extract the 10 to 15 most important technical terms, acronyms, and jargon from this paper and define each as used in the paper. Paper text follows:\n\n${fullText.slice(0, 11000)}`,
        max: 1400,
      };
    case "selection":
      return {
        system: lvl.sys + " Keep the answer focused and under 200 words.",
        user: `From the paper "${fileName}", explain this excerpt clearly:\n\n"""${fullText}"""`,
        max: 500,
      };
    case "questions": {
      const difficulty = opts.difficulty || "mixed";
      const count = opts.count || 8;
      return {
        system:
          lvl.sys +
          ` Output exactly ${count} comprehension questions in markdown. Group them by difficulty (Easy / Medium / Hard) using ### headings. For each question, give the question and a 1–2 sentence model answer after it on a new line prefixed with '> Answer:'. Do not include explanations outside the questions.`,
        user: `Generate ${count} ${difficulty}-difficulty comprehension questions that test genuine understanding of this paper — not trivia. For each, give a concise model answer grounded in the paper. Paper text follows:\n\n${fullText.slice(0, 12000)}`,
        max: 2200,
      };
    }
    case "summary_mode": {
      const modeId = opts.mode || "eli5";
      const modeSys = SUMMARY_MODE_SYS[modeId] || SUMMARY_MODE_SYS.eli5;
      return {
        system: modeSys + " Output only the requested text — no preamble, no title, no explanation of what you did.",
        user: `Apply the instructions to the following paper:\n\n${fullText.slice(0, 11000)}`,
        max: modeId === "twitter" ? 700 : modeId === "abstract" ? 500 : 700,
      };
    }
    case "flashcards": {
      const count = opts.count || 12;
      return {
        system:
          lvl.sys +
          ` Generate exactly ${count} spaced-repetition flashcards in markdown. Format each as a level-3 heading with the question, then a line starting with '> ' containing the answer. Do not include any other text.`,
        user: `Create ${count} high-yield flashcards covering the key concepts, definitions, claims, and methods of this paper. Each card should be self-contained. Paper text follows:\n\n${fullText.slice(0, 12000)}`,
        max: 2000,
      };
    }
    case "auto_tag": {
      return {
        system:
          "You are a careful research librarian. Output a single JSON object and nothing else. Schema: {\"tags\": [string, ...], \"field\": string, \"method\": string, \"year\": number|null}. Tags should be 3 to 6 lowercase hyphenated keywords. field is the broad research area. method is the technique family. year is the publication year as an integer or null if not stated.",
        user: `From this paper, extract structured metadata. Output JSON only, no prose, no fences.\n\n${fullText.slice(0, 8000)}`,
        max: 300,
        json: true,
      };
    }
    case "critique": {
      return {
        system:
          lvl.sys +
          " Output a markdown critique with these sections: ## Strengths, ## Weaknesses, ## Reproducibility concerns, ## Suggested experiments. Use concise bullet points. Be specific and cite the paper's claims; do not be vague.",
        user: `Provide a balanced peer-review-style critique of this paper. Be specific and reference concrete claims or sections. Paper text follows:\n\n${fullText.slice(0, 12000)}`,
        max: 1600,
      };
    }
    case "action_items": {
      return {
        system:
          "You extract concrete action items. Output markdown with two sections: ## If you want to read this paper (1 sentence), ## Discussion questions (5 questions). Then a list of ## Key terms to look up with one-line definitions. Be concise.",
        user: `From this paper, produce a 'reading companion' with discussion questions and look-up terms. Paper text follows:\n\n${fullText.slice(0, 10000)}`,
        max: 900,
      };
    }
    default:
      throw new Error(`Unknown analysis type: ${which}`);
  }
}
