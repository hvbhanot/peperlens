"use client";

import { useEffect, useState } from "react";

// Light/dark toggle. Initial value follows the OS (set by the inline script in
// layout). A manual choice is stored and wins on subsequent visits; while no
// explicit choice exists we keep following the system preference live.
export default function ThemeToggle() {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") || "light");

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = (e) => {
      if (!localStorage.getItem("theme")) {
        const t = e.matches ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", t);
        setTheme(t);
      }
    };
    mq.addEventListener?.("change", onSystem);
    return () => mq.removeEventListener?.("change", onSystem);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    setTheme(next);
  };

  return (
    <button className="theme-toggle" onClick={toggle} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} aria-label="Toggle theme">
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
