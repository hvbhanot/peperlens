import "./globals.css";

export const metadata = {
  title: "PaperLens — Research Paper Explainer",
  description: "Upload a paper, pick a level, and get an Ollama-powered explanation.",
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
      </head>
      <body>{children}</body>
    </html>
  );
}
