import "./globals.css";

export const metadata = {
  title: "PaperLens — Research Paper Explainer",
  description: "Upload a paper, pick a level, and get an Ollama-powered explanation.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
