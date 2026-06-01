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

export function levelById(id) {
  return LEVELS.find((l) => l.id === id) || LEVELS[1];
}

// Builds {system, user, max} for a given analysis tab. `fullText` is the
// extracted paper text supplied by the client.
export function buildPrompt(which, levelId, fullText, fileName = "the paper") {
  const lvl = levelById(levelId);
  switch (which) {
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
    case "diagram":
      return {
        system:
          lvl.sys +
          " You output ONE mermaid diagram inside a ```mermaid fenced block that captures the paper's method or architecture or pipeline. Use 'flowchart TD'. Keep node labels short and quoted. After the diagram, add 3 to 5 sentences explaining the flow. Do not output any other code fences.",
        user: `Produce a Mermaid flowchart of the core method/architecture/pipeline of this paper, then explain it. Paper text follows:\n\n${fullText.slice(0, 11000)}`,
        max: 1200,
      };
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
    default:
      throw new Error(`Unknown analysis type: ${which}`);
  }
}
