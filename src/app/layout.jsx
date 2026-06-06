import "./globals.css";

export const metadata = {
  title: "PaperLens — AI Research Copilot",
  description: "Turn dense PDFs into structured explanations, diagrams, flashcards, and paper-grounded chat. Powered by your own Ollama model.",
};

// Runs before paint to set the theme and avoid a flash of the wrong colors.
const themeScript = `
(function(){
  try {
    var stored = localStorage.getItem('theme');
    var sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (sysDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%234f46e5'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='ui-sans-serif' font-size='18' font-weight='700'%3E◧%3C/text%3E%3C/svg%3E" />
      </head>
      <body>{children}</body>
    </html>
  );
}
